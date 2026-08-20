const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheetsInstance = null;

// In-Memory Smart Cache (TTL 15 Menit)
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field.trim());
        field = '';
      } else if (char === '\n' || char === '\r') {
        row.push(field.trim());
        field = '';
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          rows.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        field += char;
      }
    }
  }

  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const result = [];

  for (let i = 1; i < rows.length; i++) {
    const vals = rows[i];
    const obj = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (!h) continue;
      const v = vals[j] !== undefined ? vals[j].replace(/^["']|["']$/g, '').trim() : '';
      obj[h] = v;
      if (v !== '') hasData = true;
    }
    if (hasData) result.push(obj);
  }

  return result;
}

async function fetchCsvRows(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch CSV: status ${res.status}`);
  }
  const text = await res.text();
  return parseCSV(text);
}

async function getSheetsClient() {
  if (sheetsInstance) return sheetsInstance;

  let auth = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string'
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/spreadsheets']
      });
    } catch (e) {
      console.warn('[Google Auth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON env var:', e.message);
    }
  } else {
    const possiblePaths = [
      process.env.GOOGLE_CREDENTIALS_PATH,
      path.resolve(process.cwd(), 'credentials.json'),
      path.resolve(__dirname, '../../credentials.json'),
      path.resolve(__dirname, '../../../credentials.json'),
      path.resolve(__dirname, '../credentials.json'),
      path.resolve(__dirname, 'credentials.json')
    ].filter(Boolean);

    let credPath = possiblePaths.find(p => fs.existsSync(p));

    if (credPath) {
      auth = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/spreadsheets']
      });
    }
  }

  if (auth) {
    sheetsInstance = google.sheets({ version: 'v4', auth });
  }
  return sheetsInstance;
}

/**
 * Fetch rows from a Google Sheet tab with In-Memory Cache and fallback
 */
async function getSheetRows(spreadsheetId, sheetName, forceFresh = false) {
  const cacheKey = `${spreadsheetId}_${sheetName}`;
  const now = Date.now();

  if (!forceFresh && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 1. Try Google Sheets API via Service Account if available
  try {
    const sheets = await getSheetsClient();
    if (sheets) {
      const range = `'${sheetName}'!A1:ZZ`;
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const rows = res.data.values;
      if (!rows || rows.length === 0) {
        cache.set(cacheKey, { data: [], timestamp: now });
        return [];
      }

      const headers = rows[0].map(h => String(h ?? '').trim());
      const data = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowObj = {};
        let hasData = false;
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          if (!header) continue;
          const val = row[j] !== undefined ? row[j] : '';
          rowObj[header] = val;
          if (val !== '') hasData = true;
        }
        if (hasData) data.push(rowObj);
      }

      cache.set(cacheKey, { data, timestamp: now });
      return data;
    }
  } catch (apiErr) {
    console.warn(`[Google API Note] Falling back to CSV export for tab "${sheetName}":`, apiErr.message);
  }

  // 2. Graceful Fallback: Fetch via Google Sheets CSV export
  try {
    const csvData = await fetchCsvRows(spreadsheetId, sheetName);
    cache.set(cacheKey, { data: csvData, timestamp: now });
    return csvData;
  } catch (csvErr) {
    console.error(`[Google Sheet Error] Failed to fetch sheet "${sheetName}":`, csvErr.message);
    return [];
  }
}

/**
 * Append row(s) to a Google Sheet tab
 */
async function appendSheetRow(spreadsheetId, sheetName, rowValues) {
  const sheets = await getSheetsClient();
  if (!sheets) {
    throw new Error('Google Sheets API belum terotentikasi. Pastikan Service Account credentials terpasang.');
  }

  const range = `'${sheetName}'!A:C`;
  const res = await sheets.spreadsheets.values.append(
    {
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues]
      }
    },
    {
      timeout: 12000 // 12 Detik Timeout
    }
  );

  // Hapus cache agar pembacaan berikutnya memuat data paling baru
  const cacheKey = `${spreadsheetId}_${sheetName}`;
  cache.delete(cacheKey);

  return res.data;
}

module.exports = {
  getSheetsClient,
  getSheetRows,
  appendSheetRow
};
