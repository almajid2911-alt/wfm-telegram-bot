const { Markup } = require('telegraf');
const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'MAPPING';

const mapKodeWilayah = {
  'KIP': 'KINTAP', 'PGT': 'PAGATAN', 'BLC': 'BATULICIN',
  'KPL': 'KOTABARU', 'SER': 'SERONGGA', 'STI': 'SATUI'
};

function cleanText(value) {
  return (value || '').toString().replace(/\s+/g, ' ').trim();
}

function getTimeWITA() {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Makassar'
  }).replace('.', ':') + ' WITA';
}

async function handleMappingCommand(ctx, inputRaw) {
  const text = (inputRaw || '').toLowerCase().trim();

  let zones = [];
  let sektorName = '';

  if (text.includes('batulicin')) {
    zones = ['BLC', 'SER'];
    sektorName = 'BATULICIN';
  } else if (text.includes('kotabaru')) {
    zones = ['KPL'];
    sektorName = 'KOTABARU';
  } else if (text.includes('satui')) {
    zones = ['STI', 'PGT', 'KIP'];
    sektorName = 'SATUI';
  } else {
    // Tampilkan tombol pilihan sektor jika tidak ada argumen
    return ctx.reply(
      '📍 *PILIH SEKTOR MAPPING WO*\n\nSilakan pilih salah satu tombol sektor di bawah:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🏙️ Batulicin', 'map_batulicin'),
            Markup.button.callback('🏝️ Kotabaru', 'map_kotabaru'),
            Markup.button.callback('🌾 Satui', 'map_satui')
          ]
        ])
      }
    );
  }

  try {
    const allRows = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    const rows = allRows.filter(r => {
      const zone = (r.Workzone || r.workzone || r.WORKZONE || '').toString().trim().toUpperCase();
      return zones.includes(zone);
    });

    if (!rows.length) {
      return ctx.reply(`⚠️ *Tidak ada data WO untuk sektor ${sektorName}*`, { parse_mode: 'Markdown' });
    }

    let group = {};
    let stats = { priority: 0, ogp: 0 };

    for (const r of rows) {
      let wilsus = cleanText(r.WILSUS || r.wilsus).toUpperCase();
      const order = cleanText(r.track_order || r['track order'] || r.Workorder || r.order);
      const odcRaw = (r.ODC || r.odc || '').toString().toUpperCase();
      const odc = odcRaw.replace('ODP-', '').trim();
      const manja = cleanText(r.Manja || r.manja).toUpperCase();
      const statusMorning = cleanText(r['status morning'] || r['Status Morning']).toUpperCase();
      const teamName = cleanText(r.team_name || r.team);
      const reportNotes = cleanText(r.report_notes || r['report notes']);

      if (!order || !wilsus || !odc) continue;

      if (wilsus === 'KOTA') {
        for (const [kode, namaAsli] of Object.entries(mapKodeWilayah)) {
          if (odcRaw.includes(kode)) {
            wilsus = namaAsli;
            break;
          }
        }
      }

      let type = 'normal';
      if (manja.includes('LEWAT')) {
        type = 'priority';
        stats.priority++;
      } else if (statusMorning === 'SEDANG DIKERJAKAN') {
        type = 'ogp';
        stats.ogp++;
      }

      if (!group[wilsus]) group[wilsus] = [];
      group[wilsus].push({ order, odc, teamName, hasNote: !!reportNotes, type });
    }

    const totalValid = Object.values(group).reduce((sum, arr) => sum + arr.length, 0);

    let msg = '=================================\n';
    msg += `📊 *MAPPING SEKTOR: ${sektorName}*\n`;
    msg += `🕒 _Update: ${getTimeWITA()}_\n`;
    msg += '=================================\n\n';

    msg += '📋 *RINGKASAN DATA*\n';
    msg += `├─ 📦 Total WO  : *${totalValid}*\n`;
    msg += `├─ 🔴 Prioritas : *${stats.priority}*\n`;
    msg += `└─ 🔥 OGP       : *${stats.ogp}*\n\n`;

    const sortedWilayah = Object.keys(group).sort();

    for (const w of sortedWilayah) {
      msg += `📍 *WILAYAH: ${w}* (${group[w].length} WO)\n`;
      msg += '─────────────────────────\n';

      group[w].sort((a, b) => {
        const p = { priority: 1, ogp: 2, normal: 3 };
        return p[a.type] - p[b.type] || a.odc.localeCompare(b.odc);
      });

      for (let i = 0; i < group[w].length; i++) {
        const item = group[w][i];
        const isLast = (i === group[w].length - 1);
        const prefix = isLast ? '└─' : '├─';

        let icon = '▫️';
        if (item.type === 'priority') icon = '🔴';
        if (item.type === 'ogp') icon = '🔥';

        let line = `${prefix} ${icon} \`${item.order}\` - *${item.odc}*`;
        if (item.hasNote) {
          const teamLabel = item.teamName ? `ex ${item.teamName}` : 'ex kendala';
          line += `\n   └ ⚠️ _${teamLabel}_`;
        }
        msg += `${line}\n`;
      }
      msg += '\n';
    }

    msg += '─────────────────────────\n';
    msg += '📌 *KETERANGAN:* 🔥:OGP | 🔴:Prioritas | ▫️:Antrian';

    await ctx.reply(msg.trimEnd(), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Command Error] /mapping:', err.message);
    ctx.reply('❌ Error: ' + err.message);
  }
}

module.exports = handleMappingCommand;
