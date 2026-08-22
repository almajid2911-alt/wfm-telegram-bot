const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'DATA MASTER WFM';

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

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

async function handleBimaCommand(ctx, rawKeyword) {
  const searchedTicket = (rawKeyword || '').trim().toUpperCase();

  if (!searchedTicket) {
    return ctx.reply('⚠️ Format: <code>/bima &lt;TRACK_ORDER/WO&gt;</code> atau langsung ketik <code>AOi4260703030410498314480</code>', { parse_mode: 'HTML' });
  }

  try {
    const rows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    
    // Find matching track_order or workorder
    const match = rows.find(r => {
      const order = (r.track_order || r['track order'] || r['TRACK ORDER'] || r['SC Order No/Track ID/CSRM No'] || r.Workorder || r.WO || '').toString().trim().toUpperCase();
      return order === searchedTicket || order.includes(searchedTicket) || searchedTicket.includes(order);
    });

    if (!match) {
      return ctx.reply(`⚠️ <b>ORDER TIDAK DITEMUKAN</b>\n━━━━━━━━━━━━━━━━━━\nMaaf, data untuk order/tiket <code>${escapeHtml(searchedTicket)}</code> tidak ditemukan di database Google Sheets.\n\nSilakan periksa kembali nomor yang Anda masukkan.`, { parse_mode: 'HTML' });
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
    const rawContactNumber = getVal(['Contact Number', 'Contact_Number', 'CONTACT NUMBER', 'contact_number', 'CONTACT PHONE', 'Contact Phone']) || '-';
    const odc = getVal(['ODC', 'odc', 'DEVICE NAME', 'device_name', 'ODP', 'odp']) || '-';

    const customerName = (getVal(['Customer Name', 'Customer_Name', 'CUSTOMER NAME', 'customer_name']) || '-').toUpperCase();
    const jenisOrder = (getVal(['jenis order', 'Jenis order', 'Jenis_order', 'JENIS ORDER', 'Segment', 'productname']) || '-').toUpperCase();

    const status = getVal(['Status', 'STATUS', 'status']) || '-';
    const statusMorning = getVal(['status morning', 'STATUS MORNING', 'Status Morning', 'status_morning']) || '';
    const tim = getVal(['tim', 'TIM', 'Tim', 'TIM KAWAN', 'TEKNISI']) || '';
    const cekQc = getVal(['cek qc', 'CEK QC', 'Cek QC', 'cek_qc', 'VALIDASI', 'validasi']) || '';
    const eskalDaman = getVal(['Eskal daman', 'eskal_daman', 'ESKAL DAMAN', 'Eskal Daman', 'eskal daman']) || '';
    const tglManja = getVal(['TGL MANJA', 'Tgl Manja', 'Tgl_Manja', 'tgl_manja', 'MANJA', 'Booking Date', 'Sched Start']) || '';
    const paket = getVal(['PAKET', 'paket', 'Product Name', 'product_name', 'Description', 'description']) || '-';
    const lensa = getVal(['LENSA', 'Lensa', 'lensa']) || '';
    const wecare = getVal(['WECARE', 'Wecare', 'wecare', 'WE CARE', 'We Care']) || '';
    const valins = getVal(['VALINS', 'Valins', 'valins']) || '';
    const snOnt = getVal(['SN ONT', 'Sn Ont', 'sn_ont', 'SN_ONT', 'sn ont', 'SERIAL NUMBER']) || '';
    const catatan = getVal(['Catatan', 'catatan', 'CATATAN', 'Keterangan', 'keterangan']) || '';
    const address = getVal(['Address', 'address', 'ADDRESS', 'Service Address', 'Alamat']) || '-';

    // Ekstrak dan bersihkan nomor HP (deduplikasi nomor ganda)
    const phoneList = extractPhoneNumbers(rawContactNumber);
    const displayPhone = phoneList.length > 0 ? phoneList.join(' / ') : rawContactNumber;

    let msg = '📌 <b>DETAIL ORDER LAYANAN</b>\n';
    msg += '━━━━━━━━━━━━━━━━━━\n';
    msg += `🆔 <b>Track Order:</b> <code>${escapeHtml(trackOrder)}</code>\n`;
    msg += `👤 <b>Customer Name:</b> <b>${escapeHtml(customerName)}</b>\n`;
    msg += `📞 <b>Contact Number:</b> <code>${escapeHtml(displayPhone)}</code>\n`;
    msg += `📦 <b>Jenis Order:</b> <b>${escapeHtml(jenisOrder)}</b>\n`;
    if (status && status !== '-') {
      msg += `📊 <b>Status:</b> <b>${escapeHtml(status)}</b>\n`;
    }
    if (statusMorning && statusMorning !== '-') {
      msg += `🌅 <b>Status Morning:</b> <b>${escapeHtml(statusMorning)}</b>\n`;
    }
    if (tim && tim !== '-') {
      msg += `👷 <b>Tim:</b> <code>${escapeHtml(tim)}</code>\n`;
    }
    if (cekQc && cekQc !== '-') {
      msg += `🔍 <b>Cek QC:</b> ${escapeHtml(cekQc)}\n`;
    }
    if (eskalDaman && eskalDaman !== '-') {
      msg += `⚡ <b>Eskal Daman:</b> ${escapeHtml(eskalDaman)}\n`;
    }
    msg += `🔌 <b>ODC:</b> <code>${escapeHtml(odc)}</code>\n`;
    if (tglManja && tglManja !== '-') {
      msg += `📅 <b>TGL Manja:</b> ${escapeHtml(tglManja)}\n`;
    }
    msg += `🏷️ <b>Paket:</b> ${escapeHtml(paket)}\n`;
    if (lensa && lensa !== '-') {
      msg += `📷 <b>LENSA:</b> <b>${escapeHtml(lensa)}</b>\n`;
    }
    if (wecare && wecare !== '-') {
      msg += `🛡️ <b>WECARE:</b> <b>${escapeHtml(wecare)}</b>\n`;
    }
    if (valins && valins !== '-') {
      msg += `📋 <b>VALINS:</b> <b>${escapeHtml(valins)}</b>\n`;
    }
    if (snOnt && snOnt !== '-') {
      msg += `🔢 <b>SN ONT:</b> <code>${escapeHtml(snOnt)}</code>\n`;
    }
    if (catatan && catatan !== '-') {
      msg += `📝 <b>Catatan:</b> <i>${escapeHtml(catatan)}</i>\n`;
    }
    msg += `🏠 <b>Address:</b> ${escapeHtml(address)}`;

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
    console.error('[Command Error] /bima:', err.message);
    ctx.reply('❌ Error: ' + escapeHtml(err.message), { parse_mode: 'HTML' });
  }
}

module.exports = handleBimaCommand;
