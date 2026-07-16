/**
 * cvService.js
 *
 * Handles all CV-related operations:
 * 1. Parse uploaded CV (PDF/text) → extract structured data
 * 2. Generate Academic CV (properly formatted for university applications)
 * 3. Generate Reference Letter Request template
 * 4. Generate Cover Letter
 * 5. Extract keywords from CV for better professor matching
 *
 * All generation via Groq AI. Results stored in user_profiles.
 */

const Groq = require('groq-sdk');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── Parse CV text → structured summary ───────────────────────────────────────
async function parseCVText(cvText) {
  const systemPrompt = `You are an expert CV parser for academic applications.
Extract structured information from the CV text provided.
Return ONLY valid JSON — no markdown, no extra text.`;

  const userPrompt = `Parse this CV and extract structured data:

---
${cvText.slice(0, 4000)}
---

Return this exact JSON:
{
  "name": "Full name",
  "email": "email if found",
  "phone": "phone if found",
  "education": [
    {
      "degree": "BSc/MSc/PhD etc",
      "field": "field of study",
      "institution": "university name",
      "year": "graduation year",
      "gpa": "GPA or grade if mentioned",
      "thesis": "thesis title if mentioned"
    }
  ],
  "researchExperience": [
    {
      "title": "position/project title",
      "institution": "where",
      "duration": "dates",
      "description": "brief description"
    }
  ],
  "publications": ["list of publications if any"],
  "awards": ["list of awards, scholarships, honours"],
  "skills": ["technical and research skills"],
  "languages": ["languages and proficiency"],
  "volunteerWork": ["volunteer or community work"],
  "conferences": ["conferences attended or presented at"],
  "summary": "2-3 sentence professional summary of this person",
  "researchKeywords": ["5-8 research keywords extracted from experience"],
  "strengths": ["3-5 key academic strengths for scholarship applications"]
}`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1500
    });
    const raw = response.choices[0]?.message?.content || '{}';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('[CVService] Parse error:', err.message);
    return null;
  }
}

// ── Generate Academic CV ──────────────────────────────────────────────────────
async function generateAcademicCV(parsedCV, userProfile, targetDegree = 'PhD') {
  const systemPrompt = `You are an expert academic CV writer helping African students 
apply for ${targetDegree} positions at international universities.
Write a properly formatted academic CV that is 2-3 pages when printed.
Use clear section headers. Be specific and achievement-focused.
Sound professional but authentic — never generic.`;

  const userPrompt = `Generate a complete academic CV for this student:

PARSED CV DATA:
${JSON.stringify(parsedCV, null, 2)}

ADDITIONAL PROFILE INFO:
Research Interest: ${userProfile.researchInterest || ''}
Target Degree: ${targetDegree}
Target Country: ${userProfile.targetCountry || userProfile.country || ''}
Field: ${userProfile.field || ''}

Format the CV with these sections (only include sections that have content):
1. PERSONAL INFORMATION
2. RESEARCH INTERESTS
3. EDUCATION
4. RESEARCH EXPERIENCE
5. PUBLICATIONS & PRESENTATIONS (if any)
6. AWARDS & SCHOLARSHIPS (if any)
7. TECHNICAL SKILLS
8. LANGUAGES
9. VOLUNTEER & COMMUNITY SERVICE (if any)
10. REFERENCES (write "Available upon request")

Return as plain text with clear formatting. No JSON.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[CVService] Academic CV error:', err.message);
    return '';
  }
}

// ── Generate Cover Letter ─────────────────────────────────────────────────────
async function generateCoverLetter(parsedCV, userProfile, scholarshipTitle = '', university = '') {
  const systemPrompt = `You are an expert academic writing assistant helping African 
students write compelling cover letters for scholarship and graduate school applications.
Write in first person, professional but warm tone, 350-450 words.
Be specific to the scholarship/university mentioned. Sound genuinely motivated.`;

  const userPrompt = `Write a cover letter for:

STUDENT BACKGROUND:
${parsedCV.summary || ''}
Education: ${(parsedCV.education || []).map(e => `${e.degree} in ${e.field} from ${e.institution}`).join(', ')}
Research Experience: ${(parsedCV.researchExperience || []).slice(0, 2).map(r => r.title).join(', ')}
Awards: ${(parsedCV.awards || []).slice(0, 3).join(', ')}
Research Interest: ${userProfile.researchInterest || userProfile.field || ''}

APPLICATION DETAILS:
Scholarship/Programme: ${scholarshipTitle || 'graduate scholarship'}
University: ${university || 'target university'}
Target Degree: ${userProfile.degree || 'Masters/PhD'}
Country: ${userProfile.targetCountry || userProfile.country || ''}

Write a compelling cover letter. Return plain text only.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 800
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[CVService] Cover letter error:', err.message);
    return '';
  }
}

