
// const axios = require('axios');
// const cheerio = require('cheerio');
// const groqService = require('./groqService');

// class ScraperService {
//   constructor() {
//     this.baseSearchUrl = 'https://www.google.com/search';
//     this.lastScrape = null;
//     this.cache = [];
//     this.cacheDuration = 1000 * 60 * 60; // 1 hour
    
//     // Enhanced sample data for when scraping fails
//     this.sampleData = this.generateEnhancedSampleData();
    
//     // Direct scholarship website scrapers
//     this.scholarshipSites = [
//       {
//         name: 'ScholarshipPortal',
//         url: 'https://www.scholarshipportal.com/scholarships',
//         scraper: this.scrapeScholarshipPortal.bind(this)
//       },
//       {
//         name: 'Scholars4Dev',
//         url: 'https://www.scholars4dev.com',
//         scraper: this.scrapeScholars4Dev.bind(this)
//       },
//       {
//         name: 'FindAMasters',
//         url: 'https://www.findamasters.com/funding/listings.aspx',
//         scraper: this.scrapeFindAMasters.bind(this)
//       },
//       {
//         name: 'StudyPortals',
//         url: 'https://www.mastersportal.com/scholarships',
//         scraper: this.scrapeStudyPortals.bind(this)
//       },
//       {
//         name: 'InternationalScholarships',
//         url: 'https://www.internationalscholarships.com',
//         scraper: this.scrapeInternationalScholarships.bind(this)
//       },
//         {
//         name: 'ScholarshipsAds',
//         url: 'https://www.scholarshipsads.com',
//         scraper: this.scrapeScholarshipsAds.bind(this)
//       },
//       {
//         name: 'AfterSchoolAfrica', 
//         url: 'https://www.afterschoolafrica.com/scholarships',
//         scraper: this.scrapeAfterSchoolAfrica.bind(this)
//       },
//       {
//         name: 'OpportunitiesForAfricans',
//         url: 'https://www.opportunitiesforafricans.com',
//         scraper: this.scrapeOpportunitiesForAfricans.bind(this)
//       },
//       {
//         name: 'ScholarshipsAds',
//         url: 'https://www.scholarshipsads.com',
//         scraper: this.scrapeScholarshipsAds.bind(this)
//       },
//       {
//         name: 'AfterSchoolAfrica',
//         url: 'https://www.afterschoolafrica.com/scholarships',
//         scraper: this.scrapeAfterSchoolAfrica.bind(this)
//       },
//       {
//         name: 'OpportunitiesForAfricans',
//         url: 'https://www.opportunitiesforafricans.com',
//         scraper: this.scrapeOpportunitiesForAfricans.bind(this)
//       }
//     ];
    
//     // Hardcoded reliable sources as fallback
//     this.reliableSources = [
//       { name: 'ScholarshipPortal', domain: 'scholarshipportal.com' },
//       { name: 'FindAMasters', domain: 'findamasters.com' },
//       { name: 'MastersPortal', domain: 'mastersportal.com' },
//       { name: 'Scholars4Dev', domain: 'scholars4dev.com' },
//       { name: 'DAAD', domain: 'daad.de' },
//       { name: 'Chevening', domain: 'chevening.org' },
//       { name: 'Commonwealth', domain: 'cscuk.fcdo.gov.uk' }
//     ];
//   }
// /**
//  * Retry helper for unreliable scrapers
//  * @param {Function} scraperFn - Scraper function to retry
//  * @param {string} name - Scraper name for logging
//  * @param {number} maxRetries - Max retry attempts
//  * @returns {Promise<Array>} Results
//  */
// async retryScaper(scraperFn, name, maxRetries = 2) {
//   for (let attempt = 1; attempt <= maxRetries; attempt++) {
//     try {
//       return await scraperFn();
//     } catch (error) {
//       if (attempt === maxRetries) {
//         console.log(`   ❌ ${name} failed after ${maxRetries} attempts: ${error.message}`);
//         return [];
//       }
//       console.log(`   ⚠️ ${name} attempt ${attempt} failed, retrying...`);
//       await this.delay(2000);
//     }
//   }
//   return [];
// }
// /**
//  * Filter out low-quality results
//  * @param {Array} results - Scraped results
//  * @returns {Array} Filtered high-quality results
//  */




// /**
//  * Filter out low-quality results - FIXED VERSION
//  * @param {Array} results - Scraped results
//  * @returns {Array} Filtered high-quality results
//  */
// filterQualityResults(results) {
//   console.log(`   🔍 Filtering ${results.length} raw results...`);
  
//   const filtered = results.filter(result => {
//     // CRITICAL FIX: Validate result structure first
//     if (!result || typeof result !== 'object') {
//       console.log(`   ⚠️ Filtered: Invalid result object`);
//       return false;
//     }

//     // CRITICAL FIX: Ensure title exists and is a string
//     if (!result.title || typeof result.title !== 'string') {
//       console.log(`   ⚠️ Filtered: Missing or invalid title`);
//       return false;
//     }

//     // Now safe to use toLowerCase()
//     const titleLower = result.title.toLowerCase();
    
//     // Filter 1: Poor title keywords
//     const badTitleKeywords = [
//       'quick search',
//       'search result',
//       'find scholarship',
//       'click here',
//       'view more',
//       'read more',
//       'search for',
//       'browse',
//       'filter',
//       'istock',
//       '©',
//       'image credit',
//       'photo credit'
//     ];
    
//     const hasBadKeyword = badTitleKeywords.some(keyword => titleLower.includes(keyword));
    
//     if (hasBadKeyword) {
//       console.log(`   ⚠️ Filtered: Bad keyword in "${result.title.substring(0, 40)}..."`);
//       return false;
//     }
    
//     // Filter 2: Broken/truncated titles with "+ s"
//     if (titleLower.match(/\d+\+\s*s\s/)) {
//       console.log(`   ⚠️ Filtered: Broken title "${result.title.substring(0, 40)}..."`);
//       return false;
//     }
    
//     // Filter 3: Too short titles (less than 25 chars)
//     if (result.title.length < 25) {
//       console.log(`   ⚠️ Filtered: Short title (${result.title.length} chars)`);
//       return false;
//     }
    
//     // Filter 4: Invalid URLs
//     if (!result.url || typeof result.url !== 'string' || result.url === '#' || result.url === 'javascript:void(0)') {
//       console.log(`   ⚠️ Filtered: Invalid URL "${result.url}"`);
//       return false;
//     }
    
//     // Filter 5: All placeholder data
//     if (result.university === 'Check website' && 
//         result.country === 'Multiple Countries' &&
//         result.funding === 'Varies' &&
//         result.deadline === 'Check website' &&
//         result.amount === 'Varies') {
//       console.log(`   ⚠️ Filtered: All placeholders in "${result.title.substring(0, 40)}..."`);
//       return false;
//     }
    
