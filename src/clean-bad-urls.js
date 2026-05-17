/**
 * clean-bad-urls.js
 *
 * One-time script: clears any officialUrl in the scholarships collection
 * that points to a blocked domain (social media, aggregator, shortener).
 *
 * Run once from your project root:
 *   node src/clean-bad-urls.js
 */

require('dotenv').config();
const mongoService = require('./services/mongoService');
const { isBlockedUrl } = require('./services/officialUrlExtractor');

const BATCH_SIZE = 100;

async function run() {
  console.log('\n🧹 ========================================');
  console.log('   CLEAN BAD OFFICIAL URLs');
  console.log('==========================================\n');

  await mongoService.connect();
  const db = mongoService.db;
  const col = db.collection('scholarships');

  // Only fetch records that actually have an officialUrl set
  const scholarships = await col
    .find({ officialUrl: { $ne: null, $exists: true } })
    .project({ _id: 1, title: 1, officialUrl: 1 })
    .toArray();

  console.log(`Found ${scholarships.length} scholarships with officialUrl set.\n`);

  let cleaned = 0;
  let kept = 0;

  for (const s of scholarships) {
    if (isBlockedUrl(s.officialUrl)) {
      await col.updateOne(
        { _id: s._id },
        { $set: { officialUrl: null } }
      );
      console.log(`🗑  Cleared: "${s.title}"`);
      console.log(`   Was: ${s.officialUrl}\n`);
      cleaned++;
    } else {
      kept++;
    }
  }

  console.log('==========================================');
  console.log(`✅ Done.`);
  console.log(`   Cleared : ${cleaned} bad URLs → set to null`);
  console.log(`   Kept    : ${kept} valid URLs untouched`);
  console.log('==========================================\n');

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Script failed:', err.message);
  process.exit(1);
});
