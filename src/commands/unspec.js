const { Markup } = require('telegraf');
const { getSheetRows, appendSheetRow } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_UNSPEC_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'UNSPEK KENDALA';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=1334539597`;
const WEBHOOK_URL = process.env.UNSPEC_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_UNSPEC_URL || 'https://script.google.com/macros/s/AKfycbx0WSmuVoVupFcXFYltig0RNIX73FDELXnZd3b51ryUYxtKhHR7kWTN7h_ZHxsuTIvQ/exec';

// In-Memory Session Storage per User (Non-blocking & Thread-Safe di Node.js)
const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000;

function cleanupOldSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.timestamp > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

// Bersihkan sesi kedaluwarsa secara berkala
setInterval(cleanupOldSessions, 5 * 60 * 1000);

function getSessionKey(ctx) {
  const chatId = ctx.chat?.id || 0;
  const userId = ctx.from?.id || 0;
  return `${chatId}:${userId}`;
}

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Validasi Nomor Internet: Pasti 12 digit dan diawali angka 16
 * Contoh valid: 162224204434
 */
function isValidNoInternet(val) {
  const clean = String(val || '').trim();
  return /^16\d{10}$/.test(clean);
}

/**
 * Standardisasi format ODP otomatis (Uppercase & Trim)
 */
function formatOdp(val) {
  if (!val) return '';
  let str = String(val).trim().toUpperCase();
  return str;
}

/**
 * Ambil Identitas Lengkap Petugas Telegram
 * Format: Nama (@username) [ID: 171053504]
 */
function getPetugasInfo(ctx) {
  const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Tanpa Nama';
  const username = ctx.from?.username ? `@${ctx.from.username}` : 'No Username';
  const id = ctx.from?.id || '0';
  return `${name} (${username}) [ID: ${id}]`;
}

const COMMON_KENDALA = [
  'Pelanggan berhenti berlangganan',
  'Pelanggan tidak bisa dihubungi / Rumah kosong',
  'Jarak Tarikan Terlalu Jauh (>250m)',
  'Feeder / Distribusi Cacat'
];

/**
 * Fitur Cari / Cek Riwayat Data Unspek di Google Sheet
 */
async function searchUnspecHistory(ctx, searchedNoInet) {
  const searchMsg = await ctx.reply('🔍 <i>Mencari riwayat data unspek di database...</i>', { parse_mode: 'HTML' });

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME, true);
    const target = String(searchedNoInet).trim();

    // Cari baris yang nomor internetnya cocok
    const match = rows.find(r => {
      const rowNo = String(r['NO INTERNET'] || r['no internet'] || r['No Internet'] || r['NO_INTERNET'] || r['no_internet'] || Object.values(r)[0] || '').trim();
      return rowNo === target;
    });

    await ctx.deleteMessage(searchMsg.message_id).catch(() => {});

    if (match) {
      const getVal = (keys, fallback = '-') => {
        for (const k of keys) {
          if (match[k] !== undefined && match[k] !== null && String(match[k]).trim() !== '') {
            return String(match[k]).trim();
          }
        }
        return fallback;
      };

      const odp = getVal(['ODP', 'odp', 'Titik ODP', 'TITIK ODP']);
      const ket = getVal(['KETERANGAN', 'keterangan', 'Kendala', 'KENDALA']);
      const waktu = getVal(['WAKTU UPDATE', 'waktu update', 'WAKTU', 'waktu', 'TIMESTAMP', 'timestamp', 'Tanggal']);
      const petugas = getVal(['PETUGAS', 'petugas', 'Pelapor', 'Teknisi']);

      const foundCard = (
        `📌 <b>RIWAYAT DATA UNSPEK DITEMUKAN</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔢 <b>No. Internet :</b> <code>${escapeHtml(target)}</code>\n` +
        `📍 <b>Titik ODP    :</b> <code>${escapeHtml(odp)}</code>\n` +
        `⚠️ <b>Keterangan   :</b> <b>${escapeHtml(ket)}</b>\n` +
        `🕒 <b>Waktu Update :</b> ${escapeHtml(waktu)}\n` +
        `👤 <b>Petugas      :</b> ${escapeHtml(petugas)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 <i>Ingin memperbarui kendala pelanggan ini? Ketik:</i>\n` +
        `<code>/unspec ${escapeHtml(target)} &lt;ODP_BARU&gt; &lt;KETERANGAN_BARU&gt;</code>`
      );

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.url('📊 Buka Google Sheet', SHEET_URL),
          Markup.button.callback('✏️ Update Data Ini', `unspec_reinput_${target}`)
        ]
      ]);

      return await ctx.reply(foundCard, { parse_mode: 'HTML', ...keyboard });
    } else {
      const notFoundCard = (
        `🔍 <b>DATA UNSPEK TIDAK DITEMUKAN</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Nomor Internet <code>${escapeHtml(target)}</code> belum pernah tercatat di bank data unspek.\n\n` +
        `💡 <i>Ingin menambahkan data baru? Ketik:</i>\n` +
        `<code>/unspec ${escapeHtml(target)} &lt;ODP&gt; &lt;KETERANGAN&gt;</code>`
      );

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Tambah Data Baru', `unspec_reinput_${target}`)
        ]
      ]);

      return await ctx.reply(notFoundCard, { parse_mode: 'HTML', ...keyboard });
    }

  } catch (err) {
    console.error('❌ [Search Unspec Error]:', err.message);
    await ctx.deleteMessage(searchMsg.message_id).catch(() => {});
    return await ctx.reply(`⚠️ Gagal mencari riwayat data: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

/**
 * Handler Perintah Utama /unspec atau /unspek
 */
async function handleUnspecCommand(ctx, rawArgs = '') {
  cleanupOldSessions();
  const sessionKey = getSessionKey(ctx);
  const text = (rawArgs || '').trim();

  // 1. CEK RIWAYAT JIKA HANYA MEMASUKKAN 1 NOMOR INTERNET:
  // Contoh: /unspec 162224204434
  if (text && !text.includes('|') && !text.includes(',') && !text.includes(' ') && isValidNoInternet(text)) {
    sessions.delete(sessionKey);
    return await searchUnspecHistory(ctx, text);
  }

  // 2. DUKUNGAN INPUT CEPAT 1 BARIS:
  // Contoh 1: /unspec 162224204434 ODP-PGT-FB/130 Berhenti berlangganan
  // Contoh 2: /unspec 162224204434 | ODP-PGT-FB/130 | Berhenti berlangganan
  if (text) {
    let noInternet = '';
    let odp = '';
    let keterangan = '';

    if (text.includes('|') || text.includes(',')) {
      const parts = text.includes('|') ? text.split('|') : text.split(',');
      if (parts.length >= 3) {
        noInternet = parts[0].trim();
        odp = formatOdp(parts[1]);
        keterangan = parts.slice(2).join(' - ').trim();
      }
    } else {
      // Format spasi: /unspec <no_inet> <odp> <keterangan...>
      const tokens = text.split(/\s+/);
      if (tokens.length >= 3) {
        noInternet = tokens[0].trim();
        odp = formatOdp(tokens[1]);
        keterangan = tokens.slice(2).join(' ').trim();
      }
    }

    if (noInternet && odp && keterangan) {
      if (!isValidNoInternet(noInternet)) {
        return ctx.reply(
          `⚠️ <b>Format Nomor Internet Tidak Valid!</b>\n\n` +
          `Nomor Internet harus terdiri dari <b>12 digit angka</b> dan diawali dengan angka <b>16</b>.\n` +
          `_(Contoh yang benar: <code>162224204434</code>)_\n\n` +
          `Input Anda tadi: <code>${escapeHtml(noInternet)}</code>`,
          { parse_mode: 'HTML' }
        );
      }

      sessions.delete(sessionKey);
      return await saveUnspecToSheet(ctx, { noInternet, odp, keterangan });
    }
  }

  // 3. MODE FORM INTERAKTIF (STEP-BY-STEP)
  sessions.set(sessionKey, {
    step: 'WAITING_NO_INTERNET',
    noInternet: '',
    odp: '',
    keterangan: '',
    timestamp: Date.now()
  });

  const promptMsg = (
    `📋 <b>FORM INPUT UNSPEK KENDALA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>Formulir rekap data unspek terkendala (Bank Data).</i>\n\n` +
    `🔢 <b>Langkah 1/3:</b> Masukkan <b>Nomor Internet Pelanggan</b>\n` +
    `<i>(Harus 12 digit, diawali 16. Contoh: <code>162224204434</code>)</i>\n\n` +
    `⚡ <b>Tips Format Cepat (1 Baris Langsung Jadi):</b>\n` +
    `• <code>/unspec 162224204434 ODP-PGT-FB/130 Berhenti berlangganan</code>\n` +
    `• <code>/unspec 162224204434 | ODP-PGT-FB/130 | Rumah kosong</code>\n\n` +
    `🔍 <b>Tips Cek Riwayat:</b> Ketik <code>/unspec 162224204434</code> untuk melihat riwayat sebelumnya.\n\n` +
    `💡 <i>Ketik /cancel kapan saja untuk membatalkan.</i>`
  );

  return ctx.reply(promptMsg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❌ Batalkan Form', 'unspec_cancel')]
    ])
  });
}