//     // Filter 6: Description is copyright text or image attribution
//     // CRITICAL FIX: Safely handle description
//     const descLower = (result.description && typeof result.description === 'string') 
//       ? result.description.toLowerCase() 
//       : '';
      
//     if (descLower.includes('©') || 
//         descLower.includes('istock') ||
//         descLower.includes('shutterstock') ||
//         descLower.includes('getty') ||
//         descLower.match(/^(image|photo)\s+(credit|by)/)) {
//       console.log(`   ⚠️ Filtered: Copyright description in "${result.title.substring(0, 40)}..."`);
//       return false;
//     }
    
//     // Filter 7: Description too short (less than 30 chars and not containing "scholarship")
//     if (descLower.length > 0 && 
//         descLower.length < 30 && 
//         !descLower.includes('scholarship')) {
//       console.log(`   ⚠️ Filtered: Short description (${descLower.length} chars)`);
//       return false;
//     }
    
//     // Filter 9: Generic "Visit website" description with no real snippet
//     const snippetLower = (result.snippet && typeof result.snippet === 'string')
//       ? result.snippet.toLowerCase()
//       : '';
      
//     if ((descLower === 'visit website for full details' || 
//          descLower === 'visit website for details') &&
//         (!snippetLower || snippetLower === descLower)) {
//       console.log(`   ⚠️ Filtered: Generic description in "${result.title.substring(0, 40)}..."`);
//       return false;
//     }
    
//     // Filter 8: Title has insufficient letters
//     const alphaCount = (result.title.match(/[a-zA-Z]/g) || []).length;
//     if (alphaCount < 15) {
//       console.log(`   ⚠️ Filtered: Few letters (${alphaCount}) in "${result.title.substring(0, 40)}..."`);
//       return false;
//     }
    
//     return true;
//   });

//   console.log(`   ✅ Kept ${filtered.length} quality results (removed ${results.length - filtered.length})\n`);
//   return filtered;
// }

// /**
//  * Scrape ScholarshipPortal.com
//  */
// async scrapeScholarshipPortal() {
//   try {
//     console.log('   📘 Scraping ScholarshipPortal.com...');
//     const response = await axios.get('https://www.scholarshipportal.com/scholarships', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000,
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('.ScholarshipItem, .scholarship-item, [class*="scholarship"]').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('h3, h2, .title, [class*="title"]').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('p, .description, [class*="description"]').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.scholarshipportal.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'Visit website for full details',
//           description: description || 'Visit website for full details',
//           source: 'scholarshipportal.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 80,
//           trending: false,
//           urgency: 'MEDIUM',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ ScholarshipPortal: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ ScholarshipPortal failed: ${error.message}`);
//     return [];
//   }
// }

// /**
//  * Scrape Scholars4Dev.com with retry logic
//  */
// async scrapeScholars4Dev() {
//   const maxRetries = 2;
  
//   for (let attempt = 1; attempt <= maxRetries; attempt++) {
//     try {
//       console.log(`   📗 Scraping Scholars4Dev.com... (Attempt ${attempt}/${maxRetries})`);
//       const response = await axios.get('https://www.scholars4dev.com', {
//         headers: this.getRandomHeaders(),
//         timeout: 20000, // Increased to 20 seconds
//         maxRedirects: 5
//       });

//       const $ = cheerio.load(response.data);
//       const results = [];

//       $('article, .post, .scholarship-post, [class*="post"]').each((i, element) => {
//         if (results.length >= 10) return false;

//         const $elem = $(element);
//         const title = $elem.find('h2, h3, .entry-title, [class*="title"]').first().text().trim();
//         const link = $elem.find('a').first().attr('href');
//         const description = $elem.find('.entry-content, .excerpt, p').first().text().trim();

//         if (title && link) {
//           const fullUrl = link.startsWith('http') 
//             ? link 
//             : `https://www.scholars4dev.com${link.startsWith('/') ? link : '/' + link}`;
          
//           const details = this.extractScholarshipDetails(title, description);
          
//           results.push({
//             ...details,
//             url: fullUrl,
//             snippet: description || 'Visit website for full details',
//             description: description || 'Visit website for full details',
//             source: 'scholars4dev.com',
//             searchQuery: 'direct scrape',
//             relevanceScore: 85,
//             trending: true,
//             urgency: 'MEDIUM',
//             scrapedAt: new Date().toISOString()
//           });
//         }
//       });

//       console.log(`   ✅ Scholars4Dev: ${results.length} results`);
//       return results;
      
//     } catch (error) {
//       if (attempt === maxRetries) {
//         console.log(`   ❌ Scholars4Dev failed after ${maxRetries} attempts: ${error.message}`);
//         return [];
//       }
//       console.log(`   ⚠️ Attempt ${attempt} failed, retrying...`);
//       await this.delay(2000); // Wait 2 seconds before retry
//     }
//   }
  
//   return [];
// }
 
// async scrapeFindAMasters() {
//   try {
//     console.log('   📙 Scraping FindAMasters.com...');
//     const response = await axios.get('https://www.findamasters.com/funding/listings.aspx', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000,
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('.courseLink, .course-list-item, [class*="course"]').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('a, h3, .courseName').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('p, .courseDetails').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.findamasters.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'Visit website for full details',
//           description: description || 'Visit website for full details',
//           source: 'findamasters.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 82,
//           trending: false,
//           urgency: 'MEDIUM',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ FindAMasters: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ FindAMasters failed: ${error.message}`);
//     return [];
//   }
// }
  
// async scrapeStudyPortals() {
//   try {
//     console.log('   📕 Scraping MastersPortal.com...');
//     const response = await axios.get('https://www.mastersportal.com/scholarships', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000,
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('.SearchResultItem, .result-item, [class*="result"]').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('h2, h3, .Title').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('p, .Description').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.mastersportal.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'Visit website for full details',
//           description: description || 'Visit website for full details',
//           source: 'mastersportal.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 81,
//           trending: false,
//           urgency: 'LOW',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ MastersPortal: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ MastersPortal failed: ${error.message}`);
//     return [];
//   }
// }
 
// async scrapeInternationalScholarships() {
//   try {
//     console.log('   📔 Scraping InternationalScholarships.com...');
//     const response = await axios.get('https://www.internationalscholarships.com', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000,
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('article, .scholarship, .post, [class*="scholarship"]').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('h2, h3, .title').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('p, .excerpt, .description').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.internationalscholarships.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'Visit website for full details',
//           description: description || 'Visit website for full details',
//           source: 'internationalscholarships.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 78,
//           trending: false,
//           urgency: 'LOW',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ InternationalScholarships: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ InternationalScholarships failed: ${error.message}`);
//     return [];
//   }
// }
  
