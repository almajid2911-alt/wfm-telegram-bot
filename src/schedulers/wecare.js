const { getSheetRows } = require('../config/google');
const { broadcastBot, sendMessage } = require('../config/telegram');

const SPREADSHEET_ID = process.env.SPREADSHEET_DATA_WFM_ID || '1m5bgXaDBFAhwKJlLRdPsgf4pJBA0YhFhR6C9bDytm-I';
const SHEET_NAME = 'WECARE';
const TARGET_CHAT_ID = process.env.CHAT_ID_WECARE || '-4945019710';

async function runWecare() {
  console.log('[Scheduler] Running Wecare...');
  try {
    const allItems = await getSheetRows(SPREADSHEET_ID, SHEET_NAME);
    if (!allItems.length) return;

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

    if (Object.keys(openTicketsByTech).length === 0 && Object.keys(openOdpByTech).length === 0 && Object.keys(otherNeedActionMap).length === 0) {
      return;
    }

    let msg = '=================================\n';
    msg += '📊 REKAPITULASI ODP WECARE\n';
    msg += '=================================\n\n';

    if (Object.keys(openTicketsByTech).length > 0) {
      msg += '📂 DAFTAR TIKET STATUS OPEN\n';
      msg += '─────────────────────────\n';
      for (const [techName, odpList] of Object.entries(openTicketsByTech)) {
        odpList.sort((a, b) => a.odp.localeCompare(b.odp, undefined, { numeric: true, sensitivity: 'base' }));
        msg += `👤 ${techName}\n`;
        for (let i = 0; i < odpList.length; i++) {
          const isLast = (i === odpList.length - 1);
          const prefix = isLast ? '  └─' : '  ├─';
          const item = odpList[i];
          const accessIdLabel = item.accessId ? ` (${item.accessId})` : '';
          msg += `${prefix} 📦 ${item.odp}${accessIdLabel}\n`;
        }
        msg += '\n';
      }
    }

    const hasOpenODP = Object.keys(openOdpByTech).length > 0;
    const hasOtherAction = Object.keys(otherNeedActionMap).length > 0;

    if (hasOpenODP || hasOtherAction) {
      msg += '═════════════════════════\n';
      msg += '⚠️ DAFTAR ODP NEED ACTION (AFTER)\n';
      msg += '═════════════════════════\n\n';

      if (hasOpenODP) {
        msg += '🔴 ODP TERBUKA\n';
        msg += '─────────────────────────\n';
        for (const [techName, odpList] of Object.entries(openOdpByTech)) {
          odpList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
          msg += `👤 ${techName}\n`;
          for (let i = 0; i < odpList.length; i++) {
            const isLast = (i === odpList.length - 1);
            const prefix = isLast ? '  └─' : '  ├─';
            msg += `${prefix} 📦 ${odpList[i]}\n`;
          }
          msg += '\n';
        }
      }

      if (hasOtherAction) {
        // Urutkan prioritas: ODP NON COVER duluan, lalu ODP RUSAK, dll
        const order = ['ODP NON COVER', 'ODP RUSAK'];
        const sortedKeys = Object.keys(otherNeedActionMap).sort((a, b) => {
          const idxA = order.indexOf(a) !== -1 ? order.indexOf(a) : 99;
          const idxB = order.indexOf(b) !== -1 ? order.indexOf(b) : 99;
          return idxA - idxB || a.localeCompare(b);
        });

        for (const kondisiName of sortedKeys) {
          const odpList = otherNeedActionMap[kondisiName];
          odpList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
          msg += `🔴 ${kondisiName}\n`;
          msg += '─────────────────────────\n';
          for (let i = 0; i < odpList.length; i++) {
            const isLast = (i === odpList.length - 1);
            const prefix = isLast ? '  └─' : '  ├─';
            msg += `${prefix} 📦 ${odpList[i]}\n`;
          }
          msg += '\n';
        }
      }
    }

    await sendMessage(broadcastBot, TARGET_CHAT_ID, msg.trimEnd(), { parse_mode: undefined });
  } catch (err) {
    console.error('[Scheduler Error] Wecare:', err.message);
  }
}

module.exports = runWecare;
