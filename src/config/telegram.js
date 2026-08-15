const { Telegraf } = require('telegraf');

// 1. Bot Broadcast (Laporan / Cron)
const broadcastToken = process.env.TELEGRAM_BROADCAST_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const broadcastBot = broadcastToken ? new Telegraf(broadcastToken) : null;

// 2. Bot Interaktif (Perintah / Command)
const interactiveToken = process.env.TELEGRAM_INTERACTIVE_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const interactiveBot = interactiveToken ? new Telegraf(interactiveToken) : null;

// 3. Bot PO Material (External / Logistik)
const poToken = process.env.TELEGRAM_PO_BOT_TOKEN || broadcastToken;
const poBot = poToken ? new Telegraf(poToken) : null;

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
    }
  }
}

module.exports = {
  broadcastBot,
  interactiveBot,
  poBot,
  sendMessage
};
