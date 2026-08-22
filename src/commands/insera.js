const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'INSERA';
const SHEET_NAME_PANTAU = 'PANTAU TTR';

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const MONTH_NAMES = {
  1: 'JAN', 2: 'FEB', 3: 'MAR', 4: 'APR', 5: 'MAY', 6: 'JUN',
  7: 'JUL', 8: 'AUG', 9: 'SEP', 10: 'OCT', 11: 'NOV', 12: 'DEC'
};

function parseManjaInfo(bookingDateRaw, jamManjaRaw, descAssignRaw, summaryRaw) {
  const bd = String(bookingDateRaw || '').trim();
  const jm = String(jamManjaRaw || '').trim();
  const da = String(descAssignRaw || '').trim().toUpperCase();
  const sm = String(summaryRaw || '').trim().toUpperCase();

  const isManja = da.includes('CUSTOMER ASSIGN') || (bd.length > 0 && bd !== '-') || (jm.length > 0 && jm !== '-') || sm.includes('MANJA');
  if (!isManja) return null;

  // 1. Try parsing bookingDateRaw (e.g. 2026-08-21 15:00:00.0)
  if (bd && bd !== '-') {
    const matchYMD = bd.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
    if (matchYMD) {
      const [, y, m, d, hh, mm] = matchYMD;
      const monthStr = MONTH_NAMES[parseInt(m, 10)] || m;
      const timeStr = hh ? `${String(hh).padStart(2, '0')}:${mm}` : (jm || '00:00');
      return `${String(d).padStart(2, '0')}-${monthStr} ${timeStr}`;
    }

    const matchDMY = bd.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2}))?/);
    if (matchDMY) {
      const [, d, m, y, hh, mm] = matchDMY;
      const monthStr = MONTH_NAMES[parseInt(m, 10)] || m;
      const timeStr = hh ? `${String(hh).padStart(2, '0')}:${mm}` : (jm || '00:00');
      return `${String(d).padStart(2, '0')}-${monthStr} ${timeStr}`;
    }

    const matchMon = bd.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[\s-]+(\d{1,2}):(\d{2})/);
    if (matchMon) {
      const [, d, m, hh, mm] = matchMon;
      return `${String(d).padStart(2, '0')}-${m.toUpperCase()} ${String(hh).padStart(2, '0')}:${mm}`;
    }
  }

  // 2. Try parsing from summary (e.g. MANJA TGL 21 JAM 15)
  const sumMatch = sm.match(/MANJA\s+(?:TGL\s*)?(\d{1,2})(?:[/-](\d{1,2}))?\s+(?:JAM\s*)?(\d{1,2})(?:[.:](\d{2}))?/i);
  if (sumMatch) {
    const [, d, m, hh, mm] = sumMatch;
    const now = new Date();
    const monthNum = m ? parseInt(m, 10) : (now.getMonth() + 1);
    const monthStr = MONTH_NAMES[monthNum] || `${monthNum}`;
    const timeStr = `${String(hh).padStart(2, '0')}:${mm || '00'}`;
    return `${String(d).padStart(2, '0')}-${monthStr} ${timeStr}`;
  }

  if (jm && jm !== '-') {
    return `Jam ${jm}`;
  }

  if (bd && bd !== '-') {
    return bd;
  }

  return 'Customer Assign';
}

function extractPhoneNumbers(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  const matches = text.match(/(?:(?:\+?62)|0)?8[0-9]{8,12}/g);
  if (!matches) return [];

  const unique = [];
  for (const m of matches) {
    let clean = m.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    else if (!clean.startsWith('62') && clean.startsWith('8')) clean = '62' + clean;

    if (clean.length >= 10 && clean.length <= 15 && !unique.includes(clean)) {
      unique.push(clean);
    }
  }
  return unique;
}

