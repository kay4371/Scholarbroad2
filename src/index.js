require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const mongoService = require('./services/mongoService');
const getDb = () => mongoService.db;
const { fetchAllDueGroups, addGroup, toggleGroup, removeGroup, listGroups, seedDefaultGroups } = require('./services/whatsappSourceService');
const { processUnprocessedPosts, getNextUnpublished, markPublished, trackClick, getBySlug, bufferCount, sendToGroupWithFallback } = require('./services/groqRewriteService');
const { register, login, requireAuth, requirePlan, verifyAndUpgrade, getUserById } = require('./services/authService');
const { discoverProfessors, getProfessorsForUser } = require('./services/professorSearchService');
const { generateEmailsForUser, getEmailQueue, approveEmail, editEmail, skipEmail, generateResearchProposal, generatePersonalStatement, extractKeywords } = require('./services/emailGenerationService');
const { sendApprovedEmails, scheduleFollowUps, detectReplies, runDailySendCycle } = require('./services/followUpService');
const { getAuthUrl, handleCallback, disconnectGmail } = require('./services/gmailOAuthService');

// ── RSS fallback (only used when WAHA groups return 0 new posts) ──────────────
const { runRssFallback } = require('./services/scraperFallbackService');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// ── Monetisation redirect page (/go/:slug) ────────────────────────────────────
// User lands here after clicking "Apply on School Website" from /s/:slug
// Contains affiliate offers, WhatsApp CTA, subscribe CTA, then official link
app.get('/go/:slug', async (req, res) => {
  try {
    const scholarship = await getBySlug(req.params.slug);
    if (!scholarship) return res.status(404).sendFile(path.join(__dirname, './public/404.html'));
    const fs = require('fs');
    const html = fs.readFileSync(path.join(__dirname, './public/redirect-landing.html'), 'utf8');
    const injected = html.replace(
      '</head>',
      `<script>window.__SCHOLARSHIP__ = ${JSON.stringify(scholarship)};</script></head>`
    );
    await trackClick(req.params.slug, 'redirect_page').catch(() => {});
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

// ── Deadline reminder capture ─────────────────────────────────────────────────
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

// ── Public scholarships feed ──────────────────────────────────────────────────
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
  try { res.json({ ok: true, ...await register(req.body) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try { res.json({ ok: true, ...await login(req.body) }); }
  catch (err) { res.status(401).json({ error: err.message }); }
});

app.get('/api/auth/gmail', requireAuth, (req, res) => {
  res.redirect(getAuthUrl(req.user.userId));
});

app.get('/api/auth/gmail/callback', async (req, res) => {
  try {
    await handleCallback(req.query.code, req.query.state);
    res.redirect('/dashboard?gmail=connected');
  } catch { res.redirect('/dashboard?gmail=error'); }
});

app.post('/api/auth/gmail/disconnect', requireAuth, async (req, res) => {
  await disconnectGmail(req.user.userId);
  res.json({ ok: true });
});

// ── Payment verification (Paystack) ───────────────────────────────────────────
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { reference, plan, ...profileData } = req.body;
    if (!reference || plan === 'free') {
      return res.json({ ok: true, ...await register({ ...profileData, plan: 'free' }) });
    }
    const result = await register({ ...profileData, plan, paystackReference: reference });
    await verifyAndUpgrade({ reference, userId: result.userId, plan });
    if (profileData.degree === 'PhD' && ['scholar','pro','agency'].includes(plan)) {
      kickOffPhDPipeline(result.userId, profileData).catch(console.error);
    } else if (['Masters','MSc','MA','MBA','MPhil'].includes(profileData.degree) && ['scholar','pro','agency'].includes(plan)) {
      kickOffMastersPipeline(result.userId, profileData).catch(console.error);
    }
    res.json({ ok: true, ...result });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

async function kickOffPhDPipeline(userId, profileData) {
  const db = getDb();
  try {
    console.log(`[Pipeline] Starting for user ${userId}`);
    const proposal  = await generateResearchProposal(profileData.researchInterest, profileData.field, '');
    const keywords  = await extractKeywords(profileData.researchInterest, profileData.field);
    await db.collection('user_profiles').updateOne({ userId }, { $set: { researchProposal: proposal, researchKeywords: keywords } });
    await discoverProfessors(userId, keywords, profileData.country);
    await generateEmailsForUser(userId);
    console.log(`[Pipeline] ✓ Done for user ${userId}`);
    await db.collection('notifications').insertOne({
      userId, type: 'pipeline_ready',
      message: '🎉 Your professor emails are ready! Go to Email Queue to review and approve.',
      read: false, createdAt: new Date()
    });
  } catch (err) { console.error(`[Pipeline] Error:`, err.message); }
}

// ── Masters pipeline kickoff ─────────────────────────────────────────────────
async function kickOffMastersPipeline(userId, profileData) {
  const db = getDb();
  try {
    console.log(`[MastersPipeline] Starting for user ${userId}`);

    // 1. Generate Personal Statement draft
    const sop = await generatePersonalStatement(
      profileData.name || 'Student',
      profileData.field || '',
      profileData.country || '',
      profileData.researchInterest || profileData.field || '',
      profileData.degree || 'Masters'
    );

    // 2. Find matching scholarships from DB by degree level
    const degreeRegex = /masters|msc|ma|mba|mphil|postgraduate|all/i;
    const matchedScholarships = await db.collection('scholarships').find({
      published: true,
      $or: [
        { degree: { $regex: degreeRegex } },
        { degree: 'All Levels' },
        { degree: 'All' }
      ]
    }).sort({ createdAt: -1 }).limit(20).toArray();

    // 3. Filter by country preference if provided
    let filtered = matchedScholarships;
    if (profileData.country) {
      const countryMatch = matchedScholarships.filter(s =>
        (s.country || '').toLowerCase().includes(profileData.country.toLowerCase()) ||
        (s.eligible || '').toLowerCase().includes('all') ||
        (s.eligible || '').toLowerCase().includes('international')
      );
      if (countryMatch.length >= 3) filtered = countryMatch;
    }

    // 4. Save to user profile
    await db.collection('user_profiles').updateOne(
      { userId },
      { $set: {
        personalStatement: sop,
        matchedScholarships: filtered.map(s => ({
          slug: s.slug,
          title: s.title,
          country: s.country,
          flag: s.flag,
          funding: s.funding,
          deadline: s.deadline,
          degree: s.degree,
          field: s.field,
          redirectUrl: s.redirectUrl
        })),
        pipelineType: 'masters',
        pipelineStatus: 'ready',
        updatedAt: new Date()
      }},
      { upsert: true }
    );

    // 5. Notify user
    await db.collection('notifications').insertOne({
      userId,
      type: 'pipeline_ready',
      message: `🎓 Your Personal Statement draft and ${filtered.length} matched scholarships are ready! Check your dashboard.`,
      read: false,
      createdAt: new Date()
    });

    console.log(`[MastersPipeline] ✓ Done for user ${userId} — ${filtered.length} scholarships matched`);
  } catch (err) {
    console.error(`[MastersPipeline] Error:`, err.message);
  }
}

// ── Masters dashboard stats ───────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/user/profile', requireAuth, async (req, res) => {
  const db = getDb();
  const [profile, user] = await Promise.all([
    db.collection('user_profiles').findOne({ userId: req.user.userId }),
    getUserById(req.user.userId)
  ]);
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

app.post('/api/user/cv-upload', requireAuth, upload.single('cv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const db = getDb();
    await db.collection('user_profiles').updateOne(
      { userId: req.user.userId },
      { $set: {
        cvPath: `cv_${req.user.userId}`, cvFilename: req.file.originalname,
        cvMimeType: req.file.mimetype, cvData: req.file.buffer.toString('base64'),
        cvUploadedAt: new Date()
      }}
    );
    res.json({ ok: true, filename: req.file.originalname });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

app.get('/api/user/professors', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  res.json(await getProfessorsForUser(req.user.userId, req.query));
});

// ── Masters: get matched scholarships ─────────────────────────────────────────
app.get('/api/user/matched-scholarships', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  try {
    const db = getDb();
    const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
    if (!profile || profile.pipelineType !== 'masters') {
      return res.status(400).json({ error: 'Masters profile not found' });
    }
    res.json({
      ok: true,
      scholarships: profile.matchedScholarships || [],
      total: (profile.matchedScholarships || []).length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Masters: get personal statement ──────────────────────────────────────────
app.get('/api/user/personal-statement', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  try {
    const db = getDb();
    const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json({ ok: true, personalStatement: profile.personalStatement || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Masters: regenerate personal statement ────────────────────────────────────
app.post('/api/user/personal-statement/regenerate', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  try {
    const db = getDb();
    const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const user = await getUserById(req.user.userId);
    const sop = await generatePersonalStatement(
      user.name || 'Student',
      profile.field || '',
      profile.targetCountry || '',
      profile.researchInterest || profile.field || '',
      profile.degree || 'Masters'
    );
    await db.collection('user_profiles').updateOne(
      { userId: req.user.userId },
      { $set: { personalStatement: sop, updatedAt: new Date() } }
    );
    res.json({ ok: true, personalStatement: sop });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Masters: refresh matched scholarships ─────────────────────────────────────
app.post('/api/user/matched-scholarships/refresh', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  try {
    const db = getDb();
    const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    const user = await getUserById(req.user.userId);
    // Re-run matching
    kickOffMastersPipeline(req.user.userId, {
      name: user.name,
      field: profile.field,
      country: profile.targetCountry,
      researchInterest: profile.researchInterest,
      degree: profile.degree || 'Masters'
    }).catch(console.error);
    res.json({ ok: true, message: 'Refreshing matched scholarships — check back in a moment' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/discover-professors', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId: req.user.userId });
  if (!profile) return res.status(400).json({ error: 'Profile not found' });
  discoverProfessors(req.user.userId, profile.researchKeywords || [], profile.targetCountry)
    .then(() => generateEmailsForUser(req.user.userId))
    .catch(console.error);
  res.json({ ok: true, message: 'Professor discovery started — check back in a few minutes' });
});

app.get('/api/user/email-queue', requireAuth, requirePlan('scholar','pro','agency'), async (req, res) => {
  res.json(await getEmailQueue(req.user.userId, req.query.status || null));
});

app.post('/api/user/email-queue/:id/approve', requireAuth, async (req, res) => {
  await approveEmail(req.params.id, req.user.userId); res.json({ ok: true });
});
app.post('/api/user/email-queue/:id/edit', requireAuth, async (req, res) => {
  await editEmail(req.params.id, req.user.userId, req.body); res.json({ ok: true });
});
app.post('/api/user/email-queue/:id/skip', requireAuth, async (req, res) => {
  await skipEmail(req.params.id, req.user.userId); res.json({ ok: true });
});

app.post('/api/user/email-queue/approve-all', requireAuth, requirePlan('pro','agency'), async (req, res) => {
  const db = getDb();
  await db.collection('email_queue').updateMany(
    { userId: req.user.userId, status: 'pending_review' },
    { $set: { status: 'approved', approvedAt: new Date() } }
  );
  res.json({ ok: true });
});

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
// CRON ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── Fetch WhatsApp groups + process through Groq (with RSS fallback) ──────────
app.post('/api/cron/fetch-groups', adminAuth, async (req, res) => {
  try {
    const fetchResults = await fetchAllDueGroups();

    // Count how many new posts were actually saved across all groups
    const totalNewPosts = fetchResults.reduce((sum, r) => sum + (r.saved || 0), 0);

    // ── RSS FALLBACK: only if WAHA groups saved zero new posts ────────────────
    let fallbackResult = null;
    if (totalNewPosts === 0) {
      console.log('[Cron] Zero new posts from WhatsApp — activating RSS fallback...');
      const fallbackSaved = await runRssFallback();
      fallbackResult = { activated: true, saved: fallbackSaved };
    }

    const processed = await processUnprocessedPosts();
    res.json({ ok: true, fetch: fetchResults, fallback: fallbackResult, processed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Daily post to WhatsApp broadcast group (WAHA + Whapi fallback) ────────────
app.post('/api/cron/daily-post', adminAuth, async (req, res) => {
  try {
    const next = await getNextUnpublished();
    if (!next) return res.json({ ok: true, message: 'Buffer empty' });
    const sendResult = await sendToGroupWithFallback(next.whatsappText);
    await markPublished(next.slug);
    res.json({ ok: true, posted: next.title, method: sendResult.method });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/process-posts', adminAuth, async (req, res) => {
  try {
    res.json({ ok: true, ...await processUnprocessedPosts() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cron/daily-email-cycle', adminAuth, async (req, res) => {
  try { await runDailySendCycle(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cron/check-replies', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const users = await db.collection('users').find({
      plan: { $in: ['scholar','pro','agency'] }, gmailConnected: true
    }).toArray();
    for (const user of users) await detectReplies(user._id.toString()).catch(console.error);
    res.json({ ok: true, checked: users.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/groups',    adminAuth, async (req, res) => res.json(await listGroups()));
app.post('/api/admin/groups',   adminAuth, async (req, res) => {
  try { await addGroup(req.body); res.json({ ok: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/admin/groups/:id',  adminAuth, async (req, res) => {
  await toggleGroup(decodeURIComponent(req.params.id), req.body.active); res.json({ ok: true });
});
app.delete('/api/admin/groups/:id', adminAuth, async (req, res) => {
  await removeGroup(decodeURIComponent(req.params.id)); res.json({ ok: true });
});

app.post('/api/admin/fetch-now', adminAuth, async (req, res) => {
  try {
    const force = req.body?.forceAll === true;
    const fetch = await fetchAllDueGroups(force);
    const processed = await processUnprocessedPosts();
    res.json({ ok: true, fetch, processed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const db = getDb();
  const [buffer, totalGroups, totalUsers, totalPublished, totalPaidUsers] = await Promise.all([
    bufferCount(),
    db.collection('whatsapp_groups').countDocuments(),
    db.collection('users').countDocuments(),
    db.collection('scholarships').countDocuments({ published: true }),
    db.collection('users').countDocuments({ plan: { $in: ['scholar','pro','agency'] } })
  ]);
  res.json({ buffer, totalGroups, totalUsers, totalPublished, totalPaidUsers });
});

app.get('/api/admin/scholarships', adminAuth, async (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page || '1');
  const scholarships = await db.collection('scholarships')
    .find({}).sort({ createdAt: -1 }).skip((page-1)*20).limit(20).toArray();
  res.json(scholarships);
});

app.post('/api/admin/post-now/:slug', adminAuth, async (req, res) => {
  const scholarship = await getBySlug(req.params.slug);
  if (!scholarship) return res.status(404).json({ error: 'Not found' });
  const sendResult = await sendToGroupWithFallback(scholarship.whatsappText);
  await markPublished(scholarship.slug);
  res.json({ ok: true, posted: scholarship.title, method: sendResult.method });
});

// ── Admin: manually trigger Masters pipeline for a user (for testing) ───────
app.post('/api/admin/trigger-masters/:userId', adminAuth, async (req, res) => {
  try {
    const db = getDb();
    const user = await getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profile = await db.collection('user_profiles').findOne({ userId: req.params.userId });
    await kickOffMastersPipeline(req.params.userId, {
      name: user.name,
      field: (profile && profile.field) || req.body.field || 'General',
      country: (profile && profile.targetCountry) || req.body.country || '',
      researchInterest: (profile && profile.researchInterest) || req.body.researchInterest || '',
      degree: (profile && profile.degree) || req.body.degree || 'Masters'
    });
    res.json({ ok: true, message: 'Masters pipeline triggered for ' + user.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
