const { MongoClient } = require('mongodb');

class MongoService {
  constructor() {
    this.client = null;
    this.db = null;
    
    this.uri = process.env.MONGODB_URI || 
      'mongodb+srv://OlukayodeUser:Kayode4371@cluster0.zds6pi9.mongodb.net/scholarships_db?retryWrites=true&w=majority';
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
      
      console.log('✅ MongoDB connected to scholarships_db');
      return this.db;
      
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  // Helper method to get database
  async getDb() {
    if (!this.db) {
      await this.connect();
    }
    return this.db;
  }

  // Get scholarship by ID
  async getScholarshipById(id) {
    try {
      const db = await this.getDb();
      const { ObjectId } = require('mongodb');
      
      let scholarship = null;
      
      // Try to find by MongoDB _id first (if valid ObjectId)
      if (ObjectId.isValid(id)) {
        scholarship = await db.collection('scholarships').findOne({ 
          _id: new ObjectId(id) 
        });
      }
      
      // If not found, try finding by custom id field or title
      if (!scholarship) {
        scholarship = await db.collection('scholarships').findOne({ 
          $or: [
            { id: id },
            { title: { $regex: new RegExp(id, 'i') } }
          ]
        });
      }
      
      return scholarship;
    } catch (error) {
      console.error('Error getting scholarship by ID:', error);
      throw error;
    }
  }

  async saveScholarships(scholarships) {
    try {
      const db = await this.connect();
      const collection = db.collection('scholarships');
      
      if (!scholarships || scholarships.length === 0) {
        console.log('⚠️ No scholarships to save');
        return { insertedCount: 0 };
      }

      const documentsToInsert = scholarships.map(s => ({
        ...s,
        scrapedAt: new Date(),
        isActive: true,
        _id: undefined
      }));

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const deleteResult = await collection.deleteMany({
        scrapedAt: { $lt: sevenDaysAgo }
      });
      
      if (deleteResult.deletedCount > 0) {
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} old scholarships`);
      }

      const result = await collection.insertMany(documentsToInsert, { 
        ordered: false
      });
      
      console.log(`✅ Saved ${result.insertedCount} scholarships to MongoDB`);
      
      return result;
      
    } catch (error) {
      if (error.code === 11000) {
        console.log('⚠️ Some duplicate scholarships skipped');
        return { insertedCount: scholarships.length };
      }
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
