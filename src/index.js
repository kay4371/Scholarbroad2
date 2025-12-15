require('dotenv').config();
const express = require('express');
const scraperService = require('./services/scraperService');
const mongoService = require('./services/mongoService');
const groqService = require('./services/groqService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============================================
// ROOT ROUTE
// ============================================
app.get('/', (req, res) => {
  res.json({
    message: 'ScholaBroad Scholarship API',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      scrape: 'POST /api/scrape',
      scholarships: 'GET /api/scholarships',
      scholarshipDetail: 'GET /api/scholarship/:id',
      stats: 'GET /api/stats',
      test: 'GET /api/test',
      debugIds: 'GET /api/debug/ids'
    },
    documentation: 'https://github.com/kay4371/Scholarbroad2'
  });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'Scholarship Scraper API',
    timestamp: new Date().toISOString(),
    mongodb: !!process.env.MONGODB_URI
  });
});

/**
 * NEW: Get fresh unposted scholarships for WhatsApp
 * This is the KEY endpoint to prevent duplicates!
 */
app.post('/api/get-unposted', async (req, res) => {
  try {
    console.log('\n🔍 ========================================');
    console.log('   FETCHING UNPOSTED SCHOLARSHIPS');
    console.log('========================================\n');

    const limit = req.body.limit || 3;
    const includeReminders = req.body.includeReminders !== false; // Default true

    // Get fresh unposted scholarships
    const freshScholarships = await mongoService.getFreshUnpostedScholarships(limit);
    
    let reminderScholarships = [];
    if (includeReminders) {
      // Get scholarships needing deadline reminders
      reminderScholarships = await mongoService.getScholarshipsNeedingReminder();
    }

    // Combine: fresh scholarships + max 1 reminder
    const scholarshipsToPost = [
      ...freshScholarships,
      ...(reminderScholarships.length > 0 ? [reminderScholarships[0]] : [])
    ].slice(0, limit);

    console.log(`\n📊 Results:`);
    console.log(`   Fresh: ${freshScholarships.length}`);
    console.log(`   Reminders: ${reminderScholarships.length}`);
    console.log(`   To Post: ${scholarshipsToPost.length}`);
    console.log('========================================\n');

    res.json({
      success: true,
      scholarships: scholarshipsToPost,
      count: scholarshipsToPost.length,
      breakdown: {
        fresh: freshScholarships.length,
        reminders: reminderScholarships.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching unposted:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      scholarships: [],
      count: 0
    });
  }
});

/**
 * NEW: Mark scholarships as posted
 */
app.post('/api/mark-posted', async (req, res) => {
  try {
    const { scholarshipIds } = req.body;

    if (!scholarshipIds || !Array.isArray(scholarshipIds)) {
      return res.status(400).json({
        success: false,
        error: 'scholarshipIds array required'
      });
    }

    console.log(`\n✅ Marking ${scholarshipIds.length} scholarships as posted...`);

    const results = [];
    for (const id of scholarshipIds) {
      const success = await mongoService.markAsPosted(id);
      results.push({ id, success });
    }

    const successCount = results.filter(r => r.success).length;

    console.log(`   Success: ${successCount}/${scholarshipIds.length}\n`);

    res.json({
      success: true,
      marked: successCount,
      total: scholarshipIds.length,
      results: results
    });

  } catch (error) {
    console.error('❌ Error marking as posted:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * NEW: Get posting statistics
 */
app.get('/api/posting-stats', async (req, res) => {
  try {
    const stats = await mongoService.getPostingStats();
    
    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * UPDATED: Scrape endpoint now saves to MongoDB automatically
 */
app.post('/api/scrape', async (req, res) => {
  try {
    console.log('\n🎯 ========================================');
    console.log('   STARTING SCHOLARSHIP SCRAPING');
    console.log('========================================\n');

    // Scrape scholarships
    const scholarships = await scraperService.scrapeAll();

    // Save to MongoDB (with deduplication)
    const saveResult = await mongoService.saveScholarships(scholarships);

    // Cleanup old posted records
    await mongoService.cleanupOldPostedRecords();

    console.log('\n✅ Scraping and saving completed\n');

    res.json({
      success: true,
      count: scholarships.length,
      scholarships: scholarships,
      saved: {
        new: saveResult.insertedCount,
        updated: saveResult.modifiedCount,
        errors: saveResult.errorCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      count: 0,
      scholarships: []
    });
  }
});
// ==========================================
// DATA MIGRATION ENDPOINT
// Add this to your Express routes
// ==========================================

/**
 * POST /api/migrate-data
 * Manually trigger data migration to add normalized fields
 */
app.post('/api/migrate-data', async (req, res) => {
  try {
    console.log('\n🔄 Starting manual data migration...\n');
    
    await mongoService.connect();
    await mongoService.migrateExistingData();
    
    const stats = await mongoService.getPostingStats();
    
    res.json({
      success: true,
      message: 'Data migration completed successfully',
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/migration-status
 * Check how many records need migration
 */
app.get('/api/migration-status', async (req, res) => {
  try {
    await mongoService.connect();
    
    const total = await mongoService.collection.countDocuments();
    const needsMigration = await mongoService.collection.countDocuments({
      $or: [
        { normalizedUrl: { $exists: false } },
        { normalizedUrl: null },
        { titleFingerprint: { $exists: false } }
      ]
    });
    const migrated = total - needsMigration;
    
    res.json({
      success: true,
      total,
      migrated,
      needsMigration,
      percentComplete: total > 0 ? ((migrated / total) * 100).toFixed(2) : 100,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ============================================
// GET SINGLE SCHOLARSHIP BY ID
// ============================================
app.get('/api/scholarship/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📖 Fetching scholarship with ID: ${id}`);
    
    const scholarship = await mongoService.getScholarshipById(id);
    
    if (!scholarship) {
      return res.status(404).json({ 
        success: false,
        error: 'Scholarship not found' 
      });
    }
    
    res.json({
      success: true,
      scholarship
    });
    
  } catch (error) {
    console.error('❌ Error fetching scholarship:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch scholarship' 
    });
  }
});


/**
 * POST /api/cleanup-duplicates
 * Scans database and merges duplicate scholarships
 */
app.post('/api/cleanup-duplicates', async (req, res) => {
  try {
    console.log('\n🧹 Starting duplicate cleanup process...\n');
    
    const mergedCount = await mongoService.findAndMergeDuplicates();
    
    const stats = await mongoService.getPostingStats();
    
    res.json({
      success: true,
      message: 'Duplicate cleanup completed',
      results: {
        duplicatesRemoved: mergedCount,
        currentStats: stats
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/check-duplicates
 * Returns information about potential duplicates without deleting
 */
app.get('/api/check-duplicates', async (req, res) => {
  try {
    await mongoService.connect();
    
    // Find potential duplicates by title fingerprint
    const duplicates = await mongoService.collection.aggregate([
      { $match: { titleFingerprint: { $exists: true, $ne: null } } },
      { 
        $group: { 
          _id: '$titleFingerprint', 
          count: { $sum: 1 },
          titles: { $push: '$title' },
          ids: { $push: '$id' }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]).toArray();
    
    res.json({
      success: true,
      duplicateGroups: duplicates.length,
      totalDuplicates: duplicates.reduce((sum, g) => sum + g.count - 1, 0),
      examples: duplicates.slice(0, 10).map(g => ({
        count: g.count,
        titles: g.titles,
        ids: g.ids
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * POST /api/rebuild-indexes
 * Forcefully drops all indexes and rebuilds them correctly
 * Use this when indexes are in a bad state
 */
app.post('/api/rebuild-indexes', async (req, res) => {
  try {
    console.log('\n🔨 Force rebuilding indexes...\n');
    
    await mongoService.connect();
    
    // Get all current indexes
    const indexes = await mongoService.collection.indexes();
    console.log('📋 Current indexes:', indexes.map(i => i.name));
    
    // Drop all indexes except _id (which can't be dropped)
    const indexesToDrop = indexes
      .map(i => i.name)
      .filter(name => name !== '_id_');
    
    console.log('\n🗑️  Dropping indexes:', indexesToDrop);
    
    for (const indexName of indexesToDrop) {
      try {
        await mongoService.collection.dropIndex(indexName);
        console.log(`   ✅ Dropped: ${indexName}`);
      } catch (error) {
        console.log(`   ⚠️  Could not drop ${indexName}: ${error.message}`);
      }
    }
    
    console.log('\n🔄 Verifying all records have normalized fields...');
    
    // Double-check migration
    const needsNormalization = await mongoService.collection.countDocuments({
      $or: [
        { normalizedUrl: { $exists: false } },
        { normalizedUrl: null }
      ]
    });
    
    if (needsNormalization > 0) {
      console.log(`⚠️  Found ${needsNormalization} records still needing normalization`);
      console.log('🔄 Running migration again...');
      await mongoService.migrateExistingData();
    } else {
      console.log('✅ All records have normalized fields');
    }
    
    console.log('\n🏗️  Creating new indexes...\n');
    
    // Create indexes with proper configuration
    try {
      await mongoService.collection.createIndex(
        { normalizedUrl: 1 }, 
        { 
          unique: true, 
          name: 'unique_normalized_url',
          partialFilterExpression: { 
            normalizedUrl: { $exists: true, $ne: null, $type: 'string' } 
          }
        }
      );
      console.log('   ✅ Created: unique_normalized_url (with partial filter)');
    } catch (error) {
      console.error('   ❌ Failed to create unique_normalized_url:', error.message);
      throw error;
    }

    try {
      await mongoService.collection.createIndex(
        { id: 1 }, 
        { 
          unique: true, 
          name: 'unique_short_id',
          partialFilterExpression: { 
            id: { $exists: true, $ne: null, $type: 'string' } 
          }
        }
      );
      console.log('   ✅ Created: unique_short_id (with partial filter)');
    } catch (error) {
      console.error('   ❌ Failed to create unique_short_id:', error.message);
    }

    try {
      await mongoService.collection.createIndex(
        { titleFingerprint: 1 }, 
        { 
          sparse: true, 
          name: 'title_fingerprint_index' 
        }
      );
      console.log('   ✅ Created: title_fingerprint_index (sparse)');
    } catch (error) {
      console.error('   ❌ Failed to create title_fingerprint_index:', error.message);
    }

    try {
      await mongoService.collection.createIndex(
        { posted: 1, scrapedAt: -1 }, 
        { name: 'posting_query_index' }
      );
      console.log('   ✅ Created: posting_query_index');
    } catch (error) {
      console.error('   ❌ Failed to create posting_query_index:', error.message);
    }
    
    // Get final index list
    const finalIndexes = await mongoService.collection.indexes();
    
    console.log('\n📋 Final indexes:', finalIndexes.map(i => i.name));
    console.log('\n✅ Index rebuild complete!\n');
    
    res.json({
      success: true,
      message: 'Indexes rebuilt successfully',
      droppedIndexes: indexesToDrop,
      currentIndexes: finalIndexes.map(i => ({
        name: i.name,
        key: i.key,
        unique: i.unique || false,
        sparse: i.sparse || false,
        partialFilterExpression: i.partialFilterExpression || null
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Index rebuild failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});
/**
 * GET /api/index-status
 * Check current index status
 */
app.get('/api/index-status', async (req, res) => {
  try {
    await mongoService.connect();
    
    const indexes = await mongoService.collection.indexes();
    const stats = await mongoService.collection.stats();
    
    // Check for records with null normalized fields
    const nullNormalized = await mongoService.collection.countDocuments({
      $or: [
        { normalizedUrl: null },
        { normalizedUrl: { $exists: false } }
      ]
    });
    
    const nullIds = await mongoService.collection.countDocuments({
      $or: [
        { id: null },
        { id: { $exists: false } }
      ]
    });
    
    res.json({
      success: true,
      indexes: indexes.map(i => ({
        name: i.name,
        key: i.key,
        unique: i.unique || false,
        sparse: i.sparse || false,
        partialFilterExpression: i.partialFilterExpression || null
      })),
      stats: {
        totalDocuments: stats.count,
        nullNormalizedUrl: nullNormalized,
        nullIds: nullIds,
        dataHealthy: nullNormalized === 0 && nullIds === 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Index status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// GET SCHOLARSHIPS
// ============================================
app.get('/api/scholarships', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    console.log(`📦 Fetching ${limit} latest scholarships from MongoDB...`);
    
    const scholarships = await mongoService.getLatestScholarships(limit);
    
    res.json({
      success: true,
      count: scholarships.length,
      scholarships,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// GET STATS
// ============================================
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await mongoService.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// DEBUG: LIST ALL IDS
// ============================================
app.get('/api/debug/ids', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    console.log(`🔍 Fetching ${limit} scholarship IDs for debugging...`);
    
    const ids = await mongoService.listAllIds(limit);
    
    res.json({
      success: true,
      count: ids.length,
      ids,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching IDs:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// TEST ENDPOINT
// ============================================
app.get('/api/test', async (req, res) => {
  try {
    const scraperHealth = scraperService.getHealthStatus();
    const groqHealth = groqService.getHealthStatus();
    
    let mongoConnected = false;
    try {
      await mongoService.connect();
      mongoConnected = true;
    } catch (err) {
      mongoConnected = false;
    }
    
    res.json({
      status: 'ok',
      services: {
        scraper: scraperHealth,
        groq: groqHealth,
        mongodb: {
          configured: !!process.env.MONGODB_URI,
          connected: mongoConnected
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// ============================================
// ERROR HANDLERS
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path 
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('\n🚀 ========================================');
  console.log('   SCHOLARSHIP SCRAPER API');
  console.log('========================================');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 URL: http://localhost:${PORT}`);
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log('\n📋 Endpoints:');
  console.log(`   GET  /                    - API info`);
  console.log(`   GET  /health              - Health check`);
  console.log(`   POST /api/scrape          - Trigger scraping`);
  console.log(`   GET  /api/scholarships    - Get scholarships`);
  console.log(`   GET  /api/scholarship/:id - Get single scholarship`);
  console.log(`   GET  /api/stats           - Get statistics`);
  console.log(`   GET  /api/debug/ids       - List scholarship IDs (debug)`);
  console.log(`   GET  /api/test            - Test all services`);
  console.log('========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing...');
  await mongoService.close();
  process.exit(0);
});

module.exports = app;
