require('dotenv').config();
const http = require('http');
const cron = require('node-cron');

const { broadcastBot, interactiveBot } = require('./config/telegram');

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
const handleTiketCommand = require('./commands/tiket');
const handleQcCommand = require('./commands/qc');

console.log('=============================================');
console.log('🚀 WFM TELEGRAM BOT ENGINE STARTING...');
console.log('=============================================');

const TIMEZONE = process.env.TZ || process.env.GENERIC_TIMEZONE || 'Asia/Makassar';
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || 'wfm-telegram-bot-production.up.railway.app';
const WEBHOOK_PATH = '/webhook';
const WEBHOOK_URL = `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// 0. GLOBAL ERROR HANDLER (ANTI-CRASH 24/7)
// -------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('🔥 [Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Unhandled Rejection]:', reason);
});

// -------------------------------------------------------------
// 1. SETUP CRON SCHEDULERS (BOT BROADCAST)
// -------------------------------------------------------------
cron.schedule('35 7-21 * * *',    () => runUndispatchInsera(),  { timezone: TIMEZONE });
cron.schedule('25 8-10,16-17 * * *', () => runWecare(),         { timezone: TIMEZONE });
cron.schedule('*/30 8-22 * * *',  () => runPotensiPs(),          { timezone: TIMEZONE });
cron.schedule('23 9-20 * * *',    () => runRemindFailwa(),       { timezone: TIMEZONE });
cron.schedule('*/24 8-17 * * *',  () => runUndispatchReminder(), { timezone: TIMEZONE });
cron.schedule('6 8-17 * * *',     () => runUndispatchXpro(),    { timezone: TIMEZONE });
cron.schedule('*/24 8-17 * * *',  () => runFfg(),               { timezone: TIMEZONE });
cron.schedule('41 8-23 * * *',    () => runTiketPenting(),      { timezone: TIMEZONE });
cron.schedule('0 8,16 * * *',     () => runPoMaterial(),        { timezone: TIMEZONE });

console.log(`✅ [Schedulers] All 9 cron jobs registered (timezone: ${TIMEZONE})`);

// -------------------------------------------------------------
// 2. SETUP INTERACTIVE BOT COMMAND HANDLERS
// -------------------------------------------------------------
if (interactiveBot) {
  interactiveBot.catch((err, ctx) => {
    console.error(`❌ [Telegraf Error] updateType ${ctx?.updateType}:`, err.message);
  });

  interactiveBot.use((ctx, next) => {
    const text = ctx.message?.text || ctx.callbackQuery?.data || '';
    const from = ctx.from?.username || ctx.from?.first_name || ctx.from?.id;
    console.log(`📩 [Incoming] from ${from}: ${text}`);
    return next();
  });

  interactiveBot.start((ctx) => ctx.reply(
    `👋 Halo *${ctx.from.first_name || 'Rekan'}*!\n\n` +
    `Saya adalah Bot Asisten WFM. Berikut perintah:\n\n` +
    `• \`/mapping <sektor>\` - Mapping WO per sektor\n` +
    `• \`/tiket <sektor>\` - Monitoring sisa tiket\n` +
    `• \`/qc\` - Rekapitulasi QC Reject (NOK)\n` +
    `• \`/rekon <tim>\` - Cek rekon MTD\n` +
    `• \`/valins <tim>\` - Cek valins ONT\n` +
    `• \`/insera <INC>\` - Detail tiket gangguan\n` +
    `• \`/bima <WO>\` - Detail order BIMA\n`,
    { parse_mode: 'Markdown' }
  ));

  interactiveBot.help((ctx) => ctx.reply(
    `🤖 *MENU BANTUAN BOT ASISTEN WFM*\n\n` +
    `📌 *1. MAPPING SEKTOR*\n\`/mapping batulicin\` | \`/mapping kotabaru\` | \`/mapping satui\`\n\n` +
    `📌 *2. TIKET SEKTOR*\n\`/tiket batulicin\` | \`/tiket kotabaru\` | \`/tiket satui\`\n\n` +
    `📌 *3. REKAP QC REJECT*\n\`/qc\`\n\n` +
    `📌 *4. DETAIL TIKET INSERA*\n\`/insera INC52127760\` atau langsung ketik \`INC...\`\n\n` +
    `📌 *5. DETAIL ORDER BIMA*\n\`/bima AOi...\` atau langsung ketik \`AOi...\`\n\n` +
    `📌 *6. REKON TIM*\n\`/rekon BLC|ARIF-006\`\n\n` +
    `📌 *7. VALINS TIM*\n\`/valins BLC|ARIF-006\``,
    { parse_mode: 'Markdown' }
  ));

  interactiveBot.command('mapping', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleMappingCommand(ctx, args);
  });
  interactiveBot.command('tiket', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleTiketCommand(ctx, args);
  });
  interactiveBot.command('qc', (ctx) => handleQcCommand(ctx));
  interactiveBot.command('rekon', (ctx) => {
    const tim = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    if (!tim) return ctx.reply('⚠️ Contoh: `/rekon BLC|ARIF-006`', { parse_mode: 'Markdown' });
    handleRekonCommand(ctx, tim);
  });
  interactiveBot.command('valins', (ctx) => {
    const tim = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    if (!tim) return ctx.reply('⚠️ Contoh: `/valins BLC|ARIF-006`', { parse_mode: 'Markdown' });
    handleValinsCommand(ctx, tim);
  });
  interactiveBot.command('insera', (ctx) => {
    const kw = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleInseraCommand(ctx, kw);
  });
  interactiveBot.command('bima', (ctx) => {
    const kw = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleBimaCommand(ctx, kw);
  });

  // Callback Query (Tombol Sektor)
  interactiveBot.action('map_batulicin', (ctx) => { ctx.answerCbQuery().catch(() => {}); handleMappingCommand(ctx, 'batulicin'); });
  interactiveBot.action('map_kotabaru',  (ctx) => { ctx.answerCbQuery().catch(() => {}); handleMappingCommand(ctx, 'kotabaru'); });
  interactiveBot.action('map_satui',     (ctx) => { ctx.answerCbQuery().catch(() => {}); handleMappingCommand(ctx, 'satui'); });
  interactiveBot.action('tkt_batulicin', (ctx) => { ctx.answerCbQuery().catch(() => {}); handleTiketCommand(ctx, 'batulicin'); });
  interactiveBot.action('tkt_kotabaru',  (ctx) => { ctx.answerCbQuery().catch(() => {}); handleTiketCommand(ctx, 'kotabaru'); });
  interactiveBot.action('tkt_satui',     (ctx) => { ctx.answerCbQuery().catch(() => {}); handleTiketCommand(ctx, 'satui'); });

  // Teks langsung (tanpa slash)
  interactiveBot.on('text', (ctx, next) => {
    const text = (ctx.message.text || '').trim();
    if (text.startsWith('/')) return next();
    const incMatch = text.match(/^\s*(INC?\d+)\b/i);
    if (incMatch) return handleInseraCommand(ctx, incMatch[1]);
    const bimaMatch = text.match(/^\s*(AO\w+|1\d+|TI\w+|SC\w+|MO\w+|PD\w+)\b/i);
    if (bimaMatch) return handleBimaCommand(ctx, bimaMatch[1]);
    return next();
  });
}

