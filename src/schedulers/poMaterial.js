const { getSheetRows } = require('../config/google');
const { poBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_PO_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'PO MATERIAL';
const TARGET_CHAT_ID = process.env.CHAT_ID_PO || '-1002616721208';

async function runPoMaterial() {
  console.log('[Scheduler] PO Material is disabled temporarily.');
  return;
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows.length) return;

    let output = '📦 *MONITORING PO MATERIAL KALIMANTAN*\n━━━━━━━━━━━━━━━━━━━━\n';
    rows.forEach(r => {
      const po = r.PO || r.po || '-';
      const item = r.ITEM || r.material || '-';
      const qty = r.QTY || r.qty || '-';
      const status = r.STATUS || r.status || '-';
      output += `• ${po} | ${item} (${qty}) - ${status}\n`;
    });

    await sendOrReplaceBroadcast(poBot, TARGET_CHAT_ID, 'PO_MATERIAL', output.trim());
  } catch (err) {
    console.error('[Scheduler Error] PO Material:', err.message);
  }
}

module.exports = runPoMaterial;