function formatUkurDisplay(hasilUkur, redaman) {
  const hu = (hasilUkur || '').trim().toUpperCase();
  const red = (redaman || '').trim();
  const redVal = parseFloat(red.replace(',', '.'));

  if (hu === 'ONLINE') {
    if (!isNaN(redVal)) {
      if (redVal >= -24.0) {
        return `🟢 <b>ONLINE</b> (<code>${redVal.toFixed(1)} dBm</code>)`;
      } else {
        return `🟡 <b>ONLINE</b> (<code>${redVal.toFixed(1)} dBm</code> - <i>Redaman Tinggi</i>)`;
      }
    }
    return '🟢 <b>ONLINE</b>';
  } else if (hu.includes('LOS') || hu.includes('LOSS')) {
    return '🔴 <b>LOS</b>';
  } else if (hu.includes('OFFLINE')) {
    return '🔴 <b>OFFLINE</b>';
  } else if (hu.includes('DYING')) {
    return '⚪ <b>DYING GASP</b>';
  } else if (hu && hu !== '-') {
    return `⚪ <b>${escapeHtml(hu)}</b>`;
  }
  return '';
}

async function handleInseraCommand(ctx, rawTicket) {
  const searchedTicket = (rawTicket || '').trim().toUpperCase();

  if (!searchedTicket) {
    return ctx.reply('⚠️ Format: <code>/insera &lt;INCIDENT_ID&gt;</code> atau langsung ketik <code>INC52287592</code>', { parse_mode: 'HTML' });
  }

  try {
    // Ambil data dari tab INSERA dan tab PANTAU TTR secara paralel
    const [rowsInsera, rowsPantau] = await Promise.all([
      getSheetRows(SPREADSHEET_ID, SHEET_NAME).catch(() => []),
      getSheetRows(SPREADSHEET_ID, SHEET_NAME_PANTAU).catch(() => [])
    ]);

    const findMatch = (rows) => rows.find(r => {
      for (const k in r) {
        if (k.toLowerCase().includes('incident') || k.toLowerCase().includes('ticket')) {
          const val = String(r[k] || '').trim().toUpperCase();
          if (val && (val === searchedTicket || val.includes(searchedTicket))) {
            return true;
          }
        }
      }
      return false;
    });

    const matchInsera = findMatch(rowsInsera);
    const matchPantau = findMatch(rowsPantau);

    if (!matchInsera && !matchPantau) {
      return ctx.reply(`⚠️ <b>TIKET TIDAK DITEMUKAN</b>\n━━━━━━━━━━━━━━━━━━\nMaaf, data untuk tiket <code>${escapeHtml(searchedTicket)}</code> tidak ditemukan di database Google Sheets.\n\nSilakan periksa kembali nomor tiket yang Anda masukkan.`, { parse_mode: 'HTML' });
    }

    const getVal = (keyNames) => {
      // Prioritaskan dari PANTAU TTR dulu (karena sering diupdate teknisi/kawan), lalu fallback ke INSERA
      const sources = [matchPantau, matchInsera].filter(Boolean);
      for (const src of sources) {
        for (const k of keyNames) {
          const kLower = k.toLowerCase().trim();
          // 1. Exact match
          for (const realKey in src) {
            if (realKey.toLowerCase().trim() === kLower) {
              const val = src[realKey];
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                return String(val).trim();
              }
            }
          }
          // 2. Prefix / substring match
          for (const realKey in src) {
            const rkLower = realKey.toLowerCase().trim();
            if (rkLower.startsWith(kLower + ' ') || rkLower.startsWith(kLower + '_') || rkLower.startsWith(kLower + ':') || rkLower.includes(kLower)) {
              const val = src[realKey];
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                return String(val).trim();
              }
            }
          }
        }
      }
      return '';
    };

    const incident = getVal(['INCIDENT', 'Incident', 'TICKET ID']) || searchedTicket;
    const rawContactPhone = getVal(['CONTACT PHONE', 'Contact Phone', 'CONTACT_PHONE', 'CUSTOMER CATEGORY', 'CP']) || '-';
    const serviceNo = getVal(['SERVICE NO', 'Service No', 'SERVICE_NO', 'SERVICE ID']) || '-';
    const reportedDate = getVal(['REPORTED DATE', 'Reported Date', 'REPORTED_DATE', 'STATUS DATE']) || '-';

    const contactName = (getVal(['CUSTOMER NAME', 'Customer Name', 'CUSTOMER_NAME', 'CONTACT NAME', 'Contact Name']) || '-').toUpperCase();
    const customerType = (getVal(['CUSTOMER TYPE', 'Customer Type', 'CUSTOMER_TYPE']) || '-').toUpperCase();
    const customerSegment = (getVal(['CUSTOMER SEGMENT', 'Customer Segment', 'CUSTOMER_SEGMENT', 'Segment', 'SEGMENT']) || '').toUpperCase();

    // Gabungkan segmen & tipe
    let segDisplay = customerType;
    if (customerSegment && customerSegment !== '-' && !customerType.includes(customerSegment)) {
      segDisplay = customerType !== '-' ? `${customerType} (${customerSegment})` : customerSegment;
    }

    const rawSummary = getVal(['SUMMARY', 'Summary', 'DESCRIPTION', 'Description', 'WORKLOG SUMMARY', 'SYMPTOM']) || '';
    const summary = rawSummary || '-';

    const bookingDate = getVal(['BOOKING DATE', 'Booking Date', 'BOOKING_DATE', 'Booking_Date']);
    const jamManja = getVal(['JAM MANJA', 'Jam Manja', 'JAM_MANJA', 'Jam_Manja']);
    const descAssign = getVal(['DESCRIPTION ASSIGMENT', 'Description Assignment', 'DESCRIPTION_ASSIGNMENT', 'DESCRIPTION ASSIGNMENT', 'Description Assigment']);
    const manjaInfo = parseManjaInfo(bookingDate, jamManja, descAssign, rawSummary);

    let deviceName = getVal(['DEVICE NAME', 'Device Name', 'DEVICE_NAME', 'ODC REAL', 'ODC', 'odc', 'RK INFORMATION']);
    if (!deviceName && rawSummary) {
      const odpMatch = rawSummary.match(/\b(ODP-[A-Za-z0-9\-/_]+(?:\s+[A-Za-z0-9\-/\.]+)?)\b/i);
      if (odpMatch) deviceName = odpMatch[1].toUpperCase();
    }
    if (!deviceName) deviceName = '-';

    // Field tambahan sesuai permintaan: TIM, TTR, Hasil Ukur & Redaman, Status Garansi, Potensi Gaul, Status Kawan, Catatan
    const tim = getVal(['TIM', 'Tim', 'TIM KAWAN', 'TIM INSERA', 'TECHNICIAN']) || '-';
    const ttr = getVal(['TTR', 'ttr', 'TTR CUSTOMER', 'TTR END TO END']) || '-';
    const hasilUkur = getVal(['HASIL UKUR', 'Hasil Ukur', 'hasil_ukur', 'ONU RX']);
    const redaman = getVal(['REDAMAN', 'Redaman', 'redaman']);
    const ukurDisplay = formatUkurDisplay(hasilUkur, redaman);

    const statusGaransiRaw = getVal(['STATUS GARANSI', 'Status Garansi', 'GUARANTE STATUS', 'Guarante Status']) || '';
    let statusGaransiDisplay = '-';
    if (statusGaransiRaw && statusGaransiRaw !== '-') {
      const gUpper = statusGaransiRaw.toUpperCase();
      if (gUpper.includes('GARANSI') || gUpper === 'YES' || gUpper === 'TRUE' || gUpper === 'Y') {
        statusGaransiDisplay = '🛡️ GARANSI';
      } else if (gUpper.includes('NON') || gUpper.includes('NOT') || gUpper === 'NO') {
        statusGaransiDisplay = 'Non Garansi';
      } else {
        statusGaransiDisplay = statusGaransiRaw;
      }
    }

    const potensiGaulRaw = getVal(['POTENSI GAUL', 'Potensi Gaul', 'potensi_gaul', 'GAUL']) || '';
    let potensiGaulDisplay = '-';
    if (potensiGaulRaw && potensiGaulRaw !== '-') {
      potensiGaulDisplay = potensiGaulRaw.toUpperCase().includes('GAUL') ? '🔄 GAUL' : potensiGaulRaw;
    }

    const statusKawan = getVal(['STATUS KAWAN', 'Status Kawan', 'status_kawan', 'STATUS']) || '';
    const catatan = getVal(['CATATAN', 'Catatan', 'catatan', 'NOTE', 'Note']) || '';

    // Ekstrak dan bersihkan nomor HP (deduplikasi nomor ganda)
    const phoneList = extractPhoneNumbers(rawContactPhone + ' ' + rawSummary);
    const displayPhone = phoneList.length > 0 ? phoneList.join(' / ') : rawContactPhone;

    let msg = '📌 <b>DETAIL TIKET GANGGUAN</b>\n';
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += `🆔 <b>Incident:</b> <code>${escapeHtml(incident)}</code>\n`;
    msg += `📅 <b>Reported:</b> ${escapeHtml(reportedDate)}\n`;
    msg += `👤 <b>Customer:</b> ${escapeHtml(contactName)}\n`;
    msg += `💎 <b>Segment:</b> ${escapeHtml(segDisplay)}\n`;
    msg += `📞 <b>Contact:</b> <code>${escapeHtml(displayPhone)}</code>\n`;
    msg += `🌐 <b>Service No:</b> <code>${escapeHtml(serviceNo)}</code>\n`;
    msg += `🔌 <b>Device Name:</b> <code>${escapeHtml(deviceName)}</code>\n`;
    
    if (tim && tim !== '-') {
      msg += `👷 <b>Tim:</b> <code>${escapeHtml(tim)}</code>\n`;
    }
    if (ttr && ttr !== '-') {
      msg += `⏱️ <b>TTR:</b> <code>${escapeHtml(ttr)} Jam</code>\n`;
    }
    if (ukurDisplay) {
      msg += `📊 <b>Hasil Ukur:</b> ${ukurDisplay}\n`;
    }
    if (statusGaransiDisplay && statusGaransiDisplay !== '-') {
      msg += `🛡️ <b>Status Garansi:</b> ${escapeHtml(statusGaransiDisplay)}\n`;
    }
    if (potensiGaulDisplay && potensiGaulDisplay !== '-') {
      msg += `🔄 <b>Potensi Gaul:</b> ${escapeHtml(potensiGaulDisplay)}\n`;
    }
    if (manjaInfo) {
      msg += `⏳ <b>Tiket Manja:</b> <code>${escapeHtml(manjaInfo)}</code>\n`;
    }
    if (statusKawan && statusKawan !== '-') {
      msg += `📋 <b>Status Kawan:</b> <b>${escapeHtml(statusKawan)}</b>\n`;
    }
    if (catatan && catatan !== '-') {
      msg += `📝 <b>Catatan:</b> <i>${escapeHtml(catatan)}</i>\n`;
    }

    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += '📝 <b>Summary:</b>\n';
    msg += escapeHtml(summary);

    const buttons = [];
    if (phoneList.length === 1) {
      buttons.push([Markup.button.url('💬 Chat WhatsApp Pelanggan', `https://wa.me/${phoneList[0]}`)]);
    } else if (phoneList.length > 1) {
      phoneList.forEach((phone, idx) => {
        buttons.push([Markup.button.url(`💬 Chat WhatsApp (No ${idx + 1}: ${phone})`, `https://wa.me/${phone}`)]);
      });
    }

    if (buttons.length > 0) {
      await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('[Command Error] /insera:', err.message);
    ctx.reply('❌ Error: ' + escapeHtml(err.message), { parse_mode: 'HTML' });
  }
}

module.exports = handleInseraCommand;
