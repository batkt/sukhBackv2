/**
 * match_timetower_bpay.js
 *
 * Тайм тауэр СӨХ (216, 217, 218, 219-р байр) — СӨХ-ийн авлага ба BPay-ийн
 * төлөх биллийг тоот бүрээр тулгах тайлан.
 *
 * BPay тал гэж ЗӨВХӨН BPay-ийн customer code (2003260 + байр + тоот...) эсвэл
 * billingId-тай бичлэгийг тооцно. Аппын энгийн хэрэглэгч ("Time tower 216")
 * BPay биш — тусдаа баганад харагдана.
 *
 * Customer code-ын загвар: 2003260 + байр(3) + тоот(5 орон, 0-ээр дүүргэсэн) + "0"
 *   216-р байр, 2 тоот   -> 2003260216000020
 *   217-р байр, 55 тоот  -> 2003260217000550
 * Скрипт энэ загварыг BPay-д аль хэдийн холбогдсон өрхүүдээр шалгаж, тайланд гаргана.
 *
 * ГОРИМУУД:
 *   1. Урьдчилан харах (анхдагч — санд бичихгүй, BPay-ээс зөвхөн уншина):
 *        node scripts/match_timetower_bpay.js
 *        node scripts/match_timetower_bpay.js --no-probe      (холбогдоогүй өрхийн кодыг BPay-ээс шалгахгүй)
 *        node scripts/match_timetower_bpay.js --probe-user 99112233  (код шалгахад ашиглах BPay хэрэглэгчийн утас)
 *
 *   2. BPay-д холбох (BPay болон amarSukh.orshinSuugch-д бичнэ):
 *        node scripts/match_timetower_bpay.js --auto-register --bair 216 --toot 2
 *        node scripts/match_timetower_bpay.js --auto-register --limit 10
 *      --limit эсвэл --bair + --toot заавал байна.
 *
 *   3. BPay-ийн хаягийн мод (хот → дүүрэг → хороо → байр)-ыг хадгалах (санд бичихгүй):
 *        node scripts/match_timetower_bpay.js --save-address              (зөвхөн Улаанбаатар)
 *        node scripts/match_timetower_bpay.js --save-address --all-cities (бүх хот/аймаг)
 *      -> scripts/data/bpay_address_tree.json. Үндсэн ажиллагаа байрны BPay bairId-г эндээс авна.
 *
 *   Тайлан: scripts/output/ (эсвэл --out <хавтас>). Хувийн мэдээлэлтэй тул git-д орохгүй.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const configPaths = [
  path.join(__dirname, "../tokhirgoo/tokhirgoo.env"),
  path.join(__dirname, "tokhirgoo.env"),
  "./tokhirgoo/tokhirgoo.env",
];
for (const p of configPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`🔧 Тохиргоо ачааллаа: ${p}`);
    break;
  }
}

const TIMETOWER_ORG_ID = "6a9786569a202a8f8f859f94";
const TIMETOWER_ORG_NAME = "Тайм тауэр СӨХ";
const TIMETOWER_DB_NAME = "timetower";
const MAIN_DB_NAME = "amarSukh";

// sukhId — СӨХ-ийн barilgiinId. bpayBairId — BPay-ийн хаягийн ID
// ("БЗД 26-р хороо 21x-р байр", scripts/data/bpay_address_tree.json, 2026-11-09).
const BUILDINGS = [
  { code: "216", sukhId: "6a978709d2d69c94c9e97f29", name: "Time tower 216", bpayBairId: "c7a26be9-32e1-4c50-866c-986e3ff8bb8c" },
  { code: "217", sukhId: "6a979aafd2d69c94c9e9bf04", name: "Time tower 217", bpayBairId: "9332131f-64bb-415a-ae8e-b43e025bf441" },
  { code: "218", sukhId: "6a979ad8d2d69c94c9e9bfac", name: "Time tower 218", bpayBairId: "fa58c274-f0ff-45a8-becb-0b31eecba2da" },
  { code: "219", sukhId: "6a97bbebd2d69c94c9e9d915", name: "Time tower 219", bpayBairId: "428badc2-d34b-4560-9010-43e9d09b1e1d" },
];
const BUILDING_CODES = BUILDINGS.map((b) => b.code);
const SUKH_ID_TO_CODE = new Map(BUILDINGS.map((b) => [b.sukhId, b.code]));

const CUSTOMER_CODE_PREFIX = "2003260";
const CUSTOMER_CODE_RE = /^2003260(216|217|218|219)(\d{5})(\d)$/;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const isAutoRegister = process.argv.includes("--auto-register");
const doProbe = !process.argv.includes("--no-probe");
const targetBair = argValue("--bair");
const targetToot = argValue("--toot");
const limitArg = argValue("--limit");
const registerLimit = limitArg ? parseInt(limitArg, 10) : null;
const probeUserArg = argValue("--probe-user");
const outDir = argValue("--out") || path.join(__dirname, "output");
// BPay дээрх СӨХ-ийн нэхэмжлэгчийн нэр. Тулгалтад зөвхөн энэ нэхэмжлэгчийн биллийг тооцно.
const SOKH_BILLER_NAME = argValue("--biller") || "ТАЙМ ТАУЭР СӨХ";
const normBiller = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
const isSokhBiller = (name) => normBiller(name) === normBiller(SOKH_BILLER_NAME);
const isSaveAddress = process.argv.includes("--save-address");
const allCities = process.argv.includes("--all-cities");
// BPay-ийн хаягийн мод (хувийн мэдээлэлгүй) — repo-д хадгална.
const ADDRESS_TREE_PATH = path.join(__dirname, "data", "bpay_address_tree.json");

if (isAutoRegister && !(registerLimit > 0) && !(targetBair && targetToot)) {
  console.error("❌ --auto-register нь --limit <N> эсвэл --bair <байр> --toot <тоот>-той хамт ажиллана.");
  process.exit(1);
}

function getMongoUriTemplate() {
  const uri = argValue("--uri") || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI тохиргоо олдсонгүй (tokhirgoo/tokhirgoo.env эсвэл --uri).");
    process.exit(1);
  }
  if (uri.includes("{db}")) return uri;
  return uri.replace(/\/[a-zA-Z0-9_-]+(\?|$)/, "/{db}$1");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Тоот нормчлох: "06" -> "6", "6 тоот" -> "6" */
function normalizeToot(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim().toLowerCase().replace(/\s*(-?р\s*)?(тоот|toot)$/i, "").trim();
  const noZeros = s.replace(/^0+(?=.)/, "");
  return noZeros;
}

/** Утас: сүүлийн 8 орон */
function normalizePhone(val) {
  if (Array.isArray(val)) val = val[0];
  if (!val) return "";
  const digits = String(val).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}

