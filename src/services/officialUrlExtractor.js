/**
 * officialUrlExtractor.js
 *
 * 3-step URL resolution pipeline:
 * 1. If Groq found a direct official URL → HTTP check it works → use it
 * 2. If Groq found an aggregator URL → scrape it → extract real URL → HTTP check → use it
 * 3. Nothing valid found → return null → Apply button hidden
 */

const axios = require('axios');
const cheerio = require('cheerio');

const BLOCKED_DOMAINS = [
  'scholarshipregion.com', 'opportunitydesk.org', 'scholars4dev.com',
  'brightscholarship.com', 'afterschoolafrica.com', 'myscholly.com',
  'scholarships.com', 'fastweb.com', 'cappex.com', 'niche.com',
  'scholarships360.org', 'scholarshipsads.com', 'scholarshipscorner.website',
  'facebook.com', 'fb.com', 'web.facebook.com', 'm.facebook.com',
  'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com',
  'whatsapp.com', 'wa.me', 't.me', 'telegram.org', 'telegram.me',
  'snapchat.com', 'threads.net', 'reddit.com',
  'bit.ly', 'ow.ly', 'shorturl.at', 'tinyurl.com', 'rebrand.ly',
  'cutt.ly', 't.co', 'google.com', 'google.com.ng', 'goo.gl',
  'linktr.ee', 'taplink.cc', 'bold.org', 'topuniversities.com',
  'bestcolleges.com', 'scientifyresearch.org', 'petersons.com'
];

// Aggregators we can scrape to find the real link inside
const SCRAPEABLE_AGGREGATORS = [
  'scholarshipregion.com', 'opportunitydesk.org', 'scholars4dev.com',
  'brightscholarship.com', 'afterschoolafrica.com', 'scholarships360.org'
];

const SOCIAL_AND_SHORTENERS = [
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'youtube.com', 'tiktok.com', 'whatsapp.com', 'wa.me',
  't.me', 'telegram.org', 'reddit.com', 'bit.ly', 'tinyurl.com',
  'ow.ly', 'cutt.ly', 't.co', 'goo.gl', 'linktr.ee'
];

function getHostname(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function isBlockedDomain(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return true;
  const h = getHostname(url);
  return BLOCKED_DOMAINS.some(d => h === d || h.endsWith('.' + d));
}

function isAggregator(url) {
  const h = getHostname(url);
  return SCRAPEABLE_AGGREGATORS.some(d => h === d || h.endsWith('.' + d));
}

function isSocialOrShortener(url) {
  const h = getHostname(url);
  return SOCIAL_AND_SHORTENERS.some(d => h === d || h.endsWith('.' + d));
}

// Legacy sync export — still used in some places
function validateOfficialUrl(url) {
  if (!url || isBlockedDomain(url)) return null;
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch { return null; }
}

/**
 * HTTP check — does this URL actually return a valid page?
 */
async function urlIsReachable(url) {
  try {
    const res = await axios.head(url, {
      timeout: 8000, maxRedirects: 5,
      validateStatus: s => s < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScholarBroad/1.0)' }
    });
    return res.status < 400;
  } catch {
    try {
      const res = await axios.get(url, {
        timeout: 10000, maxRedirects: 5,
        validateStatus: s => s < 400,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScholarBroad/1.0)' }
      });
      return res.status < 400;
    } catch { return false; }
  }
}

/**
 * Scrape an aggregator page and extract the real official university URL.
 */
async function scrapeRealUrlFromAggregator(aggregatorUrl) {
  try {
    console.log(`[URLExtractor] Scraping: ${aggregatorUrl}`);
    const res = await axios.get(aggregatorUrl, {
      timeout: 12000, maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    });
    const $ = cheerio.load(res.data);
    const candidates = [];

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (!href.startsWith('http')) return;
      if (isSocialOrShortener(href) || isAggregator(href)) return;

      const h = getHostname(href);
      const text = $(el).text().toLowerCase();

      const isOfficial =
        h.endsWith('.edu') || h.endsWith('.gov') ||
        h.endsWith('.ac.uk') || h.endsWith('.ac.jp') || h.endsWith('.ac.za') ||
        h.includes('university') || h.includes('college') ||
        h.includes('scholarship') || h.includes('fellowship') ||
        h.includes('foundation') || h.includes('institute') ||
        h.includes('chevening') || h.includes('fulbright') ||
        h.includes('daad') || h.includes('erasmus') ||
        h.includes('commonwealthscholarship') || h.includes('mastercardfdn') ||
        h.includes('rhodeshouse');

      const hasApplyText =
        text.includes('apply') || text.includes('official') ||
        text.includes('visit') || text.includes('website') ||
        text.includes('here') || text.includes('more');

      if (isOfficial || hasApplyText) {
        candidates.push({ href, score: isOfficial ? 2 : 1 });
      }
    });

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      console.log(`[URLExtractor] Best candidate: ${candidates[0].href}`);
      return candidates[0].href;
    }
    return null;
  } catch (err) {
    console.error(`[URLExtractor] Scrape failed: ${err.message}`);
    return null;
  }
}

/**
 * Full async 3-step pipeline. Call this during post processing.
 * Returns a confirmed working URL or null.
 */
async function resolveOfficialUrl(groqUrl, rawPostText = '') {
  // Nothing from Groq — try to find any URL in raw text
  if (!groqUrl) {
    const urls = rawPostText.match(/https?:\/\/[^\s"<>]+/gi) || [];
    groqUrl = urls.find(u => !isSocialOrShortener(u)) || null;
    if (!groqUrl) return null;
  }

  let url;
  try { url = new URL(groqUrl.trim()).href; }
  catch { return null; }

  // Step 1: Direct official URL (not aggregator, not social)
  if (!isAggregator(url) && !isSocialOrShortener(url) && !isBlockedDomain(url)) {
    console.log(`[URLExtractor] Checking direct URL: ${url}`);
    const works = await urlIsReachable(url);
    if (works) {
      console.log(`[URLExtractor] ✓ Confirmed: ${url}`);
      return url;
    }
    console.log(`[URLExtractor] ✗ Not reachable: ${url}`);
    return null;
  }

  // Step 2: Aggregator — scrape it
  if (isAggregator(url)) {
    const realUrl = await scrapeRealUrlFromAggregator(url);
    if (!realUrl) return null;
    const works = await urlIsReachable(realUrl);
    if (works) {
      console.log(`[URLExtractor] ✓ Scraped & confirmed: ${realUrl}`);
      return realUrl;
    }
    console.log(`[URLExtractor] ✗ Scraped URL not reachable: ${realUrl}`);
    return null;
  }

  // Step 3: Social/shortener — skip
  return null;
}

async function extractOfficialUrl(_sourceUrl) {
  return { success: false };
}

module.exports = {
  extractOfficialUrl,
  isBlockedUrl: isBlockedDomain,
  validateOfficialUrl,
  resolveOfficialUrl
};
