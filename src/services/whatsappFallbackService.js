// whatsappFallbackService.js
const axios = require('axios');

class WhatsAppFallbackService {
  constructor() {
    this.whapiToken = process.env.WHAPI_TOKEN || null;
    this.whapiBaseUrl = 'https://gate.whapi.cloud';
    
    // Target WhatsApp groups
    this.targetGroups = [
      {
        id: '923186211470-1599272722@g.us',
        name: 'Bright Scholarship 53'
      },
      {
        id: '120363402569445171@g.us',
        name: 'Scholarship Region H25'
      }
    ];
    
    this.requestStats = {
      messagesScanned: 0,
      urlsFound: 0,
      redirectsFollowed: 0,
      scholarshipsExtracted: 0,
      failed: 0
    };
  }

  // ==========================================
  // MAIN ENTRY POINT: Check if fallback needed
  // ==========================================
  async checkAndActivateFallback(currentUnpostedCount) {
    // Activate fallback if no unposted scholarships
    if (currentUnpostedCount === 0) {
      console.log('\n🚨 ========================================');
      console.log('   NO UNPOSTED SCHOLARSHIPS DETECTED');
      console.log('   ACTIVATING WHATSAPP FALLBACK');
      console.log('========================================\n');
      
      return await this.scrapeWhatsAppGroups();
    }
    
    return [];
  }

  // ==========================================
  // SCRAPE WHATSAPP GROUPS
  // ==========================================
  async scrapeWhatsAppGroups() {
    if (!this.whapiToken) {
      console.error('❌ WHAPI_TOKEN not configured in .env');
      return [];
    }

    const allScholarships = [];
    
    for (const group of this.targetGroups) {
      console.log(`📱 Processing group: ${group.name}...`);
      
      try {
        // Fetch recent messages
        const messages = await this.getGroupMessages(group.id, 100);
        console.log(`   ✅ Retrieved ${messages.length} messages\n`);
        
        // Extract scholarship data
        const scholarships = await this.extractScholarshipsFromMessages(messages, group.name);
        allScholarships.push(...scholarships);
        
        console.log(`   📊 Extracted ${scholarships.length} scholarships\n`);
        
        // Rate limiting
        await this.delay(2000);
        
      } catch (error) {
        console.error(`   ❌ Error processing ${group.name}:`, error.message);
        this.requestStats.failed++;
      }
    }
    
    console.log('\n========================================');
    console.log('📊 WhatsApp Scraping Summary:');
    console.log(`   Messages scanned: ${this.requestStats.messagesScanned}`);
    console.log(`   URLs found: ${this.requestStats.urlsFound}`);
    console.log(`   Redirects followed: ${this.requestStats.redirectsFollowed}`);
    console.log(`   Scholarships extracted: ${allScholarships.length}`);
    console.log(`   Failed: ${this.requestStats.failed}`);
    console.log('========================================\n');
    
    return allScholarships;
  }

  // ==========================================
  // FETCH MESSAGES FROM GROUP
  // ==========================================
  async getGroupMessages(chatId, limit = 100) {
    try {
      const response = await axios.get(
        `${this.whapiBaseUrl}/messages/list/${chatId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.whapiToken}`,
            'Accept': 'application/json'
          },
          params: {
            count: limit
          },
          timeout: 30000
        }
      );
      