/**
 * Handler Pesan Teks Interaktif (Step-by-Step)
 */
async function handleUnspecMessage(ctx) {
  const sessionKey = getSessionKey(ctx);
  const session = sessions.get(sessionKey);

  if (!session) return false;

  const text = (ctx.message.text || '').trim();

  // Cek jika user membatalkan
  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'batal' || text.toLowerCase() === 'cancel') {
    sessions.delete(sessionKey);
    await ctx.reply('❌ <b>Pengisian data unspek dibatalkan.</b>', { parse_mode: 'HTML' });
    return true;
  }

  session.timestamp = Date.now();

  // --- STEP 1: NOMOR INTERNET ---
  if (session.step === 'WAITING_NO_INTERNET') {
    if (!isValidNoInternet(text)) {
      await ctx.reply(
        `⚠️ <b>Nomor Internet Tidak Valid!</b>\n` +
        `Nomor Internet harus <b>12 digit</b> dan diawali <b>16</b> (Contoh: <code>162224204434</code>).\n\n` +
        `Silakan masukkan kembali nomor internet yang benar:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    session.noInternet = text;
    session.step = 'WAITING_ODP';

    const promptOdp = (
      `✅ <b>No. Internet:</b> <code>${escapeHtml(session.noInternet)}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 <b>Langkah 2/3:</b> Masukkan <b>Nama / Titik ODP</b>\n` +
      `<i>(Contoh: <code>ODP-PGT-FB/130</code> atau <code>ODP-BLC-FAB/01</code>)</i>`
    );

    await ctx.reply(promptOdp, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batalkan Form', 'unspec_cancel')]
      ])
    });
    return true;
  }

  // --- STEP 2: ODP ---
  if (session.step === 'WAITING_ODP') {
    if (text.length < 2) {
      await ctx.reply('⚠️ Nama ODP terlalu pendek. Masukkan nama/titik ODP yang valid:', { parse_mode: 'HTML' });
      return true;
    }

    session.odp = formatOdp(text);
    session.step = 'WAITING_KETERANGAN';

    const buttons = COMMON_KENDALA.map((k, idx) => [
      Markup.button.callback(`📌 ${k}`, `unspec_k_${idx}`)
    ]);
    buttons.push([Markup.button.callback('❌ Batalkan Form', 'unspec_cancel')]);

    const promptKet = (
      `✅ <b>No. Internet:</b> <code>${escapeHtml(session.noInternet)}</code>\n` +
      `✅ <b>ODP:</b> <code>${escapeHtml(session.odp)}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ <b>Langkah 3/3:</b> Pilih atau ketik <b>Keterangan Kendala</b>:\n\n` +
      `<i>Klik salah satu tombol opsi cepat di bawah atau ketik keterangan manual secara langsung.</i>`
    );

    await ctx.reply(promptKet, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
    return true;
  }

  // --- STEP 3: KETERANGAN MANUAL ---
  if (session.step === 'WAITING_KETERANGAN') {
    session.keterangan = text;
    const dataToSave = {
      noInternet: session.noInternet,
      odp: session.odp,
      keterangan: session.keterangan
    };
    sessions.delete(sessionKey);
    await saveUnspecToSheet(ctx, dataToSave);
    return true;
  }

  return false;
}

/**
 * Handler Callback Query untuk Tombol Opsi Cepat Kendala & Cancel
 */
async function handleUnspecCallback(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const sessionKey = getSessionKey(ctx);
  const session = sessions.get(sessionKey);

  if (data === 'unspec_cancel') {
    sessions.delete(sessionKey);
    await ctx.answerCbQuery('Dibatalkan').catch(() => {});
    await ctx.editMessageText('❌ <b>Pengisian data unspek kendala telah dibatalkan.</b>', { parse_mode: 'HTML' }).catch(() => {});
    return true;
  }

  if (data.startsWith('unspec_reinput_')) {
    const targetNo = data.replace('unspec_reinput_', '').trim();
    sessions.set(sessionKey, {
      step: 'WAITING_ODP',
      noInternet: targetNo,
      odp: '',
      keterangan: '',
      timestamp: Date.now()
    });
    await ctx.answerCbQuery().catch(() => {});

    const promptOdp = (
      `✅ <b>No. Internet:</b> <code>${escapeHtml(targetNo)}</code>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 <b>Langkah 2/3:</b> Masukkan <b>Nama / Titik ODP</b>\n` +
      `<i>(Contoh: <code>ODP-PGT-FB/130</code> atau <code>ODP-BLC-FAB/01</code>)</i>`
    );

    await ctx.reply(promptOdp, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batalkan Form', 'unspec_cancel')]
      ])
    });
    return true;
  }

  if (data.startsWith('unspec_k_')) {
    if (!session || session.step !== 'WAITING_KETERANGAN') {
      await ctx.answerCbQuery('Sesi pengisian telah selesai/kedaluwarsa. Silakan ketik /unspec ulang.').catch(() => {});
      return true;
    }

    const idx = parseInt(data.replace('unspec_k_', ''), 10);
    const selectedKendala = COMMON_KENDALA[idx] || 'Kendala Lapangan';

    const dataToSave = {
      noInternet: session.noInternet,
      odp: session.odp,
      keterangan: selectedKendala
    };

    sessions.delete(sessionKey);
    await ctx.answerCbQuery('Mencatat ke Google Sheet...').catch(() => {});
    await saveUnspecToSheet(ctx, dataToSave);
    return true;
  }

  return false;
}

/**
 * Simpan Data ke Google Sheets Tab "UNSPEK KENDALA"
 */
async function saveUnspecToSheet(ctx, { noInternet, odp, keterangan }) {
  const loadingMsg = await ctx.reply('⏳ <i>Sedang mencatat ke Google Sheet Bank Data...</i>', { parse_mode: 'HTML' });

  const petugasInfo = getPetugasInfo(ctx);
  const now = new Date();
  const options = { timeZone: process.env.TZ || 'Asia/Makassar', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  const formattedTime = new Intl.DateTimeFormat('id-ID', options).format(now);

  try {
    const webhookUrl = WEBHOOK_URL;
    let isUpdated = false;

    if (webhookUrl) {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noInternet,
          odp,
          keterangan,
          waktu: formattedTime,
          petugas: petugasInfo
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      });
      const resText = await resp.text();
      try {
        const resJson = JSON.parse(resText);
        if (resJson.action === 'UPDATED') {
          isUpdated = true;
        }
      } catch (e) {
        // Ignore json parse error
      }
      console.log('✅ [Google Webhook Success]:', resText);
    } else {
      // Fallback ke Google Sheets API: [NO INTERNET, ODP, KETERANGAN, WAKTU UPDATE, PETUGAS]
      const rowValues = [noInternet, odp, keterangan, formattedTime, petugasInfo];
      await appendSheetRow(SPREADSHEET_ID, SHEET_NAME, rowValues);
    }

    const titleHeader = isUpdated
      ? `🔄 <b>DATA UNSPEK BERHASIL DIPERBARUI!</b>\n<i>(Data lama no. internet ini otomatis digantikan data terbaru)</i>`
      : `✅ <b>DATA UNSPEK KENDALA BERHASIL DISIMPAN!</b>`;

    const successCard = (
      `${titleHeader}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔢 <b>No. Internet :</b> <code>${escapeHtml(noInternet)}</code>\n` +
      `📍 <b>Titik ODP    :</b> <code>${escapeHtml(odp)}</code>\n` +
      `⚠️ <b>Keterangan   :</b> <b>${escapeHtml(keterangan)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🕒 <b>Waktu Update :</b> ${escapeHtml(formattedTime)} WITA\n` +
      `👤 <b>Petugas      :</b> ${escapeHtml(petugasInfo)}\n` +
      `📊 <b>Database     :</b> Sheet <code>${escapeHtml(SHEET_NAME)}</code>\n\n` +
      `💡 <i>Data telah berhasil masuk ke bank data rekap unspek.</i>`
    );

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('📊 Buka Google Sheet', SHEET_URL),
        Markup.button.callback('➕ Tambah Lagi', 'unspec_start_again')
      ]
    ]);

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    await ctx.reply(successCard, {
      parse_mode: 'HTML',
      ...keyboard
    });

  } catch (err) {
    console.error('❌ [Unspec Sheet Save Error]:', err.message);

    let errorDetail = err.message || 'Terjadi kesalahan tidak terduga';
    const errorCard = (
      `❌ <b>GAGAL MENYIMPAN KE GOOGLE SHEET</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ <b>Detail Kendala:</b>\n` +
      `${escapeHtml(errorDetail)}\n\n` +
      `Silakan coba kembali dalam beberapa saat.`
    );

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    await ctx.reply(errorCard, { parse_mode: 'HTML' });
  }
}

module.exports = {
  handleUnspecCommand,
  handleUnspecMessage,
  handleUnspecCallback
};