// async scrapeScholarshipWebsites() {
//   console.log('\n🌐 Tier 2: Scraping scholarship websites directly...\n');
//   const allResults = [];

//   for (const site of this.scholarshipSites) {
//     try {
//       const results = await site.scraper();
//       allResults.push(...results);
      
//       // Be polite - delay between sites
//       await this.delay(2000 + Math.random() * 2000);
//     } catch (error) {
//       console.log(`   ⚠️ ${site.name} error: ${error.message}`);
//     }
//   }

//   console.log(`\n📊 Raw scraping results: ${allResults.length} total\n`);
  
//   // Apply quality filter - THIS IS CRITICAL
//   const filteredResults = this.filterQualityResults(allResults);
  
//   console.log(`📊 Direct website scraping: ${filteredResults.length} quality results\n`);
//   return filteredResults;
// }



// /**
//  * Scrape ScholarshipsAds.com
//  */
// async scrapeScholarshipsAds() {
//   try {
//     console.log('   📘 Scraping ScholarshipsAds.com...');
//     const response = await axios.get('https://www.scholarshipsads.com', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000,
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('article, .post, .scholarship-item').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('h2, h3, .title').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('p, .excerpt').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.scholarshipsads.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'Visit website for full details',
//           description: description || 'Visit website for full details',
//           source: 'scholarshipsads.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 80,
//           trending: false,
//           urgency: 'MEDIUM',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ ScholarshipsAds: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ ScholarshipsAds failed: ${error.message}`);
//     return [];
//   }
// }


// // }
// /**
//  * Scrape AfterSchoolAfrica.com
//  */
// async scrapeAfterSchoolAfrica() {
//   try {
//     console.log('   📙 Scraping AfterSchoolAfrica.com...');
//     const response = await axios.get('https://www.afterschoolafrica.com/scholarships/', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000,
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('article, .post, .scholarship').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('h2, h3, .entry-title').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('.entry-summary, .excerpt, p').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.afterschoolafrica.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'Scholarship opportunity for African students',
//           description: description || 'Scholarship opportunity for African students',
//           source: 'afterschoolafrica.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 82,
//           trending: true,
//           urgency: 'MEDIUM',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ AfterSchoolAfrica: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ AfterSchoolAfrica failed: ${error.message}`);
//     return [];
//   }
// }
// /**



// /**
//  * Scrape OpportunitiesForAfricans.com
//  */
// async scrapeOpportunitiesForAfricans() {
//   try {
//     console.log('   📕 Scraping OpportunitiesForAfricans.com...');
//     const response = await axios.get('https://www.opportunitiesforafricans.com', {
//       headers: this.getRandomHeaders(),
//       timeout: 20000, // Increased timeout
//       maxRedirects: 5
//     });

//     const $ = cheerio.load(response.data);
//     const results = [];

//     $('article, .post-item, .opportunity').each((i, element) => {
//       if (results.length >= 10) return false;

//       const $elem = $(element);
//       const title = $elem.find('h2, h3, .post-title').first().text().trim();
//       const link = $elem.find('a').first().attr('href');
//       const description = $elem.find('.post-excerpt, .excerpt, p').first().text().trim();

//       if (title && link) {
//         const fullUrl = link.startsWith('http') 
//           ? link 
//           : `https://www.opportunitiesforafricans.com${link.startsWith('/') ? link : '/' + link}`;
        
//         const details = this.extractScholarshipDetails(title, description);
        
//         results.push({
//           ...details,
//           url: fullUrl,
//           snippet: description || 'International opportunity for African students',
//           description: description || 'International opportunity for African students',
//           source: 'opportunitiesforafricans.com',
//           searchQuery: 'direct scrape',
//           relevanceScore: 83,
//           trending: true,
//           urgency: 'MEDIUM',
//           scrapedAt: new Date().toISOString()
//         });
//       }
//     });

//     console.log(`   ✅ OpportunitiesForAfricans: ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.log(`   ❌ OpportunitiesForAfricans failed: ${error.message}`);
//     return [];
//   }
// }


//   /**
//    * Generate enhanced sample scholarship data
//    * @returns {Array} Sample scholarships
//    */
//   generateEnhancedSampleData() {
//     const currentYear = new Date().getFullYear();
//     const nextYear = currentYear + 1;
    
