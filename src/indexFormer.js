require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const mongoService = require('./services/mongoService');
const getDb = () => mongoService.db;
const { fetchAllDueGroups, addGroup, toggleGroup, removeGroup, listGroups, seedDefaultGroups } = require('./services/whatsappSourceService');
const { processUnprocessedPosts, getNextUnpublished, markPublished, trackClick, getBySlug, bufferCount } = require('./services/groqRewriteService');
const { register, login, requireAuth, requirePlan, verifyAndUpgrade, getUserById } = require('./services/authService');
const { discoverProfessors, getProfessorsForUser } = require('./services/professorSearchService');
const { generateEmailsForUser, getEmailQueue, approveEmail, editEmail, skipEmail, generateResearchProposal, extractKeywords } = require('./services/emailGenerationService');
const { sendApprovedEmails, scheduleFollowUps, detectReplies, runDailySendCycle } = require('./services/followUpService');
const { getAuthUrl, handleCallback, disconnectGmail } = require('./services/gmailOAuthService');

// ── WhatsApp broadcast sender ─────────────────────────────────────────────────
const axios = require('axios');
const WAHA_BASE    = process.env.WAHA_BASE_URL  || 'http://localhost:3000';
const WAHA_KEY     = process.env.WAHA_API_KEY   || '';
const WAHA_SESSION = process.env.WAHA_SESSION   || 'scholarbroad';
const BROADCAST_GROUP = process.env.BROADCAST_GROUP_ID;

