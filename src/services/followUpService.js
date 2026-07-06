const mongoService = require('./mongoService');
const getDb = () => mongoService.db;
//const { getDb } = require('./mongoService');
const { sendEmail, checkForReplies } = require('./gmailOAuthService');
const { generateFollowUpEmail } = require('./emailGenerationService');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Random delay between sends to mimic human behaviour (3-7 minutes)
const randomDelay = () => Math.floor(Math.random() * (7 - 3 + 1) + 3) * 60 * 1000;

// ── Send approved emails for a user (5-8 per day, natural pacing) ─────────────
async function sendApprovedEmails(userId) {
  const db = getDb();
  const DAILY_LIMIT = 7;

  // Check how many already sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sentToday = await db.collection('email_queue').countDocuments({
    userId,
    status: 'sent',
    sentAt: { $gte: today }
  });

  const remaining = DAILY_LIMIT - sentToday;
  if (remaining <= 0) {
    console.log(`[Sender] User ${userId} hit daily limit (${DAILY_LIMIT}) — skipping`);
    return { sent: 0, reason: 'daily_limit_reached' };
  }

  // Check if user has autoMode enabled — if so, auto-approve pending emails first
  const userProfile = await db.collection('user_profiles').findOne({ userId });
  if (userProfile?.autoMode === true) {
    await db.collection('email_queue').updateMany(
      { userId, status: 'pending_review' },
      { $set: { status: 'approved', approvedAt: new Date(), autoApproved: true } }
    );
    console.log(`[Sender] Auto mode ON for user ${userId} — auto-approved pending emails`);
  }

  // Get approved emails not yet sent
  const approved = await db.collection('email_queue')
    .find({ userId, status: 'approved', type: 'cold_email' })
    .sort({ fitScore: -1 })
    .limit(remaining)
    .toArray();

  if (!approved.length) {
    console.log(`[Sender] No approved emails to send for user ${userId}`);
    return { sent: 0, reason: 'no_approved_emails' };
  }

  // Get user profile for Gmail check
  const profile = await db.collection('user_profiles').findOne({ userId });
  const useGmail = profile?.gmailConnected;

  let sent = 0;

  for (const email of approved) {
    try {
      if (useGmail) {
        await sendEmail(userId, {
          to: email.professorEmail,
          subject: email.subject,
          body: email.body
        });
      } else {
        // Fallback: Resend via platform (implement separately)
        await sendViaResend({
          from: `${profile.name} via ScholarBroad <noreply@scholarbroad.suntrenia.com>`,
          to: email.professorEmail,
          subject: email.subject,
          body: email.body
        });
      }

      // Mark as sent
      await db.collection('email_queue').updateOne(
        { _id: email._id },
        { $set: { status: 'sent', sentAt: new Date() } }
      );

      // Update professor target status
      await db.collection('professor_targets').updateOne(
        { _id: email.professorId },
        { $set: { status: 'sent', emailSentAt: new Date() } }
      );

      sent++;
      console.log(`[Sender] ✓ Sent to Prof. ${email.professorName} (${email.professorEmail})`);

      // Natural delay between sends
      if (sent < approved.length) {
        const delay = randomDelay();
        console.log(`[Sender] Waiting ${Math.round(delay / 60000)} mins before next send...`);
        await sleep(delay);
      }

    } catch (err) {
      console.error(`[Sender] Failed to send to ${email.professorEmail}:`, err.message);
    }
  }

  console.log(`[Sender] Done. Sent ${sent} emails for user ${userId}`);
  return { sent };
}

// ── Schedule follow-ups for all sent emails (run daily) ───────────────────────
async function scheduleFollowUps() {
  const db = getDb();
  const now = new Date();

  // Find all sent cold emails across all users
  const sentEmails = await db.collection('email_queue').find({
    type: 'cold_email',
    status: 'sent'
  }).toArray();

  console.log(`[FollowUp] Checking ${sentEmails.length} sent emails for follow-up needs...`);

  for (const email of sentEmails) {
    try {
      const daysSinceSent = (now - new Date(email.sentAt)) / (1000 * 60 * 60 * 24);

      // Get user profile
      const profile = await db.collection('user_profiles').findOne({ userId: email.userId });
      if (!profile) continue;

      // Check if follow-up already exists for this email
      const existingFollowUps = await db.collection('email_queue').countDocuments({
        userId: email.userId,
        originalEmailId: email._id
      });

      // Week 1 follow-up (7 days)
      if (daysSinceSent >= 7 && existingFollowUps === 0) {
        await createFollowUp(email, profile, 1);
      }

      // Week 2 follow-up (14 days)
      else if (daysSinceSent >= 14 && existingFollowUps === 1) {
        await createFollowUp(email, profile, 2);
      }

      // Week 3 final follow-up (21 days)
      else if (daysSinceSent >= 21 && existingFollowUps === 2) {
        await createFollowUp(email, profile, 3);
      }

    } catch (err) {
      console.error(`[FollowUp] Error for email ${email._id}:`, err.message);
    }
  }
}