//     return [
//       {
//         title: `Chevening Scholarships ${nextYear} for International Students`,
//         url: 'https://www.chevening.org/scholarships',
//         description: 'The UK government\'s international awards programme. Fully funded Masters scholarships for outstanding emerging leaders.',
//         snippet: 'Fully funded one-year Master\'s degree at any UK university. Covers tuition, living expenses, flights, and visa costs.',
//         source: 'Chevening Scholarships',
//         university: 'Various UK Universities',
//         country: 'UK',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '£30,000+ per year',
//         applicationDeadline: `November 5, ${nextYear}`,
//         deadline: `November 5, ${nextYear}`,
//         program: 'Masters Study',
//         requirements: ['Bachelor\'s degree', 'Work experience', 'English proficiency', 'Return to home country'],
//         relevanceScore: 95,
//         trending: true,
//         urgency: 'HIGH',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `DAAD Scholarships Germany ${nextYear} - Masters & PhD Programs`,
//         url: 'https://www.daad.de/en/study-and-research-in-germany/scholarships',
//         description: 'German Academic Exchange Service scholarships for international students. Study in Germany with full funding.',
//         snippet: 'Monthly stipend of €934 for Masters and €1,200 for PhD students. Health insurance and travel allowance included.',
//         source: 'DAAD Germany',
//         university: 'German Universities',
//         country: 'Germany',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '€934/month',
//         applicationDeadline: `October 15, ${nextYear}`,
//         deadline: `October 15, ${nextYear}`,
//         program: 'Masters & PhD Study',
//         requirements: ['Bachelor\'s degree', 'German or English proficiency', 'Motivation letter', 'Academic excellence'],
//         relevanceScore: 92,
//         trending: true,
//         urgency: 'MEDIUM',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `Commonwealth Scholarships ${nextYear} for Developing Country Students`,
//         url: 'https://cscuk.fcdo.gov.uk/scholarships',
//         description: 'UK government scholarships for students from Commonwealth countries. Masters and PhD programs available.',
//         snippet: 'Full tuition, airfare, living expenses covered. For students who cannot afford to study in the UK.',
//         source: 'Commonwealth Scholarship Commission',
//         university: 'UK Universities',
//         country: 'UK',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: 'Full Coverage',
//         applicationDeadline: `December 14, ${currentYear}`,
//         deadline: `December 14, ${currentYear}`,
//         program: 'Masters & PhD Study',
//         requirements: ['Commonwealth citizen', 'Bachelor\'s degree', 'Unable to afford UK study', 'Return commitment'],
//         relevanceScore: 90,
//         trending: false,
//         urgency: 'MEDIUM',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `Fulbright Foreign Student Program ${nextYear} - Study in USA`,
//         url: 'https://foreign.fulbrightonline.org',
//         description: 'US government scholarship for international graduate students. Full funding for Masters and PhD.',
//         snippet: 'Covers tuition, airfare, living stipend, and health insurance. One of the most prestigious international scholarships.',
//         source: 'Fulbright Program',
//         university: 'US Universities',
//         country: 'USA',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '$30,000+ per year',
//         applicationDeadline: `February 28, ${nextYear}`,
//         deadline: `February 28, ${nextYear}`,
//         program: 'Masters & PhD Study',
//         requirements: ['Bachelor\'s degree', 'English proficiency', 'Leadership potential', 'Return to home country'],
//         relevanceScore: 94,
//         trending: true,
//         urgency: 'HIGH',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `Erasmus Mundus Joint Masters ${nextYear} - Study in Europe`,
//         url: 'https://www.eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue',
//         description: 'EU-funded international Masters programs. Study in multiple European countries with full scholarships.',
//         snippet: 'Tuition covered plus monthly allowance of €1,000. Study in 2-3 European countries during your Masters.',
//         source: 'Erasmus Mundus',
//         university: 'European Universities',
//         country: 'Multiple Countries',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '€1,000/month',
//         applicationDeadline: `January 15, ${nextYear}`,
//         deadline: `January 15, ${nextYear}`,
//         program: 'Joint Masters Programs',
//         requirements: ['Bachelor\'s degree', 'English proficiency', 'Academic excellence', 'Program-specific requirements'],
//         relevanceScore: 88,
//         trending: true,
//         urgency: 'LOW',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `Swedish Institute Scholarships ${nextYear} - Masters in Sweden`,
//         url: 'https://si.se/en/apply/scholarships',
//         description: 'Full scholarships for international students to study Masters in Sweden. Covers all expenses.',
//         snippet: 'Full tuition waiver, monthly living allowance of 12,000 SEK, travel grant, and insurance included.',
//         source: 'Swedish Institute',
//         university: 'Swedish Universities',
//         country: 'Sweden',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '12,000 SEK/month',
//         applicationDeadline: `February 20, ${nextYear}`,
//         deadline: `February 20, ${nextYear}`,
//         program: 'Masters Study',
//         requirements: ['Bachelor\'s degree', 'English proficiency', 'Leadership experience', 'Return commitment'],
//         relevanceScore: 86,
//         trending: false,
//         urgency: 'LOW',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `Australia Awards Scholarships ${nextYear} - Study in Australia`,
//         url: 'https://www.dfat.gov.au/people-to-people/australia-awards',
//         description: 'Australian government scholarships for developing countries. Full funding for undergraduate and postgraduate study.',
//         snippet: 'Full tuition, return air travel, living expenses, and health cover for students from eligible countries.',
//         source: 'Australia Awards',
//         university: 'Australian Universities',
//         country: 'Australia',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: 'Full Coverage',
//         applicationDeadline: `April 30, ${nextYear}`,
//         deadline: `April 30, ${nextYear}`,
//         program: 'Masters & Undergraduate Study',
//         requirements: ['From eligible country', 'Bachelor\'s degree', 'English proficiency', 'Return to contribute to home country'],
//         relevanceScore: 87,
//         trending: false,
//         urgency: 'LOW',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `Japanese Government MEXT Scholarships ${nextYear}`,
//         url: 'https://www.mext.go.jp/en/policy/education/highered/title02/detail02/sdetail02/1373897.htm',
//         description: 'Japanese Ministry of Education scholarships for international students. Masters and PhD programs.',
//         snippet: 'Monthly allowance of ¥144,000, tuition exemption, and return airfare covered by Japanese government.',
//         source: 'MEXT Japan',
//         university: 'Japanese Universities',
//         country: 'Japan',
//         level: 'Masters',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '¥144,000/month',
//         applicationDeadline: `March 31, ${nextYear}`,
//         deadline: `March 31, ${nextYear}`,
//         program: 'Masters & PhD Study',
//         requirements: ['Bachelor\'s degree', 'Under 35 years', 'Japanese or English proficiency', 'Good health'],
//         relevanceScore: 85,
//         trending: false,
//         urgency: 'MEDIUM',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       // Add Nigerian-specific opportunities
//       {
//         title: `MTN Nigeria Scholarship ${nextYear} for Nigerian Undergraduates`,
//         url: 'https://www.mtnonline.com/foundation/scholarships',
//         description: 'MTN Foundation scholarship for brilliant but financially challenged Nigerian students.',
//         snippet: 'Full tuition coverage and stipends for Nigerian undergraduate students across various universities.',
//         source: 'MTN Foundation',
//         university: 'Nigerian Universities',
//         country: 'Nigeria',
//         level: 'Undergraduate',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '₦200,000 per year',
//         applicationDeadline: `January 31, ${nextYear}`,
//         deadline: `January 31, ${nextYear}`,
//         program: 'Undergraduate Study',
//         requirements: ['Nigerian citizen', 'Minimum 3.0 CGPA', 'Financial need', 'Full-time student'],
//         relevanceScore: 90,
//         trending: true,
//         urgency: 'MEDIUM',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       },
//       {
//         title: `NNPC/SNEPCo National University Scholarship ${nextYear}`,
//         url: 'https://nnpcgroup.com/Public/NNPCDocuments.aspx?ID=45',
//         description: 'Nigerian National Petroleum Corporation scholarship for Nigerian undergraduates in petroleum-related fields.',
//         snippet: 'Covers tuition and provides monthly stipends for Nigerian students studying in Nigerian universities.',
//         source: 'NNPC Nigeria',
//         university: 'Nigerian Universities',
//         country: 'Nigeria',
//         level: 'Undergraduate',
//         funding: 'Fully Funded',
//         fundingType: 'Fully Funded',
//         amount: '₦100,000 per semester',
//         applicationDeadline: `December 15, ${currentYear}`,
//         deadline: `December 15, ${currentYear}`,
//         program: 'Engineering & Science Study',
//         requirements: ['Nigerian citizen', 'Studying in Nigerian university', 'Good academic standing', 'Engineering/Science major'],
//         relevanceScore: 88,
//         trending: true,
//         urgency: 'HIGH',
//         scrapedAt: new Date().toISOString(),
//         searchQuery: 'sample data'
//       }
//     ];
//   }

//   /**
//    * Generate intelligent search queries based on current trends
//    * @returns {Array<string>} Search queries
//    */
//   generateSearchQueries() {
//     const currentYear = new Date().getFullYear();
//     const nextYear = currentYear + 1;
//     const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    
//     const baseQueries = [
//       // Trending & Urgent
//       `fully funded scholarships ${nextYear} deadline soon`,
//       `scholarships open now ${nextYear} international students`,
//       `trending scholarships ${currentMonth} ${currentYear}`,
//       `new scholarships announced ${currentYear}`,
      
