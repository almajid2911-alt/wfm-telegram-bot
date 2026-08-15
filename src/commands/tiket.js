const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_KAWAN_ID || '1gTlZxWfKlCENvDVEDKS_qHrLqNLBXsFsy0utTv2u_hY';
const SHEET_NAME = 'PANTAU TTR';

function cleanText(val) {
  return (val || '').toString().trim();
}

function getTimeWITA() {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Makassar'
  }).replace('.', ':') + ' WITA';
}

function formatTTR(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '0,00';
  return num.toFixed(2).replace('.', ',');
}

function parseDevice(devName) {
  if (!devName) return '-';
  let clean = devName.replace(/^ODP-/i, '').trim();
  const firstPart = clean.split(' ')[0] || clean;
  const codeOnly = firstPart.split('/')[0] || firstPart;
  return codeOnly;
}

async function handleTiketCommand(ctx, inputRaw) {
  const text = (inputRaw || '').toLowerCase().trim();

  let zones = [];
  let sektorList = [];

  if (text.includes('batulicin')) {
    zones.push('BLC', 'SER');
    sektorList.push('BATULICIN');
  }
  if (text.includes('kotabaru')) {
    zones.push('KPL');
    sektorList.push('KOTABARU');
  }
  if (text.includes('satui')) {
    zones.push('STI', 'PGT', 'KIP');
    sektorList.push('SATUI');
  }

  if (zones.length === 0) {
    return ctx.reply(
      '❌ *Format Salah!*\n\nGunakan:\n`/tiket batulicin`\n`/tiket kotabaru`\n`/tiket satui`\natau gabungan: `/tiket satui, batulicin, kotabaru`',
      { parse_mode: 'Markdown' }
    );
  }

  const sektorName = sektorList.join(', ');

  try {
    const allRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    const rows = allRows.filter(r => {
      const zone = cleanText(r.WORKZONE || r.Workzone || '').toUpperCase();
      return zones.includes(zone);
    });

    if (!rows.length) {
      return ctx.reply(`⚠️ *Tidak ada data Tiket untuk sektor ${sektorName}*`, { parse_mode: 'Markdown' });
    }

    let regulerList = [];
    let gamasList = [];
    let allTiketList = [];

    for (const data of rows) {
      const incident = cleanText(data.INCIDENT || data.Incident);
      const summary = cleanText(data.SUMMARY || data.Summary).toUpperCase();
      const custType = cleanText(data['CUSTOMER TYPE'] || data['Customer Type'] || '').toUpperCase();
      const device = parseDevice(data['DEVICE NAME'] || data['Device Name'] || data['IZIN JANGAN DI HAPUS JIDLAH'] || data['ODC REAL']);
      const ttrFormatted = formatTTR(data.TTR);
      const timName = cleanText(data.TIM || data.Tim || data['TIM KAWAN']) || 'TANPA TIM';

      if (!incident) continue;

      let category = 'REGULER';
      if (summary.includes('GAMAS')) {
        category = 'GAMAS';
      } else if (summary.includes('SQM')) {
        category = 'SQM';
      } else if (summary.includes('UNSPEC')) {
        category = 'UNSPEC';
      }

      const isPriority = custType.includes('DIAMOND') || custType.includes('PLATINUM');

      const itemObj = {
        incident,
        device,
        ttr: ttrFormatted,
        timName,
        category,
        isPriority
      };

      allTiketList.push(itemObj);

      if (category === 'REGULER') {
        regulerList.push(itemObj);
      } else if (category === 'GAMAS') {
        gamasList.push(itemObj);
      }
    }

    const sortByTim = (a, b) => {
      if (a.timName === 'TANPA TIM') return -1;
      if (b.timName === 'TANPA TIM') return 1;
      return a.timName.localeCompare(b.timName) || a.device.localeCompare(b.device);
    };

    let msg = '=================================\n';
    msg += `🎫 *MONITORING TIKET: ${sektorName}*\n`;
    msg += `🕒 _Update: ${getTimeWITA()}_\n`;
    msg += '=================================\n\n';

    msg += '📌 *RINGKASAN TIKET*\n';
    msg += `└─ 📦 Total Tiket : *${allTiketList.length}*\n\n`;

    // 1. TIKET REGULER
    msg += '═════════════════════════\n';
    msg += '🟢 *TIKET REGULER (SORT BY NAMA TIM)*\n';
    msg += '═════════════════════════\n\n';

    if (regulerList.length === 0) {
      msg += '_Tidak ada tiket reguler_\n\n';
    } else {
      regulerList.sort(sortByTim);
      for (let i = 0; i < regulerList.length; i++) {
        const item = regulerList[i];
        const fireEmoji = item.isPriority ? ' 🔥' : '';
        const isLast = (i === regulerList.length - 1);
        const prefix = isLast ? '└─' : '├─';
        msg += `${prefix} \`${item.incident}\` - *${item.device}* - \`${item.ttr}\` - *${item.timName}*${fireEmoji}\n`;
      }
      msg += '\n';
    }

    // 2. TIKET GAMAS
    msg += '═════════════════════════\n';
    msg += '⚠️ *TIKET GAMAS (SORT BY NAMA TIM)*\n';
    msg += '═════════════════════════\n\n';

    if (gamasList.length === 0) {
      msg += '_Tidak ada tiket gamas_\n\n';
    } else {
      gamasList.sort(sortByTim);
      for (let i = 0; i < gamasList.length; i++) {
        const item = gamasList[i];
        const fireEmoji = item.isPriority ? ' 🔥' : '';
        const isLast = (i === gamasList.length - 1);
        const prefix = isLast ? '└─' : '├─';
        msg += `${prefix} \`${item.incident}\` - *${item.device}* - \`${item.ttr}\` - *${item.timName}*${fireEmoji}\n`;
      }
      msg += '\n';
    }

    // 3. ALL TIKET
    msg += '═════════════════════════\n';
    msg += '📊 *ALL TIKET (SORT BY ODC)*\n';
    msg += '═════════════════════════\n\n';

    allTiketList.sort((a, b) => a.device.localeCompare(b.device, undefined, { numeric: true, sensitivity: 'base' }));

    for (let i = 0; i < allTiketList.length; i++) {
      const item = allTiketList[i];
      const fireEmoji = item.isPriority ? ' 🔥' : '';
      const isLast = (i === allTiketList.length - 1);
      const prefix = isLast ? '└─' : '├─';
      msg += `${prefix} \`${item.incident}\` - *${item.device}* - \`${item.ttr}\` - *${item.category}*${fireEmoji}\n`;
    }

    msg += '\n─────────────────────────\n';
    msg += '📌 *KETERANGAN:* 🔥:Diamond/Platinum';

    await ctx.reply(msg.trimEnd(), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Command Error] /tiket:', err.message);
    ctx.reply('❌ Error: ' + err.message);
  }
}

module.exports = handleTiketCommand;
