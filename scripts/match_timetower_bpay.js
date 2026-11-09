/**
 * match_timetower_bpay.js
 * 
 * Тайм тауэр СӨХ (6a9786569a202a8f8f859f94) - 216, 217, 218, 219-р байрны
 * бүх оршин суугчдын хаягийг BPay-д автоматаар бүртгэж/холбон, СӨХ ба BPay-ийн
 * төлөгдөөгүй бүх төлөх боломжтой (PAYABLE) нэхэмжлэхүүдийг зэрэгцүүлэн шалгах тайлан үүсгэгч.
 * 
 * ГОРИМУУД:
 *   1. [PREVIEW / AUDIT MODE] (Анхдагч - Аюулгүй, санд бичилт хийхгүй):
 *      node scripts/match_timetower_bpay.js
 *      -> BPay Live API-аас бүх төлөх боломжтой биллүүдийг татаж, тулган index.html үүсгэнэ.
 * 
 *   2. [AUTO-REGISTER MODE] (BPay-д бүртгэлгүй айлуудыг автоматаар бүртгэх):
 *      node scripts/match_timetower_bpay.js --auto-register
 *      -> BPay-д утас + тоотоор бүртгэж, хаягийг холбон, орон сууцны төлөх нэхэмжлэхийг татна.
 * 
 *   3. [TEST SINGLE UNIT] (Зөвхөн 1 айлыг туршиж шалгах):
 *      node scripts/match_timetower_bpay.js --auto-register --bair 216 --toot 2
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

// CLI arguments
const isAutoRegister = process.argv.includes("--auto-register");
const targetBair = process.argv.find((a, i) => process.argv[i - 1] === "--bair");
const targetToot = process.argv.find((a, i) => process.argv[i - 1] === "--toot");
const limitArg = process.argv.find((a, i) => process.argv[i - 1] === "--limit");
const registerLimit = limitArg ? parseInt(limitArg, 10) : Infinity;

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

/** Мөнгөн дүн форматлах */
function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return "0 ₮";
  return Number(num).toLocaleString("mn-MN") + " ₮";
}

/** Байрны дугаарыг (216, 217, 218, 219) олох */
function extractBuildingCodeFromAny(item, knownBairIds = {}) {
  if (!item) return null;

  // 1. Check known walletBairId
  const bId = String(item.walletBairId || item.bairId || "");
  if (bId) {
    for (const [code, ids] of Object.entries(knownBairIds)) {
      if (ids && ids.has && ids.has(bId)) return code;
      if (Array.isArray(ids) && ids.includes(bId)) return code;
    }
  }

  // 2. Check walletCustomerCode (e.g. 2003260216000020 -> 216)
  const custCode = String(item.walletCustomerCode || item.customerCode || item.customerId || "");
  const codeMatch = custCode.match(/2003260?(216|217|218|219)/);
  if (codeMatch) return codeMatch[1];

  // 3. Check barilgiinId
  const barilgiinId = String(item.barilgiinId || "");
  const foundBld = BUILDINGS.find((b) => b.id === barilgiinId);
  if (foundBld) return foundBld.code;

  // 4. Text inspection
  const texts = [
    item.bairniiNer,
    item.customerAddress,
    item.bairNer,
    item.billingName,
    item.soh,
    item.tailbar,
  ].filter(Boolean).join(" ");

  if (/(?:time\s*tower|тайм\s*тауэр|байр)?\s*216/i.test(texts)) return "216";
  if (/(?:time\s*tower|тайм\s*тауэр|байр)?\s*217/i.test(texts)) return "217";
  if (/(?:time\s*tower|тайм\s*тауэр|байр)?\s*218/i.test(texts)) return "218";
  if (/(?:time\s*tower|тайм\s*тауэр|байр)?\s*219/i.test(texts)) return "219";

  return null;
}

/** Тоот дугаарыг бүртгэлээс нормчлон олох */
function extractTootFromAny(item) {
  if (!item) return "";

  if (item.walletDoorNo) {
    const n = normalizeToot(item.walletDoorNo);
    if (n) return n;
  }
  if (item.doorNo) {
    const n = normalizeToot(item.doorNo);
    if (n) return n;
  }
  if (item.toot) {
    const n = normalizeToot(item.toot);
    if (n) return n;
  }

  const texts = [item.customerAddress, item.bairniiNer].filter(Boolean).join(" ");
  const m1 = texts.match(/,\s*(\d+)\s*$/);
  if (m1 && m1[1] && !["216", "217", "218", "219"].includes(m1[1])) {
    return normalizeToot(m1[1]);
  }
  const m2 = texts.match(/(?:216|217|218|219)[^\d]+(\d+)\s*(?:тоот|toot)?/i);
  if (m2 && m2[1] && !["216", "217", "218", "219"].includes(m2[1])) {
    return normalizeToot(m2[1]);
  }

  return "";
}

