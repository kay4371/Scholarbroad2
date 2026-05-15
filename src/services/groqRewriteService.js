const Groq = require('groq-sdk');
//const { getDb } = require('./mongoService');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const BASE_URL = process.env.SITE_BASE_URL || 'https://scholarbroad.suntrenia.com';

// ── Generate a clean URL slug ─────────────────────────────────────────────────
function slugify(text = '') {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60);
}

// ── Build redirect URL ────────────────────────────────────────────────────────
function buildRedirectUrl(slug) {
  return `${BASE_URL}/s/${slug}`;
}

// ── Strip original URLs from text ─────────────────────────────────────────────
function stripUrls(text = '') {
  return text.replace(/https?:\/\/[^\s\]\)>,"]+/gi, '').trim();
}

// ── Rewrite a single raw post via Groq ───────────────────────────────────────
async function rewritePost(rawText) {
  const cleanText = stripUrls(rawText);

  const systemPrompt = `You are ScholarBroad's content editor. Your job is to:
1. Extract structured scholarship data from a raw WhatsApp message
2. Rewrite the message in ScholarBroad's brand voice: clear, exciting, student-friendly, emoji-enhanced but not overdone
3. Return ONLY valid JSON, no markdown, no extra text

Brand voice: Informative, warm, motivating. Nigerian/African student audience. Short sentences. Action-oriented.`;

  const userPrompt = `Extract and rewrite this scholarship post:

---
${cleanText}
---

Return this exact JSON structure:
{
  "title": "Short scholarship name",
  "country": "Host country name",
  "flag": "Country flag emoji",
  "degree": "Masters/PhD/BSc/All",
  "funding": "Fully Funded/Partial/Unknown",
  "deadline": "Month DD, YYYY or Unknown",
  "field": "Field of study or All Fields",
  "eligible": "Who can apply",
  "summary": "2-3 sentence summary of the opportunity",
  "whatsappText": "The rewritten WhatsApp post in ScholarBroad brand voice. 150-250 words. Include title, country, degree, funding, deadline, brief description, and end with: 'Full details & application link 👇\\n{LINK_PLACEHOLDER}'",
  "slug": "url-friendly-slug-for-this-scholarship"
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.4,
    max_tokens: 1000
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
  const rawCol = db.collection('raw_whatsapp_posts');
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

      // Build slug + redirect URL
      const baseSlug = structured.slug || slugify(structured.title);
      // Ensure slug uniqueness
      let slug = baseSlug;
      let attempt = 0;
      while (await scholarshipCol.findOne({ slug })) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }
      const redirectUrl = buildRedirectUrl(slug);

      // Replace {LINK_PLACEHOLDER} with actual redirect URL
      const finalWhatsappText = (structured.whatsappText || '')
        .replace('{LINK_PLACEHOLDER}', redirectUrl);

      // Save as scholarship
     // Save as scholarship
      await scholarshipCol.insertOne({
        slug,
        id: slug,
        normalizedUrl: `${BASE_URL}/s/${slug}`,
        redirectUrl,
        originalUrls: post.urls,
        sourceGroup: post.groupName,
        sourceGroupId: post.groupId,
        rawPostId: post._id,
        title: structured.title,
        country: structured.country,
        flag: structured.flag,
        degree: structured.degree,
        funding: structured.funding,
        deadline: structured.deadline,
        field: structured.field,
        eligible: structured.eligible,
        summary: structured.summary,
        whatsappText: finalWhatsappText,
        published: false,
        publishedAt: null,
        clicks: 0,
        affiliateClicks: {},
        createdAt: new Date()
      });
      // Mark raw post as processed
      await rawCol.updateOne(
        { _id: post._id },
        { $set: { processed: true, slug, processedAt: new Date() } }
      );

      console.log(`[Groq] ✓ Processed: "${structured.title}" → /s/${slug}`);
      successCount++;

      // Small delay to avoid rate limits
     await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`[Groq] Error processing post ${post._id}:`, err.message);
      await rawCol.updateOne({ _id: post._id }, { $set: { processed: true, parseError: true } });
    }
  }

  console.log(`[Groq] Done. ${successCount}/${unprocessed.length} posts processed successfully.`);
  return { processed: unprocessed.length, succeeded: successCount };
}

// ── Get the next unpublished scholarship for daily broadcast ──────────────────
async function getNextUnpublished() {
  const db = getDb();
  return db.collection('scholarships').findOne(
    { published: false },
    { sort: { createdAt: 1 } }
  );
}

// ── Mark a scholarship as published ──────────────────────────────────────────
async function markPublished(slug) {
  const db = getDb();
  await db.collection('scholarships').updateOne(
    { slug },
    { $set: { published: true, publishedAt: new Date() } }
  );
}

// ── Track redirect clicks ─────────────────────────────────────────────────────
async function trackClick(slug, type = 'official_link') {
  const db = getDb();
  const update = type === 'official_link'
    ? { $inc: { clicks: 1 } }
    : { $inc: { [`affiliateClicks.${type}`]: 1 } };
  await db.collection('scholarships').updateOne({ slug }, update);
}

// ── Get scholarship by slug (for landing page) ────────────────────────────────
async function getBySlug(slug) {
  const db = getDb();
  return db.collection('scholarships').findOne({ slug });
}

// ── Count unpublished posts in buffer ─────────────────────────────────────────
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
  bufferCount
};
