require('dotenv').config();
const { Telegraf } = require('telegraf');
const { getSheetRows } = require('./src/config/google');

const TEST_BOT_TOKEN = '8407209552:AAG06OhudzjkwBgipOp5GErfaCTJWClherg';
const bot = new Telegraf(TEST_BOT_TOKEN);

console.log('=============================================');
console.log('🧪 BROADCAST TEST RUNNER ACTIVE');
console.log('Bot: @Kangbakso1bot (VALINS PSB)');
console.log('=============================================');

async function safeReply(ctx, text) {
  try {
    return await ctx.reply(text, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    return await ctx.reply(text, { disable_web_page_preview: true });
  }
}

// 1. UNDISPATCH INSERA
async function getUndispatchInsera() {
  const rows = await getSheetRows('1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY', 'PANTAU TTR');
  if (!rows.length) return '📌 TIKET UNDISPATCH\n\n(Tidak ada data)';

  const norm = v => String(v ?? '').trim();
  const upper = v => norm(v).toUpperCase();

  const formatTTR = v => {
    const num = parseFloat(v);
    if (isNaN(num)) return { text: '0,0', value: 0 };
    return { text: num.toFixed(1).replace('.', ','), value: num };
  };

  const simplifyODC = val => norm(val).replace(/^(ODC-|ODP-)/i, '').split(' ')[0];

  const sektorMap = {
    'STI': 'SEKTOR SATUI', 'BLC': 'SEKTOR BATULICIN', 'SER': 'SEKTOR BATULICIN',
    'KPL': 'SEKTOR KOTABARU', 'PGT': 'SEKTOR SATUI', 'KIP': 'SEKTOR SATUI'
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
    let sektor = segment === 'RBS' ? 'SEKTOR B2B' : (sektorMap[norm(r.WORKZONE)] || `SEKTOR ${norm(r.WORKZONE)}`);

    if (!grouped[sektor]) grouped[sektor] = { normal: [], gamas: [] };

    const ttr = formatTTR(r.TTR);
    const odc = simplifyODC(r['ODC REAL']);
    const fire = ttr.value > 12 ? '🔥 ' : '';
    const item = { odc, line: `${fire}${norm(r.INCIDENT)} | ${odc} | ${ttr.text}` };

    if (summary.includes('GAMAS')) grouped[sektor].gamas.push(item);
    else grouped[sektor].normal.push(item);
  });

  if (!Object.keys(grouped).length) return '📌 TIKET UNDISPATCH\n\n(Tidak ada tiket undispatch)';

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
  return output.trim();
}

