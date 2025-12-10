const { MongoClient } = require('mongodb');

class MongoService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
    this.isConnected = false;
  }

  // Generate consistent short ID from URL (SAME as Cloudflare Worker)
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
    if (this.isConnected) return;

    try {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI not configured');
      }

      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db('scholarbroad');
      this.collection = this.db.collection('scholarships');
      
      // Create indexes
      await this.collection.createIndex({ url: 1 }, { unique: true });
      await this.collection.createIndex({ id: 1 }, { unique: true }); // Index on short ID
      await this.collection.createIndex({ posted: 1 });
      await this.collection.createIndex({ scrapedAt: -1 });
      
      this.isConnected = true;
      console.log('✅ MongoDB connected successfully');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error.message);
      throw error;
    }
  }

  async saveScholarships(scholarships) {
    await this.connect();

    let insertedCount = 0;
    let modifiedCount = 0;
    let errorCount = 0;

    for (const scholarship of scholarships) {
      try {
        if (!scholarship.url) {
          errorCount++;
          continue;
        }

        // Generate consistent short ID
        const shortId = this.generateShortId(scholarship.url);
        
        // Prepare scholarship data with short ID
        const scholarshipData = {
          ...scholarship,
          id: shortId, // Store short ID for URL generation
          url: scholarship.url,
          posted: false,
          lastPostedAt: null,
          postCount: 0,
          scrapedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const result = await this.collection.updateOne(
          { url: scholarship.url },
          { 
            $set: scholarshipData,
            $setOnInsert: { createdAt: new Date().toISOString() }
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) {
          insertedCount++;
        } else if (result.modifiedCount > 0) {
          modifiedCount++;
        }

      } catch (error) {
        console.error(`Error saving scholarship: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`💾 Saved: ${insertedCount} new, ${modifiedCount} updated, ${errorCount} errors`);

    return {
      insertedCount,
      modifiedCount,
      errorCount
    };
  }

  async getScholarshipById(id) {
    await this.connect();

    try {
      // Try to find by short ID first (this is what the URL uses)
      const scholarship = await this.collection.findOne({ id: id });
      
      if (scholarship) {
        return scholarship;
      }

      // Fallback: try MongoDB _id
      const { ObjectId } = require('mongodb');
      if (ObjectId.isValid(id)) {
        return await this.collection.findOne({ _id: new ObjectId(id) });
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching scholarship:', error);
      return null;
    }
  }

  async getFreshUnpostedScholarships(limit = 3) {
    await this.connect();

    const scholarships = await this.collection
      .find({
        $or: [
          { posted: false },
          { posted: { $exists: false } }
        ]
      })
      .sort({ scrapedAt: -1 })
      .limit(limit)
      .toArray();

    return scholarships;
  }

  async getScholarshipsNeedingReminder() {
    await this.connect();

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    const scholarships = await this.collection
      .find({
        posted: true,
        deadline: { $exists: true, $ne: 'Check website' },
        $or: [
          { lastReminderAt: { $exists: false } },
          { lastReminderAt: null }
        ]
      })
      .toArray();

    const needingReminder = scholarships.filter(s => {
      try {
        const deadline = new Date(s.deadline);
        if (isNaN(deadline.getTime())) return false;

        const daysUntil = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));
        
        return daysUntil > 0 && daysUntil <= 7;
      } catch {
        return false;
      }
    });

    return needingReminder.map(s => {
      const deadline = new Date(s.deadline);
      const daysUntil = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));
      return {
        ...s,
        daysUntilDeadline: daysUntil
      };
    });
  }

  async markAsPosted(scholarshipId) {
    await this.connect();

    try {
      // Try to find by short ID first
      let result = await this.collection.updateOne(
        { id: scholarshipId },
        {
          $set: {
            posted: true,
            lastPostedAt: new Date().toISOString()
          },
          $inc: { postCount: 1 }
        }
      );

      if (result.matchedCount === 0) {
        // Fallback: try MongoDB _id
        const { ObjectId } = require('mongodb');
        if (ObjectId.isValid(scholarshipId)) {
          result = await this.collection.updateOne(
            { _id: new ObjectId(scholarshipId) },
            {
              $set: {
                posted: true,
                lastPostedAt: new Date().toISOString()
              },
              $inc: { postCount: 1 }
            }
          );
        }
      }

      return result.modifiedCount > 0;
    } catch (error) {
      console.error(`Error marking as posted: ${error.message}`);
      return false;
    }
  }

  async getPostingStats() {
    await this.connect();

    const total = await this.collection.countDocuments();
    const posted = await this.collection.countDocuments({ posted: true });
    const unposted = await this.collection.countDocuments({
      $or: [
        { posted: false },
        { posted: { $exists: false } }
      ]
    });

    return {
      total,
      posted,
      unposted,
      timestamp: new Date().toISOString()
    };
  }

  async cleanupOldPostedRecords() {
    await this.connect();

    const sixtyDaysAgo = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000));

    try {
      const result = await this.collection.deleteMany({
        posted: true,
        lastPostedAt: { $lt: sixtyDaysAgo.toISOString() }
      });

      if (result.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${result.deletedCount} old posted records`);
      }

      return result.deletedCount;
    } catch (error) {
      console.error('Error during cleanup:', error.message);
      return 0;
    }
  }

  async getLatestScholarships(limit = 30) {
    await this.connect();

    return await this.collection
      .find()
      .sort({ scrapedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getStats() {
    await this.connect();

    const total = await this.collection.countDocuments();
    
    const countries = await this.collection.distinct('country');
    const fullyFunded = await this.collection.countDocuments({
      $or: [
        { funding: 'Fully Funded' },
        { fundingType: 'Fully Funded' }
      ]
    });

    return {
      total,
      countries: countries.length,
      fullyFunded,
      timestamp: new Date().toISOString()
    };
  }

  async listAllIds(limit = 20) {
    await this.connect();

    const scholarships = await this.collection
      .find({})
      .project({ _id: 1, id: 1, title: 1, url: 1 })
      .sort({ scrapedAt: -1 })
      .limit(limit)
      .toArray();

    return scholarships.map(s => ({
      mongoId: s._id.toString(),
      shortId: s.id,
      title: s.title,
      url: s.url
    }));
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('MongoDB connection closed');
    }
  }
}

module.exports = new MongoService();
