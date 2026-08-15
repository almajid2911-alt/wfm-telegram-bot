const { getSheetRows } = require('../config/google');
const { broadcastBot, sendMessage } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'UNDISPATCH XPRO';
const TARGET_CHATS = (process.env.CHAT_IDS_UNDISPATCH_XPRO || '-4666581891,-1002616721208').split(',');

function clean(val) {
  if (!val) return '';
  return String(val).replace(/"/g, '').trim();
}

async function runUndispatchXpro() {
  console.log('[Scheduler] Running Undispatch XPRO...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows.length) return;

    const filtered = rows.filter(r => {
      const status = clean(r.STATUS_RESUME || r.status_resume);
      const tim = clean(r.TIM || r.tim);
      return status === 'MIA - SEND SURVEY' && tim === '';
    });

    if (!filtered.length) return;

    const grouped = {};
    filtered.forEach(r => {
      const wilsus = clean(r.WILSUS || r.wilsus) || 'UNKNOWN';
      if (!grouped[wilsus]) grouped[wilsus] = [];
      grouped[wilsus].push(r);
    });

    let message = '⏰UNDISPATCH INDIBIZ \n\n';
    Object.keys(grouped).sort().forEach(wilsus => {
      message += `${wilsus}\n`;
      grouped[wilsus].forEach(r => {
        const orderId = r.ORDER_ID || r.order_id || r.track_order || '-';
        const odp = r.ODP || r.odp || '-';
        message += `${orderId} ${odp}\n`;
      });
      message += '\n';
    });

    const finalMsg = message.trim();
    for (const chatId of TARGET_CHATS) {
      if (chatId.trim()) {
        await sendMessage(broadcastBot, chatId.trim(), finalMsg);
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] Undispatch Xpro:', err.message);
  }
}

module.exports = runUndispatchXpro;
