/**
 * scraperFallbackService.js
 *
 * Silent fallback — only activates when WAHA WhatsApp fetch returns zero new posts.
 * Pulls from RSS feeds of reliable scholarship aggregators.
 * Does NOT touch any existing flow. Called by ONE line in /api/cron/fetch-groups only.
 */

const Parser = require('rss-parser');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;

const rssParser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'ScholarBroad/1.0 scholarship-aggregator' }
});

const RSS_FEEDS = [
  { name: 'OpportunitiesForAfricans', url: 'https://www.opportunitiesforafricans.com/feed/' },
  { name: 'Profellow',                url: 'https://www.profellow.com/feed/' },
  { name: 'Pickascholarship',         url: 'https://www.pickascholarship.com/feed/' },
];

const SCHOLARSHIP_KEYWORDS = [
  'scholarship','fellowship','grant','funded','funding','stipend',
  'phd','masters','msc','postdoc','apply','deadline','eligib',
  'university','programme','award','fully funded'
];

function isScholarship(text = '') {
  const lower = text.toLowerCase();
  return SCHOLARSHIP_KEYWORDS.filter(k => lower.includes(k)).length >= 3;
}

function extractUrls(text = '') {
  return [...new Set((text.match(/https?:\/\/[^\s"<>]+/gi) || []))];
}

/**
 * Main entry — call this when WAHA saves 0 new posts.
 * Returns number of raw posts saved to raw_whatsapp_posts collection.
 */
async function runRssFallback() {
  console.log('[RSSFallback] Activating — WAHA returned 0 new posts...');
  const db = getDb();
  const col = db.collection('raw_whatsapp_posts');
  let totalSaved = 0;

  for (const feed of RSS_FEEDS) {
    try {
      console.log(`[RSSFallback] Fetching: ${feed.name}`);
      const parsed = await rssParser.parseURL(feed.url);
      const items = parsed.items || [];
      console.log(`[RSSFallback] ${feed.name}: ${items.length} items`);

      for (const item of items.slice(0, 15)) {
        const rawText = [
          item.title || '',
          item.contentSnippet || item.content || item.summary || ''
        ].join('\n').trim();

        if (!isScholarship(rawText)) continue;

        // Use item link as unique ID to avoid duplicates
        const existing = await col.findOne({ waMessageId: `rss_${item.link}` });
        if (existing) continue;

        const urls = item.link ? [item.link, ...extractUrls(rawText)] : extractUrls(rawText);

        await col.insertOne({
          waMessageId: `rss_${item.link}`,
          groupId:     'rss-fallback',
          groupName:   feed.name,
          rawText,
          urls:        [...new Set(urls)],
          fetchedAt:   new Date(),
          processed:   false,
          published:   false,
          source:      'rss'
        });

        totalSaved++;
      }

      // Polite delay between feeds
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`[RSSFallback] Error fetching ${feed.name}:`, err.message);
    }
  }

  console.log(`[RSSFallback] Done. Saved ${totalSaved} new RSS posts to queue.`);
  return totalSaved;
}

module.exports = { runRssFallback };
