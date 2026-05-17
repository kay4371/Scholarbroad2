require('dotenv').config();
const mongoService = require('./services/mongoService');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BAD_DOMAINS = [
  'brightscholarship.com',    // ← ADD THIS LINE
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com',
  'x.com', 'linkedin.com', 'scholarshipregion.com',
  'google.com', 'bit.ly', 'youtube.com', 'whatsapp.com'
];

function isBadUrl(url) {
  if (!url) return true;
  return BAD_DOMAINS.some(d => url.includes(d));
}

async function findOfficialUrl(title, country, summary) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `What is the official application or scholarship page URL for this opportunity?

Title: ${title}
Country: ${country}
Summary: ${summary}

Rules:
- Return ONLY a JSON object, no other text
- Return the most specific scholarship/application page URL possible
- NEVER return facebook.com, scholarshipregion.com, instagram.com, or any social media or aggregator site
- If you are not confident, return null

Format: {"officialUrl": "https://exact-url-here.com/scholarship-page"} 
Or if not found: {"officialUrl": null}`
      }],
      temperature: 0.1,
      max_tokens: 150
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const url = parsed.officialUrl;
    if (url && !isBadUrl(url)) return url;
    return null;
  } catch (err) {
    console.error(`Groq error: ${err.message}`);
    return null;
  }
}

async function run() {
  await mongoService.connect();
  const db = mongoService.db;

  const scholarships = await db.collection('scholarships').find({
    $or: [
      { officialUrl: null },
      { officialUrl: { $exists: false } },
      { officialUrl: { $regex: 'facebook|scholarshipregion|instagram|twitter', $options: 'i' } }
    ]
  }).toArray();

  console.log(`Found ${scholarships.length} scholarships needing official URLs...`);

  let success = 0;
  let failed = 0;

  for (const s of scholarships) {
    const url = await findOfficialUrl(s.title, s.country, s.summary);
    if (url) {
      await db.collection('scholarships').updateOne(
        { _id: s._id },
        { $set: { officialUrl: url } }
      );
      console.log(`✅ ${s.title}`);
      console.log(`   → ${url}`);
      success++;
    } else {
      console.log(`❌ ${s.title} — not found`);
      failed++;
    }
    // Respect Groq rate limits
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n=== Done ===`);
  console.log(`✅ Fixed: ${success}`);
  console.log(`❌ Not found: ${failed}`);
  process.exit(0);
}

run().catch(console.error);