async function sendToGroup(text) {
  await axios.post(
    `${WAHA_BASE}/api/sendText`,
    { chatId: BROADCAST_GROUP, text, session: WAHA_SESSION },
    { headers: { 'Content-Type': 'application/json', ...(WAHA_KEY ? { 'X-Api-Key': WAHA_KEY } : {}) } }
  );
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload (CV) — store in memory, upload to R2/GridFS
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Admin auth middleware ─────────────────────────────────────────────────────
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'changeme';
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-secret'] || req.query.secret;
  if (token !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get('/subscribe', (req, res) => res.sendFile(path.join(__dirname, 'public/subscribe.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin-dashboard.html')));

// ── Scholarship landing page (/s/:slug) ───────────────────────────────────────
app.get('/s/:slug', async (req, res) => {
  try {
    const scholarship = await getBySlug(req.params.slug);
    if (!scholarship) return res.status(404).sendFile(path.join(__dirname, './public/404.html'));
    const fs = require('fs');
    const html = fs.readFileSync(path.join(__dirname, './public/scholarship-landing.html'), 'utf8');
    const injected = html.replace(
      '</head>',
      `<script>window.__SCHOLARSHIP__ = ${JSON.stringify(scholarship)};</script></head>`
    );
    res.send(injected);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// ── Click tracking ────────────────────────────────────────────────────────────
app.post('/api/track-click', async (req, res) => {
  const { slug, type } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  await trackClick(slug, type || 'official_link');
  res.json({ ok: true });
});

// ── Deadline reminder email capture ───────────────────────────────────────────
app.post('/api/reminders', async (req, res) => {
  const { email, slug, deadline } = req.body;
  if (!email || !slug) return res.status(400).json({ error: 'email and slug required' });
  const db = getDb();
  await db.collection('reminders').updateOne(
    { email, slug },
    { $set: { email, slug, deadline, createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Public scholarships feed (for website/app display) ───────────────────────
app.get('/api/scholarships', async (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 30;
    const page  = parseInt(req.query.page)  || 1;
    const scholarships = await db.collection('scholarships')
      .find({ published: true })
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();
    res.json({ ok: true, count: scholarships.length, page, scholarships });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public stats ──────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const db = getDb();
    const [total, published, users] = await Promise.all([
      db.collection('scholarships').countDocuments(),
      db.collection('scholarships').countDocuments({ published: true }),
      db.collection('users').countDocuments()
    ]);
    res.json({ ok: true, total, published, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await register(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await login(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ── Gmail OAuth flow ──────────────────────────────────────────────────────────
app.get('/api/auth/gmail', requireAuth, (req, res) => {
  const url = getAuthUrl(req.user.userId);
  res.redirect(url);
});

app.get('/api/auth/gmail/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    await handleCallback(code, userId);
    res.redirect('/dashboard?gmail=connected');
  } catch (err) {
    res.redirect('/dashboard?gmail=error');
  }
});

app.post('/api/auth/gmail/disconnect', requireAuth, async (req, res) => {
  await disconnectGmail(req.user.userId);
  res.json({ ok: true });
});

// ── Payment verification (Paystack) ───────────────────────────────────────────
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { reference, plan, ...profileData } = req.body;

    // Free plan — just register
    if (!reference || plan === 'free') {
      const result = await register({ ...profileData, plan: 'free' });
      return res.json({ ok: true, ...result });
    }

    // Register user first
    const result = await register({ ...profileData, plan, paystackReference: reference });

    // Verify payment with Paystack
    await verifyAndUpgrade({ reference, userId: result.userId, plan });

    // Kick off PhD pipeline for paid PhD applicants
    if (profileData.degree === 'PhD' && ['scholar', 'pro', 'agency'].includes(plan)) {
      kickOffPhDPipeline(result.userId, profileData).catch(console.error);
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Async PhD pipeline kickoff ────────────────────────────────────────────────
async function kickOffPhDPipeline(userId, profileData) {
  const db = getDb();
  try {
    console.log(`[Pipeline] Starting PhD pipeline for user ${userId}`);

    const proposal = await generateResearchProposal(
      profileData.researchInterest,
      profileData.field,
      ''
    );
    const keywords = await extractKeywords(profileData.researchInterest, profileData.field);

    await db.collection('user_profiles').updateOne(
      { userId },
      { $set: { researchProposal: proposal, researchKeywords: keywords } }
    );

    await discoverProfessors(userId, keywords, profileData.country);
    await generateEmailsForUser(userId);

    console.log(`[Pipeline] ✓ PhD pipeline complete for user ${userId}`);

    await db.collection('notifications').insertOne({
      userId,
      type: 'pipeline_ready',
      message: '🎉 Your professor emails are ready! Go to Email Queue to review and approve.',
      read: false,
      createdAt: new Date()
    });
  } catch (err) {
    console.error(`[Pipeline] Error for user ${userId}:`, err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// USER ROUTES (authenticated)
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/user/profile', requireAuth, async (req, res) => {
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
  const user = await getUserById(req.user.userId);
  res.json({ ...user, profile });
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  const db = getDb();
  await db.collection('user_profiles').updateOne(
    { userId: req.user.userId },
    { $set: { ...req.body, updatedAt: new Date() } }
  );
  res.json({ ok: true });
});

// ── CV Upload ─────────────────────────────────────────────────────────────────
app.post('/api/user/cv-upload', requireAuth, upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const db = getDb();
    const cvBase64 = req.file.buffer.toString('base64');
    await db.collection('user_profiles').updateOne(
      { userId: req.user.userId },
      { $set: {
        cvPath: `cv_${req.user.userId}`,
        cvFilename: req.file.originalname,
        cvMimeType: req.file.mimetype,
        cvData: cvBase64,
        cvUploadedAt: new Date()
      }}
    );
    res.json({ ok: true, filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/user/dashboard-stats', requireAuth, async (req, res) => {
  const db = getDb();
  const userId = req.user.userId;
  const [totalProfs, emailsSent, replies, pendingApproval, notifications] = await Promise.all([
    db.collection('professor_targets').countDocuments({ userId }),
    db.collection('email_queue').countDocuments({ userId, status: 'sent' }),
    db.collection('professor_targets').countDocuments({ userId, status: 'replied' }),
    db.collection('email_queue').countDocuments({ userId, status: 'pending_review' }),
    db.collection('notifications').find({ userId, read: false }).sort({ createdAt: -1 }).limit(10).toArray()
  ]);
  res.json({ totalProfs, emailsSent, replies, pendingApproval, notifications });
});

// ── Professors ────────────────────────────────────────────────────────────────
app.get('/api/user/professors', requireAuth, requirePlan('scholar', 'pro', 'agency'), async (req, res) => {
  const result = await getProfessorsForUser(req.user.userId, req.query);
  res.json(result);
});

app.post('/api/user/discover-professors', requireAuth, requirePlan('scholar', 'pro', 'agency'), async (req, res) => {
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
  if (!profile) return res.status(400).json({ error: 'Profile not found' });
  discoverProfessors(req.user.userId, profile.researchKeywords || [], profile.targetCountry)
    .then(() => generateEmailsForUser(req.user.userId))
    .catch(console.error);
  res.json({ ok: true, message: 'Professor discovery started — check back in a few minutes' });
});

// ── Email queue ───────────────────────────────────────────────────────────────
app.get('/api/user/email-queue', requireAuth, requirePlan('scholar', 'pro', 'agency'), async (req, res) => {
  const emails = await getEmailQueue(req.user.userId, req.query.status || null);
  res.json(emails);
});

app.post('/api/user/email-queue/:id/approve', requireAuth, async (req, res) => {
  await approveEmail(req.params.id, req.user.userId);
  res.json({ ok: true });
});

app.post('/api/user/email-queue/:id/edit', requireAuth, async (req, res) => {
  await editEmail(req.params.id, req.user.userId, req.body);
  res.json({ ok: true });
});

app.post('/api/user/email-queue/:id/skip', requireAuth, async (req, res) => {
  await skipEmail(req.params.id, req.user.userId);
  res.json({ ok: true });
});

app.post('/api/user/email-queue/approve-all', requireAuth, requirePlan('pro', 'agency'), async (req, res) => {
  const db = getDb();
  await db.collection('email_queue').updateMany(
    { userId: req.user.userId, status: 'pending_review' },
    { $set: { status: 'approved', approvedAt: new Date() } }
  );
  res.json({ ok: true });
});

// ── Notifications ─────────────────────────────────────────────────────────────
app.post('/api/user/notifications/:id/read', requireAuth, async (req, res) => {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  await db.collection('notifications').updateOne(
    { _id: new ObjectId(req.params.id), userId: req.user.userId },
    { $set: { read: true } }
  );
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// CRON ROUTES (called by external scheduler e.g. Cloudflare Worker / cron-job.org)
// ════════════════════════════════════════════════════════════════════════════

// Fetch new posts from WhatsApp groups + process through Groq
app.post('/api/cron/fetch-groups', adminAuth, async (req, res) => {
  try {
    const fetch = await fetchAllDueGroups();
    const processed = await processUnprocessedPosts();
    res.json({ ok: true, fetch, processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post one scholarship to WhatsApp broadcast group
app.post('/api/cron/daily-post', adminAuth, async (req, res) => {
  try {
    const next = await getNextUnpublished();
    if (!next) return res.json({ ok: true, message: 'Buffer empty' });
    await sendToGroup(next.whatsappText);
    await markPublished(next.slug);
    res.json({ ok: true, posted: next.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process raw WhatsApp posts through Groq only
app.post('/api/cron/process-posts', adminAuth, async (req, res) => {
  try {
    const result = await processUnprocessedPosts();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily email send cycle for all paid users
app.post('/api/cron/daily-email-cycle', adminAuth, async (req, res) => {
  try {
    await runDailySendCycle();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check Gmail inboxes for professor replies
app.post('/api/cron/check-replies', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const users = await db.collection('users').find({
      plan: { $in: ['scholar', 'pro', 'agency'] },
      gmailConnected: true
    }).toArray();
    for (const user of users) {
      await detectReplies(user._id.toString()).catch(console.error);
    }
    res.json({ ok: true, checked: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/groups', adminAuth, async (req, res) => res.json(await listGroups()));

app.post('/api/admin/groups', adminAuth, async (req, res) => {
  try { await addGroup(req.body); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/admin/groups/:id', adminAuth, async (req, res) => {
  await toggleGroup(decodeURIComponent(req.params.id), req.body.active);
  res.json({ ok: true });
});

app.delete('/api/admin/groups/:id', adminAuth, async (req, res) => {
  await removeGroup(decodeURIComponent(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/fetch-now', adminAuth, async (req, res) => {
  try {
    const force = req.body?.forceAll === true;
    const fetch = await fetchAllDueGroups(force);
    const processed = await processUnprocessedPosts();
    res.json({ ok: true, fetch, processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const db = getDb();
  const [buffer, totalGroups, totalUsers, totalPublished, totalPaidUsers] = await Promise.all([
    bufferCount(),
    db.collection('whatsapp_groups').countDocuments(),
    db.collection('users').countDocuments(),
    db.collection('scholarships').countDocuments({ published: true }),
    db.collection('users').countDocuments({ plan: { $in: ['scholar', 'pro', 'agency'] } })
  ]);
  res.json({ buffer, totalGroups, totalUsers, totalPublished, totalPaidUsers });
});

app.get('/api/admin/scholarships', adminAuth, async (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page || '1');
  const scholarships = await db.collection('scholarships')
    .find({}).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).toArray();
  res.json(scholarships);
});

app.post('/api/admin/post-now/:slug', adminAuth, async (req, res) => {
  const scholarship = await getBySlug(req.params.slug);
  if (!scholarship) return res.status(404).json({ error: 'Not found' });
  await sendToGroup(scholarship.whatsappText);
  await markPublished(scholarship.slug);
  res.json({ ok: true, posted: scholarship.title });
});

// ── 404 + error handlers ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ════════════════════════════════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3001;
mongoService.connect().then(async () => {
  await seedDefaultGroups();
  app.listen(PORT, () => console.log(`[Server] ScholarBroad running on port ${PORT}`));
}).catch(err => {
  console.error('[DB] Connection failed:', err.message);
  process.exit(1);
});
