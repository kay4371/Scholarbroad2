const { MongoClient } = require('mongodb');

class MongoService {
  constructor() {
    this.client = null;
    this.db = null;
    
    this.uri = process.env.MONGODB_URI || 
      'mongodb+srv://OlukayodeUser:Kayode4371@cluster0.zds6pi9.mongodb.net/scholarships_db?retryWrites=true&w=majority';
  }

  // Generate the SAME short ID as Cloudflare Worker
  generateShortId(url) {
    if (!url) return 'unknown';
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  async connect() {
    if (this.client) return this.db;
    
    try {
      console.log('🔌 Connecting to MongoDB...');
      
      this.client = new MongoClient(this.uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db('scholarships_db');
      
      // Create index on custom 'id' field for fast lookups
      await this.db.collection('scholarships').createIndex({ id: 1 }, { unique: true, sparse: true });
      
      console.log('✅ MongoDB connected to scholarships_db');
      return this.db;
      
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async getDb() {
    if (!this.db) {
      await this.connect();
    }
    return this.db;
  }

  // FIXED: Get scholarship by ID
  async getScholarshipById(id) {
    try {
      const db = await this.getDb();
      
      console.log(`🔍 Looking for scholarship with ID: ${id}`);
      
      // Find by our custom 'id' field (the hash-based ID)
      let scholarship = await db.collection('scholarships').findOne({ id: id });
      
      if (scholarship) {
        console.log(`✅ Found: ${scholarship.title}`);
        return scholarship;
      }
      
      // Fallback: Try MongoDB's _id if the custom id doesn't exist
      const { ObjectId } = require('mongodb');
      if (ObjectId.isValid(id)) {
        scholarship = await db.collection('scholarships').findOne({ 
          _id: new ObjectId(id) 
        });
        
        if (scholarship) {
          console.log(`✅ Found by MongoDB _id: ${scholarship.title}`);
          return scholarship;
        }
      }
      
      console.log(`❌ Scholarship not found: ${id}`);
      return null;
      
    } catch (error) {
      console.error('❌ Error getting scholarship by ID:', error);
      throw error;
    }
  }

  // FIXED: Save scholarships with generated IDs
  async saveScholarships(scholarships) {
    try {
      const db = await this.connect();
      const collection = db.collection('scholarships');
      
      if (!scholarships || scholarships.length === 0) {
        console.log('⚠️ No scholarships to save');
        return { insertedCount: 0, modifiedCount: 0 };
      }

      console.log(`💾 Processing ${scholarships.length} scholarships...`);
      
      let savedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      for (const scholarship of scholarships) {
        try {
          if (!scholarship.url) {
            console.log('⚠️ Skipping scholarship without URL');
            errorCount++;
            continue;
          }

          // Generate consistent ID from URL (matches Cloudflare Worker!)
          const id = this.generateShortId(scholarship.url);
          
          // Prepare document with custom ID
          const scholarshipDoc = {
            id: id, // THIS IS THE KEY!
            title: scholarship.title,
            url: scholarship.url,
            university: scholarship.university,
            country: scholarship.country,
            level: scholarship.level,
            funding: scholarship.funding || scholarship.fundingType,
            fundingType: scholarship.fundingType || scholarship.funding,
            amount: scholarship.amount,
            deadline: scholarship.deadline || scholarship.applicationDeadline,
            applicationDeadline: scholarship.applicationDeadline || scholarship.deadline,
            program: scholarship.program,
            description: scholarship.description || scholarship.snippet,
            snippet: scholarship.snippet,
            requirements: scholarship.requirements,
            source: scholarship.source,
            relevanceScore: scholarship.relevanceScore,
            trending: scholarship.trending,
            urgency: scholarship.urgency,
            searchQuery: scholarship.searchQuery,
            scrapedAt: new Date(),
            updatedAt: new Date(),
            isActive: true
          };

          // Upsert (insert or update based on custom 'id' field)
          const result = await collection.updateOne(
            { id: id },
            { 
              $set: scholarshipDoc,
              $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
          );

          if (result.upsertedCount > 0) {
            savedCount++;
            console.log(`  ✅ Saved: ${scholarship.title.substring(0, 50)}... (ID: ${id})`);
          } else if (result.modifiedCount > 0) {
            updatedCount++;
            console.log(`  ♻️ Updated: ${scholarship.title.substring(0, 50)}... (ID: ${id})`);
          }

        } catch (error) {
          errorCount++;
          console.error(`  ❌ Error saving scholarship: ${error.message}`);
        }
      }

      // Clean up old scholarships (older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deleteResult = await collection.deleteMany({
        scrapedAt: { $lt: sevenDaysAgo }
      });
      
      if (deleteResult.deletedCount > 0) {
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} old scholarships`);
      }

      console.log(`\n📊 Save Summary:`);
      console.log(`   New: ${savedCount}`);
      console.log(`   Updated: ${updatedCount}`);
      console.log(`   Errors: ${errorCount}`);
      console.log(`   Total processed: ${scholarships.length}`);
      
      return { 
        insertedCount: savedCount, 
        modifiedCount: updatedCount,
        errorCount: errorCount
      };
      
    } catch (error) {
      console.error('❌ Error saving scholarships:', error.message);
      throw error;
    }
  }

  async getLatestScholarships(limit = 30) {
    try {
      const db = await this.connect();
      const collection = db.collection('scholarships');
      
      const scholarships = await collection
        .find({ isActive: true })
        .sort({ scrapedAt: -1 })
        .limit(limit)
        .toArray();

      console.log(`📦 Retrieved ${scholarships.length} scholarships from MongoDB`);
      return scholarships;
      
    } catch (error) {
      console.error('❌ Error fetching scholarships:', error.message);
      throw error;
    }
  }

  async getScholarshipsByCountry(country, limit = 10) {
    try {
      const db = await this.connect();
      const collection = db.collection('scholarships');
      
      const scholarships = await collection
        .find({ 
          isActive: true,
          country: country 
        })
        .sort({ scrapedAt: -1 })
        .limit(limit)
        .toArray();

      return scholarships;
      
    } catch (error) {
      console.error('❌ Error fetching scholarships by country:', error.message);
      return [];
    }
  }

  async getStats() {
    try {
      const db = await this.connect();
      const collection = db.collection('scholarships');
      
      const totalScholarships = await collection.countDocuments({ isActive: true });
      const totalCountries = await collection.distinct('country', { isActive: true });
      const fullyFunded = await collection.countDocuments({ 
        isActive: true,
        $or: [
          { funding: 'Fully Funded' },
          { fundingType: 'Fully Funded' }
        ]
      });

      return {
        total: totalScholarships,
        countries: totalCountries.length,
        fullyFunded: fullyFunded,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error fetching stats:', error.message);
      return null;
    }
  }

  // Debug helper: List all IDs in database
  async listAllIds(limit = 20) {
    try {
      const db = await this.getDb();
      
      const scholarships = await db.collection('scholarships')
        .find({ isActive: true }, { projection: { id: 1, title: 1, url: 1, _id: 0 } })
        .limit(limit)
        .toArray();
      
      console.log(`\n📋 First ${limit} Scholarship IDs in Database:`);
      scholarships.forEach(s => {
        console.log(`   ${s.id || 'NO ID!'} - ${s.title?.substring(0, 50) || 'No title'}`);
      });
      
      return scholarships;
      
    } catch (error) {
      console.error('❌ Error listing IDs:', error);
      return [];
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('🔌 MongoDB connection closed');
    }
  }
}

module.exports = new MongoService();
