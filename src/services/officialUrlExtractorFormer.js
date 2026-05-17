const axios = require('axios');
const cheerio = require('cheerio');

const AGGREGATOR_DOMAINS = [
  'scholarshipregion.com','opportunitydesk.org','scholars4dev.com',
  'afterschoolafrica.com','myscholly.com','scholarships.com'
];

const CTA_KEYWORDS = [
  'apply now','apply here','official link','start application',
  'application portal','online application','official website',
  'apply','scholarship portal','visit website','apply online'
];

const HIGH_VALUE_PATHS = [
  '/apply','/application','/apply-now','/portal','/scholarship',
  '/funding','/admissions','/fellowship','/register','/studentship'
];

function isAggregator(url = '') {
  if (!url) return true;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return AGGREGATOR_DOMAINS.some(d => hostname.includes(d));
  } catch { return true; }
}

function scoreUrl(url = '') {
  let score = 0;
  const lower = url.toLowerCase();
  if (HIGH_VALUE_PATHS.some(p => lower.includes(p))) score += 40;
  if (lower.includes('.edu')) score += 30;
  if (lower.includes('.ac.')) score += 30;
  if (lower.includes('.gov')) score += 25;
  if (lower.includes('.org')) score += 10;
  if (lower.includes('scholarship')) score += 20;
  if (lower.includes('apply')) score += 25;
  if (lower.includes('admissions')) score += 15;
  if (lower.includes('portal')) score += 20;
  try {
    const pathname = new URL(url).pathname;
    if (pathname === '/' || pathname === '') score -= 20;
  } catch {}
  return score;
}

function resolveUrl(href, baseUrl) {
  try {
    if (href.startsWith('http')) return href;
    return new URL(href, baseUrl).href;
  } catch { return null; }
}

async function extractOfficialUrl(sourceUrl) {
  if (!sourceUrl) return { success: false };
  if (!isAggregator(sourceUrl)) {
    return { success: true, best_url: sourceUrl, confidence_score: 90 };
  }

  console.log(`[URLExtractor] Extracting from: ${sourceUrl}`);

  try {
    const res = await axios.get(sourceUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
        }
    });

    const $ = cheerio.load(res.data);
    const candidates = [];

    // Layer 1 — CTA buttons and links
    $('a').each((_, el) => {
      const text = ($(el).text() || '').toLowerCase().trim();
      const href = $(el).attr('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
      const resolved = resolveUrl(href, sourceUrl);
      if (!resolved || isAggregator(resolved)) return;
      const isCTA = CTA_KEYWORDS.some(kw => text.includes(kw));
      const score = scoreUrl(resolved) + (isCTA ? 30 : 0);
      if (score > 0) candidates.push({ url: resolved, score });
    });

    if (!candidates.length) return { success: false };

    // Sort and deduplicate
    const seen = new Set();
    const unique = candidates
      .sort((a, b) => b.score - a.score)
      .filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; });

    const best = unique[0];
    console.log(`[URLExtractor] ✓ Found: ${best.url} (score: ${best.score})`);

    return {
      success: true,
      best_url: best.url,
      fallback_url: unique[1]?.url || null,
      confidence_score: Math.min(best.score, 100)
    };

  } catch (err) {
    console.error(`[URLExtractor] Error: ${err.message}`);
    return { success: false };
  }
}

module.exports = { extractOfficialUrl, isAggregator };