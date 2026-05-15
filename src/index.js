// require('dotenv').config();
// const express = require('express');
// const whatsappFallbackService = require('./services/whatsappFallbackService');
// const scraperService = require('./services/scraperService');
// const mongoService = require('./services/mongoService');
// const groqService = require('./services/groqService');

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.use(express.json());

// // ============================================
// // ROOT ROUTE
// // ============================================
// app.get('/', (req, res) => {
//   res.json({
//     message: 'ScholaBroad Scholarship API',
//     version: '2.0.0',
//     endpoints: {
//       health: '/health',
//       scrape: 'POST /api/scrape',
//       scholarships: 'GET /api/scholarships',
//       scholarshipDetail: 'GET /api/scholarship/:id',
//       stats: 'GET /api/stats',
//       test: 'GET /api/test',
//       debugIds: 'GET /api/debug/ids'
//     },
//     documentation: 'https://github.com/kay4371/Scholarbroad2'
//   });
// });

// // ============================================
// // HEALTH CHECK
// // ============================================
// app.get('/health', (req, res) => {
//   res.json({
//     status: 'ok',
//     service: 'Scholarship Scraper API',
//     timestamp: new Date().toISOString(),
//     mongodb: !!process.env.MONGODB_URI
//   });
// });

// // ============================================
// // GET FRESH UNPOSTED SCHOLARSHIPS
// // ============================================
// app.post('/api/get-unposted', async (req, res) => {
//   try {
//     console.log('\n🔍 ========================================');
//     console.log('  FETCHING UNPOSTED SCHOLARSHIPS');
//     console.log('========================================\n');

//     const limit = req.body.limit || 3;
//     const includeReminders = req.body.includeReminders !== false;

//     // Get fresh unposted scholarships from database
//     const freshScholarships = await mongoService.getFreshUnpostedScholarships(limit);

//     let reminderScholarships = [];
//     if (includeReminders) {
//       reminderScholarships = await mongoService.getScholarshipsNeedingReminder();
//     }

//     // Combine: fresh scholarships + max 1 reminder
//     let scholarshipsToPost = [
//       ...freshScholarships,
//       ...(reminderScholarships.length > 0 ? [reminderScholarships[0]] : [])
//     ].slice(0, limit);

//     // ========================================
//     // WHATSAPP FALLBACK ACTIVATION
//     // ========================================
//     let usedFallback = false;
//     if (scholarshipsToPost.length === 0) {
//       console.log('⚠️ No unposted scholarships found in database');
//       console.log('🚨 ACTIVATING WHATSAPP FALLBACK...\n');

//       try {
//         // Scrape WhatsApp groups
//         const whatsappScholarships = await whatsappFallbackService.checkAndActivateFallback(0);

//         if (whatsappScholarships.length > 0) {
//           console.log(`✅ WhatsApp fallback retrieved ${whatsappScholarships.length} scholarships`);

//           // Save to MongoDB (with deduplication)
//           console.log('\n💾 Saving WhatsApp scholarships to database...\n');
//           const saveResult = await mongoService.saveScholarships(whatsappScholarships);

//           console.log(`📊 Save results:`);
//           console.log(`  New: ${saveResult.insertedCount}`);
//           console.log(`  Updated: ${saveResult.modifiedCount}`);
//           console.log(`  Skipped: ${saveResult.skippedDuplicates}`);
//           console.log(`  Errors: ${saveResult.errorCount}\n`);

//           // Get the newly saved scholarships
//           scholarshipsToPost = await mongoService.getFreshUnpostedScholarships(limit);
//           usedFallback = true;
//         } else {
//           console.log('⚠️ WhatsApp fallback found no scholarships');
//         }
//       } catch (fallbackError) {
//         console.error('❌ WhatsApp fallback failed:', fallbackError.message);
//       }
//     }

//     console.log(`\n📊 Results:`);
//     console.log(`  Fresh from DB: ${freshScholarships.length}`);
//     console.log(`  Reminders: ${reminderScholarships.length}`);
//     console.log(`  To Post: ${scholarshipsToPost.length}`);
//     console.log(`  Used Fallback: ${usedFallback ? 'YES ✅' : 'NO'}`);
//     console.log('========================================\n');

//     res.json({
//       success: true,
//       scholarships: scholarshipsToPost,
//       count: scholarshipsToPost.length,
//       breakdown: {
//         fresh: freshScholarships.length,
//         reminders: reminderScholarships.length,
//         fromWhatsApp: usedFallback
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Error fetching unposted:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       scholarships: [],
//       count: 0
//     });
//   }
// });

// // ============================================
// // MARK SCHOLARSHIPS AS POSTED
// // ============================================
// app.post('/api/mark-posted', async (req, res) => {
//   try {
//     const { scholarshipIds } = req.body;

