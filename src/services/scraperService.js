
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');

class ScraperService {
  constructor() {
    // ==========================================
    // GOOGLE API CONFIGURATION (from Code A)
    // ==========================================
    this.googleApiKey = process.env.GOOGLE_API_KEY || null;
    this.googleCseId = process.env.GOOGLE_CSE_ID || null;
    
    // ==========================================
    // RSS PARSER (from Code A)
    // ==========================================
    this.rssParser = new Parser({
      timeout: 20000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    // ==========================================
    // RSS FEEDS (from Code A - optimized)
    // ==========================================
    this.rssFeeds = [
      'https://www.opportunitiesforafricans.com/feed/',
      'https://www.pickascholarship.com/feed/',
      'https://www.profellow.com/feed/'
    ];
    
    // ==========================================
    // REQUEST STATISTICS (from Code A)
    // ==========================================
    this.requestStats = {
      googleApi: 0,
      duckduckgo: 0,
      rss: 0,
      direct: 0,
      failed: 0
    };
    
    // ==========================================
    // CACHE & TIMING
    // ==========================================
    this.baseSearchUrl = 'https://www.google.com/search';
    this.lastScrape = null;
    this.cache = [];
    this.cacheDuration = 1000 * 60 * 60; // 1 hour
    
    // ==========================================
    // SCHOLARSHIP WEBSITES (from Code B - superior list)
    // ==========================================
    this.scholarshipSites = [
      {
        name: 'ScholarshipPortal',
        url: 'https://www.scholarshipportal.com/scholarships',
        scraper: this.scrapeScholarshipPortal.bind(this)
      },
      {
        name: 'Scholars4Dev',
        url: 'https://www.scholars4dev.com',
        scraper: this.scrapeScholars4Dev.bind(this)
      },
      {
        name: 'FindAMasters',
        url: 'https://www.findamasters.com/funding/listings.aspx',
        scraper: this.scrapeFindAMasters.bind(this)
      },
      {
        name: 'StudyPortals',
        url: 'https://www.mastersportal.com/scholarships',
        scraper: this.scrapeStudyPortals.bind(this)
      },
      {
        name: 'InternationalScholarships',
        url: 'https://www.internationalscholarships.com',
        scraper: this.scrapeInternationalScholarships.bind(this)
      },
      {
        name: 'ScholarshipsAds',
        url: 'https://www.scholarshipsads.com',
        scraper: this.scrapeScholarshipsAds.bind(this)
      },
      {
        name: 'AfterSchoolAfrica', 
        url: 'https://www.afterschoolafrica.com/scholarships',
        scraper: this.scrapeAfterSchoolAfrica.bind(this)
      },
      {
        name: 'OpportunitiesForAfricans',
        url: 'https://www.opportunitiesforafricans.com',
        scraper: this.scrapeOpportunitiesForAfricans.bind(this)
      }
    ];
    
    // ==========================================
    // RELIABLE SOURCES
    // ==========================================
    this.reliableSources = [
      { name: 'ScholarshipPortal', domain: 'scholarshipportal.com' },
      { name: 'FindAMasters', domain: 'findamasters.com' },
      { name: 'MastersPortal', domain: 'mastersportal.com' },
      { name: 'Scholars4Dev', domain: 'scholars4dev.com' },
      { name: 'DAAD', domain: 'daad.de' },
      { name: 'Chevening', domain: 'chevening.org' },
      { name: 'Commonwealth', domain: 'cscuk.fcdo.gov.uk' }
    ];
    
    // ==========================================
    // SAMPLE DATA (enhanced from Code B)
    // ==========================================
    this.sampleData = this.generateEnhancedSampleData();
  }

  // ==========================================
  // MAIN SCRAPING METHOD - ENHANCED HYBRID
  // ==========================================
  async scrapeAll() {
    try {
      console.log('\n🎯 ========================================');
      console.log('   ENHANCED MULTI-TIER SCHOLARSHIP SCRAPING');
      console.log('========================================\n');
      
      // Check cache first
      if (this.cache.length > 0 && this.lastScrape) {
        const timeSinceLastScrape = Date.now() - this.lastScrape;
        if (timeSinceLastScrape < this.cacheDuration) {
          console.log(`📦 Returning cached scholarships (${this.cache.length} items)`);
          console.log(`   Cache age: ${Math.round(timeSinceLastScrape / 1000 / 60)} minutes\n`);
          return this.cache;
        }
      }
  
      let allResults = [];
      
      // ============================================
      // TIER 1: Google Custom Search API (if configured)
      // ============================================
      if (this.googleApiKey && this.googleCseId && this.requestStats.googleApi < 100) {
        console.log('🔍 TIER 1A: Google Custom Search API...\n');
        const googleApiResults = await this.scrapeGoogleAPI();
        allResults.push(...googleApiResults);
        console.log(`   ✅ Google API: ${googleApiResults.length} results\n`);
      } else {
        console.log('⏭️  TIER 1A: Google API skipped (not configured or quota reached)\n');
      }
      
      // ============================================
      // TIER 1B: DuckDuckGo Search
      // ============================================
      console.log('🦆 TIER 1B: DuckDuckGo Search...\n');
      const duckResults = await this.scrapeDuckDuckGo();
      allResults.push(...duckResults);
      console.log(`   ✅ DuckDuckGo: ${duckResults.length} results\n`);
      
      // ============================================
      // TIER 1C: Google HTML Scraping (fallback)
      // ============================================
      if (allResults.length < 10) {
        console.log('🔍 TIER 1C: Google HTML Search (fallback)...\n');
        const queries = this.generateSearchQueries();
        const maxQueries = 3;
        
        for (let i = 0; i < maxQueries; i++) {
          const results = await this.scrapeGoogle(queries[i], 5);
          allResults.push(...results);
          if (i < maxQueries - 1) {
            await this.delay(3000 + Math.random() * 2000);
          }
        }
        console.log(`   ✅ Google HTML: Added more results\n`);
      }

      // ============================================
      // TIER 2: RSS Feeds
      // ============================================
      console.log('📡 TIER 2: RSS Feeds...\n');
      const rssResults = await this.scrapeRSSFeeds();
      allResults.push(...rssResults);
      console.log(`   ✅ RSS: ${rssResults.length} results\n`);

      // ============================================
      // TIER 3: Direct Website Scraping
      // ============================================
      if (allResults.length < 15) {
        console.log('🌐 TIER 3: Direct Website Scraping...\n');
        const websiteResults = await this.scrapeScholarshipWebsites();
        allResults.push(...websiteResults);
        console.log(`   ✅ Direct Sites: ${websiteResults.length} results\n`);
      } else {
        console.log('✅ Sufficient results from Tiers 1-2, skipping Tier 3\n');
      }

      // ============================================
      // TIER 4: Sample Data Fallback
      // ============================================
      if (allResults.length < 3) {
        console.log('⚠️  All scraping failed, using sample data...\n');
        allResults = this.sampleData;
      }

      // ==========================================
      // POST-PROCESSING
      // ==========================================
// ==========================================
// POST-PROCESSING - REPLACE EXISTING SECTION
// ==========================================

// OLD CODE (DELETE THIS):
// const uniqueResults = this.deduplicateByUrl(allResults);

// NEW CODE (USE THIS INSTEAD):
const uniqueResults = this.deduplicateEnhanced(allResults);

const sortedResults = uniqueResults.sort((a, b) => {
  if (a.urgency === 'HIGH' && b.urgency !== 'HIGH') return -1;
  if (b.urgency === 'HIGH' && a.urgency !== 'HIGH') return 1;
  return (b.relevanceScore || 50) - (a.relevanceScore || 50);
});

// Cache results
this.cache = sortedResults;
this.lastScrape = Date.now();

console.log('========================================');
console.log('✅ SCRAPING COMPLETED');
console.log('========================================');
console.log(`📊 Statistics:`);
console.log(`   Raw results: ${allResults.length}`);
console.log(`   Unique results: ${sortedResults.length}`);
console.log(`   Duplicates removed: ${allResults.length - sortedResults.length}`);
console.log(`   High urgency: ${sortedResults.filter(r => r.urgency === 'HIGH').length}`);
console.log(`   Trending: ${sortedResults.filter(r => r.trending).length}`);
console.log(`   Fully Funded: ${sortedResults.filter(r => r.funding === 'Fully Funded').length}`);
console.log('========================================\n');

return sortedResults.slice(0, 50); // Return top 50

    } catch (error) {
      console.error('❌ Critical scraping error:', error.message);
      console.log('📦 Using fallback sample data\n');
      return this.sampleData;
    }
  }

  // ==========================================
  // GOOGLE CUSTOM SEARCH API (from Code A)
  // ==========================================
  async scrapeGoogleAPI() {
    const results = [];
    
    const queries = [
      'scholarships 2025 fully funded',
      'international student scholarships 2025',
      'masters scholarships deadline soon',
      'PhD funding opportunities 2025',
      'undergraduate scholarships 2025 international',
      'fully funded scholarships Europe 2025',
      'scholarships USA international students 2025',
      'doctoral scholarships 2025 deadline'
    ];
    
    const maxQueries = Math.min(8, 100 - this.requestStats.googleApi);
    
    for (let i = 0; i < maxQueries; i++) {
      try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: {
            key: this.googleApiKey,
            cx: this.googleCseId,
            q: queries[i],
            num: 10
          },
          timeout: 10000
        });
        
        const items = response.data.items || [];
        
        items.forEach(item => {
          if (this.isScholarshipRelevant(item.title, item.snippet)) {
            const details = this.extractScholarshipDetails(item.title, item.snippet);
            results.push({
              ...details,
              url: item.link,
              description: item.snippet || details.description,
              snippet: item.snippet || details.snippet,
              source: 'Google API',
              relevanceScore: 85,
              trending: true,
              urgency: 'HIGH',
              scrapedAt: new Date().toISOString()
            });
          }
        });
        
        this.requestStats.googleApi++;
        console.log(`      ✅ Query ${i + 1}: "${queries[i]}" - ${items.length} results`);
        
        await this.delay(800);
        
      } catch (error) {
        this.requestStats.failed++;
        console.log(`      ❌ Query ${i + 1} failed: ${error.message}`);
      }
    }
    
