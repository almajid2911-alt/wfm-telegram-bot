const { getSheetRows } = require('../config/google');
const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'PANTAU TTR';
const TARGET_CHATS = (process.env.CHAT_IDS_UNDISPATCH_INSERA || process.env.CHAT_ID_UNDISPATCH_INSERA || '-4945019710,-1004473705354,-1003190090092').split(',');

function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  function parseLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    rows.push(obj);
  }
  return rows;
}

async function fetchPantauRows() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=422466574`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      return parseCSV(await res.text());
    }
  } catch (e) {
    console.warn('[Undispatch] Direct CSV export failed, falling back to Google API:', e.message);
  }
  return await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
}

const norm = v => String(v ?? '').trim();
const upper = v => norm(v).toUpperCase();

function classifyTicket(r) {
  const summary = upper(r.SUMMARY || r.summary);
  const custType = upper(r['CUSTOMER TYPE'] || r.customer_type);
  const custSeg = upper(r['CUSTOMER SEGMENT'] || r.customer_segment);
  const statusGaransi = upper(r['STATUS GARANSI'] || r.status_garansi);
  const guarStatus = upper(r['GUARANTE STATUS'] || r.guarante_status);

  if (summary.includes('GAMAS')) return 'GAMAS';
  if (custSeg === 'RBS' || summary.includes('RBS') || custType.includes('RBS')) return 'RBS';
  if (summary.includes('SQM') || custType.includes('SQM')) return 'SQM';
  if (summary.includes('UNSPEC') || summary.includes('UNSPEK') || custType.includes('UNSPEC')) return 'UNSPEC';
  if (statusGaransi.includes('GARANSI') || (guarStatus.includes('GARANSI') && !guarStatus.includes('NOT') && !guarStatus.includes('NON'))) {
    return 'GARANSI';
  }
  if (custType.includes('GOLD')) return 'HVC GOLD';
  if (custType.includes('PLATINUM')) return 'HVC PLATINUM';
  if (custType.includes('DIAMOND')) return 'HVC DIAMOND';
  return 'REGULER';
}

const formatTTR = v => {
  const cleanVal = String(v).replace(',', '.');
  const num = parseFloat(cleanVal);
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

const categoryEmoji = {
  'GAMAS': '🚨 GAMAS',
  'SQM': '⚡ SQM',
  'UNSPEC': '❓ UNSPEC',
  'HVC GOLD': '🥇 HVC GOLD',
  'HVC PLATINUM': '💎 HVC PLATINUM',
  'HVC DIAMOND': '💠 HVC DIAMOND',
  'GARANSI': '🛡️ GARANSI',
  'RBS': '🏢 RBS',
  'REGULER': '👤 REGULER'
};

const categoryOrder = ['GAMAS', 'SQM', 'UNSPEC', 'HVC DIAMOND', 'HVC PLATINUM', 'HVC GOLD', 'GARANSI', 'RBS', 'REGULER'];

async function runUndispatchInsera() {
  console.log('[Scheduler] Running Undispatch Insera...');
  try {
    const rows = await fetchPantauRows();
    if (!rows || !rows.length) return;

    const filtered = rows.filter(r => {
      const tim = norm(r.TIM || r.tim);
      const incident = norm(r.INCIDENT || r.incident);
      return (!tim || tim === '-' || tim.toUpperCase() === 'EMPTY') && incident && incident.startsWith('INC');
    });

    if (!filtered.length) {
      console.log('[Undispatch] No undispatch tickets found.');
      return;
    }

    const grouped = {};
    filtered.forEach(r => {
      const segment = upper(r['CUSTOMER SEGMENT'] || r.customer_segment);
      let sektor;
      if (segment === 'RBS') {
        sektor = 'SEKTOR B2B';
      } else {
        const workzone = norm(r.WORKZONE || r.workzone);
        sektor = sektorMap[workzone] || `SEKTOR ${workzone || 'LAINNYA'}`;
      }

      const cat = classifyTicket(r);

      if (!grouped[sektor]) {
        grouped[sektor] = {};
      }
      if (!grouped[sektor][cat]) {
        grouped[sektor][cat] = [];
      }

      const ttr = formatTTR(r.TTR || r.ttr);
      const rawOdc = norm(r['ODC REAL'] || r['DEVICE NAME'] || r.odc_real || '');
      const odc = simplifyODC(rawOdc);
      const fire = ttr.value > 12 ? '🔥 ' : '';

      grouped[sektor][cat].push({
        odc,
        line: `${fire}${norm(r.INCIDENT || r.incident)} | ${odc} | ${ttr.text}`
      });
    });

    let output = '📌 TIKET UNDISPATCH\n\n';
    Object.keys(grouped).sort().forEach(sektor => {
      output += `📍 ${sektor}\n`;
      
      for (const cat of categoryOrder) {
        if (grouped[sektor][cat] && grouped[sektor][cat].length) {
          const header = categoryEmoji[cat] || cat;
          output += `\n${header}\n`;
          grouped[sektor][cat].sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => {
            output += i.line + '\n';
          });
        }
      }
      output += '\n';
    });

    const finalMsg = output.trim();

    for (const chatId of TARGET_CHATS) {
      const cleanId = chatId.trim();
      if (cleanId && cleanId.startsWith('-')) {
        try {
          await sendOrReplaceBroadcast(broadcastBot, cleanId, 'UNDISPATCH_INSERA', finalMsg, { parse_mode: undefined });
          console.log(`✅ [Undispatch] Broadcast sent to ${cleanId} successfully.`);
        } catch (sendErr) {
          console.error(`❌ [Undispatch] Failed to send broadcast to ${cleanId}:`, sendErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] Undispatch Insera:', err.message);
  }
}

module.exports = runUndispatchInsera;