//     if (!scholarshipIds || !Array.isArray(scholarshipIds)) {
//       return res.status(400).json({
//         success: false,
//         error: 'scholarshipIds array required'
//       });
//     }

//     console.log(`\n✅ Marking ${scholarshipIds.length} scholarships as posted...`);

//     const results = [];
//     for (const id of scholarshipIds) {
//       const success = await mongoService.markAsPosted(id);
//       results.push({ id, success });
//     }

//     const successCount = results.filter(r => r.success).length;
//     console.log(`  Success: ${successCount}/${scholarshipIds.length}\n`);

//     res.json({
//       success: true,
//       marked: successCount,
//       total: scholarshipIds.length,
//       results: results
//     });
//   } catch (error) {
//     console.error('❌ Error marking as posted:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // GET POSTING STATISTICS
// // ============================================
// app.get('/api/posting-stats', async (req, res) => {
//   try {
//     const stats = await mongoService.getPostingStats();
//     res.json({
//       success: true,
//       stats: stats
//     });
//   } catch (error) {
//     console.error('❌ Error getting stats:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // SCRAPE ENDPOINT
// // ============================================
// app.post('/api/scrape', async (req, res) => {
//   try {
//     console.log('\n🎯 ========================================');
//     console.log('  STARTING SCHOLARSHIP SCRAPING');
//     console.log('========================================\n');

//     // Scrape scholarships
//     const scholarships = await scraperService.scrapeAll();

//     // Save to MongoDB (with deduplication)
//     const saveResult = await mongoService.saveScholarships(scholarships);

//     // Cleanup old posted records
//     await mongoService.cleanupOldPostedRecords();

//     console.log('\n✅ Scraping and saving completed\n');

//     res.json({
//       success: true,
//       count: scholarships.length,
//       scholarships: scholarships,
//       saved: {
//         new: saveResult.insertedCount,
//         updated: saveResult.modifiedCount,
//         errors: saveResult.errorCount
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Scraping error:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       count: 0,
//       scholarships: []
//     });
//   }
// });

// // ============================================
// // DATA MIGRATION ENDPOINT
// // ============================================
// app.post('/api/migrate-data', async (req, res) => {
//   try {
//     console.log('\n🔄 Starting manual data migration...\n');

//     await mongoService.connect();
//     await mongoService.migrateExistingData();

//     const stats = await mongoService.getPostingStats();

//     res.json({
//       success: true,
//       message: 'Data migration completed successfully',
//       stats,
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Migration failed:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// // ============================================
// // MIGRATION STATUS
// // ============================================
// app.get('/api/migration-status', async (req, res) => {
//   try {
//     await mongoService.connect();

//     const total = await mongoService.collection.countDocuments();
//     const needsMigration = await mongoService.collection.countDocuments({
//       $or: [
//         { normalizedUrl: { $exists: false } },
//         { normalizedUrl: null },
//         { titleFingerprint: { $exists: false } }
//       ]
//     });

//     const migrated = total - needsMigration;

//     res.json({
//       success: true,
//       total,
//       migrated,
//       needsMigration,
//       percentComplete: total > 0 ? ((migrated / total) * 100).toFixed(2) : 100,
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Status check failed:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // GET SINGLE SCHOLARSHIP BY ID
// // ============================================
// app.get('/api/scholarship/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     console.log(`📖 Fetching scholarship with ID: ${id}`);

//     const scholarship = await mongoService.getScholarshipById(id);

//     if (!scholarship) {
//       return res.status(404).json({
//         success: false,
//         error: 'Scholarship not found'
//       });
//     }

//     res.json({
//       success: true,
//       scholarship
//     });
//   } catch (error) {
//     console.error('❌ Error fetching scholarship:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch scholarship'
//     });
//   }
// });

// // ============================================
// // CLEANUP DUPLICATES
// // ============================================
// app.post('/api/cleanup-duplicates', async (req, res) => {
//   try {
//     console.log('\n🧹 Starting duplicate cleanup process...\n');

//     const mergedCount = await mongoService.findAndMergeDuplicates();
//     const stats = await mongoService.getPostingStats();

//     res.json({
//       success: true,
//       message: 'Duplicate cleanup completed',
//       results: {
//         duplicatesRemoved: mergedCount,
//         currentStats: stats
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Cleanup failed:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// // ============================================
// // CHECK DUPLICATES
// // ============================================
// app.get('/api/check-duplicates', async (req, res) => {
//   try {
//     await mongoService.connect();

//     const duplicates = await mongoService.collection.aggregate([
//       { $match: { titleFingerprint: { $exists: true, $ne: null } } },
//       {
//         $group: {
//           _id: '$titleFingerprint',
//           count: { $sum: 1 },
//           titles: { $push: '$title' },
//           ids: { $push: '$id' }
//         }
//       },
//       { $match: { count: { $gt: 1 } } },
//       { $sort: { count: -1 } },
//       { $limit: 50 }
//     ]).toArray();

