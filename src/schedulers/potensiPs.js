const { getSheetRows } = require('../config/google');
const { broadcastBot, sendOrReplaceBroadcast } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'POTENSI';
const TARGET_CHATS = (process.env.CHAT_IDS_POTENSI || '-1002616721208').split(',');

const norm = v => String(v ?? '').trim();
const normU = v => norm(v).toUpperCase();

const normalizeKey = key => {
  return key.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
};

function getField(obj, possibleNames) {
  const normalizedMap = {};
  for (const key in obj) {
    normalizedMap[normalizeKey(key)] = obj[key];
  }
  for (const name of possibleNames) {
    const found = normalizedMap[normalizeKey(name)];
    if (found !== undefined && found !== null && found !== '') return String(found).trim();
  }
  return '';
}

function getSegmentGroup(segment) {
  const raw = norm(segment);
  if (!raw) return '📦 UNKNOWN';
  const upper = raw.toUpperCase();
  if (upper === 'INDIHOME') return '🏠 INDIHOME';
  if (upper === 'INDIBIZ')  return '🏢 INDIBIZ';
  if (upper === 'PDA')      return '🏢 PDA';
  return `📦 ${upper}`;
}

function formatDurasi(value) {
  if (!value) return '0 JAM';
  const cleanVal = String(value).trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleanVal);
  if (isNaN(num)) {
    const directNum = parseFloat(String(value).replace(',', '.'));
    if (isNaN(directNum)) return '0 JAM';
    return `${directNum.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} JAM`;
  }
  let fixed = num.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  return `${fixed} JAM`;
}

async function runPotensiPs() {
  console.log('[Scheduler] Running Potensi PS...');
  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!rows || !rows.length) return;

    const groupQC = {};

    for (const r of rows) {
      const wo = normU(getField(r, ['Workorder', 'Wonum', 'wo']));
      const qcText = norm(getField(r, ['QC', 'qc']));
      const segment = norm(getField(r, ['JENIS ORDER', 'Segment', 'productname']));
      const team = norm(getField(r, ['TEAM', 'Team', 'team_name']));
      const durasi = getField(r, ['DURASI', 'Durasi', 'durasi']);
      const status = normU(getField(r, ['Status', 'status']));
      const eskalRaw = norm(getField(r, ['Eskal daman', 'ESKAL DAMAN', 'eskal_daman', 'eskal']));

      if (!wo || !qcText) continue;

      const qcKey = qcText;
      const segmentGroup = getSegmentGroup(segment);

      if (!groupQC[qcKey]) groupQC[qcKey] = {};
      if (!groupQC[qcKey][segmentGroup]) groupQC[qcKey][segmentGroup] = [];

      groupQC[qcKey][segmentGroup].push({
        wo,
        team,
        durasi: formatDurasi(durasi),
        isValcomp: status === 'VALCOMP',
        eskal: eskalRaw ? eskalRaw : 'Progres Daman'
      });
    }

    const sortedQC = Object.keys(groupQC).sort((a, b) => {
      if (normU(a) === 'BELUM DORONG') return -1;
      if (normU(b) === 'BELUM DORONG') return 1;
      return a.localeCompare(b);
    });

    if (!sortedQC.length) return;

    const lines = [];
    lines.push('📊 LIST POTENSI PS');
    lines.push('');

    for (const qcName of sortedQC) {
      lines.push(`🟡 ${qcName.toUpperCase()}`);
      lines.push('');

      const segmentGroups = groupQC[qcName];

      for (const seg in segmentGroups) {
        lines.push(seg);
        const sortedItems = segmentGroups[seg].sort((a, b) => a.team.localeCompare(b.team));

        sortedItems.forEach(item => {
          let line = `• ${item.wo} | ${item.team} | ${item.durasi}`;
          if (item.isValcomp) {
            line += ' (VALCOMP)';
          }
          lines.push(line);

          if (normU(qcName) !== 'BELUM DORONG') {
            lines.push(`   • ESKAL DAMAN : ${item.eskal}`);
          }
        });

        lines.push('');
      }
    }

    const message = lines.join('\n').trim();

    for (const chatId of TARGET_CHATS) {
      const cleanId = chatId.trim();
      if (cleanId && cleanId.startsWith('-')) {
        await sendOrReplaceBroadcast(broadcastBot, cleanId, 'POTENSI_PS', message, { parse_mode: undefined });
      }
    }
  } catch (err) {
    console.error('[Scheduler Error] Potensi PS:', err.message);
  }
}

module.exports = runPotensiPs;
