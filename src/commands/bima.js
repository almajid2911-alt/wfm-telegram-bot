const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'DATA MASTER WFM';

const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.toString().replace(/([*_[\]`])/g, '\\$1');
};

async function handleBimaCommand(ctx, rawKeyword) {
  const searchedTicket = (rawKeyword || '').trim().toUpperCase();

  if (!searchedTicket) {
    return ctx.reply('⚠️ Format: `/bima <TRACK_ORDER/WO>` atau langsung ketik `AOi4260703030410498314480`', { parse_mode: 'Markdown' });
  }

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    
    // Find matching track_order or workorder
    const match = rows.find(r => {
      const order = (r.track_order || r['track order'] || r['TRACK ORDER'] || r['SC Order No/Track ID/CSRM No'] || r.Workorder || r.WO || '').toString().trim().toUpperCase();
      return order === searchedTicket || order.includes(searchedTicket) || searchedTicket.includes(order);
    });

    if (!match) {
      return ctx.reply(`⚠️ *ORDER TIDAK DITEMUKAN*\n━━━━━━━━━━━━━━━━━━\nMaaf, data untuk order/tiket \`${searchedTicket}\` tidak ditemukan di database Google Sheets.\n\nSilakan periksa kembali nomor yang Anda masukkan.`, { parse_mode: 'Markdown' });
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

    const trackOrder = getVal(['track_order', 'track order', 'TRACK ORDER', 'SC Order No/Track ID/CSRM No', 'Workorder', 'WO']) || searchedTicket;
    const contactNumber = getVal(['Contact Number', 'Contact_Number', 'CONTACT NUMBER', 'contact_number', 'CONTACT PHONE', 'Contact Phone']) || '-';
    const odc = getVal(['ODC', 'odc', 'DEVICE NAME', 'device_name', 'ODP', 'odp']) || '-';

    let customerName = getVal(['Customer Name', 'Customer_Name', 'CUSTOMER NAME', 'customer_name']) || '-';
    customerName = customerName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    customerName = escapeMarkdown(customerName);

    let jenisOrder = getVal(['Jenis order', 'Jenis_order', 'JENIS ORDER', 'jenis_order', 'Segment', 'productname']) || '-';
    jenisOrder = escapeMarkdown(jenisOrder.toUpperCase());

    const tglManja = escapeMarkdown(getVal(['TGL MANJA', 'Tgl Manja', 'Tgl_Manja', 'tgl_manja']) || '-');
    const paket = escapeMarkdown(getVal(['PAKET', 'paket', 'Product Name', 'product_name']) || '-');
    const address = escapeMarkdown(getVal(['Address', 'address', 'ADDRESS', 'Service Address', 'Alamat']) || '-');

    let msg = '📌 *DETAIL ORDER LAYANAN*\n';
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += `🆔 *Track Order:* \`${trackOrder}\`\n`;
    msg += `👤 *Customer Name:* ${customerName}\n`;
    msg += `📞 *Contact Number:* \`${contactNumber}\`\n`;
    msg += `📦 *Jenis Order:* ${jenisOrder}\n`;
    msg += `🔌 *ODC:* \`${odc}\`\n`;
    msg += `📅 *TGL Manja:* ${tglManja}\n`;
    msg += `🏷️ *Paket:* ${paket}\n`;
    msg += `🏠 *Address:* ${address}`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Command Error] /bima:', err.message);
    ctx.reply('❌ Error: ' + err.message);
  }
}

module.exports = handleBimaCommand;
