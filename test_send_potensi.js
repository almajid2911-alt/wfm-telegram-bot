require('dotenv').config();
const { broadcastBot, sendOrReplaceBroadcast } = require('./src/config/telegram');
const runPotensiPs = require('./src/schedulers/potensiPs');

async function test() {
  console.log('1. Menjalankan fungsi live runPotensiPs()...');
  await runPotensiPs();

  console.log('2. Mengirim contoh format Potensi PS ke grup...');
  const sampleMsg = '📊 LIST POTENSI PS\n\n🟡 BELUM DORONG\n\n🏢 PDA\n• WO061702079 | STI|FAISALANGSANA-003 | 2,58 JAM\n\n🏠 INDIHOME\n• WO061531196 | BLC|REZA | 2,35 JAM';
  await sendOrReplaceBroadcast(broadcastBot, '-1002616721208', 'POTENSI_PS', sampleMsg, { parse_mode: undefined });
  console.log('✅ Sukses terkirim ke grup -1002616721208!');
  process.exit(0);
}

test();
