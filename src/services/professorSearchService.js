/**
 * professorSearchService.js
 *
 * Professor email resolution — 6-layer fallback:
 * Layer 1: Semantic Scholar author profile (homepage extraction)
 * Layer 2: ORCID API (free academic registry)
 * Layer 3: Google Scholar profile scrape
 * Layer 4: University faculty directory scrape
 * Layer 5: General web search (3 query patterns)
 * Layer 6: Apify LinkedIn scraper (paid, last resort)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;

const SEMANTIC_SCHOLAR_BASE = 'https://api.semanticscholar.org/graph/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5'
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.(edu|ac\.[a-z]{2,4}|uni\-[a-z]+\.de|[a-z]{2,6})/g;

function cleanEmails(text, name = '') {
  const found = text.match(EMAIL_REGEX) || [];
  const namePart = name.split(' ').pop().toLowerCase();
  return found.filter(e => {
    const lower = e.toLowerCase();
    if (!lower.includes('.edu') && !lower.includes('.ac.') &&
        !lower.includes('uni-') && !lower.includes('.gov') &&
        !lower.includes('.org')) return false;
    if (/noreply|no-reply|example|admin|info@|support@|webmaster|donotreply/.test(lower)) return false;
    return true;
  }).sort((a, b) => {
    const aScore = a.toLowerCase().includes(namePart) ? 1 : 0;
    const bScore = b.toLowerCase().includes(namePart) ? 1 : 0;
    return bScore - aScore;
  });
}

// ── Layer 1: Semantic Scholar ─────────────────────────────────────────────────
async function trySemanticScholar(authorId) {
  try {
    const res = await axios.get(`${SEMANTIC_SCHOLAR_BASE}/author/${authorId}`, {
      params: { fields: 'homepage,externalIds' },
      headers: { 'User-Agent': 'ScholarBroad/1.0' },
      timeout: 8000
    });
    const data = res.data;
    // Check externalIds for ORCID — pass to layer 2
    const orcid = data.externalIds?.ORCID || null;
    const homepage = data.homepage || null;
    return { orcid, homepage };
  } catch { return null; }
}

// ── Layer 2: ORCID API ────────────────────────────────────────────────────────
async function tryORCID(name, orcidId = null) {
  try {
    await sleep(1000);
    let orcid = orcidId;

    // If no ORCID from Semantic Scholar, search by name
    if (!orcid) {
      const parts = name.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const searchUrl = `https://pub.orcid.org/v3.0/search?q=given-names:${encodeURIComponent(firstName)}+AND+family-name:${encodeURIComponent(lastName)}`;
      const searchRes = await axios.get(searchUrl, {
        headers: { 'Accept': 'application/json' },
        timeout: 8000
      });
      const results = searchRes.data?.['expanded-result'] || [];
      if (results.length > 0) {
        orcid = results[0]['orcid-id'];
      }
    }

    if (!orcid) return null;

    // Fetch ORCID record for email
    const recordRes = await axios.get(`https://pub.orcid.org/v3.0/${orcid}/email`, {
      headers: { 'Accept': 'application/json' },
      timeout: 8000
    });
    const emails = recordRes.data?.email || [];
    const publicEmail = emails.find(e => e.visibility === 'public')?.email;
    if (publicEmail) {
      console.log(`[ProfEmail] L2 ORCID found: ${publicEmail} for ${name}`);
      return publicEmail;
    }
    return null;
  } catch (err) {
    console.log(`[ProfEmail] L2 ORCID failed for ${name}: ${err.message}`);
    return null;
  }
}

// ── Layer 3: Google Scholar ───────────────────────────────────────────────────
async function tryGoogleScholar(name, university) {
  try {
    await sleep(2000);
    const searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(name + ' ' + university)}`;
    const res = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(res.data);

    let profileUrl = null;
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('scholar.google.com/citations?user=') ||
          href.includes('/citations?user=')) {
        profileUrl = href.startsWith('http') ? href : 'https://scholar.google.com' + href;
        return false;
      }
    });

    if (!profileUrl) return null;

    await sleep(1500);
    const profileRes = await axios.get(profileUrl, { headers: HEADERS, timeout: 10000 });
    const $p = cheerio.load(profileRes.data);
    const text = $p('body').text();
    const emails = cleanEmails(text, name);
    if (emails.length > 0) {
      console.log(`[ProfEmail] L3 Google Scholar: ${emails[0]} for ${name}`);
      return emails[0];
    }

    // Return homepage if found (pass to layer 4)
    let homepage = null;
    $p('a').each((i, el) => {
      const href = $p(el).attr('href') || '';
      if (href.startsWith('http') && !href.includes('google.com')) {
        homepage = href;
        return false;
      }
    });
    return homepage ? { homepage } : null;
  } catch (err) {
    console.log(`[ProfEmail] L3 Google Scholar failed for ${name}: ${err.message}`);
    return null;
  }
}

// ── Layer 4: University faculty directory ─────────────────────────────────────
async function tryUniversityDirectory(name, university, homepage = null) {
  try {
    await sleep(2000);

    // Try homepage first
    if (homepage && homepage.startsWith('http')) {
      try {
        const res = await axios.get(homepage, { headers: HEADERS, timeout: 10000, maxRedirects: 5 });
        const $ = cheerio.load(res.data);
        const emails = cleanEmails($('body').text(), name);
        if (emails.length > 0) {
          console.log(`[ProfEmail] L4 Homepage: ${emails[0]} for ${name}`);
          return emails[0];
        }
      } catch {}
    }

    // Search Google for university faculty page
    const query = encodeURIComponent(`"${name}" faculty ${university} email`);
    const searchRes = await axios.get(
      `https://www.google.com/search?q=${query}`,
      { headers: HEADERS, timeout: 10000 }
    );
    const $s = cheerio.load(searchRes.data);
    const uniLinks = [];

    $s('a[href]').each((i, el) => {
      const href = $s(el).attr('href') || '';
      if (href.includes('/url?q=')) {
        const match = href.match(/\/url\?q=([^&]+)/);
        if (match) {
          const url = decodeURIComponent(match[1]);
          if (url.includes('.edu') || url.includes('.ac.')) uniLinks.push(url);
        }
      }
    });

    for (const link of uniLinks.slice(0, 2)) {
      try {
        await sleep(1500);
        const pageRes = await axios.get(link, { headers: HEADERS, timeout: 10000, maxRedirects: 3 });
        const emails = cleanEmails(cheerio.load(pageRes.data)('body').text(), name);
        if (emails.length > 0) {
          console.log(`[ProfEmail] L4 University page: ${emails[0]} for ${name}`);
          return emails[0];
        }
      } catch {}
    }
    return null;
  } catch (err) {
    console.log(`[ProfEmail] L4 University dir failed for ${name}: ${err.message}`);
    return null;
  }
}

// ── Layer 5: General web search ───────────────────────────────────────────────
async function tryGeneralWebSearch(name, university) {
  try {
    await sleep(2500);
    const queries = [
      `"${name}" "${university}" email`,
      `"${name}" professor email ${university.split(' ')[0]}`,
      `${name} ${university} contact`
    ];

    for (const q of queries) {
      try {
        const res = await axios.get(
          `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          { headers: HEADERS, timeout: 10000 }
        );
        const emails = cleanEmails(cheerio.load(res.data)('body').text(), name);
        if (emails.length > 0) {
          console.log(`[ProfEmail] L5 Web search: ${emails[0]} for ${name}`);
          return emails[0];
        }
        await sleep(1000);
      } catch {}
    }
    return null;
  } catch (err) {
    console.log(`[ProfEmail] L5 Web search failed for ${name}: ${err.message}`);
    return null;
  }
}

// ── Layer 6: Apify LinkedIn scraper (last resort, paid) ──────────────────────
async function tryApifyLinkedIn(name, university) {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    console.log(`[ProfEmail] L6 Apify skipped — APIFY_TOKEN not set`);
    return null;
  }

  try {
    await sleep(3000);
    console.log(`[ProfEmail] L6 Trying Apify LinkedIn for ${name}`);

    // Start Apify actor run
    const runRes = await axios.post(
      `https://api.apify.com/v2/acts/apify~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
      {
        startUrls: [],
        searchQuery: `${name} ${university} professor`,
        maxResults: 3
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const runId = runRes.data?.data?.id;
    if (!runId) return null;

    // Wait for run to complete (poll up to 60 seconds)
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const statusRes = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
        { timeout: 10000 }
      );
      const status = statusRes.data?.data?.status;
      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED' || status === 'ABORTED') return null;
    }

    // Get results
    const resultsRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`,
      { timeout: 10000 }
    );

    const profiles = resultsRes.data || [];
    for (const profile of profiles) {
      // Check if name matches
      const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.toLowerCase();
      if (!fullName.includes(name.split(' ')[0].toLowerCase())) continue;

      // Extract email from contact info
      const email = profile.email || profile.contactInfo?.email;
      if (email && cleanEmails(email, name).length > 0) {
        console.log(`[ProfEmail] L6 Apify LinkedIn: ${email} for ${name}`);
        return email;
      }
    }
    return null;
  } catch (err) {
    console.log(`[ProfEmail] L6 Apify failed for ${name}: ${err.message}`);
    return null;
  }
}

// ── Main: 6-layer email resolution ───────────────────────────────────────────
async function findProfessorEmail(name, university, authorId = null) {
  console.log(`[ProfEmail] Resolving: ${name} @ ${university}`);

  // Layer 1: Semantic Scholar — get homepage + ORCID
  let homepage = null;
  let orcidId = null;
  if (authorId) {
    const ssResult = await trySemanticScholar(authorId);
    if (ssResult) {
      homepage = ssResult.homepage;
      orcidId = ssResult.orcid;
    }
  }

  // Layer 2: ORCID (with ID from Semantic Scholar or search by name)
  const l2 = await tryORCID(name, orcidId);
  if (typeof l2 === 'string') return l2;

  // Layer 3: Google Scholar
  const l3 = await tryGoogleScholar(name, university);
  if (typeof l3 === 'string') return l3;
  if (l3?.homepage) homepage = l3.homepage;

  // Layer 4: University faculty directory
  const l4 = await tryUniversityDirectory(name, university, homepage);
  if (l4) return l4;

  // Layer 5: General web search
  const l5 = await tryGeneralWebSearch(name, university);
  if (l5) return l5;

  // Layer 6: Apify LinkedIn (last resort)
  const l6 = await tryApifyLinkedIn(name, university);
  if (l6) return l6;

  console.log(`[ProfEmail] All 6 layers failed for ${name}`);
  return null;
}

// ── Search Semantic Scholar ───────────────────────────────────────────────────
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
      headers: { 'User-Agent': 'ScholarBroad/1.0' }
    });
    const authors = res.data?.data || [];
    console.log(`[ProfSearch] Found ${authors.length} authors`);
    return authors;
  } catch (err) {
    console.error('[ProfSearch] Error:', err.message);
    return [];
  }
}

// ── Get recent papers ─────────────────────────────────────────────────────────
async function getRecentPapers(authorId, limit = 3) {
  try {
    await sleep(2000);
    const res = await axios.get(`${SEMANTIC_SCHOLAR_BASE}/author/${authorId}/papers`, {
      params: { limit, fields: 'title,abstract,year,venue,externalIds', sort: 'year:desc' },
      headers: { 'User-Agent': 'ScholarBroad/1.0' }
    });
    return (res.data?.data || []).filter(p => p.year >= new Date().getFullYear() - 3);
  } catch { return []; }
}

// ── Score professor fit ───────────────────────────────────────────────────────
function scoreFit(professor, userKeywords) {
  let score = 0;
  const paperText = (professor.recentPapers || [])
    .map(p => `${p.title} ${p.abstract || ''}`).join(' ').toLowerCase();

  for (const kw of userKeywords) {
    if (paperText.includes(kw.toLowerCase())) score += 2;
  }
  if (professor.hIndex >= 20) score += 2;
  else if (professor.hIndex >= 10) score += 1;

  const recentCount = (professor.recentPapers || [])
    .filter(p => p.year >= new Date().getFullYear() - 2).length;
  if (recentCount >= 2) score += 2;
  else if (recentCount === 1) score += 1;

  if (professor.email) score += 1;
  return Math.min(10, score);
}

function extractUniversity(affiliations = []) {
  if (!affiliations.length) return 'Unknown University';
  const aff = affiliations[0];
  return aff.name || aff || 'Unknown University';
}

// ── Main: discover professors ─────────────────────────────────────────────────
async function discoverProfessors(userId, keywords, targetCountry) {
  const db = getDb();
  const col = db.collection('professor_targets');

  await col.deleteMany({ userId, status: 'pending' });

  const rawAuthors = await searchProfessors(keywords, targetCountry, 100);
  console.log(`[ProfSearch] Processing ${rawAuthors.length} authors for ${userId}`);

  let saved = 0;

  for (const author of rawAuthors.slice(0, 80)) {
    try {
      const university = extractUniversity(author.affiliations);
      if (university === 'Unknown University') continue;

      // Filter by target country if specified
      if (targetCountry) {
        const uniLower = university.toLowerCase();
        const countryLower = targetCountry.toLowerCase();
        const countryKeywords = {
          'uk': ['uk', 'united kingdom', 'england', 'scotland', 'wales', '.ac.uk'],
          'usa': ['usa', 'united states', 'america', '.edu'],
          'canada': ['canada', 'canadian'],
          'germany': ['germany', 'german', 'deutschland'],
          'australia': ['australia', 'australian'],
          'france': ['france', 'french'],
          'netherlands': ['netherlands', 'dutch', 'holland'],
          'sweden': ['sweden', 'swedish'],
          'norway': ['norway', 'norwegian'],
        };
        const keywords_for_country = countryKeywords[countryLower] || [countryLower];
        const matchesCountry = keywords_for_country.some(k => uniLower.includes(k));
        if (!matchesCountry && targetCountry !== 'Any' && targetCountry !== '') {
          continue; // Skip professors not in target country
        }
      }

      const recentPapers = await getRecentPapers(author.authorId);
      if (recentPapers.length === 0) continue;

      // 6-layer email resolution
      const email = await findProfessorEmail(author.name, university, author.authorId);

      const professor = {
        userId,
        authorId: author.authorId,
        name: author.name,
        university,
        email: email || null,
        emailResolutionAttempted: true,
        hIndex: author.hIndex || 0,
        paperCount: author.paperCount || 0,
        recentPapers: recentPapers.map(p => ({
          title: p.title,
          abstract: p.abstract ? p.abstract.slice(0, 300) : null,
          year: p.year,
          venue: p.venue
        })),
        fitScore: scoreFit({ ...author, recentPapers, email }, keywords),
        status: 'pending',
        emailGenerated: false,
        emailApproved: false,
        autoMode: false,
        emailSentAt: null,
        followUp1SentAt: null,
        followUp2SentAt: null,
        followUp3SentAt: null,
        repliedAt: null,
        createdAt: new Date()
      };

      if (professor.fitScore < 3) continue;

      await col.insertOne(professor);
      saved++;
      console.log(`[ProfSearch] ✓ ${author.name} @ ${university} | Score: ${professor.fitScore}/10 | Email: ${email ? '✓' : '✗'}`);
      await sleep(500);

    } catch (err) {
      console.error(`[ProfSearch] Error for ${author.name}:`, err.message);
    }
  }

  console.log(`[ProfSearch] Done. ${saved} professors saved for ${userId}`);

  await db.collection('user_profiles').updateOne(
    { userId },
    { $set: { professorDiscoveryStatus: 'done', professorsFound: saved, discoveredAt: new Date() } }
  );

  return { discovered: rawAuthors.length, qualified: saved };
}

async function getProfessorsForUser(userId, options = {}) {
  const db = getDb();
  const { status, page = 1, limit = 20 } = options;
  const query = { userId };
  if (status) query.status = status;
  const professors = await db.collection('professor_targets')
    .find(query).sort({ fitScore: -1, createdAt: 1 })
    .skip((page - 1) * limit).limit(parseInt(limit)).toArray();
  const total = await db.collection('professor_targets').countDocuments(query);
  return { professors, total, pages: Math.ceil(total / limit) };
}

async function getProfessorById(profId) {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  return db.collection('professor_targets').findOne({ _id: new ObjectId(profId) });
}

module.exports = {
  discoverProfessors,
  getProfessorsForUser,
  getProfessorById,
  scoreFit,
  findProfessorEmail
};
