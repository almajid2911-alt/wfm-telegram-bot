/**
 * Mobile-First Web Mini App for Alker Checklist with Strict Sector Filtering, Search, & OTP Verification
 */

function getSectorGroup(psa) {
  const p = (psa || '').toUpperCase().trim();
  // SATUI: Satui, Kintap, Alkautsar, Pagatan, Angsana, Sebamban
  if (['SATUI', 'KINTAP', 'ALKAUTSAR', 'AL-KAUTSAR', 'PAGATAN', 'ANGSANA', 'SEBAMBAN', 'STI', 'KIP', 'PGT'].some(s => p.includes(s))) {
    return 'SATUI';
  }
  // KOTABARU: Kotabaru, Lontar, Stagen
  if (['KOTABARU', 'KTB', 'LONTAR', 'LTR', 'STAGEN', 'KPL'].some(s => p.includes(s))) {
    return 'KOTABARU';
  }
  // BATULICIN: Batulicin, Serongga, Cantung, Sungai Durian, Tarjun, Bakau, Batu Besar, Mantewe, Banjarmasin
  return 'BATULICIN';
}

function renderAlkerFormHtml(initialTechs = []) {
  const safeJsonTechs = JSON.stringify(initialTechs || []);
  
  // Pre-filter default to BATULICIN
  const defaultSector = 'BATULICIN';
  const defaultFiltered = initialTechs.filter(t => getSectorGroup(t.sektor) === defaultSector);
  const initialOptions = defaultFiltered
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `<option value="${t.name}">[${t.sektor || 'BLC'}] ${t.name}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Form Checklist Alker Teknisi WFM</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              500: '#10b981',
              600: '#059669'
            }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Plus Jakarta Sans', sans-serif; -webkit-tap-highlight-color: transparent; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
  </style>
</head>
<body class="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col antialiased pb-28">

  <!-- HEADER -->
  <header class="sticky top-0 z-40 bg-[#0f172a]/95 backdrop-blur border-b border-slate-800 px-4 py-3.5 shadow-md">
    <div class="max-w-lg mx-auto flex items-center justify-between">
      <div class="flex items-center space-x-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
          <i class="fa-solid fa-toolbox text-base"></i>
        </div>
        <div>
          <h1 class="font-bold text-sm text-white leading-tight">CHECKLIST ALKER TEKNISI</h1>
          <p class="text-[11px] text-slate-400">Monitoring & Kepatuhan Alat Kerja WFM</p>
        </div>
      </div>
      <a href="/dashboard" class="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center space-x-1">
        <i class="fa-solid fa-chart-pie text-emerald-400"></i>
        <span>SPV</span>
      </a>
    </div>
  </header>

  <main class="max-w-lg mx-auto w-full px-4 pt-4 space-y-4 flex-1">

    <!-- STEP 1: PILIH SEKTOR & TEKNISI -->
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3" id="sectionTechPicker">
      <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <span class="text-xs font-bold text-slate-300 flex items-center">
          <i class="fa-solid fa-user-check text-emerald-400 mr-2"></i> 1. Identitas Teknisi
        </span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-bold" id="badgeSektor">SEKTOR BATULICIN</span>
      </div>

      <!-- Sektor Buttons (3 Pilihan Rapi) -->
      <div class="grid grid-cols-3 gap-2" id="sektorButtonGroup">
        <button type="button" onclick="selectSector('BATULICIN')" id="btnSektor_BATULICIN" class="sektor-btn py-2.5 px-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition text-center shadow-sm">
          🏢 Batulicin
        </button>
        <button type="button" onclick="selectSector('SATUI')" id="btnSektor_SATUI" class="sektor-btn py-2.5 px-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/80 transition text-center">
          🏢 Satui
        </button>
        <button type="button" onclick="selectSector('KOTABARU')" id="btnSektor_KOTABARU" class="sektor-btn py-2.5 px-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/80 transition text-center">
          🏢 Kotabaru
        </button>
      </div>

      <!-- Pencarian & Dropdown Nama Teknisi -->
      <div class="space-y-1.5">
        <div class="flex justify-between items-center text-[11px] text-slate-400">
          <span class="font-medium">Pilih Nama Teknisi:</span>
          <span class="text-[10px] text-slate-500" id="techCountLabel">${defaultFiltered.length} Teknisi</span>
        </div>
        
        <!-- Search Filter Input -->
        <input type="text" id="techSearch" oninput="filterTechList()" placeholder="🔍 Cari nama teknisi..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500">
        
        <!-- Dropdown -->
        <select id="techSelect" onchange="onTechSelected()" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium">
          <option value="">-- Pilih Nama Teknisi --</option>
          ${initialOptions}
        </select>
      </div>

      <!-- Detail Card Teknisi Terpilih -->
      <div id="techDetailCard" class="hidden bg-slate-950/60 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs font-mono">
        <div class="flex justify-between text-slate-400">
          <span>NIK:</span>
          <span class="text-white font-bold" id="lblNik">-</span>
        </div>
        <div class="flex justify-between text-slate-400">
          <span>Leader / SPV:</span>
          <span class="text-white" id="lblLeader">-</span>
        </div>
      </div>
    </div>

    <!-- STEP 2: SECURITY VERIFICATION (STRICT TELEGRAM OTP) -->
    <div id="sectionSecurity" class="hidden bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <span class="text-xs font-bold text-slate-300 flex items-center">
          <i class="fa-solid fa-shield-halved text-amber-400 mr-2"></i> 2. Verifikasi OTP Telegram (Anti-Fraud)
        </span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono" id="secBadge">WAJIB OTP</span>
      </div>

      <p class="text-[11px] text-slate-400 leading-relaxed">
        Demi keamanan agar data tidak dimanipulasi orang lain, silakan klik tombol di bawah untuk menerima <strong>Kode OTP 6-Digit</strong> di chat pribadi Telegram Anda:
      </p>

      <div class="space-y-2.5">
        <!-- Request Telegram OTP Button -->
        <button type="button" onclick="requestTelegramOtp()" id="btnRequestOtp" class="w-full py-2.5 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold flex items-center justify-center space-x-2 transition active:scale-[0.98]">
          <i class="fa-brands fa-telegram text-sm"></i>
          <span id="txtRequestOtp">📲 Minta Kode OTP ke Telegram Saya</span>
        </button>

        <div class="flex gap-2">
          <input type="text" inputmode="numeric" maxlength="6" id="inputOtpOrPin" placeholder="Masukkan 6 Digit OTP..." class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 font-mono tracking-widest text-center text-sm font-bold focus:outline-none focus:border-amber-500">
          <button type="button" onclick="verifySecurityInput()" id="btnVerify" class="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition active:scale-95">
            Verifikasi
          </button>
        </div>
        <div id="otpStatusMsg" class="text-[11px] text-slate-400 min-h-[18px]"></div>
      </div>
    </div>

    <!-- QUICK 1-TAP ALL SAFE BUTTON -->
    <div id="sectionQuickAction" class="hidden">
      <button type="button" onclick="setAllToolsNormal()" class="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 active:scale-[0.99] transition flex items-center justify-center space-x-2">
        <i class="fa-solid fa-wand-magic-sparkles text-sm text-amber-300"></i>
        <span>⚡ SETEL SEMUA 18 ALAT: NORMAL & AMAN</span>
      </button>
      <p class="text-[10px] text-slate-400 text-center mt-1.5">Klik tombol di atas jika seluruh alat Anda lengkap & berfungsi baik</p>
    </div>

    <!-- ITEMS CHECKLIST CONTAINER -->
    <div id="itemsContainer" class="space-y-2.5">
      <div class="text-center py-10 text-slate-500 text-xs">
        <i class="fa-solid fa-arrow-up text-lg mb-2 block text-emerald-400/60"></i>
        Silakan pilih nama teknisi Anda di atas untuk memuat daftar alker.
      </div>
    </div>

  </main>

  <!-- FLOATING SUBMIT BAR -->
  <div id="floatingSubmitBar" class="hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f172a]/95 backdrop-blur-lg border-t border-slate-800 p-4 shadow-2xl">
    <div class="max-w-lg mx-auto flex items-center justify-between gap-3">
      <div class="text-xs">
        <div class="text-slate-400">Status Checklist:</div>
        <div class="font-bold text-white font-mono" id="checklistCounter">0/0 Lengkap</div>
      </div>
      <button type="button" onclick="submitChecklist()" id="btnSubmit" class="flex-1 py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed">
        <i class="fa-solid fa-paper-plane text-slate-950"></i>
        <span>SIMPAN & BROADCAST LAPORAN</span>
      </button>
    </div>
  </div>

  <!-- SUCCESS MODAL -->
  <div id="successModal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
      <div class="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 flex items-center justify-center text-3xl mx-auto">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <div>
        <h3 class="text-base font-bold text-white">CHECKLIST BERHASIL TERSIMPAN!</h3>
        <p class="text-xs text-slate-400 mt-1">Status 18 alker telah diperbarui di Google Sheet & di-broadcast ke grup Telegram STATUS ALKER.</p>
      </div>
      <div class="bg-slate-950 rounded-2xl p-3.5 border border-slate-800 text-left text-xs font-mono space-y-1">
        <div class="text-slate-400 flex justify-between"><span>Teknisi:</span><span class="text-white font-bold" id="resTechName">-</span></div>
        <div class="text-slate-400 flex justify-between"><span>Waktu:</span><span class="text-emerald-400" id="resTime">-</span></div>
        <div class="text-slate-400 flex justify-between"><span>Google Sheet:</span><span class="text-emerald-400 font-bold">✅ Tersinkron</span></div>
        <div class="text-slate-400 flex justify-between"><span>Grup Telegram:</span><span class="text-emerald-400 font-bold">📢 Ter-broadcast</span></div>
      </div>
      <button type="button" onclick="closeSuccessModal()" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition">
        Tutup & Selesai
      </button>
    </div>
  </div>

  <script>
    var allTechs = ${safeJsonTechs};
    var currentSector = '${defaultSector}';
    var currentTech = null;
    var currentAlkers = [];
    var isSecurityVerified = false;
    var verifiedAuthToken = '';

    // URL Params parsing
    var urlParams = new URLSearchParams(window.location.search);
    var paramTech = urlParams.get('tech') || urlParams.get('nama') || '';
    var paramNik = urlParams.get('nik') || '';
    var paramSektor = (urlParams.get('sektor') || '').toUpperCase();

    function getSectorGroup(psa) {
      var p = (psa || '').toUpperCase().trim();
      // SATUI: Satui, Kintap, Alkautsar, Pagatan, Angsana, Sebamban
      if (['SATUI', 'KINTAP', 'ALKAUTSAR', 'AL-KAUTSAR', 'PAGATAN', 'ANGSANA', 'SEBAMBAN', 'STI', 'KIP', 'PGT'].some(function(s) { return p.indexOf(s) !== -1; })) {
        return 'SATUI';
      }
      // KOTABARU: Kotabaru, Lontar, Stagen
      if (['KOTABARU', 'KTB', 'LONTAR', 'LTR', 'STAGEN', 'KPL'].some(function(s) { return p.indexOf(s) !== -1; })) {
        return 'KOTABARU';
      }
      // BATULICIN: Batulicin, Serongga, Cantung, Sungai Durian, Tarjun, Bakau, Batu Besar, Mantewe, Banjarmasin
      return 'BATULICIN';
    }

    function initForm() {
      if (paramSektor && ['BATULICIN', 'SATUI', 'KOTABARU'].indexOf(paramSektor) !== -1) {
        selectSector(paramSektor);
      } else {
        selectSector('BATULICIN');
      }

      // Auto select if query params provided
      if (paramNik || paramTech) {
        var found = allTechs.find(function(t) { 
          return (paramNik && t.nik === paramNik) ||
            (paramTech && t.name.toLowerCase().indexOf(paramTech.toLowerCase()) !== -1);
        });
        if (found) {
          var sec = getSectorGroup(found.sektor);
          selectSector(sec);
          document.getElementById('techSelect').value = found.name;
          onTechSelected();
        }
      }
    }

    function selectSector(sektor) {
      currentSector = sektor;
      document.getElementById('badgeSektor').innerText = 'SEKTOR ' + sektor;
      
      // Update button styling
      document.querySelectorAll('.sektor-btn').forEach(function(b) {
        b.className = 'sektor-btn py-2.5 px-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/80 transition text-center';
      });
      var activeBtn = document.getElementById('btnSektor_' + sektor);
      if (activeBtn) {
        activeBtn.className = 'sektor-btn py-2.5 px-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition text-center shadow-sm';
      }

      // Reset search box
      var searchBox = document.getElementById('techSearch');
      if (searchBox) searchBox.value = '';

      filterTechList();
    }

    function filterTechList() {
      var searchInput = document.getElementById('techSearch');
      var searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();
      
      var filtered = allTechs.filter(function(t) { return getSectorGroup(t.sektor) === currentSector; });
      if (searchVal) {
        filtered = filtered.filter(function(t) { 
          return t.name.toLowerCase().indexOf(searchVal) !== -1 || 
            (t.nik && t.nik.indexOf(searchVal) !== -1) ||
            (t.sektor && t.sektor.toLowerCase().indexOf(searchVal) !== -1);
        });
      }

      // Sort alphabetically
      filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });

      var countLabel = document.getElementById('techCountLabel');
      if (countLabel) countLabel.innerText = filtered.length + ' Teknisi';

      var select = document.getElementById('techSelect');
      if (!filtered.length) {
        select.innerHTML = '<option value="">-- Tidak ada teknisi ditemukan --</option>';
        return;
      }

      select.innerHTML = '<option value="">-- Pilih Nama Teknisi (' + filtered.length + ' Orang) --</option>' + 
        filtered.map(function(t) { return '<option value="' + t.name + '">[' + (t.sektor || 'BLC') + '] ' + t.name + '</option>'; }).join('');
    }

    async function onTechSelected() {
      var select = document.getElementById('techSelect');
      var selectedName = select.value;
      isSecurityVerified = false;
      verifiedAuthToken = '';

      if (!selectedName) {
        document.getElementById('techDetailCard').classList.add('hidden');
        document.getElementById('sectionSecurity').classList.add('hidden');
        document.getElementById('sectionQuickAction').classList.add('hidden');
        document.getElementById('floatingSubmitBar').classList.add('hidden');
        document.getElementById('itemsContainer').innerHTML = '<div class="text-center py-10 text-slate-500 text-xs"><i class="fa-solid fa-arrow-up text-lg mb-2 block text-emerald-400/60"></i>Silakan pilih nama teknisi Anda di atas untuk memuat daftar alker.</div>';
        return;
      }

      currentTech = allTechs.find(function(t) { return t.name === selectedName; });
      if (currentTech) {
        document.getElementById('lblNik').innerText = currentTech.nik || '-';
        document.getElementById('lblLeader').innerText = currentTech.leader || '-';
        document.getElementById('techDetailCard').classList.remove('hidden');
        document.getElementById('sectionSecurity').classList.remove('hidden');
        
        // Reset security state
        document.getElementById('secBadge').className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono';
        document.getElementById('secBadge').innerText = 'WAJIB OTP';
        document.getElementById('otpStatusMsg').innerHTML = '';
        document.getElementById('inputOtpOrPin').value = '';
        document.getElementById('inputOtpOrPin').disabled = false;
        document.getElementById('btnVerify').disabled = false;
        document.getElementById('btnRequestOtp').classList.remove('hidden');
      }

      // Fetch Alker list for this tech
      document.getElementById('itemsContainer').innerHTML = '<div class="text-center py-12 text-slate-400 text-xs font-mono"><i class="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-400 mb-2 block"></i>Mengambil 18 data alker milik ' + selectedName + '...</div>';

      try {
        var res = await fetch('/api/alker/tech-items?name=' + encodeURIComponent(selectedName));
        var json = await res.json();
        if (json.success && json.data) {
          currentAlkers = json.data;
          renderAlkerCards();
          document.getElementById('sectionQuickAction').classList.remove('hidden');
          document.getElementById('floatingSubmitBar').classList.remove('hidden');
          updateCounter();
        } else {
          document.getElementById('itemsContainer').innerHTML = '<div class="text-center py-8 text-rose-400 text-xs">⚠️ Gagal memuat data alker: ' + (json.error || 'Data kosong') + '</div>';
        }
      } catch (err) {
        document.getElementById('itemsContainer').innerHTML = '<div class="text-center py-8 text-rose-400 text-xs">❌ Error: ' + err.message + '</div>';
      }
    }

    async function requestTelegramOtp() {
      if (!currentTech) return;
      var btn = document.getElementById('btnRequestOtp');
      var txt = document.getElementById('txtRequestOtp');
      var msg = document.getElementById('otpStatusMsg');

      btn.disabled = true;
      txt.innerText = 'Mengirim OTP ke Telegram...';
      msg.innerHTML = '<span class="text-blue-400"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Menghubungi bot Telegram...</span>';

      try {
        var res = await fetch('/api/alker/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianName: currentTech.name, nik: currentTech.nik })
        });
        var json = await res.json();

        btn.disabled = false;
        txt.innerText = '📲 Minta Ulang Kode OTP';

        if (json.success) {
          msg.innerHTML = '<span class="text-emerald-400 font-semibold"><i class="fa-solid fa-check mr-1"></i> OTP terkirim ke Telegram ' + (json.maskedTelegram || '') + '! Buka bot @jemba12bot</span>';
          document.getElementById('inputOtpOrPin').focus();
        } else {
          msg.innerHTML = '<span class="text-amber-400 font-medium">⚠️ ' + (json.message || 'Telegram ID belum terdaftar di NAKER.') + '</span>';
        }
      } catch (err) {
        btn.disabled = false;
        txt.innerText = '📲 Minta Kode OTP ke Telegram Saya';
        msg.innerHTML = '<span class="text-rose-400">❌ Gagal mengirim: ' + err.message + '</span>';
      }
    }

    async function verifySecurityInput() {
      if (!currentTech) return;
      var input = document.getElementById('inputOtpOrPin').value.trim();
      var msg = document.getElementById('otpStatusMsg');
      var secBadge = document.getElementById('secBadge');
      var btn = document.getElementById('btnVerify');

      if (!input) {
        msg.innerHTML = '<span class="text-rose-400">Silakan masukkan 6 Digit Kode OTP Telegram Anda.</span>';
        return;
      }

      btn.disabled = true;
      btn.innerText = '...';

      try {
        var res = await fetch('/api/alker/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianName: currentTech.name, inputCode: input })
        });
        var json = await res.json();

        btn.disabled = false;
        btn.innerText = 'Verifikasi';

        if (json.success) {
          isSecurityVerified = true;
          verifiedAuthToken = json.token || input;
          secBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-bold';
          secBadge.innerText = '✅ TERVERIFIKASI';
          msg.innerHTML = '<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check mr-1"></i> Identitas ' + currentTech.name + ' Terverifikasi!</span>';
          document.getElementById('inputOtpOrPin').disabled = true;
          document.getElementById('btnVerify').disabled = true;
          document.getElementById('btnRequestOtp').classList.add('hidden');
        } else {
          isSecurityVerified = false;
          msg.innerHTML = '<span class="text-rose-400 font-medium">🚫 ' + (json.message || 'Kode OTP salah / kedaluwarsa. Silakan minta kode baru.') + '</span>';
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Verifikasi';
        msg.innerHTML = '<span class="text-rose-400">❌ Error: ' + err.message + '</span>';
      }
    }

    function renderAlkerCards() {
      var container = document.getElementById('itemsContainer');
      container.innerHTML = currentAlkers.map(function(item, idx) {
        var name = item['Nama Alker'] || item['NAMA ALKER'] || ('Alker #' + (idx+1));
        var sn = item['SN / ID Alker'] || item['ID Alker'] || '';
        var currentSt = (item['Status'] || item['STATUS'] || 'Normal').trim().toLowerCase();
        
        var stVal = 'Normal';
        if (currentSt.indexOf('rusak') !== -1) stVal = 'Rusak';
        else if (currentSt.indexOf('tidak') !== -1 || currentSt.indexOf('hilang') !== -1) stVal = 'Tidak ada';

        return '<div class="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3.5 space-y-3 transition hover:border-slate-700" id="cardItem_' + idx + '">' +
          '<div class="flex items-start justify-between">' +
            '<div class="space-y-0.5">' +
              '<div class="text-xs font-bold text-white flex items-center">' +
                '<span class="w-5 h-5 rounded-md bg-slate-800 text-slate-400 text-[10px] flex items-center justify-center font-mono mr-2">' + (idx+1) + '</span>' +
                '<span>' + name + '</span>' +
              '</div>' +
              (sn ? '<div class="text-[10px] text-slate-500 font-mono pl-7">SN/ID: ' + sn + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800/80 text-xs font-semibold">' +
            '<button type="button" onclick="setItemStatus(' + idx + ', &quot;Normal&quot;)" id="btnSt_' + idx + '_Normal" class="st-btn py-1.5 rounded-lg text-center transition ' + (stVal === 'Normal' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200') + '">🟢 Normal</button>' +
            '<button type="button" onclick="setItemStatus(' + idx + ', &quot;Rusak&quot;)" id="btnSt_' + idx + '_Rusak" class="st-btn py-1.5 rounded-lg text-center transition ' + (stVal === 'Rusak' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200') + '">🔴 Rusak</button>' +
            '<button type="button" onclick="setItemStatus(' + idx + ', &quot;Tidak ada&quot;)" id="btnSt_' + idx + '_Tidak_ada" class="st-btn py-1.5 rounded-lg text-center transition ' + (stVal === 'Tidak ada' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200') + '">❌ Hilang</button>' +
          '</div>' +
          '<div id="notesBox_' + idx + '" class="' + (stVal === 'Normal' ? 'hidden' : '') + ' pt-1 space-y-1">' +
            '<input type="text" id="noteInput_' + idx + '" value="' + (item['Keterangan'] || '') + '" placeholder="Alasan kerusakan / kondisi fisik..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500">' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function setItemStatus(idx, status) {
      if (!currentAlkers[idx]) return;
      currentAlkers[idx].selectedStatus = status;

      var btnNormal = document.getElementById('btnSt_' + idx + '_Normal');
      var btnRusak = document.getElementById('btnSt_' + idx + '_Rusak');
      var btnHilang = document.getElementById('btnSt_' + idx + '_Tidak_ada');
      var notesBox = document.getElementById('notesBox_' + idx);

      [btnNormal, btnRusak, btnHilang].forEach(function(b) {
        if (b) b.className = 'st-btn py-1.5 rounded-lg text-center transition text-slate-400 hover:text-slate-200';
      });

      if (status === 'Normal') {
        btnNormal.className = 'st-btn py-1.5 rounded-lg text-center transition bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm';
        notesBox.classList.add('hidden');
      } else if (status === 'Rusak') {
        btnRusak.className = 'st-btn py-1.5 rounded-lg text-center transition bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm';
        notesBox.classList.remove('hidden');
      } else {
        btnHilang.className = 'st-btn py-1.5 rounded-lg text-center transition bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm';
        notesBox.classList.remove('hidden');
      }

      updateCounter();
    }

    function setAllToolsNormal() {
      currentAlkers.forEach(function(item, idx) {
        setItemStatus(idx, 'Normal');
      });
      var btn = document.querySelector('#sectionQuickAction button');
      var orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check text-white"></i> <span>SEMUA DISIMPULKAN NORMAL!</span>';
      setTimeout(function() { btn.innerHTML = orig; }, 1500);
    }

    function updateCounter() {
      var normal = 0;
      var rusak = 0;
      var missing = 0;

      currentAlkers.forEach(function(item) {
        var st = item.selectedStatus || (item['Status'] || 'Normal').trim();
        if (st === 'Rusak') rusak++;
        else if (st.indexOf('Tidak') !== -1 || st === 'Hilang') missing++;
        else normal++;
      });

      document.getElementById('checklistCounter').innerText = '🟢 ' + normal + ' | 🔴 ' + rusak + ' | ❌ ' + missing;
    }

    async function submitChecklist() {
      if (!currentTech || !currentAlkers.length) {
        alert('Pilih teknisi terlebih dahulu.');
        return;
      }

      if (!isSecurityVerified) {
        alert('⚠️ Verifikasi OTP Diperlukan!\\nSilakan klik tombol Minta Kode OTP ke Telegram Saya dan masukkan 6 digit kodenya sebelum menyimpan.');
        document.getElementById('inputOtpOrPin').focus();
        return;
      }

      var submitBtn = document.getElementById('btnSubmit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-slate-950"></i> <span>Menyimpan ke Sheet & Broadcast...</span>';

      var payload = {
        technicianName: currentTech.name,
        technicianNik: currentTech.nik,
        sektor: currentSector,
        leader: currentTech.leader,
        authToken: verifiedAuthToken,
        items: currentAlkers.map(function(item, idx) {
          var noteInput = document.getElementById('noteInput_' + idx);
          return {
            name: item['Nama Alker'] || item['NAMA ALKER'],
            idAlker: item['SN / ID Alker'] || item['ID Alker'] || '',
            status: item.selectedStatus || item['Status'] || 'Normal',
            keterangan: noteInput ? noteInput.value.trim() : (item.selectedStatus === 'Normal' ? 'BAIK' : '')
          };
        })
      };

      try {
        var res = await fetch('/api/alker/submit-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var json = await res.json();

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-slate-950"></i> <span>SIMPAN & BROADCAST LAPORAN</span>';

        if (json.success) {
          document.getElementById('resTechName').innerText = currentTech.name;
          document.getElementById('resTime').innerText = new Date().toLocaleTimeString('id-ID') + ' WITA';
          document.getElementById('successModal').classList.remove('hidden');
        } else {
          alert('⚠️ Gagal menyimpan: ' + (json.message || 'Error server'));
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-slate-950"></i> <span>SIMPAN & BROADCAST LAPORAN</span>';
        alert('❌ Error koneksi: ' + err.message);
      }
    }

    function closeSuccessModal() {
      document.getElementById('successModal').classList.add('hidden');
      window.location.reload();
    }

    // Auto-init immediately
    initForm();
  </script>
</body>
</html>`;
}

module.exports = {
  renderAlkerFormHtml,
  getSectorGroup
};
