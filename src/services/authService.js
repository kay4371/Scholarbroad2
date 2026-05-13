const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES = '30d';

// ── Register a new user ───────────────────────────────────────────────────────
async function register({ name, email, password, plan, nationality, degree,
  field, country, gpa, researchInterest, targetStart, paystackReference }) {
  const db = getDb();

  const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
  if (existing) throw new Error('Email already registered');

  const hashed = await bcrypt.hash(password, 12);

  const user = {
    name,
    email: email.toLowerCase(),
    password: hashed,
    plan: plan || 'free',
    active: true,
    paystackReference: paystackReference || null,
    gmailConnected: false,
    createdAt: new Date(),
    lastLoginAt: null
  };

  const result = await db.collection('users').insertOne(user);
  const userId = result.insertedId.toString();

  // Create profile
  await db.collection('user_profiles').insertOne({
    userId,
    name,
    email: email.toLowerCase(),
    nationality: nationality || '',
    degree: degree || '',
    field: field || '',
    targetCountry: country || '',
    gpa: gpa || '',
    researchInterest: researchInterest || '',
    targetStart: targetStart || '',
    researchProposal: null,
    researchKeywords: [],
    cvPath: null,
    cvSummary: null,
    gmailConnected: false,
    gmailTokens: null,
    professorDiscoveryStatus: 'not_started',
    professorsFound: 0,
    createdAt: new Date()
  });

  const token = jwt.sign({ userId, email: email.toLowerCase(), plan }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return { token, userId, name, plan };
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login({ email, password }) {
  const db = getDb();
  const user = await db.collection('users').findOne({ email: email.toLowerCase() });
  if (!user) throw new Error('Invalid email or password');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid email or password');

  await db.collection('users').updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() } }
  );

  const userId = user._id.toString();
  const token = jwt.sign({ userId, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return { token, userId, name: user.name, plan: user.plan };
}

// ── Verify JWT middleware ─────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Plan gate middleware ──────────────────────────────────────────────────────
function requirePlan(...plans) {
  return (req, res, next) => {
    if (!plans.includes(req.user?.plan)) {
      return res.status(403).json({
        error: 'Upgrade required',
        requiredPlans: plans,
        currentPlan: req.user?.plan,
        upgradeUrl: '/subscribe'
      });
    }
    next();
  };
}

// ── Verify Paystack payment and upgrade user plan ─────────────────────────────
async function verifyAndUpgrade({ reference, userId, plan }) {
  const axios = require('axios');
  try {
    const res = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const data = res.data?.data;
    if (data?.status !== 'success') throw new Error('Payment not successful');

    const db = getDb();
    await db.collection('users').updateOne(
      { _id: require('mongodb').ObjectId(userId) },
      { $set: { plan, paystackReference: reference, upgradedAt: new Date() } }
    );

    return { ok: true, plan };
  } catch (err) {
    throw new Error('Payment verification failed: ' + err.message);
  }
}

// ── Get user from DB ──────────────────────────────────────────────────────────
async function getUserById(userId) {
  const db = getDb();
  const { ObjectId } = require('mongodb');
  return db.collection('users').findOne({ _id: new ObjectId(userId) }, { projection: { password: 0 } });
}

module.exports = { register, login, requireAuth, requirePlan, verifyAndUpgrade, getUserById };
