/**
 * professorSearchService.js
 *
 * Finds professors via PAPER search (more accurate than author search)
 * then resolves their emails via 6-layer pipeline.
 *
 * Rate limiting: exponential backoff on 429, 2s delay between requests.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;

const SS_BASE = 'https://api.semanticscholar.org/graph/v1';
const SS_KEY  = process.env.SEMANTIC_SCHOLAR_API_KEY || '';
const sleep   = ms => new Promise(r => setTimeout(r, ms));

const SS_HEADERS = {
  'User-Agent': 'ScholarBroad/1.0',
  ...(SS_KEY ? { 'x-api-key': SS_KEY } : {})
};

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html'
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.(edu|ac\.[a-z]{2,4}|uni\-[a-z]+\.de|[a-z]{2,6})/g;

// ── Semantic Scholar request with exponential backoff ─────────────────────────
async function ssGet(url, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await sleep(SS_KEY ? 500 : 2000); // Respect rate limits
      const res = await axios.get(url, { params, headers: SS_HEADERS, timeout: 15000 });
      return res.data;
    } catch (err) {
      if (err.response?.status === 429) {
        const wait = Math.pow(2, i + 2) * 1000; // 4s, 8s, 16s
        console.log(`[SS] Rate limited — waiting ${wait/1000}s...`);
        await sleep(wait);
      } else {
        console.error(`[SS] Error:`, err.message);
        return null;
      }
    }
  }
  return null;
}

// ── Search papers by topic → extract unique authors ───────────────────────────
async function searchProfessorsByPaper(keywords, targetCountry, limit = 50) {
  const query = keywords.join(' ');
  console.log(`[ProfSearch] Paper search: "${query}"`);

  const data = await ssGet(`${SS_BASE}/paper/search`, {
    query,
    limit: 100,
    fields: 'authors,title,year,abstract,venue,citationCount'
  });

  if (!data?.data?.length) {
    console.log('[ProfSearch] No papers found');
    return [];
  }

  console.log(`[ProfSearch] Found ${data.data.length} papers`);

  // Extract unique authors from recent papers (last 5 years)
  const currentYear = new Date().getFullYear();
  const authorMap = new Map();

  for (const paper of data.data) {
    if (paper.year && paper.year < currentYear - 5) continue;
    for (const author of (paper.authors || [])) {
      if (!authorMap.has(author.authorId)) {
        authorMap.set(author.authorId, {
          authorId: author.authorId,
          name: author.name,
          papers: []
        });
      }
      authorMap.get(author.authorId).papers.push({
        title: paper.title,
        abstract: paper.abstract?.slice(0, 300) || '',
        year: paper.year,
        venue: paper.venue,
        citationCount: paper.citationCount || 0
      });
    }
  }

  console.log(`[ProfSearch] ${authorMap.size} unique authors extracted`);
  return Array.from(authorMap.values()).slice(0, limit);
}

// ── Get author details (affiliation, hIndex) ──────────────────────────────────
async function getAuthorDetails(authorId) {
  const data = await ssGet(`${SS_BASE}/author/${authorId}`, {
    fields: 'name,affiliations,hIndex,paperCount,externalIds,homepage'
  });
  return data;
}

// ── Email resolution helpers ──────────────────────────────────────────────────
function cleanEmails(text, name = '') {
  const found = text.match(EMAIL_REGEX) || [];
  const namePart = name.split(' ').pop().toLowerCase();
  return found.filter(e => {
    const lower = e.toLowerCase();
    if (!lower.includes('.edu') && !lower.includes('.ac.') &&
        !lower.includes('uni-') && !lower.includes('.gov') &&
        !lower.includes('.org')) return false;
    if (/noreply|no-reply|example|admin|info@|support@|webmaster/.test(lower)) return false;
    return true;
  }).sort((a, b) => {
    return b.toLowerCase().includes(namePart) ? 1 : -1;
  });
}

async function urlIsReachable(url) {
  try {
    const res = await axios.head(url, {
      timeout: 8000, maxRedirects: 5,
      validateStatus: s => s < 400,
      headers: { 'User-Agent': 'ScholarBroad/1.0' }
    });
    return res.status < 400;
  } catch {
    return false;
  }
}

// Layer 1: ORCID API
async function tryORCID(name, orcidId = null) {
  try {
    await sleep(1000);
    let orcid = orcidId;
    if (!orcid) {
      const parts = name.trim().split(' ');
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const res = await axios.get(
        `https://pub.orcid.org/v3.0/search?q=given-names:${encodeURIComponent(firstName)}+AND+family-name:${encodeURIComponent(lastName)}`,
        { headers: { 'Accept': 'application/json' }, timeout: 8000 }
      );
      const results = res.data?.['expanded-result'] || [];
      if (results.length > 0) orcid = results[0]['orcid-id'];
    }
    if (!orcid) return null;
    const recordRes = await axios.get(
      `https://pub.orcid.org/v3.0/${orcid}/email`,
      { headers: { 'Accept': 'application/json' }, timeout: 8000 }
    );
    const emails = recordRes.data?.email || [];
    const publicEmail = emails.find(e => e.visibility === 'public')?.email;
    if (publicEmail) { console.log(`[ProfEmail] ORCID: ${publicEmail}`); return publicEmail; }
    return null;
  } catch { return null; }
}

// Layer 2: Google Scholar scrape
async function tryGoogleScholar(name, university) {
  try {
    await sleep(2000);
    const res = await axios.get(
      `https://scholar.google.com/scholar?q=${encodeURIComponent(name + ' ' + university)}`,
      { headers: SCRAPE_HEADERS, timeout: 10000 }
    );
    const $ = cheerio.load(res.data);
    let profileUrl = null;
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('citations?user=')) {
        profileUrl = href.startsWith('http') ? href : 'https://scholar.google.com' + href;
        return false;
      }
    });
    if (!profileUrl) return null;
    await sleep(1500);
    const profileRes = await axios.get(profileUrl, { headers: SCRAPE_HEADERS, timeout: 10000 });
    const $p = cheerio.load(profileRes.data);
    const emails = cleanEmails($p('body').text(), name);
    if (emails.length > 0) { console.log(`[ProfEmail] Google Scholar: ${emails[0]}`); return emails[0]; }
    let homepage = null;
    $p('a').each((i, el) => {
      const href = $p(el).attr('href') || '';
      if (href.startsWith('http') && !href.includes('google.com')) { homepage = href; return false; }
    });
    return homepage ? { homepage } : null;
  } catch { return null; }
}

// Layer 3: University directory
async function tryUniversityDirectory(name, university, homepage = null) {
  try {
    await sleep(2000);
    if (homepage) {
      try {
        const res = await axios.get(homepage, { headers: SCRAPE_HEADERS, timeout: 10000, maxRedirects: 5 });
        const emails = cleanEmails(cheerio.load(res.data)('body').text(), name);
        if (emails.length > 0) { console.log(`[ProfEmail] Homepage: ${emails[0]}`); return emails[0]; }
      } catch {}
    }
    const res = await axios.get(
      `https://www.google.com/search?q=${encodeURIComponent('"' + name + '" "' + university + '" email')}`,
      { headers: SCRAPE_HEADERS, timeout: 10000 }
    );
    const $s = cheerio.load(res.data);
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
        const pageRes = await axios.get(link, { headers: SCRAPE_HEADERS, timeout: 10000, maxRedirects: 3 });
        const emails = cleanEmails(cheerio.load(pageRes.data)('body').text(), name);
        if (emails.length > 0) { console.log(`[ProfEmail] Uni page: ${emails[0]}`); return emails[0]; }
      } catch {}
    }
    return null;
  } catch { return null; }
}

// Layer 4: General web search
async function tryWebSearch(name, university) {
  try {
    await sleep(2500);
    const queries = [
      `"${name}" "${university}" email`,
      `${name} professor ${university.split(' ')[0]} email contact`
    ];
    for (const q of queries) {
      try {
        const res = await axios.get(
          `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          { headers: SCRAPE_HEADERS, timeout: 10000 }
        );
        const emails = cleanEmails(cheerio.load(res.data)('body').text(), name);
        if (emails.length > 0) { console.log(`[ProfEmail] Web search: ${emails[0]}`); return emails[0]; }
        await sleep(1000);
      } catch {}
    }
    return null;
  } catch { return null; }
}

// Layer 5: Apify LinkedIn
async function tryApifyLinkedIn(name, university) {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) return null;
  try {
    await sleep(3000);
    const runRes = await axios.post(
      `https://api.apify.com/v2/acts/apify~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
      { searchQuery: `${name} ${university} professor`, maxResults: 3 },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const runId = runRes.data?.data?.id;
    if (!runId) return null;
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`, { timeout: 10000 });
      const status = statusRes.data?.data?.status;
      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED' || status === 'ABORTED') return null;
    }
    const resultsRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`, { timeout: 10000 });
    for (const profile of (resultsRes.data || [])) {
      const fullName = `${profile.firstName||''} ${profile.lastName||''}`.toLowerCase();
      if (!fullName.includes(name.split(' ')[0].toLowerCase())) continue;
      const email = profile.email || profile.contactInfo?.email;
      if (email) { console.log(`[ProfEmail] LinkedIn: ${email}`); return email; }
    }
    return null;
  } catch { return null; }
}

// ── Main email resolver ───────────────────────────────────────────────────────
async function findProfessorEmail(name, university, orcidId = null, homepage = null) {
  const l1 = await tryORCID(name, orcidId);
  if (l1) return l1;

  const l2 = await tryGoogleScholar(name, university);
  if (typeof l2 === 'string') return l2;
  if (l2?.homepage) homepage = l2.homepage;

  const l3 = await tryUniversityDirectory(name, university, homepage);
  if (l3) return l3;

  const l4 = await tryWebSearch(name, university);
  if (l4) return l4;

  const l5 = await tryApifyLinkedIn(name, university);
  if (l5) return l5;

  return null;
}

// ── Score professor fit ───────────────────────────────────────────────────────
function scoreFit(professor, userKeywords) {
  let score = 0;
  const paperText = (professor.papers || [])
    .map(p => `${p.title} ${p.abstract || ''}`).join(' ').toLowerCase();

  for (const kw of userKeywords) {
    if (paperText.includes(kw.toLowerCase())) score += 2;
  }
  if ((professor.hIndex || 0) >= 20) score += 2;
  else if ((professor.hIndex || 0) >= 10) score += 1;

  const recentCount = (professor.papers || [])
    .filter(p => p.year >= new Date().getFullYear() - 2).length;
  if (recentCount >= 2) score += 2;
  else if (recentCount === 1) score += 1;
  if (professor.email) score += 1;

  return Math.min(10, score);
}

function extractUniversity(affiliations = []) {
  if (!affiliations?.length) return null;
  return affiliations[0]?.name || null;
}

function matchesCountry(university = '', targetCountry = '') {
  if (!targetCountry || targetCountry === 'Any') return true;
  const uniLower = university.toLowerCase();
  const countryMap = {
    'uk': ['uk', 'united kingdom', 'england', 'scotland', 'wales', '.ac.uk', 'oxford', 'cambridge', 'imperial', 'ucl', 'edinburgh', 'manchester', 'birmingham', 'bristol', 'leeds', 'sheffield', 'nottingham'],
    'usa': ['usa', 'united states', 'america', '.edu', 'mit', 'stanford', 'harvard', 'berkeley', 'columbia', 'yale', 'princeton', 'cornell', 'caltech'],
    'canada': ['canada', 'canadian', 'toronto', 'mcgill', 'ubc', 'waterloo', 'alberta', 'ottawa'],
    'germany': ['germany', 'german', 'deutschland', 'munich', 'berlin', 'heidelberg', 'frankfurt', 'hamburg'],
    'australia': ['australia', 'australian', 'sydney', 'melbourne', 'queensland', 'anu', 'monash'],
    'netherlands': ['netherlands', 'dutch', 'delft', 'amsterdam', 'leiden', 'utrecht'],
    'france': ['france', 'french', 'paris', 'sorbonne', 'ecole'],
    'sweden': ['sweden', 'swedish', 'stockholm', 'karolinska', 'chalmers'],
  };
  const keywords = countryMap[targetCountry.toLowerCase()] || [targetCountry.toLowerCase()];
  return keywords.some(k => uniLower.includes(k));
}

// ── Main: discover professors for a user ─────────────────────────────────────
async function discoverProfessors(userId, keywords, targetCountry) {
  const db = getDb();
  const col = db.collection('professor_targets');

  await col.deleteMany({ userId, status: 'pending' });

  // Search via papers (more accurate than author search)
  const rawAuthors = await searchProfessorsMultiSource(keywords, targetCountry, 50);
  if (!rawAuthors.length) {
    console.log('[ProfSearch] No authors found — Semantic Scholar may be rate limiting');
    await db.collection('user_profiles').updateOne(
      { userId },
      { $set: { professorDiscoveryStatus: 'rate_limited', discoveredAt: new Date() } }
    );
    return { discovered: 0, qualified: 0 };
  }

  console.log(`[ProfSearch] Processing ${rawAuthors.length} authors for user ${userId}`);
  let saved = 0;

  for (const author of rawAuthors) {
    try {
      // Get full author details
      const details = await getAuthorDetails(author.authorId);
      if (!details) continue;

      const university = extractUniversity(details.affiliations);
      if (!university) continue;

      // Country filter
      if (!matchesCountry(university, targetCountry)) continue;

      // Score fit before expensive email lookup
      const fitScore = scoreFit({
        papers: author.papers,
        hIndex: details.hIndex || 0
      }, keywords);

      if (fitScore < 3) continue;

      // Email resolution
      const orcidId = details.externalIds?.ORCID || null;
      const homepage = details.homepage || null;
      const email = await findProfessorEmail(author.name, university, orcidId, homepage);

      const professor = {
        userId,
        authorId: author.authorId,
        name: author.name,
        university,
        email: email || null,
        hIndex: details.hIndex || 0,
        paperCount: details.paperCount || 0,
        recentPapers: author.papers.slice(0, 3),
        fitScore,
        status: 'pending',
        emailGenerated: false,
        emailApproved: false,
        createdAt: new Date()
      };

      await col.insertOne(professor);
      saved++;
      console.log(`[ProfSearch] ✓ ${author.name} @ ${university} | Score: ${fitScore}/10 | Email: ${email ? '✓' : '✗'}`);
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

module.exports = { discoverProfessors, getProfessorsForUser, getProfessorById, scoreFit, findProfessorEmail };

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-SOURCE PROFESSOR DISCOVERY — added as fallback sources
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 2: OpenAlex API (free, no key, 200M+ papers) ──────────────────────
async function searchViaOpenAlex(keywords, targetCountry, limit = 50) {
  try {
    console.log('[OpenAlex] Searching for professors...');
    const query = keywords.join(' ');

    // Search papers
    const res = await axios.get('https://api.openalex.org/works', {
      params: {
        search: query,
        filter: 'publication_year:>' + (new Date().getFullYear() - 4),
        'per-page': 100,
        select: 'title,publication_year,authorships,abstract_inverted_index',
        mailto: 'testmyitproject@gmail.com' // polite pool = better rate limits
      },
      headers: { 'User-Agent': 'ScholarBroad/1.0 (mailto:testmyitproject@gmail.com)' },
      timeout: 15000
    });

    const papers = res.data?.results || [];
    console.log(`[OpenAlex] Found ${papers.length} papers`);

    // Extract unique authors with affiliations
    const authorMap = new Map();

    for (const paper of papers) {
      for (const authorship of (paper.authorships || [])) {
        const author = authorship.author;
        const institution = authorship.institutions?.[0];
        if (!author?.id || !institution?.display_name) continue;

        const authorId = author.id.replace('https://openalex.org/', '');
        if (!authorMap.has(authorId)) {
          authorMap.set(authorId, {
            authorId,
            name: author.display_name,
            university: institution.display_name,
            country: institution.country_code || '',
            orcid: author.orcid?.replace('https://orcid.org/', '') || null,
            papers: [],
            source: 'openalex'
          });
        }
        authorMap.get(authorId).papers.push({
          title: paper.title,
          year: paper.publication_year,
          abstract: ''
        });
      }
    }

    const authors = Array.from(authorMap.values());

    // Filter by country
    const filtered = targetCountry && targetCountry !== 'Any'
      ? authors.filter(a => matchesCountry(a.university, targetCountry) ||
          matchesCountryCode(a.country, targetCountry))
      : authors;

    console.log(`[OpenAlex] ${filtered.length} authors after country filter`);
    return filtered.slice(0, limit);

  } catch (err) {
    console.error('[OpenAlex] Error:', err.message);
    return [];
  }
}

// ── Source 3: CrossRef API (free, finds researchers by topic) ─────────────────
async function searchViaCrossRef(keywords, targetCountry, limit = 30) {
  try {
    console.log('[CrossRef] Searching for professors...');
    const query = keywords.join(' ');

    const res = await axios.get('https://api.crossref.org/works', {
      params: {
        query,
        rows: 100,
        filter: 'from-pub-date:' + (new Date().getFullYear() - 4),
        select: 'title,author,published,container-title',
        mailto: 'testmyitproject@gmail.com'
      },
      headers: { 'User-Agent': 'ScholarBroad/1.0 (mailto:testmyitproject@gmail.com)' },
      timeout: 15000
    });

    const papers = res.data?.message?.items || [];
    console.log(`[CrossRef] Found ${papers.length} papers`);

    const authorMap = new Map();
    for (const paper of papers) {
      for (const author of (paper.author || [])) {
        if (!author.given || !author.family) continue;
        const name = `${author.given} ${author.family}`;
        const affiliation = author.affiliation?.[0]?.name || '';
        if (!affiliation) continue;

        const key = name.toLowerCase();
        if (!authorMap.has(key)) {
          authorMap.set(key, {
            authorId: `crossref_${key.replace(/\s+/g, '_')}`,
            name,
            university: affiliation,
            orcid: author.ORCID?.replace('http://orcid.org/', '').replace('https://orcid.org/', '') || null,
            papers: [],
            source: 'crossref'
          });
        }
        authorMap.get(key).papers.push({
          title: paper.title?.[0] || '',
          year: paper.published?.['date-parts']?.[0]?.[0] || null,
          abstract: ''
        });
      }
    }

    const authors = Array.from(authorMap.values());
    const filtered = targetCountry && targetCountry !== 'Any'
      ? authors.filter(a => matchesCountry(a.university, targetCountry))
      : authors;

    console.log(`[CrossRef] ${filtered.length} authors after country filter`);
    return filtered.slice(0, limit);

  } catch (err) {
    console.error('[CrossRef] Error:', err.message);
    return [];
  }
}

// ── Country code matcher (for OpenAlex) ───────────────────────────────────────
function matchesCountryCode(code = '', targetCountry = '') {
  const codeMap = {
    'uk': ['GB'], 'usa': ['US'], 'canada': ['CA'],
    'germany': ['DE'], 'australia': ['AU'], 'france': ['FR'],
    'netherlands': ['NL'], 'sweden': ['SE'], 'norway': ['NO'],
    'denmark': ['DK'], 'finland': ['FI'], 'switzerland': ['CH'],
    'italy': ['IT'], 'spain': ['ES'], 'japan': ['JP'],
    'china': ['CN'], 'singapore': ['SG'], 'ireland': ['IE'],
    'new zealand': ['NZ'], 'belgium': ['BE'], 'austria': ['AT']
  };
  const codes = codeMap[targetCountry.toLowerCase()] || [];
  return codes.includes(code.toUpperCase());
}

// ── Multi-source professor search with fallback ───────────────────────────────
async function searchProfessorsMultiSource(keywords, targetCountry, limit = 50) {
  // Try Semantic Scholar first
  console.log('[MultiSource] Trying Semantic Scholar...');
  const ss = await searchProfessorsByPaper(keywords, targetCountry, limit);
  if (ss.length > 0) {
    console.log(`[MultiSource] Semantic Scholar: ${ss.length} authors`);
    return ss;
  }

  console.log('[MultiSource] Semantic Scholar returned 0 — trying OpenAlex...');
  await sleep(2000);
  const oa = await searchViaOpenAlex(keywords, targetCountry, limit);
  if (oa.length > 0) {
    console.log(`[MultiSource] OpenAlex: ${oa.length} authors`);
    return oa;
  }

  console.log('[MultiSource] OpenAlex returned 0 — trying CrossRef...');
  await sleep(2000);
  const cr = await searchViaCrossRef(keywords, targetCountry, limit);
  if (cr.length > 0) {
    console.log(`[MultiSource] CrossRef: ${cr.length} authors`);
    return cr;
  }

  // All sources failed — combine what we have from all 3
  console.log('[MultiSource] All sources limited — combining partial results');
  const combined = new Map();
  for (const a of [...ss, ...oa, ...cr]) {
    if (!combined.has(a.name)) combined.set(a.name, a);
  }
  return Array.from(combined.values()).slice(0, limit);
}
