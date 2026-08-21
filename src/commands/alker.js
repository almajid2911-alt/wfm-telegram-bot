const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_ALKER_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_ALKER = 'DataAlker';
const SHEET_TEKNISI = 'DataTeknisi';
const SHEET_NAKER = 'NAKER';
const WEBHOOK_URL = process.env.ALKER_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_ALKER_URL || '';

// In-Memory Sessions
const sessions = new Map();
const SESSION_TTL_MS = 15 * 60 * 1000;

function cleanupOldSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.timestamp > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}
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
 * Cari nama teknisi berdasarkan Telegram ID atau teks
 */
async function findTechnicianByTelegram(userId, nameInput = '') {
  try {
    const nakerRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER);
    if (nakerRows && nakerRows.length > 0) {
      const userStr = String(userId).trim();
      const match = nakerRows.find(r => {
        const idInSheet = String(r['ID TELEGRAM'] || r['id telegram'] || r['TELEGRAM_ID'] || '').trim();
        return idInSheet && idInSheet === userStr;
      });
      if (match) {
        return (match['NAMA'] || match['Nama'] || match['nama'] || '').trim();
      }
    }
  } catch (err) {
    console.warn('[Alker] Failed reading NAKER tab:', err.message);
  }

  if (nameInput) {
    return nameInput.trim();
  }

  return null;
}

/**
 * Mengambil daftar alker milik teknisi
 */
async function getAlkerListByTech(techName) {
  const rows = await getSheetRows(SPREADSHEET_ID, SHEET_ALKER, true);
  const target = techName.toLowerCase();
  
  return rows.filter(r => {
    const t = String(r['Teknisi'] || r['TEKNISI'] || r['teknisi'] || '').trim().toLowerCase();
    return t === target || t.includes(target);
  });
}

/**
 * Handler utama command /alker
 */
