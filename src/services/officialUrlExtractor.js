/**
 * officialUrlExtractor.js
 *
 * Simplified — no more scraping aggregator pages.
 * Role: validate & sanitise URLs that Groq already extracted from post text.
 * If Groq couldn't find a real URL, we return null and hide the button.
 */

const BLOCKED_DOMAINS = [
  // Scholarship aggregators
  'scholarshipregion.com', 'opportunitydesk.org', 'scholars4dev.com',
  'brightscholarship.com',    // ← ADD THIS LINE
  'afterschoolafrica.com', 'myscholly.com', 'scholarships.com',
  'fastweb.com', 'cappex.com', 'niche.com', 'scholarships360.org',
  'scholarshipsads.com', 'scholarshipscorner.website',

  // Social media — never a valid official URL
  'facebook.com', 'fb.com', 'web.facebook.com', 'm.facebook.com',
  'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'youtube.com', 'youtu.be',
  'tiktok.com', 'pinterest.com',
  'whatsapp.com', 'wa.me',
  't.me', 'telegram.org', 'telegram.me',
  'snapchat.com', 'threads.net',

  // URL shorteners / noise
  'bit.ly', 'ow.ly', 'shorturl.at', 'tinyurl.com',
  'rebrand.ly', 'cutt.ly', 't.co',
  'google.com', 'google.com.ng', 'goo.gl',
  'linktr.ee', 'taplink.cc'
];

/**
 * Returns true if the URL is blocked (aggregator, social media, shortener).
 * Returns true for null/empty/malformed — treats those as "no URL found".
 */
function isBlockedUrl(url = '') {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return true;

  try {
    const hostname = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '');
    return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

/**
 * Validates a URL that Groq extracted from post text.
 * Returns the clean URL if valid, null otherwise.
 */
function validateOfficialUrl(url) {
  if (isBlockedUrl(url)) return null;
  try {
    const parsed = new URL(url.trim());
    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

// Legacy export kept so nothing else breaks — always returns { success: false }
// We no longer scrape pages; Priority 1 (Groq) is the only source of truth.
async function extractOfficialUrl(_sourceUrl) {
  return { success: false };
}

module.exports = { extractOfficialUrl, isBlockedUrl, validateOfficialUrl };
