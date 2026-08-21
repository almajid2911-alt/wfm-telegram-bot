/**
 * Mobile-First Web Mini App for Alker Checklist & Updates
 */

function renderAlkerFormHtml() {
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
<body class="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col antialiased pb-24">

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

    <!-- STEP 1: PILIH TEKNISI -->
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3" id="sectionTechPicker">
      <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <span class="text-xs font-bold text-slate-300 flex items-center">
          <i class="fa-solid fa-user-check text-emerald-400 mr-2"></i> Identitas Teknisi
        </span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono" id="badgeSektor">SEKTOR</span>
      </div>

      <!-- Sektor Buttons -->
      <div class="grid grid-cols-3 gap-2" id="sektorButtonGroup">
        <button type="button" onclick="selectSector('BATULICIN')" id="btnSektor_BATULICIN" class="sektor-btn py-2 px-1 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition">
          🏢 Batulicin
        </button>
        <button type="button" onclick="selectSector('SATUI')" id="btnSektor_SATUI" class="sektor-btn py-2 px-1 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/80 transition">
          🏢 Satui
        </button>
        <button type="button" onclick="selectSector('KOTABARU')" id="btnSektor_KOTABARU" class="sektor-btn py-2 px-1 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/80 transition">
          🏢 Kotabaru
        </button>
      </div>

      <!-- Dropdown Nama Teknisi -->
      <div class="space-y-1">
        <label class="text-[11px] text-slate-400 font-medium">Pilih Nama Teknisi:</label>
        <select id="techSelect" onchange="onTechSelected()" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium">
          <option value="">-- Memuat daftar teknisi... --</option>
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
      <button type="button" onclick="submitChecklist()" id="btnSubmit" class="flex-1 py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center space-x-2">
        <i class="fa-solid fa-paper-plane text-slate-950"></i>
        <span>SIMPAN & KIRIM LAPORAN</span>
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
        <h3 class="text-base font-bold text-white">CHECKLIST BERHASIL DISIMPAN!</h3>
        <p class="text-xs text-slate-400 mt-1" id="successDesc">Laporan alker Anda telah disinkronkan ke Google Sheet & Grup Leader.</p>
      </div>
      <div class="bg-slate-950 rounded-2xl p-3.5 border border-slate-800 text-left text-xs font-mono space-y-1">
        <div class="text-slate-400 flex justify-between"><span>Teknisi:</span><span class="text-white font-bold" id="resTechName">-</span></div>
        <div class="text-slate-400 flex justify-between"><span>Waktu:</span><span class="text-emerald-400" id="resTime">-</span></div>
        <div class="text-slate-400 flex justify-between"><span>Ringkasan:</span><span class="text-white" id="resSummary">-</span></div>
      </div>
      <button type="button" onclick="closeSuccessModal()" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition">
        Tutup & Selesai
      </button>
    </div>
  </div>

  <script>
    let allTechs = [];
    let currentSector = 'BATULICIN';
    let currentTech = null;
    let currentAlkers = [];

    // URL Params parsing
    const urlParams = new URLSearchParams(window.location.search);
    const paramTech = urlParams.get('tech') || urlParams.get('nama') || '';
    const paramNik = urlParams.get('nik') || '';
    const paramSektor = (urlParams.get('sektor') || '').toUpperCase();

    async function loadInitialData() {
      try {
        const res = await fetch('/api/alker/techs');
        const json = await res.json();
        if (json.success && json.data) {
          allTechs = json.data;
          
          if (paramSektor && ['BATULICIN', 'SATUI', 'KOTABARU'].includes(paramSektor)) {
            selectSector(paramSektor);
          } else {
            selectSector('BATULICIN');
          }

          // Auto select if query params provided
          if (paramNik || paramTech) {
            const found = allTechs.find(t => 
              (paramNik && t.nik === paramNik) ||
              (paramTech && t.name.toLowerCase().includes(paramTech.toLowerCase()))
            );
            if (found) {
              selectSector(found.sektor);
              document.getElementById('techSelect').value = found.name;
              onTechSelected();
            }
          }
        }
      } catch (err) {
        console.error('Failed loading tech list:', err);
      }
    }

    function selectSector(sektor) {
      currentSector = sektor;
      document.getElementById('badgeSektor').innerText = 'SEKTOR ' + sektor;
      document.querySelectorAll('.sektor-btn').forEach(b => {
        b.className = 'sektor-btn py-2 px-1 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/80 transition';
      });
      const activeBtn = document.getElementById('btnSektor_' + sektor);
      if (activeBtn) {
        activeBtn.className = 'sektor-btn py-2 px-1 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition';
      }

      // Populate Tech Dropdown
      const select = document.getElementById('techSelect');
      const filtered = allTechs.filter(t => (t.sektor || 'BATULICIN').toUpperCase() === sektor);

      if (!filtered.length) {
        select.innerHTML = '<option value="">-- Tidak ada teknisi di sektor ini --</option>';
        return;
      }

      select.innerHTML = '<option value="">-- Pilih Nama Anda --</option>' + 
        filtered.map(t => \`<option value="\${t.name}">\${t.name} (NIK: \${t.nik})</option>\`).join('');
    }

    async function onTechSelected() {
      const select = document.getElementById('techSelect');
      const selectedName = select.value;
      if (!selectedName) {
        document.getElementById('techDetailCard').classList.add('hidden');
        document.getElementById('sectionQuickAction').classList.add('hidden');
        document.getElementById('floatingSubmitBar').classList.add('hidden');
        document.getElementById('itemsContainer').innerHTML = \`
          <div class="text-center py-10 text-slate-500 text-xs">
            <i class="fa-solid fa-arrow-up text-lg mb-2 block text-emerald-400/60"></i>
            Silakan pilih nama teknisi Anda di atas untuk memuat daftar alker.
          </div>
        \`;
        return;
      }

      currentTech = allTechs.find(t => t.name === selectedName);
      if (currentTech) {
        document.getElementById('lblNik').innerText = currentTech.nik || '-';
        document.getElementById('lblLeader').innerText = currentTech.leader || '-';
        document.getElementById('techDetailCard').classList.remove('hidden');
      }

      // Fetch Alker list for this tech
      document.getElementById('itemsContainer').innerHTML = \`
        <div class="text-center py-12 text-slate-400 text-xs font-mono">
          <i class="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-400 mb-2 block"></i>
          Mengambil 18 data alker milik \${selectedName}...
        </div>
      \`;

      try {
        const res = await fetch(\`/api/alker/tech-items?name=\${encodeURIComponent(selectedName)}\`);
        const json = await res.json();
        if (json.success && json.data) {
          currentAlkers = json.data;
          renderAlkerCards();
          document.getElementById('sectionQuickAction').classList.remove('hidden');
          document.getElementById('floatingSubmitBar').classList.remove('hidden');
          updateCounter();
        } else {
          document.getElementById('itemsContainer').innerHTML = \`<div class="text-center py-8 text-rose-400 text-xs">⚠️ Gagal memuat data alker: \${json.error || 'Data kosong'}</div>\`;
        }
      } catch (err) {
        document.getElementById('itemsContainer').innerHTML = \`<div class="text-center py-8 text-rose-400 text-xs">❌ Error: \${err.message}</div>\`;
      }
    }

    function renderAlkerCards() {
      const container = document.getElementById('itemsContainer');
      container.innerHTML = currentAlkers.map((item, idx) => {
        const name = item['Nama Alker'] || item['NAMA ALKER'] || \`Alker #\${idx+1}\`;
        const sn = item['SN / ID Alker'] || item['ID Alker'] || '';
        const currentSt = (item['Status'] || item['STATUS'] || 'Normal').trim().toLowerCase();
        
        let stVal = 'Normal';
        if (currentSt.includes('rusak')) stVal = 'Rusak';
        else if (currentSt.includes('tidak') || currentSt.includes('hilang')) stVal = 'Tidak ada';

        return \`
          <div class="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3.5 space-y-3 transition hover:border-slate-700" id="cardItem_\${idx}">
            <div class="flex items-start justify-between">
              <div class="space-y-0.5">
                <div class="text-xs font-bold text-white flex items-center">
                  <span class="w-5 h-5 rounded-md bg-slate-800 text-slate-400 text-[10px] flex items-center justify-center font-mono mr-2">\${idx+1}</span>
                  <span>\${name}</span>
                </div>
                \${sn ? \`<div class="text-[10px] text-slate-500 font-mono pl-7">SN/ID: \${sn}</div>\` : ''}
              </div>
            </div>

            <!-- Segmented Control Status -->
            <div class="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800/80 text-xs font-semibold">
              <button type="button" onclick="setItemStatus(\${idx}, 'Normal')" id="btnSt_\${idx}_Normal" class="st-btn py-1.5 rounded-lg text-center transition \${stVal === 'Normal' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}">
                🟢 Normal
              </button>
              <button type="button" onclick="setItemStatus(\${idx}, 'Rusak')" id="btnSt_\${idx}_Rusak" class="st-btn py-1.5 rounded-lg text-center transition \${stVal === 'Rusak' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}">
                🔴 Rusak
              </button>
              <button type="button" onclick="setItemStatus(\${idx}, 'Tidak ada')" id="btnSt_\${idx}_Tidak_ada" class="st-btn py-1.5 rounded-lg text-center transition \${stVal === 'Tidak ada' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200'}">
                ❌ Hilang
              </button>
            </div>

            <!-- Catatan Kerusakan / Keterangan (Conditional) -->
            <div id="notesBox_\${idx}" class="\${stVal === 'Normal' ? 'hidden' : ''} pt-1 space-y-1">
              <input type="text" id="noteInput_\${idx}" value="\${item['Keterangan'] || ''}" placeholder="Alasan kerusakan / kondisi fisik..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500">
            </div>
          </div>
        \`;
      }).join('');
    }

    function setItemStatus(idx, status) {
      if (!currentAlkers[idx]) return;
      currentAlkers[idx].selectedStatus = status;

      const card = document.getElementById('cardItem_' + idx);
      const btnNormal = document.getElementById(\`btnSt_\${idx}_Normal\`);
      const btnRusak = document.getElementById(\`btnSt_\${idx}_Rusak\`);
      const btnHilang = document.getElementById(\`btnSt_\${idx}_Tidak_ada\`);
      const notesBox = document.getElementById(\`notesBox_\${idx}\`);

      [btnNormal, btnRusak, btnHilang].forEach(b => {
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
      currentAlkers.forEach((item, idx) => {
        setItemStatus(idx, 'Normal');
      });
      // Small toast feedback
      const btn = document.querySelector('#sectionQuickAction button');
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check text-white"></i> <span>SEMUA DISIMPULKAN NORMAL!</span>';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }

    function updateCounter() {
      const total = currentAlkers.length;
      let normal = 0;
      let rusak = 0;
      let missing = 0;

      currentAlkers.forEach((item, idx) => {
        const st = item.selectedStatus || (item['Status'] || 'Normal').trim();
        if (st === 'Rusak') rusak++;
        else if (st.includes('Tidak') || st === 'Hilang') missing++;
        else normal++;
      });

      document.getElementById('checklistCounter').innerText = \`🟢 \${normal} | 🔴 \${rusak} | ❌ \${missing}\`;
    }

    async function submitChecklist() {
      if (!currentTech || !currentAlkers.length) {
        alert('Pilih teknisi terlebih dahulu.');
        return;
      }

      const submitBtn = document.getElementById('btnSubmit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-slate-950"></i> <span>Menyimpan...</span>';

      const payload = {
        technicianName: currentTech.name,
        technicianNik: currentTech.nik,
        sektor: currentSector,
        leader: currentTech.leader,
        items: currentAlkers.map((item, idx) => {
          const noteInput = document.getElementById('noteInput_' + idx);
          return {
            name: item['Nama Alker'] || item['NAMA ALKER'],
            idAlker: item['SN / ID Alker'] || item['ID Alker'] || '',
            status: item.selectedStatus || item['Status'] || 'Normal',
            keterangan: noteInput ? noteInput.value.trim() : ''
          };
        })
      };

      try {
        const res = await fetch('/api/alker/submit-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-slate-950"></i> <span>SIMPAN & KIRIM LAPORAN</span>';

        if (json.success) {
          document.getElementById('resTechName').innerText = currentTech.name;
          document.getElementById('resTime').innerText = new Date().toLocaleTimeString('id-ID') + ' WITA';
          document.getElementById('resSummary').innerText = \`\${json.normalCount || 0} Normal, \${json.rusakCount || 0} Rusak, \${json.missingCount || 0} Hilang\`;
          document.getElementById('successModal').classList.remove('hidden');
        } else {
          alert('⚠️ Gagal menyimpan: ' + (json.message || 'Error server'));
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-slate-950"></i> <span>SIMPAN & KIRIM LAPORAN</span>';
        alert('❌ Error koneksi: ' + err.message);
      }
    }

    function closeSuccessModal() {
      document.getElementById('successModal').classList.add('hidden');
      window.location.reload();
    }

    window.addEventListener('DOMContentLoaded', loadInitialData);
  </script>
</body>
</html>`;
}

module.exports = {
  renderAlkerFormHtml
};
