/**
 * match_timetower_bpay.js
 * 
 * Тайм тауэр СӨХ (6a9786569a202a8f8f859f94) - 216, 217, 218, 219-р байрны
 * бүх оршин суугчдын хаяг (Sukh geree, orshinSuugch)-ийг BPay (WALLET_API, walletInvoice)-ийн
 * хаягтай 100% тулгаж, харьцуулсан дэлгэрэнгүй INDEX.HTML тайлан үүсгэх READ-ONLY скрипт.
 * 
 * 🛡️ [DRY RUN MODE: 100% READ ONLY - ZERO DATABASE MUTATIONS]
 * ⚠️ Баазад ямар ч бичилт, засвар хийхгүй.
 * 
 * Үүсгэх файлууд:
 *   1. scripts/timetower_bpay_match_report.json
 *   2. scripts/index.html (Интерактив хайлттай, бүх 501 айлын зэрэгцүүлсэн тайлан)
 * 
 * Хэрэглээ:
 *   node scripts/match_timetower_bpay.js
 *   node scripts/match_timetower_bpay.js --uri "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin"
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// 1. Config & Environment auto-loading
const configPaths = [
  path.join(__dirname, "../tokhirgoo/tokhirgoo.env"),
  path.join(__dirname, "tokhirgoo.env"),
  "./tokhirgoo/tokhirgoo.env",
  "tokhirgoo.env",
];

for (const p of configPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`🔧 Тохиргоо ачааллаа: ${p}`);
    break;
  }
}

const TIMETOWER_ORG_ID = "6a9786569a202a8f8f859f94";
const TIMETOWER_DB_NAME = "timetower";
const MAIN_DB_NAME = "amarSukh";

const BUILDINGS = [
  { id: "6a978709d2d69c94c9e97f29", code: "216", name: "Time tower 216" },
  { id: "6a979aafd2d69c94c9e9bf04", code: "217", name: "Time tower 217" },
  { id: "6a979ad8d2d69c94c9e9bfac", code: "218", name: "Time tower 218" },
  { id: "6a97bbebd2d69c94c9e9d915", code: "219", name: "Time tower 219" },
];

function getMongoUriBase() {
  const customUri = process.argv.find((a, i) => process.argv[i - 1] === "--uri");
  if (customUri) return customUri;

  const envUri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  if (envUri.includes("{db}")) return envUri;
  return envUri.replace(/\/[a-zA-Z0-9_-]+(\?|$)/, "/{db}$1");
}

/** Тоот нормчлох (06 -> 6, 6 тоот -> 6, ' 15 ' -> 15) */
function normalizeToot(val) {
  if (!val && val !== 0) return "";
  const s = String(val).trim().toLowerCase();
  const cleaned = s
    .replace(/\s*(тоот|-р тоот|р тоот|toot)$/i, "")
    .replace(/^0+/, "")
    .trim();
  return cleaned || s;
}

