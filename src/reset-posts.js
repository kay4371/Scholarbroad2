require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Fallback: use MONGO_URI if MONGODB_URI not set
if (!process.env.MONGODB_URI && process.env.MONGO_URI) {
  process.env.MONGODB_URI = process.env.MONGO_URI;
}

console.log('MONGODB_URI set:', !!process.env.MONGODB_URI);

const mongoService = require('./services/mongoService');

mongoService.connect().then(async () => {
  const db = mongoService.db;
  
  const result = await db.collection('raw_whatsapp_posts').updateMany(
    { $or: [{ parseError: true }, { processed: true }] },
    { $set: { processed: false, parseError: false } }
  );
  
  console.log('Reset:', result.modifiedCount, 'posts back to unprocessed');
  process.exit();
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
