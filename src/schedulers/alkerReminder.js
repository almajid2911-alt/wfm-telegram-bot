const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');
const { interactiveBot } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_ALKER_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_NAKER = 'NAKER';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Eksekusi broadcast reminder ke seluruh teknisi yang memiliki ID Telegram
 */
async function runWeeklyAlkerReminder(botInstance = interactiveBot) {
  console.log('⏰ [Scheduler] Memulai Weekly Alker Reminder ke seluruh teknisi...');
  if (!botInstance) {
    console.warn('[Scheduler] Interactive Bot instance tidak tersedia untuk broadcast.');
    return { success: false, total: 0, sent: 0, failed: 0 };
  }

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true);
    if (!rows || rows.length === 0) {
      console.warn('[Scheduler] Data NAKER kosong.');
      return { success: false, total: 0, sent: 0, failed: 0 };
    }

    const validTechs = rows.filter(r => {
      const tgId = String(r['ID TELEGRAM'] || r['id telegram'] || '').trim();
      const nama = String(r['NAMA'] || r['Nama'] || '').trim();
      return tgId && !nama.toLowerCase().includes('dummy') && /^\d+$/.test(tgId);
    });

    console.log(`[Scheduler] Ditemukan ${validTechs.length} teknisi dengan Telegram ID aktif.`);

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
        `👉 <i>Ketik /alker atau gunakan tombol di bawah untuk membuka daftar alker Anda:</i>\n\n` +
        `Terima kasih atas kerja samanya! 🙏`
      );

      const buttons = [
        [Markup.button.callback('🛠️ Cek & Update Alker Saya', `alker_refresh_${encodeURIComponent(nik)}`)]
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

      // Delay 60ms agar aman dari Telegram API rate limit
      await sleep(60);
    }

    console.log(`✅ [Scheduler] Weekly Alker Reminder selesai. Berhasil: ${sent}, Gagal/Blokir: ${failed}`);
    return { success: true, total: validTechs.length, sent, failed };

  } catch (err) {
    console.error('❌ [Scheduler Error] Weekly Alker Reminder:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Command trigger manual untuk SPV / Admin: /broadcastalker atau /remindalker
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
  handleBroadcastAlkerCommand
};
