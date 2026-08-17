const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME_GAUL = 'POTENSI GAUL';
const SHEET_NAME_PANTAU = 'PANTAU TTR';
const TARGET_CHATS = (process.env.CHAT_IDS_POTENSI_GAUL || process.env.CHAT_ID_POTENSI_GAUL || '-4945019710,-1004473705354').split(',');

const EMOJI_WZ = {
  BLC: '🟡',
  STI: '🟣',
  PGT: '🟠',
  SER: '🟢',
  KPL: '🔵',
  KIP: '🟤',
  LAINNYA: '🏢'
};

function norm(v) {
  return String(v ?? '').trim();
}

function cleanOdp(raw) {
  const s = norm(raw);
  if (!s || s === '-' || s.toLowerCase() === 'none') return '-';
  return s.replace(/^(ODP-|ODC-)/i, '').trim();
}

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

async function fetchSheetData() {
  // Try fast direct export first, fallback to getSheetRows
  try {
    const urlGaul = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=67576344`;
    const urlPantau = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=422466574`;

    const [resG, resP] = await Promise.all([
      fetch(urlGaul, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }),
      fetch(urlPantau, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })
    ]);

    if (resG.ok && resP.ok) {
      const gaulRows = parseCSV(await resG.text());
      const pantauRows = parseCSV(await resP.text());
      return { gaulRows, pantauRows };
    }
  } catch (err) {
    console.warn('[Potensi Gaul] Direct CSV export failed, falling back to Google API:', err.message);
  }

  // Fallback to getSheetRows via service account
  const gaulRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME_GAUL, true);
  let pantauRows = [];
  try {
    pantauRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME_PANTAU, true);
  } catch (e) {
    // Ignore pantau error
  }
  return { gaulRows, pantauRows };
}

async function runPotensiGaulReminder() {
  console.log('[Scheduler] Running Potensi Gaul Reminder...');
  try {
    const { gaulRows, pantauRows } = await fetchSheetData();
    if (!gaulRows || !gaulRows.length) {
      console.log('[Potensi Gaul] No data found in sheet.');
      return;
    }

    // Build lookup map from PANTAU TTR
    const pantauMap = new Map();
    for (const r of (pantauRows || [])) {
      const inc = norm(r['INCIDENT'] || r['incident']);
      if (inc) {
        pantauMap.set(inc.toUpperCase(), r);
      }
    }

    const groupedByTeam = {};

    for (const row of gaulRows) {
      const inc = norm(row['INCIDENT'] || row['incident']).toUpperCase();
      const serviceNo = norm(row['SERVICE NO'] || row['service_no'] || row['Service No']);
      const odp = cleanOdp(row['ODP'] || row['odp'] || (row['DEVICE NAME'] || '').split('/')[0]);
      const timRaw = norm(row['TIM'] || row['tim'] || row['Tim']);
      const hasilUkur = norm(row['HASIL UKUR'] || row['hasil_ukur'] || row['Hasil Ukur']).toUpperCase() || 'LOS';
      const redaman = norm(row['REDAMAN'] || row['redaman']);
      const cekDispatch = norm(row['CEK DISPATCH'] || row['cek_dispatch'] || row['Cek Dispatch']);

      if (!serviceNo && !inc && !odp) continue;

      let tim = timRaw;
      let ttr = '-';

      if (inc && inc.startsWith('INC')) {
        if (pantauMap.has(inc)) {
          const p = pantauMap.get(inc);
          if (!tim || tim === '-' || tim.toLowerCase() === 'none') {
            tim = norm(p['TIM'] || p['TIM KAWAN'] || p['TIM INSERA']);
          }
          ttr = norm(p['TTR']) || '-';
        }
      }

      if (!tim || tim === '-' || tim.toLowerCase() === 'none') {
        tim = 'BELUM DISPATCH';
      }

      const teamKey = tim.toUpperCase();
      if (!groupedByTeam[teamKey]) groupedByTeam[teamKey] = [];

      const huDisplay = hasilUkur === 'ONLINE' && redaman && redaman !== '-'
        ? `ONLINE (${redaman} dB)`
        : hasilUkur;

      groupedByTeam[teamKey].push({
        incident: inc,
        serviceNo,
        odp: odp || '-',
        hasilUkur: huDisplay,
        ttr: ttr !== '-' ? `${ttr} jam` : '',
        cekDispatch
      });
    }

    const sortedTeams = Object.keys(groupedByTeam).sort((a, b) => {
      if (a === 'BELUM DISPATCH') return 1;
      if (b === 'BELUM DISPATCH') return -1;
      return a.localeCompare(b);
    });

    const totalItems = Object.values(groupedByTeam).reduce((acc, list) => acc + list.length, 0);

    if (totalItems === 0) {
      console.log('[Potensi Gaul] No Potensi Gaul items to broadcast.');
      return;
    }

    // Format current date in WITA (Asia/Makassar)
    const now = new Date();
    const witaDate = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Makassar',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);

    const lines = [];
    lines.push(`🔄 *MONITORING POTENSI GAUL (${totalItems} Layanan/Tiket)*`);
    lines.push(`🕒 _${witaDate} WITA_\n`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━\n');

    for (const team of sortedTeams) {
      const list = groupedByTeam[team];
      lines.push(`👤 *TIM: ${team}* (${list.length})`);
      for (const item of list) {
        const parts = [];
        if (item.incident) parts.push(`\`${item.incident}\``);
        if (item.serviceNo) parts.push(`\`${item.serviceNo}\``);
        if (item.odp && item.odp !== '-') parts.push(`\`${item.odp}\``);
        if (item.ttr) parts.push(`\`${item.ttr}\``);

        // Warning marker if CEK DISPATCH is empty / not dispatched
        if (!item.cekDispatch || item.cekDispatch === '-' || item.cekDispatch.toLowerCase() === 'none') {
          parts.push(`⚠️ *BELUM DISPATCH*`);
        } else {
          parts.push(`*${item.cekDispatch}*`);
        }

        lines.push(`• ${parts.join(' • ')}`);
      }
      lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('⚠️ _Mohon segera dilakukan pengecekan & tindak lanjut pada tiket/layanan potensi gaul di atas._');

    const message = lines.join('\n').trim();

    // Send using Kangbakso1bot with sendOrReplaceBroadcast to all target chats
    for (const chatId of TARGET_CHATS) {
      const cleanId = chatId.trim();
      if (cleanId) {
        try {
          await sendOrReplaceBroadcast(broadcastBot, cleanId, 'POTENSI_GAUL', message);
          console.log(`✅ [Potensi Gaul] Broadcast sent to ${cleanId} successfully.`);
        } catch (errSend) {
          console.error(`❌ [Potensi Gaul] Failed to send broadcast to ${cleanId}:`, errSend.message);
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] Potensi Gaul:', err.message);
  }
}

module.exports = runPotensiGaulReminder;