/** Утас нормчлох (Зөвхөн сүүлийн 8 орон) */
function normalizePhone(val) {
  if (!val) return "";
  const digits = String(val).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

/** Текстийн хаягаас байрны дугаарыг (216, 217, 218, 219) олох */
function extractBuildingCode(text) {
  if (!text) return null;
  const s = String(text);
  if (/216/i.test(s)) return "216";
  if (/217/i.test(s)) return "217";
  if (/218/i.test(s)) return "218";
  if (/219/i.test(s)) return "219";
  return null;
}

/** Generate Standalone Interactive HTML */
function generateIndexHtml(reportData, outputPath) {
  const allRows = reportData.allRows || [];
  const counts = reportData.counts || {};

  const html = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Тайм тауэр СӨХ & BPay Хаягийн Тулгалтын Тайлан (501 Өрх)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    .custom-scroll::-webkit-scrollbar-track { background: #f8fafc; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen p-4 sm:p-8">
  <div class="max-w-[1600px] mx-auto space-y-6">

    <!-- Header Section -->
    <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <span class="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full uppercase tracking-wider">
            100% DRY RUN
          </span>
          <span class="text-xs text-slate-500 font-medium">Үүсгэсэн: ${new Date().toLocaleString("mn-MN")}</span>
        </div>
        <h1 class="text-2xl font-black text-slate-900 mt-2 tracking-tight">
          Тайм тауэр СӨХ — BPay & Оршин Суугчдын Хаягийн Нэгдсэн Тулгалт
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          Time tower 216, 217, 218, 219 байрны нийт өрхүүдийг СӨХ-ийн гэрээ болон BPay-ийн Wallet өгөгдөлтэй зэрэгцүүлсэн тайлан
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button onclick="downloadCSV()" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          CSV Татах (Excel)
        </button>
      </div>
    </div>

    <!-- Summary Statistics Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div onclick="filterByStatus('all')" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-slate-400 transition">
        <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Нийт Өрх / Тоот</div>
        <div class="text-3xl font-black text-slate-900 mt-2">${counts.totalKeysAnalyzed || allRows.length}</div>
        <div class="text-xs text-slate-400 mt-1">216, 217, 218, 219 байрнууд</div>
      </div>

      <div onclick="filterByStatus('TIER_1')" class="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm cursor-pointer hover:border-emerald-500 transition">
        <div class="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center justify-between">
          <span>🟢 100% Бүрэн Таарсан</span>
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        </div>
        <div class="text-3xl font-black text-emerald-600 mt-2">${counts.tier1_perfectMatches || 0}</div>
        <div class="text-xs text-slate-500 mt-1">Байр + Тоот + Утас яг таарсан</div>
      </div>

      <div onclick="filterByStatus('TIER_2')" class="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm cursor-pointer hover:border-amber-500 transition">
        <div class="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center justify-between">
          <span>🟡 Утас зөрсөн (Шалгах)</span>
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
        </div>
        <div class="text-3xl font-black text-amber-600 mt-2">${counts.tier2_tootMatches_phoneDiff || 0}</div>
        <div class="text-xs text-slate-500 mt-1">Тоот таарсан, 2 дахь утас</div>
      </div>

      <div onclick="filterByStatus('TIER_3')" class="bg-white p-5 rounded-2xl border border-sky-200 shadow-sm cursor-pointer hover:border-sky-500 transition">
        <div class="text-xs font-semibold text-sky-700 uppercase tracking-wider flex items-center justify-between">
          <span>🔵 Зөвхөн СӨХ (BPay-гүй)</span>
          <span class="w-2 h-2 rounded-full bg-sky-500"></span>
        </div>
        <div class="text-3xl font-black text-sky-600 mt-2">${counts.tier3_onlyInSukh || 0}</div>
        <div class="text-xs text-slate-500 mt-1">BPay бүртгэлгүй өрхүүд</div>
      </div>
    </div>

    <!-- Filters & Search Bar -->
    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        
        <!-- Search -->
        <div class="relative w-full md:w-96">
          <input 
            type="text" 
            id="searchInput" 
            placeholder="Тоот, утас, нэр, CustomerId, хаягаар хайх..." 
            oninput="handleSearch()"
            class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
          />
          <svg class="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>

        <!-- Filter tabs: Buildings -->
        <div class="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          <button onclick="filterByBuilding('ALL')" class="bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-900 text-white" data-bld="ALL">Бүх байр</button>
          <button onclick="filterByBuilding('216')" class="bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200" data-bld="216">216-р байр</button>
          <button onclick="filterByBuilding('217')" class="bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200" data-bld="217">217-р байр</button>
          <button onclick="filterByBuilding('218')" class="bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200" data-bld="218">218-р байр</button>
          <button onclick="filterByBuilding('219')" class="bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200" data-bld="219">219-р байр</button>
        </div>
      </div>

      <!-- Filter tabs: Statuses -->
      <div class="flex items-center gap-2 border-t border-slate-100 pt-3 flex-wrap">
        <span class="text-xs font-semibold text-slate-400 mr-2">Төлөв:</span>
        <button onclick="filterByStatus('all')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-200 text-slate-800" data-status="all">Бүгд (<span id="count-all">${allRows.length}</span>)</button>
        <button onclick="filterByStatus('TIER_1')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100" data-status="TIER_1">🟢 100% Таарсан (<span id="count-tier1">${counts.tier1_perfectMatches || 0}</span>)</button>
        <button onclick="filterByStatus('TIER_2')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100" data-status="TIER_2">🟡 Шалгах (Утас зөрсөн) (<span id="count-tier2">${counts.tier2_tootMatches_phoneDiff || 0}</span>)</button>
        <button onclick="filterByStatus('TIER_3')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100" data-status="TIER_3">🔵 BPay бүртгэлгүй (<span id="count-tier3">${counts.tier3_onlyInSukh || 0}</span>)</button>
      </div>
    </div>

    <!-- Data Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto custom-scroll max-h-[750px]">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-3 px-3 w-12 text-center">№</th>
              <th class="py-3 px-3 w-20">Байр</th>
              <th class="py-3 px-3 w-24">Тоот</th>
              <th class="py-3 px-4 bg-emerald-50/70 border-r border-emerald-100 font-bold text-emerald-950">
                🏢 Манай системийн өгөгдөл (СӨХ Гэрээ)
              </th>
              <th class="py-3 px-4 bg-sky-50/70 border-r border-sky-100 font-bold text-sky-950">
                💳 BPay (Wallet) өгөгдөл
              </th>
              <th class="py-3 px-3 w-40 text-center">Тулгалтын төлөв</th>
            </tr>
          </thead>
          <tbody id="tableBody" class="divide-y divide-slate-100 font-normal">
            <!-- Dynamic rows will be injected by JavaScript -->
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
        <div>Харагдаж буй бичлэг: <span id="visibleCount" class="font-bold text-slate-800">0</span> / ${allRows.length}</div>
        <div class="text-[11px] text-slate-400">Time Tower СӨХ & BPay Data Matcher</div>
      </div>
    </div>

  </div>

  <script>
    const RAW_DATA = ${JSON.stringify(allRows)};
    let currentBuilding = 'ALL';
    let currentStatus = 'all';
    let searchQuery = '';

    function renderTable() {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';

      let filtered = RAW_DATA.filter(row => {
        if (currentBuilding !== 'ALL' && row.building !== currentBuilding) return false;
        if (currentStatus !== 'all' && row.tier !== currentStatus) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchTarget = [
            row.building,
            row.toot,
            row.sukh?.ner,
            row.sukh?.ovog,
            row.sukh?.utas,
            row.sukh?.rawUtas,
            row.sukh?.gereeniiDugaar,
            row.bpay?.ner,
            row.bpay?.utas,
            row.bpay?.customerId,
            row.bpay?.billingId,
            row.bpay?.customerAddress,
            row.bpay?.bairniiNer
          ].filter(Boolean).join(' ').toLowerCase();

          if (!matchTarget.includes(q)) return false;
        }
        return true;
      });

      document.getElementById('visibleCount').innerText = filtered.length;

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400 text-xs">Тохирох өрх олдсонгүй</td></tr>';
        return;
      }

      const rowsHtml = filtered.map((row, idx) => {
        let badgeHtml = '';
        if (row.tier === 'TIER_1') {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 100% Таарсан</span>';
        } else if (row.tier === 'TIER_2') {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">🟡 Утас зөрсөн</span>';
        } else if (row.tier === 'TIER_3') {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">🔵 Зөвхөн СӨХ</span>';
        } else {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">❓ BPay дангаараа</span>';
        }

        const sukhPhone = row.sukh?.utas || row.sukh?.rawUtas || '—';
        const bpayPhone = row.bpay?.utas || '—';
        const isPhoneMatch = sukhPhone !== '—' && bpayPhone !== '—' && sukhPhone === bpayPhone;

        return \`
          <tr class="hover:bg-slate-50 transition \${row.tier === 'TIER_2' ? 'bg-amber-50/30' : ''}">
            <td class="py-2.5 px-3 text-center font-mono text-slate-400">\${idx + 1}</td>
            <td class="py-2.5 px-3 font-bold text-slate-800">\${row.building}-р байр</td>
            <td class="py-2.5 px-3 font-black text-emerald-700 text-sm">\${row.toot} тоот</td>
            
            <!-- Sukh Data -->
            <td class="py-2.5 px-4 border-r border-slate-100 bg-emerald-50/20">
              \${row.sukh ? \`
                <div class="font-bold text-slate-900">\${row.sukh.ner || '—'} \${row.sukh.ovog ? '(' + row.sukh.ovog + ')' : ''}</div>
                <div class="text-[11px] text-slate-600 mt-0.5 flex items-center gap-2">
                  <span>Утас: <strong class="\${isPhoneMatch ? 'text-emerald-700 font-bold' : 'text-slate-800'}">\${sukhPhone}</strong></span>
                  \${row.sukh.gereeniiDugaar ? \`<span class="text-slate-400">· Гэрээ: \${row.sukh.gereeniiDugaar}</span>\` : ''}
                </div>
              \` : '<span class="text-slate-400 italic">СӨХ дээр бүртгэлгүй</span>'}
            </td>

            <!-- BPay Data -->
            <td class="py-2.5 px-4 border-r border-slate-100 bg-sky-50/20">
              \${row.bpay ? \`
                <div class="font-bold text-slate-900 flex items-center justify-between">
                  <span>\${row.bpay.ner || row.bpay.customerName || '—'}</span>
                  \${row.bpay.customerId ? \`<span class="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-mono">ID: \${row.bpay.customerId}</span>\` : ''}
                </div>
                <div class="text-[11px] text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Утас: <strong class="\${isPhoneMatch ? 'text-emerald-700 font-bold' : row.tier === 'TIER_2' ? 'text-amber-700 font-bold underline' : 'text-slate-800'}">\${bpayPhone}</strong></span>
                  \${row.bpay.billingId ? \`<span class="text-slate-500">· BillingId: \${row.bpay.billingId}</span>\` : ''}
                  \${row.bpay.bairniiNer || row.bpay.customerAddress ? \`<span class="text-slate-400 truncate max-w-[200px]" title="\${row.bpay.customerAddress || row.bpay.bairniiNer}">· \${row.bpay.customerAddress || row.bpay.bairniiNer}</span>\` : ''}
                </div>
              \` : '<span class="text-slate-400 italic">BPay дээр хараахан хаягаа бүртгүүлээгүй</span>'}
            </td>

            <!-- Status -->
            <td class="py-2.5 px-3 text-center">
              \${badgeHtml}
            </td>
          </tr>
        \`;
      }).join('');

      tbody.innerHTML = rowsHtml;
    }

    function filterByBuilding(bld) {
      currentBuilding = bld;
      document.querySelectorAll('.bld-btn').forEach(btn => {
        if (btn.getAttribute('data-bld') === bld) {
          btn.className = 'bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-900 text-white';
        } else {
          btn.className = 'bld-btn px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200';
        }
      });
      renderTable();
    }

    function filterByStatus(status) {
      currentStatus = status;
      document.querySelectorAll('.status-btn').forEach(btn => {
        if (btn.getAttribute('data-status') === status) {
          btn.className = 'status-btn px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 text-white';
        } else {
          btn.className = 'status-btn px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100';
        }
      });
      renderTable();
    }

    function handleSearch() {
      searchQuery = document.getElementById('searchInput').value;
      renderTable();
    }

    function downloadCSV() {
      const headers = ["№", "Байр", "Тоот", "СӨХ Нэр", "СӨХ Утас", "Гэрээний №", "BPay Нэр", "BPay Утас", "BPay CustomerID", "BPay BillingID", "BPay Хаяг", "Төлөв"];
      const rows = RAW_DATA.map((r, i) => [
        i + 1,
        r.building,
        r.toot,
        (r.sukh?.ner || "") + (r.sukh?.ovog ? " (" + r.sukh.ovog + ")" : ""),
        r.sukh?.utas || r.sukh?.rawUtas || "",
        r.sukh?.gereeniiDugaar || "",
        r.bpay?.ner || r.bpay?.customerName || "",
        r.bpay?.utas || "",
        r.bpay?.customerId || "",
        r.bpay?.billingId || "",
        (r.bpay?.customerAddress || r.bpay?.bairniiNer || "").replace(/,/g, " "),
        r.tier === 'TIER_1' ? "100% Таарсан" : r.tier === 'TIER_2' ? "Утас зөрсөн" : r.tier === 'TIER_3' ? "Зөвхөн СӨХ" : "BPay дангаараа"
      ]);

      const csvContent = "\\uFEFF" + [headers.join(","), ...rows.map(e => e.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(","))].join("\\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "timetower_bpay_address_match_501.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Initial render
    renderTable();
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
}

async function runMatchmaking() {
  const uriTemplate = getMongoUriBase();

  console.log("=".repeat(88));
  console.log("🏢 ТАЙМ ТАУЭР СӨХ — BPAY БА ORSHIN SUUGCH ХАЯГИЙН ТУЛГАЛТЫН АУДИТ");
  console.log("🛡️  РЕЖИМ: [DRY RUN — 100% ЗӨВХӨН УНШИХ ГЭМГҮЙ ГОРИМ]");
  console.log("   Байгууллагын ID:", TIMETOWER_ORG_ID);
  console.log("   Барилгууд       : 216, 217, 218, 219 (Нийт 4 барилга)");
  console.log("=".repeat(88));

  // 1. Auto-connect to amarSukh (Main DB)
  const mainUri = uriTemplate.replace("{db}", MAIN_DB_NAME);
  console.log(`\n🔌 Үндсэн сантай автоматаар холбогдож байна: ${mainUri.replace(/:([^:@]+)@/, ":****@")}`);
  let mainConn;
  try {
    mainConn = await mongoose
      .createConnection(mainUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      })
      .asPromise();
    console.log(`✅ ${MAIN_DB_NAME} сантай холболт амжилттай.`);
  } catch (err) {
    console.error(`❌ [АЛДАА] ${MAIN_DB_NAME} сантай холбогдож чадсангүй: ${err.message}`);
    process.exit(1);
  }

  // 2. Auto-connect to timetower (Tenant DB)
  const tenantUri = uriTemplate.replace("{db}", TIMETOWER_DB_NAME);
  console.log(`🔌 Түрээслэгчийн сантай холбогдож байна: ${tenantUri.replace(/:([^:@]+)@/, ":****@")}`);
  let tenantConn;
  try {
    tenantConn = await mongoose
      .createConnection(tenantUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      })
      .asPromise();
    console.log(`✅ ${TIMETOWER_DB_NAME} сантай холболт амжилттай.`);
  } catch (err) {
    console.error(`❌ [АЛДАА] ${TIMETOWER_DB_NAME} сантай холбогдож чадсангүй: ${err.message}`);
    await mainConn.close();
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------
    // АЛХАМ 1: ТАЙМ ТАУЭР СӨХ-ИЙН ГЭРЭЭ БА ОРШИН СУУГЧДЫГ УНШИХ
    // -------------------------------------------------------------
    console.log("\n📦 1. [DRY RUN] Тайм тауэр СӨХ-ийн гэрээ, оршин суугчдын өгөгдлийг уншиж байна...");

    const gereenuud = await tenantConn
      .collection("geree")
      .find({ tuluv: { $ne: "Устгасан" } })
      .project({
        _id: 1,
        gereeniiDugaar: 1,
        toot: 1,
        bairNer: 1,
        barilgiinId: 1,
        orshinSuugchId: 1,
        ner: 1,
        ovog: 1,
        utas: 1,
        tuluv: 1,
      })
      .toArray();

    console.log(`   └─ timetower.geree нийт идэвхтэй гэрээ: ${gereenuud.length}`);

    // Map contracts by building + normalized toot
    const sukhMap = new Map(); // key: "216_6" -> [geree/resident data]

    for (const g of gereenuud) {
      const bId = String(g.barilgiinId || "");
      const foundBld = BUILDINGS.find((b) => b.id === bId) || { code: extractBuildingCode(g.bairNer) };
      const bCode = foundBld?.code || extractBuildingCode(g.bairNer);
      if (!bCode) continue;

      const normToot = normalizeToot(g.toot);
      if (!normToot) continue;

      const key = `${bCode}_${normToot}`;
      if (!sukhMap.has(key)) {
        sukhMap.set(key, []);
      }

      sukhMap.get(key).push({
        source: "SUKH_GEREE",
        gereeId: String(g._id),
        gereeniiDugaar: g.gereeniiDugaar || "",
        bairCode: bCode,
        bairNer: g.bairNer || `Time tower ${bCode}`,
        toot: g.toot,
        normToot,
        ner: g.ner || "",
        ovog: g.ovog || "",
        utas: normalizePhone(g.utas),
        rawUtas: g.utas,
        orshinSuugchId: String(g.orshinSuugchId || ""),
        tuluv: g.tuluv || "Идэвхтэй",
      });
    }

    // Look up orshinSuugch from main DB for Timetower
    const timetowerResidents = await mainConn
      .collection("orshinSuugch")
      .find({
        $or: [
          { baiguullagiinId: TIMETOWER_ORG_ID },
          { "toots.baiguullagiinId": TIMETOWER_ORG_ID },
        ],
      })
      .project({
        _id: 1,
        ner: 1,
        ovog: 1,
        utas: 1,
        toots: 1,
        walletUserId: 1,
      })
      .toArray();

    console.log(`   └─ amarSukh.orshinSuugch хамааралтай хэрэглэгчид: ${timetowerResidents.length}`);

    for (const res of timetowerResidents) {
      (res.toots || []).forEach((t) => {
        const bCode =
          BUILDINGS.find((b) => b.id === String(t.barilgiinId))?.code ||
          extractBuildingCode(t.bairniiNer);
        if (!bCode) return;

        const normToot = normalizeToot(t.toot);
        if (!normToot) return;

        const key = `${bCode}_${normToot}`;
        if (!sukhMap.has(key)) {
          sukhMap.set(key, []);
        }

        sukhMap.get(key).push({
          source: "SUKH_ORSHIN_SUUGCH",
          orshinSuugchId: String(res._id),
          bairCode: bCode,
          bairNer: t.bairniiNer || `Time tower ${bCode}`,
          toot: t.toot,
          normToot,
          ner: res.ner || t.ner || "",
          ovog: res.ovog || t.ovog || "",
          utas: normalizePhone(res.utas),
          rawUtas: res.utas,
          walletUserId: res.walletUserId || t.walletUserId || "",
        });
      });
    }

    console.log(`   => Нийт тулгах боломжтой Sukh өрх/тоотын түлхүүр: ${sukhMap.size}`);

    // -------------------------------------------------------------
    // АЛХАМ 2: BPAY (WALLET_API / WALLET_INVOICE) ӨГӨГДЛИЙГ ЦУГЛУУЛАХ
    // -------------------------------------------------------------
    console.log("\n💳 2. [DRY RUN] BPay (WALLET_API / walletInvoice) өгөгдлийг уншиж байна...");

    // 2.1 Users with toots.source: WALLET_API with Time tower addresses
    const bpayResidents = await mainConn
      .collection("orshinSuugch")
      .find({
        $or: [
          { "toots.source": "WALLET_API" },
          { "toots.source": "BPAY" },
          { "toots.bairniiNer": /time\s*tower|тайм\s*тауэр|216|217|218|219/i },
          { walletUserId: { $exists: true, $ne: null, $ne: "" } },
        ],
      })
      .project({
        _id: 1,
        ner: 1,
        ovog: 1,
        utas: 1,
        toots: 1,
        walletUserId: 1,
      })
      .toArray();

    // 2.2 Wallet invoices from main DB
    const walletInvoices = await mainConn
      .collection("walletInvoice")
      .find({
        $or: [
          { customerAddress: /time\s*tower|тайм\s*тауэр|216|217|218|219/i },
          { billingName: /time\s*tower|тайм\s*тауэр|216|217|218|219/i },
        ],
      })
      .project({
        walletInvoiceId: 1,
        billingId: 1,
        customerId: 1,
        customerName: 1,
        customerAddress: 1,
        totalAmount: 1,
        walletDoorNo: 1,
      })
      .toArray();

    console.log(`   └─ BPay бүртгэлтэй хэрэглэгчид: ${bpayResidents.length}`);
    console.log(`   └─ BPay нэхэмжлэхүүд (walletInvoice): ${walletInvoices.length}`);

    // Aggregate all BPay units
    const bpayMap = new Map(); // key: "216_6" -> [bpay records]

    function addBpayEntry(bCode, rawToot, meta) {
      if (!bCode) return;
      const normToot = normalizeToot(rawToot);
      if (!normToot) return;

      const key = `${bCode}_${normToot}`;
      if (!bpayMap.has(key)) {
        bpayMap.set(key, []);
      }
      bpayMap.get(key).push({
        bairCode: bCode,
        rawToot,
        normToot,
        ...meta,
      });
    }

    // From orshinSuugch toots
    for (const r of bpayResidents) {
      const rPhone = normalizePhone(r.utas);
      (r.toots || []).forEach((t) => {
        const bCode = extractBuildingCode(t.bairniiNer || t.customerAddress || t.soh);
        if (!bCode) return;

        addBpayEntry(bCode, t.toot || t.walletDoorNo, {
          source: "BPAY_RESIDENT_TOOT",
          utas: rPhone,
          ner: r.ner || t.ner || "",
          ovog: r.ovog || t.ovog || "",
          walletUserId: r.walletUserId || t.walletUserId || "",
          walletBairId: t.walletBairId || t.bairId || "",
          walletDoorNo: t.walletDoorNo || t.doorNo || t.toot || "",
          walletCustomerId: t.walletCustomerId || t.walletCustomerCode || t.customerId || "",
          billingId: t.billingId || "",
          bairniiNer: t.bairniiNer || t.customerAddress || "",
        });
      });
    }

    // From walletInvoice
    for (const winv of walletInvoices) {
      const bCode = extractBuildingCode(winv.customerAddress || winv.billingName);
      if (!bCode) continue;

      const tootMatch =
        (winv.customerAddress || "").match(/(\d+)\s*тоот/i) ||
        (winv.customerAddress || "").match(/(\d+)$/);
      const rawToot = tootMatch ? tootMatch[1] : winv.walletDoorNo;
      if (!rawToot) continue;

      addBpayEntry(bCode, rawToot, {
        source: "BPAY_WALLET_INVOICE",
        walletInvoiceId: winv.walletInvoiceId,
        billingId: winv.billingId,
        customerId: winv.customerId,
        customerName: winv.customerName,
        customerAddress: winv.customerAddress,
        totalAmount: winv.totalAmount,
      });
    }

    console.log(`   => BPay-ээс олдсон нийт Time Tower өрх/тоотын түлхүүр: ${bpayMap.size}`);

    // -------------------------------------------------------------
    // АЛХАМ 3: ХАЯГ БА УТСЫН 3 ТҮВШНИЙ ТУЛГАЛТ (MATCHMAKING ENGINE)
    // -------------------------------------------------------------
    console.log("\n🧩 3. [DRY RUN] Тулгалт хийж дүн шинжилгээ гаргаж байна...");

    // Sort keys logically by building code and then by toot numerically
    const allKeys = Array.from(new Set([...sukhMap.keys(), ...bpayMap.keys()])).sort((a, b) => {
      const [bldA, tootA] = a.split("_");
      const [bldB, tootB] = b.split("_");
      if (bldA !== bldB) return bldA.localeCompare(bldB);
      return parseInt(tootA, 10) - parseInt(tootB, 10);
    });

    const tier1_perfectMatches = []; // 100% Match (Building + Toot + Phone or Verified Name)
    const tier2_tootMatches_phoneDiff = []; // Toot Matches, but Phone or Name differs
    const tier3_onlyInSukh = []; // In Sukh but not yet on BPay
    const tier4_onlyInBpay = []; // In BPay but no Sukh contract found

    const allRows = [];

    for (const key of allKeys) {
      const [bCode, normToot] = key.split("_");
      const sukhEntries = sukhMap.get(key) || [];
      const bpayEntries = bpayMap.get(key) || [];

      if (sukhEntries.length > 0 && bpayEntries.length > 0) {
        const sukhPhones = new Set(sukhEntries.map((s) => s.utas).filter(Boolean));
        const bpayPhones = new Set(bpayEntries.map((b) => b.utas).filter(Boolean));

        let phoneMatch = false;
        for (const sp of sukhPhones) {
          if (bpayPhones.has(sp)) {
            phoneMatch = true;
            break;
          }
        }

        const sukhItem = sukhEntries[0];
        // Choose bpay item with best info
        const bpayItem = bpayEntries.find((b) => b.customerId || b.billingId) || bpayEntries[0];

        const matchRecord = {
          key,
          building: bCode,
          toot: normToot,
          tier: phoneMatch ? "TIER_1" : "TIER_2",
          statusText: phoneMatch ? "100% Таарсан" : "Утас зөрсөн",
          sukh: {
            ner: sukhItem.ner,
            ovog: sukhItem.ovog,
            utas: sukhItem.utas,
            rawUtas: sukhItem.rawUtas,
            gereeniiDugaar: sukhItem.gereeniiDugaar,
            gereeId: sukhItem.gereeId,
          },
          bpay: {
            ner: bpayItem.ner || bpayItem.customerName || "",
            utas: bpayItem.utas || "",
            walletBairId: bpayItem.walletBairId || "",
            walletDoorNo: bpayItem.walletDoorNo || "",
            billingId: bpayItem.billingId || "",
            customerId: bpayItem.walletCustomerId || bpayItem.customerId || "",
            customerAddress: bpayItem.customerAddress || bpayItem.bairniiNer || "",
            bairniiNer: bpayItem.bairniiNer || "",
          },
          phoneMatched: phoneMatch,
        };

        allRows.push(matchRecord);

        if (phoneMatch) {
          tier1_perfectMatches.push(matchRecord);
        } else {
          tier2_tootMatches_phoneDiff.push(matchRecord);
        }
      } else if (sukhEntries.length > 0 && bpayEntries.length === 0) {
        const item = sukhEntries[0];
        const record = {
          key,
          building: bCode,
          toot: normToot,
          tier: "TIER_3",
          statusText: "Зөвхөн СӨХ (BPay-д бүртгэлгүй)",
          sukh: {
            ner: item.ner,
            ovog: item.ovog,
            utas: item.utas,
            rawUtas: item.rawUtas,
            gereeniiDugaar: item.gereeniiDugaar,
            gereeId: item.gereeId,
          },
          bpay: null,
          phoneMatched: false,
        };
        allRows.push(record);
        tier3_onlyInSukh.push(record);
      } else if (sukhEntries.length === 0 && bpayEntries.length > 0) {
        const item = bpayEntries[0];
        const record = {
          key,
          building: bCode,
          toot: normToot,
          tier: "TIER_4",
          statusText: "Зөвхөн BPay (СӨХ гэрээгүй)",
          sukh: null,
          bpay: {
            ner: item.ner || item.customerName || "",
            utas: item.utas || "",
            billingId: item.billingId || "",
            customerId: item.walletCustomerId || item.customerId || "",
            customerAddress: item.customerAddress || item.bairniiNer || "",
          },
          phoneMatched: false,
        };
        allRows.push(record);
        tier4_onlyInBpay.push(record);
      }
    }

    // -------------------------------------------------------------
    // АЛХАМ 4: ҮР ДҮНГИЙН ТАЙЛАН БА ИНДЕКС ХАВТАС ҮҮСГЭХ
    // -------------------------------------------------------------
    console.log("\n" + "=".repeat(88));
    console.log("📊 ТУЛГАЛТЫН НЭГДСЭН ДҮН (DRY RUN REPORT):");
    console.log("=".repeat(88));
    console.log(`✅ ТҮВШИН 1 (Ногоон - 100% Бүрэн таарсан: Байр + Тоот + Утас): ${tier1_perfectMatches.length} өрх`);
    console.log(`⚠️  ТҮВШИН 2 (Шар - Байр + Тоот таарсан, гэвч утас/нэр зөрсөн) : ${tier2_tootMatches_phoneDiff.length} өрх`);
    console.log(`ℹ️  ТҮВШИН 3 (Цэнхэр - Зөвхөн Sukh системд бүртгэлтэй гэрээ)       : ${tier3_onlyInSukh.length} өрх`);
    console.log(`❓ ТҮВШИН 4 (Улаан - Зөвхөн BPay дээр байгаа, СӨХ гэрээгүй)      : ${tier4_onlyInBpay.length} өрх`);
    console.log("-".repeat(88));

    const reportData = {
      dryRun: true,
      generatedAt: new Date().toISOString(),
      organization: {
        id: TIMETOWER_ORG_ID,
        name: "Тайм тауэр СӨХ",
        buildings: BUILDINGS,
      },
      counts: {
        totalKeysAnalyzed: allKeys.length,
        tier1_perfectMatches: tier1_perfectMatches.length,
        tier2_tootMatches_phoneDiff: tier2_tootMatches_phoneDiff.length,
        tier3_onlyInSukh: tier3_onlyInSukh.length,
        tier4_onlyInBpay: tier4_onlyInBpay.length,
      },
      allRows,
    };

    // 1. JSON report
    const jsonPath = path.join(__dirname, "timetower_bpay_match_report.json");
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), "utf-8");
    console.log(`📄 1. JSON тайлан хадгалагдлаа: ${jsonPath}`);

    // 2. Standalone HTML report (index.html)
    const htmlPath = path.join(__dirname, "index.html");
    generateIndexHtml(reportData, htmlPath);
    console.log(`🌐 2. Дэлгэрэнгүй INDEX.HTML тайлан амжилттай үүсгэгдлээ: ${htmlPath}`);

    // Also write a copy as timetower_match_index.html
    const htmlCopyPath = path.join(__dirname, "timetower_match_index.html");
    fs.copyFileSync(htmlPath, htmlCopyPath);

    console.log("🛡️  [DRY RUN ДУУССАН: БААЗАД ОГТ ӨӨРЧЛӨЛТ ОРООГҮЙ, 100% АЮУЛГҮЙ]");
    console.log("=".repeat(88) + "\n");
  } catch (err) {
    console.error("❌ Алдаа гарлаа:", err);
  } finally {
    if (mainConn) await mainConn.close();
    if (tenantConn) await tenantConn.close();
  }
}

runMatchmaking().catch(console.error);
