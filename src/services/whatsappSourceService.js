const axios = require('axios');
//const { getDb } = require('./mongoService');
const mongoService = require('./mongoService');
const getDb = () => mongoService.db;
const WAHA_BASE = process.env.WAHA_BASE_URL || 'http://localhost:3000';
const WAHA_KEY  = process.env.WAHA_API_KEY  || '';
const SESSION   = process.env.WAHA_SESSION  || 'scholarbroad';

const wahaHeaders = () => ({
  'Content-Type': 'application/json',
  ...(WAHA_KEY ? { 'X-Api-Key': WAHA_KEY } : {})
});

async function getActiveGroups() {
  const db = getDb();
  return db.collection('whatsapp_groups').find({ active: true }).toArray();
}

// function isDue(group) {
//   if (!group.lastFetched) return true;
//   const daysSince = (Date.now() - new Date(group.lastFetched).getTime()) / (1000 * 60 * 60 * 24);
//   return daysSince >= (group.fetchIntervalDays || 5);
// }
function isDue(group, force = false) {
  if (force) return true;
  if (!group.lastFetched) return true;
  const daysSince = (Date.now() - new Date(group.lastFetched).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= (group.fetchIntervalDays || 5);
}
async function fetchGroupMessages(groupId, limit = 60) {
  try {
    const res = await axios.get(
      `${WAHA_BASE}/api/messages`,
      { headers: wahaHeaders(), params: { session: SESSION, chatId: groupId, limit, downloadMedia: false } }
    );
    return res.data || [];
  } catch (err) {
    console.error(`[WAHA] Failed to fetch ${groupId}:`, err.message);
    return [];
  }
}


function isScholarshipMessage(text = '') {
  if (!text || text.length < 80) return false;
  const keywords = [
    'scholarship','fellowship','grant','funded','funding','stipend',
    'phd','masters','msc','mba','postdoc','apply','application',
    'deadline','eligib','university','programme','award'
  ];
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k)).length >= 3;
}

function extractUrls(text = '') {
  const urlRegex = /https?:\/\/[^\s\]\)>,"]+/gi;
  return [...new Set(text.match(urlRegex) || [])];
}

async function saveRawMessages(messages, groupId, groupName) {
  const db = getDb();
  const col = db.collection('raw_whatsapp_posts');
  let saved = 0;
  for (const msg of messages) {
    const text = msg.body || msg.text || '';
    if (!isScholarshipMessage(text)) continue;
    const existing = await col.findOne({ waMessageId: msg.id });
    if (existing) continue;
    await col.insertOne({
      waMessageId: msg.id,
      groupId, groupName,
      rawText: text,
      urls: extractUrls(text),
      fetchedAt: new Date(),
      processed: false,
      published: false
    });
    saved++;
  }
  return saved;
}

async function markGroupFetched(groupId, count) {
  const db = getDb();
  await db.collection('whatsapp_groups').updateOne(
    { id: groupId },
    { $set: { lastFetched: new Date(), lastFetchCount: count } }
  );
}

// // ── Main entry: fetch all groups that are due ─────────────────────────────────
// async function fetchAllDueGroups() {
//   const groups = await getActiveGroups();
//   const results = [];
//   for (const group of groups) {
//     if (!isDue(group)) {
//       console.log(`[WAHA] Skipping ${group.name} — not due`);
//       results.push({ group: group.name, skipped: true });
//       continue;
//     }
//     console.log(`[WAHA] Fetching: ${group.name}`);
//     const messages = await fetchGroupMessages(group.id);
//     const saved = await saveRawMessages(messages, group.id, group.name);
//     await markGroupFetched(group.id, saved);
//     console.log(`[WAHA] Saved ${saved} posts from ${group.name}`);
//     results.push({ group: group.name, fetched: messages.length, saved });
//   }
//   return results;
// }
async function fetchAllDueGroups(force = false) {
  const groups = await getActiveGroups();
  const results = [];
  for (const group of groups) {
    if (!isDue(group, force)) {
      console.log(`[WAHA] Skipping ${group.name} — not due`);
      results.push({ group: group.name, skipped: true });
      continue;
    }
    console.log(`[WAHA] Fetching: ${group.name}`);
    const messages = await fetchGroupMessages(group.id);
    const saved = await saveRawMessages(messages, group.id, group.name);
    await markGroupFetched(group.id, saved);
    console.log(`[WAHA] Saved ${saved} posts from ${group.name}`);
    results.push({ group: group.name, fetched: messages.length, saved });
  }
  return results;
}
// ── Admin CRUD ────────────────────────────────────────────────────────────────
async function addGroup({ name, id, fetchIntervalDays = 5 }) {
  const db = getDb();
  if (await db.collection('whatsapp_groups').findOne({ id })) throw new Error('Group already exists');
  await db.collection('whatsapp_groups').insertOne({
    name, id, active: true, fetchIntervalDays,
    lastFetched: null, lastFetchCount: 0, addedAt: new Date()
  });
}

async function toggleGroup(id, active) {
  const db = getDb();
  await db.collection('whatsapp_groups').updateOne({ id }, { $set: { active } });
}

async function removeGroup(id) {
  const db = getDb();
  await db.collection('whatsapp_groups').deleteOne({ id });
}

async function listGroups() {
  const db = getDb();
  return db.collection('whatsapp_groups').find({}).sort({ addedAt: -1 }).toArray();
}

async function seedDefaultGroups() {
  const db = getDb();
  if (await db.collection('whatsapp_groups').countDocuments() > 0) return;
  const defaults = [
    { name: 'Scholarship Region H25', id: '120363402569445171@g.us' },
    { name: 'Bright Scholarship 53',  id: '923186211470-1599272722@g.us' },
    { name: 'Scholarship Region D37', id: '120363022832325412@g.us' },
    { name: 'Bright Scholarship 15',  id: '923128400375-1589159659@g.us' },
  ];
  for (const g of defaults) await addGroup({ ...g, fetchIntervalDays: 5 });
  console.log('[DB] Seeded 4 default source groups');
}

module.exports = {
  fetchAllDueGroups, addGroup, toggleGroup,
  removeGroup, listGroups, seedDefaultGroups
};
