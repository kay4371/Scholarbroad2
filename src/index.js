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
    version: '1.0.0',
    endpoints: {
      health: '/health',
      scrape: 'POST /api/scrape',
      scholarships: 'GET /api/scholarships',
      scholarshipDetail: 'GET /api/scholarship/:id',
      stats: 'GET /api/stats',
      test: 'GET /api/test'
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

// ============================================
// SCRAPE ENDPOINT
// ============================================
app.post('/api/scrape', async (req, res) => {
  try {
    console.log('\n🚀 ========================================');
    console.log('   SCRAPE REQUEST RECEIVED');
    console.log('========================================');
    console.log(`⏰ Time: ${new Date().toISOString()}`);
    console.log(`📍 From: ${req.headers['user-agent'] || 'Unknown'}\n`);
    
    console.log('🔍 Starting scholarship scraper...');
    const scholarships = await scraperService.scrapeAll();
    console.log(`✅ Scraped ${scholarships.length} scholarships`);
    
    console.log('\n💾 Saving to MongoDB...');
    await mongoService.saveScholarships(scholarships);
    console.log('✅ Saved to database');
    
    const stats = await mongoService.getStats();
    
    console.log('\n📊 Database Stats:');
    console.log(`   Total scholarships: ${stats?.total || 0}`);
    console.log(`   Countries: ${stats?.countries || 0}`);
    console.log(`   Fully funded: ${stats?.fullyFunded || 0}`);
    
    console.log('\n========================================');
    console.log('   SCRAPE COMPLETED SUCCESSFULLY');
    console.log('========================================\n');
    
    res.json({
      success: true,
      count: scholarships.length,
      timestamp: new Date().toISOString(),
      stats: stats,
      scholarships: scholarships.slice(0, 10)
    });
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('   SCRAPE FAILED');
    console.error('========================================');
    console.error(`Error: ${error.message}`);
    console.error('========================================\n');
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
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
// Add this to your server.js
app.get('/api/debug/ids', async (req, res) => {
  try {
    const ids = await mongoService.listAllIds(20);
    res.json({
      success: true,
      count: ids.length,
      ids
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
