const { getSheetRows } = require('../config/google');
const { broadcastBot, sendMessage } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'PANTAU TTR';
// Target grup Undispatch Insera (mendukung multiple grup)
const TARGET_CHATS = (process.env.CHAT_IDS_UNDISPATCH_INSERA || process.env.CHAT_ID_UNDISPATCH_INSERA || '-1003190090092,-1004473705354').split(',');

async function runUndispatchInsera() {
  console.log('[Scheduler] Running Undispatch Insera...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows.length) return;

    const norm = v => String(v ?? '').trim();
    const upper = v => norm(v).toUpperCase();

    const formatTTR = v => {
      const num = parseFloat(v);
      if (isNaN(num)) return { text: '0,0', value: 0 };
      return { text: num.toFixed(1).replace('.', ','), value: num };
    };

    const simplifyODC = val => {
      return norm(val).replace(/^(ODC-|ODP-)/i, '').split(' ')[0];
    };

    const sektorMap = {
      'STI': 'SEKTOR SATUI',
      'BLC': 'SEKTOR BATULICIN',
      'SER': 'SEKTOR BATULICIN',
      'KPL': 'SEKTOR KOTABARU',
      'PGT': 'SEKTOR SATUI',
      'KIP': 'SEKTOR SATUI'
    };

    const filtered = rows.filter(r => {
      const tim = norm(r.TIM);
      const incident = norm(r.INCIDENT);
      const odcReal = norm(r['ODC REAL']);
      return !tim && incident && incident !== '-' && odcReal && odcReal !== '-';
    });

    const grouped = {};
    filtered.forEach(r => {
      const summary = upper(r.SUMMARY);
      const segment = upper(r['CUSTOMER SEGMENT']);
      let sektor;
      if (segment === 'RBS') {
        sektor = 'SEKTOR B2B';
      } else {
        const workzone = norm(r.WORKZONE);
        sektor = sektorMap[workzone] || `SEKTOR ${workzone}`;
      }

      if (!grouped[sektor]) {
        grouped[sektor] = { normal: [], gamas: [] };
      }

      const ttr = formatTTR(r.TTR);
      const odc = simplifyODC(r['ODC REAL']);
      const fire = ttr.value > 12 ? '🔥 ' : '';

      const item = {
        odc,
        line: `${fire}${norm(r.INCIDENT)} | ${odc} | ${ttr.text}`
      };

      if (summary.includes('GAMAS')) {
        grouped[sektor].gamas.push(item);
      } else {
        grouped[sektor].normal.push(item);
      }
    });

    if (!Object.keys(grouped).length) return;

    let output = '📌 TIKET UNDISPATCH\n\n';
    Object.keys(grouped).sort().forEach(sektor => {
      output += `📍 ${sektor}\n`;
      grouped[sektor].normal.sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => output += i.line + '\n');
      if (grouped[sektor].gamas.length) {
        output += '\n🚨 GAMAS\n';
        grouped[sektor].gamas.sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => output += i.line + '\n');
      }
      output += '\n';
    });

    const finalMsg = output.trim();

    for (const chatId of TARGET_CHATS) {
      const cleanId = chatId.trim();
      if (cleanId && cleanId.startsWith('-')) {
        await sendMessage(broadcastBot, cleanId, finalMsg, { parse_mode: undefined });
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] Undispatch Insera:', err.message);
  }
}

module.exports = runUndispatchInsera;