// -------------------------------------------------------------
// 3. HTTP SERVER — Health Check + Webhook Endpoint
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  // ✅ Webhook endpoint untuk menerima update dari Telegram
  if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        if (interactiveBot) {
          await interactiveBot.handleUpdate(update);
        }
        res.writeHead(200);
        res.end('OK');
      } catch (err) {
        console.error('[Webhook Error]', err.message);
        res.writeHead(200); // tetap 200 agar Telegram tidak retry terus
        res.end('OK');
      }
    });
    return;
  }

  // ✅ Health check endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    mode: 'WEBHOOK',
    webhook: WEBHOOK_URL,
    service: 'WFM Telegram Bot',
    time: new Date().toISOString(),
    timezone: TIMEZONE
  }));
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ [Server] Listening on 0.0.0.0:${PORT}`);

  // Register webhook ke Telegram setelah server siap
  if (interactiveBot) {
    try {
      await interactiveBot.telegram.setWebhook(WEBHOOK_URL, {
        allowed_updates: ['message', 'callback_query']
      });
      console.log(`✅ [Webhook] Registered: ${WEBHOOK_URL}`);

      const info = await interactiveBot.telegram.getWebhookInfo();
      console.log(`✅ [Webhook Info] url=${info.url} | pending=${info.pending_update_count}`);

      // Daftarkan menu popup command resmi Telegram
      await interactiveBot.telegram.setMyCommands([
        { command: 'mapping', description: '📊 Mapping WO per sektor' },
        { command: 'tiket',   description: '🎫 Monitoring sisa tiket per sektor' },
        { command: 'qc',      description: '🚫 Rekapitulasi QC Reject (NOK)' },
        { command: 'insera',  description: '📌 Cari detail tiket gangguan' },
        { command: 'bima',    description: '📦 Cari detail order layanan BIMA' },
        { command: 'rekon',   description: '📋 Cek rekon MTD tim' },
        { command: 'valins',  description: '🔌 Cek valins ONT baru tim' },
        { command: 'help',    description: '🤖 Bantuan daftar perintah' }
      ]);
      console.log('✅ [Telegram] Bot commands menu registered!');
    } catch (err) {
      console.error('❌ [Webhook Error] Failed to set webhook:', err.message);
    }
  }
});

// Graceful shutdown
process.once('SIGINT',  () => { interactiveBot?.stop('SIGINT');  server.close(); });
process.once('SIGTERM', () => { interactiveBot?.stop('SIGTERM'); server.close(); });