// ── Generate Reference Letter Request ────────────────────────────────────────
async function generateReferenceLetterRequest(parsedCV, userProfile, refereeType = 'academic supervisor') {
  const systemPrompt = `You are helping an African student write a polite, professional 
email requesting a reference letter from their ${refereeType}.
The email should be specific, grateful, and make it easy for the referee to say yes.
Include key points the referee should mention. 250-350 words.`;

  const userPrompt = `Write a reference letter request email for:

STUDENT: ${parsedCV.name || userProfile.name || 'the student'}
APPLYING FOR: ${userProfile.degree || 'Masters/PhD'} in ${userProfile.field || 'their field'}
TARGET: ${userProfile.targetCountry || userProfile.country || 'international universities'}
THEIR STRENGTHS: ${(parsedCV.strengths || []).join(', ')}
THEIR ACHIEVEMENTS: ${(parsedCV.awards || []).slice(0, 3).join(', ')}
REFEREE TYPE: ${refereeType}

The email should:
1. Remind the referee of their relationship
2. Explain what the student is applying for
3. Politely ask for the reference
4. Mention the deadline (leave as [DEADLINE])
5. Suggest key points to highlight
6. Attach CV (mention it)
7. Express gratitude

Return plain text email only.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 700
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[CVService] Reference request error:', err.message);
    return '';
  }
}

// ── Generate Study Plan / Research Statement ──────────────────────────────────
async function generateStudyPlan(parsedCV, userProfile) {
  const systemPrompt = `You are an expert academic writing assistant helping African 
students write a Study Plan / Research Statement for scholarship applications.
This explains what the student plans to study, why, and how they will contribute 
to their home country after graduating. 400-500 words. Specific and compelling.`;

  const userPrompt = `Write a Study Plan for:

STUDENT BACKGROUND:
${parsedCV.summary || ''}
Education: ${(parsedCV.education || []).map(e => `${e.degree} in ${e.field}`).join(', ')}
Research Interest: ${userProfile.researchInterest || userProfile.field || ''}
Field: ${userProfile.field || ''}
Target Degree: ${userProfile.degree || 'Masters/PhD'}
Target Country: ${userProfile.targetCountry || userProfile.country || ''}

The study plan should cover:
1. What they plan to study and specialise in
2. Why they chose this field and country
3. How this builds on their current background
4. What research or projects they plan to pursue
5. How they will apply this knowledge back in Africa/Nigeria
6. Long-term career and impact goals

Return plain text only.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 800
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[CVService] Study plan error:', err.message);
    return '';
  }
}

// ── Extract CV text from base64 ───────────────────────────────────────────────
function extractTextFromBase64CV(base64Data, mimeType) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    // For text-based files (txt, doc-like)
    if (mimeType === 'text/plain') {
      return buffer.toString('utf-8');
    }
    // For PDF and other formats, extract readable text portions
    const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 50000));
    // Clean non-printable characters but keep structure
    return text.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
               .replace(/\s{3,}/g, '\n')
               .trim();
  } catch (err) {
    console.error('[CVService] Text extraction error:', err.message);
    return '';
  }
}