//     res.json({
//       success: true,
//       duplicateGroups: duplicates.length,
//       totalDuplicates: duplicates.reduce((sum, g) => sum + g.count - 1, 0),
//       examples: duplicates.slice(0, 10).map(g => ({
//         count: g.count,
//         titles: g.titles,
//         ids: g.ids
//       })),
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Check failed:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // REBUILD INDEXES
// // ============================================
// app.post('/api/rebuild-indexes', async (req, res) => {
//   try {
//     console.log('\n🔨 Force rebuilding indexes...\n');

//     await mongoService.connect();

//     const indexes = await mongoService.collection.indexes();
//     console.log('📋 Current indexes:', indexes.map(i => i.name));

//     const indexesToDrop = indexes
//       .map(i => i.name)
//       .filter(name => name !== '_id_');

//     console.log('\n🗑️ Dropping indexes:', indexesToDrop);

//     for (const indexName of indexesToDrop) {
//       try {
//         await mongoService.collection.dropIndex(indexName);
//         console.log(`  ✅ Dropped: ${indexName}`);
//       } catch (error) {
//         console.log(`  ⚠️ Could not drop ${indexName}: ${error.message}`);
//       }
//     }

//     console.log('\n🔄 Verifying all records have normalized fields...');

//     const needsNormalization = await mongoService.collection.countDocuments({
//       $or: [
//         { normalizedUrl: { $exists: false } },
//         { normalizedUrl: null }
//       ]
//     });

//     if (needsNormalization > 0) {
//       console.log(`⚠️ Found ${needsNormalization} records still needing normalization`);
//       console.log('🔄 Running migration again...');
//       await mongoService.migrateExistingData();
//     } else {
//       console.log('✅ All records have normalized fields');
//     }

//     console.log('\n🏗️ Creating new indexes...\n');

//     try {
//       await mongoService.collection.createIndex(
//         { normalizedUrl: 1 },
//         {
//           unique: true,
//           name: 'unique_normalized_url',
//           partialFilterExpression: {
//             normalizedUrl: { $exists: true, $ne: null, $type: 'string' }
//           }
//         }
//       );
//       console.log('  ✅ Created: unique_normalized_url (with partial filter)');
//     } catch (error) {
//       console.error('  ❌ Failed to create unique_normalized_url:', error.message);
//       throw error;
//     }

//     try {
//       await mongoService.collection.createIndex(
//         { id: 1 },
//         {
//           unique: true,
//           name: 'unique_short_id',
//           partialFilterExpression: {
//             id: { $exists: true, $ne: null, $type: 'string' }
//           }
//         }
//       );
//       console.log('  ✅ Created: unique_short_id (with partial filter)');
//     } catch (error) {
//       console.error('  ❌ Failed to create unique_short_id:', error.message);
//     }

//     try {
//       await mongoService.collection.createIndex(
//         { titleFingerprint: 1 },
//         { sparse: true, name: 'title_fingerprint_index' }
//       );
//       console.log('  ✅ Created: title_fingerprint_index (sparse)');
//     } catch (error) {
//       console.error('  ❌ Failed to create title_fingerprint_index:', error.message);
//     }

//     try {
//       await mongoService.collection.createIndex(
//         { posted: 1, scrapedAt: -1 },
//         { name: 'posting_query_index' }
//       );
//       console.log('  ✅ Created: posting_query_index');
//     } catch (error) {
//       console.error('  ❌ Failed to create posting_query_index:', error.message);
//     }

//     const finalIndexes = await mongoService.collection.indexes();
//     console.log('\n📋 Final indexes:', finalIndexes.map(i => i.name));
//     console.log('\n✅ Index rebuild complete!\n');

//     res.json({
//       success: true,
//       message: 'Indexes rebuilt successfully',
//       droppedIndexes: indexesToDrop,
//       currentIndexes: finalIndexes.map(i => ({
//         name: i.name,
//         key: i.key,
//         unique: i.unique || false,
//         sparse: i.sparse || false,
//         partialFilterExpression: i.partialFilterExpression || null
//       })),
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Index rebuild failed:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       stack: error.stack,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// // ============================================
// // INDEX STATUS
// // ============================================
// app.get('/api/index-status', async (req, res) => {
//   try {
//     await mongoService.connect();

//     const indexes = await mongoService.collection.indexes();
//     const totalDocuments = await mongoService.collection.countDocuments();

//     const nullNormalized = await mongoService.collection.countDocuments({
//       $or: [
//         { normalizedUrl: null },
//         { normalizedUrl: { $exists: false } }
//       ]
//     });