// 2. WECARE
async function getWecare() {
  const allItems = await getSheetRows('1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I', 'WECARE');
  if (!allItems.length) return '📊 *REKAPITULASI ODP WECARE*\n\n(Tidak ada data)';

  const needActionConditions = ['ODP RUSAK', 'ODP TERBUKA', 'ODP NON COVER'];
  const excludeConditions = ['ODP TERTUTUP RAPI', 'ODP MASIH CLOSURE'];

  const openTicketsByTech = {};
  const latestOdpMap = {};

  for (const data of allItems) {
    const odp = String(data['ODP'] || '-').trim();
    if (odp === '-' || !odp) continue;

    const status = String(data['Status'] || '').trim().toUpperCase();
    const tech = String(data['Nama Teknisi'] || 'TANPA TEKNISI').trim().toUpperCase();
    const accessId = String(data['Access ID'] || data['ACCESS ID'] || '').trim();
    const kBefore = String(data['Kondisi Before'] || '').trim().toUpperCase();
    const kAfter = String(data['Kondisi After'] || '').trim().toUpperCase();
    const updatedAtStr = data['Updated At'] || data['UPDATED AT'] || data['updated_at'] || null;
    const updatedAt = updatedAtStr ? new Date(updatedAtStr).getTime() : 0;

    if (status === 'OPEN') {
      if (!openTicketsByTech[tech]) openTicketsByTech[tech] = [];
      openTicketsByTech[tech].push({ odp, accessId });
    }

    if (!latestOdpMap[odp] || updatedAt > latestOdpMap[odp].updatedAt) {
      latestOdpMap[odp] = { odp, status, tech, kBefore, kAfter, updatedAt };
    }
  }

  const openOdpByTech = {};
  const otherNeedActionMap = {};

  for (const odpKey in latestOdpMap) {
    const data = latestOdpMap[odpKey];
    const currentKondisi = data.kAfter !== '' ? data.kAfter : data.kBefore;
    const isExcluded = excludeConditions.some(cond => currentKondisi.includes(cond));
    const isMatchNeedAction = needActionConditions.some(cond => currentKondisi.includes(cond));

    if (!isExcluded && isMatchNeedAction) {
      if (currentKondisi.includes('ODP TERBUKA')) {
        if (!openOdpByTech[data.tech]) openOdpByTech[data.tech] = [];
        openOdpByTech[data.tech].push(data.odp);
      } else {
        const labelKondisi = currentKondisi || 'NEED ACTION';
        if (!otherNeedActionMap[labelKondisi]) otherNeedActionMap[labelKondisi] = [];
        otherNeedActionMap[labelKondisi].push(data.odp);
      }
    }
  }

  let msg = '=================================\n';
  msg += '📊 *REKAPITULASI ODP WECARE*\n';
  msg += '=================================\\n\n';

  if (Object.keys(openTicketsByTech).length > 0) {
    msg += '📂 *DAFTAR TIKET STATUS OPEN*\n';
    msg += '─────────────────────────\n';
    for (const [techName, odpList] of Object.entries(openTicketsByTech)) {
      odpList.sort((a, b) => a.odp.localeCompare(b.odp, undefined, { numeric: true, sensitivity: 'base' }));
      msg += `👤 *${techName}*\n`;
      for (let i = 0; i < odpList.length; i++) {
        const isLast = (i === odpList.length - 1);
        const prefix = isLast ? '  └─' : '  ├─';
        const item = odpList[i];
        const accessIdLabel = item.accessId ? ` (${item.accessId})` : '';
        msg += `${prefix} 📦 *${item.odp}*${accessIdLabel}\n`;
      }
      msg += '\n';
    }
  }

  const hasOpenODP = Object.keys(openOdpByTech).length > 0;
  const hasOtherAction = Object.keys(otherNeedActionMap).length > 0;

  if (hasOpenODP || hasOtherAction) {
    msg += '═════════════════════════\n';
    msg += '⚠️ *DAFTAR ODP NEED ACTION (AFTER)*\n';
    msg += '═════════════════════════\n\n';

    if (hasOpenODP) {
      msg += '🔴 *ODP TERBUKA*\n';
      msg += '─────────────────────────\n';
      for (const [techName, odpList] of Object.entries(openOdpByTech)) {
        odpList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        msg += `👤 *${techName}*\n`;
        for (let i = 0; i < odpList.length; i++) {
          const isLast = (i === odpList.length - 1);
          const prefix = isLast ? '  └─' : '  ├─';
          msg += `${prefix} 📦 *${odpList[i]}*\n`;
        }
        msg += '\n';
      }
    }

    if (hasOtherAction) {
      for (const [kondisiName, odpList] of Object.entries(otherNeedActionMap)) {
        odpList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        msg += `🔴 *${kondisiName}*\n`;
        msg += '─────────────────────────\n';
        for (let i = 0; i < odpList.length; i++) {
          const isLast = (i === odpList.length - 1);
          const prefix = isLast ? '  └─' : '  ├─';
          msg += `${prefix} 📦 *${odpList[i]}*\n`;
        }
        msg += '\n';
      }
    }
  }

  return msg.trimEnd();
}

