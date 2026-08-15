const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheetsInstance = null;

async function getSheetsClient() {
  if (sheetsInstance) return sheetsInstance;

  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/spreadsheets']
    });
  } else {
    const credPath = process.env.GOOGLE_CREDENTIALS_PATH || path.resolve(__dirname, '../../../credentials.json');
    if (fs.existsSync(credPath)) {
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
 * Fetch rows from a Google Sheet tab and convert to array of objects
 */
async function getSheetRows(spreadsheetId, sheetName) {
  const sheets = await getSheetsClient();
  const range = `'${sheetName}'!A1:ZZ`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

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

  return data;
}

module.exports = {
  getSheetsClient,
  getSheetRows
};
