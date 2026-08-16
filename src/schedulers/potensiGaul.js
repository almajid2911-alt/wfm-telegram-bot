const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME_GAUL = 'POTENSI GAUL';
const SHEET_NAME_PANTAU = 'PANTAU TTR';
const TARGET_CHAT = process.env.CHAT_ID_POTENSI_GAUL || '-4945019710';

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
  return s.split('/')[0].trim();
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
      fetch(urlGaul, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch(urlPantau, { headers: { 'User-Agent': 'Mozilla/5.0' } })
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

    // Filter rows that have an actual ticket incident or valid potensi gaul
    const ticketItems = [];
    const gponItems = [];

    for (const row of gaulRows) {
      const inc = norm(row['INCIDENT'] || row['incident']).toUpperCase();
      const serviceNo = norm(row['SERVICE NO'] || row['service_no'] || row['Service No']);
      const deviceName = norm(row['DEVICE NAME'] || row['device_name'] || row['Device Name']);
      const workzone = norm(row['WORKZONE'] || row['workzone']).toUpperCase();
      const hasilUkur = norm(row['HASIL UKUR'] || row['hasil_ukur'] || row['Hasil Ukur']).toUpperCase();
      const redaman = norm(row['REDAMAN'] || row['redaman']);

      if (inc && inc.startsWith('INC')) {
        let tim = '-';
        let ttr = '-';
        let custType = '-';
        let wz = workzone;

        if (pantauMap.has(inc)) {
          const p = pantauMap.get(inc);
          tim = norm(p['TIM'] || p['TIM KAWAN'] || p['TIM INSERA']) || '-';
          ttr = norm(p['TTR']) || '-';
          custType = norm(p['CUSTOMER TYPE']) || '-';
          if (!wz) wz = norm(p['WORKZONE']).toUpperCase();
        }

        ticketItems.push({
          incident: inc,
          serviceNo,
          deviceName,
          odp: cleanOdp(deviceName),
          workzone: wz || 'LAINNYA',
          hasilUkur: hasilUkur || 'LOS',
          redaman: redaman || '-',
          tim,
          ttr: ttr !== '-' ? `${ttr} jam` : '-',
          custType
        });
      } else if (serviceNo || deviceName) {
        gponItems.push({
          serviceNo: serviceNo || '-',
          deviceName: deviceName || '-',
          hasilUkur: hasilUkur || 'LOS'
        });
      }
    }

    if (ticketItems.length === 0 && gponItems.length === 0) {
      console.log('[Potensi Gaul] No Potensi Gaul items to broadcast.');
      return;
    }

    // Group tickets by Workzone
    const grouped = {};
    for (const item of ticketItems) {
      const wz = item.workzone || 'LAINNYA';
      if (!grouped[wz]) grouped[wz] = [];
      grouped[wz].push(item);
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
    lines.push(`🔄 *MONITORING POTENSI GAUL (${ticketItems.length} Tiket)*`);
    lines.push(`🕒 _${witaDate} WITA_\n`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━\n');

    if (ticketItems.length > 0) {
      const wzOrder = ['BLC', 'STI', 'PGT', 'KPL', 'SER', 'KIP'];
      const sortedWz = Object.keys(grouped).sort((a, b) => {
        const ia = wzOrder.indexOf(a);
        const ib = wzOrder.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      });

      for (const wz of sortedWz) {
        const emoji = EMOJI_WZ[wz] || EMOJI_WZ.LAINNYA;
        const list = grouped[wz];
        lines.push(`${emoji} *WORKZONE ${wz} (${list.length} Tiket)*`);
        for (const item of list) {
          const huDetail = item.hasilUkur === 'ONLINE' && item.redaman !== '-' 
            ? `ONLINE (${item.redaman} dB)` 
            : item.hasilUkur;
          lines.push(`• \`${item.incident}\` • \`${item.odp}\` • \`${item.tim}\` • \`${item.ttr}\` • *${huDetail}*`);
        }
        lines.push('');
      }
    } else {
      lines.push('• Tidak ada tiket gangguan aktif pada list Potensi Gaul saat ini.\n');
    }

    if (gponItems.length > 0) {
      lines.push(`📡 *SUSPECT PORT / SERVICE GAUL (${gponItems.length} Layanan)*`);
      for (const g of gponItems) {
        lines.push(`• \`${g.serviceNo}\` — \`${g.deviceName}\` (*${g.hasilUkur}*)`);
      }
      lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('⚠️ _Mohon segera dilakukan pengecekan & tindak lanjut pada tiket/layanan potensi gaul di atas._');

    const message = lines.join('\n').trim();

    // Send using Kangbakso1bot with sendOrReplaceBroadcast
    await sendOrReplaceBroadcast(broadcastBot, TARGET_CHAT, 'POTENSI_GAUL', message);
    console.log(`✅ [Potensi Gaul] Broadcast sent to ${TARGET_CHAT} successfully.`);
  } catch (err) {
    console.error('[Scheduler Error] Potensi Gaul:', err.message);
  }
}

module.exports = runPotensiGaulReminder;
