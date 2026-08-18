const { getSheetRows } = require('../config/google');
const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'PANTAU TTR';

// Target chats: Always include Logic Issue (-1004473705354) & Koordinasi TL/HD (-1003190090092), exclude -4945019710
const DEFAULT_TARGET_CHATS = ['-1004473705354', '-1003190090092'];
const envChats = (process.env.CHAT_IDS_UNDISPATCH_INSERA || process.env.CHAT_ID_UNDISPATCH_INSERA || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id && id.startsWith('-') && id !== '-4945019710');

const TARGET_CHATS = Array.from(new Set([...DEFAULT_TARGET_CHATS, ...envChats]));

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

  if (summary.includes('GAMAS')) return 'GAMAS';
  if (summary.includes('SQM') || custType.includes('SQM')) return 'SQM';
  if (summary.includes('UNSPEC') || summary.includes('UNSPEK') || custType.includes('UNSPEC')) return 'UNSPEC';
  
  // All others (HVC GOLD, HVC Platinum, HVC Diamond, RBS, Garansi, Reguler) fall under REGULER
  return 'REGULER';
}

function getRedamanIndicator(hasilUkur, redaman) {
  const hu = upper(hasilUkur);
  const rRaw = norm(redaman).replace(',', '.');
  const num = Math.abs(parseFloat(rRaw));

  if (hu === 'LOS' || !rRaw || rRaw === '-' || isNaN(num) || num === 0) {
    return '🔴'; // LOS / Putus / Belum Ukur / Redaman -
  }

  if (num <= 24.0) {
    return '🟢'; // Online Spek Baik (<= -24 dB)
  } else if (num <= 27.0) {
    return '🟡'; // Online Redaman Mepet (-24 s/d -27 dB)
  } else {
    return '🟠'; // Online Redaman Jelek (> -27 dB)
  }
}

const formatTTR = v => {
  const cleanVal = String(v).replace(',', '.');
  const num = parseFloat(cleanVal);
  if (isNaN(num)) return { text: '0,0', value: 0 };
  return { text: num.toFixed(1).replace('.', ','), value: num };
};

const simplifyODC = (odcReal, deviceName) => {
  let s = norm(odcReal);
  if (!s || s === '-' || s === '`' || s.toLowerCase() === 'none') {
    s = norm(deviceName);
  }
  return s.replace(/^(ODC-|ODP-)/i, '').split('/')[0].split(' ')[0].trim() || '-';
};

const sektorMap = {
  'STI': 'SEKTOR SATUI',
  'BLC': 'SEKTOR BATULICIN',
  'SER': 'SEKTOR BATULICIN',
  'KPL': 'SEKTOR KOTABARU',
  'PGT': 'SEKTOR SATUI',
  'KIP': 'SEKTOR SATUI'
};

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
        grouped[sektor] = { REGULER: [], SQM: [], UNSPEC: [], GAMAS: [] };
      }
      if (!grouped[sektor][cat]) {
        grouped[sektor][cat] = [];
      }

      const ttr = formatTTR(r.TTR || r.ttr);
      const odc = simplifyODC(r['ODC REAL'] || r.odc_real, r['DEVICE NAME'] || r.device_name);
      const indicator = getRedamanIndicator(r['HASIL UKUR'] || r.hasil_ukur, r['REDAMAN'] || r.redaman);

      grouped[sektor][cat].push({
        odc,
        line: `${indicator} ${norm(r.INCIDENT || r.incident)} | ${odc} | ${ttr.text}`
      });
    });

    let output = '📌 TIKET UNDISPATCH\n\n';
    Object.keys(grouped).sort().forEach(sektor => {
      output += `📍 ${sektor}\n`;
      
      const data = grouped[sektor];
      const hasReguler = data.REGULER && data.REGULER.length > 0;
      const hasSqm = data.SQM && data.SQM.length > 0;
      const hasUnspec = data.UNSPEC && data.UNSPEC.length > 0;
      const hasGamas = data.GAMAS && data.GAMAS.length > 0;

      // 1. REGULER on top (HVC Gold, Diamond, Platinum, RBS, Reguler)
      if (hasReguler) {
        output += '\n👤 REGULER\n';
        data.REGULER.sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => {
          output += i.line + '\n';
        });
      }

      // Divider if REGULER exists and there are SQM/UNSPEC/GAMAS below
      if (hasReguler && (hasSqm || hasUnspec || hasGamas)) {
        output += '\n━━━━━━━━━━━━━━━━━━━━━\n';
      }

      // 2. SQM
      if (hasSqm) {
        output += '\n⚡ SQM\n';
        data.SQM.sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => {
          output += i.line + '\n';
        });
      }

      // 3. UNSPEC
      if (hasUnspec) {
        output += '\n❓ UNSPEC\n';
        data.UNSPEC.sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => {
          output += i.line + '\n';
        });
      }

      // 4. GAMAS
      if (hasGamas) {
        output += '\n🚨 GAMAS\n';
        data.GAMAS.sort((a, b) => a.odc.localeCompare(b.odc)).forEach(i => {
          output += i.line + '\n';
        });
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
