const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheetsInstance = null;

// In-Memory Smart Cache (TTL 15 Menit)
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

async function getSheetsClient() {
  if (sheetsInstance) return sheetsInstance;

  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string'
      ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/spreadsheets']
    });
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
    } else {
      throw new Error('Google credentials not found! Set GOOGLE_SERVICE_ACCOUNT_JSON env var or place credentials.json in project root.');
    }
  }

  sheetsInstance = google.sheets({ version: 'v4', auth });
  return sheetsInstance;
}

/**
 * Fetch rows from a Google Sheet tab with 20s In-Memory Cache
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

  const sheets = await getSheetsClient();
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

module.exports = {
  getSheetsClient,
  getSheetRows
};
