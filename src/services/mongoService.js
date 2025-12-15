const { MongoClient, ObjectId } = require('mongodb');

class MongoService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
    this.isConnected = false;
  }

  // ==========================================
  // URL NORMALIZATION (IDENTICAL TO SCRAPER)
  // ==========================================
  normalizeUrl(url) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      url = url.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const urlObj = new URL(url);
      
      let hostname = urlObj.hostname.toLowerCase();
      hostname = hostname.replace(/^www\./, '');
      
      let pathname = urlObj.pathname.toLowerCase();
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'ref', 'source', 'fbclid', 'gclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid'
      ];
      
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });
      
      const sortedParams = new URLSearchParams(
        [...urlObj.searchParams.entries()].sort()
      );
      
      const normalizedUrl = `https://${hostname}${pathname}${
        sortedParams.toString() ? '?' + sortedParams.toString() : ''
      }`;
      
      return normalizedUrl;
      
    } catch (error) {
      console.error(`URL normalization failed: ${error.message}`);
      return url;
    }
  }

  // ==========================================
  // TITLE FINGERPRINT (IDENTICAL TO SCRAPER)
  // ==========================================
  generateTitleFingerprint(title) {
    if (!title || typeof title !== 'string') {
      return null;
    }

    let fingerprint = title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const noiseWords = [
      'scholarship', 'scholarships', 'program', 'programme', 
      'opportunity', 'opportunities', 'fully', 'funded',
      'international', 'students', 'applications', 'open',
      'the', 'for', 'in', 'at', 'and', 'or'
    ];
    
    const words = fingerprint.split(' ').filter(word => 
      word.length > 2 && !noiseWords.includes(word)
    );
    
    const wordsNoYears = words.filter(word => !/^\d{4}$/.test(word));
    const sortedWords = wordsNoYears.sort();
    fingerprint = sortedWords.join(' ').substring(0, 100);
    
    return fingerprint || null;
  }

  // Generate consistent short ID from normalized URL
  generateShortId(url) {
    const normalized = this.normalizeUrl(url);
    if (!normalized) return 'unknown';
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
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
    
    console.log('✅ MongoDB connected');
    
    // ==========================================
    // DATA MIGRATION: Normalize existing URLs
    // ==========================================
    await this.migrateExistingData();
    
    // ==========================================
    // CREATE INDEXES AFTER MIGRATION
    // ==========================================
    try {
      // Drop existing problematic indexes first
      try {
        await this.collection.dropIndex('unique_normalized_url');
        console.log('   🗑️  Dropped old unique_normalized_url index');
      } catch (e) {
        // Index doesn't exist, that's fine
      }

      try {
        await this.collection.dropIndex('url_1');
        console.log('   🗑️  Dropped old url_1 index');
      } catch (e) {
        // Index doesn't exist, that's fine
      }

      // Create new indexes
      await this.collection.createIndex(
        { normalizedUrl: 1 }, 
        { 
          unique: true, 
          name: 'unique_normalized_url',
          partialFilterExpression: { normalizedUrl: { $type: 'string' } }
        }
      );
      console.log('   ✅ Created unique_normalized_url index');

      await this.collection.createIndex(
        { id: 1 }, 
        { 
          unique: true, 
          name: 'unique_short_id',
          partialFilterExpression: { id: { $type: 'string' } }
        }
      );
      console.log('   ✅ Created unique_short_id index');

      await this.collection.createIndex(
        { titleFingerprint: 1 }, 
        { 
          sparse: true, 
          name: 'title_fingerprint_index' 
        }
      );
      console.log('   ✅ Created title_fingerprint_index');

      await this.collection.createIndex(
        { posted: 1, scrapedAt: -1 }, 
        { name: 'posting_query_index' }
      );
      console.log('   ✅ Created posting_query_index');

    } catch (indexError) {
      console.error('⚠️  Index creation warning:', indexError.message);
      // Don't fail connection if indexes have issues
    }
    
    this.isConnected = true;
    console.log('✅ MongoDB ready with enhanced deduplication\n');

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}


