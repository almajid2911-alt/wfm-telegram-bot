const { getSheetRows } = require('../config/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_ALKER_ID || '1Vk5RsTMxAJDI71SAo_75j5nopV70qxd8C6k8Wrn8HQA';
const SHEET_ALKER = 'DataAlker';
const SHEET_NAKER = 'NAKER';

/**
 * Mengambil dan merangkum seluruh data alker untuk Dashboard Web
 */
async function getDashboardData() {
  const [alkerRows, nakerRows] = await Promise.all([
    getSheetRows(SPREADSHEET_ID, SHEET_ALKER, true),
    getSheetRows(SPREADSHEET_ID, SHEET_NAKER, true)
  ]);

  const techMap = {};
  nakerRows.forEach(n => {
    const name = String(n['NAMA'] || n['Nama'] || '').trim().toUpperCase();
    const nik = String(n['NIK'] || '').trim();
    const psa = String(n['PSA'] || n['Sektor'] || n['SEKTOR'] || '').trim().toUpperCase();
    const leader = String(n['PIC LEADER'] || n['Leader'] || '').trim();
    if (name) {
      techMap[name] = {
        nik,
        sektor: psa || 'BATULICIN',
        leader: leader || '-'
      };
    }
  });

  let totalItems = 0;
  let normalCount = 0;
  let rusakCount = 0;
  let missingCount = 0;
  const sectorCounts = {};
  const alkerTypeCounts = {};
  const items = [];
  const uniqueTechs = new Set();
  const techLastUpdateMap = {};

  const nowMs = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  alkerRows.forEach((row, idx) => {
    const sn = String(row['SN / ID Alker'] || row['ID Alker'] || row['ID'] || '').trim();
    const namaAlker = String(row['Nama Alker'] || row['NAMA ALKER'] || '').trim().toUpperCase();
    const teknisi = String(row['Teknisi'] || row['TEKNISI'] || '').trim();
    const status = String(row['Status'] || row['STATUS'] || 'Normal').trim();
    const keterangan = String(row['Keterangan'] || row['KETERANGAN'] || '').trim();
    const updatedBy = String(row['Updated By'] || '').trim();
    const lastUpdate = String(row['Last Update'] || '').trim();

    if (!teknisi || !namaAlker || namaAlker === 'BAJU') return;

    totalItems++;
    uniqueTechs.add(teknisi.toUpperCase());

    const techInfo = techMap[teknisi.toUpperCase()] || { nik: '-', sektor: 'BATULICIN', leader: '-' };
    const sektor = String(row['Sektor'] || techInfo.sektor || 'BATULICIN').trim().toUpperCase();

    // Track Last Update per Teknisi
    let updateMs = 0;
    if (lastUpdate) {
      const p = Date.parse(lastUpdate);
      if (!isNaN(p)) updateMs = p;
    }
    if (!techLastUpdateMap[teknisi.toUpperCase()] || updateMs > techLastUpdateMap[teknisi.toUpperCase()]) {
      techLastUpdateMap[teknisi.toUpperCase()] = updateMs;
    }

    if (!sectorCounts[sektor]) {
      sectorCounts[sektor] = { normal: 0, rusak: 0, missing: 0, total: 0 };
    }
    sectorCounts[sektor].total++;

    if (!alkerTypeCounts[namaAlker]) {
      alkerTypeCounts[namaAlker] = { normal: 0, rusak: 0, missing: 0, total: 0 };
    }
    alkerTypeCounts[namaAlker].total++;

    const stLower = status.toLowerCase();
    let badgeType = 'normal';

    if (stLower === 'rusak' || stLower.includes('rusak')) {
      rusakCount++;
      sectorCounts[sektor].rusak++;
      alkerTypeCounts[namaAlker].rusak++;
      badgeType = 'rusak';
    } else if (stLower === 'tidak ada' || stLower === 'hilang' || stLower.includes('tidak')) {
      missingCount++;
      sectorCounts[sektor].missing++;
      alkerTypeCounts[namaAlker].missing++;
      badgeType = 'missing';
    } else {
      normalCount++;
      sectorCounts[sektor].normal++;
      alkerTypeCounts[namaAlker].normal++;
      badgeType = 'normal';
    }

    items.push({
      no: idx + 1,
      sn: sn || '-',
      namaAlker,
      teknisi,
      nik: techInfo.nik,
      sektor,
      leader: techInfo.leader,
      status: status || 'Normal',
      badgeType,
      keterangan: keterangan || '-',
      updatedBy: updatedBy || '-',
      lastUpdate: lastUpdate || '-'
    });
  });

  // Hitung Compliance Teknisi
  let complyCount = 0;
  let overdueCount = 0;
  for (const tName of uniqueTechs) {
    const tMs = techLastUpdateMap[tName] || 0;
    const diff = nowMs - tMs;
    if (diff <= SEVEN_DAYS_MS) {
      complyCount++;
    } else if (diff > FOURTEEN_DAYS_MS) {
      overdueCount++;
    }
  }

  const normalPercent = totalItems > 0 ? ((normalCount / totalItems) * 100).toFixed(1) : '0';

  return {
    summary: {
      totalItems,
      normalCount,
      rusakCount,
      missingCount,
      normalPercent,
      totalTeknisi: uniqueTechs.size,
      complyCount,
      overdueCount
    },
    sectorCounts,
    alkerTypeCounts,
    items
  };
}

/**
 * Template HTML Unified Enterprise SPV Portal Dashboard
 */
function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WFM Enterprise Management Portal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f0f9ff',
              500: '#0284c7',
              600: '#0369a1',
              900: '#0c4a6e',
            }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    @media print {
      header, nav, .no-print { display: none !important; }
      body { background: #fff !important; color: #000 !important; }
      table { border-collapse: collapse; width: 100%; font-size: 10px; }
      th, td { border: 1px solid #ddd !important; color: #000 !important; }
    }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col">

  <!-- TOP NAVBAR -->
  <header class="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <i class="fa-solid fa-layer-group text-white text-lg"></i>
        </div>
        <div>
          <h1 class="font-bold text-base sm:text-lg leading-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">WFM ENTERPRISE HUB</h1>
          <p class="text-[11px] text-slate-400">Batulicin, Kotabaru & Satui Operations</p>
        </div>
      </div>

      <!-- Quick Shortcuts -->
      <div class="flex items-center space-x-2">
        <a href="https://scc.internetbisnis.biz.id" target="_blank" class="hidden md:inline-flex px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-xs font-medium text-indigo-300 transition items-center space-x-1.5 border border-indigo-800">
          <i class="fa-solid fa-bolt text-amber-400"></i>
          <span>Buka SCC Bypass</span>
        </a>
        <button onclick="exportToCsv()" class="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-xs font-semibold text-emerald-300 transition flex items-center space-x-1.5 border border-emerald-800">
          <i class="fa-solid fa-file-excel text-emerald-400"></i>
          <span class="hidden sm:inline">Export Excel</span>
        </button>
        <button onclick="window.print()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center space-x-1.5 border border-slate-700">
          <i class="fa-solid fa-print text-slate-400"></i>
          <span class="hidden sm:inline">Cetak</span>
        </button>
        <button onclick="loadData()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center space-x-1.5 border border-slate-700">
          <i class="fa-solid fa-rotate text-blue-400" id="reloadIcon"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- NAVIGATION TABS -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-slate-800/80 overflow-x-auto">
      <button onclick="switchTab('alkerTab')" id="tabBtn-alkerTab" class="px-4 py-2.5 text-xs font-semibold border-b-2 border-blue-500 text-blue-400 flex items-center space-x-2 whitespace-nowrap">
        <i class="fa-solid fa-toolbox"></i>
        <span>Monitoring Alker SPV</span>
      </button>
      <button onclick="switchTab('waTab')" id="tabBtn-waTab" class="px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center space-x-2 whitespace-nowrap">
        <i class="fa-brands fa-whatsapp text-emerald-400"></i>
        <span>WhatsApp AI CS & QR</span>
      </button>
      <button onclick="switchTab('systemTab')" id="tabBtn-systemTab" class="px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center space-x-2 whitespace-nowrap">
        <i class="fa-solid fa-server text-indigo-400"></i>
        <span>Status VPS & Tools</span>
      </button>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">

    <!-- ==================== TAB 1: ALKER MONITORING ==================== -->
    <div id="alkerTab" class="tab-content space-y-6">

      <!-- KPI CARDS -->
      <div class="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Alker</span>
            <i class="fa-solid fa-boxes-stacked text-blue-400"></i>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="text-2xl font-bold text-white" id="statTotalItems">-</div>
            <span class="text-[11px] text-slate-500" id="statTotalTechs">- Naker</span>
          </div>
        </div>

        <div class="bg-slate-900 border border-emerald-950/80 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center justify-between text-emerald-400 text-xs font-medium">
            <span>Kondisi Baik</span>
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="text-2xl font-bold text-emerald-400" id="statNormalPercent">-</div>
            <span class="text-[11px] font-semibold text-emerald-500" id="statNormalCount">- item</span>
          </div>
        </div>

        <div class="bg-slate-900 border border-rose-950/80 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center justify-between text-rose-400 text-xs font-medium">
            <span>Kondisi Rusak</span>
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="text-2xl font-bold text-rose-400" id="statRusakCount">-</div>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-medium">Urgent</span>
          </div>
        </div>

        <div class="bg-slate-900 border border-amber-950/80 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center justify-between text-amber-400 text-xs font-medium">
            <span>Hilang/Tidak Ada</span>
            <i class="fa-solid fa-circle-xmark"></i>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="text-2xl font-bold text-amber-400" id="statMissingCount">-</div>
            <span class="text-[10px] text-amber-500">Pengadaan</span>
          </div>
        </div>

        <div class="bg-slate-900 border border-indigo-950/80 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center justify-between text-indigo-400 text-xs font-medium">
            <span>Update Minggu Ini</span>
            <i class="fa-solid fa-user-check"></i>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="text-2xl font-bold text-indigo-300" id="statComplyCount">-</div>
            <span class="text-[11px] text-indigo-400">Teknisi</span>
          </div>
        </div>

        <div class="bg-gradient-to-br from-rose-950/40 to-slate-900 border border-rose-900/40 rounded-2xl p-4 shadow-sm col-span-2 lg:col-span-1">
          <div class="flex items-center justify-between text-rose-300 text-xs font-medium">
            <span>Overdue > 14 Hari</span>
            <i class="fa-solid fa-user-clock"></i>
          </div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="text-2xl font-bold text-rose-300" id="statOverdueCount">-</div>
            <button onclick="filterIssuesOnly()" class="text-[11px] text-rose-400 hover:underline font-medium">Cek Masalah &rarr;</button>
          </div>
        </div>
      </div>

      <!-- CHARTS SECTION -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 class="text-sm font-semibold text-slate-300 mb-4 flex items-center">
            <i class="fa-solid fa-chart-pie mr-2 text-blue-400"></i> Distribusi Kelayakan Alker
          </h3>
          <div class="h-56 relative flex items-center justify-center">
            <canvas id="statusChart"></canvas>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2">
          <h3 class="text-sm font-semibold text-slate-300 mb-4 flex items-center">
            <i class="fa-solid fa-chart-column mr-2 text-indigo-400"></i> Perbandingan Alker per Sektor
          </h3>
          <div class="h-56">
            <canvas id="sectorChart"></canvas>
          </div>
        </div>
      </div>

      <!-- DATA TABLE & FILTERS -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-white">Daftar Inventaris Alker Seluruh Teknisi</h3>
            <p class="text-xs text-slate-400">Pencarian berdasarkan NIK, Nama Teknisi, Sektor, atau SN</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-500 text-xs"></i>
              <input type="text" id="searchInput" oninput="applyFilters()" placeholder="Cari NIK / Nama / Alat..." class="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-44 sm:w-60">
            </div>
            <select id="sektorFilter" onchange="applyFilters()" class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="ALL">Semua Sektor</option>
              <option value="BATULICIN">Batulicin</option>
              <option value="KOTABARU">Kotabaru</option>
              <option value="SATUI">Satui</option>
              <option value="BANJARMASIN">Banjarmasin</option>
            </select>
            <select id="statusFilter" onchange="applyFilters()" class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
              <option value="ALL">Semua Status</option>
              <option value="NORMAL">🟢 Normal</option>
              <option value="RUSAK">🔴 Rusak</option>
              <option value="MISSING">❌ Hilang / Tidak Ada</option>
              <option value="ISSUES">⚠️ Hanya Bermasalah</option>
            </select>
          </div>
        </div>

        <!-- TABLE CONTAINER -->
        <div class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full text-left text-xs text-slate-300" id="alkerTable">
            <thead class="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th class="py-3 px-3">No</th>
                <th class="py-3 px-3">SN / ID</th>
                <th class="py-3 px-4">Nama Alker</th>
                <th class="py-3 px-4">Nama Teknisi</th>
                <th class="py-3 px-3">NIK</th>
                <th class="py-3 px-3">Sektor</th>
                <th class="py-3 px-3">Status</th>
                <th class="py-3 px-4">Keterangan Kerusakan</th>
                <th class="py-3 px-3 text-right">Last Update</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-normal" id="tableBody">
              <tr>
                <td colspan="9" class="text-center py-8 text-slate-500">
                  <i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat data inventaris...
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span id="filteredCount">Memuat data...</span>
          <span>Google Spreadsheet Real-time Source</span>
        </div>
      </div>

    </div>

    <!-- ==================== TAB 2: WHATSAPP CS CONTROL ==================== -->
    <div id="waTab" class="tab-content hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div class="flex items-center space-x-3">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl border border-emerald-500/30">
              <i class="fa-brands fa-whatsapp"></i>
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">WhatsApp AI Customer Service</h2>
              <p class="text-xs text-slate-400">Asisten Pendaftaran & Lead Generator Otomatis</p>
            </div>
          </div>
          <div class="flex items-center space-x-3">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-2"></span> Active on VPS
            </span>
            <a href="http://wa.103.93.129.213.sslip.io/qr" target="_blank" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20">
              <i class="fa-solid fa-qrcode"></i>
              <span>Buka Layar QR Scanner</span>
            </a>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div class="text-xs text-slate-400 font-medium">Nomor WhatsApp Terhubung</div>
            <div class="text-lg font-bold text-white font-mono">+62 813-5033-0220</div>
            <div class="text-[11px] text-slate-500">Auto follow-up 3 jam aktif</div>
          </div>

          <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div class="text-xs text-slate-400 font-medium">Integrasi Notifikasi Lead</div>
            <div class="text-lg font-bold text-emerald-400">Grup Telegram Sales</div>
            <div class="text-[11px] text-slate-500">Auto send leads & bukti foto KTP/lokasi</div>
          </div>

          <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div class="text-xs text-slate-400 font-medium">Database Leads</div>
            <div class="text-lg font-bold text-blue-400">Google Sheet Leads</div>
            <div class="text-[11px] text-slate-500">Tersinkronisasi real-time</div>
          </div>
        </div>

        <!-- Embedded QR frame view -->
        <div class="mt-6 border border-slate-800 rounded-xl p-4 bg-slate-950/60 text-center">
          <h4 class="text-xs font-semibold text-slate-300 mb-3">Live QR & Session Monitor</h4>
          <iframe src="http://wa.103.93.129.213.sslip.io" class="w-full h-72 rounded-lg border border-slate-800 bg-slate-900"></iframe>
        </div>
      </div>
    </div>

    <!-- ==================== TAB 3: SYSTEM & TOOLS ==================== -->
    <div id="systemTab" class="tab-content hidden space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

        <!-- Tools Shortcuts Card -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 class="text-base font-bold text-white flex items-center">
            <i class="fa-solid fa-rocket mr-2 text-indigo-400"></i> Ekosistem Layanan & Tool Pintas
          </h3>
          <div class="space-y-3">
            <a href="https://scc.internetbisnis.biz.id" target="_blank" class="block p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/60 border border-slate-800 transition">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm">
                    <i class="fa-solid fa-bolt"></i>
                  </div>
                  <div>
                    <div class="text-xs font-semibold text-white">SCC Fast Bypass Web</div>
                    <div class="text-[11px] text-slate-400">Berjalan di Mini PC / Cloudflare Tunnel</div>
                  </div>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-500"></i>
              </div>
            </a>

            <a href="http://103.93.129.213:8000" target="_blank" class="block p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/60 border border-slate-800 transition">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm">
                    <i class="fa-solid fa-sliders"></i>
                  </div>
                  <div>
                    <div class="text-xs font-semibold text-white">Coolify Server Panel</div>
                    <div class="text-[11px] text-slate-400">Kelola 4 bot, log, restart & resource VPS</div>
                  </div>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-500"></i>
              </div>
            </a>
          </div>
        </div>

        <!-- VPS Health & Specs Card -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 class="text-base font-bold text-white flex items-center">
            <i class="fa-solid fa-shield-halved mr-2 text-emerald-400"></i> Status Keamanan & Spesifikasi Server
          </h3>
          <div class="space-y-3 text-xs">
            <div class="flex justify-between items-center py-2 border-b border-slate-800">
              <span class="text-slate-400">Provider & Region</span>
              <span class="font-semibold text-slate-200">Biznet Gio (West Java)</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-800">
              <span class="text-slate-400">Kapasitas RAM</span>
              <span class="font-semibold text-emerald-400">4 GB Fisik + 2 GB Swap (Lega 65%)</span>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-800">
              <span class="text-slate-400">Status Firewall (UFW)</span>
              <span class="font-semibold text-emerald-400">🛡️ Terkunci (Hanya Port 22, 80, 443, 8000)</span>
            </div>
            <div class="flex justify-between items-center py-2">
              <span class="text-slate-400">Auto Maintenance</span>
              <span class="font-semibold text-blue-400">Mingguan (Docker Auto Prune & Backup)</span>
            </div>
          </div>
        </div>

      </div>
    </div>

  </main>

  <!-- FOOTER -->
  <footer class="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
    <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <span>WFM Enterprise Management System &bull; Self-Hosted on Biznet Cloud</span>
      <span class="font-mono text-[11px] text-slate-600">v3.0.0 Enterprise Stable</span>
    </div>
  </footer>

  <script>
    let globalItems = [];
    let statusChartInst = null;
    let sectorChartInst = null;

    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.getElementById(tabId).classList.remove('hidden');

      const tabs = ['alkerTab', 'waTab', 'systemTab'];
      tabs.forEach(t => {
        const btn = document.getElementById('tabBtn-' + t);
        if (btn) {
          if (t === tabId) {
            btn.className = 'px-4 py-2.5 text-xs font-semibold border-b-2 border-blue-500 text-blue-400 flex items-center space-x-2 whitespace-nowrap';
          } else {
            btn.className = 'px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center space-x-2 whitespace-nowrap';
          }
        }
      });
    }

    async function loadData() {
      const icon = document.getElementById('reloadIcon');
      if (icon) icon.classList.add('fa-spin');

      try {
        const res = await fetch('/api/alker');
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Gagal memuat');

        const d = json.data;
        globalItems = d.items;

        document.getElementById('statTotalItems').innerText = d.summary.totalItems;
        document.getElementById('statTotalTechs').innerText = d.summary.totalTeknisi + ' Naker';
        document.getElementById('statNormalPercent').innerText = d.summary.normalPercent + '%';
        document.getElementById('statNormalCount').innerText = d.summary.normalCount + ' item';
        document.getElementById('statRusakCount').innerText = d.summary.rusakCount;
        document.getElementById('statMissingCount').innerText = d.summary.missingCount;
        document.getElementById('statComplyCount').innerText = d.summary.complyCount;
        document.getElementById('statOverdueCount').innerText = d.summary.overdueCount;

        renderCharts(d);
        applyFilters();
      } catch (err) {
        console.warn('Gagal memuat data:', err.message);
      } finally {
        if (icon) icon.classList.remove('fa-spin');
      }
    }

    function renderCharts(d) {
      if (statusChartInst) statusChartInst.destroy();
      const statusCtx = document.getElementById('statusChart').getContext('2d');
      statusChartInst = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: ['Normal', 'Rusak', 'Hilang/Tidak Ada'],
          datasets: [{
            data: [d.summary.normalCount, d.summary.rusakCount, d.summary.missingCount],
            backgroundColor: ['#10b981', '#f43f5e', '#f59e0b'],
            borderColor: '#0f172a',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
        }
      });

      if (sectorChartInst) sectorChartInst.destroy();
      const sectorData = d.sectorCounts;
      const sectorLabels = Object.keys(sectorData);
      const sectorNormals = sectorLabels.map(s => sectorData[s].normal);
      const sectorRusaks = sectorLabels.map(s => sectorData[s].rusak);
      const sectorMissings = sectorLabels.map(s => sectorData[s].missing);

      const sectorCtx = document.getElementById('sectorChart').getContext('2d');
      sectorChartInst = new Chart(sectorCtx, {
        type: 'bar',
        data: {
          labels: sectorLabels,
          datasets: [
            { label: 'Normal', data: sectorNormals, backgroundColor: '#10b981' },
            { label: 'Rusak', data: sectorRusaks, backgroundColor: '#f43f5e' },
            { label: 'Hilang', data: sectorMissings, backgroundColor: '#f59e0b' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8' } },
            y: { stacked: true, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
          },
          plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } } }
        }
      });
    }

    function applyFilters() {
      const search = document.getElementById('searchInput').value.toLowerCase().trim();
      const sektor = document.getElementById('sektorFilter').value;
      const status = document.getElementById('statusFilter').value;
      const tbody = document.getElementById('tableBody');

      let filtered = globalItems.filter(item => {
        const textToSearch = (item.teknisi + ' ' + item.nik + ' ' + item.namaAlker + ' ' + item.sn + ' ' + item.keterangan).toLowerCase();
        let matchSearch = !search || textToSearch.includes(search);
        let matchSektor = (sektor === 'ALL') || (item.sektor === sektor);
        let matchStatus = true;

        if (status === 'NORMAL') matchStatus = (item.badgeType === 'normal');
        else if (status === 'RUSAK') matchStatus = (item.badgeType === 'rusak');
        else if (status === 'MISSING') matchStatus = (item.badgeType === 'missing');
        else if (status === 'ISSUES') matchStatus = (item.badgeType === 'rusak' || item.badgeType === 'missing');

        return matchSearch && matchSektor && matchStatus;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-500">Tidak ada data yang cocok dengan filter.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map((item, index) => \`
          <tr class="hover:bg-slate-800/40 transition">
            <td class="py-2.5 px-3 text-slate-500 font-mono">\${index + 1}</td>
            <td class="py-2.5 px-3 font-mono text-slate-400 text-[11px]">\${item.sn}</td>
            <td class="py-2.5 px-4 font-medium text-white">\${item.namaAlker}</td>
            <td class="py-2.5 px-4 font-semibold text-slate-200">\${item.teknisi}</td>
            <td class="py-2.5 px-3 font-mono text-slate-400 text-[11px]">\${item.nik || '-'}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700">\${item.sektor}</span>
            </td>
            <td class="py-2.5 px-3">
              \${item.badgeType === 'rusak' 
                ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/90 text-rose-400 border border-rose-800"><i class="fa-solid fa-circle-xmark mr-1 text-[9px]"></i> Rusak</span>'
                : item.badgeType === 'missing'
                ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/90 text-amber-400 border border-amber-800"><i class="fa-solid fa-circle-question mr-1 text-[9px]"></i> Tidak Ada</span>'
                : '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/90 text-emerald-400 border border-emerald-800"><i class="fa-solid fa-circle-check mr-1 text-[9px]"></i> Normal</span>'
              }
            </td>
            <td class="py-2.5 px-4 \${item.badgeType === 'rusak' ? 'text-rose-300 font-medium' : (item.badgeType === 'missing' ? 'text-amber-300' : 'text-slate-500')}">
              \${item.keterangan}
            </td>
            <td class="py-2.5 px-3 text-right text-[10px] text-slate-500 font-mono">\${item.lastUpdate}</td>
          </tr>
        \`).join('');
      }

      document.getElementById('filteredCount').innerText = \`Menampilkan \${filtered.length} dari \${globalItems.length} item\`;
    }

    function filterIssuesOnly() {
      document.getElementById('statusFilter').value = 'ISSUES';
      applyFilters();
      window.scrollTo({ top: document.getElementById('alkerTable').offsetTop - 100, behavior: 'smooth' });
    }

    function exportToCsv() {
      if (!globalItems || globalItems.length === 0) {
        alert('Tidak ada data untuk diekspor.');
        return;
      }

      const headers = ['No', 'SN / ID Alker', 'Nama Alker', 'Nama Teknisi', 'NIK', 'Sektor', 'Leader', 'Status', 'Keterangan Kerusakan', 'Last Update'];
      const csvRows = [headers.join(',')];

      globalItems.forEach((it, idx) => {
        const row = [
          idx + 1,
          \`"\${it.sn.replace(/"/g, '""')}"\`,
          \`"\${it.namaAlker.replace(/"/g, '""')}"\`,
          \`"\${it.teknisi.replace(/"/g, '""')}"\`,
          \`"\${(it.nik || '').replace(/"/g, '""')}"\`,
          \`"\${it.sektor.replace(/"/g, '""')}"\`,
          \`"\${(it.leader || '').replace(/"/g, '""')}"\`,
          \`"\${it.status.replace(/"/g, '""')}"\`,
          \`"\${it.keterangan.replace(/"/g, '""')}"\`,
          \`"\${it.lastUpdate.replace(/"/g, '""')}"\`
        ];
        csvRows.push(row.join(','));
      });

      const blob = new Blob([csvRows.join('\\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`Rekap_Alker_WFM_\${new Date().toISOString().slice(0, 10)}.csv\`;
      a.click();
      URL.revokeObjectURL(url);
    }

    loadData();
  </script>
</body>
</html>`;
}

module.exports = {
  getDashboardData,
  renderDashboardHtml
};