//       // By Level
//       `masters scholarships ${nextYear} fully funded`,
//       `phd scholarships ${nextYear} international students`,
//       `undergraduate scholarships ${nextYear} no application fee`,
      
//       // By Popular Destinations
//       `scholarships in USA ${nextYear} fully funded`,
//       `UK scholarships ${nextYear} international students`,
//       `Canada scholarships ${nextYear} masters`,
//       `Germany scholarships ${nextYear} tuition free`,
//       `Australia scholarships ${nextYear} fully funded`,
      
//       // By Field (Popular)
//       `computer science scholarships ${nextYear}`,
//       `engineering scholarships ${nextYear} fully funded`,
//       `business scholarships ${nextYear} MBA`,
//       `data science scholarships ${nextYear}`,
      
//       // By Funding Type
//       `full ride scholarships ${nextYear}`,
//       `tuition waiver scholarships ${nextYear}`,
//       `scholarship with stipend ${nextYear}`,
      
//       // Urgent/Trending
//       `scholarship deadline this month`,
//       `scholarships closing soon ${currentYear}`,
//       `last minute scholarships ${nextYear}`,
      
//       // Special Categories
//       `scholarships for african students ${nextYear}`,
//       `scholarships no IELTS required ${nextYear}`,
//       `scholarships no GRE required ${nextYear}`
//     ];

//     return baseQueries;
//   }

//   /**
//    * Scrape Google for scholarships with enhanced parsing (Tier 1)
//    * @param {string} query - Search query
//    * @param {number} maxResults - Max results to fetch
//    * @returns {Promise<Array>} Scholarship results
//    */
//   async scrapeGoogle(query, maxResults = 10) {
//     try {
//       console.log(`🔍 Google search: "${query}"`);
      
//       const response = await axios.get(this.baseSearchUrl, {
//         params: {
//           q: query,
//           num: maxResults,
//           hl: 'en',
//           gl: 'us'
//         },
//         headers: this.getRandomHeaders(),
//         timeout: 15000
//       });

//       const $ = cheerio.load(response.data);
//       const results = [];

//       // Try multiple selector strategies for Google's changing HTML
//       const selectorStrategies = [
//         // Modern Google search results
//         { container: '.g', title: 'h3', link: 'a', snippet: '.VwiC3b' },
//         { container: '.tF2Cxc', title: '.DKV0Md', link: 'a', snippet: '.lEBKkf' },
//         { container: '.Gx5Zad', title: 'h3', link: 'a', snippet: '.s3v9rd' },
//         // Older formats
//         { container: '.rc', title: 'h3', link: 'a', snippet: '.s' },
//         { container: 'div[data-hveid]', title: 'h3', link: 'a', snippet: 'div[style*="line-height"]' }
//       ];

//       // Try each selector strategy
//       for (const strategy of selectorStrategies) {
//         $(strategy.container).each((i, element) => {
//           if (results.length >= maxResults) return false;

//           const $elem = $(element);
//           const title = $elem.find(strategy.title).text().trim();
//           const $link = $elem.find(strategy.link).first();
//           const url = $link.attr('href');
//           const snippet = $elem.find(strategy.snippet).text().trim();

//           if (title && url && this.isScholarshipRelevant(title, snippet)) {
//             const cleanUrl = this.cleanGoogleUrl(url);
            
//             // Avoid duplicates within this scrape
//             if (!results.find(r => r.url === cleanUrl)) {
//               results.push({
//                 title: this.generateTitle({ title, university, country, level, program }),
//                 // title: this.cleanTitle(title),
//                 url: cleanUrl,
//                 snippet: snippet,
//                 description: snippet,
//                 source: this.extractDomain(cleanUrl),
//                 searchQuery: query,
//                 relevanceScore: this.calculateRelevance(title, snippet, query),
//                 trending: this.isTrending(title, snippet),
//                 urgency: this.calculateUrgency(title, snippet),
//                 scrapedAt: new Date().toISOString(),
//                 ...this.extractScholarshipDetails(title, snippet)
//               });
//             }
//           }
//         });

//         if (results.length > 0) break; // Found results with this strategy
//       }

//       console.log(`   ✅ Found ${results.length} results`);
//       return results;

//     } catch (error) {
//       console.error(`   ❌ Google search failed: ${error.message}`);
//       return [];
//     }
//   }

// /**
//  * Extract scholarship details from text
//  * @param {string} title - Scholarship title
//  * @param {string} snippet - Scholarship description
//  * @returns {Object} Extracted details
//  */



// /**
//  * FIXED: Extract scholarship details from text
//  * @param {string} title - Scholarship title
//  * @param {string} snippet - Scholarship description
//  * @returns {Object} Extracted details
//  */
// extractScholarshipDetails(title, snippet) {
//   // CRITICAL FIX: Ensure title is a valid string
//   const safeTitle = (title && typeof title === 'string') ? title : 'Scholarship Opportunity';
//   const safeSnippet = (snippet && typeof snippet === 'string') ? snippet : '';
//   const text = `${safeTitle} ${safeSnippet}`.toLowerCase();
  
//   // Extract university
//   const uniMatch = text.match(/(?:at|university of|college of)\s+([A-Z][a-zA-Z\s&]+?)(?:\s|,|\.|\||$)/i);
//   const university = uniMatch ? uniMatch[1].trim() : 'Check website';

//   // Extract country
//   const countries = ['USA', 'UK', 'Canada', 'Germany', 'Australia', 'Netherlands', 
//                     'Sweden', 'Norway', 'Denmark', 'Switzerland', 'France', 'Italy',
//                     'Spain', 'Japan', 'Singapore', 'New Zealand', 'Ireland', 'Nigeria'];
//   let country = 'Multiple Countries';
//   for (const c of countries) {
//     if (text.includes(c.toLowerCase())) {
//       country = c;
//       break;
//     }
//   }

//   // Extract level
//   let level = 'Masters';
//   if (text.includes('phd') || text.includes('doctoral')) level = 'PhD';
//   else if (text.includes('undergraduate') || text.includes('bachelor')) level = 'Undergraduate';
//   else if (text.includes('postdoc')) level = 'Postdoctoral';
//   else if (text.includes('internship')) level = 'Internship';

//   // Extract funding type
//   let funding = 'Varies';
//   if (text.includes('fully funded') || text.includes('full funding')) {
//     funding = 'Fully Funded';
//   } else if (text.includes('tuition waiver') || text.includes('tuition free')) {
//     funding = 'Tuition Waiver';
//   } else if (text.includes('partial')) {
//     funding = 'Partial Funding';
//   }

