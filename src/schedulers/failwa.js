const { getSheetRows } = require('../config/google');
const { broadcastBot, sendMessage } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'FAILWA';
const TARGET_CHAT_ID = process.env.CHAT_ID_FAILWA || '-1002616721208';

async function runRemindFailwa() {
  console.log('[Scheduler] Running Remind Failwa...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    const norm = v => String(v ?? '').trim();
    const upper = v => norm(v).toUpperCase();

    const filtered = rows.filter(r => {
      const statusOk = upper(r.Status) === 'STARTWORK';
      const isIssue = upper(r.GRUP).includes('ISSUE');
      return statusOk && isIssue;
    });

    if (!filtered.length) return;

    filtered.sort((a, b) => norm(a.TIM).localeCompare(norm(b.TIM)));

    let text = '📊 KENDALA BELUM FAILWA\n━━━━━━━━━━━━━━\n📌 Total Order : ' + filtered.length + '\n━━━━━━━━━━━━━━\n';
    filtered.forEach(r => {
      text += `• ${norm(r.Workorder)} | ${norm(r.TIM) || '-'} | ${norm(r.MORNING) || '-'}\n`;
    });

    await sendMessage(broadcastBot, TARGET_CHAT_ID, text.trim());
  } catch (err) {
    console.error('[Scheduler Error] Remind Failwa:', err.message);
  }
}

module.exports = runRemindFailwa;