// 3. POTENSI PS
async function getPotensiPs() {
  const rows = await getSheetRows('1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I', 'POTENSI');
  if (!rows.length) return '📊 *LIST POTENSI PS*\n\n(Tidak ada data)';

  const norm = v => String(v ?? '').trim();
  const normU = v => norm(v).toUpperCase();
  const normalizeKey = key => key.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');

  function getField(obj, possibleNames) {
    const normalizedMap = {};
    for (const key in obj) normalizedMap[normalizeKey(key)] = obj[key];
    for (const name of possibleNames) {
      const found = normalizedMap[normalizeKey(name)];
      if (found !== undefined) return found;
    }
    return '';
  }

  function getSegmentGroup(segment) {
    const raw = norm(segment);
    if (!raw) return '📦 UNKNOWN';
    const upper = raw.toUpperCase();
    if (upper === 'INDIHOME') return '🏠 INDIHOME';
    if (upper === 'INDIBIZ')  return '🏢 INDIBIZ';
    if (upper === 'PDA')      return '🏬 PDA';
    return `📦 ${upper}`;
  }

  function formatDurasi(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0 JAM';
    let fixed = num.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    return `${fixed} JAM`;
  }

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
      wo, team, durasi: formatDurasi(durasi),
      isValcomp: status === 'VALCOMP',
      eskal: eskalRaw ? eskalRaw : 'Progres Daman'
    });
  }

  const sortedQC = Object.keys(groupQC).sort((a, b) => {
    if (normU(a) === 'BELUM DORONG') return -1;
    if (normU(b) === 'BELUM DORONG') return 1;
    return a.localeCompare(b);
  });

  const lines = ['📊 *LIST POTENSI PS*', ''];
  for (const qcName of sortedQC) {
    lines.push(`🟡 *${qcName.toUpperCase()}*`, '');
    const segmentGroups = groupQC[qcName];
    for (const seg in segmentGroups) {
      lines.push(seg);
      const sortedItems = segmentGroups[seg].sort((a, b) => a.team.localeCompare(b.team));
      sortedItems.forEach(item => {
        let line = `• ${item.wo} | ${item.team} | ${item.durasi}`;
        if (item.isValcomp) line += ' (VALCOMP)';
        lines.push(line);
        if (normU(qcName) !== 'BELUM DORONG') {
          lines.push(`   • ESKAL DAMAN : ${item.eskal}`);
        }
      });
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

// 4. FAILWA
async function getFailwa() {
  const rows = await getSheetRows('1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I', 'FAILWA');
  const norm = v => String(v ?? '').trim();
  const upper = v => norm(v).toUpperCase();

  const filtered = rows.filter(r => {
    const statusOk = upper(r.Status) === 'STARTWORK';
    const isIssue = upper(r.GRUP).includes('ISSUE');
    return statusOk && isIssue;
  });

  if (!filtered.length) return '📊 KENDALA BELUM FAILWA\n━━━━━━━━━━━━━━\n📌 Total Order : 0';

  filtered.sort((a, b) => norm(a.TIM).localeCompare(norm(b.TIM)));
  let text = '📊 KENDALA BELUM FAILWA\n━━━━━━━━━━━━━━\n📌 Total Order : ' + filtered.length + '\n━━━━━━━━━━━━━━\n';
  filtered.forEach(r => {
    text += `• ${norm(r.Workorder)} | ${norm(r.TIM) || '-'} | ${norm(r.MORNING) || '-'}\n`;
  });
  return text.trim();
}

// 5. REMINDER UNDISPATCH (dengan EMOJI grup)
async function getUndispatchReminder() {
  const allRows = await getSheetRows('1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I', 'UNDISPATCH');

  const EMOJI = { PGT: '🟠', STI: '🟣', SER: '🟢', KPL: '🔵', BLC: '🟡', KIP: '🟤', LAINNYA: '⚪' };
  const norm = v => String(v ?? '').trim();
  const keyNorm = k => String(k ?? '').trim().toLowerCase().replace(/[\s\-_]+/g, '');

  function pick(row, candidates) {
    const keys = Object.keys(row || {});
    const map = new Map(keys.map(k => [keyNorm(k), k]));
    for (const c of candidates) {
      const found = map.get(keyNorm(c));
      if (found != null) {
        const val = row[found];
        const s = norm(val);
        if (s) return s;
      }
    }
    return '';
  }

  function extractDisplayCode(raw) {
    const s = norm(raw);
    if (!s || s === '-' || s.toLowerCase() === 'empty') return '';
    let m = s.match(/^ODP-([A-Z0-9]+-[A-Z0-9]+)(?:\/|$)/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/^ODP-([A-Z0-9]+)(?:\/|$)/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/^([A-Z0-9]+-[A-Z0-9]+)$/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/^([A-Z0-9]{2,10})$/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/([A-Z0-9]+-[A-Z0-9]+)/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/\b([A-Z0-9]{2,10})\b/i);
    return m ? m[1].toUpperCase() : '';
  }

  function extractGroup(displayCode) {
    const s = norm(displayCode);
    if (!s) return 'LAINNYA';
    return s.includes('-') ? s.split('-')[0].toUpperCase() : s.toUpperCase();
  }

  const groups = {};
  for (const row of allRows) {
    const teamName = pick(row, ['team_name', 'team name', 'team', 'c_team_name']);
    if (teamName) continue;

    const desc = pick(row, ['Description', 'description', 'desc', 'c_description', 'report_notes', 'report notes', 'notes']);
    if (desc && /\b(cabut\s*ont|remove)\b/i.test(desc)) continue;

    const track = pick(row, ['Track Order', 'track_order', 'trackorder', 'track', 'c_track_order', 'track id', 'trackid']);
    const codeRaw = pick(row, ['ODP', 'odp', 'ODC', 'odc', 'c_workzone', 'workzone', 'work zone', 'WILSUS', 'wilsus']);
    const displayCode = extractDisplayCode(codeRaw);

    if (!track || !displayCode) continue;

    const group = extractGroup(displayCode);
    if (!groups[group]) groups[group] = [];
    groups[group].push({ track, displayCode });
  }

  const groupNames = Object.keys(groups);
  if (!groupNames.length) return '⏰ *Reminder Order Undispatch*\n\n(Tidak ada data)';

  let msg = '⏰ *Reminder Order Undispatch*\n\n';
  for (const g of groupNames.sort()) {
    const seen = new Set();
    const uniq = [];
    for (const it of groups[g]) {
      const key = `${it.track}|${it.displayCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(it);
    }
    if (!uniq.length) continue;

    const emoji = EMOJI[g] || EMOJI.LAINNYA;
    msg += `${emoji} *${g}* (${uniq.length})\n`;
    for (const it of uniq) msg += `• ${it.track} — ${it.displayCode}\n`;
    msg += '\n';
  }

  return msg.replace(/\n{3,}/g, '\n\n').trim();
}

// 6. UNDISPATCH XPRO
async function getUndispatchXpro() {
  const rows = await getSheetRows('1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I', 'UNDISPATCH XPRO');
  const clean = val => (val ? String(val).replace(/"/g, '').trim() : '');

  const filtered = rows.filter(r => {
    const status = clean(r.STATUS_RESUME || r.status_resume);
    const tim = clean(r.TIM || r.tim);
    return status === 'MIA - SEND SURVEY' && tim === '';
  });

  if (!filtered.length) return '⏰UNDISPATCH INDIBIZ \n\n(Tidak ada data)';

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

  return message.trim();
}

// 7. FFG
async function getFfg() {
  const rows = await getSheetRows('1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I', 'FFG');
  const groups = {};

  rows.forEach(d => {
    const tim = String(d['TIM'] || d['Tim'] || '').trim();
    if (!tim || tim === '-' || tim === 'undefined') return;

    const serviceNo = d['Service No.'] || d['service_no'] || '-';
    const odc = d['ODC'] || d['odc'] || '-';

    if (!groups[tim]) groups[tim] = [];
    groups[tim].push(`${serviceNo} | ${odc}`);
  });

  if (Object.keys(groups).length === 0) return '🚨 GARANSI TERDETEKSI LOS BELUM ADA TIKET GANGGUAN\n\n(Tidak ada data)';

  const laporan = Object.entries(groups)
    .map(([tim, list]) => `TIM ${tim}\n${list.join('\n')}`)
    .join('\n\n');

  return `🚨 GARANSI TERDETEKSI LOS BELUM ADA TIKET GANGGUAN\n\n${laporan}`;
}

// 8. TIKET PENTING (KAWAL KETAT)
async function getTiketPenting() {
  const rows = await getSheetRows('1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY', 'KAWAL KETAT');
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
      if (parts.length >= 3) odcFormatted = `${parts[1]}-${parts[2]}`;
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

  if (!garansi.length && !platinum.length && !diamond.length) {
    return 'Moban di bantu kawal sampai close sesuai Target TTR nya \n\n@AdtyaR @was1tuha @Samyusuf01\n\n(Tidak ada tiket garansi / HVC yang aktif saat ini)';
  }

  const sections = [];
  if (garansi.length) sections.push(`🚨 TIKET GARANSI (3 JAM)\n━━━━━━━━━━━━━━\n${garansi.join('\n')}`);
  if (platinum.length) sections.push(`💎 TIKET HVC PLATINUM (6 JAM)\n━━━━━━━━━━━━━━\n${platinum.join('\n')}`);
  if (diamond.length) sections.push(`👑 TIKET HVC DIAMOND (3 JAM)\n━━━━━━━━━━━━━━\n${diamond.join('\n')}`);

  return `Moban di bantu kawal sampai close sesuai Target TTR nya \n\n@AdtyaR @was1tuha @Samyusuf01\n\n${sections.join('\n\n')}`;
}

// Bot listeners
bot.start(async (ctx) => {
  await ctx.reply('🚀 *BOT TEST BROADCAST AKTIF!*\n\nSedang menyiapkan dan mengirimkan **SELURUH 8 LAPORAN BROADCAST** langsung ke chat ini...', { parse_mode: 'Markdown' });

  const tests = [
    { title: '1️⃣ UNDISPATCH INSERA', fn: getUndispatchInsera },
    { title: '2️⃣ WECARE', fn: getWecare },
    { title: '3️⃣ POTENSI PS', fn: getPotensiPs },
    { title: '4️⃣ FAILWA', fn: getFailwa },
    { title: '5️⃣ REMINDER UNDISPATCH', fn: getUndispatchReminder },
    { title: '6️⃣ UNDISPATCH XPRO', fn: getUndispatchXpro },
    { title: '7️⃣ FFG', fn: getFfg },
    { title: '8️⃣ TIKET PENTING (KAWAL KETAT)', fn: getTiketPenting }
  ];

  for (const t of tests) {
    try {
      await ctx.reply(`⏳ *Mengambil data ${t.title}...*`, { parse_mode: 'Markdown' });
      const msg = await t.fn();
      await safeReply(ctx, msg);
    } catch (err) {
      await ctx.reply(`❌ *Error pada ${t.title}:* ${err.message}`);
    }
  }

  await ctx.reply('🏁 *SEMUA LAPORAN BROADCAST SELESAI DIKIRIM!*', { parse_mode: 'Markdown' });
});

bot.launch().then(() => {
  console.log('✅ Bot Test Broadcast listening for /start...');
}).catch(err => {
  console.error('❌ Bot launch failed:', err.message);
});
