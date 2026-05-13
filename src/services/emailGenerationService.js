const Groq = require('groq-sdk');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Generate a tailored cold email for one professor ─────────────────────────
async function generateColdEmail(professor, userProfile, researchProposal) {
  const papers = (professor.recentPapers || []).slice(0, 2);
  const paperSummary = papers.map(p => `"${p.title}" (${p.year})`).join(' and ');

  const systemPrompt = `You are an expert academic writing assistant helping a student write a professional cold email to a professor requesting PhD supervision. 

The email must:
- Sound natural and human — never like AI wrote it
- Be specific to this professor's actual research (not generic)
- Show genuine knowledge of their work
- Be concise (250-320 words body)
- Have a compelling, specific subject line
- Be respectful, confident, and direct
- End with a clear, single ask

Never use clichés like "I came across your profile" or "I hope this email finds you well" or "I am writing to express my interest".`;

  const userPrompt = `Write a cold email from this student to this professor.

PROFESSOR:
Name: ${professor.name}
University: ${professor.university}
Recent papers: ${paperSummary || 'research in ' + (userProfile.field || 'the field')}
${papers[0]?.abstract ? `Paper abstract snippet: "${papers[0].abstract.slice(0, 200)}..."` : ''}

STUDENT:
Name: ${userProfile.name}
Nationality: ${userProfile.nationality || 'African'}
Degree applying for: ${userProfile.degree || 'PhD'}
Field: ${userProfile.field}
GPA: ${userProfile.gpa || 'Strong academic record'}
Target start: ${userProfile.targetStart || 'September 2026'}

RESEARCH PROPOSAL SUMMARY:
${researchProposal ? researchProposal.slice(0, 400) : userProfile.researchInterest}

Return ONLY valid JSON, no markdown:
{
  "subject": "email subject line here",
  "body": "full email body here (no subject, just body)",
  "openingHook": "first sentence only"
}`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.65,
      max_tokens: 800
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return parsed;
  } catch (err) {
    console.error('[EmailGen] Generation error:', err.message);
    return null;
  }
}

// ── Generate follow-up email (week 1, 2, or 3) ───────────────────────────────
async function generateFollowUpEmail(professor, userProfile, followUpNumber) {
  const tones = {
    1: 'polite and brief — just checking in, not pushy',
    2: 'warm but slightly more direct — mention you are continuing your search',
    3: 'final and gracious — thank them, mention you will be reaching out to others'
  };

  const systemPrompt = `You are helping a student write a follow-up email to a professor who has not replied to their initial PhD inquiry. The tone should be: ${tones[followUpNumber]}. Keep it under 100 words. Never sound desperate or rude.`;

  const userPrompt = `Write follow-up #${followUpNumber} from ${userProfile.name} to Prof. ${professor.name} at ${professor.university}.
This is about a PhD opportunity in ${userProfile.field}.

Return ONLY valid JSON:
{
  "subject": "Re: [original subject] — Follow-up",
  "body": "follow-up email body"
}`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 300
    });
    const raw = response.choices[0]?.message?.content || '{}';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('[EmailGen] Follow-up error:', err.message);
    return null;
  }
}