//     const nullIds = await mongoService.collection.countDocuments({
//       $or: [
//         { id: null },
//         { id: { $exists: false } }
//       ]
//     });

//     res.json({
//       success: true,
//       indexes: indexes.map(i => ({
//         name: i.name,
//         key: i.key,
//         unique: i.unique || false,
//         sparse: i.sparse || false,
//         partialFilterExpression: i.partialFilterExpression || null
//       })),
//       stats: {
//         totalDocuments: totalDocuments,
//         nullNormalizedUrl: nullNormalized,
//         nullIds: nullIds,
//         dataHealthy: nullNormalized === 0 && nullIds === 0
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Index status check failed:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // EMERGENCY FIX INDEXES
// // ============================================
// app.post('/api/emergency-fix-indexes', async (req, res) => {
//   const log = [];

//   try {
//     log.push('🚨 EMERGENCY INDEX FIX STARTING...');
//     log.push('');

//     await mongoService.connect();
//     log.push('✅ Connected to MongoDB');

//     log.push('');
//     log.push('🗑️ STEP 1: Dropping all indexes...');

//     try {
//       await mongoService.collection.dropIndexes();
//       log.push('  ✅ All indexes dropped (except _id)');
//     } catch (dropError) {
//       log.push(`  ⚠️ Drop all failed: ${dropError.message}`);
//       log.push('  Trying individual drops...');

//       const indexes = await mongoService.collection.indexes();
//       for (const index of indexes) {
//         if (index.name !== '_id_') {
//           try {
//             await mongoService.collection.dropIndex(index.name);
//             log.push(`  ✅ Dropped: ${index.name}`);
//           } catch (e) {
//             log.push(`  ⚠️ Could not drop ${index.name}: ${e.message}`);
//           }
//         }
//       }
//     }

//     log.push('');
//     log.push('🔍 STEP 2: Checking data integrity...');

//     const nullCount = await mongoService.collection.countDocuments({
//       $or: [
//         { normalizedUrl: null },
//         { normalizedUrl: { $exists: false } }
//       ]
//     });

//     log.push(`  Found ${nullCount} records with null/missing normalizedUrl`);

//     if (nullCount > 0) {
//       log.push('  🔄 Running emergency migration...');

//       const nullRecords = await mongoService.collection.find({
//         $or: [
//           { normalizedUrl: null },
//           { normalizedUrl: { $exists: false } }
//         ]
//       }).toArray();

//       let fixed = 0;
//       let deleted = 0;

//       for (const record of nullRecords) {
//         try {
//           if (!record.url) {
//             await mongoService.collection.deleteOne({ _id: record._id });
//             deleted++;
//             continue;
//           }

//           const normalizedUrl = mongoService.normalizeUrl(record.url);
//           const shortId = mongoService.generateShortId(normalizedUrl);
//           const titleFingerprint = mongoService.generateTitleFingerprint(record.title || '');

//           await mongoService.collection.updateOne(
//             { _id: record._id },
//             {
//               $set: {
//                 normalizedUrl,
//                 id: shortId,
//                 titleFingerprint,
//                 updatedAt: new Date().toISOString()
//               }
//             }
//           );
//           fixed++;
//         } catch (fixError) {
//           log.push(`  ⚠️ Could not fix record ${record._id}: ${fixError.message}`);
//         }
//       }

//       log.push(`  ✅ Fixed ${fixed} records, deleted ${deleted} invalid records`);
//     } else {
//       log.push('  ✅ All records have valid data');
//     }

//     log.push('');
//     log.push('🏗️ STEP 3: Creating new indexes...');

//     try {
//       await mongoService.collection.createIndex(
//         { normalizedUrl: 1 },
//         { unique: true, name: 'idx_normalized_url' }
//       );
//       log.push('  ✅ Created: idx_normalized_url (unique)');
//     } catch (e) {
//       log.push(`  ❌ Failed idx_normalized_url: ${e.message}`);
//     }

//     try {
//       await mongoService.collection.createIndex(
//         { id: 1 },
//         { unique: true, name: 'idx_short_id' }
//       );
//       log.push('  ✅ Created: idx_short_id (unique)');
//     } catch (e) {
//       log.push(`  ❌ Failed idx_short_id: ${e.message}`);
//     }

//     try {
//       await mongoService.collection.createIndex(
//         { titleFingerprint: 1 },
//         { name: 'idx_title_fingerprint' }
//       );
//       log.push('  ✅ Created: idx_title_fingerprint');
//     } catch (e) {
//       log.push(`  ❌ Failed idx_title_fingerprint: ${e.message}`);
//     }

