const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'INSERA';

const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.toString().replace(/([*_[\]`])/g, '\\$1');
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

async function handleInseraCommand(ctx, rawTicket) {
  const searchedTicket = (rawTicket || '').trim().toUpperCase();

  if (!searchedTicket) {
    return ctx.reply('⚠️ Format: `/insera <INCIDENT_ID>` atau langsung ketik `INC49917821`', { parse_mode: 'Markdown' });
  }

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    
    // Find matching incident accurately
    const match = rows.find(r => {
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

    if (!match) {
      return ctx.reply(`⚠️ *TIKET TIDAK DITEMUKAN*\n━━━━━━━━━━━━━━━━━━\nMaaf, data untuk tiket \`${searchedTicket}\` tidak ditemukan di database Google Sheets.\n\nSilakan periksa kembali nomor tiket yang Anda masukkan.`, { parse_mode: 'Markdown' });
    }

    const getVal = (keyNames) => {
      for (const k of keyNames) {
        const kLower = k.toLowerCase().trim();
        // 1. Exact match
        for (const realKey in match) {
          const rkLower = realKey.toLowerCase().trim();
          if (rkLower === kLower) {
            const val = match[realKey];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return String(val).trim();
            }
          }
        }
        // 2. Prefix & Substring match (e.g. 'SUMMARY ...', 'REPORTED DATE ...', 'SERVICE NO ...')
        for (const realKey in match) {
          const rkLower = realKey.toLowerCase().trim();
          if (rkLower.startsWith(kLower + ' ') || rkLower.startsWith(kLower + '_') || rkLower.startsWith(kLower + ':') || rkLower.includes(kLower)) {
            const val = match[realKey];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return String(val).trim();
            }
          }
        }
      }
      return '';
    };

    const incident = getVal(['INCIDENT', 'Incident', 'TICKET ID']) || searchedTicket;
    const rawContactPhone = getVal(['CONTACT PHONE', 'Contact Phone', 'CONTACT_PHONE', 'CUSTOMER CATEGORY', 'CP']) || '-';
    const serviceNo = getVal(['SERVICE NO', 'Service No', 'SERVICE_NO', 'SERVICE ID']) || '-';
    const reportedDate = escapeMarkdown(getVal(['REPORTED DATE', 'Reported Date', 'REPORTED_DATE', 'STATUS DATE']) || '-');

    let contactName = getVal(['CUSTOMER NAME', 'Customer Name', 'CUSTOMER_NAME', 'CONTACT NAME', 'Contact Name']) || '-';
    contactName = escapeMarkdown(contactName.toUpperCase());

    let customerType = getVal(['CUSTOMER TYPE', 'Customer Type', 'CUSTOMER_TYPE', 'CUSTOMER SEGMENT', 'Segment', 'SEGMENT']) || '-';
    customerType = escapeMarkdown(customerType.toUpperCase());

    const rawSummary = getVal(['SUMMARY', 'Summary', 'DESCRIPTION', 'Description', 'WORKLOG SUMMARY', 'SYMPTOM']) || '';
    const summary = escapeMarkdown(rawSummary || '-');

    const bookingDate = getVal(['BOOKING DATE', 'Booking Date', 'BOOKING_DATE', 'Booking_Date']);
    const jamManja = getVal(['JAM MANJA', 'Jam Manja', 'JAM_MANJA', 'Jam_Manja']);
    const descAssign = getVal(['DESCRIPTION ASSIGMENT', 'Description Assignment', 'DESCRIPTION_ASSIGNMENT', 'DESCRIPTION ASSIGNMENT', 'Description Assigment']);
    const manjaInfo = parseManjaInfo(bookingDate, jamManja, descAssign, rawSummary);

    let deviceName = getVal(['DEVICE NAME', 'Device Name', 'DEVICE_NAME', 'ODC', 'odc', 'RK INFORMATION']);
    if (!deviceName && rawSummary) {
      const odpMatch = rawSummary.match(/\b(ODP-[A-Za-z0-9\-/_]+(?:\s+[A-Za-z0-9\-/\.]+)?)\b/i);
      if (odpMatch) deviceName = odpMatch[1].toUpperCase();
    }
    if (!deviceName) deviceName = '-';

    // Ekstrak dan bersihkan nomor HP (deduplikasi nomor ganda)
    const phoneList = extractPhoneNumbers(rawContactPhone + ' ' + rawSummary);
    const displayPhone = phoneList.length > 0 ? phoneList.join(' / ') : rawContactPhone;

    let msg = '📌 *DETAIL TIKET GANGGUAN*\n';
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += `🆔 *Incident:* \`${incident}\`\n`;
    msg += `📅 *Reported:* ${reportedDate}\n`;
    msg += `👤 *Customer:* ${contactName}\n`;
    msg += `💎 *Segment:* ${customerType}\n`;
    if (manjaInfo) {
      msg += `⏳ *Tiket Manja:* \`${escapeMarkdown(manjaInfo)}\`\n`;
    }
    msg += `📞 *Contact:* \`${displayPhone}\`\n`;
    msg += `🌐 *Service No:* \`${serviceNo}\`\n`;
    msg += `🔌 *Device Name:* \`${deviceName}\`\n`;
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += '📝 *Summary:*\n';
    msg += summary;

    const buttons = [];
    if (phoneList.length === 1) {
      buttons.push([Markup.button.url('💬 Chat WhatsApp Pelanggan', `https://wa.me/${phoneList[0]}`)]);
    } else if (phoneList.length > 1) {
      phoneList.forEach((phone, idx) => {
        buttons.push([Markup.button.url(`💬 Chat WhatsApp (No ${idx + 1}: ${phone})`, `https://wa.me/${phone}`)]);
      });
    }

    if (buttons.length > 0) {
      await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } else {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[Command Error] /insera:', err.message);
    ctx.reply('❌ Error: ' + err.message);
  }
}

module.exports = handleInseraCommand;
