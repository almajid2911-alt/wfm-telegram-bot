require('dotenv').config();
const { broadcastBot, sendMessage } = require('./src/config/telegram');

const runUndispatchInsera = require('./src/schedulers/undispatchInsera');
const runWecare = require('./src/schedulers/wecare');
const runPotensiPs = require('./src/schedulers/potensiPs');
const runRemindFailwa = require('./src/schedulers/failwa');
const runUndispatchReminder = require('./src/schedulers/undispatchReminder');
const runUndispatchXpro = require('./src/schedulers/undispatchXpro');
const runFfg = require('./src/schedulers/ffg');
const runTiketPenting = require('./src/schedulers/tiketPenting');

async function testAllGroupBroadcasts() {
  console.log('=============================================');
  console.log('🚀 TESTING LIVE GROUP BROADCASTS (CEK OMBAK)');
  console.log('=============================================');

  const jobs = [
    { name: '1. Undispatch Insera (Grup -1003190090092)', fn: runUndispatchInsera },
    { name: '2. Wecare (Grup -4945019710)', fn: runWecare },
    { name: '3. Potensi PS (Grup -1002616721208)', fn: runPotensiPs },
    { name: '4. Failwa (Grup -1002616721208)', fn: runRemindFailwa },
    { name: '5. Reminder Undispatch (Grup -4666581891, -1002616721208)', fn: runUndispatchReminder },
    { name: '6. Undispatch XPRO (Grup -4666581891, -1002616721208)', fn: runUndispatchXpro },
    { name: '7. Monitoring FFG (Grup -1002616721208)', fn: runFfg },
    { name: '8. Tiket Penting (Grup -4945019710)', fn: runTiketPenting }
  ];

  for (const job of jobs) {
    console.log(`\n⏳ Mengirim: ${job.name}...`);
    try {
      await job.fn();
      console.log(`✅ Sukses terkirim: ${job.name}`);
    } catch (err) {
      console.error(`❌ Gagal: ${job.name} ->`, err.message);
    }
  }

  console.log('\n🏁 SELESAI! Seluruh broadcast cek ombak telah dikirim ke masing-masing grup.');
  process.exit(0);
}

testAllGroupBroadcasts();
