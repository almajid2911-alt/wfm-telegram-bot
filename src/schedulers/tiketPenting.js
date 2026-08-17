const { getSheetRows } = require('../config/google');
const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'KAWAL KETAT';
const TARGET_CHAT_ID = process.env.CHAT_ID_TIKET_PENTING || '-4945019710';

function simplifyODC(raw) {
  if (!raw) return '-';
  const s = String(raw).replace(/^(ODC-|ODP-)/i, '').split('/')[0].split(' ')[0].trim();
  return s || '-';
}

async function runTiketPenting() {
  console.log('[Scheduler] Running Tiket Penting...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME, true);
    if (!rows.length) return;

    let garansi = [];
    let platinum = [];
    let diamond = [];

    for (const row of rows) {
      const incident = (row['INCIDENT'] || row['incident'] || '-').trim();
      const customerType = String(row['CUSTOMER TYPE'] || row['customer_type'] || '').trim().toUpperCase();
      const guaranteeStatus = String(row['STATUS GARANSI'] || row['status_garansi'] || row['GUARANTE STATUS'] || '').trim().toUpperCase();
      const timInsera = (row['TIM INSERA'] || row['tim_insera'] || row['TIM'] || row['tim'] || '-').trim();
      const summaryRaw = String(row['SUMMARY'] || row['summary'] || '').trim().toUpperCase();

      // Exclude SQM and UNSPEC only (GAMAS tetap masuk jika Platinum, Diamond, atau Garansi)
      if (
        summaryRaw.includes('SQM') ||
        summaryRaw.includes('UNSPEC') ||
        summaryRaw.includes('UNSPEK') ||
        customerType.includes('SQM') ||
        customerType.includes('UNSPEC') ||
        customerType.includes('UNSPEK')
      ) {
        continue;
      }

      const odcFormatted = simplifyODC(row['ODC REAL'] || row['odc_real'] || row['DEVICE NAME'] || row['device_name']);

      let ttrValue = parseFloat(String(row['TTR'] || row['ttr'] || '').replace(',', '.'));
      if (isNaN(ttrValue)) continue;
      if (ttrValue < 0) ttrValue = 0;

      const duration = ttrValue.toFixed(2).replace('.', ',');
      const line = `TIM ${timInsera}\n${incident} | ${odcFormatted} | ${duration}`;

      if (guaranteeStatus === 'GARANSI' || guaranteeStatus === 'YES' || guaranteeStatus === 'TRUE') {
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

    if (!garansi.length && !platinum.length && !diamond.length) {
      console.log('[Tiket Penting] No non-SQM/non-UNSPEC HVC/Garansi tickets found.');
      return;
    }

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
