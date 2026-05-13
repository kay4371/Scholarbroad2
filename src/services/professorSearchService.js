const axios = require('axios');
const cheerio = require('cheerio');
//const { getDb } = require('./mongoService');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;
const SEMANTIC_SCHOLAR_BASE = 'https://api.semanticscholar.org/graph/v1';
const REQUEST_DELAY_MS = 2000; // polite delay between requests

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Search Semantic Scholar for professors by keywords + country ──────────────
async function searchProfessors(keywords, targetCountry, limit = 80) {
  const query = keywords.join(' ');
  console.log(`[ProfSearch] Searching: "${query}" | Country: ${targetCountry}`);

  try {
    const res = await axios.get(`${SEMANTIC_SCHOLAR_BASE}/author/search`, {
      params: {
        query,
        limit: Math.min(limit, 100),
        fields: 'authorId,name,affiliations,paperCount,citationCount,hIndex,papers'
      },
      headers: { 'User-Agent': 'ScholarBroad/1.0 (scholarship-matching-platform)' }
    });

    const authors = res.data?.data || [];
    console.log(`[ProfSearch] Found ${authors.length} authors on Semantic Scholar`);
    return authors;
  } catch (err) {
    console.error('[ProfSearch] Semantic Scholar error:', err.message);
    return [];
  }
}

// ── Get recent papers for a professor ────────────────────────────────────────
async function getRecentPapers(authorId, limit = 3) {
  try {
    await sleep(REQUEST_DELAY_MS);
    const res = await axios.get(`${SEMANTIC_SCHOLAR_BASE}/author/${authorId}/papers`, {
      params: {
        limit,
        fields: 'title,abstract,year,venue,externalIds',
        sort: 'year:desc'
      },
      headers: { 'User-Agent': 'ScholarBroad/1.0' }
    });
    return (res.data?.data || []).filter(p => p.year >= new Date().getFullYear() - 3);
  } catch (err) {
    console.error(`[ProfSearch] Papers fetch error for ${authorId}:`, err.message);
    return [];
  }
}

// ── Try to find professor email from university faculty page ──────────────────
async function findProfessorEmail(name, university) {
  const searchQuery = encodeURIComponent(`"${name}" "${university}" email professor`);
  const url = `https://www.google.com/search?q=${searchQuery}`;

  try {
    await sleep(REQUEST_DELAY_MS);
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      timeout: 8000
    });

    const $ = cheerio.load(res.data);
    const text = $('body').text();

    // Extract email patterns from page text
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(edu|ac\.[a-z]{2}|uni-[a-z]+\.de|[a-z]{2,4})/g;
    const emails = text.match(emailRegex) || [];

    // Filter out generic/noreply emails, keep .edu and .ac.xx
    const academic = emails.filter(e =>
      (e.includes('.edu') || e.includes('.ac.') || e.includes('uni-')) &&
      !e.includes('example') && !e.includes('noreply') && !e.includes('no-reply')
    );

    return academic[0] || null;
  } catch {
    return null;
  }
}

// ── Score professor fit (1-10) based on research alignment ───────────────────
function scoreFit(professor, userKeywords) {
  let score = 0;
  const paperText = (professor.recentPapers || [])
    .map(p => `${p.title} ${p.abstract || ''}`)
    .join(' ').toLowerCase();

  // Keyword matches in recent papers
  for (const kw of userKeywords) {
    if (paperText.includes(kw.toLowerCase())) score += 2;
  }

  // Academic standing
  if (professor.hIndex >= 20) score += 2;
  else if (professor.hIndex >= 10) score += 1;

  // Recent activity (has papers in last 2 years)
  const recentCount = (professor.recentPapers || []).filter(
    p => p.year >= new Date().getFullYear() - 2
  ).length;
  if (recentCount >= 2) score += 2;
  else if (recentCount === 1) score += 1;

  // Has email (contactable)
  if (professor.email) score += 1;

  return Math.min(10, score);
}

// ── Extract university name from affiliations ─────────────────────────────────
function extractUniversity(affiliations = []) {
  if (!affiliations.length) return 'Unknown University';
  const aff = affiliations[0];
  return aff.name || aff || 'Unknown University';
}

// ── Main: run full professor discovery for a user ─────────────────────────────
async function discoverProfessors(userId, keywords, targetCountry) {
  const db = getDb();
  const col = db.collection('professor_targets');

  // Clear previous targets for this user (re-run = fresh search)
  await col.deleteMany({ userId, status: 'pending' });

  const rawAuthors = await searchProfessors(keywords, targetCountry, 100);
  console.log(`[ProfSearch] Processing ${rawAuthors.length} authors for user ${userId}`);

  let saved = 0;

  for (const author of rawAuthors.slice(0, 80)) {
    try {
      const university = extractUniversity(author.affiliations);

      // Skip if no affiliation info
      if (university === 'Unknown University') continue;

      // Fetch recent papers
      const recentPapers = await getRecentPapers(author.authorId);

      // Skip professors with no recent work
      if (recentPapers.length === 0) continue;

      // Try to find email
      const email = await findProfessorEmail(author.name, university);

      // Build professor object
      const professor = {
        userId,
        authorId: author.authorId,
        name: author.name,
        university,
        email: email || null,
        hIndex: author.hIndex || 0,
        paperCount: author.paperCount || 0,
        recentPapers: recentPapers.map(p => ({
          title: p.title,
          abstract: p.abstract ? p.abstract.slice(0, 300) : null,
          year: p.year,
          venue: p.venue
        })),
        fitScore: scoreFit({ ...author, recentPapers, email }, keywords),
        status: 'pending',        // pending → email_generated → approved → sent → replied
        emailGenerated: false,
        emailApproved: false,
        emailSentAt: null,
        followUp1SentAt: null,
        followUp2SentAt: null,
        followUp3SentAt: null,
        repliedAt: null,
        createdAt: new Date()
      };

      // Only save if fit score >= 3
      if (professor.fitScore < 3) continue;

      await col.insertOne(professor);
      saved++;

      console.log(`[ProfSearch] ✓ ${author.name} @ ${university} | Score: ${professor.fitScore}/10`);
      await sleep(500);

    } catch (err) {
      console.error(`[ProfSearch] Error processing ${author.name}:`, err.message);
    }
  }

  console.log(`[ProfSearch] Done. Saved ${saved} qualified professors for user ${userId}`);

  // Update user profile with discovery status
  await db.collection('user_profiles').updateOne(
    { userId },
    { $set: { professorDiscoveryStatus: 'done', professorsFound: saved, discoveredAt: new Date() } }
  );

  return { discovered: rawAuthors.length, qualified: saved };
}

// ── Get professors for a user (for dashboard display) ────────────────────────
async function getProfessorsForUser(userId, options = {}) {
  const db = getDb();
  const { status, page = 1, limit = 20 } = options;
  const query = { userId };
  if (status) query.status = status;

  const professors = await db.collection('professor_targets')
    .find(query)
    .sort({ fitScore: -1, createdAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  const total = await db.collection('professor_targets').countDocuments(query);
  return { professors, total, pages: Math.ceil(total / limit) };
}

// ── Get a single professor by ID ──────────────────────────────────────────────
async function getProfessorById(profId) {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  return db.collection('professor_targets').findOne({ _id: new ObjectId(profId) });
}

module.exports = {
  discoverProfessors,
  getProfessorsForUser,
  getProfessorById,
  scoreFit
};
