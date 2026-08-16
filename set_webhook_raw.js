// Set webhook langsung via Node.js built-in https (tanpa Telegraf)
const https = require('https');

const TOKEN = '8530881347:AAHipcxNQcd9PSus1PYIJ1i5tuxEROu-2Og';
const WEBHOOK = 'https://wfm-telegram-bot-production.up.railway.app/webhook';

const url = `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(WEBHOOK)}&drop_pending_updates=true&allowed_updates=message,callback_query`;

console.log('Setting webhook to:', WEBHOOK);

const req = https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Response:', data);
    process.exit(0);
  });
});

req.setTimeout(15000, () => {
  console.log('TIMEOUT - Telegram tidak bisa dijangkau dari Railway container ini');
  req.destroy();
  process.exit(1);
});

req.on('error', (err) => {
  console.log('ERROR:', err.message);
  process.exit(1);
});