// ── Main: process uploaded CV and generate all documents ─────────────────────
async function processUploadedCV(userId) {
  const db = getDb();
  console.log(`[CVService] Processing CV for user ${userId}`);

  try {
    const profile = await db.collection('user_profiles').findOne({ userId });
    if (!profile || !profile.cvData) {
      console.log(`[CVService] No CV found for user ${userId}`);
      return { error: 'No CV uploaded' };
    }

    // Extract text from CV
    const cvText = extractTextFromBase64CV(profile.cvData, profile.cvMimeType);
    if (!cvText || cvText.length < 100) {
      console.log(`[CVService] CV text too short for user ${userId}`);
      return { error: 'Could not extract text from CV' };
    }

    // Step 1: Parse CV into structured data
    console.log(`[CVService] Parsing CV...`);
    const parsedCV = await parseCVText(cvText);
    if (!parsedCV) return { error: 'CV parsing failed' };

    // Step 2: Generate Academic CV
    console.log(`[CVService] Generating Academic CV...`);
    const academicCV = await generateAcademicCV(parsedCV, profile, profile.degree || 'PhD');

    // Step 3: Generate Cover Letter
    console.log(`[CVService] Generating Cover Letter...`);
    const coverLetter = await generateCoverLetter(parsedCV, profile);

    // Step 4: Generate Reference Letter Request (academic supervisor)
    console.log(`[CVService] Generating Reference Letter Request...`);
    const refLetterRequest = await generateReferenceLetterRequest(parsedCV, profile, 'academic supervisor');

    // Step 5: Generate Study Plan
    console.log(`[CVService] Generating Study Plan...`);
    const studyPlan = await generateStudyPlan(parsedCV, profile);

    // Step 6: Extract CV summary for use in emails/SOP
    const cvSummary = [
      parsedCV.summary || '',
      (parsedCV.education || []).map(e => `${e.degree} in ${e.field} from ${e.institution} (${e.year})`).join('. '),
      (parsedCV.researchExperience || []).slice(0, 2).map(r => r.title).join('. '),
      (parsedCV.awards || []).slice(0, 3).join('. ')
    ].filter(Boolean).join(' ');

    // Step 7: Save everything to user profile
    await db.collection('user_profiles').updateOne(
      { userId },
      {
        $set: {
          parsedCV,
          academicCV,
          coverLetter,
          refLetterRequest,
          studyPlan,
          cvSummary,
          cvKeywords: parsedCV.researchKeywords || [],
          documentsGeneratedAt: new Date()
        }
      }
    );

    // Step 8: Notify user
    await db.collection('notifications').insertOne({
      userId,
      type: 'documents_ready',
      message: '📄 Your application documents are ready! Academic CV, Cover Letter, Study Plan, and Reference Letter Request are in your Documents tab.',
      read: false,
      createdAt: new Date()
    });

    console.log(`[CVService] ✓ All documents generated for user ${userId}`);
    return {
      ok: true,
      documents: ['academicCV', 'coverLetter', 'refLetterRequest', 'studyPlan'],
      cvKeywords: parsedCV.researchKeywords || []
    };

  } catch (err) {
    console.error(`[CVService] Error for user ${userId}:`, err.message);
    return { error: err.message };
  }
}

// ── Generate individual document on demand ────────────────────────────────────
async function regenerateDocument(userId, docType, extraData = {}) {
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId });
  if (!profile) return { error: 'Profile not found' };

  const parsedCV = profile.parsedCV || {};
  let result = '';

  switch (docType) {
    case 'academicCV':
      result = await generateAcademicCV(parsedCV, profile, profile.degree || 'PhD');
      await db.collection('user_profiles').updateOne({ userId }, { $set: { academicCV: result } });
      break;
    case 'coverLetter':
      result = await generateCoverLetter(parsedCV, profile, extraData.scholarshipTitle, extraData.university);
      await db.collection('user_profiles').updateOne({ userId }, { $set: { coverLetter: result } });
      break;
    case 'refLetterRequest':
      result = await generateReferenceLetterRequest(parsedCV, profile, extraData.refereeType || 'academic supervisor');
      await db.collection('user_profiles').updateOne({ userId }, { $set: { refLetterRequest: result } });
      break;
    case 'studyPlan':
      result = await generateStudyPlan(parsedCV, profile);
      await db.collection('user_profiles').updateOne({ userId }, { $set: { studyPlan: result } });
      break;
    default:
      return { error: 'Unknown document type' };
  }

  return { ok: true, content: result };
}

module.exports = {
  processUploadedCV,
  regenerateDocument,
  parseCVText,
  generateAcademicCV,
  generateCoverLetter,
  generateReferenceLetterRequest,
  generateStudyPlan
};
