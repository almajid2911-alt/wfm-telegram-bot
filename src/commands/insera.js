const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'INSERA';

const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.toString().replace(/([*_[\]`])/g, '\\$1');
};

function formatWhatsappNumber(phone) {
  let clean = String(phone || '').replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) clean = '62' + clean.slice(1);
  if (clean.startsWith('8')) clean = '62' + clean;
  return clean.length >= 9 ? clean : null;
}

async function handleInseraCommand(ctx, rawTicket) {
  const searchedTicket = (rawTicket || '').trim().toUpperCase();

  if (!searchedTicket) {
    return ctx.reply('⚠️ Format: `/insera <INCIDENT_ID>` atau langsung ketik `INC49917821`', { parse_mode: 'Markdown' });
  }

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    
    // Find matching incident
    const match = rows.find(r => {
      const inc = (r.INCIDENT || r.Incident || r.incident || '').toString().trim().toUpperCase();
      return inc === searchedTicket || inc.includes(searchedTicket) || searchedTicket.includes(inc);
    });

    if (!match) {
      return ctx.reply(`⚠️ *TIKET TIDAK DITEMUKAN*\n━━━━━━━━━━━━━━━━━━\nMaaf, data untuk tiket \`${searchedTicket}\` tidak ditemukan di database Google Sheets.\n\nSilakan periksa kembali nomor tiket yang Anda masukkan.`, { parse_mode: 'Markdown' });
    }

    const getVal = (keyNames) => {
      for (const k of keyNames) {
        if (match[k] !== undefined && match[k] !== null && match[k] !== '') {
          return match[k].toString().trim();
        }
        for (const realKey in match) {
          if (realKey.toLowerCase() === k.toLowerCase() && match[realKey] !== undefined && match[realKey] !== null && match[realKey] !== '') {
            return match[realKey].toString().trim();
          }
        }
      }
      return '';
    };

    const incident = getVal(['INCIDENT', 'Incident']) || searchedTicket;
    const contactPhone = getVal(['CONTACT PHONE', 'Contact Phone', 'CONTACT_PHONE']) || '-';
    const serviceNo = getVal(['SERVICE NO', 'Service No', 'SERVICE_NO']) || '-';
    const reportedDate = escapeMarkdown(getVal(['REPORTED DATE', 'Reported Date', 'REPORTED_DATE']) || '-');

    let contactName = getVal(['CONTACT NAME', 'Contact Name', 'Customer Name', 'CUSTOMER NAME']) || '-';
    contactName = escapeMarkdown(contactName.toUpperCase());

    let customerType = getVal(['CUSTOMER TYPE', 'Customer Type', 'CUSTOMER_TYPE', 'Segment', 'SEGMENT']) || '-';
    customerType = escapeMarkdown(customerType.toUpperCase());

    const summary = escapeMarkdown(getVal(['SUMMARY', 'Summary', 'DESCRIPTION', 'Description']) || '-');

    let deviceName = getVal(['DEVICE NAME', 'Device Name', 'DEVICE_NAME', 'ODC', 'odc']);
    if (!deviceName && summary) {
      const rawSummary = getVal(['SUMMARY', 'Summary', 'DESCRIPTION']);
      const odpMatch = rawSummary.match(/\b(ODP-[A-Za-z0-9\-/_]+(?:\s+[A-Za-z0-9\-/\.]+)?)\b/i);
      if (odpMatch) deviceName = odpMatch[1].toUpperCase();
    }
    if (!deviceName) deviceName = '-';

    let msg = '📌 *DETAIL TIKET GANGGUAN*\n';
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += `🆔 *Incident:* \`${incident}\`\n`;
    msg += `📅 *Reported:* ${reportedDate}\n`;
    msg += `👤 *Customer:* ${contactName}\n`;
    msg += `💎 *Segment:* ${customerType}\n`;
    msg += `📞 *Contact:* \`${contactPhone}\`\n`;
    msg += `🌐 *Service No:* \`${serviceNo}\`\n`;
    msg += `🔌 *Device Name:* \`${deviceName}\`\n`;
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += '📝 *Summary:*\n';
    msg += summary;

    const waPhone = formatWhatsappNumber(contactPhone);
    const buttons = [];
    if (waPhone) {
      buttons.push([Markup.button.url('💬 Chat WhatsApp Pelanggan', `https://wa.me/${waPhone}`)]);
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
