require('dotenv').config();
const mongoService = require('./src/services/mongoService');

async function testConnection() {
  try {
    console.log('🧪 Testing MongoDB Connection...\n');
    
    // Test connection
    console.log('1️⃣ Connecting to MongoDB...');
    await mongoService.connect();
    console.log('   ✅ Connected successfully!\n');
    
    // Test saving
    console.log('2️⃣ Testing save operation...');
    const testScholarship = [{
      title: 'Test Scholarship 2025 - ' + Date.now(),
      university: 'Test University',
      country: 'USA',
      funding: 'Fully Funded',
      deadline: 'December 31, 2025',
      url: 'https://example.com/test',
      level: 'Masters',
      source: 'Test'
    }];
    
    await mongoService.saveScholarships(testScholarship);
    console.log('   ✅ Save successful!\n');
    
    // Test retrieving
    console.log('3️⃣ Testing retrieve operation...');
    const scholarships = await mongoService.getLatestScholarships(5);
    console.log(`   ✅ Retrieved ${scholarships.length} scholarships\n`);
    
    // Show sample
    if (scholarships.length > 0) {
      console.log('📋 Sample scholarship:');
      console.log(JSON.stringify(scholarships[0], null, 2));
    }
    
    // Get stats
    console.log('\n4️⃣ Getting database stats...');
    const stats = await mongoService.getStats();
    console.log('   ✅ Stats retrieved:');
    console.log(JSON.stringify(stats, null, 2));
    
    await mongoService.close();
    console.log('\n✅ All tests passed!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testConnection();