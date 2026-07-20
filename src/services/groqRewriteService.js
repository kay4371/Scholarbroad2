/**
 * groqRewriteService.js
 *
 * URL resolution: Groq extracts official URL directly from post text.
 * If no valid non-aggregator URL found → officialUrl = null → button hidden.
 *
 * WhatsApp format: ScholarBroad branded, structured, emoji-guided.
 */

const { validateOfficialUrl, resolveOfficialUrl } = require('./officialUrlExtractor');
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
const BROADCAST_GROUP   = process.env.BROADCAST_GROUP_ID;
const BROADCAST_CHANNEL = process.env.BROADCAST_CHANNEL_ID || '120363426245528639@newsletter';
// BROADCAST_MODE: 'group' | 'channel' | 'both'
const BROADCAST_MODE    = process.env.BROADCAST_MODE || 'both';

/**
 * Send via Whapi to a specific target (group or channel).
 * Primary: Whapi. Fallback: WAHA.
 */
async function sendViaWhapi(targetId, text) {
  await axios.post(
    `${WHAPI_BASE}/messages/text`,
    { to: targetId, body: text },
    {
      headers: {
        'Authorization': `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
}

async function sendViaWAHA(targetId, text) {
  await axios.post(
    `${WAHA_BASE}/api/sendText`,
    { chatId: targetId, text, session: WAHA_SESSION },
    {
      headers: {
        'Content-Type': 'application/json',
        ...(WAHA_KEY ? { 'X-Api-Key': WAHA_KEY } : {})
      },
      timeout: 15000
    }
  );
}

/**
 * Send text to WhatsApp broadcast targets.
 * BROADCAST_MODE controls where posts go:
 *   'group'   → WhatsApp group only
 *   'channel' → WhatsApp channel only
 *   'both'    → group AND channel (default)
 *
 * Primary sender: Whapi. Fallback: WAHA.
 */
async function sendToGroupWithFallback(text) {
  const results = [];
  const targets = [];

  if (BROADCAST_MODE === 'group' || BROADCAST_MODE === 'both') {
    if (BROADCAST_GROUP) targets.push({ id: BROADCAST_GROUP, label: 'group' });
  }
  if (BROADCAST_MODE === 'channel' || BROADCAST_MODE === 'both') {
    if (BROADCAST_CHANNEL) targets.push({ id: BROADCAST_CHANNEL, label: 'channel' });
  }

  if (targets.length === 0) throw new Error('No broadcast targets configured');

  for (const target of targets) {
    // Try Whapi first
    if (WHAPI_TOKEN) {
      try {
        await sendViaWhapi(target.id, text);
        console.log(`[Sender] ✓ Sent to ${target.label} via Whapi`);
        results.push({ target: target.label, method: 'whapi', ok: true });
        continue;
      } catch (whapiErr) {
        console.warn(`[Sender] Whapi failed for ${target.label}:`, whapiErr.message);
      }
    }

    // Fallback: WAHA
    try {
      await sendViaWAHA(target.id, text);
      console.log(`[Sender] ✓ Sent to ${target.label} via WAHA`);
      results.push({ target: target.label, method: 'waha', ok: true });
    } catch (wahaErr) {
      console.error(`[Sender] Both failed for ${target.label}:`, wahaErr.message);
      results.push({ target: target.label, method: 'failed', ok: false, error: wahaErr.message });
    }
  }

  const anySuccess = results.some(r => r.ok);
  if (!anySuccess) throw new Error('All broadcast targets failed');
  return { results, mode: BROADCAST_MODE };
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
  "whatsappText": "Format the message EXACTLY like this template (fill in real values, keep all emojis and labels):\\n\\n🎓 *SCHOLARSHIP ALERT* | ScholarBroad\\n\\n🏫 *{title}*\\n🌍 Country: {country} {flag}\\n📚 Level: {degree}\\n💰 Funding: {funding}\\n🗓 Deadline: {deadline}\\n✅ Eligible: {eligible}\\n📌 Field: {field}\\n\\n📝 {summary}\\n\\n━━━━━━━━━━━━━━━━━━━━━━\\n🔗 *Full Details & Apply:*\\n{LINK_PLACEHOLDER}\\n━━━━━━━━━━━━━━━━━━━━━━\\n\\n📲 Join ScholarBroad WhatsApp for daily alerts!\\n👉 https://chat.whatsapp.com/CwtL9JqEFQOASutGpeYPlZ\\n\\n#ScholarBroad #Scholarship #{country}Scholarship",
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
      const officialUrl = await resolveOfficialUrl(structured.officialUrl, post.rawText);
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

// ── Parse deadline string into Date ──────────────────────────────────────────
function parseDeadline(deadlineStr = '') {
  if (!deadlineStr || deadlineStr === 'Unknown' || deadlineStr === 'Rolling' ||
      deadlineStr === 'Check website' || deadlineStr === 'Varies') return null;
  try {
    const d = new Date(deadlineStr);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// ── Purge expired scholarships from DB ────────────────────────────────────────
// Removes any unpublished scholarship whose deadline has passed
async function purgeExpiredScholarships() {
  const db = getDb();
  const col = db.collection('scholarships');
  const now = new Date();
  const all = await col.find({ published: false }).toArray();

  let purged = 0;
  for (const s of all) {
    const deadline = parseDeadline(s.deadline);
    if (deadline && deadline < now) {
      await col.deleteOne({ _id: s._id });
      purged++;
      console.log(`[Purge] Removed expired: "${s.title}" (deadline: ${s.deadline})`);
    }
  }
  if (purged > 0) console.log(`[Purge] Removed ${purged} expired scholarships`);
  return purged;
}

// ── Get next unpublished scholarship — deadline priority ──────────────────────
// Priority order:
// 1. URGENT: deadline within 2 days → post immediately regardless of daily limit
// 2. SOON: deadline within 14 days → post next
// 3. NO DEADLINE / UNKNOWN → post after deadline-aware ones
// 4. Never post expired scholarships
async function getNextUnpublished() {
  const db = getDb();
  const col = db.collection('scholarships');
  const now = new Date();

  // First purge expired ones silently
  await purgeExpiredScholarships();

  const unpublished = await col.find({ published: false }).toArray();
  if (!unpublished.length) return null;

  // Categorise by deadline urgency
  const urgent = [];   // deadline <= 2 days
  const soon = [];     // deadline <= 14 days
  const normal = [];   // no deadline or far away

  for (const s of unpublished) {
    const deadline = parseDeadline(s.deadline);
    if (!deadline) {
      normal.push(s);
      continue;
    }
    const daysLeft = (deadline - now) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 2) urgent.push({ ...s, daysLeft });
    else if (daysLeft <= 14) soon.push({ ...s, daysLeft });
    else normal.push({ ...s, daysLeft });
  }

  // Sort each category: soonest deadline first
  const sortByDeadline = (a, b) => (a.daysLeft || 999) - (b.daysLeft || 999);
  urgent.sort(sortByDeadline);
  soon.sort(sortByDeadline);
  normal.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Return highest priority
  const next = urgent[0] || soon[0] || normal[0];
  if (next) {
    const label = urgent[0] ? '🚨 URGENT' : soon[0] ? '⏰ SOON' : '📅 NORMAL';
    console.log(`[PostQueue] Next: "${next.title}" | ${label} | Deadline: ${next.deadline || 'Unknown'}`);
  }
  return next || null;
}

// ── Check if urgent scholarships need extra posts today ───────────────────────
// Returns true if there are urgent scholarships that must be posted NOW
// regardless of whether we already posted today
async function hasUrgentScholarships() {
  const db = getDb();
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const unpublished = await db.collection('scholarships').find({ published: false }).toArray();

  for (const s of unpublished) {
    const deadline = parseDeadline(s.deadline);
    if (deadline && deadline > now && deadline <= twoDaysFromNow) return true;
  }
  return false;
}

// ── Mark scholarship as published ─────────────────────────────────────────────
async function markPublished(slug) {
  const db = getDb();
  await db.collection('scholarships').updateOne(
    { slug },
    { $set: { published: true, publishedAt: new Date() } }
  );
}

// ── One-time fix: replace YOUR_GROUP_INVITE in all existing records ───────────
async function fixGroupLinkInDB() {
  const db = getDb();
  const col = db.collection('scholarships');
  const result = await col.updateMany(
    { whatsappText: { $regex: 'YOUR_GROUP_INVITE' } },
    [{ $set: { whatsappText: {
      $replaceAll: {
        input: '$whatsappText',
        find: 'YOUR_GROUP_INVITE',
        replacement: 'CwtL9JqEFQOASutGpeYPlZ'
      }
    }}}]
  );
  console.log(`[FixGroupLink] Updated ${result.modifiedCount} records`);
  return result.modifiedCount;
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
  purgeExpiredScholarships,
  hasUrgentScholarships,
  fixGroupLinkInDB,
  trackClick,
  getBySlug,
  bufferCount,
  sendToGroupWithFallback
};
