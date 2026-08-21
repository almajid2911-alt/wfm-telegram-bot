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
const runPotensiGaulReminder = require('./schedulers/potensiGaul');
const { runWeeklyAlkerReminder, reportOverdueComplianceToLeaders, handleBroadcastAlkerCommand } = require('./schedulers/alkerReminder');

// Interactive Handlers
const { handleRekonCommand, handleValinsCommand } = require('./commands/rekon');
const handleInseraCommand = require('./commands/insera');
const handleBimaCommand = require('./commands/bima');
const handleMappingCommand = require('./commands/mapping');
const handleTiketCommand = require('./commands/tiket');
const handleQcCommand = require('./commands/qc');
const { handleUnspecCommand, handleUnspecMessage, handleUnspecCallback } = require('./commands/unspec');
const { handleAlkerCommand, handleAlkerCallback, handleAlkerMessage, handleRekapAlkerCommand } = require('./commands/alker');

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
cron.schedule('35 7-21 * * *',       () => runUndispatchInsera(),     { timezone: TIMEZONE });
cron.schedule('25 8-10,16-17 * * *', () => runWecare(),               { timezone: TIMEZONE });
cron.schedule('*/30 8-22 * * *',     () => runPotensiPs(),            { timezone: TIMEZONE });
cron.schedule('23 9-20 * * *',       () => runRemindFailwa(),         { timezone: TIMEZONE });
cron.schedule('*/24 8-17 * * *',     () => runUndispatchReminder(),   { timezone: TIMEZONE });
cron.schedule('6 8-17 * * *',        () => runUndispatchXpro(),       { timezone: TIMEZONE });
cron.schedule('*/24 8-17 * * *',     () => runFfg(),                  { timezone: TIMEZONE });
cron.schedule('41 8-23 * * *',       () => runTiketPenting(),         { timezone: TIMEZONE });
// cron.schedule('0 8,16 * * *',        () => runPoMaterial(),           { timezone: TIMEZONE }); // Disabled temporarily
cron.schedule('19 8,10,12,14,16,18,20 * * *', () => runPotensiGaulReminder(), { timezone: TIMEZONE });
// Reminder mingguan cek & update alker setiap Senin jam 08:00 WITA
cron.schedule('0 8 * * 1',  () => runWeeklyAlkerReminder(interactiveBot), { timezone: TIMEZONE });
// Laporan kepatuhan alker ke grup Leader (> 14 hari belum update) setiap Senin jam 08:30 WITA
cron.schedule('30 8 * * 1', () => reportOverdueComplianceToLeaders(interactiveBot), { timezone: TIMEZONE });

console.log(`✅ [Schedulers] Active cron jobs registered (timezone: ${TIMEZONE})`);

