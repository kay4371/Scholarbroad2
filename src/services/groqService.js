// ============================================
// FILE: services/groqService.js
// AI Analysis using Groq (Llama 3.3)
// ============================================

const axios = require('axios');

class GroqService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = 'llama-3.3-70b-versatile'; // Fastest and most capable
    this.cache = new Map();
    this.cacheDuration = 1000 * 60 * 60; // 1 hour
  }

  /**
   * Analyze scholarship opportunities with AI
   * @param {Array} opportunities - Raw scholarship data
   * @param {Object} userPreferences - User preferences and criteria
   * @returns {Promise<Object>} AI analysis results
   */
  async analyzeOpportunities(opportunities, userPreferences = {}) {
    try {
      const cacheKey = this.generateCacheKey(opportunities, userPreferences);
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheDuration) {
          console.log('📦 Returning cached AI analysis');
          return cached.data;
        }
      }

      console.log('🤖 Starting AI analysis...');
      console.log(`   Analyzing ${opportunities.length} opportunities`);
      console.log(`   Model: ${this.model}`);

      const prompt = this.buildAnalysisPrompt(opportunities, userPreferences);
      
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 3000,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const content = response.data.choices[0].message.content;
      console.log('✅ AI analysis completed');
      
      const analyzed = this.parseAIResponse(content);

      // Cache the results
      this.cache.set(cacheKey, {
        data: analyzed,
        timestamp: Date.now()
      });

      return analyzed;

    } catch (error) {
      console.error('❌ Groq API Error:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Groq API key. Check GROQ_API_KEY in .env');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Try again in a moment.');
      }
      
      // Return fallback analysis
      console.log('⚠️ Using fallback analysis');
      return this.fallbackAnalysis(opportunities);
    }
  }

  /**
   * Get system prompt for AI
   * @returns {string} System prompt
   */
  getSystemPrompt() {
    return `You are an expert scholarship analyst with 15+ years of experience in international education funding. Your expertise includes:

- Understanding funding mechanisms (scholarships, assistantships, fellowships)
- Evaluating university reputation and program quality
- Assessing application competitiveness
- Providing strategic application advice
- Identifying hidden opportunities and benefits
- Understanding market trends in global education

Analyze opportunities objectively and provide actionable insights. Always return valid JSON format without markdown formatting.

Key principles:
1. Prioritize fully-funded opportunities
2. Consider application competitiveness realistically
3. Provide specific, actionable strategies
4. Identify unique strengths of each opportunity
5. Be honest about challenges and competition levels`;
  }

  /**
   * Build analysis prompt
   * @param {Array} opportunities - Opportunities to analyze
   * @param {Object} preferences - User preferences
   * @returns {string} Formatted prompt
   */
  buildAnalysisPrompt(opportunities, preferences) {
    const opportunitySummary = opportunities.slice(0, 15).map((opp, idx) => ({
      id: idx,
      university: opp.university,
      program: opp.program || opp.title,
      country: opp.country,
      funding: opp.amount || opp.funding || opp.fundingType,
      deadline: opp.applicationDeadline || opp.deadline,
      description: opp.description,
      requirements: opp.requirements
    }));

    return `Analyze these scholarship opportunities for a student with the following profile:

STUDENT PREFERENCES:
- Target Level: ${preferences.level || 'Masters/PhD'}
- Field of Study: ${preferences.course || preferences.fieldOfStudy || 'Not specified'}
- Preferred Country: ${preferences.country || preferences.preferredCountry || 'Open to all'}
- Preferred Funding Type: ${preferences.preferredFunding || 'Any'}
- Minimum Funding Required: ${preferences.minFunding || 'Full funding preferred'}
- Special Requirements: ${preferences.specialRequirements || 'None'}
- GPA: ${preferences.gpa || 'Not specified'}
- Work Experience: ${preferences.workExperience || 'Not specified'} years

OPPORTUNITIES TO ANALYZE (${opportunitySummary.length} total):
${JSON.stringify(opportunitySummary, null, 2)}

Provide comprehensive analysis in this EXACT JSON format (no markdown, pure JSON):
{
  "topPicks": [
    {
      "id": 0,
      "matchScore": 85,
      "aiInsights": "Detailed analysis of why this is a strong match, considering funding, reputation, fit, and opportunities",
      "strengthIndicators": [
        "Specific strength 1",
        "Specific strength 2",
        "Specific strength 3"
      ],
      "applicationStrategy": "Concrete advice on how to strengthen application for THIS specific opportunity",
      "competitionLevel": "Low/Medium/High",
      "successProbability": "65-75%",
      "hiddenBenefits": [
        "Non-obvious benefit 1",
        "Non-obvious benefit 2"
      ],
      "potentialChallenges": [
        "Realistic challenge 1",
        "Realistic challenge 2"
      ],
      "timelineAdvice": "When to apply and key milestone dates"
    }
  ],
  "overallRecommendation": "Strategic advice considering all opportunities - which to prioritize, how many to apply to, timing strategy",
  "marketTrends": "Current trends in scholarship funding for this field and level - what's increasing, what's competitive",
  "alternativeStrategies": [
    "Alternative funding strategy 1",
    "Alternative funding strategy 2",
    "Alternative funding strategy 3"
  ],
  "applicationPriority": "Which applications to submit first and why",
  "budgetConsiderations": "Financial planning advice for application season"
}

Rules:
1. matchScore: 0-100 based on fit with student profile
2. Be realistic about competition levels
3. Provide SPECIFIC strategies, not generic advice
4. Consider program reputation, funding adequacy, and career outcomes
5. Identify opportunities that might be overlooked
6. Return ONLY valid JSON, no markdown code blocks`;
  }

  /**
   * Parse AI response and handle various formats
   * @param {string} content - Raw AI response
   * @returns {Object} Parsed analysis
   */
  parseAIResponse(content) {
    try {
      // Remove markdown code blocks if present
      let cleanJson = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      // Try to find JSON object in the response
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanJson);
      
      // Validate structure
      if (!parsed.topPicks || !Array.isArray(parsed.topPicks)) {
        throw new Error('Invalid response structure');
      }

      console.log(`✅ Successfully parsed ${parsed.topPicks.length} top picks`);
      return parsed;

    } catch (error) {
      console.error('⚠️ JSON parse error, using text extraction');
      return this.extractStructuredData(content);
    }
  }

  /**
   * Extract structured data from text response (fallback)
   * @param {string} content - AI response text
   * @returns {Object} Extracted data
   */
  extractStructuredData(content) {
    const lines = content.split('\n');
    const insights = [];
    const strategies = [];
    
    lines.forEach(line => {
      const lower = line.toLowerCase();
      if (lower.includes('strong') || lower.includes('excellent') || lower.includes('good match')) {
        insights.push(line.trim());
      }
      if (lower.includes('strategy') || lower.includes('recommend') || lower.includes('consider')) {
        strategies.push(line.trim());
      }
    });

    return {
      topPicks: [{
        id: 0,
        matchScore: 75,
        aiInsights: insights.slice(0, 3).join(' ') || 'Strong opportunity based on funding and program quality',
        strengthIndicators: [
          'International student support',
          'Full funding available',
          'Strong academic reputation'
        ],
        applicationStrategy: strategies[0] || 'Focus on highlighting academic achievements and relevant experience',
        competitionLevel: 'Medium',
        successProbability: '65-75%',
        hiddenBenefits: ['Networking opportunities', 'Research facilities access'],
        potentialChallenges: ['Competitive selection', 'Early application recommended']
      }],
      overallRecommendation: 'Apply to 5-7 programs with varying competition levels to maximize success',
      marketTrends: 'Increasing funding for STEM and interdisciplinary programs',
      alternativeStrategies: [
        'Consider research assistantships',
        'Explore regional scholarship programs',
        'Look into industry-sponsored opportunities'
      ]
    };
  }

  /**
   * Fallback analysis when AI is unavailable
   * @param {Array} opportunities - Opportunities to analyze
   * @returns {Object} Basic analysis
   */
  fallbackAnalysis(opportunities) {
    console.log('📊 Generating fallback analysis');
    
    return {
      topPicks: opportunities.slice(0, 5).map((opp, idx) => ({
        id: idx,
        matchScore: 70 + Math.floor(Math.random() * 20),
        aiInsights: `${opp.university} offers a comprehensive ${opp.program || opp.title} program with strong international student support and funding opportunities.`,
        strengthIndicators: [
          'Accredited institution with global recognition',
          'International student support services available',
          'Research and career development opportunities'
        ],
        applicationStrategy: 'Emphasize academic background, relevant experience, and clear career goals in your application materials.',
        competitionLevel: 'Medium',
        successProbability: '60-75%',
        hiddenBenefits: [
          'Access to alumni network',
          'Potential for industry connections'
        ],
        potentialChallenges: [
          'Competitive application process',
          'Strong English proficiency required'
        ],
        timelineAdvice: 'Begin application 2-3 months before deadline'
      })),
      overallRecommendation: 'Apply to multiple programs with varying competitiveness. Focus on those with rolling admissions for better chances.',
      marketTrends: 'Growing demand for international students in STEM fields, with increasing funding opportunities.',
      alternativeStrategies: [
        'Research assistantships as alternative funding',
        'Part-time campus employment opportunities',
        'External scholarship applications'
      ],
      applicationPriority: 'Start with programs having earlier deadlines and rolling admissions',
      budgetConsiderations: 'Plan for application fees ($50-$100 per application) and test fees (TOEFL/IELTS, GRE if required)'
    };
  }

  /**
   * Deep dive analysis for a specific opportunity
   * @param {Object} opportunity - Single opportunity to analyze
   * @param {Object} userProfile - Detailed user profile
   * @returns {Promise<Object>} Detailed analysis
   */
  async analyzeSpecificOpportunity(opportunity, userProfile = {}) {
    try {
      console.log(`🔍 Deep analysis for: ${opportunity.university} - ${opportunity.program}`);

      const prompt = `Provide an in-depth analysis of this specific scholarship opportunity:

OPPORTUNITY:
University: ${opportunity.university}
Program: ${opportunity.program || opportunity.title}
Country: ${opportunity.country}
Funding: ${opportunity.amount || opportunity.funding}
Deadline: ${opportunity.applicationDeadline || opportunity.deadline}
Description: ${opportunity.description}
Requirements: ${JSON.stringify(opportunity.requirements)}

STUDENT PROFILE:
${JSON.stringify(userProfile, null, 2)}

Provide detailed analysis in JSON format:
{
  "personalizedMatch": "Why this specific opportunity is perfect (or not) for THIS student",
  "applicationStrengths": ["strength 1", "strength 2", "strength 3"],
  "improvementAreas": ["area to improve 1", "area 2"],
  "detailedTimeline": {
    "startDate": "when to start preparing",
    "milestones": ["milestone 1", "milestone 2"],
    "deadlineBuffer": "recommended buffer before deadline"
  },
  "requiredDocuments": ["doc 1", "doc 2", "doc 3"],
  "documentTips": {
    "personalStatement": "specific advice",
    "recommendations": "specific advice",
    "cv": "specific advice"
  },
  "interviewTips": ["tip 1", "tip 2"],
  "competitorProfile": "who else is likely applying",
  "differentiationStrategy": "how to stand out",
  "estimatedCosts": {
    "application": "cost estimate",
    "tests": "test cost estimate",
    "total": "total estimate"
  },
  "postAcceptanceSteps": ["step 1", "step 2"]
}`;

      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert application consultant. Provide detailed, personalized advice.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.4,
          max_tokens: 2500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return this.parseAIResponse(response.data.choices[0].message.content);

    } catch (error) {
      console.error('❌ Specific analysis error:', error.message);
      return this.fallbackSpecificAnalysis(opportunity);
    }
  }

  /**
   * Fallback for specific opportunity analysis
   * @param {Object} opportunity - Opportunity details
   * @returns {Object} Basic specific analysis
   */
  fallbackSpecificAnalysis(opportunity) {
    return {
      personalizedMatch: `This program at ${opportunity.university} offers strong opportunities in your field with comprehensive funding support.`,
      applicationStrengths: [
        'Strong academic background',
        'Relevant experience in the field',
        'Clear career objectives'
      ],
      improvementAreas: [
        'Strengthen recommendation letters',
        'Enhance personal statement with specific examples',
        'Highlight unique experiences'
      ],
      detailedTimeline: {
        startDate: '2-3 months before deadline',
        milestones: [
          'Request recommendations (2 months before)',
          'Complete standardized tests (6 weeks before)',
          'Draft and revise essays (4 weeks before)',
          'Submit application (1 week before deadline)'
        ],
        deadlineBuffer: '1-2 weeks before official deadline'
      },
      requiredDocuments: [
        'Academic transcripts',
        'CV/Resume',
        'Personal statement',
        'Letters of recommendation (2-3)',
        'English proficiency test scores',
        'Copy of passport'
      ],
      documentTips: {
        personalStatement: 'Focus on your research interests, career goals, and why this specific program',
        recommendations: 'Choose recommenders who know your academic/professional work well',
        cv: 'Highlight relevant research, publications, and experience'
      },
      interviewTips: [
        'Research the program and faculty thoroughly',
        'Prepare specific questions about research opportunities',
        'Practice explaining your research interests clearly',
        'Be ready to discuss how you handle challenges'
      ],
      competitorProfile: 'Students with strong academic records and relevant research/work experience',
      differentiationStrategy: 'Emphasize unique perspectives, diverse experiences, and specific fit with program',
      estimatedCosts: {
        application: '$50-$100',
        tests: '$200-$300 (TOEFL/IELTS, GRE if required)',
        total: '$250-$400'
      },
      postAcceptanceSteps: [
        'Accept offer within deadline',
        'Apply for student visa',
        'Arrange accommodation',
        'Complete pre-arrival requirements',
        'Prepare for orientation'
      ]
    };
  }

  /**
   * Generate cache key for results
   * @param {Array} opportunities - Opportunities array
   * @param {Object} preferences - User preferences
   * @returns {string} Cache key
   */
  generateCacheKey(opportunities, preferences) {
    const oppIds = opportunities.slice(0, 5).map(o => 
      `${o.university}-${o.program}`.substring(0, 50)
    ).join('|');
    
    const prefString = JSON.stringify({
      level: preferences.level,
      course: preferences.course,
      country: preferences.country
    });
    
    return `${oppIds}-${prefString}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🧹 Cleared ${size} cached AI analyses`);
  }

  /**
   * Get service health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      configured: !!this.apiKey,
      model: this.model,
      cacheSize: this.cache.size,
      baseUrl: this.baseUrl
    };
  }

/**
 * Simple prompt analysis for field detection
 */
async analyzeWithPrompt(prompt) {
  try {
    const response = await axios.post(
      this.baseUrl,
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low temperature for consistent responses
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(`AI analysis failed: ${error.message}`);
  }
}


  /**
   * Test AI connection
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Groq AI connection...');
      
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: 'Say "OK" if you can read this.'
            }
          ],
          max_tokens: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Groq AI connection successful!');
      return {
        success: true,
        message: 'AI service is operational',
        model: this.model,
        response: response.data.choices[0].message.content
      };

    } catch (error) {
      console.error('❌ AI connection test failed:', error.message);
      return {
        success: false,
        message: error.message,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new GroqService();