    return results;
  }

  // ==========================================
  // DUCKDUCKGO SCRAPER (from Code A)
  // ==========================================
  async scrapeDuckDuckGo() {
    const results = [];
    const queries = ['scholarships 2025 international', 'fully funded scholarships'];
    
    for (const query of queries) {
      try {
        const response = await axios.get('https://html.duckduckgo.com/html/', {
          params: { q: query },
          headers: this.getRandomHeaders(),
          timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        
        $('.result').each((i, el) => {
          if (results.length >= 20) return false;
          
          const $r = $(el);
          const title = $r.find('.result__title').text().trim();
          const url = $r.find('.result__url').attr('href');
          const snippet = $r.find('.result__snippet').text().trim();
          
          if (title && url && this.isScholarshipRelevant(title, snippet)) {
            const details = this.extractScholarshipDetails(title, snippet);
            results.push({
              ...details,
              url: url.startsWith('//') ? 'https:' + url : url,
              description: snippet,
              snippet: snippet,
              source: 'DuckDuckGo',
              relevanceScore: 75,
              trending: true,
              urgency: 'MEDIUM',
              scrapedAt: new Date().toISOString()
            });
          }
        });
        
        this.requestStats.duckduckgo++;
        await this.delay(3000);
        
      } catch (error) {
        this.requestStats.failed++;
        console.log(`   ⚠️  DuckDuckGo query failed: ${error.message}`);
      }
    }
    
    return results;
  }

  // ==========================================
  // RSS FEED SCRAPER (from Code A)
  // ==========================================
  async scrapeRSSFeeds() {
    const results = [];
    
    for (const feedUrl of this.rssFeeds) {
      try {
        const feed = await this.rssParser.parseURL(feedUrl);
        
        if (feed?.items) {
          feed.items.slice(0, 5).forEach(item => {
            if (this.isScholarshipRelevant(item.title || '', item.contentSnippet || '')) {
              const details = this.extractScholarshipDetails(item.title, item.contentSnippet);
              results.push({
                ...details,
                url: item.link,
                description: item.contentSnippet || 'Visit website for details',
                snippet: item.contentSnippet || 'Visit website for details',
                source: feedUrl.split('/')[2],
                relevanceScore: 80,
                trending: true,
                urgency: 'MEDIUM',
                scrapedAt: new Date().toISOString()
              });
            }
          });
          this.requestStats.rss++;
          console.log(`      ✅ ${feedUrl.split('/')[2]}: ${feed.items.slice(0, 5).length} items`);
        }
        
      } catch (error) {
        this.requestStats.failed++;
        console.log(`      ⚠️  ${feedUrl.split('/')[2]}: Failed`);
      }
      
      await this.delay(1500);
    }
    
    return results;
  }

  // ==========================================
  // GOOGLE HTML SCRAPER (from Code B)
  // ==========================================
  async scrapeGoogle(query, maxResults = 10) {
    try {
      console.log(`   🔍 Google search: "${query}"`);
      
      const response = await axios.get(this.baseSearchUrl, {
        params: {
          q: query,
          num: maxResults,
          hl: 'en',
          gl: 'us'
        },
        headers: this.getRandomHeaders(),
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      const selectorStrategies = [
        { container: '.g', title: 'h3', link: 'a', snippet: '.VwiC3b' },
        { container: '.tF2Cxc', title: '.DKV0Md', link: 'a', snippet: '.lEBKkf' },
        { container: '.Gx5Zad', title: 'h3', link: 'a', snippet: '.s3v9rd' },
        { container: '.rc', title: 'h3', link: 'a', snippet: '.s' },
        { container: 'div[data-hveid]', title: 'h3', link: 'a', snippet: 'div[style*="line-height"]' }
      ];

      for (const strategy of selectorStrategies) {
        $(strategy.container).each((i, element) => {
          if (results.length >= maxResults) return false;

          const $elem = $(element);
          const title = $elem.find(strategy.title).text().trim();
          const $link = $elem.find(strategy.link).first();
          const url = $link.attr('href');
          const snippet = $elem.find(strategy.snippet).text().trim();

          if (title && url && this.isScholarshipRelevant(title, snippet)) {
            const cleanUrl = this.cleanGoogleUrl(url);
            
            if (!results.find(r => r.url === cleanUrl)) {
              const details = this.extractScholarshipDetails(title, snippet);
              results.push({
                ...details,
                url: cleanUrl,
                snippet: snippet,
                description: snippet,
                source: this.extractDomain(cleanUrl),
                searchQuery: query,
                relevanceScore: this.calculateRelevance(title, snippet, query),
                trending: this.isTrending(title, snippet),
                urgency: this.calculateUrgency(title, snippet),
                scrapedAt: new Date().toISOString()
              });
            }
          }
        });

        if (results.length > 0) break;
      }

      console.log(`      ✅ Found ${results.length} results`);
      return results;

    } catch (error) {
      console.error(`      ❌ Google search failed: ${error.message}`);
      return [];
    }
  }

  // ==========================================
  // DIRECT WEBSITE SCRAPERS (from Code B)
  // ==========================================
  async scrapeScholarshipWebsites() {
    console.log('   🌐 Scraping scholarship websites directly...\n');
    const allResults = [];

    for (const site of this.scholarshipSites) {
      try {
        const results = await site.scraper();
        allResults.push(...results);
        this.requestStats.direct++;
        await this.delay(2000 + Math.random() * 2000);
      } catch (error) {
        console.log(`      ⚠️  ${site.name} error: ${error.message}`);
      }
    }

    const filteredResults = this.filterQualityResults(allResults);
    return filteredResults;
  }

  async scrapeScholarshipPortal() {
    try {
      console.log('      📘 Scraping ScholarshipPortal.com...');
      const response = await axios.get('https://www.scholarshipportal.com/scholarships', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.ScholarshipItem, .scholarship-item, [class*="scholarship"]').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('h3, h2, .title, [class*="title"]').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('p, .description, [class*="description"]').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.scholarshipportal.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'Visit website for full details',
            description: description || 'Visit website for full details',
            source: 'scholarshipportal.com',
            searchQuery: 'direct scrape',
            relevanceScore: 80,
            trending: false,
            urgency: 'MEDIUM',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ ScholarshipPortal: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ ScholarshipPortal failed: ${error.message}`);
      return [];
    }
  }

  async scrapeScholars4Dev() {
    const maxRetries = 2;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`      📗 Scraping Scholars4Dev.com... (Attempt ${attempt}/${maxRetries})`);
        const response = await axios.get('https://www.scholars4dev.com', {
          headers: this.getRandomHeaders(),
          timeout: 20000,
          maxRedirects: 5
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('article, .post, .scholarship-post, [class*="post"]').each((i, element) => {
          if (results.length >= 10) return false;

          const $elem = $(element);
          const title = $elem.find('h2, h3, .entry-title, [class*="title"]').first().text().trim();
          const link = $elem.find('a').first().attr('href');
          const description = $elem.find('.entry-content, .excerpt, p').first().text().trim();

          if (title && link) {
            const fullUrl = link.startsWith('http') 
              ? link 
              : `https://www.scholars4dev.com${link.startsWith('/') ? link : '/' + link}`;
            
            const details = this.extractScholarshipDetails(title, description);
            
            results.push({
              ...details,
              url: fullUrl,
              snippet: description || 'Visit website for full details',
              description: description || 'Visit website for full details',
              source: 'scholars4dev.com',
              searchQuery: 'direct scrape',
              relevanceScore: 85,
              trending: true,
              urgency: 'MEDIUM',
              scrapedAt: new Date().toISOString()
            });
          }
        });

        console.log(`         ✅ Scholars4Dev: ${results.length} results`);
        return results;
        
      } catch (error) {
        if (attempt === maxRetries) {
          console.log(`         ❌ Scholars4Dev failed after ${maxRetries} attempts: ${error.message}`);
          return [];
        }
        console.log(`         ⚠️  Attempt ${attempt} failed, retrying...`);
        await this.delay(2000);
      }
    }
    
    return [];
  }

  async scrapeFindAMasters() {
    try {
      console.log('      📙 Scraping FindAMasters.com...');
      const response = await axios.get('https://www.findamasters.com/funding/listings.aspx', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.courseLink, .course-list-item, [class*="course"]').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('a, h3, .courseName').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('p, .courseDetails').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.findamasters.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'Visit website for full details',
            description: description || 'Visit website for full details',
            source: 'findamasters.com',
            searchQuery: 'direct scrape',
            relevanceScore: 82,
            trending: false,
            urgency: 'MEDIUM',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ FindAMasters: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ FindAMasters failed: ${error.message}`);
      return [];
    }
  }

  async scrapeStudyPortals() {
    try {
      console.log('      📕 Scraping MastersPortal.com...');
      const response = await axios.get('https://www.mastersportal.com/scholarships', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.SearchResultItem, .result-item, [class*="result"]').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('h2, h3, .Title').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('p, .Description').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.mastersportal.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'Visit website for full details',
            description: description || 'Visit website for full details',
            source: 'mastersportal.com',
            searchQuery: 'direct scrape',
            relevanceScore: 81,
            trending: false,
            urgency: 'LOW',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ MastersPortal: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ MastersPortal failed: ${error.message}`);
      return [];
    }
  }

  async scrapeInternationalScholarships() {
    try {
      console.log('      📔 Scraping InternationalScholarships.com...');
      const response = await axios.get('https://www.internationalscholarships.com', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('article, .scholarship, .post, [class*="scholarship"]').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('h2, h3, .title').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('p, .excerpt, .description').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.internationalscholarships.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'Visit website for full details',
            description: description || 'Visit website for full details',
            source: 'internationalscholarships.com',
            searchQuery: 'direct scrape',
            relevanceScore: 78,
            trending: false,
            urgency: 'LOW',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ InternationalScholarships: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ InternationalScholarships failed: ${error.message}`);
      return [];
    }
  }

  async scrapeScholarshipsAds() {
    try {
      console.log('      📘 Scraping ScholarshipsAds.com...');
      const response = await axios.get('https://www.scholarshipsads.com', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('article, .post, .scholarship-item').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('h2, h3, .title').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('p, .excerpt').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.scholarshipsads.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'Visit website for full details',
            description: description || 'Visit website for full details',
            source: 'scholarshipsads.com',
            searchQuery: 'direct scrape',
            relevanceScore: 80,
            trending: false,
            urgency: 'MEDIUM',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ ScholarshipsAds: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ ScholarshipsAds failed: ${error.message}`);
      return [];
    }
  }

  async scrapeAfterSchoolAfrica() {
    try {
      console.log('      📙 Scraping AfterSchoolAfrica.com...');
      const response = await axios.get('https://www.afterschoolafrica.com/scholarships/', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('article, .post, .scholarship').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('h2, h3, .entry-title').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('.entry-summary, .excerpt, p').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.afterschoolafrica.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'Scholarship opportunity for African students',
            description: description || 'Scholarship opportunity for African students',
            source: 'afterschoolafrica.com',
            searchQuery: 'direct scrape',
            relevanceScore: 82,
            trending: true,
            urgency: 'MEDIUM',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ AfterSchoolAfrica: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ AfterSchoolAfrica failed: ${error.message}`);
      return [];
    }
  }

  async scrapeOpportunitiesForAfricans() {
    try {
      console.log('      📕 Scraping OpportunitiesForAfricans.com...');
      const response = await axios.get('https://www.opportunitiesforafricans.com', {
        headers: this.getRandomHeaders(),
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('article, .post-item, .opportunity').each((i, element) => {
        if (results.length >= 10) return false;

        const $elem = $(element);
        const title = $elem.find('h2, h3, .post-title').first().text().trim();
        const link = $elem.find('a').first().attr('href');
        const description = $elem.find('.post-excerpt, .excerpt, p').first().text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') 
            ? link 
            : `https://www.opportunitiesforafricans.com${link.startsWith('/') ? link : '/' + link}`;
          
          const details = this.extractScholarshipDetails(title, description);
          
          results.push({
            ...details,
            url: fullUrl,
            snippet: description || 'International opportunity for African students',
            description: description || 'International opportunity for African students',
            source: 'opportunitiesforafricans.com',
            searchQuery: 'direct scrape',
            relevanceScore: 83,
            trending: true,
            urgency: 'MEDIUM',
            scrapedAt: new Date().toISOString()
          });
        }
      });

      console.log(`         ✅ OpportunitiesForAfricans: ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`         ❌ OpportunitiesForAfricans failed: ${error.message}`);
      return [];
    }
  }

  // ==========================================
  // QUALITY FILTERING (from Code B)
  // ==========================================
  filterQualityResults(results) {
    console.log(`      🔍 Filtering ${results.length} raw results...`);
    
    const filtered = results.filter(result => {
      if (!result || typeof result !== 'object') {
        return false;
      }

      if (!result.title || typeof result.title !== 'string') {
        return false;
      }

      const titleLower = result.title.toLowerCase();
      
      const badTitleKeywords = [
        'quick search', 'search result', 'find scholarship', 'click here',
        'view more', 'read more', 'search for', 'browse', 'filter',
        'istock', '©', 'image credit', 'photo credit'
      ];
      
      if (badTitleKeywords.some(keyword => titleLower.includes(keyword))) {
        return false;
      }
      
      if (titleLower.match(/\d+\+\s*s\s/)) {
        return false;
      }
      
      if (result.title.length < 25) {
        return false;
      }
      
      if (!result.url || typeof result.url !== 'string' || 
          result.url === '#' || result.url === 'javascript:void(0)') {
        return false;
      }
      
      if (result.university === 'Check website' && 
          result.country === 'Multiple Countries' &&
          result.funding === 'Varies' &&
          result.deadline === 'Check website' &&
          result.amount === 'Varies') {
        return false;
      }
      
      const descLower = (result.description && typeof result.description === 'string') 
        ? result.description.toLowerCase() 
        : '';
        
      if (descLower.includes('©') || descLower.includes('istock') ||
          descLower.includes('shutterstock') || descLower.includes('getty') ||
          descLower.match(/^(image|photo)\s+(credit|by)/)) {
        return false;
      }
      
      if (descLower.length > 0 && descLower.length < 30 && 
          !descLower.includes('scholarship')) {
        return false;
      }
      
      const alphaCount = (result.title.match(/[a-zA-Z]/g) || []).length;
      if (alphaCount < 15) {
        return false;
      }
      
      return true;
    });

    console.log(`         ✅ Kept ${filtered.length} quality results\n`);
    return filtered;
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================
  generateSearchQueries() {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    
    return [
      `fully funded scholarships ${nextYear} deadline soon`,
      `scholarships open now ${nextYear} international students`,
      `trending scholarships ${currentMonth} ${currentYear}`,
      `masters scholarships ${nextYear} fully funded`,
      `phd scholarships ${nextYear} international students`,
      `scholarships in USA ${nextYear} fully funded`,
      `UK scholarships ${nextYear} international students`,
      `scholarship deadline this month`
    ];
  }

  extractScholarshipDetails(title, snippet) {
    const safeTitle = (title && typeof title === 'string') ? title : 'Scholarship Opportunity';
    const safeSnippet = (snippet && typeof snippet === 'string') ? snippet : '';
    const text = `${safeTitle} ${safeSnippet}`.toLowerCase();
    
    const uniMatch = text.match(/(?:at|university of|college of)\s+([A-Z][a-zA-Z\s&]+?)(?:\s|,|\.|\||$)/i);
    const university = uniMatch ? uniMatch[1].trim() : 'Check website';

    const countries = ['USA', 'UK', 'Canada', 'Germany', 'Australia', 'Netherlands', 
                      'Sweden', 'Norway', 'Denmark', 'Switzerland', 'France', 'Italy',
                      'Spain', 'Japan', 'Singapore', 'New Zealand', 'Ireland', 'Nigeria'];
    let country = 'Multiple Countries';
    for (const c of countries) {
      if (text.includes(c.toLowerCase())) {
        country = c;
        break;
      }
    }

    let level = 'Masters';
    if (text.includes('phd') || text.includes('doctoral')) level = 'PhD';
    else if (text.includes('undergraduate') || text.includes('bachelor')) level = 'Undergraduate';
    else if (text.includes('postdoc')) level = 'Postdoctoral';

    let funding = 'Varies';
    if (text.includes('fully funded') || text.includes('full funding')) {
      funding = 'Fully Funded';
    } else if (text.includes('tuition waiver') || text.includes('tuition free')) {
      funding = 'Tuition Waiver';
    } else if (text.includes('partial')) {
      funding = 'Partial Funding';
    }

    const deadlineMatch = text.match(/deadline[:\s]+([a-z]+\s+\d{1,2},?\s+\d{4})/i);
    const deadline = deadlineMatch ? deadlineMatch[1] : 'Check website';

    const amountMatch = text.match(/\$[\d,]+|\£[\d,]+|€[\d,]+|₦[\d,]+/);
    const amount = amountMatch ? amountMatch[0] : funding;

    const program = this.extractProgram(safeTitle);

    const generatedTitle = this.generateTitle({
      title: safeTitle,
      university,
      country,
      level,
      program
    });

    return {
      title: generatedTitle,
      university,
      country,
      level,
      funding,
      fundingType: funding,
      amount,
      applicationDeadline: deadline,
      deadline,
      program,
      requirements: this.extractRequirements(text)
    };
  }

  generateTitle(data) {
    const year = new Date().getFullYear() + 1;
    let { title, university, country, level, program } = data;
    
    if (title) {
      title = title
        .replace(/(\d+\+?\s*)s\s/gi, '$1Scholarships ')
        .replace(/Shared\s+Scheme/gi, 'Shared Scholarship Scheme')
        .replace(/International\s+s\s/gi, 'International Scholarships ')
        .replace(/\s+s\s+/gi, ' Scholarships ')
        .replace(/©.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    if (title && title.length > 30) {
      if (!title.includes(year.toString()) && !title.includes((year - 1).toString())) {
        return `${title} ${year}`;
      }
      return title;
    }
    
    let generatedTitle = '';
    
    if (university && university !== 'Check website' && 
        university !== 'Multiple Institutions' && university.length > 3) {
      generatedTitle = university;
    }
    
    if (program && program !== 'Various Programs' && program.length > 5) {
      generatedTitle += generatedTitle ? ` ${program}` : program;
    } else if (level) {
      generatedTitle += generatedTitle ? ` ${level} Scholarship` : `${level} Scholarship`;
    } else {
      generatedTitle += generatedTitle ? ' Scholarship Program' : 'Scholarship Program';
    }
    
    if (country && country !== 'Multiple Countries') {
      generatedTitle += ` in ${country}`;
    }
    
    if (!generatedTitle.includes(year.toString())) {
      generatedTitle += ` ${year}`;
    }
    
    return generatedTitle || title || 'Scholarship Opportunity ' + year;
  }

  extractProgram(title) {
    let program = title
      .replace(/scholarship|fellowship|grant|award|funding/gi, '')
      .replace(/fully funded|international students|applications open/gi, '')
      .replace(/\d{4}/g, '')
      .trim();
    
    return program || 'Various Programs';
  }

  extractRequirements(text) {
    const requirements = [];
    
    if (text.includes('bachelor') || text.includes('undergraduate degree')) {
      requirements.push('Bachelor\'s degree');
    }
    if (text.includes('gpa') || text.includes('cgpa')) {
      requirements.push('Minimum GPA requirement');
    }
    if (text.includes('ielts') || text.includes('toefl') || text.includes('english')) {
      requirements.push('English proficiency test');
    }
    if (text.includes('gre') || text.includes('gmat')) {
      requirements.push('Standardized test scores');
    }
    if (text.includes('recommendation') || text.includes('reference')) {
      requirements.push('Letters of recommendation');
    }
    if (text.includes('statement of purpose') || text.includes('motivation letter')) {
      requirements.push('Statement of purpose');
    }

    return requirements.length > 0 ? requirements : ['Check website for requirements'];
  }

  isScholarshipRelevant(title, snippet) {
    const text = `${title} ${snippet}`.toLowerCase();
    
    const scholarshipKeywords = [
      'scholarship', 'funding', 'financial aid', 'fully funded', 'fellowship',
      'grant', 'bursary', 'tuition', 'stipend', 'assistantship', 'award'
    ];

    const relevantKeywords = scholarshipKeywords.filter(keyword => 
      text.includes(keyword)
    );

    if (relevantKeywords.length === 0) return false;

    const excludeKeywords = [
      'job opening', 'career', 'employment', 'hiring', 'recruitment',
      'buy now', 'shop', 'for sale', 'price', 'discount'
    ];

    return !excludeKeywords.some(keyword => text.includes(keyword));
  }

  calculateRelevance(title, snippet, query) {
    let score = 50;
    const text = `${title} ${snippet}`.toLowerCase();
    const queryTerms = query.toLowerCase().split(' ');

    queryTerms.forEach(term => {
      if (title.toLowerCase().includes(term)) score += 10;
      if (snippet.toLowerCase().includes(term)) score += 5;
    });

    if (text.includes('fully funded')) score += 20;
    if (text.includes('deadline')) score += 10;
    if (text.includes('international students')) score += 15;
    if (text.includes('deadline soon') || text.includes('closing soon')) score += 15;

    const reliableDomains = this.reliableSources.map(s => s.domain);
    if (reliableDomains.some(domain => text.includes(domain))) score += 15;

    return Math.min(score, 100);
  }

  isTrending(title, snippet) {
    const text = `${title} ${snippet}`.toLowerCase();
    const trendingKeywords = [
      'new', 'just announced', 'recently', 'latest', 'trending',
      'hot opportunity', 'don\'t miss', 'limited time'
    ];
    return trendingKeywords.some(keyword => text.includes(keyword));
  }

  calculateUrgency(title, snippet) {
    const text = `${title} ${snippet}`.toLowerCase();
    
    if (text.includes('deadline soon') || text.includes('closing soon') || 
        text.includes('last chance') || text.includes('deadline this month')) {
      return 'HIGH';
    }
    
    if (text.includes('deadline') || text.includes('apply now') ||
        text.includes('limited spots')) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  cleanGoogleUrl(url) {
    try {
      if (!url.startsWith('http')) {
        return 'https://www.google.com' + url;
      }
      
      const urlObj = new URL(url);
      const realUrl = urlObj.searchParams.get('url') || 
                     urlObj.searchParams.get('q') ||
                     url;
      
      return realUrl;
    } catch {
      return url;
    }
  }


// ==========================================
// URL NORMALIZATION - Add after cleanGoogleUrl()
// ==========================================

/**
 * Normalizes URLs to prevent duplicates from URL variations
 * Handles: trailing slashes, query params, www prefix, protocols
 */
normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    // Remove whitespace
    url = url.trim();

    // Ensure protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const urlObj = new URL(url);
    
    // Normalize hostname: remove www, convert to lowercase
    let hostname = urlObj.hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, '');
    
    // Normalize pathname: remove trailing slash, lowercase
    let pathname = urlObj.pathname.toLowerCase();
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'ref', 'source', 'fbclid', 'gclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid'
    ];
    
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    // Sort remaining query params for consistency
    const sortedParams = new URLSearchParams(
      [...urlObj.searchParams.entries()].sort()
    );
    
    // Reconstruct URL
    const normalizedUrl = `https://${hostname}${pathname}${
      sortedParams.toString() ? '?' + sortedParams.toString() : ''
    }`;
    
    return normalizedUrl;
    
  } catch (error) {
    console.error(`URL normalization failed for: ${url}`, error.message);
    return url; // Return original if normalization fails
  }
}

/**
 * Generate a fingerprint from scholarship title for semantic deduplication
 * Handles: case, special chars, years, common words
 */
generateTitleFingerprint(title) {
  if (!title || typeof title !== 'string') {
    return null;
  }

  // Lowercase and remove special characters
  let fingerprint = title.toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove special chars
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
  
  // Remove common noise words
  const noiseWords = [
    'scholarship', 'scholarships', 'program', 'programme', 
    'opportunity', 'opportunities', 'fully', 'funded',
    'international', 'students', 'applications', 'open',
    'the', 'for', 'in', 'at', 'and', 'or'
  ];
  
  const words = fingerprint.split(' ').filter(word => 
    word.length > 2 && !noiseWords.includes(word)
  );
  
  // Remove years (2024, 2025, etc.)
  const wordsNoYears = words.filter(word => !/^\d{4}$/.test(word));
  
  // Sort words alphabetically for consistency
  const sortedWords = wordsNoYears.sort();
  
  // Create fingerprint
  fingerprint = sortedWords.join(' ').substring(0, 100);
  
  return fingerprint || null;
}

/**
 * Enhanced deduplication using both URL and title fingerprints
 */
deduplicateEnhanced(results) {
  console.log(`🔍 Enhanced deduplication: ${results.length} raw results`);
  
  const urlMap = new Map();
  const titleFingerprintMap = new Map();
  const uniqueResults = [];
  
  for (const result of results) {
    if (!result || !result.url || !result.title) {
      continue;
    }
    
    // Normalize URL
    const normalizedUrl = this.normalizeUrl(result.url);
    if (!normalizedUrl) continue;
    
    // Check URL-based duplicates
    if (urlMap.has(normalizedUrl)) {
      console.log(`   ⚠️  Duplicate URL detected: ${result.title.substring(0, 50)}...`);
      continue;
    }
    
    // Generate title fingerprint
    const titleFingerprint = this.generateTitleFingerprint(result.title);
    
    // Check title-based duplicates
    if (titleFingerprint && titleFingerprintMap.has(titleFingerprint)) {
      const existing = titleFingerprintMap.get(titleFingerprint);
      console.log(`   ⚠️  Semantic duplicate detected:`);
      console.log(`       Original: ${existing.title.substring(0, 50)}...`);
      console.log(`       Duplicate: ${result.title.substring(0, 50)}...`);
      
      // Keep the one with higher relevance score
      if ((result.relevanceScore || 50) > (existing.relevanceScore || 50)) {
        console.log(`       → Replacing with higher relevance version`);
        const index = uniqueResults.indexOf(existing);
        uniqueResults[index] = {
          ...result,
          url: normalizedUrl,
          titleFingerprint
        };
        urlMap.set(normalizedUrl, result);
        titleFingerprintMap.set(titleFingerprint, result);
      }
      continue;
    }
    
    // Add to unique results
    urlMap.set(normalizedUrl, result);
    if (titleFingerprint) {
      titleFingerprintMap.set(titleFingerprint, result);
    }
    
    uniqueResults.push({
      ...result,
      url: normalizedUrl,
      titleFingerprint
    });
  }
  
  console.log(`✅ Enhanced deduplication complete:`);
  console.log(`   Input: ${results.length} results`);
  console.log(`   Output: ${uniqueResults.length} unique results`);
  console.log(`   Removed: ${results.length - uniqueResults.length} duplicates\n`);
  
  return uniqueResults;
}



  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'Unknown Source';
    }
  }

  getRandomHeaders() {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
    ];

    return {
      'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    };
  }

  deduplicateByUrl(results) {
    const seen = new Set();
    return results.filter(result => {
      if (!result.url) return false;
      const key = result.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================
  // SAMPLE DATA GENERATION (from Code B)
  // ==========================================
  generateEnhancedSampleData() {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    
    return [
      {
        title: `Chevening Scholarships ${nextYear}`,
        url: 'https://www.chevening.org/scholarships',
        description: 'UK government fully funded Masters scholarships',
        snippet: 'Fully funded Masters in UK',
        source: 'Chevening',
        university: 'UK Universities',
        country: 'UK',
        level: 'Masters',
        funding: 'Fully Funded',
        fundingType: 'Fully Funded',
        amount: '£30,000+',
        deadline: `November 5, ${nextYear}`,
        applicationDeadline: `November 5, ${nextYear}`,
        program: 'Masters',
        requirements: ["Bachelor's degree", 'Work experience'],
        relevanceScore: 95,
        trending: true,
        urgency: 'HIGH',
        scrapedAt: new Date().toISOString(),
        searchQuery: 'sample'
      },
      {
        title: `DAAD Scholarships ${nextYear}`,
        url: 'https://www.daad.de/en/',
        description: 'German scholarships for international students',
        snippet: 'Study in Germany with funding',
        source: 'DAAD',
        university: 'German Universities',
        country: 'Germany',
        level: 'Masters',
        funding: 'Fully Funded',
        fundingType: 'Fully Funded',
        amount: '€934/month',
        deadline: `October 15, ${nextYear}`,
        applicationDeadline: `October 15, ${nextYear}`,
        program: 'Masters',
        requirements: ["Bachelor's degree", 'Language proficiency'],
        relevanceScore: 92,
        trending: true,
        urgency: 'HIGH',
        scrapedAt: new Date().toISOString(),
        searchQuery: 'sample'
      },
      {
        title: `Commonwealth Scholarships ${nextYear}`,
        url: 'https://cscuk.fcdo.gov.uk/scholarships/',
        description: 'UK scholarships for Commonwealth countries',
        snippet: 'Fully funded Masters and PhD',
        source: 'Commonwealth',
        university: 'UK Universities',
        country: 'UK',
        level: 'Masters',
        funding: 'Fully Funded',
        fundingType: 'Fully Funded',
        amount: 'Full coverage',
        deadline: `December 14, ${nextYear}`,
        applicationDeadline: `December 14, ${nextYear}`,
        program: 'Masters & PhD',
        requirements: ['Commonwealth citizen', "Bachelor's degree"],
        relevanceScore: 90,
        trending: true,
        urgency: 'HIGH',
        scrapedAt: new Date().toISOString(),
        searchQuery: 'sample'
      }
    ];
  }

  // ==========================================
  // HEALTH STATUS & UTILITIES
  // ==========================================
  getHealthStatus() {
    return {
      configured: true,
      googleApiConfigured: !!(this.googleApiKey && this.googleCseId),
      tiers: {
        tier1a: 'Google Custom Search API',
        tier1b: 'DuckDuckGo Search',
        tier1c: 'Google HTML Scraping',
        tier2: 'RSS Feeds',
        tier3: `${this.scholarshipSites.length} Direct Websites`,
        tier4: 'Sample Data Fallback'
      },
      cached: this.cache.length,
      lastScrape: this.lastScrape ? new Date(this.lastScrape).toISOString() : null,
      stats: this.requestStats,
      quotaRemaining: {
        googleApi: this.googleApiKey ? `${this.requestStats.googleApi}/100 daily` : 'Not configured'
      }
    };
  }

  clearCache() {
    const size = this.cache.length;
    this.cache = [];
    this.lastScrape = null;
    console.log(`🧹 Cleared scraper cache (${size} items)`);
  }

  getSampleData() {
    return this.sampleData;
  }
}

module.exports = new ScraperService();