/** BPay 4 байрны walletBairId-уудыг сангаас болон BPay API-аас автоматаар олох */
async function discoverBpayBairIds(mainConn, walletApiService) {
  const bairIdMap = {
    "216": new Set(["c7a26be9-32e1-4c50-866c-986e3ff8bb8c"]),
    "217": new Set(),
    "218": new Set(),
    "219": new Set(),
  };

  try {
    const docs = await mainConn.collection("orshinSuugch").find({
      $or: [
        { "toots.source": "WALLET_API" },
        { "toots.bairniiNer": /216|217|218|219/ },
        { "toots.walletCustomerCode": /2003260?(216|217|218|219)/ },
      ],
    }).project({ toots: 1 }).toArray();

    for (const d of docs) {
      for (const t of (d.toots || [])) {
        if (!t.walletBairId) continue;
        const text = `${t.bairniiNer || ""} ${t.customerAddress || ""} ${t.walletCustomerCode || ""}`;
        for (const code of ["216", "217", "218", "219"]) {
          if (text.includes(code)) {
            bairIdMap[code].add(t.walletBairId);
          }
        }
      }
    }
  } catch (err) {
    console.warn("   ⚠️ Сангаас bairId уншихад алдаа:", err.message);
  }

  // If any building missing, discover via BPay Address Tree API
  const missing = Object.keys(bairIdMap).filter((k) => bairIdMap[k].size === 0);
  if (missing.length > 0 && walletApiService) {
    try {
      const cities = await walletApiService.getAddressCities();
      const ub = (cities || []).find((c) => /улаанбаатар|хот/i.test(c.name || c.cityName));
      if (ub) {
        const districts = await walletApiService.getAddressDistricts(ub.id || ub.cityId);
        const bzd = (districts || []).find((d) => /баянзүрх/i.test(d.name || d.districtName));
        if (bzd) {
          const khoroos = await walletApiService.getAddressKhoroo(bzd.id || bzd.districtId);
          const kh26 = (khoroos || []).find((k) => /26/i.test(k.name || k.khorooName));
          if (kh26) {
            const bairs = await walletApiService.getAddressBair(kh26.id || kh26.khorooId);
            for (const b of (bairs || [])) {
              const bName = b.name || b.bairName || "";
              for (const code of missing) {
                if (bName.includes(code)) {
                  bairIdMap[code].add(b.id || b.bairId);
                  console.log(`   └─ BPay API-аас олдсон ${code}-р байрны BairId: ${b.id || b.bairId} (${bName})`);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("   ⚠️ BPay Address tree discovery амжилтгүй:", e.message);
    }
  }

  return bairIdMap;
}

/** Generate Standalone Interactive HTML */
function generateIndexHtml(reportData, outputPath) {
  const allRows = reportData.allRows || [];
  const counts = reportData.counts || {};
  const totals = reportData.totals || {};

  const html = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Тайм тауэр СӨХ & BPay Төлөх Нэхэмжлэх, Хаягийн Нэгдсэн Тулгалт (${allRows.length} Өрх)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    .custom-scroll::-webkit-scrollbar-track { background: #f8fafc; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen p-4 sm:p-8">
  <div class="max-w-[1700px] mx-auto space-y-6">

    <!-- Header Section -->
    <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <span class="px-3 py-1 ${reportData.isAutoRegister ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800'} font-bold text-xs rounded-full uppercase tracking-wider">
            ${reportData.isAutoRegister ? '⚡ AUTO-REGISTER MODE' : '🛡️ 100% DRY RUN / LIVE BILLS FETCH'}
          </span>
          <span class="text-xs text-slate-500 font-medium">Үүсгэсэн: ${new Date().toLocaleString("mn-MN")}</span>
        </div>
        <h1 class="text-2xl font-black text-slate-900 mt-2 tracking-tight">
          Тайм тауэр СӨХ — BPay Төлөх (Payable) Нэхэмжлэх & Хаягийн Нэгдсэн Тулгалт
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          Time tower 216, 217, 218, 219 байрны 501 өрхийг утас ба тоотоор нь холбож, төлөгдөөгүй бүх төлөх боломжтой (Payable) биллүүдийг задаргаагаар харуулсан нэгдсэн тайлан
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button onclick="downloadCSV()" class="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          CSV Татах (Excel)
        </button>
      </div>
    </div>

    <!-- Summary Statistics Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <!-- Total Units -->
      <div onclick="filterByBalanceStatus('all')" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-slate-400 transition">
        <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Нийт Өрх / Тоот</div>
        <div class="text-3xl font-black text-slate-900 mt-2">${counts.totalUnits || allRows.length}</div>
        <div class="text-xs text-slate-400 mt-1">216, 217, 218, 219 байрнууд</div>
      </div>

      <!-- Connected to BPay -->
      <div onclick="filterByBalanceStatus('all_connected')" class="bg-white p-5 rounded-2xl border border-sky-200 shadow-sm cursor-pointer hover:border-sky-500 transition">
        <div class="text-xs font-semibold text-sky-700 uppercase tracking-wider flex items-center justify-between">
          <span>🔗 BPay Холбогдсон</span>
          <span class="w-2 h-2 rounded-full bg-sky-500"></span>
        </div>
        <div class="text-3xl font-black text-sky-600 mt-2">${counts.connectedToBpay || 0}</div>
        <div class="text-xs text-slate-500 mt-1">Хаяг 100% холбогдсон өрх</div>
      </div>

      <!-- Balance Matched -->
      <div onclick="filterByBalanceStatus('MATCHED')" class="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm cursor-pointer hover:border-emerald-500 transition">
        <div class="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center justify-between">
          <span>🟢 Үлдэгдэл ТААРСАН</span>
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        </div>
        <div class="text-3xl font-black text-emerald-600 mt-2">${counts.balanceMatched || 0}</div>
        <div class="text-xs text-slate-500 mt-1">Зөрүү 0 ₮ (СӨХ = BPay)</div>
      </div>

      <!-- Balance Mismatched -->
      <div onclick="filterByBalanceStatus('MISMATCHED')" class="bg-white p-5 rounded-2xl border border-rose-300 shadow-sm cursor-pointer hover:border-rose-500 transition ring-2 ring-rose-100">
        <div class="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center justify-between">
          <span>🔴 Үлдэгдэл ЗӨРСӨН</span>
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
        </div>
        <div class="text-3xl font-black text-rose-600 mt-2">${counts.balanceMismatched || 0}</div>
        <div class="text-xs text-rose-600 font-semibold mt-1">Тулгах шаардлагатай (~30 өрх)</div>
      </div>

      <!-- Auto-Registrable / Newly Registered -->
      <div onclick="filterByBalanceStatus('AUTO_REGISTRABLE')" class="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm cursor-pointer hover:border-amber-500 transition">
        <div class="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center justify-between">
          <span>⚡ BPay-д Холбох</span>
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
        </div>
        <div class="text-3xl font-black text-amber-600 mt-2">${counts.autoRegistrable || counts.noBpay || 0}</div>
        <div class="text-xs text-amber-600 mt-1">Шууд бүртгэх боломжтой өрх</div>
      </div>
    </div>

    <!-- Financial Totals Banner -->
    <div class="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div class="flex items-center gap-6 flex-wrap">
        <div>
          <div class="text-xs text-slate-400 font-medium">Нийт СӨХ Авлагын Дүн:</div>
          <div class="text-xl font-black text-emerald-400 mt-0.5">${formatMoney(totals.totalSukhBalance)}</div>
        </div>
        <div class="h-8 w-px bg-slate-700 hidden sm:block"></div>
        <div>
          <div class="text-xs text-slate-400 font-medium">Нийт BPay Төлөх Боломжтой Дүн:</div>
          <div class="text-xl font-black text-sky-400 mt-0.5">${formatMoney(totals.totalBpayBalance)}</div>
        </div>
        <div class="h-8 w-px bg-slate-700 hidden sm:block"></div>
        <div>
          <div class="text-xs text-slate-400 font-medium">Нийт Зөрүүний Дүн:</div>
          <div class="text-xl font-black ${totals.totalDiff === 0 ? 'text-slate-300' : totals.totalDiff > 0 ? 'text-rose-400' : 'text-amber-400'} mt-0.5">
            ${totals.totalDiff > 0 ? '+' : ''}${formatMoney(totals.totalDiff)}
          </div>
        </div>
        <div class="h-8 w-px bg-slate-700 hidden sm:block"></div>
        <div>
          <div class="text-xs text-slate-400 font-medium">Нийт BPay Нэхэмжлэхийн Тоо:</div>
          <div class="text-xl font-black text-amber-400 mt-0.5">${totals.totalBillsCount || 0} ширхэг</div>
        </div>
      </div>
      <div class="text-xs text-slate-400">
        💡 Биллүүдийн дэлгэрэнгүй задаргааг мөр дээр дарж үзнэ үү.
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
            placeholder="Тоот, утас, нэр, CustomerCode, гэрээний №-ээр хайх..." 
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
        <span class="text-xs font-semibold text-slate-400 mr-2">Шүүлтүүр:</span>
        <button onclick="filterByBalanceStatus('all')" class="status-btn px-3 py-1 rounded-lg text-xs font-bold bg-slate-800 text-white" data-status="all">Бүгд (<span id="count-all">${allRows.length}</span>)</button>
        <button onclick="filterByBalanceStatus('MISMATCHED')" class="status-btn px-3 py-1 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100" data-status="MISMATCHED">🔴 Үлдэгдэл Зөрсөн (<span id="count-mismatched">${counts.balanceMismatched || 0}</span>)</button>
        <button onclick="filterByBalanceStatus('MATCHED')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50" data-status="MATCHED">🟢 Үлдэгдэл Таарсан (<span id="count-matched">${counts.balanceMatched || 0}</span>)</button>
        <button onclick="filterByBalanceStatus('HAS_BILLS')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium text-sky-700 hover:bg-sky-50" data-status="HAS_BILLS">💳 Төлөх Биллтэй (<span id="count-hasbills">${allRows.filter(r => r.bpay && r.bpay.billsCount > 0).length}</span>)</button>
        <button onclick="filterByBalanceStatus('AUTO_REGISTRABLE')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50" data-status="AUTO_REGISTRABLE">⚡ Холбох Боломжтой (<span id="count-autoreg">${counts.autoRegistrable || counts.noBpay || 0}</span>)</button>
      </div>
    </div>

    <!-- Data Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto custom-scroll max-h-[800px]">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-3 px-3 w-12 text-center">№</th>
              <th class="py-3 px-3 w-28">Байр, Тоот</th>
              <th class="py-3 px-4 bg-emerald-50/70 border-r border-emerald-100 font-bold text-emerald-950 min-w-[240px]">
                🏢 СӨХ Системийн Өгөгдөл
              </th>
              <th class="py-3 px-3 w-36 bg-emerald-100/60 border-r border-emerald-200 text-right font-black text-emerald-950">
                СӨХ Авлагын Дүн
              </th>
              <th class="py-3 px-4 bg-sky-50/70 border-r border-sky-100 font-bold text-sky-950 min-w-[260px]">
                💳 BPay (Wallet) Өгөгдөл
              </th>
              <th class="py-3 px-3 w-40 bg-sky-100/60 border-r border-sky-200 text-right font-black text-sky-950">
                BPay Төлөх (Payable)
              </th>
              <th class="py-3 px-3 w-36 text-right font-black border-r border-slate-200">
                ⚖️ Зөрүү (СӨХ - BPay)
              </th>
              <th class="py-3 px-3 w-44 text-center">Төлөв & Үйлдэл</th>
            </tr>
          </thead>
          <tbody id="tableBody" class="divide-y divide-slate-100 font-normal">
            <!-- Dynamic rows injected by JavaScript -->
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
        <div>Харагдаж буй бичлэг: <span id="visibleCount" class="font-bold text-slate-800">0</span> / ${allRows.length}</div>
        <div class="text-[11px] text-slate-400">Time Tower СӨХ & BPay Payable Bills Reconciler</div>
      </div>
    </div>

  </div>

  <script>
    const RAW_DATA = ${JSON.stringify(allRows)};
    let currentBuilding = 'ALL';
    let currentFilter = 'all';
    let searchQuery = '';
    let expandedRowKeys = new Set();

    function formatNumber(num) {
      if (num === null || num === undefined || isNaN(num)) return '0 ₮';
      return Number(num).toLocaleString('mn-MN') + ' ₮';
    }

    function toggleRowBills(key) {
      if (expandedRowKeys.has(key)) {
        expandedRowKeys.delete(key);
      } else {
        expandedRowKeys.add(key);
      }
      renderTable();
    }

    function renderTable() {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';

      let filtered = RAW_DATA.filter(row => {
        if (currentBuilding !== 'ALL' && row.building !== currentBuilding) return false;
        
        if (currentFilter === 'MISMATCHED' && row.balanceStatus !== 'MISMATCHED') return false;
        if (currentFilter === 'MATCHED' && row.balanceStatus !== 'MATCHED') return false;
        if (currentFilter === 'all_connected' && !row.bpay) return false;
        if (currentFilter === 'HAS_BILLS' && (!row.bpay || (row.bpay.billsCount || 0) === 0)) return false;
        if (currentFilter === 'AUTO_REGISTRABLE' && (row.balanceStatus !== 'NO_BPAY' && !row.autoRegistrable)) return false;

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
            row.bpay?.customerCode,
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
        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400 text-xs">Тохирох өрх олдсонгүй</td></tr>';
        return;
      }

      let html = '';
      filtered.forEach((row, idx) => {
        const isConnected = !!row.bpay;
        const sukhPhone = row.sukh?.utas || row.sukh?.rawUtas || '—';
        const bpayPhone = row.bpay?.utas || '—';
        const isPhoneMatch = isConnected && sukhPhone !== '—' && bpayPhone !== '—' && sukhPhone === bpayPhone;
        const isExpanded = expandedRowKeys.has(row.key);

        // Status Badge
        let badgeHtml = '';
        if (row.balanceStatus === 'MATCHED') {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 Төлбөр таарсан</span>';
        } else if (row.balanceStatus === 'MISMATCHED') {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">🔴 Үлдэгдэл зөрсөн</span>';
        } else if (row.autoRegistrable) {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">⚡ Бүртгэх боломжтой</span>';
        } else {
          badgeHtml = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">⚪ BPay бүртгэлгүй</span>';
        }

        // Connection note
        let connBadge = '';
        if (isConnected) {
          if (isPhoneMatch) {
            connBadge = '<div class="text-[10px] text-emerald-600 font-medium mt-0.5">✓ Утас яг таарсан</div>';
          } else {
            connBadge = '<div class="text-[10px] text-amber-600 font-medium mt-0.5">ℹ️ Утас өөр ч хаяг холбогдсон</div>';
          }
        }

        // Diff display
        let diffHtml = '';
        if (row.balanceStatus === 'MATCHED') {
          diffHtml = '<span class="font-bold text-emerald-600 font-mono">0 ₮</span>';
        } else if (row.balanceStatus === 'MISMATCHED') {
          const diff = row.diff || 0;
          if (diff > 0) {
            diffHtml = \`<span class="font-black text-rose-600 font-mono">+\${diff.toLocaleString('mn-MN')} ₮</span><div class="text-[9px] text-rose-500 font-medium">СӨХ илүү</div>\`;
          } else {
            diffHtml = \`<span class="font-black text-amber-600 font-mono">\${diff.toLocaleString('mn-MN')} ₮</span><div class="text-[9px] text-amber-500 font-medium">BPay илүү</div>\`;
          }
        } else {
          diffHtml = '<span class="text-slate-400 font-mono">—</span>';
        }

        const isRowHighlight = row.balanceStatus === 'MISMATCHED';
        const billsCount = row.bpay?.billsCount || 0;

        html += \`
          <tr class="hover:bg-slate-50 transition \${isRowHighlight ? 'bg-rose-50/20' : ''}">
            <td class="py-2.5 px-3 text-center font-mono text-slate-400">\${idx + 1}</td>
            <td class="py-2.5 px-3">
              <div class="font-bold text-slate-900">\${row.building}-р байр</div>
              <div class="font-black text-emerald-700 text-sm">\${row.toot} тоот</div>
            </td>
            
            <!-- Sukh Data -->
            <td class="py-2.5 px-4 border-r border-slate-100 bg-emerald-50/20">
              \${row.sukh ? \`
                <div class="font-bold text-slate-900">\${row.sukh.ner || '—'} \${row.sukh.ovog ? '(' + row.sukh.ovog + ')' : ''}</div>
                <div class="text-[11px] text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Утас: <strong class="\${isPhoneMatch ? 'text-emerald-700 font-bold' : 'text-slate-800'}">\${sukhPhone}</strong></span>
                  \${row.sukh.gereeniiDugaar ? \`<span class="text-slate-500">· Гэрээ: <strong class="font-mono text-slate-700">\${row.sukh.gereeniiDugaar}</strong></span>\` : ''}
                </div>
              \` : '<span class="text-slate-400 italic">СӨХ дээр гэрээгүй</span>'}
            </td>

            <!-- Sukh Balance -->
            <td class="py-2.5 px-3 text-right border-r border-slate-100 bg-emerald-50/40 font-mono">
              <div class="font-black text-slate-900 text-xs">\${formatNumber(row.sukhBalance)}</div>
              \${row.sukh?.contractsCount > 1 ? \`<div class="text-[9px] text-slate-400">(\${row.sukh.contractsCount} гэрээ)</div>\` : ''}
            </td>

            <!-- BPay Data -->
            <td class="py-2.5 px-4 border-r border-slate-100 bg-sky-50/20">
              \${row.bpay ? \`
                <div class="font-bold text-slate-900 flex items-center justify-between">
                  <span>\${row.bpay.ner || row.bpay.customerName || '—'}</span>
                  \${row.bpay.customerCode ? \`<span class="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-mono font-bold">Код: \${row.bpay.customerCode}</span>\` : ''}
                </div>
                <div class="text-[11px] text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Утас: <strong class="\${isPhoneMatch ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}">\${bpayPhone}</strong></span>
                  \${row.bpay.billingId ? \`<span class="text-slate-400 truncate max-w-[170px]" title="BillingId: \${row.bpay.billingId}">· Bid: \${row.bpay.billingId.slice(0, 8)}...</span>\` : ''}
                  \${row.bpay.bairniiNer || row.bpay.customerAddress ? \`<span class="text-slate-400 truncate max-w-[190px]" title="\${row.bpay.customerAddress || row.bpay.bairniiNer}">· \${row.bpay.customerAddress || row.bpay.bairniiNer}</span>\` : ''}
                </div>
              \` : row.autoRegistrable ? \`
                <div class="text-amber-800 font-bold">⚡ BPay хэрэглэгч олдсон</div>
                <div class="text-[10px] text-slate-500 font-mono">CustomerCode: \${row.autoRegistrable.customerCode || row.autoRegistrable.customerId}</div>
              \` : '<span class="text-slate-400 italic">BPay дээр хараахан хаягаа бүртгүүлээгүй</span>'}
            </td>

            <!-- BPay Balance & Bills Count -->
            <td class="py-2.5 px-3 text-right border-r border-slate-100 bg-sky-50/40 font-mono">
              \${row.bpay ? \`
                <div class="font-black text-sky-950 text-xs">\${formatNumber(row.bpayBalance)}</div>
                \${billsCount > 0 ? \`
                  <button onclick="toggleRowBills('\${row.key}')" class="text-[10px] text-sky-700 font-bold hover:underline cursor-pointer flex items-center justify-end gap-1 ml-auto mt-0.5">
                    <span>\${billsCount} нэхэмжлэх</span>
                    <svg class="w-3 h-3 \${isExpanded ? 'rotate-180' : ''} transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                \` : '<div class="text-[10px] text-slate-400">Төлөх биллгүй</div>'}
              \` : '<span class="text-slate-400">—</span>'}
            </td>

            <!-- Balance Difference -->
            <td class="py-2.5 px-3 text-right border-r border-slate-200">
              \${diffHtml}
            </td>

            <!-- Status & Action -->
            <td class="py-2.5 px-3 text-center">
              \${badgeHtml}
              \${connBadge}
            </td>
          </tr>
        \`;

        // Expandable Bills Breakdown Row
        if (isExpanded && row.bpay && row.bpay.payableBills && row.bpay.payableBills.length > 0) {
          html += \`
            <tr class="bg-sky-50/50 border-b border-sky-100">
              <td colspan="8" class="p-3 pl-16">
                <div class="bg-white p-3 rounded-xl border border-sky-200 shadow-xs space-y-2">
                  <div class="text-xs font-bold text-sky-900 flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span>💳 BPay дээрх Төлөгдөөгүй Нэхэмжлэхүүд (Payable Bills) — \${row.building}-р байр \${row.toot} тоот</span>
                    <span class="text-[11px] text-slate-500 font-mono">Нийт: \${formatNumber(row.bpayBalance)}</span>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    \${row.bpay.payableBills.map(b => \`
                      <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div class="flex items-center justify-between font-bold text-slate-800">
                          <span>\${b.billPeriod || 'Билл'}</span>
                          <span class="text-sky-700 font-mono">\${formatNumber(b.amount)}</span>
                        </div>
                        <div class="text-[11px] text-slate-500 mt-1 truncate">\${b.billDescription || 'СӨХ-ийн төлбөр'}</div>
                        \${b.lateFee > 0 ? \`<div class="text-[10px] text-rose-500 font-medium mt-0.5">Алданги: \${formatNumber(b.lateFee)}</div>\` : ''}
                        \${b.billNo ? \`<div class="text-[10px] text-slate-400 font-mono mt-0.5">№: \${b.billNo}</div>\` : ''}
                      </div>
                    \`).join('')}
                  </div>
                </div>
              </td>
            </tr>
          \`;
        }
      });

      tbody.innerHTML = html;
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

    function filterByBalanceStatus(status) {
      currentFilter = status;
      document.querySelectorAll('.status-btn').forEach(btn => {
        if (btn.getAttribute('data-status') === status) {
          btn.className = 'status-btn px-3 py-1 rounded-lg text-xs font-bold bg-slate-800 text-white shadow-sm';
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
      const headers = [
        "№", "Байр", "Тоот",
        "СӨХ Оршин суугч", "СӨХ Утас", "СӨХ Гэрээний №", "СӨХ Авлагын Дүн",
        "BPay Хэрэглэгч", "BPay Утас", "BPay CustomerCode", "BPay BillingID", "BPay Хаяг",
        "BPay Төлөх Дүн (Payable)", "BPay Билл Тоо", "Зөрүү (СӨХ - BPay)", "Төлбөрийн Төлөв", "Хаягийн Холболт"
      ];

      const rows = RAW_DATA.map((r, i) => [
        i + 1,
        r.building,
        r.toot,
        (r.sukh?.ner || "") + (r.sukh?.ovog ? " (" + r.sukh.ovog + ")" : ""),
        r.sukh?.utas || r.sukh?.rawUtas || "",
        r.sukh?.gereeniiDugaar || "",
        r.sukhBalance || 0,
        r.bpay?.ner || r.bpay?.customerName || "",
        r.bpay?.utas || "",
        r.bpay?.customerCode || r.bpay?.customerId || "",
        r.bpay?.billingId || "",
        (r.bpay?.customerAddress || r.bpay?.bairniiNer || "").replace(/,/g, " "),
        r.bpay ? (r.bpayBalance || 0) : "",
        r.bpay ? (r.bpay.billsCount || 0) : "",
        r.bpay ? (r.diff || 0) : "",
        r.balanceStatus === 'MATCHED' ? "Үлдэгдэл таарсан" : r.balanceStatus === 'MISMATCHED' ? "Үлдэгдэл зөрсөн" : "BPay бүртгэлгүй",
        r.bpay ? (r.phoneMatched ? "100% Таарсан" : "Утас өөр ч холбогдсон") : "Холбогдоогүй"
      ]);

      const csvContent = "\\uFEFF" + [headers.join(","), ...rows.map(e => e.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(","))].join("\\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "timetower_bpay_payable_reconciliation.csv");
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
  console.log("🏢 ТАЙМ ТАУЭР СӨХ — BPAY БА СӨХ ТӨЛӨХ (PAYABLE) НЭХЭМЖЛЭХ, ХАЯГИЙН НЭГДСЭН ТУЛГАЛТ");
  if (isAutoRegister) {
    console.log("⚡ РЕЖИМ: [AUTO-REGISTER MODE — BPay-д шууд бүртгэж, тоотоор нь холбоно]");
  } else {
    console.log("🛡️  РЕЖИМ: [PREVIEW / DRY RUN MODE — 100% ЗӨВХӨН УНШИХ ГЭМГҮЙ ГОРИМ]");
  }
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

  // 3. Initialize Wallet API Service
  let walletApiService = null;
  let hasWalletToken = false;
  try {
    walletApiService = require("../services/walletApiService");
    const t = await walletApiService.getWalletServiceToken();
    if (t) hasWalletToken = true;
  } catch (wErr) {
    console.log(`   ℹ️ [WALLET API] Үйлчилгээ одоогоор бэлэн биш байна (${wErr.message})`);
  }

  try {
    // -------------------------------------------------------------
    // АЛХАМ 1: BPAY БАЙРНЫ ID-УУДЫГ АВТОМАТААР ИЛРҮҮЛЭХ
    // -------------------------------------------------------------
    console.log("\n📍 1. BPay системийн 4 байрны ID-уудыг тодорхойлж байна...");
    const discoveredBairIds = await discoverBpayBairIds(mainConn, walletApiService);
    for (const [code, ids] of Object.entries(discoveredBairIds)) {
      console.log(`   └─ ${code}-р байр: BPay BairId=[${Array.from(ids).join(", ") || "Одоогоор байхгүй"}]`);
    }

    // -------------------------------------------------------------
    // АЛХАМ 2: СӨХ-ИЙН ГЭРЭЭ БА АВЛАГЫН ҮЛДЭГДЛИЙГ УНШИХ
    // -------------------------------------------------------------
    console.log("\n📦 2. СӨХ-ийн гэрээ болон авлагын журнал (guilgeeAvlaguud)-ийг уншиж байна...");

    const ledgerAgg = await tenantConn
      .collection("guilgeeAvlaguud")
      .aggregate([
        {
          $group: {
            _id: "$gereeniiId",
            totalDun: { $sum: "$dun" },
            totalTulukh: { $sum: "$tulukhDun" },
            totalTulsun: { $sum: "$tulsunDun" },
            txCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const ledgerMap = new Map();
    for (const item of ledgerAgg) {
      if (item._id) {
        ledgerMap.set(String(item._id), item);
      }
    }
    console.log(`   └─ timetower.guilgeeAvlaguud тооцоо хийгдсэн нийт гэрээ: ${ledgerMap.size}`);

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
        ekhniiUldegdel: 1,
        tuluv: 1,
      })
      .toArray();

    console.log(`   └─ timetower.geree нийт идэвхтэй гэрээ: ${gereenuud.length}`);

    const sukhMap = new Map(); // key: "216_2" -> [contracts]

    for (const g of gereenuud) {
      const bCode = extractBuildingCodeFromAny({
        barilgiinId: g.barilgiinId,
        bairNer: g.bairNer,
      }, discoveredBairIds);
      if (!bCode) continue;

      const normToot = extractTootFromAny(g);
      if (!normToot) continue;

      const key = `${bCode}_${normToot}`;
      if (!sukhMap.has(key)) {
        sukhMap.set(key, []);
      }

      const gid = String(g._id);
      const ledgerItem = ledgerMap.get(gid);
      const contractBalance =
        ledgerItem !== undefined ? ledgerItem.totalDun || 0 : Number(g.ekhniiUldegdel) || 0;

      sukhMap.get(key).push({
        source: "SUKH_GEREE",
        gereeId: gid,
        gereeniiDugaar: g.gereeniiDugaar || "",
        bairCode: bCode,
        bairNer: g.bairNer || `Time tower ${bCode}`,
        toot: g.toot,
        normToot,
        ner: g.ner || "",
        ovog: g.ovog || "",
        utas: normalizePhone(g.utas),
        rawUtas: g.utas,
        balance: contractBalance,
        orshinSuugchId: String(g.orshinSuugchId || ""),
        tuluv: g.tuluv || "Идэвхтэй",
      });
    }

    console.log(`   => Нийт СӨХ дээр бүртгэлтэй өрх/тоотын түлхүүр: ${sukhMap.size}`);

    // -------------------------------------------------------------
    // АЛХАМ 3: BPAY (WALLET) ӨГӨГДЛИЙГ ЦУГЛУУЛАХ
    // -------------------------------------------------------------
    console.log("\n💳 3. BPay бүртгэлтэй хэрэглэгчид болон нэхэмжлэхүүдийг уншиж байна...");

    const bpayResidents = await mainConn
      .collection("orshinSuugch")
      .find({
        $or: [
          { "toots.source": "WALLET_API" },
          { "toots.source": "BPAY" },
          { "toots.source": "B_PAY" },
          { "toots.bairniiNer": /time\s*tower|тайм\s*тауэр|216|217|218|219/i },
          { "toots.walletCustomerCode": /2003260?(216|217|218|219)/ },
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

    const walletInvoices = await mainConn
      .collection("walletInvoice")
      .find({
        $or: [
          { customerAddress: /time\s*tower|тайм\s*тауэр|216|217|218|219/i },
          { billingName: /time\s*tower|тайм\s*тауэр|216|217|218|219/i },
          { customerId: /2003260?(216|217|218|219)/ },
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

    const bpayMap = new Map();
    const billingToPhoneMap = new Map();
    const billingToUnitMap = new Map();

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

      if (meta.billingId) {
        billingToUnitMap.set(meta.billingId, key);
        if (meta.utas) {
          billingToPhoneMap.set(meta.billingId, meta.utas);
        }
      }
    }

    for (const r of bpayResidents) {
      const rPhone = normalizePhone(r.utas);
      (r.toots || []).forEach((t) => {
        const bCode = extractBuildingCodeFromAny(t, discoveredBairIds);
        if (!bCode) return;

        const tootVal = extractTootFromAny(t);
        if (!tootVal) return;

        addBpayEntry(bCode, tootVal, {
          source: "BPAY_RESIDENT_TOOT",
          utas: rPhone,
          ner: r.ner || t.ner || "",
          ovog: r.ovog || t.ovog || "",
          walletUserId: r.walletUserId || t.walletUserId || "",
          walletBairId: t.walletBairId || t.bairId || "",
          walletDoorNo: t.walletDoorNo || t.doorNo || t.toot || "",
          walletCustomerId: t.walletCustomerId || t.walletCustomerCode || t.customerId || "",
          walletCustomerCode: t.walletCustomerCode || t.walletCustomerId || t.customerId || "",
          billingId: t.billingId || "",
          bairniiNer: t.bairniiNer || t.customerAddress || "",
          customerAddress: t.customerAddress || t.bairniiNer || "",
          localBalance: Number(t.ekhniiUldegdel) || 0,
        });
      });
    }

    for (const winv of walletInvoices) {
      const bCode = extractBuildingCodeFromAny(winv, discoveredBairIds);
      if (!bCode) continue;

      const tootVal = extractTootFromAny(winv);
      if (!tootVal) continue;

      addBpayEntry(bCode, tootVal, {
        source: "BPAY_WALLET_INVOICE",
        walletInvoiceId: winv.walletInvoiceId,
        billingId: winv.billingId,
        customerId: winv.customerId,
        customerName: winv.customerName,
        customerAddress: winv.customerAddress,
        totalAmount: Number(winv.totalAmount) || 0,
        localBalance: Number(winv.totalAmount) || 0,
      });
    }

    console.log(`   => BPay-тэй холбогдсон Time Tower өрх/тоотын түлхүүр: ${bpayMap.size}`);

    // -------------------------------------------------------------
    // АЛХАМ 4: АВТО-БҮРТГЭЛ (AUTO-REGISTER) & ХОЛБОЛТ
    // -------------------------------------------------------------
    const autoRegistrableUnits = new Map();
    let newlyRegisteredCount = 0;

    if (hasWalletToken && walletApiService) {
      console.log("\n⚡ 4. BPay дээр хараахан холбогдоогүй өрхүүдийг шалгаж байна...");

      for (const [key, contracts] of sukhMap.entries()) {
        const [bCode, normToot] = key.split("_");

        if (targetBair && bCode !== targetBair) continue;
        if (targetToot && normToot !== targetToot) continue;

        // Only process units not already in bpayMap with billingId
        const existingBpay = bpayMap.get(key) || [];
        const hasBillingId = existingBpay.some((b) => b.billingId);
        if (hasBillingId) continue;

        const primaryContract = contracts[0];
        const residentPhone = primaryContract.utas;
        if (!residentPhone) continue;

        // Get primary bairId for this building
        const bIdSet = discoveredBairIds[bCode];
        const bairId = bIdSet && bIdSet.size > 0 ? Array.from(bIdSet)[0] : null;
        if (!bairId) continue;

        try {
          // Check if BPay knows this address
          const addressMatches = await walletApiService.getBillingByAddress(residentPhone, bairId, normToot);
          const list = Array.isArray(addressMatches) ? addressMatches : addressMatches ? [addressMatches] : [];
          if (list.length > 0) {
            const customer = list[0];
            autoRegistrableUnits.set(key, customer);

            if (isAutoRegister && newlyRegisteredCount < registerLimit) {
              console.log(`   ⚡ [AUTO-REGISTER] Холбож байна: ${bCode}-р байр, ${normToot} тоот (Утас: ${residentPhone}, Customer: ${customer.customerId || customer.customerCode})...`);

              // 1. Ensure user is registered in BPay
              await walletApiService.registerUser(residentPhone, `${residentPhone}@sukh.mn`).catch(() => null);

              // 2. Save billing address to user in BPay
              const saveResult = await walletApiService.saveBilling(residentPhone, {
                customerId: customer.customerId || customer.customerCode,
              });

              const assignedBillingId = saveResult?.billingId || saveResult?.id || "";

              // 3. Save to local orshinSuugch.toots
              const existingResident = await mainConn.collection("orshinSuugch").findOne({
                $or: [{ utas: residentPhone }, { nevtrekhNer: residentPhone }],
              });

              const newTootEntry = {
                toot: String(normToot),
                source: "WALLET_API",
                bairniiNer: customer.bairName || `Time tower ${bCode}, ${normToot}`,
                ovog: primaryContract.ovog || "",
                ner: primaryContract.ner || customer.customerName || "",
                walletBairId: bairId,
                walletDoorNo: String(normToot),
                walletUserId: residentPhone,
                walletCustomerId: customer.customerId || customer.customerCode || "",
                walletCustomerCode: customer.customerCode || customer.customerId || "",
                billingId: assignedBillingId,
                khonogoorBodokhEsekh: false,
                bodokhKhonog: 0,
                createdAt: new Date(),
              };

              if (existingResident) {
                const toots = existingResident.toots || [];
                const idx = toots.findIndex(
                  (t) =>
                    t.source === "WALLET_API" &&
                    String(t.walletDoorNo) === String(normToot) &&
                    (t.walletBairId === bairId || t.walletCustomerId === customer.customerId)
                );
                if (idx >= 0) {
                  toots[idx] = { ...toots[idx], ...newTootEntry };
                } else {
                  toots.push(newTootEntry);
                }
                await mainConn.collection("orshinSuugch").updateOne(
                  { _id: existingResident._id },
                  { $set: { toots } }
                );
              } else {
                await mainConn.collection("orshinSuugch").insertOne({
                  ner: primaryContract.ner || customer.customerName || "",
                  ovog: primaryContract.ovog || "",
                  utas: residentPhone,
                  baiguullagiinId: TIMETOWER_ORG_ID,
                  baiguullagiinNer: "Тайм тауэр СӨХ",
                  barilgiinId: BUILDINGS.find((b) => b.code === bCode)?.id || "",
                  toot: String(normToot),
                  bairniiNer: customer.bairName || `Time tower ${bCode}`,
                  erkh: "OrshinSuugch",
                  nevtrekhNer: residentPhone,
                  taniltsuulgaKharakhEsekh: true,
                  toots: [newTootEntry],
                  createdAt: new Date(),
                });
              }

              // Add to in-memory bpayMap
              addBpayEntry(bCode, normToot, {
                source: "BPAY_AUTO_REGISTERED",
                utas: residentPhone,
                ner: customer.customerName || primaryContract.ner || "",
                walletCustomerCode: customer.customerCode || customer.customerId,
                walletCustomerId: customer.customerId,
                billingId: assignedBillingId,
                customerAddress: customer.bairName || `Time tower ${bCode}, ${normToot}`,
                localBalance: 0,
              });

              newlyRegisteredCount++;
            }
          }
        } catch (regErr) {
          // ignore individual lookup errors
        }
      }

      console.log(`   └─ BPay-д автоматаар бүртгэж холбох боломжтой өрх: ${autoRegistrableUnits.size}`);
      if (isAutoRegister) {
        console.log(`   ✅ Амжилттай шинээр бүртгэж холбосон өрх: ${newlyRegisteredCount}`);
      }
    }

    // -------------------------------------------------------------
    // АЛХАМ 5: БҮХ ТӨЛӨХ БОЛОМЖТОЙ (PAYABLE) БИЛЛҮҮДИЙГ ТАТАХ
    // -------------------------------------------------------------
    console.log("\n💳 5. BPay-ийн бүх төлөгдөөгүй, төлөх боломжтой (Payable) биллүүдийг татаж байна...");

    const billingBalances = new Map(); // billingId -> { totalPayable, billsCount, payableBills }

    if (hasWalletToken && walletApiService) {
      const billingIds = Array.from(billingToUnitMap.keys());
      const concurrency = 10;
      let processed = 0;

      for (let i = 0; i < billingIds.length; i += concurrency) {
        const batch = billingIds.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (billingId) => {
            const phone = billingToPhoneMap.get(billingId) || "";
            try {
              const rawBills = await walletApiService.getBillingBills(phone, billingId);
              const list = Array.isArray(rawBills) ? rawBills : rawBills ? [rawBills] : [];

              let totalPayable = 0;
              const payableBills = [];

              for (const b of list) {
                // In BPay, getBillingBills returns active unpaid bills
                const amt = Number(b.billTotalAmount || b.billAmount || b.totalAmount || b.amount || 0) || 0;
                const late = Number(b.billLateFee || b.lateFee || 0) || 0;
                totalPayable += amt;

                payableBills.push({
                  billId: b.billId || b.id || "",
                  billNo: b.billNo || "",
                  billPeriod: b.billPeriod || b.period || "",
                  billDescription: b.billDescription || b.description || "СӨХ төлбөр",
                  amount: amt,
                  lateFee: late,
                  isPaid: b.isPaid === true,
                });
              }

              billingBalances.set(billingId, {
                totalPayable,
                billsCount: payableBills.length,
                payableBills,
              });
            } catch (bErr) {
              billingBalances.set(billingId, { totalPayable: 0, billsCount: 0, payableBills: [], error: bErr.message });
            }
          })
        );
        processed += batch.length;
        if (processed % 50 === 0 || processed === billingIds.length) {
          process.stdout.write(`   └─ Төлөх биллүүд татсан: ${processed} / ${billingIds.length}\r`);
        }
      }
      console.log(`\n   ✅ Нийт ${billingBalances.size} BPay биллингийн төлөх нэхэмжлэхүүд бүрэн татагдлаа.`);
    } else {
      console.log("   ℹ️ BPay Live API холбогдоогүй тул local walletInvoice үлдэгдлийг ашиглана.");
    }

    // -------------------------------------------------------------
    // АЛХАМ 6: НЭГДСЭН ТУЛГАЛТ БА ХАРЬЦУУЛАЛТ
    // -------------------------------------------------------------
    console.log("\n🧩 6. СӨХ авлага болон BPay төлөх (Payable) биллүүдийг зэрэгцүүлэн тулгаж байна...");

    const allKeys = Array.from(new Set([...sukhMap.keys(), ...bpayMap.keys()])).sort((a, b) => {
      const [bldA, tootA] = a.split("_");
      const [bldB, tootB] = b.split("_");
      if (bldA !== bldB) return bldA.localeCompare(bldB);
      return parseInt(tootA, 10) - parseInt(tootB, 10);
    });

    const allRows = [];
    let countBalanceMatched = 0;
    let countBalanceMismatched = 0;
    let countNoBpay = 0;
    let countPhoneMatched = 0;
    let countPhoneDifferent = 0;
    let totalSukhBalance = 0;
    let totalBpayBalance = 0;
    let totalBillsCount = 0;

    for (const key of allKeys) {
      const [bCode, normToot] = key.split("_");
      const sukhEntries = sukhMap.get(key) || [];
      const bpayEntries = bpayMap.get(key) || [];

      // Sukh side
      let sukhBalance = 0;
      let primarySukh = null;
      if (sukhEntries.length > 0) {
        primarySukh = sukhEntries[0];
        sukhBalance = sukhEntries.reduce((sum, e) => sum + (e.balance || 0), 0);
        totalSukhBalance += sukhBalance;
      }

      // BPay side
      let bpayBalance = 0;
      let primaryBpay = null;
      let billsCount = 0;
      let payableBills = [];

      if (bpayEntries.length > 0) {
        primaryBpay =
          bpayEntries.find((b) => b.billingId && b.walletCustomerCode) ||
          bpayEntries.find((b) => b.billingId) ||
          bpayEntries[0];

        if (primaryBpay.billingId && billingBalances.has(primaryBpay.billingId)) {
          const liveData = billingBalances.get(primaryBpay.billingId);
          bpayBalance = liveData.totalPayable || 0;
          billsCount = liveData.billsCount || 0;
          payableBills = liveData.payableBills || [];
        } else {
          const invWithAmount = bpayEntries.find((b) => b.totalAmount !== undefined && b.totalAmount > 0);
          bpayBalance = invWithAmount ? invWithAmount.totalAmount : primaryBpay.localBalance || 0;
        }

        totalBpayBalance += bpayBalance;
        totalBillsCount += billsCount;
      }

      // Compare phones
      const sukhPhones = new Set(sukhEntries.map((s) => s.utas).filter(Boolean));
      const bpayPhones = new Set(bpayEntries.map((b) => b.utas).filter(Boolean));
      let isPhoneMatch = false;
      for (const sp of sukhPhones) {
        if (bpayPhones.has(sp)) {
          isPhoneMatch = true;
          break;
        }
      }

      // Status
      const isConnected = sukhEntries.length > 0 && bpayEntries.length > 0;
      let balanceStatus = "NO_BPAY";
      let diff = 0;

      if (isConnected) {
        diff = sukhBalance - bpayBalance;
        if (Math.abs(diff) < 1) {
          balanceStatus = "MATCHED";
          countBalanceMatched++;
        } else {
          balanceStatus = "MISMATCHED";
          countBalanceMismatched++;
        }

        if (isPhoneMatch) {
          countPhoneMatched++;
        } else {
          countPhoneDifferent++;
        }
      } else if (sukhEntries.length > 0 && bpayEntries.length === 0) {
        balanceStatus = "NO_BPAY";
        countNoBpay++;
      } else {
        balanceStatus = "NO_SUKH";
      }

      const autoRegInfo = autoRegistrableUnits.get(key) || null;

      const rowRecord = {
        key,
        building: bCode,
        toot: normToot,
        sukhBalance,
        bpayBalance: isConnected ? bpayBalance : null,
        diff: isConnected ? diff : null,
        balanceStatus,
        phoneMatched: isPhoneMatch,
        autoRegistrable: autoRegInfo,
        sukh: primarySukh
          ? {
              ner: primarySukh.ner,
              ovog: primarySukh.ovog,
              utas: primarySukh.utas,
              rawUtas: primarySukh.rawUtas,
              gereeniiDugaar: primarySukh.gereeniiDugaar,
              gereeId: primarySukh.gereeId,
              contractsCount: sukhEntries.length,
            }
          : null,
        bpay: primaryBpay
          ? {
              ner: primaryBpay.ner || primaryBpay.customerName || "",
              utas: primaryBpay.utas || "",
              customerCode: primaryBpay.walletCustomerCode || primaryBpay.walletCustomerId || "",
              customerId: primaryBpay.walletCustomerId || primaryBpay.customerId || "",
              billingId: primaryBpay.billingId || "",
              customerAddress: primaryBpay.customerAddress || primaryBpay.bairniiNer || "",
              bairniiNer: primaryBpay.bairniiNer || "",
              billsCount,
              payableBills,
            }
          : null,
      };

      allRows.push(rowRecord);
    }

    // -------------------------------------------------------------
    // АЛХАМ 7: ТАЙЛАН ХЭВЛЭХ БА HTML ҮҮСГЭХ
    // -------------------------------------------------------------
    console.log("\n" + "=".repeat(88));
    console.log("📊 ТӨЛӨХ БОЛОМЖТОЙ (PAYABLE) НЭХЭМЖЛЭХ БА АВЛАГЫН НЭГДСЭН ДҮН:");
    console.log("=".repeat(88));
    console.log(`🏢 Нийт шинжилсэн өрх / тоот         : ${allKeys.length} өрх`);
    console.log(`🔗 BPay хаягтай холбогдсон өрх       : ${bpayMap.size} өрх`);
    console.log(`   ├─ 🟢 Утас 100% яг таарсан        : ${countPhoneMatched} өрх`);
    console.log(`   └─ 🟡 Утас өөр ч хаяг холбогдсон  : ${countPhoneDifferent} өрх`);
    console.log(`⚡ BPay-д автоматаар холбох боломжтой: ${autoRegistrableUnits.size} өрх`);
    console.log(`----------------------------------------------------------------------------------------`);
    console.log(`🟢 ҮЛДЭГДЭЛ ЯГ ТААРСАН (Зөрүү 0 ₮)   : ${countBalanceMatched} өрх`);
    console.log(`🔴 ҮЛДЭГДЭЛ ЗӨРСӨН (~30 тулгах айл)  : ${countBalanceMismatched} өрх`);
    console.log(`⚪ BPay-д бүртгэлгүй (Зөвхөн СӨХ)    : ${countNoBpay} өрх`);
    console.log(`----------------------------------------------------------------------------------------`);
    console.log(`💰 Нийт СӨХ-ийн авлагын дүн          : ${formatMoney(totalSukhBalance)}`);
    console.log(`💳 Нийт BPay төлөх боломжтой дүн     : ${formatMoney(totalBpayBalance)} (${totalBillsCount} нэхэмжлэх)`);
    console.log(`⚖️  Нийт үлдэгдлийн зөрүүний дүн      : ${formatMoney(totalSukhBalance - totalBpayBalance)}`);
    console.log("=".repeat(88));

    const reportData = {
      isAutoRegister,
      generatedAt: new Date().toISOString(),
      organization: {
        id: TIMETOWER_ORG_ID,
        name: "Тайм тауэр СӨХ",
        buildings: BUILDINGS,
      },
      counts: {
        totalUnits: allKeys.length,
        connectedToBpay: bpayMap.size,
        balanceMatched: countBalanceMatched,
        balanceMismatched: countBalanceMismatched,
        noBpay: countNoBpay,
        autoRegistrable: autoRegistrableUnits.size,
        phoneMatched: countPhoneMatched,
        phoneDifferent: countPhoneDifferent,
      },
      totals: {
        totalSukhBalance,
        totalBpayBalance,
        totalDiff: totalSukhBalance - totalBpayBalance,
        totalBillsCount,
      },
      allRows,
    };

    // 1. JSON Report
    const jsonPath = path.join(__dirname, "timetower_bpay_match_report.json");
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), "utf-8");
    console.log(`📄 1. JSON тайлан хадгалагдлаа: ${jsonPath}`);

    // 2. Standalone HTML Report (index.html)
    const htmlPath = path.join(__dirname, "index.html");
    generateIndexHtml(reportData, htmlPath);
    console.log(`🌐 2. Дэлгэрэнгүй INDEX.HTML тайлан амжилттай үүсгэгдлээ: ${htmlPath}`);

    // Copy to timetower_match_index.html
    const htmlCopyPath = path.join(__dirname, "timetower_match_index.html");
    fs.copyFileSync(htmlPath, htmlCopyPath);

    console.log("=".repeat(88) + "\n");
  } catch (err) {
    console.error("❌ Алдаа гарлаа:", err);
  } finally {
    if (mainConn) await mainConn.close();
    if (tenantConn) await tenantConn.close();
  }
}

runMatchmaking().catch(console.error);