//   // Extract deadline
//   const deadlineMatch = text.match(/deadline[:\s]+([a-z]+\s+\d{1,2},?\s+\d{4})/i);
//   const deadline = deadlineMatch ? deadlineMatch[1] : 'Check website';

//   // Extract amount if mentioned
//   const amountMatch = text.match(/\$[\d,]+|\£[\d,]+|€[\d,]+|₦[\d,]+/);
//   const amount = amountMatch ? amountMatch[0] : funding;

//   // Extract program
//   const program = this.extractProgram(safeTitle);

//   // CRITICAL FIX: Generate title properly - pass the raw title, not the generated one
//   const generatedTitle = this.generateTitle({
//     title: safeTitle,
//     university,
//     country,
//     level,
//     program
//   });

//   return {
//     title: generatedTitle, // Use the generated title
//     university,
//     country,
//     level,
//     funding,
//     fundingType: funding,
//     amount,
//     applicationDeadline: deadline,
//     deadline,
//     program,
//     requirements: this.extractRequirements(text)
//   };
// }

//  * 
//  /**
//  * Generate comprehensive title for opportunity
//  * @param {Object} data - Opportunity data
//  * @returns {string} Generated title
//  */
// generateTitle(data) {
//   const year = new Date().getFullYear() + 1;
//   let { title, university, country, level, program } = data;
  
//   // Clean up broken title artifacts
//   if (title) {
//     title = title
//       // Fix truncated scholarship words: "10+ s" → "10+ Scholarships"
//       .replace(/(\d+\+?\s*)s\s/gi, '$1Scholarships ')
//       // Fix "Shared  Scheme" → "Shared Scholarship Scheme"
//       .replace(/Shared\s+Scheme/gi, 'Shared Scholarship Scheme')
//       // Fix "Chancellor's International s" → "Chancellor's International Scholarships"
//       .replace(/International\s+s\s/gi, 'International Scholarships ')
//       // Fix any standalone " s " → " Scholarships "
//       .replace(/\s+s\s+/gi, ' Scholarships ')
//       // Remove copyright symbols
//       .replace(/©.*$/g, '')
//       // Remove extra spaces
//       .replace(/\s+/g, ' ')
//       .trim();
//   }
  
//   // If title is now good (more than 30 chars), use it
//   if (title && title.length > 30) {
//     // Add year if not present
//     if (!title.includes(year.toString()) && !title.includes((year - 1).toString())) {
//       return `${title} ${year}`;
//     }
//     return title;
//   }
  
//   // Build title from components if original title is poor
//   let generatedTitle = '';
  
//   // Start with university if available and not generic
//   if (university && 
//       university !== 'Check website' && 
//       university !== 'Multiple Institutions' &&
//       university.length > 3) {
//     generatedTitle = university;
//   }
  
//   // Add level/program
//   if (level === 'Internship') {
//     generatedTitle += generatedTitle ? ' Internship Program' : 'Internship Program';
//   } else if (program && program !== 'Various Programs' && program.length > 5) {
//     generatedTitle += generatedTitle ? ` ${program}` : program;
//   } else if (level) {
//     generatedTitle += generatedTitle ? ` ${level} Scholarship` : `${level} Scholarship`;
//   } else {
//     generatedTitle += generatedTitle ? ' Scholarship Program' : 'Scholarship Program';
//   }
  
//   // Add country if available and not generic
//   if (country && country !== 'Multiple Countries') {
//     generatedTitle += ` in ${country}`;
//   }
  
//   // Add year
//   if (!generatedTitle.includes(year.toString())) {
//     generatedTitle += ` ${year}`;
//   }
  
//   return generatedTitle || title || 'Scholarship Opportunity ' + year;
// }



// /**
//  * Extract program name from title
//  * @param {string} title - Scholarship title
//  * @returns {string} Program name
//  */
// extractProgram(title) {
//   let program = title
//     .replace(/scholarship|fellowship|grant|award|funding/gi, '')
//     .replace(/fully funded|international students|applications open/gi, '')
//     .replace(/\d{4}/g, '') // Remove years
//     .trim();
  
//   return program || 'Various Programs';
// }

// /**
//  * Extract requirements from text
//  * @param {string} text - Scholarship text
//  * @returns {Array<string>} Requirements
//  */
// extractRequirements(text) {
//   const requirements = [];
  
//   if (text.includes('bachelor') || text.includes('undergraduate degree')) {
//     requirements.push('Bachelor\'s degree');
//   }
//   if (text.includes('gpa') || text.includes('cgpa')) {
//     requirements.push('Minimum GPA requirement');
//   }
//   if (text.includes('ielts') || text.includes('toefl') || text.includes('english')) {
//     requirements.push('English proficiency test');
//   }
//   if (text.includes('gre') || text.includes('gmat')) {
//     requirements.push('Standardized test scores');
//   }
//   if (text.includes('recommendation') || text.includes('reference')) {
//     requirements.push('Letters of recommendation');
//   }
//   if (text.includes('statement of purpose') || text.includes('motivation letter')) {
//     requirements.push('Statement of purpose');
//   }

//   return requirements.length > 0 ? requirements : ['Check website for requirements'];
// }
//   /**
//    * Extract program name from title
//    * @param {string} title - Scholarship title
//    * @returns {string} Program name
//    */
//   extractProgram(title) {
//     let program = title
//       .replace(/scholarship|fellowship|grant|award|funding/gi, '')
//       .replace(/fully funded|international students|applications open/gi, '')
//       .trim();
    
//     return program || 'Various Programs';
//   }

//   /**
//    * Extract requirements from text
//    * @param {string} text - Scholarship text
//    * @returns {Array<string>} Requirements
//    */
//   extractRequirements(text) {
//     const requirements = [];
    
//     if (text.includes('bachelor') || text.includes('undergraduate degree')) {
//       requirements.push('Bachelor\'s degree');
//     }
//     if (text.includes('gpa') || text.includes('cgpa')) {
//       requirements.push('Minimum GPA requirement');
//     }
//     if (text.includes('ielts') || text.includes('toefl') || text.includes('english')) {
//       requirements.push('English proficiency test');
//     }
//     if (text.includes('gre') || text.includes('gmat')) {
//       requirements.push('Standardized test scores');
//     }
//     if (text.includes('recommendation') || text.includes('reference')) {
//       requirements.push('Letters of recommendation');
//     }
//     if (text.includes('statement of purpose') || text.includes('motivation letter')) {
//       requirements.push('Statement of purpose');
//     }

//     return requirements.length > 0 ? requirements : ['Check website for requirements'];
//   }

//   /**
//    * Check if result is scholarship-relevant
//    * @param {string} title - Result title
//    * @param {string} snippet - Result snippet
//    * @returns {boolean} Is relevant
//    */
//   isScholarshipRelevant(title, snippet) {
//     const text = `${title} ${snippet}`.toLowerCase();
    