// ── Generate research proposal from user's interest + CV summary ──────────────
async function generateResearchProposal(researchInterest, field, cvSummary = '') {
  const systemPrompt = `You are an expert academic writing assistant. Generate a clear, compelling 300-word PhD research proposal based on the student's stated interest. It should be specific, show awareness of existing literature, mention methodology, and state potential contribution to the field.`;

  const userPrompt = `Research interest: ${researchInterest}
Field: ${field}
${cvSummary ? `Student background: ${cvSummary}` : ''}

Write a 300-word research proposal. Return as plain text, no JSON.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 600
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[EmailGen] Proposal error:', err.message);
    return researchInterest;
  }
}

// ── Extract research keywords from proposal (for professor search) ────────────
async function extractKeywords(researchInterest, field) {
  const systemPrompt = `Extract 6-8 specific academic research keywords from the text. Return ONLY a JSON array of strings. No explanation.`;
  const userPrompt = `Field: ${field}\nResearch interest: ${researchInterest}`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 100
    });
    const raw = response.choices[0]?.message?.content || '[]';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    // Fallback: split field + interest into words
    return [...new Set([field, ...researchInterest.split(' ')
      .filter(w => w.length > 5)].slice(0, 8))];
  }
}

// ── Generate emails for all professors for a user ─────────────────────────────
async function generateEmailsForUser(userId) {
  const db = getDb();
  const userProfile = await db.collection('user_profiles').findOne({ userId });
  if (!userProfile) throw new Error('User profile not found');

  // Get or generate research proposal
  let proposal = userProfile.researchProposal;
  if (!proposal) {
    console.log('[EmailGen] Generating research proposal...');
    proposal = await generateResearchProposal(
      userProfile.researchInterest,
      userProfile.field,
      userProfile.cvSummary || ''
    );
    await db.collection('user_profiles').updateOne(
      { userId },
      { $set: { researchProposal: proposal } }
    );
  }

  // Get professors that need emails generated
  const professors = await db.collection('professor_targets').find({
    userId,
    emailGenerated: false,
    email: { $ne: null } // only professors we have emails for
  }).sort({ fitScore: -1 }).toArray();

  console.log(`[EmailGen] Generating emails for ${professors.length} professors...`);
  let generated = 0;

  for (const prof of professors) {
    try {
      const emailContent = await generateColdEmail(prof, userProfile, proposal);
      if (!emailContent || !emailContent.body) continue;

      // Save to email queue
      await db.collection('email_queue').insertOne({
        userId,
        professorId: prof._id,
        professorName: prof.name,
        professorEmail: prof.email,
        university: prof.university,
        subject: emailContent.subject,
        body: emailContent.body,
        type: 'cold_email',         // cold_email | followup_1 | followup_2 | followup_3
        status: 'pending_review',   // pending_review → approved → sent → replied
        fitScore: prof.fitScore,
        createdAt: new Date(),
        approvedAt: null,
        sentAt: null,
        repliedAt: null
      });

      // Mark professor email as generated
      await db.collection('professor_targets').updateOne(
        { _id: prof._id },
        { $set: { emailGenerated: true, status: 'email_generated' } }
      );

      generated++;
      console.log(`[EmailGen] ✓ Email for Prof. ${prof.name}`);
      await sleep(800); // Groq rate limit courtesy delay

    } catch (err) {
      console.error(`[EmailGen] Error for ${prof.name}:`, err.message);
    }
  }

  console.log(`[EmailGen] Done. Generated ${generated} emails for user ${userId}`);
  return { generated };
}

// ── Get email queue for user (dashboard display) ──────────────────────────────
async function getEmailQueue(userId, status = null) {
  const db = getDb();
  const query = { userId };
  if (status) query.status = status;
  return db.collection('email_queue')
    .find(query)
    .sort({ fitScore: -1, createdAt: 1 })
    .toArray();
}

// ── User approves an email ────────────────────────────────────────────────────
async function approveEmail(emailId, userId) {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  await db.collection('email_queue').updateOne(
    { _id: new ObjectId(emailId), userId },
    { $set: { status: 'approved', approvedAt: new Date() } }
  );
}

// ── User edits an email before sending ───────────────────────────────────────
async function editEmail(emailId, userId, { subject, body }) {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  await db.collection('email_queue').updateOne(
    { _id: new ObjectId(emailId), userId },
    { $set: { subject, body, editedAt: new Date() } }
  );
}

// ── Skip / reject an email ────────────────────────────────────────────────────
async function skipEmail(emailId, userId) {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  await db.collection('email_queue').updateOne(
    { _id: new ObjectId(emailId), userId },
    { $set: { status: 'skipped' } }
  );
}

module.exports = {
  generateEmailsForUser,
  generateColdEmail,
  generateFollowUpEmail,
  generateResearchProposal,
  extractKeywords,
  getEmailQueue,
  approveEmail,
  editEmail,
  skipEmail
};
