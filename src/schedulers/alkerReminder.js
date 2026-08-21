const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');
const { interactiveBot } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_ALKER_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_NAKER = 'NAKER';
const SHEET_ALKER = 'DataAlker';

const GROUP_ID_LEADER_ALERT = '-4945019710';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Broadcast reminder mingguan ke seluruh teknisi
 */
async function runWeeklyAlkerReminder(botInstance = interactiveBot) {
  console.log('⏰ [Scheduler] Memulai Weekly Alker Reminder ke seluruh teknisi...');
  if (!botInstance) return { success: false, total: 0, sent: 0, failed: 0 };

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true);
    if (!rows || rows.length === 0) return { success: false, total: 0, sent: 0, failed: 0 };

    const validTechs = rows.filter(r => {
      const tgId = String(r['ID TELEGRAM'] || r['id telegram'] || '').trim();
      const nama = String(r['NAMA'] || r['Nama'] || '').trim();
      return tgId && !nama.toLowerCase().includes('dummy') && /^\d+$/.test(tgId);
    });

    let sent = 0;
    let failed = 0;

    for (const tech of validTechs) {
      const tgId = String(tech['ID TELEGRAM'] || '').trim();
      const nama = String(tech['NAMA'] || 'Rekan').trim();
      const nik = String(tech['NIK'] || '-').trim();
      const sektor = String(tech['PSA'] || 'BATULICIN').trim();

      const messageText = (
        `🔔 <b>REMINDER MINGGUAN: UPDATE KONDISI ALKER</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Halo rekan <b>${escapeHtml(nama)}</b> (NIK: <code>${escapeHtml(nik)}</code>)\n` +
        `Sektor: <b>${escapeHtml(sektor)}</b>\n\n` +
        `Mohon luangkan waktu sejenak untuk mengecek & memperbarui status <b>18 Alat Kerja (Alker)</b> Anda minggu ini.\n\n` +
        `👉 <i>Jika semua alat aman, cukup klik tombol konfirmasi di bawah:</i>\n\n` +
        `Terima kasih atas kerja samanya! 🙏`
      );

      const buttons = [
        [Markup.button.callback('✅ Semua Alat Aman (Konfirmasi)', 'alker_mass_confirm')],
        [Markup.button.callback('🛠️ Cek & Update Per Alat', `alker_refresh_${encodeURIComponent(nik)}`)]
      ];

      try {
        await botInstance.telegram.sendMessage(tgId, messageText, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(buttons)
        });
        sent++;
      } catch (err) {
        failed++;
        console.warn(`[Scheduler] Gagal kirim reminder ke ${nama} (${tgId}):`, err.message);
      }

      await sleep(60);
    }

    console.log(`✅ [Scheduler] Weekly Alker Reminder selesai. Berhasil: ${sent}, Gagal: ${failed}`);
    return { success: true, total: validTechs.length, sent, failed };

  } catch (err) {
    console.error('❌ [Scheduler Error] Weekly Alker Reminder:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Cek teknisi yang belum update alker > 14 hari dan kirim laporan ke Grup Leader
 */
async function reportOverdueComplianceToLeaders(botInstance = interactiveBot) {
  console.log('🔍 [Scheduler] Memeriksa kepatuhan update alker (> 14 hari)...');
  if (!botInstance) return;

  try {
    const [alkerRows, nakerRows] = await Promise.all([
      getSheetRows(SPREADSHEET_ID, SHEET_ALKER, true),
      getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true)
    ]);

    const now = Date.now();
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

    // Peta last update per teknisi
    const lastUpdateMap = {};
    alkerRows.forEach(r => {
      const tech = String(r['Teknisi'] || r['TEKNISI'] || '').trim().toUpperCase();
      const rawDate = String(r['Last Update'] || '').trim();
      if (!tech) return;

      let timeVal = 0;
      if (rawDate) {
        const parsed = Date.parse(rawDate);
        if (!isNaN(parsed)) timeVal = parsed;
      }

      if (!lastUpdateMap[tech] || timeVal > lastUpdateMap[tech]) {
        lastUpdateMap[tech] = timeVal;
      }
    });

    const overdueList = [];
    nakerRows.forEach(n => {
      const nama = String(n['NAMA'] || n['Nama'] || '').trim();
      const nik = String(n['NIK'] || '-').trim();
      const sektor = String(n['PSA'] || 'BATULICIN').trim();
      const leader = String(n['PIC LEADER'] || '-').trim();

      if (!nama || nama.toLowerCase().includes('dummy')) return;

      const lastTime = lastUpdateMap[nama.toUpperCase()] || 0;
      const isOverdue = (now - lastTime) > FOURTEEN_DAYS_MS;

      if (isOverdue) {
        const daysAgo = lastTime > 0 ? Math.floor((now - lastTime) / (24 * 60 * 60 * 1000)) : '> 30';
        overdueList.push({
          nama,
          nik,
          sektor,
          leader,
          daysAgo
        });
      }
    });

    if (overdueList.length === 0) {
      console.log('✅ [Compliance] Seluruh teknisi sudah update dalam 14 hari terakhir.');
      return;
    }

    // Kelompokkan per sektor
    const bySector = {};
    overdueList.forEach(o => {
      if (!bySector[o.sektor]) bySector[o.sektor] = [];
      bySector[o.sektor].push(o);
    });

    let reportMsg = `⚠️ <b>LAPORAN KEPATUHAN ALKER (> 14 HARI BELUM UPDATE)</b>\n`;
    reportMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportMsg += `Ditemukan <b>${overdueList.length} teknisi</b> yang belum memperbarui kondisi alat kerja selama lebih dari 2 minggu:\n\n`;

    for (const [sek, list] of Object.entries(bySector)) {
      reportMsg += `🏢 <b>SEKTOR ${escapeHtml(sek)} (${list.length} Orang):</b>\n`;
      list.forEach(t => {
        reportMsg += `• ${escapeHtml(t.nama)} (<code>${t.nik}</code>) - <i>${t.daysAgo} hari lalu</i>\n`;
      });
      reportMsg += `\n`;
    }

    reportMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    reportMsg += `💡 <i>Mohon PIC Leader mengingatkan rekan teknisi untuk ketik /alker di bot.</i>`;

    await botInstance.telegram.sendMessage(GROUP_ID_LEADER_ALERT, reportMsg, { parse_mode: 'HTML' });
    console.log(`📢 [Compliance] Laporan ${overdueList.length} teknisi overdue berhasil dikirim ke Grup Leader.`);

  } catch (err) {
    console.error('❌ [Compliance Error]:', err.message);
  }
}

/**
 * Command trigger manual untuk SPV / Admin: /broadcastalker
 */
async function handleBroadcastAlkerCommand(ctx) {
  const loading = await ctx.reply('📢 <i>Sedang mengirim reminder alker ke seluruh ID Telegram teknisi...</i>', { parse_mode: 'HTML' });

  const result = await runWeeklyAlkerReminder(ctx.telegram);
  await ctx.deleteMessage(loading.message_id).catch(() => {});

  if (result.success) {
    return ctx.reply(
      `✅ <b>BROADCAST REMINDER ALKER SELESAI!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 Total Teknisi Terdaftar: <b>${result.total}</b> orang\n` +
      `📨 Berhasil Terkirim      : <b>${result.sent}</b> pesan\n` +
      `⚠️ Gagal / Belum Chat Bot : <b>${result.failed}</b> orang\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 <i>Reminder otomatis berikutnya akan berjalan setiap hari Senin jam 08:00 WITA.</i>`,
      { parse_mode: 'HTML' }
    );
  } else {
    return ctx.reply(`⚠️ Gagal melakukan broadcast: ${escapeHtml(result.error || 'Terjadi kesalahan')}`, { parse_mode: 'HTML' });
  }
}

module.exports = {
  runWeeklyAlkerReminder,
  reportOverdueComplianceToLeaders,
  handleBroadcastAlkerCommand
};
