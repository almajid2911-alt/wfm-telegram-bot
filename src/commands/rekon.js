const { getSheetRows } = require('../config/google');

const SPREADSHEET_REKON_ID = process.env.SPREADSHEET_REKON_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_NAME_REKON = 'REKON';

const SPREADSHEET_VALINS_ID = process.env.SPREADSHEET_VALINS_ID || '1pmg3o3BpZW8XopFP8gItF1FREbJhguPwZ_j3FTbfrAk';
const SHEET_NAME_VALINS = 'VALINS ONT BARU';

async function handleRekonCommand(ctx, targetTimRaw) {
  const targetTim = targetTimRaw.replace(/\s+/g, '').toUpperCase();

  try {
    await ctx.reply(`🔍 *Mencari data REKON untuk: ${targetTimRaw.toUpperCase()}...*`, { parse_mode: 'Markdown' });
    const rows = await getSheetRows(SPREADSHEET_REKON_ID, SHEET_NAME_REKON);

    const now = new Date();
    const monthNamesIndo = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
    const monthNamesEng  = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const currentMonthIndex = now.getMonth();
    const currentMonthIndo = monthNamesIndo[currentMonthIndex];
    const currentMonthEng  = monthNamesEng[currentMonthIndex];

    const filteredRows = [];
    for (const row of rows) {
      const timRaw = (row.tim || row.TIM || '').toString();
      const timClean = timRaw.replace(/\s+/g, '').toUpperCase();
      const isTimMatch = timClean.includes(targetTim);

      const status = (row.Status || row.status || 'COMPWORK').toString().toUpperCase();
      const isStatusMatch = (status === 'COMPWORK' || status === '');

      let isMtd = false;
      const bulanCol = (row.BULAN || row.Bulan || '').toString().toUpperCase();
      if (bulanCol) {
        if (bulanCol.includes(currentMonthIndo) || bulanCol.includes(currentMonthEng)) isMtd = true;
      } else {
        const dateMod = (row['Date Modified'] || row['Status Date'] || row['Date Created'] || '').toString();
        const currentYear = now.getFullYear();
        const currentMonthNum = String(currentMonthIndex + 1).padStart(2, '0');
        if (dateMod.includes(`${currentYear}-${currentMonthNum}`) || dateMod.includes(`/${currentMonthNum}/`)) isMtd = true;
      }

      if (isTimMatch && isStatusMatch && isMtd) filteredRows.push(row);
    }

    if (filteredRows.length === 0) {
      return ctx.reply(`⚠️ *REKON PROVISIONING*\n\n❌ Tidak ditemukan data COMPWORK (MTD) untuk tim: *${targetTimRaw.toUpperCase()}*`, { parse_mode: 'Markdown' });
    }

    let totalNokCount = 0;
    let rowsOutput = '';

    for (const row of filteredRows) {
      const wo = (row.Workorder || row.workorder || row.track_order || '-').toString().trim();
      const lensa = (row.LENSA || '').toString().toUpperCase();
      const wecare = (row.WECARE || '').toString().toUpperCase();
      const valins = (row.VALINS || '').toString().toUpperCase();

      const isQcOk = !lensa.includes('AREA 4');
      const qcBadge = isQcOk ? 'QC:🟢' : 'QC:🔴';

      const isWecareOk = !(wecare.includes('AREA 4') || wecare.includes('NOK'));
      const wecareBadge = isWecareOk ? 'WEC:🟢' : 'WEC:🔴';

      const isValinsOk = !(valins.includes('PSB') || valins.includes('NOK'));
      const valinsBadge = isValinsOk ? 'VAL:🟢' : 'VAL:🔴';

      if (!isQcOk || !isWecareOk || !isValinsOk) totalNokCount++;
      rowsOutput += `\`${wo}\`  ${qcBadge} ${wecareBadge} ${valinsBadge}\n`;
    }

    let outputText = `📊 *REKON: ${targetTimRaw.toUpperCase()} (MTD)*\n`;
    outputText += `📦 Total: \`${filteredRows.length} WO\``;
    outputText += totalNokCount > 0 ? `  (🔴 *${totalNokCount} NOK*)\n` : '  (🟢 *ALL OK*)\n';
    outputText += '───────────────────────────\n';
    outputText += rowsOutput;

    await ctx.reply(outputText.trim(), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Command Error] /rekon:', err.message);
    ctx.reply('❌ Terjadi kesalahan saat membaca data REKON: ' + err.message);
  }
}

async function handleValinsCommand(ctx, targetTimRaw) {
  const targetTim = targetTimRaw.replace(/\s+/g, '').toUpperCase();

  try {
    await ctx.reply(`🔍 *Mencari data VALINS untuk: ${targetTimRaw.toUpperCase()}...*`, { parse_mode: 'Markdown' });
    const rows = await getSheetRows(SPREADSHEET_VALINS_ID, SHEET_NAME_VALINS);

    const filteredRows = [];
    for (const row of rows) {
      const timRaw = (row.tim || row.TIM || '').toString();
      const timClean = timRaw.replace(/\s+/g, '').toUpperCase();
      const isTimMatch = timClean.includes(targetTim);
      const status = (row.Status || row.status || 'COMPWORK').toString().toUpperCase();
      const isStatusMatch = (status === 'COMPWORK' || status === '');

      if (isTimMatch && isStatusMatch) filteredRows.push(row);
    }

    if (filteredRows.length === 0) {
      return ctx.reply(`⚠️ *DATA TIKET (VALINS)*\n\n❌ Tidak ditemukan data COMPWORK untuk tim: *${targetTimRaw.toUpperCase()}*`, { parse_mode: 'Markdown' });
    }

    let rowsOutput = '';
    for (let i = 0; i < filteredRows.length; i++) {
      const row = filteredRows[i];
      const wo = (row['ONU SN'] || row.Workorder || row.workorder || row.WO || '-').toString().trim();
      
      let trackOrder = '-';
      const rowKeys = Object.keys(row);
      const inetKey = rowKeys.find(k => k.toUpperCase().includes('NO INET') || k.toUpperCase().includes('DISCOVERY'));
      if (inetKey && row[inetKey]) {
        trackOrder = String(row[inetKey]).trim();
      } else {
        trackOrder = (row['Access ID'] || row.ACCESS_ID || row.track_order || '-').toString().trim();
      }

      const stpTarget = (row['STP TARGET'] || row.ODP || row.odp || '-').toString().trim();
      const odp = stpTarget.split(' ')[0];

      const isLast = (i === filteredRows.length - 1);
      const prefix = isLast ? '└─' : '├─';
      rowsOutput += `${prefix} \`${wo}\` | \`${trackOrder}\` | \`${odp}\`\n`;
    }

    let outputText = '=================================\n';
    outputText += '📊 *REKON PROVISIONING (VALINS)*\n';
    outputText += '=================================\\n\n';
    outputText += `👤 *${targetTimRaw.toUpperCase()}*\n`;
    outputText += `📦 Total: \`${filteredRows.length} WO (ALL)\`\n`;
    outputText += '─────────────────────────\n';
    outputText += rowsOutput;

    await ctx.reply(outputText.trim(), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[Command Error] /valins:', err.message);
    ctx.reply('❌ Terjadi kesalahan saat membaca data VALINS: ' + err.message);
  }
}

module.exports = {
  handleRekonCommand,
  handleValinsCommand
};
