const { google } = require('googleapis');
//const { getDb } = require('./mongoService');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'https://scholarbroad.suntrenia.com/api/auth/gmail/callback'
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly' // for reply detection only
];

// ── Generate OAuth URL (send user here to authorize) ─────────────────────────
function getAuthUrl(userId) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId // passed back in callback so we know which user
  });
}

// ── Handle OAuth callback — save tokens to DB ─────────────────────────────────
async function handleCallback(code, userId) {
  const { tokens } = await oauth2Client.getToken(code);
  const db = getDb();

  // Encrypt tokens in production — for now store as-is
  await db.collection('user_profiles').updateOne(
    { userId },
    {
      $set: {
        gmailConnected: true,
        gmailTokens: tokens,
        gmailConnectedAt: new Date()
      }
    }
  );

  return tokens;
}

// ── Get authenticated Gmail client for a user ─────────────────────────────────
async function getGmailClient(userId) {
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId });

  if (!profile?.gmailTokens) throw new Error('Gmail not connected for this user');

  const userOAuth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  userOAuth.setCredentials(profile.gmailTokens);

  // Auto-refresh token if expired
  userOAuth.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      await db.collection('user_profiles').updateOne(
        { userId },
        { $set: { 'gmailTokens.refresh_token': tokens.refresh_token } }
      );
    }
    await db.collection('user_profiles').updateOne(
      { userId },
      { $set: { 'gmailTokens.access_token': tokens.access_token } }
    );
  });

  return google.gmail({ version: 'v1', auth: userOAuth });
}

// ── Encode email to base64 (required by Gmail API) ───────────────────────────
function encodeEmail({ from, to, subject, body }) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body
  ].join('\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Send a single email via user's Gmail ─────────────────────────────────────
async function sendEmail(userId, { to, subject, body }) {
  const db = getDb();
  const profile = await db.collection('user_profiles').findOne({ userId });
  if (!profile) throw new Error('User profile not found');

  const gmail = await getGmailClient(userId);
  const from = `${profile.name} <${profile.gmailEmail || 'me'}>`;

  const raw = encodeEmail({ from, to, subject, body });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  return res.data;
}

// ── Check Gmail inbox for replies from professor domains ──────────────────────
async function checkForReplies(userId, professorEmails) {
  try {
    const gmail = await getGmailClient(userId);

    // Search for replies from any of the professor emails
    const query = professorEmails
      .map(e => `from:${e}`)
      .join(' OR ');

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });

    const messages = res.data.messages || [];
    const repliedEmails = new Set();

    for (const msg of messages) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From']
      });
      const fromHeader = detail.data.payload?.headers?.find(h => h.name === 'From');
      if (fromHeader?.value) {
        const emailMatch = fromHeader.value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/);
        if (emailMatch) repliedEmails.add(emailMatch[0].toLowerCase());
      }
    }

    return [...repliedEmails];
  } catch (err) {
    console.error('[Gmail] Reply check error:', err.message);
    return [];
  }
}

// ── Disconnect Gmail (user revokes) ──────────────────────────────────────────
async function disconnectGmail(userId) {
  const db = getDb();
  await db.collection('user_profiles').updateOne(
    { userId },
    { $set: { gmailConnected: false, gmailTokens: null } }
  );
}

module.exports = {
  getAuthUrl,
  handleCallback,
  sendEmail,
  checkForReplies,
  disconnectGmail
};