// ==========================================
// MIGRATE EXISTING DATA
// ==========================================
async migrateExistingData() {
  console.log('\n🔄 Checking for data migration...');
  
  try {
    // Count records without normalized fields
    const needsMigration = await this.collection.countDocuments({
      $or: [
        { normalizedUrl: { $exists: false } },
        { normalizedUrl: null },
        { titleFingerprint: { $exists: false } }
      ]
    });

    if (needsMigration === 0) {
      console.log('   ✅ All records already migrated');
      return;
    }

    console.log(`   📦 Found ${needsMigration} records needing migration\n`);

    // Get all records needing migration
    const records = await this.collection.find({
      $or: [
        { normalizedUrl: { $exists: false } },
        { normalizedUrl: null },
        { titleFingerprint: { $exists: false } }
      ]
    }).toArray();

    let migratedCount = 0;
    let errorCount = 0;
    const urlMap = new Map(); // Track duplicates

    for (const record of records) {
      try {
        if (!record.url) {
          console.log(`   ⚠️  Record ${record._id} has no URL, skipping`);
          errorCount++;
          continue;
        }

        // Normalize URL
        const normalizedUrl = this.normalizeUrl(record.url);
        if (!normalizedUrl) {
          console.log(`   ⚠️  Could not normalize URL: ${record.url}`);
          errorCount++;
          continue;
        }

        // Check if this normalized URL already exists
        if (urlMap.has(normalizedUrl)) {
          console.log(`   🗑️  Duplicate detected, deleting: ${record.title?.substring(0, 50)}...`);
          await this.collection.deleteOne({ _id: record._id });
          continue;
        }

        // Generate new identifiers
        const shortId = this.generateShortId(normalizedUrl);
        const titleFingerprint = this.generateTitleFingerprint(record.title || '');

        // Update record
        await this.collection.updateOne(
          { _id: record._id },
          { 
            $set: {
              normalizedUrl,
              id: shortId,
              titleFingerprint,
              updatedAt: new Date().toISOString()
            }
          }
        );

        urlMap.set(normalizedUrl, record._id);
        migratedCount++;

        if (migratedCount % 10 === 0) {
          console.log(`   📊 Migrated ${migratedCount}/${records.length} records...`);
        }

      } catch (error) {
        console.error(`   ❌ Error migrating record ${record._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n   ✅ Migration complete:`);
    console.log(`      Migrated: ${migratedCount}`);
    console.log(`      Errors: ${errorCount}`);
    console.log(`      Total processed: ${records.length}\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}
async saveScholarships(scholarships) {
  await this.connect();

  let insertedCount = 0;
  let modifiedCount = 0;
  let skippedDuplicates = 0;
  let errorCount = 0;

  console.log(`💾 Saving ${scholarships.length} scholarships with enhanced deduplication...\n`);

  for (const scholarship of scholarships) {
    try {
      if (!scholarship.url || !scholarship.title) {
        errorCount++;
        continue;
      }

      // Normalize URL
      const normalizedUrl = this.normalizeUrl(scholarship.url);
      if (!normalizedUrl) {
        console.log(`   ⚠️  Invalid URL, skipping: ${scholarship.title.substring(0, 50)}`);
        errorCount++;
        continue;
      }

      // Generate identifiers
      const shortId = this.generateShortId(normalizedUrl);
      const titleFingerprint = this.generateTitleFingerprint(scholarship.title);

      // Check for existing scholarship by normalized URL
      const existing = await this.collection.findOne({ normalizedUrl });

      if (existing) {
        // Update existing record only if content changed
        const hasChanges = 
          existing.title !== scholarship.title ||
          existing.deadline !== scholarship.deadline ||
          existing.funding !== scholarship.funding;

        if (hasChanges) {
          await this.collection.updateOne(
            { _id: existing._id },
            { 
              $set: {
                ...scholarship,
                normalizedUrl,
                id: shortId,
                titleFingerprint,
                updatedAt: new Date().toISOString()
              }
            }
          );
          modifiedCount++;
          console.log(`   🔄 Updated: ${scholarship.title.substring(0, 60)}...`);
        } else {
          skippedDuplicates++;
        }
        continue;
      }

      // Check for semantic duplicate by title fingerprint
      if (titleFingerprint) {
        const semanticDuplicate = await this.collection.findOne({ 
          titleFingerprint,
          _id: { $exists: true } // Ensure we're not matching null
        });
        
        if (semanticDuplicate) {
          skippedDuplicates++;
          console.log(`   ⚠️  Semantic duplicate detected, skipping:`);
          console.log(`       Existing: ${semanticDuplicate.title.substring(0, 50)}...`);
          console.log(`       New: ${scholarship.title.substring(0, 50)}...`);
          continue;
        }
      }

      // Insert new scholarship
      const scholarshipData = {
        ...scholarship,
        normalizedUrl,
        id: shortId,
        titleFingerprint,
        posted: false,
        lastPostedAt: null,
        postCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        scrapedAt: new Date().toISOString()
      };

      try {
        await this.collection.insertOne(scholarshipData);
        insertedCount++;
        console.log(`   ✅ New: ${scholarship.title.substring(0, 60)}...`);
      } catch (insertError) {
        if (insertError.code === 11000) {
          // Duplicate key error during race condition
          skippedDuplicates++;
          console.log(`   ⏭️  Duplicate detected during insert, skipping`);
        } else {
          throw insertError;
        }
      }

    } catch (error) {
      console.error(`   ❌ Error processing scholarship: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Save Results:`);
  console.log(`   ✅ Inserted: ${insertedCount} new scholarships`);
  console.log(`   🔄 Updated: ${modifiedCount} existing scholarships`);
  console.log(`   ⏭️  Skipped: ${skippedDuplicates} duplicates`);
  console.log(`   ❌ Errors: ${errorCount}\n`);

  return {
    insertedCount,
    modifiedCount,
    skippedDuplicates,
    errorCount,
    totalProcessed: scholarships.length
  };
}

  async getScholarshipById(id) {
    await this.connect();

    try {
      console.log(`🔍 Looking up scholarship with ID: ${id}`);
      
      // Try to find by short ID first
      const scholarship = await this.collection.findOne({ id: id });
      
      if (scholarship) {
        console.log(`✅ Found scholarship: ${scholarship.title}`);
        return scholarship;
      }

      // Fallback: try MongoDB _id
      if (ObjectId.isValid(id)) {
        const byObjectId = await this.collection.findOne({ _id: new ObjectId(id) });
        if (byObjectId) {
          console.log(`✅ Found scholarship by MongoDB _id: ${byObjectId.title}`);
          return byObjectId;
        }
      }

      console.log(`❌ No scholarship found with ID: ${id}`);
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
      .sort({ scrapedAt: -1, relevanceScore: -1 })
      .limit(limit)
      .toArray();

    console.log(`📋 Found ${scholarships.length} unposted scholarships`);
    return scholarships;
  }

  async getScholarshipsNeedingReminder() {
    await this.connect();

    const now = new Date();

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
      console.log(`📌 Marking scholarship as posted: ${scholarshipId}`);
      
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

      const success = result.modifiedCount > 0;
      console.log(success ? `✅ Marked as posted` : `⚠️ No changes made`);
      return success;
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

    // Duplicate detection stats
    const duplicatesByFingerprint = await this.collection.aggregate([
      { $match: { titleFingerprint: { $exists: true, $ne: null } } },
      { $group: { _id: '$titleFingerprint', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'total' }
    ]).toArray();

    return {
      total,
      posted,
      unposted,
      potentialDuplicates: duplicatesByFingerprint[0]?.total || 0,
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

  async findAndMergeDuplicates() {
    await this.connect();

    console.log('🔍 Scanning for duplicates...\n');

    // Find duplicates by title fingerprint
    const duplicates = await this.collection.aggregate([
      { $match: { titleFingerprint: { $exists: true, $ne: null } } },
      { $group: { 
          _id: '$titleFingerprint', 
          count: { $sum: 1 },
          docs: { $push: '$$ROOT' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    let mergedCount = 0;

    for (const group of duplicates) {
      console.log(`\n📦 Found ${group.count} duplicates:`);
      group.docs.forEach(doc => {
        console.log(`   - ${doc.title.substring(0, 60)}... (${doc.id})`);
      });

      // Keep the one with highest relevance score or most recent
      const sorted = group.docs.sort((a, b) => {
        if (a.posted && !b.posted) return -1;
        if (!a.posted && b.posted) return 1;
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      });

      const keepDoc = sorted[0];
      const removeIds = sorted.slice(1).map(d => d._id);

      console.log(`   ✅ Keeping: ${keepDoc.title.substring(0, 50)}... (${keepDoc.id})`);
      console.log(`   🗑️  Removing ${removeIds.length} duplicates`);

      // Delete duplicates
      await this.collection.deleteMany({
        _id: { $in: removeIds }
      });

      mergedCount += removeIds.length;
    }

    console.log(`\n📊 Merge complete: Removed ${mergedCount} duplicate records\n`);
    return mergedCount;
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
      .project({ _id: 1, id: 1, title: 1, normalizedUrl: 1, titleFingerprint: 1 })
      .sort({ scrapedAt: -1 })
      .limit(limit)
      .toArray();

    return scholarships.map(s => ({
      mongoId: s._id.toString(),
      shortId: s.id,
      title: s.title,
      normalizedUrl: s.normalizedUrl,
      fingerprint: s.titleFingerprint
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
