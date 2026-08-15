const { getSheetRows } = require('../config/google');
const { broadcastBot, sendMessage } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'FFG';
const TARGET_CHAT_ID = process.env.CHAT_ID_FFG || '-1002616721208';

async function runFfg() {
  console.log('[Scheduler] Running FFG...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows.length) return;

    const groups = {};

    rows.forEach(d => {
      const tim = String(d['TIM'] || d['Tim'] || '').trim();
      if (!tim || tim === '-' || tim === 'undefined') return;

      const serviceNo = d['Service No.'] || d['service_no'] || '-';
      const odc = d['ODC'] || d['odc'] || '-';

      if (!groups[tim]) groups[tim] = [];
      groups[tim].push(`${serviceNo} | ${odc}`);
    });

    if (Object.keys(groups).length === 0) return;

    const laporan = Object.entries(groups)
      .map(([tim, list]) => `TIM ${tim}\n${list.join('\n')}`)
      .join('\n\n');

    const message = `🚨 GARANSI TERDETEKSI LOS BELUM ADA TIKET GANGGUAN\n\n${laporan}`;
    await sendMessage(broadcastBot, TARGET_CHAT_ID, message.trim());
  } catch (err) {
    console.error('[Scheduler Error] FFG:', err.message);
  }
}

module.exports = runFfg;