// -------------------------------------------------------------
// 2. SETUP INTERACTIVE BOT COMMAND HANDLERS
// -------------------------------------------------------------
if (interactiveBot) {
  interactiveBot.catch((err, ctx) => {
    // Tangani 429 Rate Limit secara khusus
    if (err.response && err.response.error_code === 429) {
      const retryAfter = err.response.parameters?.retry_after || 30;
      console.warn(`⚠️ [Rate Limit] Telegram 429: retry after ${retryAfter}s`);
      return; // Diam saja, jangan retry agresif
    }
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
    `• \`/alker\` - 🛠️ Cek & Update Status Alat Kerja (Alker)\n` +
    `• \`/mapping <sektor>\` - Mapping WO per sektor\n` +
    `• \`/tiket <sektor>\` - Monitoring sisa tiket\n` +
    `• \`/unspec\` - 📝 Rekap data unspek kendala (Bank Data)\n` +
    `• \`/qc\` - Rekapitulasi QC Reject (NOK)\n` +
    `• \`/rekon <tim>\` - Cek rekon MTD\n` +
    `• \`/valins <tim>\` - Cek valins ONT\n` +
    `• \`/insera <INC>\` - Detail tiket gangguan\n` +
    `• \`/bima <WO>\` - Detail order BIMA\n`,
    { parse_mode: 'Markdown' }
  ));

  interactiveBot.help((ctx) => ctx.reply(
    `🤖 *MENU BANTUAN BOT ASISTEN WFM*\n\n` +
    `📌 *1. MONITORING & UPDATE ALKER (ALAT KERJA)*\n\`/alker\` atau \`/alker <nama_teknisi>\`\n\n` +
    `📌 *2. REKAP UNSPEK KENDALA (BANK DATA)*\n\`/unspec\` atau \`/unspek\`\n` +
    `_Format cepat: \`/unspec 172312345678 | ODP-BLC-FAB/01 | Port ODP Penuh\`_\n\n` +
    `📌 *3. MAPPING SEKTOR*\n\`/mapping batulicin\` | \`/mapping kotabaru\` | \`/mapping satui\`\n\n` +
    `📌 *4. TIKET SEKTOR*\n\`/tiket batulicin\` | \`/tiket kotabaru\` | \`/tiket satui\`\n\n` +
    `📌 *5. REKAP QC REJECT*\n\`/qc\`\n\n` +
    `📌 *6. DETAIL TIKET INSERA*\n\`/insera INC52127760\` atau langsung ketik \`INC...\`\n\n` +
    `📌 *7. DETAIL ORDER BIMA*\n\`/bima AOi...\` atau langsung ketik \`AOi...\`\n\n` +
    `📌 *8. REKON TIM*\n\`/rekon BLC|ARIF-006\`\n\n` +
    `📌 *9. VALINS TIM*\n\`/valins BLC|ARIF-006\``,
    { parse_mode: 'Markdown' }
  ));

  interactiveBot.command('unspec', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleUnspecCommand(ctx, args);
  });
  interactiveBot.command('unspek', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleUnspecCommand(ctx, args);
  });
  interactiveBot.command('cekunspec', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleUnspecCommand(ctx, args);
  });
  interactiveBot.command('cancel', (ctx) => {
    handleUnspecMessage(ctx);
  });

  interactiveBot.command('mapping', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleMappingCommand(ctx, args);
  });
  interactiveBot.command('tiket', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleTiketCommand(ctx, args);
  });
  interactiveBot.command('qc',     (ctx) => handleQcCommand(ctx));
  interactiveBot.command('rekon',  (ctx) => {
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

  interactiveBot.command('alker', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleAlkerCommand(ctx, args);
  });
  interactiveBot.command('cekalker', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleAlkerCommand(ctx, args);
  });
  interactiveBot.command('rekapalker', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleRekapAlkerCommand(ctx, args);
  });
  interactiveBot.command('rekap_alker', (ctx) => {
    const args = ctx.message.text.trim().split(/\s+/).slice(1).join(' ').trim();
    handleRekapAlkerCommand(ctx, args);
  });
  interactiveBot.command('broadcastalker', (ctx) => handleBroadcastAlkerCommand(ctx));
  interactiveBot.command('remindalker',    (ctx) => handleBroadcastAlkerCommand(ctx));
  interactiveBot.command('cekcompliance',  async (ctx) => {
    await ctx.reply('🔍 <i>Mengecek kepatuhan alker dan mengirim laporan ke grup leader...</i>', { parse_mode: 'HTML' });
    await reportOverdueComplianceToLeaders(ctx.telegram);
    await ctx.reply('✅ <i>Pengecekan selesai! Laporan telah dikirim ke Grup Leader.</i>', { parse_mode: 'HTML' });
  });

  // Callback Query (Tombol Sektor, Unspec & Alker)
  interactiveBot.action('map_batulicin', (ctx) => { ctx.answerCbQuery().catch(() => {}); handleMappingCommand(ctx, 'batulicin'); });
  interactiveBot.action('map_kotabaru',  (ctx) => { ctx.answerCbQuery().catch(() => {}); handleMappingCommand(ctx, 'kotabaru'); });
  interactiveBot.action('map_satui',     (ctx) => { ctx.answerCbQuery().catch(() => {}); handleMappingCommand(ctx, 'satui'); });
  interactiveBot.action('tkt_batulicin', (ctx) => { ctx.answerCbQuery().catch(() => {}); handleTiketCommand(ctx, 'batulicin'); });
  interactiveBot.action('tkt_kotabaru',  (ctx) => { ctx.answerCbQuery().catch(() => {}); handleTiketCommand(ctx, 'kotabaru'); });
  interactiveBot.action('tkt_satui',     (ctx) => { ctx.answerCbQuery().catch(() => {}); handleTiketCommand(ctx, 'satui'); });
  interactiveBot.action('unspec_start_again', (ctx) => { ctx.answerCbQuery().catch(() => {}); handleUnspecCommand(ctx, ''); });
  interactiveBot.action(/^unspec_/, async (ctx) => { await handleUnspecCallback(ctx); });
  interactiveBot.action('rekap_alker_batulicin', (ctx) => { ctx.answerCbQuery().catch(() => {}); handleRekapAlkerCommand(ctx, 'batulicin'); });
  interactiveBot.action('rekap_alker_kotabaru',  (ctx) => { ctx.answerCbQuery().catch(() => {}); handleRekapAlkerCommand(ctx, 'kotabaru'); });
  interactiveBot.action('rekap_alker_satui',     (ctx) => { ctx.answerCbQuery().catch(() => {}); handleRekapAlkerCommand(ctx, 'satui'); });
  interactiveBot.action('rekap_alker_all',       (ctx) => { ctx.answerCbQuery().catch(() => {}); handleRekapAlkerCommand(ctx, ''); });
  interactiveBot.action(/^alker_refresh_/, (ctx) => {
    const tech = decodeURIComponent(ctx.callbackQuery.data.replace('alker_refresh_', ''));
    ctx.answerCbQuery().catch(() => {});
    handleAlkerCommand(ctx, tech);
  });
  interactiveBot.action(/^alker_/, async (ctx) => { await handleAlkerCallback(ctx); });

  // Teks langsung & Foto (untuk Unspec & Alker Photo Upload)
  interactiveBot.on(['text', 'photo'], async (ctx, next) => {
    // 1. Prioritaskan sesi pengisian interaktif unspec jika user sedang di dalam form
    const handledByUnspec = await handleUnspecMessage(ctx);
    if (handledByUnspec) return;

    // 2. Prioritaskan sesi pengisian keterangan alker / upload foto alker
    const handledByAlker = await handleAlkerMessage(ctx);
    if (handledByAlker) return;

    const text = (ctx.message.text || ctx.message.caption || '').trim();
    if (!text || text.startsWith('/')) return next();

    const incMatch = text.match(/^\s*(INC?\d+)\b/i);
    if (incMatch) return handleInseraCommand(ctx, incMatch[1]);
    const bimaMatch = text.match(/^\s*(AO\w+|1\d+|TI\w+|SC\w+|MO\w+|PD\w+)\b/i);
    if (bimaMatch) return handleBimaCommand(ctx, bimaMatch[1]);
    return next();
  });
}