async function handleAlkerCommand(ctx, rawArgs = '') {
  cleanupOldSessions();
  const sessionKey = getSessionKey(ctx);
  const userId = ctx.from?.id;
  const query = (rawArgs || '').trim();

  const loadingMsg = await ctx.reply('🔍 <i>Mengecek data alker teknisi...</i>', { parse_mode: 'HTML' });

  try {
    let techName = query;
    if (!techName) {
      techName = await findTechnicianByTelegram(userId);
    }

    if (!techName) {
      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      return ctx.reply(
        `🛠️ <b>MONITORING ALKER TEKNISI</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `ID Telegram Anda belum terhubung otomatis dengan NIK/Nama Teknisi.\n\n` +
        `Silakan ketik nama Anda:\n` +
        `👉 Contoh: <code>/alker MUHAMMAD SYAMSUL RIZAL</code>\n` +
        `👉 Atau cari sebagian: <code>/alker RIZAL</code>`,
        { parse_mode: 'HTML' }
      );
    }

    const alkers = await getAlkerListByTech(techName);
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    if (!alkers || alkers.length === 0) {
      return ctx.reply(
        `⚠️ <b>Data Alker Tidak Ditemukan</b>\n\n` +
        `Tidak ditemukan inventaris alker atas nama <b>${escapeHtml(techName)}</b> di Google Sheets.\n\n` +
        `💡 <i>Pastikan penulisan nama sesuai dengan database.</i>`,
        { parse_mode: 'HTML' }
      );
    }

    let countNormal = 0;
    let countRusak = 0;
    let countMissing = 0;
    let countUnchecked = 0;

    alkers.forEach(a => {
      const st = String(a['Status'] || a['STATUS'] || '').trim().toLowerCase();
      if (st === 'normal') countNormal++;
      else if (st === 'rusak') countRusak++;
      else if (st === 'tidak ada' || st === 'hilang') countMissing++;
      else countUnchecked++;
    });

    sessions.set(sessionKey, {
      techName,
      alkers,
      step: 'IDLE',
      timestamp: Date.now()
    });

    let card = `🔧 <b>INVENTARIS ALKER TEKNISI</b>\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    card += `👤 <b>Teknisi:</b> ${escapeHtml(techName.toUpperCase())}\n`;
    card += `📦 <b>Total Alker:</b> ${alkers.length} Item\n\n`;
    card += `📊 <b>Status Ringkasan:</b>\n`;
    card += `  🟢 Normal   : <b>${countNormal}</b> item\n`;
    card += `  🔴 Rusak    : <b>${countRusak}</b> item\n`;
    card += `  ❌ Tidak Ada: <b>${countMissing}</b> item\n`;
    if (countUnchecked > 0) {
      card += `  ⚪ Belum Cek: <b>${countUnchecked}</b> item\n`;
    }
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    card += `👇 <i>Pilih menu di bawah untuk melihat rincian atau update kondisi alker:</i>`;

    const buttons = [
      [Markup.button.callback('📝 Rincian & Update Alker', 'alker_list_items')],
      [Markup.button.callback('🔄 Refresh Data', `alker_refresh_${encodeURIComponent(techName)}`)]
    ];

    return ctx.reply(card, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (err) {
    console.error('❌ [Alker Command Error]:', err.message);
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    return ctx.reply(`⚠️ Terjadi kesalahan saat membaca alker: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

/**
 * Handler Callback Query untuk Navigasi Alker
 */
async function handleAlkerCallback(ctx) {
  const data = ctx.callbackQuery?.data || '';
  const sessionKey = getSessionKey(ctx);
  const session = sessions.get(sessionKey);

  if (data === 'alker_cancel') {
    sessions.delete(sessionKey);
    await ctx.answerCbQuery('Dibatalkan').catch(() => {});
    await ctx.editMessageText('❌ <i>Proses update alker dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
    return true;
  }

  if (data === 'alker_list_items') {
    if (!session || !session.alkers) {
      await ctx.answerCbQuery('Sesi telah kedaluwarsa. Silakan ketik /alker kembali.').catch(() => {});
      return true;
    }

    await ctx.answerCbQuery().catch(() => {});
    const buttons = [];

    session.alkers.forEach((item, idx) => {
      const nama = item['Nama Alker'] || item['NAMA ALKER'] || item['Nama'] || `Item #${idx+1}`;
      const status = (item['Status'] || item['STATUS'] || 'Belum Cek').trim();
      let icon = '⚪';
      if (status.toLowerCase() === 'normal') icon = '🟢';
      else if (status.toLowerCase() === 'rusak') icon = '🔴';
      else if (status.toLowerCase() === 'tidak ada' || status.toLowerCase() === 'hilang') icon = '❌';

      buttons.push([
        Markup.button.callback(`${icon} ${nama} [${status}]`, `alker_sel_${idx}`)
      ]);
    });

    buttons.push([Markup.button.callback('⬅️ Kembali', 'alker_back_main')]);

    await ctx.editMessageText(
      `🛠️ <b>PILIH ALKER UNTUK DI-UPDATE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Silakan klik salah satu alat kerja di bawah untuk mengubah status kondisinya:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      }
    ).catch(() => {});
    return true;
  }

  if (data.startsWith('alker_sel_')) {
    const idx = parseInt(data.replace('alker_sel_', ''), 10);
    if (!session || !session.alkers || !session.alkers[idx]) {
      await ctx.answerCbQuery('Sesi kedaluwarsa. Ketik /alker lagi.').catch(() => {});
      return true;
    }

    const selected = session.alkers[idx];
    session.selectedItem = selected;
    session.selectedIndex = idx;

    await ctx.answerCbQuery().catch(() => {});

    const nama = selected['Nama Alker'] || selected['NAMA ALKER'] || 'Alker';
    const status = selected['Status'] || 'Belum Cek';
    const ket = selected['Keterangan'] || '-';

    const promptText = (
      `🔧 <b>UPDATE STATUS ALKER</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Nama Alat :</b> ${escapeHtml(nama)}\n` +
      `📌 <b>Status Kini:</b> ${escapeHtml(status)}\n` +
      `📝 <b>Keterangan :</b> ${escapeHtml(ket)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Pilih status kondisi terbaru di bawah:`
    );

    const buttons = [
      [
        Markup.button.callback('🟢 Normal (Baik)', `alker_set_normal_${idx}`),
        Markup.button.callback('🔴 Rusak', `alker_set_rusak_${idx}`)
      ],
      [
        Markup.button.callback('❌ Tidak Ada / Hilang', `alker_set_hilang_${idx}`),
        Markup.button.callback('⬅️ Batal / Kembali', 'alker_list_items')
      ]
    ];

    await ctx.editMessageText(promptText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    }).catch(() => {});
    return true;
  }

  if (data.startsWith('alker_set_normal_')) {
    const idx = parseInt(data.replace('alker_set_normal_', ''), 10);
    const item = session?.alkers?.[idx];
    if (!item) return true;

    await ctx.answerCbQuery('Menyimpan status Normal...').catch(() => {});
    await saveAlkerStatusUpdate(ctx, {
      techName: session.techName,
      alkerName: item['Nama Alker'] || item['NAMA ALKER'],
      idAlker: item['ID Alker'] || '',
      status: 'Normal',
      keterangan: ''
    });
    return true;
  }

  if (data.startsWith('alker_set_rusak_') || data.startsWith('alker_set_hilang_')) {
    const isRusak = data.startsWith('alker_set_rusak_');
    const idx = parseInt(data.replace(isRusak ? 'alker_set_rusak_' : 'alker_set_hilang_', ''), 10);
    const item = session?.alkers?.[idx];
    if (!item) return true;

    const targetStatus = isRusak ? 'Rusak' : 'Tidak ada';
    session.targetStatus = targetStatus;
    session.step = 'WAITING_KETERANGAN';
    session.timestamp = Date.now();

    await ctx.answerCbQuery().catch(() => {});

    const commonNotes = isRusak 
      ? ['Pisau Tumpul / Patah', 'Baterai Drop / Mati', 'Lensa / Sensor Kotor', 'Kabel Putus / Rusak Fisik']
      : ['Hilang di Lapangan', 'Tertukar', 'Diserahkan ke Gudang / SPV'];

    const buttons = commonNotes.map(n => [
      Markup.button.callback(`📌 ${n}`, `alker_note_${encodeURIComponent(n)}`)
    ]);
    buttons.push([Markup.button.callback('❌ Batalkan', 'alker_cancel')]);

    await ctx.editMessageText(
      `⚠️ <b>MASUKKAN KETERANGAN ${targetStatus.toUpperCase()}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 Alat: <b>${escapeHtml(item['Nama Alker'] || item['NAMA ALKER'])}</b>\n\n` +
      `Silakan <b>klik opsi cepat</b> di bawah atau <b>ketik pesan alasan/keterangan</b> secara manual:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      }
    ).catch(() => {});
    return true;
  }

  if (data.startsWith('alker_note_')) {
    const note = decodeURIComponent(data.replace('alker_note_', ''));
    if (!session || !session.selectedItem) return true;

    await ctx.answerCbQuery('Menyimpan perubahan...').catch(() => {});
    await saveAlkerStatusUpdate(ctx, {
      techName: session.techName,
      alkerName: session.selectedItem['Nama Alker'] || session.selectedItem['NAMA ALKER'],
      idAlker: session.selectedItem['ID Alker'] || '',
      status: session.targetStatus || 'Rusak',
      keterangan: note
    });
    return true;
  }

  return false;
}

/**
 * Handler Input Pesan Teks untuk Keterangan Manual
 */
async function handleAlkerMessage(ctx) {
  const sessionKey = getSessionKey(ctx);
  const session = sessions.get(sessionKey);

  if (!session || session.step !== 'WAITING_KETERANGAN') return false;

  const text = (ctx.message.text || '').trim();
  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'batal') {
    sessions.delete(sessionKey);
    await ctx.reply('❌ <b>Update alker dibatalkan.</b>', { parse_mode: 'HTML' });
    return true;
  }

  const dataToSave = {
    techName: session.techName,
    alkerName: session.selectedItem['Nama Alker'] || session.selectedItem['NAMA ALKER'],
    idAlker: session.selectedItem['ID Alker'] || '',
    status: session.targetStatus || 'Rusak',
    keterangan: text
  };

  sessions.delete(sessionKey);
  await saveAlkerStatusUpdate(ctx, dataToSave);
  return true;
}

/**
 * Kirim Payload ke Google Apps Script Webhook untuk Update Atomic
 */
async function saveAlkerStatusUpdate(ctx, { techName, alkerName, idAlker, status, keterangan }) {
  const loadingMsg = await ctx.reply('⏳ <i>Sedang menyimpan status ke Google Sheets...</i>', { parse_mode: 'HTML' });
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA';

  try {
    if (WEBHOOK_URL) {
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_alker_bot',
          technicianName: techName,
          alkerName: alkerName,
          idAlker: idAlker,
          status: status,
          keterangan: keterangan,
          updatedBy: ctx.from?.first_name || techName
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      });
      const resText = await resp.text();
      console.log('✅ [Alker Webhook Response]:', resText);
    }

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    let icon = status === 'Normal' ? '🟢' : (status === 'Rusak' ? '🔴' : '❌');
    const successCard = (
      `✅ <b>STATUS ALKER BERHASIL DI-UPDATE!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Teknisi    :</b> ${escapeHtml(techName)}\n` +
      `📦 <b>Nama Alker :</b> ${escapeHtml(alkerName)}\n` +
      `📌 <b>Status Baru:</b> ${icon} <b>${escapeHtml(status.toUpperCase())}</b>\n` +
      `📝 <b>Keterangan :</b> ${escapeHtml(keterangan || '-')}\n` +
      `🕒 <b>Waktu      :</b> ${escapeHtml(timestamp)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 <i>Data telah tersimpan di Google Sheets.</i>`
    );

    await ctx.reply(successCard, { parse_mode: 'HTML' });

  } catch (err) {
    console.error('❌ [Alker Save Error]:', err.message);
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    await ctx.reply(
      `⚠️ <b>Gagal Menyimpan ke Google Sheet</b>\n\nDetail: ${escapeHtml(err.message)}`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = {
  handleAlkerCommand,
  handleAlkerCallback,
  handleAlkerMessage
};
