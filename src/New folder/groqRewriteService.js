/**
 * groqRewriteService.js
 *
 * URL resolution: Groq extracts official URL directly from post text.
 * If no valid non-aggregator URL found → officialUrl = null → button hidden.
 *
 * WhatsApp format: ScholarBroad branded, structured, emoji-guided.
 */

const { validateOfficialUrl } = require('./officialUrlExtractor');
const Groq = require('groq-sdk');
const axios = require('axios');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const BASE_URL = process.env.SITE_BASE_URL || 'https://scholarbroad.suntrenia.com';

// ── WAHA + Whapi broadcast sender ─────────────────────────────────────────────
const WAHA_BASE      = process.env.WAHA_BASE_URL    || 'http://localhost:3000';
const WAHA_KEY       = process.env.WAHA_API_KEY     || '';
const WAHA_SESSION   = process.env.WAHA_SESSION     || 'default';
const WHAPI_TOKEN    = process.env.WHAPI_TOKEN3     || '';
const WHAPI_BASE     = 'https://gate.whapi.cloud';
const BROADCAST_GROUP = process.env.BROADCAST_GROUP_ID;

/**
 * Send text to WhatsApp broadcast group.
 * Tries WAHA first. If WAHA fails, falls back to Whapi silently.
 */
async function sendToGroupWithFallback(text) {
  // ── Primary: WAHA ──────────────────────────────────────────────────────────
  try {
    await axios.post(
      `${WAHA_BASE}/api/sendText`,
      { chatId: BROADCAST_GROUP, text, session: WAHA_SESSION },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(WAHA_KEY ? { 'X-Api-Key': WAHA_KEY } : {})
        },
        timeout: 15000
      }
    );
    console.log('[Sender] ✓ Sent via WAHA');
    return { method: 'waha' };
  } catch (wahaErr) {
    console.warn('[Sender] WAHA failed:', wahaErr.message, '— trying Whapi fallback...');
  }

  // ── Fallback: Whapi ────────────────────────────────────────────────────────
  if (!WHAPI_TOKEN) {
    throw new Error('WAHA failed and WHAPI_TOKEN3 is not set — cannot send message');
  }
  if (!BROADCAST_GROUP) {
    throw new Error('BROADCAST_GROUP_ID not set');
  }

  await axios.post(
    `${WHAPI_BASE}/messages/text`,
    { to: BROADCAST_GROUP, body: text },
    {
      headers: {
        'Authorization': `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
  console.log('[Sender] ✓ Sent via Whapi (fallback)');
  return { method: 'whapi' };
}

// ── Slug helpers ──────────────────────────────────────────────────────────────
function slugify(text = '') {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function buildRedirectUrl(slug) {
  return `${BASE_URL}/s/${slug}`;
}

// ── Groq: rewrite one raw post ────────────────────────────────────────────────
async function rewritePost(rawText) {
  const systemPrompt = `You are ScholarBroad's content editor for an African student audience.

Your job:
1. Extract structured scholarship data from a raw WhatsApp/RSS message
2. Rewrite in ScholarBroad brand voice: clear, exciting, student-friendly
3. Format the whatsappText EXACTLY as shown in the template below
4. Return ONLY valid JSON — no markdown, no extra text

Brand voice: Informative, warm, motivating. Short sentences. Action-oriented. Nigerian/African student audience.`;

  const userPrompt = `Extract and rewrite this scholarship post:

---
${rawText}
---

Return this exact JSON structure:
{
  "title": "Short scholarship name (max 60 chars)",
  "country": "Host country name",
  "flag": "Country flag emoji",
  "degree": "Masters / PhD / BSc / Postdoc / All Levels",
  "funding": "Fully Funded / Partial / Unknown",
  "deadline": "Month DD, YYYY or Rolling or Unknown",
  "field": "Field of study or All Fields",
  "eligible": "Who can apply e.g. All Nationalities / African Students",
  "summary": "2-3 sentence human summary of the opportunity",
  "whatsappText": "Format the message EXACTLY like this template (fill in real values, keep all emojis and labels):\\n\\n🎓 *SCHOLARSHIP ALERT* | ScholarBroad\\n\\n🏫 *{title}*\\n🌍 Country: {country} {flag}\\n📚 Level: {degree}\\n💰 Funding: {funding}\\n🗓 Deadline: {deadline}\\n✅ Eligible: {eligible}\\n📌 Field: {field}\\n\\n📝 {summary}\\n\\n━━━━━━━━━━━━━━━━━━━━━━\\n🔗 *Full Details & Apply:*\\n{LINK_PLACEHOLDER}\\n━━━━━━━━━━━━━━━━━━━━━━\\n\\n📲 Join ScholarBroad WhatsApp for daily alerts!\\n👉 https://chat.whatsapp.com/YOUR_GROUP_INVITE\\n\\n#ScholarBroad #Scholarship #{country}Scholarship",
  "officialUrl": "The ONE URL in the post that goes directly to a university, government body, or official scholarship foundation. Must NOT be scholarshipregion.com, opportunitydesk.org, brightscholarship.com, or any aggregator, social media, or link shortener. Return null if not found or not 100% certain.",
  "slug": "url-friendly-slug-max-60-chars"
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 1200
  });

  const raw = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    console.error('[Groq] Failed to parse JSON response');
    return null;
  }
}