// -------------------------------------------------------------
// 3. HTTP SERVER — Web Dashboard + Webhook Endpoint
// -------------------------------------------------------------
const { getDashboardData, renderDashboardHtml } = require('./web/dashboard');

const server = http.createServer(async (req, res) => {
  // ✅ 1. Webhook endpoint — menerima update dari Telegram
  if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        if (interactiveBot) {
          await interactiveBot.handleUpdate(update);
        }
      } catch (err) {
        console.error('[Webhook Parse Error]', err.message);
      }
      res.writeHead(200);
      res.end('OK');
    });
    return;
  }

  // ✅ 2. API Endpoint Data Alker JSON
  if (req.method === 'GET' && req.url.startsWith('/api/alker')) {
    try {
      const data = await getDashboardData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ✅ 3. Tampilan Web Dashboard SPV Monitoring Alker
  if (req.method === 'GET' && (req.url === '/' || req.url === '/alker' || req.url === '/dashboard')) {
    try {
      const data = await getDashboardData();
      const html = renderDashboardHtml(data);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h3>Gagal memuat Dashboard: ${err.message}</h3>`);
    }
    return;
  }

  // ✅ 4. Health check
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    mode: 'WEBHOOK',
    dashboard: `https://${WEBHOOK_DOMAIN}/alker`,
    service: 'WFM Telegram Bot & Alker Dashboard',
    time: new Date().toISOString(),
    timezone: TIMEZONE
  }));
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ [Server] Listening on 0.0.0.0:${PORT}`);
  console.log(`✅ [Webhook] Target URL: ${WEBHOOK_URL}`);

  // -------------------------------------------------------------
  // Register webhook ke Telegram — Exponential Backoff (Anti-Ban)
  // Max 5 percobaan: tunggu 5s → 10s → 20s → 40s → stop
  // Tidak pakai infinite retry agar tidak kena flood control
  // -------------------------------------------------------------
  if (interactiveBot) {
    const MAX_ATTEMPTS = 5;
    let attempt = 0;

    async function tryRegisterWebhook() {
      attempt++;
      const delay = Math.min(5000 * Math.pow(2, attempt - 1), 60000); // 5s, 10s, 20s, 40s, 60s

      try {
        console.log(`🔄 [Webhook] Attempt ${attempt}/${MAX_ATTEMPTS} - registering webhook...`);

        await interactiveBot.telegram.setWebhook(WEBHOOK_URL, {
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true
        });

        const info = await interactiveBot.telegram.getWebhookInfo();
        console.log(`✅ [Webhook] Successfully registered!`);
        console.log(`   URL     : ${info.url}`);
        console.log(`   Pending : ${info.pending_update_count}`);

        // Daftarkan bot commands menu (hanya sekali setelah webhook berhasil)
        await interactiveBot.telegram.setMyCommands([
          { command: 'alker',          description: '🛠️ Cek & Update Alat Kerja (Alker)' },
          { command: 'rekapalker',     description: '📊 Rekapitulasi Alker per Sektor (SPV)' },
          { command: 'broadcastalker', description: '📢 Broadcast Reminder Alker ke Seluruh Teknisi' },
          { command: 'unspec',     description: '📝 Rekap data unspek kendala (Bank Data)' },
          { command: 'mapping',    description: '📊 Mapping WO per sektor' },
          { command: 'tiket',      description: '🎫 Monitoring sisa tiket per sektor' },
          { command: 'qc',         description: '🚫 Rekapitulasi QC Reject (NOK)' },
          { command: 'insera',     description: '📌 Cari detail tiket gangguan' },
          { command: 'bima',       description: '📦 Cari detail order layanan BIMA' },
          { command: 'rekon',      description: '📋 Cek rekon MTD tim' },
          { command: 'valins',     description: '🔌 Cek valins ONT baru tim' },
          { command: 'help',       description: '🤖 Bantuan daftar perintah' }
        ]).catch(() => {});
        console.log('✅ [Telegram] Bot commands menu registered!');

      } catch (err) {
        // Handle 429 Rate Limit khusus
        if (err.response && err.response.error_code === 429) {
          const retryAfter = (err.response.parameters?.retry_after || 30) * 1000;
          console.warn(`⚠️ [Webhook] Rate limited (429). Telegram minta tunggu ${retryAfter/1000}s`);
          if (attempt < MAX_ATTEMPTS) {
            setTimeout(tryRegisterWebhook, retryAfter + 2000);
          } else {
            console.error(`❌ [Webhook] Max attempts reached. Webhook tidak terdaftar otomatis.`);
            console.error(`   → Jalankan manual: node set_webhook_raw.js`);
          }
          return;
        }

        console.warn(`⚠️ [Webhook] Attempt ${attempt} failed: ${err.message}`);

        if (attempt < MAX_ATTEMPTS) {
          console.log(`   → Retry dalam ${delay/1000}s...`);
          setTimeout(tryRegisterWebhook, delay);
        } else {
          console.error(`❌ [Webhook] Max ${MAX_ATTEMPTS} attempts reached. Webhook tidak terdaftar otomatis.`);
          console.error(`   → Jalankan manual dari Railway Console: node set_webhook_raw.js`);
        }
      }
    }

    // Mulai dengan delay 3 detik agar server benar-benar siap dulu
    setTimeout(tryRegisterWebhook, 3000);
  }
});

// Graceful shutdown
process.once('SIGINT',  () => { interactiveBot?.stop('SIGINT');  server.close(); });
process.once('SIGTERM', () => { interactiveBot?.stop('SIGTERM'); server.close(); });
