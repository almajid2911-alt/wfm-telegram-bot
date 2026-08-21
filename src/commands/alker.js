const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');
const { interactiveBot } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_ALKER_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_ALKER = 'DataAlker';
const SHEET_NAKER = 'NAKER';
const WEBHOOK_URL = process.env.ALKER_WEBHOOK_URL || process.env.GOOGLE_SCRIPT_ALKER_URL || 'https://script.google.com/macros/s/AKfycbyTvKaqyjYSLXQgpYvNqA1X9oBVQzGbmfNb-ZcDiQy5_mhca6KEuYdqyvO4j3aRAW6y/exec';

// Group IDs
const GROUP_ID_PHOTO_LOG = '-1003368989739'; // Group foto bukti kerusakan
const GROUP_ID_LEADER_ALERT = '-4945019710';  // Group alert SPV & Leader

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
 * Cari teknisi berdasarkan NIK, Telegram ID, atau Nama
 */
async function resolveTechnician(userId, query = '') {
  try {
    const nakerRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true);
    if (!nakerRows || nakerRows.length === 0) return null;

    const cleanQuery = (query || '').trim();

    if (cleanQuery) {
      const matchNik = nakerRows.find(r => {
        const nik = String(r['NIK'] || r['nik'] || '').trim();
        return nik && nik === cleanQuery;
      });
      if (matchNik) {
        return {
          nik: String(matchNik['NIK'] || '').trim(),
          nama: String(matchNik['NAMA'] || matchNik['Nama'] || '').trim(),
          sektor: String(matchNik['PSA'] || 'BATULICIN').trim(),
          leader: String(matchNik['PIC LEADER'] || '-').trim(),
          telegramId: String(matchNik['ID TELEGRAM'] || '').trim()
        };
      }

      const matchName = nakerRows.find(r => {
        const name = String(r['NAMA'] || r['Nama'] || '').trim().toUpperCase();
        return name && name.includes(cleanQuery.toUpperCase());
      });
      if (matchName) {
        return {
          nik: String(matchName['NIK'] || '').trim(),
          nama: String(matchName['NAMA'] || matchName['Nama'] || '').trim(),
          sektor: String(matchName['PSA'] || 'BATULICIN').trim(),
          leader: String(matchName['PIC LEADER'] || '-').trim(),
          telegramId: String(matchName['ID TELEGRAM'] || '').trim()
        };
      }

      return null;
    }

    if (userId) {
      const userStr = String(userId).trim();
      const matchTg = nakerRows.find(r => {
        const idInSheet = String(r['ID TELEGRAM'] || r['id telegram'] || '').trim();
        return idInSheet && idInSheet === userStr;
      });
      if (matchTg) {
        return {
          nik: String(matchTg['NIK'] || '').trim(),
          nama: String(matchTg['NAMA'] || matchTg['Nama'] || '').trim(),
          sektor: String(matchTg['PSA'] || 'BATULICIN').trim(),
          leader: String(matchTg['PIC LEADER'] || '-').trim(),
          telegramId: String(matchTg['ID TELEGRAM'] || '').trim()
        };
      }
    }

  } catch (err) {
    console.warn('[Alker] Failed resolving technician:', err.message);
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
    const namaAlker = String(r['Nama Alker'] || r['NAMA ALKER'] || '').trim().toUpperCase();
    return (t === target || t.includes(target)) && namaAlker !== 'BAJU';
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
    const tech = await resolveTechnician(userId, query);

    if (!tech) {
      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      if (query) {
        return ctx.reply(
          `⚠️ <b>Teknisi Tidak Ditemukan</b>\n\n` +
          `Tidak ditemukan teknisi dengan NIK / Nama: <code>${escapeHtml(query)}</code>\n\n` +
          `💡 <i>Gunakan NIK yang terdaftar di NAKER. Contoh: <code>/alker 25830030</code></i>`,
          { parse_mode: 'HTML' }
        );
      }

      const sectorKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.url('📱 Buka Form Checklist di HP (Web)', 'https://alker.103.93.129.213.sslip.io/form')
        ],
        [
          Markup.button.callback('🏢 Sektor Batulicin', 'alker_sektor_batulicin'),
          Markup.button.callback('🏢 Sektor Satui', 'alker_sektor_satui')
        ],
        [
          Markup.button.callback('🏢 Sektor Kotabaru', 'alker_sektor_kotabaru'),
          Markup.button.callback('📊 Rekap Seluruh Alker', 'rekap_alker_all')
        ]
      ]);

      return ctx.reply(
        `🛠️ <b>PILIH WILAYAH / NAMA TEKNISI ALKER</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📱 <i>Gunakan Web Form HP untuk checklist 18 alat sekaligus dengan cepat, atau pilih Sektor Wilayah Anda di bawah:</i>\n\n` +
        `💡 <i>Atau langsung ketik NIK / Nama Anda:\n👉 Contoh: <code>/alker 25830030</code> atau <code>/alker ARIF</code></i>`,
        { parse_mode: 'HTML', ...sectorKeyboard }
      );
    }

    const techName = tech.nama;
    const techNik = tech.nik;
    const alkers = await getAlkerListByTech(techName);
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    if (!alkers || alkers.length === 0) {
      return ctx.reply(
        `⚠️ <b>Data Alker Tidak Ditemukan</b>\n\n` +
        `Tidak ditemukan inventaris alker atas nama <b>${escapeHtml(techName)}</b> (NIK: <code>${techNik}</code>).\n\n` +
        `💡 <i>Pastikan data telah disinkronkan di Google Sheets.</i>`,
        { parse_mode: 'HTML' }
      );
    }

    let countNormal = 0;
    let countRusak = 0;
    let countMissing = 0;

    alkers.forEach(a => {
      const st = String(a['Status'] || a['STATUS'] || 'Normal').trim().toLowerCase();
      if (st === 'rusak') countRusak++;
      else if (st === 'tidak ada' || st === 'hilang') countMissing++;
      else countNormal++;
    });

    const currentUserId = String(ctx.from?.id || '');
    const isAdminOrLeader = (currentUserId === '171053504');
    const isOwner = (tech.telegramId && tech.telegramId === currentUserId) || (!tech.telegramId && query === tech.nik) || isAdminOrLeader;

    sessions.set(sessionKey, {
      techName,
      techNik,
      techTelegramId: tech.telegramId,
      isOwner,
      sektor: tech.sektor,
      leader: tech.leader,
      alkers,
      step: 'IDLE',
      timestamp: Date.now()
    });

    let card = `🔧 <b>INVENTARIS ALKER TEKNISI</b>\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    card += `👤 <b>Teknisi:</b> ${escapeHtml(techName.toUpperCase())}\n`;
    card += `🆔 <b>NIK    :</b> <code>${escapeHtml(techNik)}</code>\n`;
    card += `🏢 <b>Sektor :</b> ${escapeHtml(tech.sektor)}\n`;
    card += `📦 <b>Total  :</b> ${alkers.length} Item Alker\n\n`;
    card += `📊 <b>Status Ringkasan:</b>\n`;
    card += `  🟢 Normal   : <b>${countNormal}</b> item\n`;
    card += `  🔴 Rusak    : <b>${countRusak}</b> item\n`;
    card += `  ❌ Tidak Ada: <b>${countMissing}</b> item\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    const formUrl = `https://alker.103.93.129.213.sslip.io/form?nik=${encodeURIComponent(techNik)}&tech=${encodeURIComponent(techName)}&sektor=${encodeURIComponent(tech.sektor)}`;

    let buttons = [];
    if (isOwner) {
      card += `👇 <i>Pilih tombol Form HP untuk checklist 18 alat sekaligus, atau pilih aksi di bawah:</i>`;
      buttons = [
        [Markup.button.url('📱 Buka Checklist Alker (Web HP)', formUrl)],
        [Markup.button.callback('✅ Semua Aman (1-Klik Telegram)', 'alker_mass_confirm')],
        [Markup.button.callback('📝 Rincian & Update Manual', 'alker_list_items')],
        [Markup.button.callback('🔄 Refresh Data', `alker_refresh_${encodeURIComponent(techNik || techName)}`)]
      ];
    } else {
      card += `🔒 <b>Mode Lihat (Read-Only)</b>\n<i>Anda sedang melihat data milik ${escapeHtml(techName)}. Anda tidak dapat mengubah data ini karena bukan pemilik akun.</i>`;
      buttons = [
        [Markup.button.url('📱 Buka Form Checklist (Web HP)', formUrl)],
        [Markup.button.callback('📋 Rincian Alat (Mode Lihat)', 'alker_list_items_readonly')],
        [Markup.button.callback('🔄 Refresh Data', `alker_refresh_${encodeURIComponent(techNik || techName)}`)]
      ];
    }

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

  // SEKTOR SELECTION (BATULICIN / SATUI / KOTABARU)
  if (data.startsWith('alker_sektor_')) {
    const sektorTarget = data.replace('alker_sektor_', '').toUpperCase();
    await ctx.answerCbQuery(`Memuat teknisi ${sektorTarget}...`).catch(() => {});
    
    try {
      const getSectorGroup = (psa) => {
        const p = (psa || '').toUpperCase().trim();
        if (['SATUI', 'KINTAP', 'ALKAUTSAR', 'AL-KAUTSAR', 'PAGATAN', 'ANGSANA', 'SEBAMBAN', 'STI', 'KIP', 'PGT'].some(s => p.includes(s))) return 'SATUI';
        if (['KOTABARU', 'KTB', 'LONTAR', 'LTR', 'STAGEN', 'KPL'].some(s => p.includes(s))) return 'KOTABARU';
        return 'BATULICIN';
      };

      const nakerRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true);
      const filtered = nakerRows.filter(r => {
        const psa = String(r['PSA'] || r['psa'] || '').trim().toUpperCase();
        return getSectorGroup(psa) === sektorTarget || psa === sektorTarget;
      });

      if (!filtered.length) {
        return ctx.reply(`⚠️ Tidak ada data teknisi untuk sektor ${sektorTarget}.`);
      }

      const techButtons = [];
      for (let i = 0; i < filtered.length; i += 2) {
        const rowBtns = [];
        const t1 = filtered[i];
        const name1 = String(t1['NAMA'] || t1['Nama'] || '').trim();
        const nik1 = String(t1['NIK'] || '').trim();
        if (name1) {
          rowBtns.push(Markup.button.callback(`👤 ${name1.slice(0, 16)}`, `alker_pick_${encodeURIComponent(nik1 || name1)}`));
        }
        if (i + 1 < filtered.length) {
          const t2 = filtered[i + 1];
          const name2 = String(t2['NAMA'] || t2['Nama'] || '').trim();
          const nik2 = String(t2['NIK'] || '').trim();
          if (name2) {
            rowBtns.push(Markup.button.callback(`👤 ${name2.slice(0, 16)}`, `alker_pick_${encodeURIComponent(nik2 || name2)}`));
          }
        }
        techButtons.push(rowBtns);
      }

      techButtons.push([
        Markup.button.callback('⬅️ Kembali Pilih Wilayah', 'alker_back_sektor')
      ]);

      return ctx.editMessageText(
        `🏢 <b>DAFTAR TEKNISI SEKTOR ${sektorTarget}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Silakan klik nama Anda untuk membuka status inventaris Alker:`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(techButtons) }
      );
    } catch (err) {
      return ctx.reply(`❌ Gagal memuat daftar teknisi: ${err.message}`);
    }
  }

  if (data === 'alker_back_sektor') {
    await ctx.answerCbQuery().catch(() => {});
    const sectorKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.url('📱 Buka Form Checklist di HP (Web)', 'https://alker.103.93.129.213.sslip.io/form')
      ],
      [
        Markup.button.callback('🏢 Sektor Batulicin', 'alker_sektor_batulicin'),
        Markup.button.callback('🏢 Sektor Satui', 'alker_sektor_satui')
      ],
      [
        Markup.button.callback('🏢 Sektor Kotabaru', 'alker_sektor_kotabaru'),
        Markup.button.callback('📊 Rekap Seluruh Alker', 'rekap_alker_all')
      ]
    ]);
    return ctx.editMessageText(
      `🛠️ <b>PILIH WILAYAH / NAMA TEKNISI ALKER</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📱 <i>Gunakan Web Form HP untuk checklist cepat, atau pilih Sektor Wilayah Anda di bawah:</i>`,
      { parse_mode: 'HTML', ...sectorKeyboard }
    );
  }

  if (data.startsWith('alker_pick_')) {
    const query = decodeURIComponent(data.replace('alker_pick_', ''));
    await ctx.answerCbQuery(`Membuka alker ${query}...`).catch(() => {});
    return handleAlkerCommand(ctx, query);
  }

  // MASS CONFIRMATION (Tidak Ada Perubahan Minggu Ini)
  if (data === 'alker_mass_confirm') {
    if (!session) {
      await ctx.answerCbQuery('Sesi telah kedaluwarsa. Silakan ketik /alker kembali.').catch(() => {});
      return true;
    }

    if (!session.isOwner) {
      return ctx.answerCbQuery('🚫 Akses Ditolak: Anda tidak dapat mengupdate alker milik teknisi lain!', { show_alert: true });
    }

    await ctx.answerCbQuery('Menyimpan konfirmasi alker...').catch(() => {});
    const loading = await ctx.reply('⏳ <i>Menyimpan update mingguan alker...</i>', { parse_mode: 'HTML' });

    try {
      if (WEBHOOK_URL) {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mass_confirm_alker',
            technicianName: session.techName
          })
        });
      }

      await ctx.deleteMessage(loading.message_id).catch(() => {});
      const timeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA';

      const successCard = (
        `✅ <b>KONFIRMASI ALKER MINGGU INI BERHASIL!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Teknisi :</b> ${escapeHtml(session.techName)} (${session.techNik})\n` +
        `🏢 <b>Sektor  :</b> ${escapeHtml(session.sektor)}\n` +
        `📦 <b>Kondisi :</b> Semua 18 Alker tercatat <b>Aman / Sesuai</b>\n` +
        `🕒 <b>Waktu   :</b> ${timeStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 <i>Status kepatuhan mingguan Anda telah diperbarui di Web Dashboard SPV.</i>`
      );

      sessions.delete(sessionKey);
      return ctx.reply(successCard, { parse_mode: 'HTML' });

    } catch (err) {
      await ctx.deleteMessage(loading.message_id).catch(() => {});
      return ctx.reply(`⚠️ Gagal menyimpan konfirmasi: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
    }
  }

  if (data === 'alker_back_main') {
    if (!session) {
      await ctx.answerCbQuery('Sesi telah kedaluwarsa.').catch(() => {});
      return true;
    }
    await ctx.answerCbQuery().catch(() => {});
    return handleAlkerCommand(ctx, session.techNik || session.techName);
  }

  if (data.startsWith('alker_refresh_')) {
    const query = decodeURIComponent(data.replace('alker_refresh_', ''));
    await ctx.answerCbQuery('Memperbarui data...').catch(() => {});
    return handleAlkerCommand(ctx, query);
  }

  if (data === 'alker_list_items_readonly') {
    if (!session || !session.alkers) {
      await ctx.answerCbQuery('Sesi telah kedaluwarsa. Silakan ketik /alker kembali.').catch(() => {});
      return true;
    }

    await ctx.answerCbQuery().catch(() => {});
    let listText = `📋 <b>RINCIAN ALKER (MODE LIHAT)</b>\n`;
    listText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    listText += `👤 <b>Teknisi:</b> ${escapeHtml(session.techName)} (${session.techNik})\n`;
    listText += `🏢 <b>Sektor :</b> ${escapeHtml(session.sektor)}\n\n`;

    session.alkers.forEach((item, idx) => {
      const nama = item['Nama Alker'] || item['NAMA ALKER'] || `Item #${idx+1}`;
      const status = (item['Status'] || item['STATUS'] || 'Normal').trim();
      let icon = '🟢';
      if (status.toLowerCase() === 'rusak') icon = '🔴';
      else if (status.toLowerCase() === 'tidak ada' || status.toLowerCase() === 'hilang') icon = '❌';

      listText += `${idx + 1}. ${icon} <b>${escapeHtml(nama)}</b>: <code>${escapeHtml(status)}</code>\n`;
    });

    listText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    listText += `🔒 <i>Hanya pemilik akun (${escapeHtml(session.techName)}) yang berhak mengedit alker ini.</i>`;

    const buttons = [
      [Markup.button.callback('⬅️ Kembali', 'alker_back_main')]
    ];

    await ctx.editMessageText(listText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    }).catch(() => {});
    return true;
  }

  if (data === 'alker_list_items') {
    if (!session || !session.alkers) {
      await ctx.answerCbQuery('Sesi telah kedaluwarsa. Silakan ketik /alker kembali.').catch(() => {});
      return true;
    }

    if (!session.isOwner) {
      return ctx.answerCbQuery('🚫 Akses Ditolak: Anda tidak dapat mengupdate alker milik teknisi lain!', { show_alert: true });
    }

    await ctx.answerCbQuery().catch(() => {});
    const buttons = [];

    session.alkers.forEach((item, idx) => {
      const nama = item['Nama Alker'] || item['NAMA ALKER'] || `Item #${idx+1}`;
      const status = (item['Status'] || item['STATUS'] || 'Normal').trim();
      let icon = '🟢';
      if (status.toLowerCase() === 'rusak') icon = '🔴';
      else if (status.toLowerCase() === 'tidak ada' || status.toLowerCase() === 'hilang') icon = '❌';

      buttons.push([
        Markup.button.callback(`${icon} ${nama} [${status}]`, `alker_sel_${idx}`)
      ]);
    });

    buttons.push([Markup.button.callback('⬅️ Kembali', 'alker_back_main')]);

    await ctx.editMessageText(
      `🛠️ <b>PILIH ALKER UNTUK DI-UPDATE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Teknisi:</b> ${escapeHtml(session.techName)} (${session.techNik})\n\n` +
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

    if (!session.isOwner) {
      return ctx.answerCbQuery('🚫 Akses Ditolak: Anda tidak dapat mengupdate alker milik teknisi lain!', { show_alert: true });
    }

    const selected = session.alkers[idx];
    session.selectedItem = selected;
    session.selectedIndex = idx;

    await ctx.answerCbQuery().catch(() => {});

    const nama = selected['Nama Alker'] || selected['NAMA ALKER'] || 'Alker';
    const status = selected['Status'] || 'Normal';
    const ket = selected['Keterangan'] || '-';
    const sn = selected['SN / ID Alker'] || selected['ID Alker'] || '-';

    const promptText = (
      `🔧 <b>UPDATE STATUS ALKER</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Nama Alat :</b> ${escapeHtml(nama)}\n` +
      `🔢 <b>SN / ID   :</b> <code>${escapeHtml(sn)}</code>\n` +
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
        Markup.button.callback('⬅️ Kembali', 'alker_list_items')
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
      techNik: session.techNik,
      sektor: session.sektor,
      alkerName: item['Nama Alker'] || item['NAMA ALKER'],
      idAlker: item['SN / ID Alker'] || item['ID Alker'] || '',
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

    const buttons = [
      [Markup.button.callback('❌ Batalkan', 'alker_cancel')]
    ];

    await ctx.editMessageText(
      `⚠️ <b>MASUKKAN KETERANGAN ${targetStatus.toUpperCase()} & FOTO</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Alat:</b> ${escapeHtml(item['Nama Alker'] || item['NAMA ALKER'])}\n` +
      `👤 <b>Teknisi:</b> ${escapeHtml(session.techName)} (${session.techNik})\n\n` +
      `Silakan kirim balasan:\n` +
      `📷 <b>Kirim Foto Fisik Alat</b> (dengan keterangan di caption), ATAU\n` +
      `✍️ <b>Ketik Pesan Teks</b> alasan kerusakannya secara manual:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      }
    ).catch(() => {});
    return true;
  }

  return false;
}

/**
 * Handler Input Pesan Teks & Foto dari Teknisi
 */
async function handleAlkerMessage(ctx) {
  const sessionKey = getSessionKey(ctx);
  const session = sessions.get(sessionKey);

  if (!session || session.step !== 'WAITING_KETERANGAN') return false;

  const isPhoto = !!(ctx.message.photo && ctx.message.photo.length > 0);
  const text = (ctx.message.text || ctx.message.caption || '').trim();

  if (text.toLowerCase() === '/cancel' || text.toLowerCase() === 'batal') {
    sessions.delete(sessionKey);
    await ctx.reply('❌ <b>Update alker dibatalkan.</b>', { parse_mode: 'HTML' });
    return true;
  }

  const alkerName = session.selectedItem['Nama Alker'] || session.selectedItem['NAMA ALKER'];
  const sn = session.selectedItem['SN / ID Alker'] || session.selectedItem['ID Alker'] || '-';
  const finalKet = text || (isPhoto ? 'Foto bukti terlampir di grup log' : 'Rusak fisik di lapangan');

  const dataToSave = {
    techName: session.techName,
    techNik: session.techNik,
    sektor: session.sektor,
    alkerName: alkerName,
    idAlker: sn !== '-' ? sn : '',
    status: session.targetStatus || 'Rusak',
    keterangan: finalKet
  };

  // 1. Jika ada foto, kirimkan foto ke Group Foto Log (-1003368989739)
  if (isPhoto) {
    const highestPhoto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const photoCaption = (
      `📸 <b>BUKTI KONDISI ALKER RUSAK / BERMASALAH</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Teknisi :</b> ${escapeHtml(session.techName)} (${session.techNik})\n` +
      `🏢 <b>Sektor  :</b> ${escapeHtml(session.sektor)}\n` +
      `📦 <b>Alat    :</b> ${escapeHtml(alkerName)} (SN: ${escapeHtml(sn)})\n` +
      `📌 <b>Status  :</b> 🔴 <b>${escapeHtml(session.targetStatus || 'Rusak')}</b>\n` +
      `📝 <b>Catatan :</b> ${escapeHtml(finalKet)}\n` +
      `🕒 <b>Waktu   :</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA`
    );

    const tg = interactiveBot ? interactiveBot.telegram : ctx.telegram;

    try {
      await tg.sendPhoto(GROUP_ID_PHOTO_LOG, highestPhoto, {
        caption: photoCaption,
        parse_mode: 'HTML'
      });
      console.log('✅ [Alker Log] Foto berhasil dikirim ke grup', GROUP_ID_PHOTO_LOG);
    } catch (err) {
      console.warn('❌ [Alker Log] Gagal kirim foto ke group log:', err.message);
    }
  }

  // 2. Kirim Notifikasi Teks Alert ke Group SPV & Leader (-4945019710)
  const alertText = (
    `🚨 <b>ALERT ALKER BERMASALAH LAPANGAN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Teknisi :</b> ${escapeHtml(session.techName)} (${session.techNik})\n` +
    `🏢 <b>Sektor  :</b> ${escapeHtml(session.sektor)}\n` +
    `📦 <b>Alat    :</b> ${escapeHtml(alkerName)} (SN: ${escapeHtml(sn)})\n` +
    `📌 <b>Status  :</b> 🔴 <b>${escapeHtml(session.targetStatus || 'Rusak')}</b>\n` +
    `📝 <b>Alasan  :</b> ${escapeHtml(finalKet)}\n` +
    `🕒 <b>Waktu   :</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 <i>Mohon PIC Leader segera cek & tindak lanjuti alker teknisi bersangkutan.</i>`
  );

  const tg = interactiveBot ? interactiveBot.telegram : ctx.telegram;
  try {
    await tg.sendMessage(GROUP_ID_LEADER_ALERT, alertText, { parse_mode: 'HTML' });
    console.log('✅ [Alker Alert] Notifikasi berhasil dikirim ke grup leader', GROUP_ID_LEADER_ALERT);
  } catch (err) {
    console.warn('❌ [Alker Alert] Gagal kirim alert ke group leader:', err.message);
  }

  sessions.delete(sessionKey);
  await saveAlkerStatusUpdate(ctx, dataToSave);
  return true;
}

/**
 * Simpan Payload ke Google Apps Script Webhook
 */
async function saveAlkerStatusUpdate(ctx, { techName, techNik, sektor, alkerName, idAlker, status, keterangan }) {
  const loadingMsg = await ctx.reply('⏳ <i>Sedang menyimpan status ke database...</i>', { parse_mode: 'HTML' });
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA';

  try {
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_alker_bot',
          technicianName: techName,
          technicianNik: techNik,
          alkerName: alkerName,
          idAlker: idAlker,
          status: status,
          keterangan: keterangan,
          updatedBy: `${techName} (Telegram Bot)`
        })
      });
    }

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});

    let icon = '🟢';
    if (status.toLowerCase() === 'rusak') icon = '🔴';
    else if (status.toLowerCase() === 'tidak ada' || status.toLowerCase() === 'hilang') icon = '❌';

    let successMsg = `✅ <b>UPDATE STATUS ALKER BERHASIL!</b>\n`;
    successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    successMsg += `👤 <b>Teknisi :</b> ${escapeHtml(techName)} (${techNik || '-'})\n`;
    successMsg += `📦 <b>Alker   :</b> ${escapeHtml(alkerName)}\n`;
    successMsg += `📌 <b>Status  :</b> ${icon} <b>${escapeHtml(status)}</b>\n`;
    if (keterangan) {
      successMsg += `📝 <b>Catatan :</b> ${escapeHtml(keterangan)}\n`;
    }
    successMsg += `🕒 <b>Waktu   :</b> ${timestamp}\n`;
    successMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    successMsg += `💡 <i>Laporan telah diteruskan ke Grup SPV & Leader untuk tindak lanjut.</i>`;

    const buttons = [
      [Markup.button.callback('⬅️ Cek Alker Lainnya', `alker_refresh_${encodeURIComponent(techNik || techName)}`)]
    ];

    return ctx.reply(successMsg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (err) {
    console.error('❌ [Save Alker Error]:', err.message);
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    return ctx.reply(`⚠️ Gagal menyimpan update: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

/**
 * Handler Perintah /rekapalker [sektor] & Callback Rekap Seluruh Alker
 */
async function handleRekapAlkerCommand(ctx, arg = '') {
  const loadingMsg = await ctx.reply('⏳ <i>Sedang mengambil data rekapitulasi alker dari database...</i>', { parse_mode: 'HTML' });
  const timeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA';

  try {
    const rawTarget = (arg || '').toUpperCase().trim();
    let sektorFilter = '';
    if (['BATULICIN', 'BLC'].includes(rawTarget)) sektorFilter = 'BATULICIN';
    else if (['SATUI', 'STI'].includes(rawTarget)) sektorFilter = 'SATUI';
    else if (['KOTABARU', 'KTB'].includes(rawTarget)) sektorFilter = 'KOTABARU';

    const getSectorGroup = (psa) => {
      const p = (psa || '').toUpperCase().trim();
      if (['SATUI', 'KINTAP', 'ALKAUTSAR', 'AL-KAUTSAR', 'PAGATAN', 'ANGSANA', 'SEBAMBAN', 'STI', 'KIP', 'PGT'].some(s => p.includes(s))) return 'SATUI';
      if (['KOTABARU', 'KTB', 'LONTAR', 'LTR', 'STAGEN', 'KPL'].some(s => p.includes(s))) return 'KOTABARU';
      return 'BATULICIN';
    };

    const [nakerRows, alkerRows] = await Promise.all([
      getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true),
      getSheetRows(SPREADSHEET_ID, SHEET_ALKER, true)
    ]);

    // Map Techs with Sector
    const techMap = new Map();
    nakerRows.forEach(n => {
      const name = String(n['NAMA'] || n['Nama'] || '').trim().toUpperCase();
      if (name) {
        techMap.set(name, {
          name,
          nik: String(n['NIK'] || '').trim(),
          sektor: getSectorGroup(String(n['PSA'] || n['Sektor'] || '')),
          wilsus: String(n['PSA'] || n['Sektor'] || 'BATULICIN').trim(),
          leader: String(n['PIC LEADER'] || n['Leader'] || '-').trim()
        });
      }
    });

    let normalCount = 0;
    let rusakCount = 0;
    let missingCount = 0;
    const troubleList = [];

    alkerRows.forEach(row => {
      const nameAlker = String(row['Nama Alker'] || row['NAMA ALKER'] || '').trim().toUpperCase();
      if (nameAlker === 'BAJU') return;

      const techName = String(row['Teknisi'] || row['TEKNISI'] || '').trim().toUpperCase();
      const techInfo = techMap.get(techName) || { sektor: 'BATULICIN', wilsus: 'BATULICIN', leader: '-' };

      if (sektorFilter && techInfo.sektor !== sektorFilter) {
        return;
      }

      const st = String(row['Status'] || row['STATUS'] || 'Normal').trim().toLowerCase();
      const sn = String(row['SN / ID Alker'] || row['ID Alker'] || '-').trim();
      const ket = String(row['Keterangan'] || row['KETERANGAN'] || '-').trim();

      if (st.includes('rusak')) {
        rusakCount++;
        troubleList.push({
          techName,
          sektor: techInfo.sektor,
          wilsus: techInfo.wilsus,
          alker: row['Nama Alker'] || row['NAMA ALKER'],
          sn,
          status: '🔴 Rusak',
          keterangan: ket
        });
      } else if (st.includes('tidak') || st.includes('hilang')) {
        missingCount++;
        troubleList.push({
          techName,
          sektor: techInfo.sektor,
          wilsus: techInfo.wilsus,
          alker: row['Nama Alker'] || row['NAMA ALKER'],
          sn,
          status: '❌ Hilang',
          keterangan: ket
        });
      } else {
        normalCount++;
      }
    });

    const totalAlker = normalCount + rusakCount + missingCount;
    const titleSektor = sektorFilter ? `SEKTOR ${sektorFilter}` : 'SELURUH WILAYAH';

    let card = `📊 <b>REKAPITULASI KONDISI ALKER TEKNISI</b>\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    card += `🏢 <b>Wilayah :</b> ${titleSektor}\n`;
    card += `🕒 <b>Update  :</b> ${timeStr}\n\n`;
    card += `📈 <b>Ringkasan Kondisi Alat:</b>\n`;
    card += `  🟢 Normal / Berfungsi : <b>${normalCount}</b> item\n`;
    card += `  🔴 Rusak              : <b>${rusakCount}</b> item\n`;
    card += `  ❌ Tidak Ada / Hilang : <b>${missingCount}</b> item\n`;
    card += `  📦 Total Terinventaris: <b>${totalAlker}</b> item\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (troubleList.length > 0) {
      card += `\n⚠️ <b>Daftar Alat Bermasalah (${troubleList.length} Item):</b>\n`;
      troubleList.slice(0, 15).forEach((t, idx) => {
        card += `${idx + 1}. ${t.status} <b>${escapeHtml(t.alker)}</b>\n`;
        card += `   👷 <code>${escapeHtml(t.techName)}</code> [${t.wilsus}]\n`;
        if (t.sn && t.sn !== '-') card += `   🔢 SN: <code>${escapeHtml(t.sn)}</code>\n`;
        if (t.keterangan && t.keterangan !== '-') card += `   📝 Ket: <i>${escapeHtml(t.keterangan)}</i>\n`;
      });

      if (troubleList.length > 15) {
        card += `\n<i>...dan ${troubleList.length - 15} item lainnya dapat dipantau di Web Dashboard.</i>\n`;
      }
    } else {
      card += `\n✨ <i>Semua alat kerja terdata dalam kondisi Normal & Berfungsi Baik.</i>\n`;
    }

    const buttons = [
      [
        Markup.button.url('📊 Buka Dashboard Monitoring SPV', 'https://alker.103.93.129.213.sslip.io/dashboard'),
        Markup.button.url('📱 Buka Form Checklist HP', 'https://alker.103.93.129.213.sslip.io/form')
      ],
      [
        Markup.button.callback('🏢 Rekap Batulicin', 'rekap_alker_batulicin'),
        Markup.button.callback('🏢 Rekap Satui', 'rekap_alker_satui')
      ],
      [
        Markup.button.callback('🏢 Rekap Kotabaru', 'rekap_alker_kotabaru'),
        Markup.button.callback('🌐 Rekap Semua', 'rekap_alker_all')
      ]
    ];

    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    return ctx.reply(card, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });

  } catch (err) {
    console.error('❌ [Rekap Alker Error]:', err);
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
    return ctx.reply(`⚠️ Gagal memuat rekap alker: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

module.exports = {
  handleAlkerCommand,
  handleAlkerCallback,
  handleAlkerMessage,
  handleRekapAlkerCommand,
  resolveTechnician
};
