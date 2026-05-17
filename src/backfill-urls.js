require('dotenv').config();
const mongoService = require('./services/mongoService');
const { extractOfficialUrl } = require('./services/officialUrlExtractor');

async function run() {
  await mongoService.connect();
  const db = mongoService.db;

  // Get ALL scholarships missing officialUrl
  // including those with originalUrls AND those without
  const scholarships = await db.collection('scholarships')
    .find({ officialUrl: { $in: [null, undefined] } })
    .toArray();

  console.log(`Found ${scholarships.length} scholarships to backfill...`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const s of scholarships) {
    // Try originalUrls array first
    const sourceUrls = s.originalUrls || [];
    const sourceUrl = sourceUrls[0] || null;

    if (!sourceUrl) {
      // No source URL — try to build a Google search URL as last resort
      // but save it as null so the button stays hidden
      await db.collection('scholarships').updateOne(
        { _id: s._id },
        { $set: { officialUrl: null, officialUrlChecked: true } }
      );
      skipped++;
      console.log(`⏭ ${s.title} — no source URL, marked as checked`);
      continue;
    }

    const result = await extractOfficialUrl(sourceUrl);

    await db.collection('scholarships').updateOne(
      { _id: s._id },
      { $set: {
        officialUrl: result.success ? result.best_url : null,
        officialUrlChecked: true
      }}
    );

    if (result.success) {
      success++;
      console.log(`✅ ${s.title}`);
      console.log(`   → ${result.best_url}`);
    } else {
      failed++;
      console.log(`❌ ${s.title} — not found`);
    }

    // Polite delay between requests
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log(`⏭ Skipped: ${skipped}`);
  process.exit(0);
}

run().catch(console.error);