//     const scholarshipKeywords = [
//       'scholarship', 'funding', 'financial aid', 'fully funded', 'fellowship',
//       'grant', 'bursary', 'tuition', 'stipend', 'assistantship', 'award'
//     ];

//     const relevantKeywords = scholarshipKeywords.filter(keyword => 
//       text.includes(keyword)
//     );

//     if (relevantKeywords.length === 0) return false;

//     const excludeKeywords = [
//       'job opening', 'career', 'employment', 'hiring', 'recruitment',
//       'buy now', 'shop', 'for sale', 'price', 'discount'
//     ];

//     const hasExcluded = excludeKeywords.some(keyword => text.includes(keyword));
//     if (hasExcluded) return false;

//     return true;
//   }

//   /**
//    * Calculate relevance score
//    * @param {string} title - Title
//    * @param {string} snippet - Snippet
//    * @param {string} query - Search query
//    * @returns {number} Score 0-100
//    */
//   calculateRelevance(title, snippet, query) {
//     let score = 50;
//     const text = `${title} ${snippet}`.toLowerCase();
//     const queryTerms = query.toLowerCase().split(' ');

//     queryTerms.forEach(term => {
//       if (title.toLowerCase().includes(term)) score += 10;
//       if (snippet.toLowerCase().includes(term)) score += 5;
//     });

//     if (text.includes('fully funded')) score += 20;
//     if (text.includes('deadline')) score += 10;
//     if (text.includes('international students')) score += 15;
//     if (text.includes('no application fee')) score += 10;
//     if (text.includes('deadline soon') || text.includes('closing soon')) score += 15;

//     const reliableDomains = this.reliableSources.map(s => s.domain);
//     if (reliableDomains.some(domain => text.includes(domain))) score += 15;

//     return Math.min(score, 100);
//   }

//   /**
//    * Check if scholarship is trending
//    * @param {string} title - Title
//    * @param {string} snippet - Snippet
//    * @returns {boolean} Is trending
//    */
//   isTrending(title, snippet) {
//     const text = `${title} ${snippet}`.toLowerCase();
//     const trendingKeywords = [
//       'new', 'just announced', 'recently', 'latest', 'trending',
//       'hot opportunity', 'don\'t miss', 'limited time'
//     ];

//     return trendingKeywords.some(keyword => text.includes(keyword));
//   }

//   /**
//    * Calculate urgency level
//    * @param {string} title - Title
//    * @param {string} snippet - Snippet
//    * @returns {string} Urgency level
//    */
//   calculateUrgency(title, snippet) {
//     const text = `${title} ${snippet}`.toLowerCase();
    
//     if (text.includes('deadline soon') || 
//         text.includes('closing soon') || 
//         text.includes('last chance') ||
//         text.includes('deadline this month')) {
//       return 'HIGH';
//     }
    
//     if (text.includes('deadline') || 
//         text.includes('apply now') ||
//         text.includes('limited spots')) {
//       return 'MEDIUM';
//     }
    
//     return 'LOW';
//   }

//   /**
//    * Clean Google redirect URL
//    * @param {string} url - Google URL
//    * @returns {string} Clean URL
//    */
//   cleanGoogleUrl(url) {
//     try {
//       if (!url.startsWith('http')) {
//         return 'https://www.google.com' + url;
//       }
      
//       const urlObj = new URL(url);
//       const realUrl = urlObj.searchParams.get('url') || 
//                      urlObj.searchParams.get('q') ||
//                      url;
      
//       return realUrl;
//     } catch {
//       return url;
//     }
//   }

//   /**
//    * Clean title from formatting
//    * @param {string} title - Raw title
//    * @returns {string} Clean title
//    */
//   cleanTitle(title) {
//     return title
//       .replace(/\s*-\s*Google Search$/i, '')
//       .replace(/\s*\.\.\.$/, '')
//       .replace(/\s+/g, ' ')
//       .trim();
//   }

//   /**
//    * Extract domain from URL
//    * @param {string} url - URL
//    * @returns {string} Domain name
//    */
//   extractDomain(url) {
//     try {
//       const urlObj = new URL(url);
//       return urlObj.hostname.replace('www.', '');
//     } catch {
//       return 'Unknown Source';
//     }
//   }

//   /**
//    * Get random headers to avoid blocking
//    * @returns {Object} Headers
//    */
//   getRandomHeaders() {
//     const userAgents = [
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//       "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
//     ];

//     return {
//       'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
//       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//       'Accept-Language': 'en-US,en;q=0.5',
//       'Accept-Encoding': 'gzip, deflate, br',
//       'DNT': '1',
//       'Connection': 'keep-alive',
//       'Upgrade-Insecure-Requests': '1',
//       'Sec-Fetch-Dest': 'document',
//       'Sec-Fetch-Mode': 'navigate',
//       'Sec-Fetch-Site': 'none',
//       'Cache-Control': 'max-age=0'
//     };
//   }

//   getHeaders() {
//     return this.getRandomHeaders();
//   }

//   extractRealUrl(googleUrl) {
//     return this.cleanGoogleUrl(googleUrl);
//   }

//   delay(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
//   }

//   /**
//    * Multi-tier comprehensive scrape with fallback chain
//    * @returns {Promise<Array>} All scraped scholarships
//    */

  
//   async scrapeAll() {
//     try {
//       console.log('\n🎯 ========================================');
//       console.log('   MULTI-TIER SCHOLARSHIP SCRAPING');
//       console.log('========================================\n');
      
//       // Check cache first
//       if (this.cache.length > 0 && this.lastScrape) {
//         const timeSinceLastScrape = Date.now() - this.lastScrape;
//         if (timeSinceLastScrape < this.cacheDuration) {
//           console.log('📦 Returning cached scholarships');
//           console.log(`   Cache age: ${Math.round(timeSinceLastScrape / 1000 / 60)} minutes\n`);
//           return this.cache;
//         }
//       }
  
//       let allResults = [];
      
//       // ============================================
//       // TIER 1: Try Google Search First
//       // ============================================
//       console.log('🔍 TIER 1: Google Search\n');
      
//       const queries = this.generateSearchQueries();
//       const maxQueries = 3;
//       const selectedQueries = queries.slice(0, maxQueries);
      
//       for (let i = 0; i < selectedQueries.length; i++) {
//         const query = selectedQueries[i];
//         const results = await this.scrapeGoogle(query, 5);
//         allResults.push(...results);
        
//         if (i < selectedQueries.length - 1) {
//           await this.delay(3000 + Math.random() * 2000);
//         }
//       }
  
//       console.log(`\n📊 Tier 1 Results: ${allResults.length} scholarships\n`);
  
