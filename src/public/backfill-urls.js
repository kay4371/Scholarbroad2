require('dotenv').config();
const mongoService = require('./services/mongoService');
const { extractOfficialUrl } = require('./services/officialUrlExtractor');

async function run() {
  await mongoService.connect();
  const db = mongoService.db;
  const scholarships = await db.collection('scholarships')
    .find({ officialUrl: { $exists: false }, originalUrls: { $exists: true } })
    .toArray();

  console.log(`Backfilling ${scholarships.length} scholarships...`);

  for (const s of scholarships) {
    const sourceUrl = (s.originalUrls || [])[0];
    if (!sourceUrl) continue;
    const result = await extractOfficialUrl(sourceUrl);
    await db.collection('scholarships').updateOne(
      { _id: s._id },
      { $set: { officialUrl: result.success ? result.best_url : null } }
    );
    console.log(`${s.title}: ${result.success ? result.best_url : 'NOT FOUND'}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Done!');
  process.exit(0);
}

run().catch(console.error);