// ── Create a follow-up email in the queue ────────────────────────────────────
async function createFollowUp(originalEmail, userProfile, followUpNumber) {
  const db = getDb();

  const professor = await db.collection('professor_targets').findOne({
    _id: originalEmail.professorId
  });
  if (!professor) return;

  const followUpContent = await generateFollowUpEmail(professor, userProfile, followUpNumber);
  if (!followUpContent) return;

  await db.collection('email_queue').insertOne({
    userId: originalEmail.userId,
    professorId: originalEmail.professorId,
    originalEmailId: originalEmail._id,
    professorName: originalEmail.professorName,
    professorEmail: originalEmail.professorEmail,
    university: originalEmail.university,
    subject: followUpContent.subject || `Re: ${originalEmail.subject}`,
    body: followUpContent.body,
    type: `followup_${followUpNumber}`,
    status: 'approved', // follow-ups auto-approved (user set this preference)
    fitScore: originalEmail.fitScore,
    createdAt: new Date(),
    approvedAt: new Date(),
    sentAt: null,
    repliedAt: null
  });

  console.log(`[FollowUp] Created follow-up #${followUpNumber} for Prof. ${originalEmail.professorName}`);
}

// ── Detect replies and stop follow-ups ────────────────────────────────────────
async function detectReplies(userId) {
  const db = getDb();

  // Get all professors we emailed this user
  const sentEmails = await db.collection('email_queue')
    .find({ userId, status: 'sent' })
    .toArray();

  if (!sentEmails.length) return;

  const professorEmails = [...new Set(sentEmails.map(e => e.professorEmail).filter(Boolean))];
  const repliedEmails = await checkForReplies(userId, professorEmails);

  if (!repliedEmails.length) {
    console.log(`[ReplyDetect] No new replies for user ${userId}`);
    return;
  }

  console.log(`[ReplyDetect] Found ${repliedEmails.length} replies for user ${userId}`);

  for (const replyEmail of repliedEmails) {
    // Mark all emails from this professor as replied
    await db.collection('email_queue').updateMany(
      { userId, professorEmail: replyEmail, status: { $ne: 'replied' } },
      { $set: { status: 'replied', repliedAt: new Date() } }
    );

    // Cancel any pending follow-ups for this professor
    await db.collection('email_queue').updateMany(
      {
        userId,
        professorEmail: replyEmail,
        status: 'approved',
        type: { $in: ['followup_1', 'followup_2', 'followup_3'] }
      },
      { $set: { status: 'cancelled', cancelReason: 'professor_replied' } }
    );

    // Update professor target
    await db.collection('professor_targets').updateOne(
      { userId, email: replyEmail },
      { $set: { status: 'replied', repliedAt: new Date() } }
    );

    // Notify user (save notification)
    await db.collection('notifications').insertOne({
      userId,
      type: 'professor_reply',
      message: `🎉 Prof. from ${replyEmail} replied to your email!`,
      professorEmail: replyEmail,
      read: false,
      createdAt: new Date()
    });

    console.log(`[ReplyDetect] ✓ Marked ${replyEmail} as replied — follow-ups cancelled`);
  }
}

// ── Resend fallback (for users without Gmail connected) ───────────────────────
async function sendViaResend({ from, to, subject, body }) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({ from, to, subject, text: body });
}

// ── Run full daily send cycle for all active users ────────────────────────────
async function runDailySendCycle() {
  const db = getDb();
  const activeUsers = await db.collection('users').find({
    plan: { $in: ['scholar', 'pro', 'agency'] },
    active: true
  }).toArray();

  console.log(`[DailyCycle] Running for ${activeUsers.length} active users`);

  for (const user of activeUsers) {
    const userId = user._id.toString();
    try {
      // 1. Detect replies first (cancels unnecessary follow-ups)
      if (user.gmailConnected) await detectReplies(userId);

      // 2. Send approved emails
      await sendApprovedEmails(userId);

      // 3. Schedule any due follow-ups
      await scheduleFollowUps();

      // Delay between users
      await sleep(5000);
    } catch (err) {
      console.error(`[DailyCycle] Error for user ${userId}:`, err.message);
    }
  }

  console.log('[DailyCycle] Complete');
}

module.exports = {
  sendApprovedEmails,
  scheduleFollowUps,
  detectReplies,
  runDailySendCycle
};
