const { getSheetRows } = require('../config/google');
const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'KAWAL KETAT';
const TARGET_CHAT_ID = process.env.CHAT_ID_TIKET_PENTING || '-4945019710';

async function runTiketPenting() {
  console.log('[Scheduler] Running Tiket Penting...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows.length) return;

    let garansi = [];
    let platinum = [];
    let diamond = [];

    for (const row of rows) {
      const incident = row['INCIDENT'] || '-';
      const customerType = String(row['CUSTOMER TYPE'] || '').trim().toUpperCase();
      const guaranteeStatus = String(row['STATUS GARANSI'] || '').trim().toUpperCase();
      const timInsera = row['TIM INSERA'] || '-';

      const summaryRaw = String(row['SUMMARY'] || '').trim().toUpperCase();
      let tag = '';
      if (summaryRaw.includes('UNSPEC')) tag = ' | UNSPEC';
      else if (summaryRaw.includes('SQM')) tag = ' | SQM';

      let odcFormatted = '-';
      const odcRaw = row['ODC REAL'] || '';
      if (typeof odcRaw === 'string' && odcRaw.includes('-')) {
        const parts = odcRaw.split('-');
        if (parts.length >= 3) {
          odcFormatted = `${parts[1]}-${parts[2]}`;
        }
      }

      let ttrValue = parseFloat(row['TTR']);
      if (isNaN(ttrValue)) continue;
      if (ttrValue < 0) ttrValue = 0;

      const duration = ttrValue.toFixed(2).replace('.', ',');
      const line = `TIM ${timInsera}\n${incident}|${odcFormatted}|${duration}${tag}`;

      if (guaranteeStatus === 'GARANSI') {
        const emoji = ttrValue > 3 ? '🔴' : '🟢';
        garansi.push(`${line} ${emoji}`);
      } else if (customerType.includes('PLATINUM')) {
        const emoji = ttrValue > 6 ? '🔴' : '🟢';
        platinum.push(`${line} ${emoji}`);
      } else if (customerType.includes('DIAMOND')) {
        const emoji = ttrValue > 3 ? '🔴' : '🟢';
        diamond.push(`${line} ${emoji}`);
      }
    }

    if (!garansi.length && !platinum.length && !diamond.length) return;

    const sections = [];
    if (garansi.length) {
      sections.push(`🚨 TIKET GARANSI (3 JAM)\n━━━━━━━━━━━━━━\n${garansi.join('\n')}`);
    }
    if (platinum.length) {
      sections.push(`💎 TIKET HVC PLATINUM (6 JAM)\n━━━━━━━━━━━━━━\n${platinum.join('\n')}`);
    }
    if (diamond.length) {
      sections.push(`👑 TIKET HVC DIAMOND (3 JAM)\n━━━━━━━━━━━━━━\n${diamond.join('\n')}`);
    }

    const messageContent = sections.join('\n\n');
    const fullMessage = `Moban di bantu kawal sampai close sesuai Target TTR nya \n\n@AdtyaR @was1tuha @Samyusuf01\n\n${messageContent}`;

    await sendOrReplaceBroadcast(broadcastBot, TARGET_CHAT_ID, 'TIKET_PENTING', fullMessage);
  } catch (err) {
    console.error('[Scheduler Error] Tiket Penting:', err.message);
  }
}

module.exports = runTiketPenting;