// ── Process all unprocessed raw posts ─────────────────────────────────────────
async function processUnprocessedPosts() {
  const db = getDb();
  const rawCol         = db.collection('raw_whatsapp_posts');
  const scholarshipCol = db.collection('scholarships');

  const unprocessed = await rawCol.find({ processed: false }).limit(20).toArray();
  console.log(`[Groq] Processing ${unprocessed.length} raw posts...`);

  let successCount = 0;

  for (const post of unprocessed) {
    try {
      const structured = await rewritePost(post.rawText);

      if (!structured || !structured.title) {
        await rawCol.updateOne({ _id: post._id }, { $set: { processed: true, parseError: true } });
        continue;
      }

      // ── Slug deduplication ─────────────────────────────────────────────────
      const baseSlug = structured.slug || slugify(structured.title);
      let slug = baseSlug;
      let attempt = 0;
      while (await scholarshipCol.findOne({ slug })) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }
      const redirectUrl = buildRedirectUrl(slug);

      // Replace placeholder with real redirect URL
      const finalWhatsappText = (structured.whatsappText || '')
        .replace('{LINK_PLACEHOLDER}', redirectUrl);

      // ── Validate official URL ──────────────────────────────────────────────
      const officialUrl = validateOfficialUrl(structured.officialUrl);
      if (officialUrl) {
        console.log(`[Groq] ✓ Official URL: ${officialUrl}`);
      } else {
        console.log(`[Groq] ℹ No valid official URL for "${structured.title}" — button hidden`);
      }

      // ── Save to DB ─────────────────────────────────────────────────────────
      await scholarshipCol.insertOne({
        slug,
        id:            slug,
        normalizedUrl: `${BASE_URL}/s/${slug}`,
        redirectUrl,
        officialUrl,
        originalUrls:  post.urls || [],
        sourceGroup:   post.groupName,
        sourceGroupId: post.groupId,
        rawPostId:     post._id,
        source:        post.source || 'whatsapp',
        title:         structured.title,
        country:       structured.country,
        flag:          structured.flag,
        degree:        structured.degree,
        funding:       structured.funding,
        deadline:      structured.deadline,
        field:         structured.field,
        eligible:      structured.eligible,
        summary:       structured.summary,
        whatsappText:  finalWhatsappText,
        published:     false,
        publishedAt:   null,
        clicks:        0,
        affiliateClicks: {},
        createdAt:     new Date()
      });

      await rawCol.updateOne(
        { _id: post._id },
        { $set: { processed: true, slug, processedAt: new Date() } }
      );

      console.log(`[Groq] ✓ Processed: "${structured.title}" → /s/${slug}`);
      successCount++;

      // Rate limit courtesy delay
      await new Promise(r => setTimeout(r, 4000));

    } catch (err) {
      console.error(`[Groq] Error processing post ${post._id}:`, err.message);
      await rawCol.updateOne({ _id: post._id }, { $set: { processed: true, parseError: true } });
    }
  }

  console.log(`[Groq] Done. ${successCount}/${unprocessed.length} posts processed.`);
  return { processed: unprocessed.length, succeeded: successCount };
}

// ── Get next unpublished scholarship for daily broadcast ──────────────────────
async function getNextUnpublished() {
  const db = getDb();
  return db.collection('scholarships').findOne(
    { published: false },
    { sort: { createdAt: 1 } }
  );
}

// ── Mark scholarship as published ─────────────────────────────────────────────
async function markPublished(slug) {
  const db = getDb();
  await db.collection('scholarships').updateOne(
    { slug },
    { $set: { published: true, publishedAt: new Date() } }
  );
}

// ── Track redirect/affiliate clicks ───────────────────────────────────────────
async function trackClick(slug, type = 'official_link') {
  const db = getDb();
  const update = type === 'official_link'
    ? { $inc: { clicks: 1 } }
    : { $inc: { [`affiliateClicks.${type}`]: 1 } };
  await db.collection('scholarships').updateOne({ slug }, update);
}

// ── Get scholarship by slug ────────────────────────────────────────────────────
async function getBySlug(slug) {
  const db = getDb();
  return db.collection('scholarships').findOne({ slug });
}

// ── Count unpublished in buffer ────────────────────────────────────────────────
async function bufferCount() {
  const db = getDb();
  return db.collection('scholarships').countDocuments({ published: false });
}

module.exports = {
  processUnprocessedPosts,
  getNextUnpublished,
  markPublished,
  trackClick,
  getBySlug,
  bufferCount,
  sendToGroupWithFallback
};
