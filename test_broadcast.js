require('dotenv').config();
const { broadcastBot, sendOrReplaceBroadcast } = require('./src/config/telegram');
const runPotensiPs = require('./src/schedulers/potensiPs');

const TARGET_CHAT = process.env.CHAT_IDS_POTENSI || '-1002616721208';

async function testBroadcast() {
  console.log('--- TESTING BOT BROADCAST ---');
  console.log('Target Chat ID:', TARGET_CHAT);
  
  if (!broadcastBot) {
    console.error('❌ Broadcast Bot tidak terinisialisasi!');
    process.exit(1);
  }

  try {
    console.log('1. Mengirim pesan ping test broadcast...');
    const res = await broadcastBot.telegram.sendMessage(
      TARGET_CHAT,
      '🧪 TEST KONEKSI BOT BROADCAST\n\n' +
      'Status: ONLINE & NORMAL\n' +
      `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA\n\n` +
      'Bot Broadcast (@Kangbakso1bot) aktif dan siap menjalankan semua jadwal otomatis! 🚀'
    );
    console.log('✅ Pesan ping terkirim! Message ID:', res.message_id);

    console.log('2. Mencoba trigger scheduler (Potensi PS)...');
    await runPotensiPs();
    console.log('✅ Scheduler Potensi PS selesai dieksekusi!');
    
    console.log('\n🎉 BOT BROADCAST 100% AMAN & NORMAL!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error testing broadcast:', err.message);
    process.exit(1);
  }
}

testBroadcast();
