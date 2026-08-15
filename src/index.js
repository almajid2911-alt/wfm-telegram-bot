require('dotenv').config();
const http = require('http');
const cron = require('node-cron');

const { broadcastBot, interactiveBot, poBot } = require('./config/telegram');

// Schedulers
const runUndispatchInsera = require('./schedulers/undispatchInsera');
const runWecare = require('./schedulers/wecare');
const runPotensiPs = require('./schedulers/potensiPs');
const runRemindFailwa = require('./schedulers/failwa');
const runUndispatchReminder = require('./schedulers/undispatchReminder');
const runUndispatchXpro = require('./schedulers/undispatchXpro');
const runFfg = require('./schedulers/ffg');
const runTiketPenting = require('./schedulers/tiketPenting');
const runPoMaterial = require('./schedulers/poMaterial');

// Interactive Handlers
const { handleRekonCommand, handleValinsCommand } = require('./commands/rekon');
const handleInseraCommand = require('./commands/insera');
const handleBimaCommand = require('./commands/bima');
const handleMappingCommand = require('./commands/mapping');

console.log('=============================================');
console.log('🚀 WFM TELEGRAM BOT ENGINE STARTING...');
console.log('=============================================');

const TIMEZONE = process.env.TZ || process.env.GENERIC_TIMEZONE || 'Asia/Makassar';

// -------------------------------------------------------------
// 0. GLOBAL ERROR HANDLER (ANTI-CRASH 24/7)
// -------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('🔥 [Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [Unhandled Rejection]:', reason);
});

// -------------------------------------------------------------
// 1. SETUP CRON SCHEDULERS (BOT BROADCAST SESUAI JADWAL N8N)
// -------------------------------------------------------------
// 1. Undispatch Insera: menit 35, jam 07:35 - 21:35 WITA
cron.schedule('35 7-21 * * *', () => runUndispatchInsera(), { timezone: TIMEZONE });

// 2. Wecare: menit 25, jam 08:25-10:25 & 16:25-17:25 WITA
cron.schedule('25 8-10,16-17 * * *', () => runWecare(), { timezone: TIMEZONE });

// 3. Potensi PS: tiap 30 menit, jam 08:00 - 22:30 WITA
cron.schedule('*/30 8-22 * * *', () => runPotensiPs(), { timezone: TIMEZONE });

// 4. Failwa: menit 23, jam 09:23 - 20:23 WITA
cron.schedule('23 9-20 * * *', () => runRemindFailwa(), { timezone: TIMEZONE });

// 5. Reminder Undispatch: tiap 24 menit, jam 08:00 - 17:00 WITA
cron.schedule('*/24 8-17 * * *', () => runUndispatchReminder(), { timezone: TIMEZONE });

// 6. Undispatch XPRO: menit 06, jam 08:06 - 17:06 WITA
cron.schedule('6 8-17 * * *', () => runUndispatchXpro(), { timezone: TIMEZONE });

// 7. FFG: tiap 24 menit, jam 08:00 - 17:00 WITA
cron.schedule('*/24 8-17 * * *', () => runFfg(), { timezone: TIMEZONE });

// 8. Tiket Penting: menit 41, jam 08:41 - 23:41 WITA
cron.schedule('41 8-23 * * *', () => runTiketPenting(), { timezone: TIMEZONE });

// 9. PO Material: jam 08:00 dan 16:00 WITA
cron.schedule('0 8,16 * * *', () => runPoMaterial(), { timezone: TIMEZONE });

console.log(`✅ [Schedulers] All 9 cron jobs registered with timezone: ${TIMEZONE}`);

// -------------------------------------------------------------
// 2. SETUP INTERACTIVE BOT COMMANDS
// -------------------------------------------------------------
if (interactiveBot) {
  interactiveBot.start((ctx) => {
    ctx.reply(`👋 Halo *${ctx.from.first_name || 'Rekan'}*!\n\nSaya adalah Bot Asisten WFM. Berikut perintah yang bisa digunakan:\n\n` +
      `• \`/mapping <sektor>\` - Mapping WO per sektor (satui/batulicin/kotabaru)\n` +
      `• \`/rekon <nama_tim>\` - Cek rekon MTD\n` +
      `• \`/valins <nama_tim>\` - Cek valins ONT\n` +
      `• \`/insera <incident>\` - Cari detail tiket Insera (atau langsung ketik \`INC...\`)\n` +
      `• \`/bima <track_order>\` - Cari detail order BIMA (atau langsung ketik \`AOi...\`)\n`, { parse_mode: 'Markdown' });
  });

  // /mapping <sektor>
  interactiveBot.command('mapping', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const args = parts.slice(1).join(' ').trim();
    handleMappingCommand(ctx, args);
  });

  // /rekon <tim>
  interactiveBot.command('rekon', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const tim = parts.slice(1).join(' ').trim();
    if (!tim) return ctx.reply('⚠️ Format salah! Gunakan: `/rekon <nama_tim>`\nContoh: `/rekon BLC|ARIF-006`', { parse_mode: 'Markdown' });
    handleRekonCommand(ctx, tim);
  });

  // /valins <tim>
  interactiveBot.command('valins', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const tim = parts.slice(1).join(' ').trim();
    if (!tim) return ctx.reply('⚠️ Format salah! Gunakan: `/valins <nama_tim>`\nContoh: `/valins BLC|ARIF-006`', { parse_mode: 'Markdown' });
    handleValinsCommand(ctx, tim);
  });

  // /insera <keyword>
  interactiveBot.command('insera', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const kw = parts.slice(1).join(' ').trim();
    handleInseraCommand(ctx, kw);
  });

  // /bima <keyword>
  interactiveBot.command('bima', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const kw = parts.slice(1).join(' ').trim();
    handleBimaCommand(ctx, kw);
  });

  // Listener untuk pesan teks langsung (tanpa slash command)
  interactiveBot.on('text', (ctx, next) => {
    const text = (ctx.message.text || '').trim();
    if (text.startsWith('/')) return next();

    // 1. Cek pola Insera (INC49943649, IN49943649, inc...)
    const incMatch = text.match(/^\s*(INC?\d+)\b/i);
    if (incMatch) {
      return handleInseraCommand(ctx, incMatch[1]);
    }

    // 2. Cek pola Bima (AOi..., 1..., TI..., SC..., MO..., PD...)
    const bimaMatch = text.match(/^\s*(AO\w+|1\d+|TI\w+|SC\w+|MO\w+|PD\w+)\b/i);
    if (bimaMatch) {
      return handleBimaCommand(ctx, bimaMatch[1]);
    }

    return next();
  });

  // Launch Interactive Bot
  interactiveBot.launch().then(() => {
    console.log('✅ [Telegram] Interactive Bot listening for commands...');
  }).catch(err => {
    console.error('❌ [Telegram Error] Interactive Bot failed to launch:', err.message);
  });
}

// -------------------------------------------------------------
// 3. HTTP HEALTH CHECK SERVER (FOR RAILWAY WEB PORT)
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    service: 'WFM Telegram Automation Service',
    time: new Date().toISOString(),
    timezone: TIMEZONE
  }));
});

server.listen(PORT, () => {
  console.log(`✅ [Server] Healthcheck listening on port ${PORT}`);
});

// Graceful shutdown
process.once('SIGINT', () => {
  if (interactiveBot) interactiveBot.stop('SIGINT');
  server.close();
});
process.once('SIGTERM', () => {
  if (interactiveBot) interactiveBot.stop('SIGTERM');
  server.close();
});