/** Мөнгөн дүн: "145,800", "145 800.00", 145800 -> 145800 */
function toAmount(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const n = Number(String(val).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return "0 ₮";
  return Number(num).toLocaleString("mn-MN") + " ₮";
}

/** Байр + тоот -> BPay customer code. Тоот зөвхөн 1-5 оронтой тоо байх ёстой. */
function makeCustomerCode(bairCode, toot) {
  if (!BUILDING_CODES.includes(bairCode) || !/^\d{1,5}$/.test(toot)) return "";
  return `${CUSTOMER_CODE_PREFIX}${bairCode}${toot.padStart(5, "0")}0`;
}

/** BPay customer code -> { bairCode, toot } */
function parseCustomerCode(code) {
  const m = String(code || "").trim().match(CUSTOMER_CODE_RE);
  if (!m) return null;
  return { bairCode: m[1], toot: normalizeToot(m[2]), suffix: m[3] };
}

/** СӨХ гэрээний байрыг олох: эхлээд barilgiinId, дараа нь bairNer дахь яг 216-219 тоо. */
function sukhBuildingCode(g) {
  const byId = SUKH_ID_TO_CODE.get(String(g.barilgiinId || ""));
  if (byId) return byId;
  const m = String(g.bairNer || "").match(/(?:^|\D)(216|217|218|219)(?:\D|$)/);
  return m ? m[1] : null;
}

function unitKey(bairCode, toot) {
  return `${bairCode}_${toot}`;
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/** BPay биллүүдийг нормчлох. Төлөгдсөн (isPaid) биллийг тусад нь тоолно. */
/**
 * BPay GET /api/billing/bills/:billingId хариу (Postman жишээ):
 *   data: { billingId, billingName, hasNewBills, newBillsCount, newBillAmount,
 *           newBills: [{ billId, billerName, billtype, billNo, billPeriod,
 *                        billTotalAmount, billLateFee, billAmount }] }
 * Жишээнд billAmount = billTotalAmount + billLateFee. Аппын адил billTotalAmount-ыг үндсэн дүн гэж авна.
 * Нэг billing-д өөр нэхэмжлэгчийн (жишээ нь дулаан) билл орж болох тул нэхэмжлэгчээр задална.
 */
function summarizeBills(rawList) {
  const raw = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
  let list = raw;
  let header = null;
  if (raw.length === 1 && raw[0] && typeof raw[0] === "object" && !raw[0].billId) {
    header = raw[0];
    const nestedKey = ["newBills", "bills", "billList", "items"].find((k) => Array.isArray(header[k]));
    // Билл байхгүй үед BPay billing объект л буцаана — түүнийг билл гэж тоолохгүй.
    list = nestedKey ? header[nestedKey] : [];
  }
  const rawSample = raw.length ? JSON.parse(JSON.stringify(raw[0])) : null;

  const bills = [];
  const byBiller = {};
  let total = 0; // зөвхөн СӨХ-ийн нэхэмжлэгч
  let lateFeeTotal = 0; // зөвхөн СӨХ-ийн нэхэмжлэгч
  let otherTotal = 0; // бусад нэхэмжлэгч (дулаан, цахилгаан гэх мэт)
  let paidCount = 0;
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    if (b.isPaid === true || b.isPaid === "true") {
      paidCount++;
      continue;
    }
    const lateFee = toAmount(b.billLateFee ?? b.billlateFee ?? b.lateFee);
    const amount = toAmount(b.billTotalAmount ?? b.totalAmount ?? b.amount ?? b.billAmount);
    const withLateFee = toAmount(b.billAmount) || amount + lateFee;
    const biller = String(b.billerName || "").trim() || "—";
    const isSokh = isSokhBiller(biller);
    if (isSokh) {
      total += amount;
      lateFeeTotal += lateFee;
    } else {
      otherTotal += amount;
    }
    byBiller[biller] = (byBiller[biller] || 0) + amount;
    bills.push({
      isSokh,
      billId: b.billId || b.id || "",
      billNo: b.billNo || "",
      billPeriod: b.billPeriod || b.period || "",
      billDescription: [biller !== "—" ? biller : "", b.billtype || b.billType || b.billDescription || ""].filter(Boolean).join(" · "),
      billerName: biller,
      amount,
      lateFee,
      withLateFee,
    });
  }
  return {
    total,
    lateFeeTotal,
    otherTotal,
    sokhBillsCount: bills.filter((x) => x.isSokh).length,
    bpayReportedTotal: header && header.newBillAmount !== undefined ? toAmount(header.newBillAmount) : null,
    byBiller,
    bills,
    paidCount,
    rawCount: list.length,
    rawSample,
  };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const STATUS_META = {
  MATCHED: { label: "🟢 Таарсан", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  MISMATCHED: { label: "🔴 Зөрсөн", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  BPAY_ERROR: { label: "⚠️ Билл татаж чадсангүй", cls: "bg-orange-100 text-orange-800 border-orange-300" },
  READY: { label: "⚡ BPay-д код бэлэн", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  CODE_DIFF: { label: "❗ BPay код өөр", cls: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300" },
  NOT_FOUND: { label: "⚪ BPay-д код алга", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  NOT_CHECKED: { label: "⚪ Шалгаагүй", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  NO_SUKH: { label: "❔ СӨХ-д гэрээгүй", cls: "bg-violet-100 text-violet-800 border-violet-300" },
};

function generateHtml(report, outputPath) {
  const { counts, totals, allRows, codePattern } = report;
  const safeJson = JSON.stringify({ rows: allRows, statusMeta: STATUS_META }).replace(/</g, "\\u003c");
  const statusButtons = Object.entries(STATUS_META)
    .map(
      ([k, v]) =>
        `<button onclick="setStatus('${k}')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium border ${v.cls}" data-status="${k}">${v.label} (${counts.byStatus[k] || 0})</button>`
    )
    .join("\n        ");

  const card = (title, value, sub, color) => `
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold ${color} uppercase tracking-wider">${title}</div>
        <div class="text-3xl font-black text-slate-900 mt-2">${value}</div>
        <div class="text-xs text-slate-500 mt-1">${sub}</div>
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Тайм тауэр BPay тулгалт</title>
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen p-4 sm:p-8">
  <div class="max-w-[1700px] mx-auto space-y-6">
    <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <span class="px-3 py-1 ${report.isAutoRegister ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"} font-bold text-xs rounded-full">
            ${report.isAutoRegister ? "⚡ BPAY-Д ХОЛБОХ ГОРИМ" : "🛡️ ЗӨВХӨН УНШИХ ГОРИМ"}
          </span>
          <span class="text-xs text-slate-500">Үүсгэсэн: ${new Date(report.generatedAt).toLocaleString("mn-MN")}</span>
        </div>
        <h1 class="text-2xl font-black text-slate-900 mt-2">${TIMETOWER_ORG_NAME} — СӨХ авлага ба BPay билл</h1>
        <p class="text-xs text-slate-500 mt-1">BPay тал = зөвхөн BPay customer code / billingId-тай бичлэг. Аппын хэрэглэгч тусдаа харагдана.</p>
        <p class="text-xs mt-1 ${codePattern.mismatched > 0 ? "text-rose-600 font-bold" : "text-slate-500"}">
          Customer code загвар: ${codePattern.checked} холбогдсон өрхөөс ${codePattern.matched} нь таарсан${codePattern.mismatched > 0 ? ` — ${codePattern.mismatched} ЗӨРСӨН, загварт бүрэн итгэхгүй!` : ""}.
          ${report.probe.enabled ? `Код шалгасан хэрэглэгч: ${report.probe.userLabel || "—"}.` : "Холбогдоогүй өрхийн кодыг BPay-ээс шалгаагүй (--no-probe)."}
        </p>
      </div>
      <button onclick="downloadCSV()" class="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold">CSV татах</button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      ${card("Нийт тоот", counts.totalUnits, "216–219 байр (СӨХ гэрээгээр)", "text-slate-500")}
      ${card("BPay-д холбогдсон", counts.bpayLinked, "billingId-тай өрх", "text-sky-700")}
      ${card("Аппын хэрэглэгчтэй", counts.appUsers, "BPay биш, апп-д бүртгэлтэй", "text-indigo-700")}
      ${card("BPay-д код бэлэн", counts.byStatus.READY || 0, "Холбоход бэлэн", "text-amber-700")}
      ${card("Зөрсөн / алдаа", `${counts.byStatus.MISMATCHED || 0} / ${counts.byStatus.BPAY_ERROR || 0}`, "Зөвхөн BPay-тэй өрхүүдээс", "text-rose-700")}
    </div>

    <div class="bg-slate-900 text-white rounded-2xl p-5 flex flex-wrap gap-8">
      <div><div class="text-xs text-slate-400">СӨХ авлага (бүх өрх)</div><div class="text-xl font-black text-emerald-400">${formatMoney(totals.sukhAll)}</div></div>
      <div><div class="text-xs text-slate-400">СӨХ авлага (BPay-тэй өрх)</div><div class="text-xl font-black text-emerald-300">${formatMoney(totals.sukhLinked)}</div></div>
      <div><div class="text-xs text-slate-400">BPay ${SOKH_BILLER_NAME.replace(/[<>&"']/g, "")} билл</div><div class="text-xl font-black text-sky-400">${formatMoney(totals.bpay)}</div></div>
      <div><div class="text-xs text-slate-400">Зөрүү (BPay-тэй өрх)</div><div class="text-xl font-black text-rose-400">${formatMoney(totals.sukhLinked - totals.bpay)}</div></div>
      <div><div class="text-xs text-slate-400">Урьдчилгаатай (СӨХ &lt; 0)</div><div class="text-xl font-black text-amber-400">${counts.negativeSukh} өрх</div></div>
    </div>

    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div class="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <input id="q" oninput="render()" placeholder="Тоот, утас, нэр, код, гэрээ..." class="w-full md:w-96 px-4 py-2.5 rounded-xl border border-slate-300 text-xs">
        <div class="flex gap-1.5 flex-wrap">
          ${["ALL", ...BUILDING_CODES].map((b) => `<button onclick="setBld('${b}')" class="bld-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100" data-bld="${b}">${b === "ALL" ? "Бүх байр" : b + "-р байр"}</button>`).join("")}
        </div>
      </div>
      <div class="flex gap-2 flex-wrap border-t border-slate-100 pt-3">
        <button onclick="setStatus('ALL')" class="status-btn px-3 py-1 rounded-lg text-xs font-medium border" data-status="ALL">Бүгд (${allRows.length})</button>
        ${statusButtons}
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto max-h-[800px]">
        <table class="w-full text-left text-xs">
          <thead class="sticky top-0 bg-slate-100 font-bold">
            <tr>
              <th class="py-3 px-3">№</th>
              <th class="py-3 px-3">Байр, тоот</th>
              <th class="py-3 px-3 bg-emerald-50">СӨХ гэрээ</th>
              <th class="py-3 px-3 bg-emerald-50 text-right">СӨХ авлага</th>
              <th class="py-3 px-3 bg-indigo-50">Аппын хэрэглэгч</th>
              <th class="py-3 px-3 bg-sky-50">BPay</th>
              <th class="py-3 px-3 bg-sky-50 text-right">BPay төлөх</th>
              <th class="py-3 px-3 text-right">Зөрүү</th>
              <th class="py-3 px-3 text-center">Төлөв</th>
            </tr>
          </thead>
          <tbody id="tb" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
      <div class="p-3 border-t text-xs text-slate-500">Харагдаж буй: <b id="vis">0</b> / ${allRows.length}</div>
    </div>
  </div>

<script>
  const DATA = ${safeJson};
  let bld = 'ALL', status = 'ALL';
  const open = new Set();
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n) => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('mn-MN') + ' ₮';

  function setBld(b) { bld = b; render(); }
  function setStatus(s) { status = s; render(); }
  function toggle(k) { open.has(k) ? open.delete(k) : open.add(k); render(); }

  function render() {
    document.querySelectorAll('.bld-btn').forEach((e) => e.classList.toggle('ring-2', e.dataset.bld === bld));
    document.querySelectorAll('.status-btn').forEach((e) => e.classList.toggle('ring-2', e.dataset.status === status));
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = DATA.rows.filter((r) => {
      if (bld !== 'ALL' && r.building !== bld) return false;
      if (status !== 'ALL' && r.status !== status) return false;
      if (!q) return true;
      return [r.building, r.toot, r.customerCode, r.sukh?.ner, r.sukh?.ovog, r.sukh?.utas, r.sukh?.gereeniiDugaar,
        ...(r.appUsers || []).map((u) => u.utas + ' ' + u.ner),
        ...(r.bpay?.users || []).map((u) => u.utas + ' ' + u.ner), r.bpay?.billingId, r.probe?.customerName]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
    document.getElementById('vis').innerText = rows.length;
    let h = '';
    rows.forEach((r, i) => {
      const m = DATA.statusMeta[r.status] || {};
      const sukhPhones = new Set(r.sukh?.phones || []);
      const phoneCls = (p) => sukhPhones.has(p) ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold';
      let bpayCell = '<span class="text-slate-400 italic">Холбогдоогүй</span>';
      if (r.bpay) {
        bpayCell = (r.bpay.users || []).map((u) => '<div>' + esc(u.ner || '—') + ' · <span class="' + phoneCls(u.utas) + '">' + esc(u.utas || '—') + '</span></div>').join('') +
          '<div class="text-[10px] text-slate-500 font-mono">Код: ' + esc(r.bpay.customerCode || '—') + ' · Bid: ' + esc((r.bpay.billingId || '').slice(0, 8)) + '…</div>' +
          (r.bpay.error ? '<div class="text-[10px] text-orange-700">' + esc(r.bpay.error) + '</div>' : '');
      } else if (r.probe) {
        bpayCell = r.probe.found
          ? '<div class="text-amber-800 font-bold">BPay-д хаяг байна' + (r.probe.candidates > 1 ? ' (' + r.probe.candidates + ' хэрэглэгч)' : '') + '</div><div class="text-[10px] text-slate-500">' + esc(r.probe.customerName || '') + ' · ' + esc(r.probe.address || '') + '</div>' +
            '<div class="text-[10px] font-mono ' + (r.probe.codeMatches ? 'text-slate-500' : 'text-fuchsia-700 font-bold') + '">BPay код: ' + esc(r.probe.customerCode || '—') + '</div>'
          : (r.probe.error ? '<div class="text-[10px] text-orange-700">Шалгах алдаа: ' + esc(r.probe.error) + '</div>' : '<span class="text-slate-400 italic">BPay-д код олдсонгүй</span>');
        bpayCell += '<div class="text-[10px] text-slate-400 font-mono">Код: ' + esc(r.customerCode || '—') + '</div>';
      }
      if (r.registerResult) bpayCell += '<div class="text-[10px] font-bold ' + (r.registerResult.ok ? 'text-emerald-700' : 'text-rose-700') + '">' + esc(r.registerResult.message) + '</div>';

      const bills = r.bpay?.bills || [];
      const diff = r.diff;
      h += '<tr class="hover:bg-slate-50">' +
        '<td class="py-2 px-3 text-slate-400 font-mono">' + (i + 1) + '</td>' +
        '<td class="py-2 px-3"><div class="font-bold">' + esc(r.building) + '-р байр</div><div class="font-black text-emerald-700">' + esc(r.toot) + ' тоот</div></td>' +
        '<td class="py-2 px-3 bg-emerald-50/30">' + (r.sukh
          ? '<div class="font-bold">' + esc(r.sukh.ner) + ' ' + (r.sukh.ovog ? '(' + esc(r.sukh.ovog) + ')' : '') + '</div><div class="text-[11px] text-slate-600">' + esc((r.sukh.phones || []).join(', ') || '—') + ' · ' + esc(r.sukh.gereeniiDugaar) + (r.sukh.contractsCount > 1 ? ' · ' + r.sukh.contractsCount + ' гэрээ' : '') + '</div>'
          : '<span class="text-slate-400 italic">Гэрээгүй</span>') + '</td>' +
        '<td class="py-2 px-3 bg-emerald-50/30 text-right font-mono font-black ' + (r.sukhBalance < 0 ? 'text-amber-600' : '') + '">' + (r.sukh ? money(r.sukhBalance) : '—') + '</td>' +
        '<td class="py-2 px-3 bg-indigo-50/30 text-[11px]">' + ((r.appUsers || []).length ? r.appUsers.map((u) => '<div>' + esc(u.ner || '—') + ' · ' + esc(u.utas || '—') + '</div>').join('') : '<span class="text-slate-400">—</span>') + '</td>' +
        '<td class="py-2 px-3 bg-sky-50/30 text-[11px]">' + bpayCell + '</td>' +
        '<td class="py-2 px-3 bg-sky-50/30 text-right font-mono">' + (r.bpay && !r.bpay.error
          ? '<div class="font-black">' + money(r.bpay.total) + '</div>' +
            (r.bpay.lateFeeTotal ? '<div class="text-[10px] text-rose-500">+ алданги ' + money(r.bpay.lateFeeTotal) + '</div>' : '') +
            (r.bpay.bpayReportedTotal !== null && r.bpay.bpayReportedTotal !== undefined && Math.abs(r.bpay.bpayReportedTotal - r.bpay.total) >= 1 ? '<div class="text-[10px] text-slate-500">BPay нийт: ' + money(r.bpay.bpayReportedTotal) + '</div>' : '') +
            (Object.keys(r.bpay.byBiller || {}).length > 1 ? Object.entries(r.bpay.byBiller).map(([k, v]) => '<div class="text-[10px] text-slate-500">' + esc(k) + ': ' + money(v) + '</div>').join('') : '') + (bills.length ? '<button onclick="toggle(\\'' + r.key + '\\')" class="text-[10px] text-sky-700 font-bold underline">' + bills.length + ' билл</button>' : '<div class="text-[10px] text-slate-400">Төлөх биллгүй</div>') + (r.bpay.paidCount ? '<div class="text-[10px] text-slate-400">' + r.bpay.paidCount + ' төлөгдсөн</div>' : '')
          : '—') + '</td>' +
        '<td class="py-2 px-3 text-right font-mono font-black ' + (diff > 0 ? 'text-rose-600' : diff < 0 ? 'text-amber-600' : 'text-emerald-600') + '">' + (diff === null || diff === undefined ? '—' : (diff > 0 ? '+' : '') + money(diff)) + '</td>' +
        '<td class="py-2 px-3 text-center"><span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ' + (m.cls || '') + '">' + esc(m.label || r.status) + '</span></td>' +
        '</tr>';
      if (open.has(r.key) && bills.length) {
        h += '<tr class="bg-sky-50/50"><td colspan="9" class="p-3 pl-16"><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">' +
          bills.map((b) => '<div class="bg-white p-2 rounded-lg border ' + (b.isSokh ? 'border-sky-300' : 'opacity-50') + '" title="' + (b.isSokh ? 'СӨХ-ийн билл' : 'Бусад нэхэмжлэгч, тулгалтад ороогүй') + '"><div class="flex justify-between font-bold"><span>' + esc(b.billPeriod || 'Билл') + '</span><span class="font-mono text-sky-700">' + money(b.amount) + '</span></div><div class="text-[11px] text-slate-500">' + esc(b.billDescription) + '</div>' + (b.lateFee ? '<div class="text-[10px] text-rose-500">Алданги: ' + money(b.lateFee) + '</div>' : '') + '</div>').join('') +
          '</div></td></tr>';
      }
    });
    document.getElementById('tb').innerHTML = h || '<tr><td colspan="9" class="p-8 text-center text-slate-400">Тохирох өрх олдсонгүй</td></tr>';
  }

  function downloadCSV() {
    const head = ['Байр','Тоот','Customer code','СӨХ нэр','СӨХ утас','Гэрээ','СӨХ авлага','Аппын хэрэглэгч','BPay хэрэглэгч','BPay billingId','BPay төлөх','Зөрүү','Төлөв'];
    const lines = DATA.rows.map((r) => [r.building, r.toot, r.customerCode, (r.sukh?.ner || '') + ' ' + (r.sukh?.ovog || ''), (r.sukh?.phones || []).join(' '), r.sukh?.gereeniiDugaar || '', r.sukh ? r.sukhBalance : '',
      (r.appUsers || []).map((u) => u.utas).join(' '), (r.bpay?.users || []).map((u) => u.utas).join(' '), r.bpay?.billingId || '', r.bpay && !r.bpay.error ? r.bpay.total : '', r.diff ?? '', (DATA.statusMeta[r.status] || {}).label || r.status]);
    const csv = '\\uFEFF' + [head, ...lines].map((l) => l.map((x) => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'timetower_bpay.csv';
    a.click();
  }
  render();
</script>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  if (isSaveAddress) {
    // Зөвхөн BPay-ээс хаяг уншина — MongoDB-д холбогдохгүй.
    const wallet = require("../services/walletApiService");
    try {
      await saveAddressTree(wallet);
    } catch (e) {
      console.error(`❌ Хаягийн мод татаж чадсангүй: ${e.message}`);
      process.exitCode = 1;
    }
    return;
  }

  const uriTemplate = getMongoUriTemplate();
  console.log("=".repeat(80));
  console.log(`🏢 ${TIMETOWER_ORG_NAME} — СӨХ авлага ба BPay биллийн тулгалт`);
  console.log(isAutoRegister ? "⚡ ГОРИМ: BPay-д холбох (бичилт хийнэ)" : "🛡️  ГОРИМ: Зөвхөн унших");
  console.log("=".repeat(80));

  const connect = async (dbName) => {
    const uri = uriTemplate.replace("{db}", dbName);
    console.log(`🔌 ${dbName}: ${uri.replace(/:([^:@/]+)@/, ":****@")}`);
    return mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }).asPromise();
  };

  let mainConn;
  let tenantConn;
  try {
    mainConn = await connect(MAIN_DB_NAME);
    tenantConn = await connect(TIMETOWER_DB_NAME);
  } catch (err) {
    console.error(`❌ Сантай холбогдож чадсангүй: ${err.message}`);
    if (mainConn) await mainConn.close();
    process.exit(1);
  }

  let wallet = null;
  try {
    wallet = require("../services/walletApiService");
    if (!(await wallet.getWalletServiceToken())) wallet = null;
  } catch (e) {
    console.log(`   ℹ️ BPay API бэлэн биш: ${e.message}`);
    wallet = null;
  }
  if (!wallet) {
    console.log("   ⚠️ BPay API-гүй ажиллаж байна — биллийн дүн, кодын шалгалт хийгдэхгүй.");
    if (isAutoRegister) {
      console.error("❌ BPay API-гүйгээр холбох боломжгүй.");
      process.exit(1);
    }
  }

  try {
    // -----------------------------------------------------------------------
    // 1. СӨХ: гэрээ + авлагын журнал
    // -----------------------------------------------------------------------
    console.log("\n📦 1. СӨХ-ийн гэрээ, авлагын журнал...");
    const ledgerAgg = await tenantConn
      .collection("guilgeeAvlaguud")
      .aggregate([{ $group: { _id: "$gereeniiId", dun: { $sum: "$dun" } } }])
      .toArray();
    const ledgerMap = new Map(ledgerAgg.filter((x) => x._id).map((x) => [String(x._id), x.dun || 0]));

    const gereenuud = await tenantConn
      .collection("geree")
      .find({ tuluv: { $ne: "Устгасан" } })
      .project({ gereeniiDugaar: 1, toot: 1, bairNer: 1, barilgiinId: 1, orshinSuugchId: 1, ner: 1, ovog: 1, utas: 1, ekhniiUldegdel: 1 })
      .toArray();

    const units = new Map(); // key -> unit
    const getUnit = (bairCode, toot) => {
      const key = unitKey(bairCode, toot);
      if (!units.has(key)) {
        units.set(key, {
          key,
          building: bairCode,
          toot,
          customerCode: makeCustomerCode(bairCode, toot),
          contracts: [],
          appUsers: [],
          bpayEntries: [],
        });
      }
      return units.get(key);
    };

    let skippedContracts = 0;
    for (const g of gereenuud) {
      const bairCode = sukhBuildingCode(g);
      const toot = normalizeToot(g.toot);
      if (!bairCode || !toot) {
        skippedContracts++;
        continue;
      }
      const gid = String(g._id);
      getUnit(bairCode, toot).contracts.push({
        gereeId: gid,
        gereeniiDugaar: g.gereeniiDugaar || "",
        ner: g.ner || "",
        ovog: g.ovog || "",
        phone: normalizePhone(g.utas),
        orshinSuugchId: g.orshinSuugchId ? String(g.orshinSuugchId) : "",
        balance: ledgerMap.has(gid) ? ledgerMap.get(gid) : toAmount(g.ekhniiUldegdel),
      });
    }
    console.log(`   └─ Гэрээ: ${gereenuud.length}, тоот: ${units.size}, байр/тоот тодорхойгүй: ${skippedContracts}`);

    // -----------------------------------------------------------------------
    // 2. amarSukh.orshinSuugch: BPay-ийн бичлэг ба аппын хэрэглэгч
    // -----------------------------------------------------------------------
    console.log("\n👥 2. Оршин суугчид (BPay ба апп)...");
    const codeRegex = /^2003260(216|217|218|219)\d{6}$/;
    const residents = await mainConn
      .collection("orshinSuugch")
      .find({
        $or: [
          { baiguullagiinId: TIMETOWER_ORG_ID },
          { "toots.baiguullagiinId": TIMETOWER_ORG_ID },
          { "toots.barilgiinId": { $in: BUILDINGS.map((b) => b.sukhId) } },
          { "toots.walletCustomerCode": codeRegex },
          { "toots.walletCustomerId": codeRegex },
        ],
      })
      .project({ ner: 1, ovog: 1, utas: 1, toots: 1, walletUserId: 1, baiguullagiinId: 1, barilgiinId: 1, toot: 1 })
      .toArray();

    const knownBpayBairIds = Object.fromEntries(BUILDINGS.map((b) => [b.code, new Set(b.bpayBairId ? [b.bpayBairId] : [])]));
    let unknownBpayToots = 0;

    for (const r of residents) {
      const phone = normalizePhone(r.utas);
      const person = { residentId: String(r._id), ner: r.ner || "", ovog: r.ovog || "", utas: phone };
      const seenAppUnits = new Set();

      for (const t of r.toots || []) {
        const code = String(t.walletCustomerCode || t.walletCustomerId || "").trim();
        const parsed = parseCustomerCode(code);
        if (parsed) {
          // walletDoorNo-г кодоос гаргахгүй — загварыг шалгахад бие даасан утга хэрэгтэй.
          const toot = normalizeToot(t.walletDoorNo);
          if (t.walletBairId) knownBpayBairIds[parsed.bairCode].add(String(t.walletBairId));
          getUnit(parsed.bairCode, parsed.toot).bpayEntries.push({
            ...person,
            source: "ORSHIN_SUUGCH_TOOT",
            customerCode: code,
            customerId: t.walletCustomerId && t.walletCustomerId !== code ? String(t.walletCustomerId) : "",
            walletDoorNo: toot,
            billingId: t.billingId || "",
            walletUserId: t.walletUserId || r.walletUserId || "",
            address: t.bairniiNer || "",
          });
          continue;
        }
        if (t.source === "WALLET_API") {
          // BPay бичлэг боловч Тайм тауэрын код биш — тоолоод алгасна.
          if (t.walletCustomerCode || t.walletCustomerId) unknownBpayToots++;
          continue;
        }
        // Аппын хэрэглэгч: зөвхөн Тайм тауэрын барилгын ID-аар
        const bairCode = SUKH_ID_TO_CODE.get(String(t.barilgiinId || ""));
        const toot = normalizeToot(t.toot);
        if (bairCode && toot) {
          const key = unitKey(bairCode, toot);
          if (!seenAppUnits.has(key)) {
            seenAppUnits.add(key);
            getUnit(bairCode, toot).appUsers.push(person);
          }
        }
      }

      // Хуучин бүтэц: toots-гүй, дээд түвшний barilgiinId/toot
      const topBair = SUKH_ID_TO_CODE.get(String(r.barilgiinId || ""));
      const topToot = normalizeToot(r.toot);
      if (topBair && topToot && !seenAppUnits.has(unitKey(topBair, topToot)) && !(r.toots || []).length) {
        getUnit(topBair, topToot).appUsers.push(person);
      }
    }

    // walletInvoice — billingId-ийг нэмж олох. customerId нь BPay-ийн UUID эсвэл код байж болно.
    const uuidToUnit = new Map();
    for (const u of units.values()) {
      for (const e of u.bpayEntries) if (e.customerId) uuidToUnit.set(e.customerId, u);
    }
    const walletInvoices = await mainConn
      .collection("walletInvoice")
      .find({ $or: [{ customerId: codeRegex }, { customerId: { $in: [...uuidToUnit.keys()] } }] })
      .project({ billingId: 1, customerId: 1, customerName: 1, customerAddress: 1, userId: 1 })
      .toArray();
    for (const w of walletInvoices) {
      if (!w.billingId) continue;
      const parsed = parseCustomerCode(w.customerId);
      const unit = parsed ? getUnit(parsed.bairCode, parsed.toot) : uuidToUnit.get(String(w.customerId));
      if (!unit) continue;
      if (unit.bpayEntries.some((e) => e.billingId === w.billingId)) continue;
      unit.bpayEntries.push({
        source: "WALLET_INVOICE",
        ner: w.customerName || "",
        utas: normalizePhone(w.userId),
        customerCode: unit.customerCode,
        customerId: parsed ? "" : String(w.customerId),
        billingId: w.billingId,
        walletUserId: "",
        address: w.customerAddress || "",
      });
    }

    const bpayUnitCount = [...units.values()].filter((u) => u.bpayEntries.length).length;
    console.log(`   └─ Оршин суугч: ${residents.length}, BPay-тэй тоот: ${bpayUnitCount}, Тайм тауэрын биш BPay toot: ${unknownBpayToots}`);

    // -----------------------------------------------------------------------
    // 3. Customer code загварыг шалгах
    // -----------------------------------------------------------------------
    const codePattern = { checked: 0, matched: 0, mismatched: 0, examples: [] };
    for (const u of units.values()) {
      for (const e of u.bpayEntries) {
        if (!e.walletDoorNo) continue;
        codePattern.checked++;
        if (makeCustomerCode(u.building, e.walletDoorNo) === e.customerCode) codePattern.matched++;
        else {
          codePattern.mismatched++;
          if (codePattern.examples.length < 10) codePattern.examples.push({ key: u.key, doorNo: e.walletDoorNo, code: e.customerCode });
        }
      }
    }
    console.log(`\n🔢 3. Customer code загвар: ${codePattern.matched}/${codePattern.checked} таарсан`);
    if (codePattern.mismatched) console.log("   ⚠️ Зөрсөн жишээ:", codePattern.examples);

    // -----------------------------------------------------------------------
    // 4. BPay биллүүд (холбогдсон өрхүүд)
    // -----------------------------------------------------------------------
    const bpayResults = new Map(); // key -> { billingId, users, customerCode, total, bills, error }
    if (wallet) {
      console.log("\n💳 4. BPay-ийн төлөх биллүүд...");
      const linked = [...units.values()].filter((u) => u.bpayEntries.some((e) => e.billingId));
      let done = 0;
      await inBatches(linked, 8, async (u) => {
        const withBilling = u.bpayEntries.filter((e) => e.billingId);
        const billingIds = [...new Set(withBilling.map((e) => e.billingId))];
        const errors = [];
        let result = null;
        // Аппын адил: billing бүрийг эзэмшигчийн утас, дараа нь walletUserId-аар оролдоно.
        outer: for (const billingId of billingIds) {
          const owners = withBilling.filter((e) => e.billingId === billingId);
          const candidates = [...new Set(owners.flatMap((e) => [e.utas, e.walletUserId]).filter(Boolean))];
          for (const userId of candidates) {
            try {
              const raw = await wallet.getBillingBills(userId, billingId);
              result = { billingId, ...summarizeBills(raw) };
              break outer;
            } catch (e) {
              errors.push(`${userId}: ${e.response?.data?.responseMsg || e.message}`);
            }
          }
          if (!candidates.length) errors.push(`${billingId.slice(0, 8)}: эзэмшигчийн утас алга`);
        }
        bpayResults.set(u.key, result || { billingId: billingIds[0], total: 0, bills: [], paidCount: 0, error: errors.join("; ") || "Билл татаж чадсангүй" });
        done++;
        if (done % 20 === 0 || done === linked.length) process.stdout.write(`   └─ ${done}/${linked.length}\r`);
      });
      console.log("");
    }

    // -----------------------------------------------------------------------
    // 5. Холбогдоогүй өрхийн кодыг BPay-ээс шалгах (зөвхөн унших)
    // -----------------------------------------------------------------------
    const probe = { enabled: false, userLabel: "" };
    const probeResults = new Map();
    const unlinked = [...units.values()].filter(
      (u) => u.contracts.length && !u.bpayEntries.some((e) => e.billingId) && u.customerCode &&
        (!targetBair || u.building === targetBair) && (!targetToot || u.toot === normalizeToot(targetToot))
    );

    if (wallet && (doProbe || isAutoRegister) && unlinked.length) {
      // BPay API нь userId толгой шаарддаг — бүртгэлтэй хэрэглэгчийн утсыг ашиглана.
      let probeUser = normalizePhone(probeUserArg);
      if (!probeUser) {
        const known = [...units.values()].flatMap((u) => u.bpayEntries).find((e) => e.utas && e.billingId);
        probeUser = known ? known.utas : "";
      }
      if (!probeUser) {
        console.log("\n⚠️ 5. Кодыг шалгах BPay хэрэглэгч олдсонгүй (--probe-user <утас> өгнө үү).");
      } else {
        probe.enabled = true;
        probe.userLabel = `${probeUser.slice(0, 2)}****${probeUser.slice(-2)}`;
        loadSavedBairIds(knownBpayBairIds);
        await discoverMissingBairIds(wallet, knownBpayBairIds);
        probe.bairIds = Object.fromEntries(Object.entries(knownBpayBairIds).map(([k, v]) => [k, [...v]]));
        for (const [code, ids] of Object.entries(probe.bairIds)) {
          console.log(`   └─ ${code}-р байр BPay bairId: ${ids.join(", ") || "ОЛДСОНГҮЙ"}`);
        }
        console.log(`\n🔎 5. ${unlinked.length} холбогдоогүй өрхийг BPay-ээс хаягаар шалгаж байна (хэрэглэгч ${probe.userLabel})...`);
        let done = 0;
        // Аппын адил: bairId + тоотоор хайж, customerId (UUID) ба customerCode-ыг авна.
        await inBatches(unlinked, 5, async (u) => {
          const bairIds = [...knownBpayBairIds[u.building]];
          if (!bairIds.length) {
            probeResults.set(u.key, { found: false, error: `${u.building}-р байрны BPay bairId тодорхойгүй` });
          } else {
            const errors = [];
            for (const bairId of bairIds) {
              try {
                const list = (await wallet.getBillingByAddress(probeUser, bairId, u.toot)) || [];
                if (!list.length) continue;
                const c = list.find((x) => String(x.customerCode) === u.customerCode) || list[0];
                probeResults.set(u.key, {
                  found: true,
                  bairId,
                  customerId: c.customerId || "",
                  customerCode: String(c.customerCode || ""),
                  codeMatches: String(c.customerCode || "") === u.customerCode,
                  candidates: list.length,
                  customerName: c.customerName || "",
                  address: c.customerAddress || c.bairName || "",
                });
                break;
              } catch (e) {
                errors.push(e.response?.data?.responseMsg || e.message);
              }
            }
            if (!probeResults.has(u.key)) {
              probeResults.set(u.key, errors.length ? { found: false, error: errors.join("; ") } : { found: false });
            }
          }
          done++;
          if (done % 20 === 0 || done === unlinked.length) process.stdout.write(`   └─ ${done}/${unlinked.length}\r`);
        });
        console.log("");
      }
    }

    // -----------------------------------------------------------------------
    // 6. BPay-д холбох (--auto-register)
    // -----------------------------------------------------------------------
    const registerResults = new Map();
    if (isAutoRegister) {
      console.log("\n⚡ 6. BPay-д холбож байна...");
      // Зөвхөн BPay-ийн буцаасан customerCode нь тоотоос үүсгэсэн кодтой яг таарсан өрх.
      const candidates = unlinked.filter((u) => {
        const p = probeResults.get(u.key);
        return p?.found && p.codeMatches && p.customerId;
      });
      const max = registerLimit > 0 ? registerLimit : candidates.length;
      for (const u of candidates.slice(0, max)) {
        const c = u.contracts.find((x) => x.phone) || u.contracts[0];
        const label = `${u.building}-${u.toot}`;
        if (!c || !c.phone) {
          registerResults.set(u.key, { ok: false, message: "Гэрээнд утас алга" });
          continue;
        }
        try {
          const res = await registerUnit(mainConn, wallet, u, c, probeResults.get(u.key));
          registerResults.set(u.key, res);
          console.log(`   ${res.ok ? "✅" : "❌"} ${label}: ${res.message}`);
          if (res.ok && res.billingId) {
            u.bpayEntries.push({ source: "AUTO_REGISTERED", ner: c.ner, utas: c.phone, customerCode: u.customerCode, billingId: res.billingId, walletUserId: res.walletUserId });
            try {
              bpayResults.set(u.key, { billingId: res.billingId, ...summarizeBills(await wallet.getBillingBills(c.phone, res.billingId)) });
            } catch (e) {
              bpayResults.set(u.key, { billingId: res.billingId, total: 0, bills: [], paidCount: 0, error: e.message });
            }
          }
        } catch (e) {
          registerResults.set(u.key, { ok: false, message: e.response?.data?.responseMsg || e.message });
          console.log(`   ❌ ${label}: ${e.message}`);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 7. Тулгалт
    // -----------------------------------------------------------------------
    const keys = [...units.keys()].sort((a, b) => {
      const [ba, ta] = a.split("_");
      const [bb, tb] = b.split("_");
      if (ba !== bb) return ba.localeCompare(bb);
      return (parseInt(ta, 10) || 0) - (parseInt(tb, 10) || 0) || ta.localeCompare(tb);
    });

    const byStatus = {};
    const totals = { sukhAll: 0, sukhLinked: 0, bpay: 0 };
    let negativeSukh = 0;
    let appUserUnits = 0;
    const allRows = [];

    for (const key of keys) {
      const u = units.get(key);
      const hasSukh = u.contracts.length > 0;
      const sukhBalance = u.contracts.reduce((s, c) => s + (c.balance || 0), 0);
      if (hasSukh) totals.sukhAll += sukhBalance;
      if (hasSukh && sukhBalance < 0) negativeSukh++;
      if (u.appUsers.length) appUserUnits++;

      const live = bpayResults.get(key);
      const bpayUsers = [];
      const seen = new Set();
      for (const e of u.bpayEntries) {
        const id = e.utas || e.ner;
        if (id && !seen.has(id)) {
          seen.add(id);
          bpayUsers.push({ ner: e.ner, utas: e.utas });
        }
      }

      let status;
      let diff = null;
      if (!hasSukh) status = "NO_SUKH";
      else if (live && live.error) status = "BPAY_ERROR";
      else if (live) {
        diff = sukhBalance - live.total;
        status = Math.abs(diff) < 1 ? "MATCHED" : "MISMATCHED";
        totals.sukhLinked += sukhBalance;
        totals.bpay += live.total;
      } else {
        const p = probeResults.get(key);
        status = !p ? "NOT_CHECKED" : p.found ? (p.codeMatches ? "READY" : "CODE_DIFF") : p.error ? "NOT_CHECKED" : "NOT_FOUND";
      }
      byStatus[status] = (byStatus[status] || 0) + 1;

      const sukhPhones = [...new Set(u.contracts.map((c) => c.phone).filter(Boolean))];
      allRows.push({
        key,
        building: u.building,
        toot: u.toot,
        customerCode: u.customerCode,
        status,
        sukhBalance,
        diff,
        sukh: hasSukh
          ? {
              ner: u.contracts[0].ner,
              ovog: u.contracts[0].ovog,
              phones: sukhPhones,
              gereeniiDugaar: u.contracts.map((c) => c.gereeniiDugaar).join(", "),
              contractsCount: u.contracts.length,
            }
          : null,
        appUsers: u.appUsers.map((p) => ({ ner: p.ner, utas: p.utas })),
        bpay: u.bpayEntries.length
          ? {
              customerCode: u.bpayEntries[0].customerCode,
              billingId: live?.billingId || u.bpayEntries.find((e) => e.billingId)?.billingId || "",
              users: bpayUsers,
              phoneMatched: bpayUsers.some((x) => sukhPhones.includes(x.utas)),
              total: live ? live.total : null,
              lateFeeTotal: live?.lateFeeTotal || 0,
              bills: live?.bills || [],
              paidCount: live?.paidCount || 0,
              otherTotal: live?.otherTotal || 0,
              sokhBillsCount: live?.sokhBillsCount || 0,
              bpayReportedTotal: live?.bpayReportedTotal ?? null,
              byBiller: live?.byBiller || {},
              rawSample: live?.rawSample ?? null,
              error: live?.error || (live ? "" : "billingId алга"),
            }
          : null,
        probe: probeResults.get(key) || null,
        registerResult: registerResults.get(key) || null,
      });
    }

    const report = {
      isAutoRegister,
      generatedAt: new Date().toISOString(),
      organization: { id: TIMETOWER_ORG_ID, name: TIMETOWER_ORG_NAME, buildings: BUILDINGS },
      codePattern,
      probe,
      counts: {
        totalUnits: allRows.filter((r) => r.sukh).length,
        bpayLinked: allRows.filter((r) => r.bpay && r.bpay.billingId).length,
        appUsers: appUserUnits,
        negativeSukh,
        byStatus,
      },
      totals,
      sokhBillerName: SOKH_BILLER_NAME,
      billersSeen: {},
      allRows,
    };
    // BPay-д харагдсан бүх нэхэмжлэгчийн нэр — СӨХ-ийн нэр зөв эсэхийг шалгахад.
    for (const r of allRows) {
      for (const [name, amt] of Object.entries(r.bpay?.byBiller || {})) {
        const b = (report.billersSeen[name] = report.billersSeen[name] || { units: 0, amount: 0, isSokh: isSokhBiller(name) });
        b.units++;
        b.amount += amt;
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log(`🧾 BPay нэхэмжлэгчид (СӨХ = "${SOKH_BILLER_NAME}"):`);
    for (const [name, b] of Object.entries(report.billersSeen)) {
      console.log(`   ${b.isSokh ? "✅" : "  "} ${name}: ${b.units} тоот, ${formatMoney(b.amount)}`);
    }
    if (Object.keys(report.billersSeen).length && !Object.values(report.billersSeen).some((b) => b.isSokh)) {
      console.log(`   ⚠️ "${SOKH_BILLER_NAME}" нэртэй нэхэмжлэгч олдсонгүй — --biller "<нэр>" өгнө үү.`);
    }
    console.log(`🏢 СӨХ гэрээтэй тоот        : ${report.counts.totalUnits}`);
    console.log(`💳 BPay-д холбогдсон тоот    : ${report.counts.bpayLinked}`);
    console.log(`📱 Аппын хэрэглэгчтэй тоот   : ${report.counts.appUsers}`);
    for (const [k, v] of Object.entries(byStatus)) console.log(`   ${STATUS_META[k]?.label || k}: ${v}`);
    console.log(`💰 СӨХ авлага (бүгд)         : ${formatMoney(totals.sukhAll)}`);
    console.log(`💰 СӨХ авлага (BPay-тэй)     : ${formatMoney(totals.sukhLinked)}`);
    console.log(`💳 BPay СӨХ-ийн төлөх билл    : ${formatMoney(totals.bpay)}`);
    console.log(`⚖️  Зөрүү (BPay-тэй өрх)      : ${formatMoney(totals.sukhLinked - totals.bpay)}`);
    console.log("=".repeat(80));

    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, "timetower_bpay_match_report.json");
    const htmlPath = path.join(outDir, "timetower_bpay_match.html");
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");
    generateHtml(report, htmlPath);

    // Excel-тэй тулгах CSV: (1) тоот бүрийн дүн, (2) BPay-ийн СӨХ-ийн билл бүр.
    const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const unitsCsvPath = path.join(outDir, "timetower_units.csv");
    fs.writeFileSync(
      unitsCsvPath,
      toCsv([
        ["Байр", "Тоот", "Customer code", "Гэрээ", "СӨХ систем үлдэгдэл", "BPay СӨХ төлөх", "BPay СӨХ алданги", "BPay СӨХ биллийн тоо", "BPay бусад нэхэмжлэгч", "Зөрүү (СӨХ - BPay)", "Төлөв"],
        ...allRows.map((r) => [
          r.building, r.toot, r.customerCode, r.sukh?.gereeniiDugaar || "", r.sukh ? r.sukhBalance : "",
          r.bpay && !r.bpay.error ? r.bpay.total : "", r.bpay?.lateFeeTotal || "", r.bpay?.sokhBillsCount ?? "",
          r.bpay?.otherTotal || "", r.diff ?? "", STATUS_META[r.status]?.label || r.status,
        ]),
      ]),
      "utf-8"
    );
    const billsCsvPath = path.join(outDir, "timetower_bpay_sokh_bills.csv");
    fs.writeFileSync(
      billsCsvPath,
      toCsv([
        ["Байр", "Тоот", "Customer code", "BillingId", "Нэхэмжлэгч", "Төрөл", "Сар", "Биллийн №", "Дүн", "Алданги", "Алдангитай дүн"],
        ...allRows.flatMap((r) =>
          (r.bpay?.bills || []).filter((b) => b.isSokh).map((b) => [
            r.building, r.toot, r.customerCode, r.bpay.billingId, b.billerName, b.billDescription, b.billPeriod, b.billNo, b.amount, b.lateFee, b.withLateFee,
          ])
        ),
      ]),
      "utf-8"
    );
    console.log(`📄 ${jsonPath}\n🌐 ${htmlPath}\n📊 ${unitsCsvPath}\n📊 ${billsCsvPath}`);
  } catch (err) {
    console.error("❌ Алдаа:", err);
    process.exitCode = 1;
  } finally {
    if (mainConn) await mainConn.close();
    if (tenantConn) await tenantConn.close();
  }
}

const addrName = (x) => String(x?.name || x?.cityName || x?.districtName || x?.khorooName || x?.bairName || "").trim();
const addrId = (x) => String(x?.id || x?.cityId || x?.districtId || x?.khorooId || x?.bairId || "");
const exactNumber = (text, num) => new RegExp(`(?:^|\\D)${num}(?:\\D|$)`).test(String(text || ""));

/**
 * BPay-ийн хаягийн модыг татаж scripts/data/bpay_address_tree.json-д хадгална.
 * Зөвхөн BPay-ээс уншина, санд юу ч бичихгүй.
 */
async function saveAddressTree(wallet) {
  console.log("🗺️  BPay-ийн хаягийн модыг татаж байна...");
  const cities = ((await wallet.getAddressCities()) || []).filter((c) => allCities || /улаанбаатар/i.test(addrName(c)));
  if (!cities.length) throw new Error("Хот олдсонгүй (Улаанбаатар нэрээр таарсангүй — --all-cities оролдоно уу)");

  const tree = [];
  const flat = [];
  const errors = [];
  for (const city of cities) {
    const cityNode = { id: addrId(city), name: addrName(city), districts: [] };
    tree.push(cityNode);
    const districts = (await wallet.getAddressDistricts(cityNode.id)) || [];
    for (const d of districts) {
      const dNode = { id: addrId(d), name: addrName(d), khoroos: [] };
      cityNode.districts.push(dNode);
      let khoroos = [];
      try {
        khoroos = (await wallet.getAddressKhoroo(dNode.id)) || [];
      } catch (e) {
        errors.push({ level: "district", id: dNode.id, name: dNode.name, error: e.message });
      }
      const kNodes = khoroos.map((k) => ({ id: addrId(k), name: addrName(k), bairs: [] }));
      dNode.khoroos = kNodes;
      await inBatches(kNodes, 5, async (kNode) => {
        try {
          const bairs = (await wallet.getAddressBair(kNode.id)) || [];
          kNode.bairs = bairs.map((b) => ({ id: addrId(b), name: addrName(b) }));
        } catch (e) {
          errors.push({ level: "khoroo", id: kNode.id, name: `${dNode.name} ${kNode.name}`, error: e.message });
        }
      });
      for (const kNode of kNodes) {
        for (const b of kNode.bairs) {
          flat.push({ city: cityNode.name, district: dNode.name, khoroo: kNode.name, bairId: b.id, bairName: b.name });
        }
      }
      console.log(`   └─ ${cityNode.name} / ${dNode.name}: ${kNodes.length} хороо, ${kNodes.reduce((s, k) => s + k.bairs.length, 0)} байр`);
    }
  }

  fs.mkdirSync(path.dirname(ADDRESS_TREE_PATH), { recursive: true });
  fs.writeFileSync(
    ADDRESS_TREE_PATH,
    JSON.stringify({ fetchedAt: new Date().toISOString(), allCities, counts: { cities: tree.length, bairs: flat.length }, errors, tree, bairs: flat }, null, 2),
    "utf-8"
  );
  console.log(`✅ ${flat.length} байр хадгаллаа: ${ADDRESS_TREE_PATH}`);
  if (errors.length) console.log(`⚠️ ${errors.length} хэсгийг татаж чадсангүй (файлын "errors" хэсгийг үзнэ үү)`);

  const ttBairs = findTimetowerBairs(flat);
  for (const code of BUILDING_CODES) {
    console.log(`   ${code}-р байр: ${ttBairs[code].map((b) => `${b.bairId} (${b.bairName})`).join(", ") || "ОЛДСОНГҮЙ"}`);
  }
}

/** Хадгалсан модноос Баянзүрх, 26-р хороо дахь 216-219-р байрыг яг тоогоор нь олно. */
function findTimetowerBairs(flat) {
  const result = Object.fromEntries(BUILDING_CODES.map((c) => [c, []]));
  for (const b of flat || []) {
    if (!/баянзүрх|бзд/i.test(`${b.district} ${b.bairName}`)) continue;
    if (!exactNumber(b.khoroo, 26)) continue;
    // Байрны нэрээс хороог хасаад шалгана ("БЗД 26-р хороо 216-р байр" -> "216-р байр")
    const bairPart = String(b.bairName).replace(/\d+\s*-?\s*р\s*хороо/i, "");
    for (const code of BUILDING_CODES) if (exactNumber(bairPart, code)) result[code].push(b);
  }
  return result;
}

/** Хадгалсан модыг ачаалж, мэдэгдэхгүй байрны bairId-г нэмнэ. */
function loadSavedBairIds(knownBpayBairIds) {
  if (!fs.existsSync(ADDRESS_TREE_PATH)) {
    console.log("   ℹ️ Хадгалсан хаягийн мод алга (--save-address-аар үүсгэнэ)");
    return;
  }
  try {
    const saved = JSON.parse(fs.readFileSync(ADDRESS_TREE_PATH, "utf-8"));
    const found = findTimetowerBairs(saved.bairs);
    for (const code of BUILDING_CODES) {
      if (knownBpayBairIds[code].size) continue;
      for (const b of found[code]) knownBpayBairIds[code].add(String(b.bairId));
      if (found[code].length > 1) console.log(`   ⚠️ ${code}-р байрт хадгалсан модонд ${found[code].length} хаяг таарсан`);
    }
    console.log(`   └─ Хадгалсан хаягийн мод ачааллаа (${saved.fetchedAt}, ${saved.bairs?.length || 0} байр)`);
  } catch (e) {
    console.log(`   ⚠️ Хадгалсан хаягийн мод уншиж чадсангүй: ${e.message}`);
  }
}

/**
 * BPay bairId мэдэгдэхгүй байрыг BPay-ийн хаягийн модноос хайна:
 * Улаанбаатар -> Баянзүрх -> 26-р хороо -> "<байр>" (яг тоогоор, жишээ нь 2180-ийг 218 гэж авахгүй).
 */
async function discoverMissingBairIds(wallet, knownBpayBairIds) {
  const missing = Object.keys(knownBpayBairIds).filter((k) => knownBpayBairIds[k].size === 0);
  if (!missing.length) return;
  try {
    const ub = ((await wallet.getAddressCities()) || []).find((c) => /улаанбаатар/i.test(addrName(c)));
    if (!ub) return console.log("   ⚠️ BPay хаяг: Улаанбаатар олдсонгүй");
    const bzd = ((await wallet.getAddressDistricts(addrId(ub))) || []).find((d) => /баянзүрх|бзд/i.test(addrName(d)));
    if (!bzd) return console.log("   ⚠️ BPay хаяг: Баянзүрх олдсонгүй");
    const kh = ((await wallet.getAddressKhoroo(addrId(bzd))) || []).find((k) => exactNumber(addrName(k), 26));
    if (!kh) return console.log("   ⚠️ BPay хаяг: 26-р хороо олдсонгүй");
    const flat = ((await wallet.getAddressBair(addrId(kh))) || []).map((b) => ({
      district: addrName(bzd), khoroo: addrName(kh), bairId: addrId(b), bairName: addrName(b),
    }));
    const found = findTimetowerBairs(flat);
    for (const code of missing) {
      for (const b of found[code]) knownBpayBairIds[code].add(b.bairId);
      if (found[code].length > 1) console.log(`   ⚠️ ${code}-р байрт BPay-д ${found[code].length} хаяг таарсан: ${found[code].map((b) => b.bairName).join(" | ")}`);
    }
  } catch (e) {
    console.log(`   ⚠️ BPay хаягийн модноос bairId хайж чадсангүй: ${e.message}`);
  }
}

/**
 * Нэг тоотыг BPay-д холбох:
 *   1. BPay хэрэглэгч (утсаар) — байхгүй бол бүртгэнэ. walletUserId = утас.
 *   2. Хаягаар олдсон BPay customerId (UUID)-тай billing тухайн хэрэглэгчид байвал түүнийг
 *      ашиглана, үгүй бол saveBilling({ customerId }). billingId буцаагүй бол локал санд бичихгүй.
 *   3. amarSukh.orshinSuugch-ийн toots-д WALLET_API бичлэг нэмнэ/шинэчилнэ.
 *      Оршин суугчийг гэрээний orshinSuugchId-аар, дараа нь утсаар хайна. Олдохгүй бол шинээр үүсгэхгүй.
 */
async function registerUnit(mainConn, wallet, unit, contract, probeHit) {
  if (!probeHit || !probeHit.customerId) return { ok: false, message: "BPay customerId алга" };
  const phone = contract.phone;
  // BPay-д walletUserId нь утасны дугаар өөрөө.
  const walletUserId = phone;

  const userInfo = await wallet.getUserInfo(phone).catch(() => null);
  if (!userInfo) {
    try {
      await wallet.registerUser(phone, `${phone}@sukh.mn`);
    } catch (e) {
      if (!(await wallet.getUserInfo(phone).catch(() => null))) {
        return { ok: false, message: `BPay хэрэглэгч үүсгэж чадсангүй: ${e.message}` };
      }
    }
  }

  // BPay-д customerId нь UUID, customerCode нь 2003260... код — хоёр өөр талбар.
  const customerId = probeHit.customerId;
  if (wallet.clearBillingListCache) wallet.clearBillingListCache(phone);
  const existing = (await wallet.getBillingList(phone).catch(() => [])) || [];
  let billing = existing.find(
    (b) => String(b.customerId) === customerId || String(b.customerCode) === unit.customerCode
  );
  if (!billing) billing = await wallet.saveBilling(phone, { customerId });
  const billingId = billing?.billingId || billing?.id || "";
  if (!billingId) return { ok: false, message: "BPay billingId буцаасангүй — локал санд бичээгүй" };

  const residents = mainConn.collection("orshinSuugch");
  let resident = null;
  if (contract.orshinSuugchId && mongoose.Types.ObjectId.isValid(contract.orshinSuugchId)) {
    resident = await residents.findOne({ _id: new mongoose.Types.ObjectId(contract.orshinSuugchId) });
  }
  if (!resident) {
    resident = await residents.findOne({ $or: [{ utas: phone }, { utas: `+976${phone}` }, { nevtrekhNer: phone }] });
  }
  if (!resident) {
    return { ok: true, billingId, walletUserId, message: `BPay-д холбогдсон (billing ${billingId.slice(0, 8)}), локал оршин суугч олдоогүй` };
  }

  const building = BUILDINGS.find((b) => b.code === unit.building);
  const entry = {
    toot: unit.toot,
    source: "WALLET_API",
    bairniiNer: billing.customerAddress || probeHit.address || building.name,
    ovog: contract.ovog || "",
    ner: contract.ner || billing.customerName || "",
    baiguullagiinId: TIMETOWER_ORG_ID,
    barilgiinId: building.sukhId,
    walletBairId: probeHit.bairId || billing.bairId || "",
    walletDoorNo: unit.toot,
    walletUserId,
    walletCustomerId: customerId,
    walletCustomerCode: unit.customerCode,
    billingId,
    createdAt: new Date(),
  };

  const toots = Array.isArray(resident.toots) ? resident.toots : [];
  const idx = toots.findIndex(
    (t) => t.source === "WALLET_API" &&
      (String(t.walletCustomerCode) === unit.customerCode || String(t.walletCustomerId) === customerId)
  );
  if (idx >= 0) toots[idx] = { ...toots[idx], ...entry, createdAt: toots[idx].createdAt || entry.createdAt };
  else toots.push(entry);

  const set = { toots };
  if (!resident.walletUserId && walletUserId) set.walletUserId = walletUserId;
  await residents.updateOne({ _id: resident._id }, { $set: set });

  return { ok: true, billingId, walletUserId, message: `Холбогдсон (billing ${billingId.slice(0, 8)})` };
}

run();
