const { Markup } = require('telegraf');
const { appendSheetRow } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_UNSPEC_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'UNSPEK KENDALA';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=1334539597`;

// In-Memory Session Storage (TTL 10 Menit per User)
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

// Jalankan pembersihan sesi kedaluwarsa setiap 5 menit
setInterval(cleanupOldSessions, 5 * 60 * 1000);

function getSessionKey(ctx) {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  return `${chatId}:${userId}`;
}

const COMMON_KENDALA = [
  'Port ODP Penuh / Full',
  'Redaman Tinggi / Loss Sinyal',
  'Jarak ODP Terlalu Jauh (>250m)',
  'Kabel Drop Core Rusak / Putus',
  'Tiang Patah / ODP Rusak',
  'Pelanggan Menolak / Batal Pasang'
];

/**
 * Handler Perintah Utama /unspec atau /unspek
 */
async function handleUnspecCommand(ctx, rawArgs = '') {
  cleanupOldSessions();
  const sessionKey = getSessionKey(ctx);
  const text = (rawArgs || '').trim();

  // 1. DUKUNGAN INPUT CEPAT 1 BARIS: /unspec 172312345678 | ODP-BLC-FAB/01 | Port ODP Penuh
  if (text && (text.includes('|') || text.includes(','))) {
    const parts = text.includes('|') ? text.split('|') : text.split(',');
    if (parts.length >= 3) {
      const noInternet = parts[0].trim();
      const odp = parts[1].trim();
      const keterangan = parts.slice(2).join(' - ').trim();

      if (noInternet && odp && keterangan) {
        return await saveUnspecToSheet(ctx, { noInternet, odp, keterangan });
      }
    }
  }

  // 2. MODE WIZARD INTERAKTIF (LANGKAH DEMI LANGKAH)
  sessions.set(sessionKey, {
    step: 'WAITING_NO_INTERNET',
    noInternet: '',
    odp: '',
    keterangan: '',
    timestamp: Date.now()
  });

  const promptMsg = (
    `📋 *INPUT DATA UNSPEK KENDALA*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Formulir rekap data unspek terkendala untuk Bank Data._\n\n` +
    `🔢 *Langkah 1/3:* Silakan masukkan *Nomor Internet Pelanggan*\n` +
    `_(Contoh: \`172312345678\` atau \`08123456789\`)_\n\n` +
    `💡 _Ketik \`/cancel\` kapan saja untuk membatalkan._`
  );

  return ctx.reply(promptMsg, {
    parse_mode: 'Markdown',
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

  if (!session) return false; // Bukan sesi unspec, biarkan middleware lain memproses

  const text = (ctx.message.text || '').trim();

  // Cek jika user membatalkan
  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'batal' || text.toLowerCase() === 'cancel') {
    sessions.delete(sessionKey);
    await ctx.reply('❌ *Pengisian data unspek dibatalkan.*', { parse_mode: 'Markdown' });
    return true;
  }

  session.timestamp = Date.now();

  // --- STEP 1: NOMOR INTERNET ---
  if (session.step === 'WAITING_NO_INTERNET') {
    if (text.length < 3) {
      await ctx.reply('⚠️ Nomor Internet terlalu pendek. Masukkan nomor internet yang valid:', { parse_mode: 'Markdown' });
      return true;
    }

    session.noInternet = text;
    session.step = 'WAITING_ODP';

    const promptOdp = (
      `✅ *No. Internet:* \`${session.noInternet}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Langkah 2/3:* Masukkan *Nama / Titik ODP*\n` +
      `_(Contoh: \`ODP-BLC-FAB/01\` atau \`ODP-KTB-FA/12\`)_`
    );

    await ctx.reply(promptOdp, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batalkan Form', 'unspec_cancel')]
      ])
    });
    return true;
  }

  // --- STEP 2: ODP ---
  if (session.step === 'WAITING_ODP') {
    if (text.length < 2) {
      await ctx.reply('⚠️ Nama ODP terlalu pendek. Masukkan nama/titik ODP yang valid:', { parse_mode: 'Markdown' });
      return true;
    }

    session.odp = text.toUpperCase();
    session.step = 'WAITING_KETERANGAN';

    const buttons = COMMON_KENDALA.map((k, idx) => [
      Markup.button.callback(`📌 ${k}`, `unspec_k_${idx}`)
    ]);
    buttons.push([Markup.button.callback('❌ Batalkan Form', 'unspec_cancel')]);

    const promptKet = (
      `✅ *No. Internet:* \`${session.noInternet}\`\n` +
      `✅ *ODP:* \`${session.odp}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ *Langkah 3/3:* Pilih atau ketik *Keterangan Kendala*:\n\n` +
      `_Klik salah satu tombol opsi cepat di bawah atau ketik keterangan manual secara langsung._`
    );

    await ctx.reply(promptKet, {
      parse_mode: 'Markdown',
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
    await ctx.editMessageText('❌ *Pengisian data unspek kendala telah dibatalkan.*', { parse_mode: 'Markdown' }).catch(() => {});
    return true;
  }

  if (data.startsWith('unspec_k_')) {
    if (!session || session.step !== 'WAITING_KETERANGAN') {
      await ctx.answerCbQuery('Sesi pengisian telah kedaluwarsa. Silakan ketik /unspec ulang.').catch(() => {});
      return true;
    }

    const idx = parseInt(data.replace('unspec_k_', ''), 10);
    const selectedKendala = COMMON_KENDALA[idx] || 'Kendala Lapangan';

    session.keterangan = selectedKendala;
    const dataToSave = {
      noInternet: session.noInternet,
      odp: session.odp,
      keterangan: session.keterangan
    };

    sessions.delete(sessionKey);
    await ctx.answerCbQuery('Menyimpan data...').catch(() => {});
    await saveUnspecToSheet(ctx, dataToSave);
    return true;
  }

  return false;
}

/**
 * Simpan Data ke Google Sheets Tab "UNSPEK KENDALA"
 */
async function saveUnspecToSheet(ctx, { noInternet, odp, keterangan }) {
  const loadingMsg = await ctx.reply('⏳ *Sedang mencatat ke Google Sheet Bank Data...*', { parse_mode: 'Markdown' });

  const fromName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || 'Teknisi';
  const now = new Date();
  const options = { timeZone: process.env.TZ || 'Asia/Makassar', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  const formattedTime = new Intl.DateTimeFormat('id-ID', options).format(now);

  try {
    // Format baris Google Sheet: [NO INTERNET, ODP, KETERANGAN]
    const rowValues = [
      noInternet,
      odp,
      keterangan
    ];

    await appendSheetRow(SPREADSHEET_ID, SHEET_NAME, rowValues);

    const successCard = (
      `✅ *DATA UNSPEK KENDALA BERHASIL DISIMPAN!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔢 *No. Internet :* \`${noInternet}\`\n` +
      `📍 *Titik ODP    :* \`${odp}\`\n` +
      `⚠️ *Keterangan   :* *${keterangan}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Petugas      :* ${fromName}\n` +
      `🕒 *Waktu        :* ${formattedTime} WITA\n` +
      `📊 *Database     :* Sheet \`${SHEET_NAME}\`\n\n` +
      `💡 _Data telah masuk ke bank data rekap unspek terkendala._`
    );

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('📊 Buka Google Sheet', SHEET_URL),
        Markup.button.callback('➕ Tambah Lagi', 'unspec_start_again')
      ]
    ]);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      null,
      successCard,
      { parse_mode: 'Markdown', ...keyboard }
    ).catch(async () => {
      await ctx.reply(successCard, { parse_mode: 'Markdown', ...keyboard });
    });

  } catch (err) {
    console.error('❌ [Unspec Sheet Save Error]:', err.message);
    const errorCard = (
      `❌ *GAGAL MENYIMPAN KE GOOGLE SHEET*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Terjadi kendala saat menyimpan baris data ke sheet:\n` +
      `_${err.message}_\n\n` +
      `Silakan coba beberapa saat lagi atau hubungi admin WFM.`
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      null,
      errorCard,
      { parse_mode: 'Markdown' }
    ).catch(async () => {
      await ctx.reply(errorCard, { parse_mode: 'Markdown' });
    });
  }
}

module.exports = {
  handleUnspecCommand,
  handleUnspecMessage,
  handleUnspecCallback
};
