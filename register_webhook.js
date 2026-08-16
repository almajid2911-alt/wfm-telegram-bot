require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = '8530881347:AAHipcxNQcd9PSus1PYIJ1i5tuxEROu-2Og';
const WEBHOOK_URL = 'https://wfm-telegram-bot-production.up.railway.app/webhook';

const bot = new Telegraf(token);

async function registerWebhook() {
  try {
    console.log('1. Menghapus webhook lama...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    console.log('   ✅ Webhook lama dihapus.');

    console.log('2. Mendaftarkan webhook baru ke:', WEBHOOK_URL);
    const result = await bot.telegram.setWebhook(WEBHOOK_URL, {
      allowed_updates: ['message', 'callback_query']
    });
    console.log('   ✅ setWebhook result:', result);

    console.log('3. Verifikasi webhook info...');
    const info = await bot.telegram.getWebhookInfo();
    console.log('   ✅ Webhook aktif:');
    console.log('      URL          :', info.url);
    console.log('      Pending Count:', info.pending_update_count);
    console.log('      Last Error   :', info.last_error_message || '-');

    console.log('\n🎉 SELESAI! Bot siap menerima pesan via Webhook!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal:', err.message);
    process.exit(1);
  }
}

registerWebhook();