//     try {
//       await mongoService.collection.createIndex(
//         { posted: 1, scrapedAt: -1 },
//         { name: 'idx_posting' }
//       );
//       log.push('  ✅ Created: idx_posting');
//     } catch (e) {
//       log.push(`  ❌ Failed idx_posting: ${e.message}`);
//     }

//     log.push('');
//     log.push('✅ STEP 4: Verification...');

//     const finalIndexes = await mongoService.collection.indexes();
//     const totalDocs = await mongoService.collection.countDocuments();
//     const stillNull = await mongoService.collection.countDocuments({
//       $or: [
//         { normalizedUrl: null },
//         { normalizedUrl: { $exists: false } }
//       ]
//     });

//     log.push(`  Total documents: ${totalDocs}`);
//     log.push(`  Records with null normalizedUrl: ${stillNull}`);
//     log.push(`  Active indexes: ${finalIndexes.map(i => i.name).join(', ')}`);

//     log.push('');
//     log.push('========================================');
//     log.push('✅ EMERGENCY FIX COMPLETE');
//     log.push('========================================');

//     console.log(log.join('\n'));

//     res.json({
//       success: true,
//       message: 'Emergency fix completed',
//       log,
//       summary: {
//         totalDocuments: totalDocs,
//         nullRecords: stillNull,
//         indexes: finalIndexes.map(i => i.name),
//         healthy: stillNull === 0
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     log.push('');
//     log.push('❌ EMERGENCY FIX FAILED');
//     log.push(`Error: ${error.message}`);

//     console.error(log.join('\n'));
//     console.error(error.stack);

//     res.status(500).json({
//       success: false,
//       error: error.message,
//       log,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

// // ============================================
// // GET SCHOLARSHIPS
// // ============================================
// app.get('/api/scholarships', async (req, res) => {
//   try {
//     const limit = parseInt(req.query.limit) || 30;
//     console.log(`📦 Fetching ${limit} latest scholarships from MongoDB...`);

//     const scholarships = await mongoService.getLatestScholarships(limit);

//     res.json({
//       success: true,
//       count: scholarships.length,
//       scholarships,
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Fetch error:', error.message);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // GET STATS
// // ============================================
// app.get('/api/stats', async (req, res) => {
//   try {
//     const stats = await mongoService.getStats();
//     res.json({
//       success: true,
//       stats,
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // DEBUG: LIST ALL IDS
// // ============================================
// app.get('/api/debug/ids', async (req, res) => {
//   try {
//     const limit = parseInt(req.query.limit) || 20;
//     console.log(`🔍 Fetching ${limit} scholarship IDs for debugging...`);

//     const ids = await mongoService.listAllIds(limit);

