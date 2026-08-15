const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'LENSA';

function getTimeWITA() {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Makassar'
  }).replace('.', ':') + ' WITA';
}

async function handleQcCommand(ctx) {
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    const groupTim = {};
    let totalQC = 0;

    for (const data of rows) {
      const tim = String(data['TIM'] || data['Tim'] || 'TANPA TIM').trim().toUpperCase();
      const noWo = String(data['no_wo'] || data['Workorder'] || data['WO'] || '-').trim();
      const nikTeknisi = String(data['nik_teknisi'] || data['NIK'] || '-').trim();
      let ketReject = String(data['keterangan_reject'] || data['Keterangan Reject'] || '-').trim();

      if (!data['TIM'] && !data['no_wo']) continue;

      if (ketReject === '-' || !ketReject) {
        ketReject = 'Tanpa keterangan reject';
      }

      if (!groupTim[tim]) {
        groupTim[tim] = [];
      }

      groupTim[tim].push({ noWo, nikTeknisi, ketReject });
      totalQC++;
    }

    if (totalQC === 0) {
      return ctx.reply('⚠️ *Tidak ada data QC NOK yang ditemukan.*', { parse_mode: 'Markdown' });
    }

    let msg = '=================================\n';
    msg += '🚫 *REKAPITULASI QC REJECT (NOK)*\n';
    msg += `🕒 _Update: ${getTimeWITA()}_\n`;
    msg += '=================================\n\n';

    for (const [timName, listData] of Object.entries(groupTim)) {
      msg += `👥 *TIM: ${timName}* (${listData.length} WO)\n`;
      msg += '─────────────────────────\n';

      for (let i = 0; i < listData.length; i++) {
        const item = listData[i];
        const isLast = (i === listData.length - 1);

        msg += `📦 *${item.noWo}* [👤 \`${item.nikTeknisi}\`]\n`;
        msg += `└ ⚠️ _${item.ketReject}_\n`;

        if (!isLast) {
          msg += '\n';
        }
      }

      msg += '\n';
    }

    msg += '─────────────────────────\n';
    msg += `📌 *Total WO Reject:* *${totalQC} WO*`;

    await ctx.reply(msg.trimEnd(), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Command Error] /qc:', err.message);
    ctx.reply('❌ Error: ' + err.message);
  }
}

module.exports = handleQcCommand;
