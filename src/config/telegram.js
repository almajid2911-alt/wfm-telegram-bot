const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

const cleanToken = (t) => (t ? String(t).trim().replace(/['"]/g, '') : null);

// 1. Bot Broadcast (Laporan / Cron) - Default: @Kangbakso1bot (8407209552)
const broadcastToken = cleanToken(process.env.TELEGRAM_BROADCAST_BOT_TOKEN) || '8407209552:AAG06OhudzjkwBgipOp5GErfaCTJWClherg';
const broadcastBot = broadcastToken ? new Telegraf(broadcastToken) : null;

// 2. Bot Interaktif (Perintah / Command) - Default: @VALINS12BOT (8530881347)
const interactiveToken = cleanToken(process.env.TELEGRAM_INTERACTIVE_BOT_TOKEN) || cleanToken(process.env.TELEGRAM_BOT_TOKEN) || '8530881347:AAGRI6ks39n3PFx0r1nV_yWDhKHFo_T8DXE';
const interactiveBot = interactiveToken ? new Telegraf(interactiveToken) : null;

// 3. Bot PO Material (External / Logistik)
const poToken = cleanToken(process.env.TELEGRAM_PO_BOT_TOKEN) || broadcastToken;
const poBot = poToken ? new Telegraf(poToken) : null;

console.log(`[Config] Broadcast Bot Token: ${broadcastToken.slice(0, 10)}...`);
console.log(`[Config] Interactive Bot Token: ${interactiveToken.slice(0, 10)}...`);

// Tracker Pesan Terakhir (Auto-Delete Old Message)
const TRACKER_FILE = path.resolve(process.cwd(), 'data/last_messages.json');
let messageTracker = {};

try {
  if (fs.existsSync(TRACKER_FILE)) {
    messageTracker = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  }
} catch (e) {
  messageTracker = {};
}

function saveTracker() {
  try {
    const dir = path.dirname(TRACKER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(messageTracker, null, 2), 'utf8');
  } catch (e) {
    // Ignore write error
  }
}

async function sendMessage(bot, chatId, text, options = {}) {
  if (!bot) {
    console.warn('[Telegram] Bot instance is not configured. Message skipped.');
    return null;
  }
  try {
    return await bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    });
  } catch (err) {
    try {
      return await bot.telegram.sendMessage(chatId, text, {
        disable_web_page_preview: true
      });
    } catch (e) {
      console.error(`[Telegram Error] Failed to send message to ${chatId}:`, e.message);
      return null;
    }
  }
}

/**
 * Kirim pengumuman baru dan otomatis HAPUS pengumuman lama yang sejenis di grup tersebut
 */
async function sendOrReplaceBroadcast(bot, chatId, broadcastKey, text, options = {}) {
  if (!bot) return null;

  const key = `${chatId}_${broadcastKey}`;
  const oldMessageId = messageTracker[key];

  // 1. Hapus pesan lama jika ada
  if (oldMessageId) {
    try {
      await bot.telegram.deleteMessage(chatId, oldMessageId);
      console.log(`🗑️ [Telegram] Deleted old message ${oldMessageId} for ${broadcastKey} in ${chatId}`);
    } catch (err) {
      // Abaikan jika pesan sudah dihapus manual atau lewat batas waktu delete
    }
  }

  // 2. Kirim pesan baru
  const sentMsg = await sendMessage(bot, chatId, text, options);
  if (sentMsg && sentMsg.message_id) {
    messageTracker[key] = sentMsg.message_id;
    saveTracker();
  }
  return sentMsg;
}

module.exports = {
  broadcastBot,
  interactiveBot,
  poBot,
  sendMessage,
  sendOrReplaceBroadcast
};
