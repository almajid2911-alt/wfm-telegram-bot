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
    const incMatch = text.match(/\b(INC\d{5,12})\b/i);
    if (incMatch) {
      console.log(`[Auto-Detect] INC detected in text: ${incMatch[1]}`);
      return handleInseraCommand(ctx, incMatch[1]);
    }
    const bimaMatch = text.match(/\b(AO\w+|1\d{10,12}|TI\w+|SC\d+|MO\w+|PD\w+)\b/i);
    if (bimaMatch) {
      console.log(`[Auto-Detect] BIMA/Order detected in text: ${bimaMatch[1]}`);
      return handleBimaCommand(ctx, bimaMatch[1]);
    }
    return next();
  });
}

// -------------------------------------------------------------
// 3. HTTP SERVER — Web Dashboard + Mobile Web Form + Webhook
// -------------------------------------------------------------
const { getDashboardData, renderDashboardHtml } = require('./web/dashboard');
const { renderAlkerFormHtml } = require('./web/alkerForm');
const { getSheetRows } = require('./config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_ALKER_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_ALKER = 'DataAlker';
const SHEET_NAKER = 'NAKER';
const WEBHOOK_SCRIPT_URL = process.env.ALKER_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_ALKER_URL || 'https://script.google.com/macros/s/AKfycbyTvKaqyjYSLXQgpYvNqA1X9oBVQzGbmfNb-ZcDiQy5_mhca6KEuYdqyvO4j3aRAW6y/exec';
const GROUP_ID_STATUS_ALKER = '-1003368989739'; // Group "STATUS ALKER" (Foto / Broadcast)
const GROUP_ID_LEADER_ALERT = '-4945019710';    // Group Alert SPV & Leader

// OTP In-Memory Storage (TTL 5 Menit)
const otpStore = new Map();
const MASTER_PIN = '2911';

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // ✅ 1. Webhook endpoint — menerima update dari Telegram
  if (req.method === 'POST' && pathname === WEBHOOK_PATH) {
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

  // ✅ 2. API: Request Kode OTP ke Akun Telegram Teknisi
  if (req.method === 'POST' && pathname === '/api/alker/request-otp') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { technicianName, nik } = JSON.parse(body || '{}');
        const nakerRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true);
        const tech = nakerRows.find(n => {
          const name = String(n['NAMA'] || n['Nama'] || '').trim().toUpperCase();
          const nNik = String(n['NIK'] || '').trim();
          return (name === String(technicianName).toUpperCase()) || (nik && nNik === String(nik));
        });

        if (!tech) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Data teknisi tidak ditemukan di NAKER.' }));
        }

        const telegramId = String(tech['ID TELEGRAM'] || '').trim();
        if (!telegramId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            message: 'Telegram ID Anda belum terdaftar di NAKER. Silakan masukkan NIK Anda sebagai PIN verifikasi.'
          }));
        }

        // Generate 6 Digit Random OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const techKey = String(tech['NAMA'] || tech['Nama'] || '').trim().toUpperCase();
        otpStore.set(techKey, {
          code: otpCode,
          nik: String(tech['NIK'] || '').trim(),
          expiresAt: Date.now() + 5 * 60 * 1000
        });

        // Kirim OTP ke Telegram Pribadi Teknisi
        const tg = interactiveBot ? interactiveBot.telegram : null;
        if (tg) {
          const otpMessage = (
            `🔐 <b>KODE OTP VERIFIKASI ALKER WFM</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Halo <b>${techKey}</b>,\n\n` +
            `Kode verifikasi checklist alker Anda adalah:\n` +
            `👉 <code>${otpCode}</code> 👈\n\n` +
            `⚠️ <i>Kode ini berlaku selama 5 menit. Jangan berikan kode ini kepada orang lain untuk keamanan alker Anda.</i>`
          );

          await tg.sendMessage(telegramId, otpMessage, { parse_mode: 'HTML' });
          console.log(`✅ [OTP Alker] Kode ${otpCode} terkirim ke Telegram ID ${telegramId} (${techKey})`);
        }

        const masked = telegramId.length > 4 ? telegramId.slice(0, 3) + '****' + telegramId.slice(-2) : 'Telegram Anda';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, maskedTelegram: masked }));
      } catch (err) {
        console.error('Error requesting OTP:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // ✅ 3. API: Verifikasi Kode OTP Telegram
  if (req.method === 'POST' && pathname === '/api/alker/verify-otp') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { technicianName, inputCode } = JSON.parse(body || '{}');
        const code = String(inputCode || '').trim();
        const techKey = String(technicianName || '').trim().toUpperCase();

        // 1. Cek Master PIN / Admin Bypass
        if (code === MASTER_PIN) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, verified: true, token: 'MASTER_AUTH' }));
        }

        // 2. Cek OTP Telegram di memory
        const stored = otpStore.get(techKey);
        if (stored && stored.code === code && Date.now() < stored.expiresAt) {
          otpStore.delete(techKey); // Single-use consumption
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, verified: true, token: 'OTP_AUTH_' + code }));
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Kode OTP Telegram salah atau sudah kedaluwarsa (5 menit).' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // ✅ 4. API: Daftar Seluruh Teknisi per Sektor (untuk Form Mobile)
  if (req.method === 'GET' && pathname === '/api/alker/techs') {
    try {
      const nakerRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true);
      const data = nakerRows.map(n => ({
        name: String(n['NAMA'] || n['Nama'] || '').trim().toUpperCase(),
        nik: String(n['NIK'] || '').trim(),
        sektor: String(n['PSA'] || n['Sektor'] || n['SEKTOR'] || 'BATULICIN').trim().toUpperCase(),
        leader: String(n['PIC LEADER'] || n['Leader'] || '-').trim(),
        telegramId: String(n['ID TELEGRAM'] || '').trim()
      })).filter(t => t.name);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ✅ 5. API: Daftar 18 Alker Milik Teknisi Tertentu
  if (req.method === 'GET' && pathname === '/api/alker/tech-items') {
    try {
      const targetName = (reqUrl.searchParams.get('name') || '').trim().toLowerCase();
      if (!targetName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Parameter name wajib diisi.' }));
      }

      const alkerRows = await getSheetRows(SPREADSHEET_ID, SHEET_ALKER, true);
      const filtered = alkerRows.filter(r => {
        const t = String(r['Teknisi'] || r['TEKNISI'] || '').trim().toLowerCase();
        const namaAlker = String(r['Nama Alker'] || r['NAMA ALKER'] || '').trim().toUpperCase();
        return (t === targetName || t.includes(targetName)) && namaAlker !== 'BAJU';
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: filtered }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ✅ 6. API: Submit Form Checklist Alker & Simpan ke Google Sheet + Broadcast Telegram
  if (req.method === 'POST' && pathname === '/api/alker/submit-form') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { technicianName, technicianNik, sektor, leader, items, authToken } = payload;

        if (!authToken || (!authToken.startsWith('OTP_AUTH_') && authToken !== 'MASTER_AUTH')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Akses Ditolak: Verifikasi OTP Telegram wajib dilakukan sebelum submit.' }));
        }

        if (!technicianName || !items || !Array.isArray(items)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Data checklist tidak lengkap.' }));
        }

        let normalCount = 0;
        let rusakCount = 0;
        let missingCount = 0;
        const troubleItems = [];

        items.forEach(it => {
          const st = (it.status || 'Normal').trim();
          if (st === 'Rusak') {
            rusakCount++;
            troubleItems.push({ ...it, statusText: '🔴 Rusak' });
          } else if (st.includes('Tidak') || st === 'Hilang') {
            missingCount++;
            troubleItems.push({ ...it, statusText: '❌ Hilang' });
          } else {
            normalCount++;
          }
        });

        // 1. Simpan ke Google Sheets via Apps Script Webhook (Menggunakan update_alker_bot)
        if (WEBHOOK_SCRIPT_URL) {
          for (const item of items) {
            const st = (item.status || 'Normal').trim();
            const ket = (item.keterangan || (st === 'Normal' ? 'BAIK' : '-')).trim();
            await fetch(WEBHOOK_SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'update_alker_bot',
                technicianName: technicianName,
                alkerName: item.name,
                idAlker: item.idAlker || '',
                status: st,
                keterangan: ket,
                updatedBy: `${technicianName} (Web Form)`
              }),
              redirect: 'follow'
            }).catch(e => console.warn('[Alker Webhook Item Error]', e.message));
          }
          console.log(`✅ [Alker Sync] Berhasil memperbarui ${items.length} item milik ${technicianName} di Google Sheet.`);
        }

        // 2. Broadcast Hasil Update ke Grup "STATUS ALKER" (-1003368989739)
        const tg = interactiveBot ? interactiveBot.telegram : null;
        if (tg) {
          // Kirim broadcast tiap item atau rekap sesuai format grup
          for (const item of items) {
            const st = (item.status || 'Normal').trim().toUpperCase();
            const ket = (item.keterangan || (st === 'NORMAL' ? 'BAIK' : '-')).trim().toUpperCase();
            const sn = item.idAlker || '-';

            const broadcastText = (
              `📢 <b>Update ALKER</b>\n\n` +
              `👷 <b>Teknisi :</b> ${technicianName}\n` +
              `🧰 <b>Alker   :</b> ${item.name}\n` +
              `🔢 <b>SN      :</b> ${sn}\n` +
              `📌 <b>Kondisi :</b> ${st}\n` +
              `📝 <b>Catatan :</b> ${ket}`
            );

            await tg.sendMessage(GROUP_ID_STATUS_ALKER, broadcastText, { parse_mode: 'HTML' }).catch(() => {});
          }

          // Kirim Rekap Summary ke Grup Leader & SPV (-4945019710)
          const timeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA';
          let leaderSummary = `📋 <b>LAPORAN LENGKAP CHECKLIST ALKER (WEB)</b>\n`;
          leaderSummary += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          leaderSummary += `👤 <b>Teknisi :</b> ${technicianName} (${technicianNik || '-'})\n`;
          leaderSummary += `🏢 <b>Sektor  :</b> ${sektor || 'BATULICIN'}\n`;
          leaderSummary += `🕒 <b>Waktu   :</b> ${timeStr}\n\n`;
          leaderSummary += `📊 <b>Status Pemeriksaan (18 Alat):</b>\n`;
          leaderSummary += `  🟢 Normal   : <b>${normalCount}</b> item\n`;
          leaderSummary += `  🔴 Rusak    : <b>${rusakCount}</b> item\n`;
          leaderSummary += `  ❌ Tidak Ada: <b>${missingCount}</b> item\n`;

          if (troubleItems.length > 0) {
            leaderSummary += `\n⚠️ <b>Daftar Alat Bermasalah:</b>\n`;
            troubleItems.forEach((t, i) => {
              leaderSummary += `${i + 1}. ${t.statusText} <b>${t.name}</b> (Ket: ${t.keterangan || '-'})\n`;
            });
          } else {
            leaderSummary += `\n✨ <i>Semua 18 item alker dalam kondisi aman & berfungsi baik.</i>\n`;
          }

          await tg.sendMessage(GROUP_ID_LEADER_ALERT, leaderSummary, { parse_mode: 'HTML' }).catch(() => {});
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Laporan alker berhasil disimpan dan di-broadcast!',
          normalCount,
          rusakCount,
          missingCount
        }));
      } catch (err) {
        console.error('Error submitting alker form:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // ✅ 5. Halaman Mobile Web Form untuk Checklist Alker
  if (req.method === 'GET' && (pathname === '/form' || pathname === '/mobile' || pathname === '/checklist' || pathname === '/alker/form')) {
    try {
      const html = renderAlkerFormHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h3>Gagal memuat Form: ${err.message}</h3>`);
    }
    return;
  }

  // ✅ 6. Dashboard SPV Monitoring Alker
  if (req.method === 'GET' && (pathname === '/' || pathname === '/alker' || pathname === '/dashboard')) {
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

  // ✅ 7. Health check
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    service: 'WFM Telegram Bot & Alker Mobile Ecosystem',
    webForm: `https://${WEBHOOK_DOMAIN}/form`,
    dashboard: `https://${WEBHOOK_DOMAIN}/dashboard`,
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
    try {
      await interactiveBot.telegram.deleteWebhook({ drop_pending_updates: false });
      console.log('✅ [Interactive Bot] Deleted old webhook, switching to 24/7 Long Polling...');
      
      interactiveBot.launch({
        dropPendingUpdates: false,
        allowedUpdates: ['message', 'callback_query']
      });
      console.log('✅ [Interactive Bot] Long Polling started successfully!');

      // Daftarkan bot commands menu
      await interactiveBot.telegram.setMyCommands([
        { command: 'alker',          description: '🛠️ Cek & Update Alat Kerja (Alker)' },
        { command: 'rekapalker',     description: '📊 Rekapitulasi Alker per Sektor (SPV)' },
        { command: 'broadcastalker', description: '📢 Broadcast Reminder Alker ke Seluruh Teknisi' },
        { command: 'unspec',         description: '📝 Rekap data unspek kendala (Bank Data)' },
        { command: 'mapping',        description: '📊 Mapping WO per sektor' },
        { command: 'tiket',          description: '🎫 Monitoring sisa tiket per sektor' },
        { command: 'qc',             description: '🚫 Rekapitulasi QC Reject (NOK)' },
        { command: 'insera',         description: '📌 Cari detail tiket gangguan' },
        { command: 'bima',           description: '📦 Cari detail order layanan BIMA' },
        { command: 'rekon',          description: '📋 Cek rekon MTD tim' },
        { command: 'valins',         description: '🔌 Cek valins ONT baru tim' },
        { command: 'help',           description: '🤖 Bantuan daftar perintah' }
      ]).catch(() => {});
      console.log('✅ [Telegram] Bot commands menu registered!');

    } catch (err) {
      console.warn('⚠️ [Interactive Bot Launch Error]:', err.message);
    }
  }
});

// Graceful shutdown
process.once('SIGINT',  () => { interactiveBot?.stop('SIGINT');  server.close(); });
process.once('SIGTERM', () => { interactiveBot?.stop('SIGTERM'); server.close(); });