//     res.json({
//       success: true,
//       count: ids.length,
//       ids,
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('❌ Error fetching IDs:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });

// // ============================================
// // TEST ENDPOINT
// // ============================================
// app.get('/api/test', async (req, res) => {
//   try {
//     const scraperHealth = scraperService.getHealthStatus();
//     const groqHealth = groqService.getHealthStatus();

//     let mongoConnected = false;
//     try {
//       await mongoService.connect();
//       mongoConnected = true;
//     } catch (err) {
//       mongoConnected = false;
//     }

//     res.json({
//       status: 'ok',
//       services: {
//         scraper: scraperHealth,
//         groq: groqHealth,
//         mongodb: {
//           configured: !!process.env.MONGODB_URI,
//           connected: mongoConnected
//         }
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     res.status(500).json({
//       error: error.message
//     });
//   }
// });

// // ============================================
// // ERROR HANDLERS
// // ============================================
// app.use((req, res) => {
//   res.status(404).json({
//     error: 'Not found',
//     path: req.path
//   });
// });

// app.use((err, req, res, next) => {
//   console.error('❌ Unhandled error:', err.message);
//   res.status(500).json({
//     error: 'Internal server error',
//     message: err.message
//   });
// });

// // ============================================
// // START SERVER
// // ============================================
// app.listen(PORT, () => {
//   console.log('\n🚀 ========================================');
//   console.log('  SCHOLARSHIP SCRAPER API');
//   console.log('========================================');
//   console.log(`📍 Port: ${PORT}`);
//   console.log(`🌍 URL: http://localhost:${PORT}`);
//   console.log(`⏰ Started: ${new Date().toISOString()}`);
//   console.log('\n📋 Endpoints:');
//   console.log(`  GET  / - API info`);
//   console.log(`  GET  /health - Health check`);
//   console.log(`  POST /api/scrape - Trigger scraping`);
//   console.log(`  GET  /api/scholarships - Get scholarships`);
//   console.log(`  GET  /api/scholarship/:id - Get single scholarship`);
//   console.log(`  GET  /api/stats - Get statistics`);
//   console.log(`  GET  /api/debug/ids - List scholarship IDs (debug)`);
//   console.log(`  GET  /api/test - Test all services`);
//   console.log('========================================\n');
// });

// // Graceful shutdown
// process.on('SIGTERM', async () => {
//   console.log('🛑 SIGTERM received, closing...');
//   await mongoService.close();
//   process.exit(0);
// });

// module.exports = app;




require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const mongoService = require('./services/mongoService');
const getDb = () => mongoService.db;
//const mongoService = require('./services/mongoService');
const { fetchAllDueGroups, addGroup, toggleGroup, removeGroup, listGroups, seedDefaultGroups } = require('./services/whatsappSourceService');
const { processUnprocessedPosts, getNextUnpublished, markPublished, trackClick, getBySlug, bufferCount } = require('./services/groqRewriteService');
const { register, login, requireAuth, requirePlan, verifyAndUpgrade, getUserById } = require('./services/authService');
const { discoverProfessors, getProfessorsForUser } = require('./services/professorSearchService');
const { generateEmailsForUser, getEmailQueue, approveEmail, editEmail, skipEmail, generateResearchProposal, extractKeywords } = require('./services/emailGenerationService');
const { sendApprovedEmails, scheduleFollowUps, detectReplies, runDailySendCycle } = require('./services/followUpService');
const { getAuthUrl, handleCallback, disconnectGmail } = require('./services/gmailOAuthService');

// ── WhatsApp broadcast sender ─────────────────────────────────────────────────
const axios = require('axios');
const WAHA_BASE    = process.env.WAHA_BASE_URL  || 'http://localhost:3000';
const WAHA_KEY     = process.env.WAHA_API_KEY   || '';
const WAHA_SESSION = process.env.WAHA_SESSION   || 'scholarbroad';
const BROADCAST_GROUP = process.env.BROADCAST_GROUP_ID;

async function sendToGroup(text) {
  await axios.post(
    `${WAHA_BASE}/api/sendText`,
    { chatId: BROADCAST_GROUP, text, session: WAHA_SESSION },
    { headers: { 'Content-Type': 'application/json', ...(WAHA_KEY ? { 'X-Api-Key': WAHA_KEY } : {}) } }
  );
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload (CV) — store in memory, upload to R2/GridFS
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Admin auth middleware ─────────────────────────────────────────────────────
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'changeme';
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-secret'] || req.query.secret;
  if (token !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get('/subscribe', (req, res) => res.sendFile(path.join(__dirname, '../public/subscribe.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin-dashboard.html')));

// ── Scholarship landing page (/s/:slug) ───────────────────────────────────────
app.get('/s/:slug', async (req, res) => {
  try {
    const scholarship = await getBySlug(req.params.slug);
    if (!scholarship) return res.status(404).sendFile(path.join(__dirname, './public/404.html'));
    const fs = require('fs');
    const html = fs.readFileSync(path.join(__dirname, './public/scholarship-landing.html'), 'utf8');
    const injected = html.replace(
      '</head>',
      `<script>window.__SCHOLARSHIP__ = ${JSON.stringify(scholarship)};</script></head>`
    );
    res.send(injected);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// ── Click tracking ────────────────────────────────────────────────────────────
app.post('/api/track-click', async (req, res) => {
  const { slug, type } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  await trackClick(slug, type || 'official_link');
  res.json({ ok: true });
});

// ── Deadline reminder email capture ───────────────────────────────────────────
app.post('/api/reminders', async (req, res) => {
  const { email, slug, deadline } = req.body;
  if (!email || !slug) return res.status(400).json({ error: 'email and slug required' });
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  await db.collection('reminders').updateOne(
    { email, slug },
    { $set: { email, slug, deadline, createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await register(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await login(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ── Gmail OAuth flow ──────────────────────────────────────────────────────────
app.get('/api/auth/gmail', requireAuth, (req, res) => {
  const url = getAuthUrl(req.user.userId);
  res.redirect(url);
});

app.get('/api/auth/gmail/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    await handleCallback(code, userId);
    res.redirect('/dashboard?gmail=connected');
  } catch (err) {
    res.redirect('/dashboard?gmail=error');
  }
});

app.post('/api/auth/gmail/disconnect', requireAuth, async (req, res) => {
  await disconnectGmail(req.user.userId);
  res.json({ ok: true });
});

// ── Payment verification ───────────────────────────────────────────────────────
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { reference, plan, ...profileData } = req.body;

    // For free plan — just register
    if (!reference || plan === 'free') {
      const result = await register({ ...profileData, plan: 'free' });
      return res.json({ ok: true, ...result });
    }

    // Register user first
    const result = await register({ ...profileData, plan, paystackReference: reference });

    // Verify payment with Paystack
    await verifyAndUpgrade({ reference, userId: result.userId, plan });

    // Kick off PhD pipeline automatically for PhD applicants on paid plans
    if (profileData.degree === 'PhD' && ['scholar','pro','agency'].includes(plan)) {
      kickOffPhDPipeline(result.userId, profileData).catch(console.error);
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Async PhD pipeline kickoff (runs in background after registration) ─────────
async function kickOffPhDPipeline(userId, profileData) {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  try {
    console.log(`[Pipeline] Starting PhD pipeline for user ${userId}`);

    // 1. Generate research proposal
    const proposal = await generateResearchProposal(
      profileData.researchInterest,
      profileData.field,
      ''
    );

    // 2. Extract keywords for professor search
    const keywords = await extractKeywords(profileData.researchInterest, profileData.field);

    // 3. Save proposal + keywords to profile
    await db.collection('user_profiles').updateOne(
      { userId },
      { $set: { researchProposal: proposal, researchKeywords: keywords } }
    );

    // 4. Discover professors
    await discoverProfessors(userId, keywords, profileData.country);

    // 5. Generate emails for all discovered professors
    await generateEmailsForUser(userId);

    console.log(`[Pipeline] ✓ PhD pipeline complete for user ${userId}`);

    // 6. Notify user pipeline is ready
    await db.collection('notifications').insertOne({
      userId,
      type: 'pipeline_ready',
      message: '🎉 Your professor emails are ready! Go to Email Queue to review and approve.',
      read: false,
      createdAt: new Date()
    });

  } catch (err) {
    console.error(`[Pipeline] Error for user ${userId}:`, err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// USER ROUTES (authenticated)
// ════════════════════════════════════════════════════════════════════════════

// ── Profile ───────────────────────────────────────────────────────────────────
app.get('/api/user/profile', requireAuth, async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
  const user = await getUserById(req.user.userId);
  res.json({ ...user, profile });
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  await db.collection('user_profiles').updateOne(
    { userId: req.user.userId },
    { $set: { ...req.body, updatedAt: new Date() } }
  );
  res.json({ ok: true });
});

// ── CV Upload ─────────────────────────────────────────────────────────────────
app.post('/api/user/cv-upload', requireAuth, upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    // In production: upload to Cloudflare R2 or MongoDB GridFS
    // For now: store as base64 in DB (replace with R2 for production)
    const { getDb } = require('./services/mongoService');
    const db = getDb();
    const cvBase64 = req.file.buffer.toString('base64');
    await db.collection('user_profiles').updateOne(
      { userId: req.user.userId },
      { $set: {
        cvPath: `cv_${req.user.userId}`,
        cvFilename: req.file.originalname,
        cvMimeType: req.file.mimetype,
        cvData: cvBase64, // Move to R2 in production
        cvUploadedAt: new Date()
      }}
    );
    res.json({ ok: true, filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/user/dashboard-stats', requireAuth, async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  const userId = req.user.userId;
  const [totalProfs, emailsSent, replies, pendingApproval, notifications] = await Promise.all([
    db.collection('professor_targets').countDocuments({ userId }),
    db.collection('email_queue').countDocuments({ userId, status: 'sent' }),
    db.collection('professor_targets').countDocuments({ userId, status: 'replied' }),
    db.collection('email_queue').countDocuments({ userId, status: 'pending_review' }),
    db.collection('notifications').find({ userId, read: false }).sort({ createdAt: -1 }).limit(10).toArray()
  ]);
  res.json({ totalProfs, emailsSent, replies, pendingApproval, notifications });
});

// ── Professors ────────────────────────────────────────────────────────────────
app.get('/api/user/professors', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  const result = await getProfessorsForUser(req.user.userId, req.query);
  res.json(result);
});

// ── Re-run professor discovery ─────────────────────────────────────────────────
app.post('/api/user/discover-professors', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
  if (!profile) return res.status(400).json({ error: 'Profile not found' });

  // Run in background
  discoverProfessors(req.user.userId, profile.researchKeywords || [], profile.targetCountry)
    .then(() => generateEmailsForUser(req.user.userId))
    .catch(console.error);

  res.json({ ok: true, message: 'Professor discovery started — check back in a few minutes' });
});

// ── Email queue ───────────────────────────────────────────────────────────────
app.get('/api/user/email-queue', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  const emails = await getEmailQueue(req.user.userId, req.query.status || null);
  res.json(emails);
});

app.post('/api/user/email-queue/:id/approve', requireAuth, async (req, res) => {
  await approveEmail(req.params.id, req.user.userId);
  res.json({ ok: true });
});

app.post('/api/user/email-queue/:id/edit', requireAuth, async (req, res) => {
  await editEmail(req.params.id, req.user.userId, req.body);
  res.json({ ok: true });
});

app.post('/api/user/email-queue/:id/skip', requireAuth, async (req, res) => {
  await skipEmail(req.params.id, req.user.userId);
  res.json({ ok: true });
});

// ── Approve all pending emails ────────────────────────────────────────────────
app.post('/api/user/email-queue/approve-all', requireAuth, requirePlan('pro','agency'), async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  await db.collection('email_queue').updateMany(
    { userId: req.user.userId, status: 'pending_review' },
    { $set: { status: 'approved', approvedAt: new Date() } }
  );
  res.json({ ok: true });
});

// ── Mark notification as read ─────────────────────────────────────────────────
app.post('/api/user/notifications/:id/read', requireAuth, async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  const { ObjectId } = require('mongodb');
  await db.collection('notifications').updateOne(
    { _id: new ObjectId(req.params.id), userId: req.user.userId },
    { $set: { read: true } }
  );
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// CRON ROUTES (called by Cloudflare Worker)
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/cron/fetch-groups', adminAuth, async (req, res) => {
  try {
    const fetch = await fetchAllDueGroups();
    const processed = await processUnprocessedPosts();
    res.json({ ok: true, fetch, processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/daily-post', adminAuth, async (req, res) => {
  try {
    const next = await getNextUnpublished();
    if (!next) return res.json({ ok: true, message: 'Buffer empty' });
    await sendToGroup(next.whatsappText);
    await markPublished(next.slug);
    res.json({ ok: true, posted: next.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/process-posts', adminAuth, async (req, res) => {
  try {
    const result = await processUnprocessedPosts();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── [CRON] Daily email send cycle for all users ────────────────────────────────
app.post('/api/cron/daily-email-cycle', adminAuth, async (req, res) => {
  try {
    await runDailySendCycle();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── [CRON] Check for professor replies ────────────────────────────────────────
app.post('/api/cron/check-replies', adminAuth, async (req, res) => {
  try {
    const { getDb } = require('./services/mongoService');
    const db = getDb();
    const users = await db.collection('users').find({
      plan: { $in: ['scholar','pro','agency'] },
      gmailConnected: true
    }).toArray();
    for (const user of users) {
      await detectReplies(user._id.toString()).catch(console.error);
    }
    res.json({ ok: true, checked: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/groups', adminAuth, async (req, res) => res.json(await listGroups()));
app.post('/api/admin/groups', adminAuth, async (req, res) => {
  try { await addGroup(req.body); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/admin/groups/:id', adminAuth, async (req, res) => {
  await toggleGroup(decodeURIComponent(req.params.id), req.body.active);
  res.json({ ok: true });
});
app.delete('/api/admin/groups/:id', adminAuth, async (req, res) => {
  await removeGroup(decodeURIComponent(req.params.id));
  res.json({ ok: true });
});

// app.post('/api/admin/fetch-now', adminAuth, async (req, res) => {
//   try {
//     const fetch = await fetchAllDueGroups();
//     const processed = await processUnprocessedPosts();
//     res.json({ ok: true, fetch, processed });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });
app.post('/api/admin/fetch-now', adminAuth, async (req, res) => {
  try {
    const force = req.body?.forceAll === true;
    const fetch = await fetchAllDueGroups(force);
    const processed = await processUnprocessedPosts();
    res.json({ ok: true, fetch, processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  const [buffer, totalGroups, totalUsers, totalPublished, totalPaidUsers] = await Promise.all([
    bufferCount(),
    db.collection('whatsapp_groups').countDocuments(),
    db.collection('users').countDocuments(),
    db.collection('scholarships').countDocuments({ published: true }),
    db.collection('users').countDocuments({ plan: { $in: ['scholar','pro','agency'] } })
  ]);
  res.json({ buffer, totalGroups, totalUsers, totalPublished, totalPaidUsers });
});

app.get('/api/admin/scholarships', adminAuth, async (req, res) => {
  const { getDb } = require('./services/mongoService');
  const db = getDb();
  const page = parseInt(req.query.page || '1');
  const scholarships = await db.collection('scholarships')
    .find({}).sort({ createdAt: -1 }).skip((page-1)*20).limit(20).toArray();
  res.json(scholarships);
});

app.post('/api/admin/post-now/:slug', adminAuth, async (req, res) => {
  const scholarship = await getBySlug(req.params.slug);
  if (!scholarship) return res.status(404).json({ error: 'Not found' });
  await sendToGroup(scholarship.whatsappText);
  await markPublished(scholarship.slug);
  res.json({ ok: true, posted: scholarship.title });
});

// ════════════════════════════════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3001;
mongoService.connect().then(async () => {
  await seedDefaultGroups();
  app.listen(PORT, () => console.log(`[Server] ScholarBroad running on port ${PORT}`));
}).catch(err => {
  console.error('[DB] Connection failed:', err.message);
  process.exit(1);
});