//       // ============================================
//       // TIER 2: If Google failed, scrape direct websites
//       // ============================================
//       if (allResults.length < 5) {
//         console.log('⚠️ Google results insufficient, activating Tier 2...\n');
        
//         // THIS IS THE CRITICAL PART - scrapeScholarshipWebsites() already applies the filter
//         const websiteResults = await this.scrapeScholarshipWebsites();
        
//         allResults.push(...websiteResults);
//         console.log(`📊 Tier 2 Results: ${websiteResults.length} quality scholarships\n`);
//       } else {
//         console.log('✅ Tier 1 successful, skipping Tier 2\n');
//       }
  
//       // ============================================
//       // TIER 3: If both failed, use sample data
//       // ============================================
//       if (allResults.length < 3) {
//         console.log('⚠️ All scraping failed, activating Tier 3 (Sample Data)...\n');
//         allResults = this.sampleData;
//         console.log(`📊 Tier 3 Results: ${allResults.length} sample scholarships\n`);
//       }
  
//       // Deduplicate and sort
//       const uniqueResults = this.deduplicateByUrl(allResults);
      
//       const sortedResults = uniqueResults.sort((a, b) => {
//         if (a.urgency === 'HIGH' && b.urgency !== 'HIGH') return -1;
//         if (b.urgency === 'HIGH' && a.urgency !== 'HIGH') return 1;
//         return b.relevanceScore - a.relevanceScore;
//       });
  
//       // Cache results
//       this.cache = sortedResults;
//       this.lastScrape = Date.now();
  
//       console.log('========================================');
//       console.log('✅ SCRAPING COMPLETED');
//       console.log('========================================');
//       console.log(`📊 Statistics:`);
//       console.log(`   Raw results: ${allResults.length}`);
//       console.log(`   Unique results: ${sortedResults.length}`);
//       console.log(`   High urgency: ${sortedResults.filter(r => r.urgency === 'HIGH').length}`);
//       console.log(`   Trending: ${sortedResults.filter(r => r.trending).length}`);
//       console.log(`   Fully Funded: ${sortedResults.filter(r => r.funding === 'Fully Funded').length}`);
//       console.log('========================================\n');
  
//       return sortedResults.slice(0, 30); // Return top 30
  
//     } catch (error) {
//       console.error('❌ Critical scraping error:', error.message);
//       console.log('📦 Using fallback sample data\n');
//       return this.sampleData;
//     }
//   }
//   deduplicateByUrl(results) {
//     const seen = new Set();
//     return results.filter(result => {
//       const key = result.url.toLowerCase();
//       if (seen.has(key)) return false;
//       seen.add(key);
//       return true;
//     });
//   }


  
//   async testScraping() {
//     console.log('\n🧪 ========================================');
//     console.log('   TESTING MULTI-TIER SCRAPER');
//     console.log('========================================\n');
    
//     try {
//       // Test Tier 1: Google
//       console.log('📍 Testing Tier 1: Google Search\n');
//       const testQuery = 'fully funded scholarships 2025 masters';
//       const googleResults = await this.scrapeGoogle(testQuery, 3);
//       console.log(`   Google: ${googleResults.length} results\n`);
  
//       // Test Tier 2: Direct websites (with filtering)
//       console.log('📍 Testing Tier 2: Direct Websites\n');
//       const websiteResults = await this.scrapeScholarshipWebsites(); // This already applies filter
//       console.log(`   Direct Websites: ${websiteResults.length} quality results\n`);
  
//       // Show Tier 3 info
//       console.log('📍 Tier 3: Sample Data Available\n');
//       console.log(`   Sample scholarships: ${this.sampleData.length}\n`);
  
//       const totalResults = googleResults.length + websiteResults.length;
      
//       console.log('========================================');
//       console.log('✅ TEST COMPLETED');
//       console.log('========================================');
//       console.log(`Summary:`);
//       console.log(`   Tier 1 (Google): ${googleResults.length}`);
//       console.log(`   Tier 2 (Websites): ${websiteResults.length} (filtered)`);
//       console.log(`   Tier 3 (Sample): ${this.sampleData.length}`);
//       console.log(`   Total Available: ${totalResults + this.sampleData.length}`);
//       console.log('========================================\n');
  
//       if (websiteResults.length > 0) {
//         console.log('Sample Website result:');
//         console.log(JSON.stringify(websiteResults[0], null, 2));
//       } else if (googleResults.length > 0) {
//         console.log('Sample Google result:');
//         console.log(JSON.stringify(googleResults[0], null, 2));
//       } else {
//         console.log('Sample fallback data:');
//         console.log(JSON.stringify(this.sampleData[0], null, 2));
//       }
      
//       return {
//         success: true,
//         message: 'Multi-tier scraper tested successfully',
//         tier1Google: googleResults.length,
//         tier2Websites: websiteResults.length,
//         tier3Sample: this.sampleData.length,
//         totalAvailable: totalResults + this.sampleData.length,
//         cached: this.cache.length,
//         lastScrape: this.lastScrape 
//           ? new Date(this.lastScrape).toLocaleString() 
//           : 'Never',
//         note: totalResults === 0 
//           ? 'All live scraping blocked - sample data available as fallback'
//           : `Successfully scraped ${totalResults} quality scholarships`
//       };
//     } catch (error) {
//       return {
//         success: false,
//         message: error.message,
//         error: error.stack,
//         fallbackAvailable: true,
//         sampleDataCount: this.sampleData.length
//       };
//     }
//   }
//   /**
//    * Get health status
//    * @returns {Object} Health status
//    */
//   getHealthStatus() {
//     return {
//       configured: true,
//       tiers: {
//         tier1: 'Google Search',
//         tier2: `${this.scholarshipSites.length} Scholarship Websites`,
//         tier3: 'Sample Data Fallback'
//       },
//       googleSearchEnabled: true,
//       directWebsitesEnabled: true,
//       sampleDataAvailable: this.sampleData.length,
//       cached: this.cache.length,
//       lastScrape: this.lastScrape 
//         ? new Date(this.lastScrape).toISOString() 
//         : null,
//       cacheAge: this.lastScrape 
//         ? Math.round((Date.now() - this.lastScrape) / 1000 / 60) + ' minutes'
//         : 'N/A',
//       fallbackEnabled: true
//     };
//   }

//   /**
//    * Clear cache
//    */
//   clearCache() {
//     const size = this.cache.length;
//     this.cache = [];
//     this.lastScrape = null;
//     console.log(`🧹 Cleared scraper cache (${size} items)`);
//   }

//   /**
//    * Get sample data directly (for when scraping fails)
//    * @returns {Array} Sample scholarships
//    */
//   getSampleData() {
//     return this.sampleData;
//   }
// }

// module.exports = new ScraperService();
///////////////////////////////////////////////////////////////////////////////


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
      const uniqueResults = this.deduplicateByUrl(allResults);
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