      return response.data.messages || [];
      
    } catch (error) {
      console.error(`Failed to fetch messages: ${error.message}`);
      return [];
    }
  }

  // ==========================================
  // EXTRACT SCHOLARSHIPS FROM MESSAGES
  // ==========================================
  async extractScholarshipsFromMessages(messages, groupName) {
    const scholarships = [];
    
    for (const message of messages) {
      this.requestStats.messagesScanned++;
      
      const text = message.text?.body || '';
      
      // Check if message is scholarship-related
      if (!this.isScholarshipMessage(text)) {
        continue;
      }
      
      // Extract URLs
      const urls = this.extractUrls(text);
      
      if (urls.length === 0) {
        continue;
      }
      
      this.requestStats.urlsFound += urls.length;
      
      // Process each URL
      for (const url of urls) {
        try {
          // Follow redirects to get actual scholarship URL
          const finalUrl = await this.followRedirects(url);
          
          // Extract scholarship details
          const scholarship = await this.extractScholarshipDetails(
            text,
            finalUrl,
            groupName,
            message
          );
          
          if (scholarship) {
            scholarships.push(scholarship);
            this.requestStats.scholarshipsExtracted++;
          }
          
          // Rate limiting
          await this.delay(1000);
          
        } catch (error) {
          console.log(`      ⚠️  Failed to process URL ${url.substring(0, 50)}...`);
          this.requestStats.failed++;
        }
      }
    }
    
    return scholarships;
  }

  // ==========================================
  // FOLLOW REDIRECTS TO GET ACTUAL URL
  // ==========================================
  async followRedirects(url, maxRedirects = 5) {
    console.log(`      🔗 Following redirects: ${url.substring(0, 60)}...`);
    
    try {
      const response = await axios.get(url, {
        maxRedirects: maxRedirects,
        validateStatus: (status) => status < 400,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      // Get final URL after redirects
      const finalUrl = response.request.res.responseUrl || url;
      
      this.requestStats.redirectsFollowed++;
      
      // Check if we landed on a real scholarship page
      if (this.isLandingPage(finalUrl)) {
        console.log(`      ⚠️  Detected landing page, trying to extract real URL...`);
        
        // Try to extract actual scholarship URL from landing page
        const realUrl = await this.extractRealUrlFromLandingPage(response.data, finalUrl);
        
        if (realUrl && realUrl !== finalUrl) {
          console.log(`      ✅ Extracted real URL: ${realUrl.substring(0, 60)}...`);
          return realUrl;
        }
      }
      
      console.log(`      ✅ Final URL: ${finalUrl.substring(0, 60)}...`);
      return finalUrl;
      
    } catch (error) {
      console.log(`      ❌ Redirect follow failed: ${error.message}`);
      return url; // Return original if redirect fails
    }
  }

  // ==========================================
  // DETECT LANDING/AD PAGES
  // ==========================================
  isLandingPage(url) {
    const landingPageIndicators = [
      'linktr.ee',
      'bit.ly',
      'tinyurl.com',
      'ow.ly',
      'shorturl',
      '/go/',
      '/redirect',
      '/out/',
      '/link/',
      'click.here',
      '/aff/',
      '/ref/'
    ];
    
    return landingPageIndicators.some(indicator => 
      url.toLowerCase().includes(indicator)
    );
  }

  // ==========================================
  // EXTRACT REAL URL FROM LANDING PAGE
  // ==========================================
  async extractRealUrlFromLandingPage(html, landingUrl) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    // Look for scholarship-related links
    const scholarshipLinks = [];
    
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      
      if (!href) return;
      
      // Check if link text contains scholarship keywords
      if (this.containsScholarshipKeywords(text)) {
        const fullUrl = href.startsWith('http') 
          ? href 
          : new URL(href, landingUrl).href;
        scholarshipLinks.push(fullUrl);
      }
    });
    
    // Return first scholarship-related link
    if (scholarshipLinks.length > 0) {
      return scholarshipLinks[0];
    }
    
    return landingUrl;
  }

  // ==========================================
  // CHECK IF MESSAGE IS SCHOLARSHIP-RELATED
  // ==========================================
  isScholarshipMessage(text) {
    if (!text || text.length < 20) return false;
    
    const scholarshipKeywords = [
      'scholarship', 'fully funded', 'application', 'deadline',
      'university', 'masters', 'phd', 'bachelor', 'undergraduate',
      'apply now', 'funding', 'tuition', 'stipend', 'grant',
      'fellowship', 'study abroad', 'international students'
    ];
    
    const textLower = text.toLowerCase();
    
    return scholarshipKeywords.some(keyword => textLower.includes(keyword));
  }

  // ==========================================
  // EXTRACT URLS FROM TEXT
  // ==========================================
  extractUrls(text) {
    if (!text) return [];
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex) || [];
    
    // Clean URLs (remove trailing punctuation)
    return matches.map(url => 
      url.replace(/[.,;!?)]+$/, '')
    );
  }

  // ==========================================
  // EXTRACT SCHOLARSHIP DETAILS
  // ==========================================
  async extractScholarshipDetails(messageText, url, groupName, message) {
    console.log(`      📝 Extracting details from message...`);
    
    const text = messageText.toLowerCase();
    
    // Extract title (first line or key phrase)
    let title = this.extractTitle(messageText);
    
    // Extract country
    const countries = [
      'USA', 'UK', 'Canada', 'Germany', 'Australia', 'Netherlands',
      'Sweden', 'Norway', 'Denmark', 'Switzerland', 'France', 'Italy',
      'Japan', 'Singapore', 'New Zealand', 'Ireland', 'Nigeria'
    ];
    
    let country = 'Multiple Countries';
    for (const c of countries) {
      if (text.includes(c.toLowerCase())) {
        country = c;
        break;
      }
    }
    
    // Extract level
    let level = 'Masters';
    if (text.includes('phd') || text.includes('doctoral')) level = 'PhD';
    else if (text.includes('undergraduate') || text.includes('bachelor')) level = 'Undergraduate';
    else if (text.includes('postdoc')) level = 'Postdoctoral';
    
    // Extract funding type
    let funding = 'Varies';
    if (text.includes('fully funded') || text.includes('full funding')) {
      funding = 'Fully Funded';
    } else if (text.includes('partial')) {
      funding = 'Partial Funding';
    }
    
    // Extract deadline
    const deadline = this.extractDeadline(messageText);
    
    // Extract university
    const university = this.extractUniversity(messageText);
    
    return {
      title: title,
      url: url,
      description: messageText.substring(0, 300) + '...',
      snippet: messageText.substring(0, 150) + '...',
      source: `WhatsApp: ${groupName}`,
      university: university,
      country: country,
      level: level,
      funding: funding,
      fundingType: funding,
      amount: funding === 'Fully Funded' ? 'Full Coverage' : 'Varies',
      deadline: deadline,
      applicationDeadline: deadline,
      program: level,
      requirements: ['Check website for requirements'],
      relevanceScore: 85,
      trending: true,
      urgency: this.calculateUrgency(deadline),
      scrapedAt: new Date().toISOString(),
      searchQuery: 'whatsapp-fallback',
      whatsappMetadata: {
        groupId: message.from,
        groupName: groupName,
        messageId: message.id,
        timestamp: message.timestamp,
        sender: message.from_name || 'Unknown'
      }
    };
  }

  // ==========================================
  // HELPER: EXTRACT TITLE
  // ==========================================
  extractTitle(text) {
    // Try to get first line as title
    const lines = text.split('\n').filter(line => line.trim().length > 10);
    
    if (lines.length > 0) {
      let title = lines[0].trim();
      
      // Clean up common prefixes
      title = title.replace(/^(scholarship|opportunity|apply|new):\s*/gi, '');
      
      // Limit length
      if (title.length > 100) {
        title = title.substring(0, 97) + '...';
      }
      
      return title;
    }
    
    return 'Scholarship Opportunity ' + new Date().getFullYear();
  }

  // ==========================================
  // HELPER: EXTRACT UNIVERSITY
  // ==========================================
  extractUniversity(text) {
    const uniMatch = text.match(/(?:at|university of|college of)\s+([A-Z][a-zA-Z\s&]+?)(?:\s|,|\.|\||$)/i);
    return uniMatch ? uniMatch[1].trim() : 'Check website';
  }

  // ==========================================
  // HELPER: EXTRACT DEADLINE
  // ==========================================
  extractDeadline(text) {
    // Look for date patterns
    const datePatterns = [
      /deadline[:\s]+([a-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{1,2}\s+[a-z]+\s+\d{4})/i,
      /([a-z]+\s+\d{1,2},\s+\d{4})/i
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return 'Check website';
  }

  // ==========================================
  // HELPER: CALCULATE URGENCY
  // ==========================================
  calculateUrgency(deadline) {
    if (deadline === 'Check website') return 'MEDIUM';
    
    try {
      const deadlineDate = new Date(deadline);
      const now = new Date();
      const daysUntil = Math.floor((deadlineDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 7) return 'HIGH';
      if (daysUntil <= 30) return 'MEDIUM';
      return 'LOW';
    } catch {
      return 'MEDIUM';
    }
  }

  // ==========================================
  // HELPER: CHECK SCHOLARSHIP KEYWORDS
  // ==========================================
  containsScholarshipKeywords(text) {
    const keywords = ['scholarship', 'apply', 'application', 'deadline', 'university'];
    return keywords.some(keyword => text.includes(keyword));
  }

  // ==========================================
  // HELPER: DELAY
  // ==========================================
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================
  // GET STATS
  // ==========================================
  getStats() {
    return {
      configured: !!this.whapiToken,
      targetGroups: this.targetGroups.length,
      stats: this.requestStats
    };
  }
}

module.exports = new WhatsAppFallbackService();