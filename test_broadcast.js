require('dotenv').config();
const { broadcastBot, BROADCAST_CHAT_ID } = require('./src/config/telegram');
const runPotensiPs = require('./src/schedulers/potensiPs');

async function testBroadcast() {
  console.log('--- TESTING BOT BROADCAST ---');
  console.log('Target Chat ID:', BROADCAST_CHAT_ID);
  
  if (!broadcastBot) {
    console.error('❌ Broadcast Bot tidak terinisialisasi!');
    process.exit(1);
  }

  try {
    console.log('1. Mengirim pesan ping test broadcast...');
    const res = await broadcastBot.telegram.sendMessage(
      BROADCAST_CHAT_ID,
      '🧪 *TEST KONEKSI BOT BROADCAST*\n\n' +
      'Status: *ONLINE & STABIL*\n' +
      `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA\n\n` +
      'Semua scheduler berjalan normal di background Railway! 🚀',
      { parse_mode: 'Markdown' }
    );
    console.log('✅ Pesan ping terkirim! Message ID:', res.message_id);

    console.log('2. Mencoba trigger salah satu scheduler (Potensi PS)...');
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
