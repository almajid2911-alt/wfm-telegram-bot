const { getSheetRows } = require('../config/google');
const { poBot, sendMessage } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_PO_ID || '1pmg3o3BpZW8XopFP8gItF1FREbJhguPwZ_j3FTbfrAk';
const SHEET_NAME = 'DATA PO MATERIAL';
const TARGET_CHATS = (process.env.CHAT_IDS_PO || '-5063373762,-5042202646').split(',');

async function runPoMaterial() {
  console.log('[Scheduler] Running PO Material (External)...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows.length) return;

    let text = '📦 *MONITORING PO MATERIAL KALIMANTAN*\n━━━━━━━━━━━━━━\n';
    rows.forEach((r, idx) => {
      const poNum = r['NO PO'] || r.PO || r.po_number || `PO-#${idx+1}`;
      const item = r['MATERIAL'] || r.ITEM || '-';
      const status = r['STATUS'] || r.status || '-';
      text += `• ${poNum} | ${item} | ${status}\n`;
    });

    for (const chatId of TARGET_CHATS) {
      if (chatId.trim()) {
        await sendMessage(poBot, chatId.trim(), text.trim());
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] PO Material:', err.message);
  }
}

module.exports = runPoMaterial;
