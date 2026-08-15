const { getSheetRows } = require('../config/google');
const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'UNDISPATCH';
const TARGET_CHATS = (process.env.CHAT_IDS_UNDISPATCH_REMINDER || '-4666581891,-1002616721208').split(',');

const EMOJI = {
  PGT: '🟠',
  STI: '🟣',
  SER: '🟢',
  KPL: '🔵',
  BLC: '🟡',
  KIP: '🟤',
  LAINNYA: '⚪'
};

function norm(v) {
  return String(v ?? '').trim();
}

function keyNorm(k) {
  return String(k ?? '').trim().toLowerCase().replace(/[\s\-_]+/g, '');
}

function pick(row, candidates) {
  const keys = Object.keys(row || {});
  const map = new Map(keys.map(k => [keyNorm(k), k]));
  for (const c of candidates) {
    const found = map.get(keyNorm(c));
    if (found != null) {
      const val = row[found];
      const s = norm(val);
      if (s) return s;
    }
  }
  return '';
}

function extractDisplayCode(raw) {
  const s = norm(raw);
  if (!s || s === '-' || s.toLowerCase() === 'empty') return '';

  let m = s.match(/^ODP-([A-Z0-9]+-[A-Z0-9]+)(?:\/|$)/i);
  if (m) return m[1].toUpperCase();

  m = s.match(/^ODP-([A-Z0-9]+)(?:\/|$)/i);
  if (m) return m[1].toUpperCase();

  m = s.match(/^([A-Z0-9]+-[A-Z0-9]+)$/i);
  if (m) return m[1].toUpperCase();

  m = s.match(/^([A-Z0-9]{2,10})$/i);
  if (m) return m[1].toUpperCase();

  m = s.match(/([A-Z0-9]+-[A-Z0-9]+)/i);
  if (m) return m[1].toUpperCase();

  m = s.match(/\b([A-Z0-9]{2,10})\b/i);
  return m ? m[1].toUpperCase() : '';
}

function extractGroup(displayCode) {
  const s = norm(displayCode);
  if (!s) return 'LAINNYA';
  return s.includes('-') ? s.split('-')[0].toUpperCase() : s.toUpperCase();
}

const SKIP_DESC_REGEX = /\b(cabut\s*ont|remove)\b/i;
const TRACK_KEYS = ['Track Order', 'track_order', 'trackorder', 'track', 'c_track_order', 'track id', 'trackid'];
const TEAM_KEYS = ['team_name', 'team name', 'team', 'c_team_name'];
const DESC_KEYS = ['Description', 'description', 'desc', 'c_description', 'report_notes', 'report notes', 'notes'];
const CODE_KEYS = ['ODP', 'odp', 'ODC', 'odc', 'c_workzone', 'workzone', 'work zone', 'WILSUS', 'wilsus'];

async function runUndispatchReminder() {
  console.log('[Scheduler] Running Undispatch Reminder...');
  try {
    const allRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    const groups = {};

    for (const row of allRows) {
      const teamName = pick(row, TEAM_KEYS);
      if (teamName) continue;

      const desc = pick(row, DESC_KEYS);
      if (desc && SKIP_DESC_REGEX.test(desc)) continue;

      const track = pick(row, TRACK_KEYS);
      const codeRaw = pick(row, CODE_KEYS);
      const displayCode = extractDisplayCode(codeRaw);

      if (!track || !displayCode) continue;

      const group = extractGroup(displayCode);
      if (!groups[group]) groups[group] = [];
      groups[group].push({ track, displayCode });
    }

    const groupNames = Object.keys(groups);
    if (!groupNames.length) return;

    let msg = '⏰ *Reminder Order Undispatch*\n\n';
    for (const g of groupNames.sort()) {
      const seen = new Set();
      const uniq = [];
      for (const it of groups[g]) {
        const key = `${it.track}|${it.displayCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(it);
      }
      if (!uniq.length) continue;

      const emoji = EMOJI[g] || EMOJI.LAINNYA;
      msg += `${emoji} *${g}* (${uniq.length})\n`;
      for (const it of uniq) msg += `• ${it.track} — ${it.displayCode}\n`;
      msg += '\n';
    }

    const finalMsg = msg.replace(/\n{3,}/g, '\n\n').trim();
    for (const chatId of TARGET_CHATS) {
      const cleanId = chatId.trim();
      if (cleanId && cleanId.startsWith('-')) {
        await sendOrReplaceBroadcast(broadcastBot, cleanId, 'UNDISPATCH_REMINDER', finalMsg);
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] Undispatch Reminder:', err.message);
  }
}

module.exports = runUndispatchReminder;
