/**
 * Manual electricity (Цахилгаан) correction for an ALREADY-SENT invoice cycle.
 *
 * WHY THIS EXISTS
 * ---------------
 * The zaalt Excel import already writes zaaltUnshlalt / geree / orshinSuugch correctly, and
 * then tries to sync the open invoice (controller/excel.js -> invoiceService.createInvoiceForContract).
 * But it calls it WITHOUT `override`, and createInvoiceForContract returns early with
 * "Тухайн сарын нэхэмжлэх аль хэдийн үүссэн байна." — so the ledger row and the invoice header
 * keep last month's amount. This script performs that missing sync.
 *
 * WHAT IT PATCHES
 *   guilgeeAvlaguud     -> the Цахилгаан charge row of the cycle's invoice (dun/undsenDun/tulukhDun)
 *   nekhemjlekhiinTuukh -> niitTulbur (= Σ positive ledger rows), tsahilgaanNekhemjlekh
 *   zaaltUnshlalt       -> the cycle's reading row      (only in --file / --json mode)
 *   geree               -> readings, zardluud[Цахилгаан].dun, niitTulbur
 *   orshinSuugch        -> odorZaalt/shonoZaalt/suuliinZaalt (+ tsahilgaaniiZaalt if the sheet differs)
 * then re-runs the FIFO tuluv/uldegdel pass from services/guilgeeService.syncInvoicesStatus
 * (without its orphan-invoice deletion — this is a correction, not a rebuild).
 *
 * WHERE THE AMOUNT COMES FROM
 *   1. a "Төлбөр" column in the sheet, or zaaltUnshlalt.zaaltDun  -> used verbatim
 *   2. otherwise recomputed as |Нийт(одоо) − Өмнө| × тариф + суурь хураамж,
 *      with zaaltTariffTiers applied, exactly like controller/excel.js
 *   Pass --recompute to always recalculate and ignore the stored Төлбөр.
 *
 * INPUT MODES (pick one)
 *   --from-zaalt         read what the UI import already stored in zaaltUnshlalt.
 *                        Nothing to copy to the server. Use this on Ubuntu.
 *   --file <xlsx>        the "Заалтын загвар" template or the exported zaalt workbook
 *   --json <path>        the same rows as JSON (see scripts/zaalt_data.json)
 *
 * DRY RUN BY DEFAULT — nothing is written until you pass --apply.
 *
 * RUN FROM THE PROJECT ROOT (dotenv reads ./tokhirgoo/tokhirgoo.env):
 *   node scripts/manual_update_tsahilgaan.js --from-zaalt
 *   node scripts/manual_update_tsahilgaan.js --from-zaalt --apply
 *
 * Flags:
 *   --apply              actually write (default: dry run; --dry-run is accepted as a no-op)
 *   --org <id>           baiguullagiinId          (default: Найрамдал)
 *   --barilga <id>       barilgiinId              (default: Найрамдал building)
 *   --db <name>          tenant database          (default: nairamdalSukh)
 *   --date <YYYY-MM-DD>  reference date that resolves the billing cycle (default: today)
 *   --toot 21,22         only these units
 *   --recompute          ignore Төлбөр / zaaltDun, recalculate from readings
 *   --tariff-source excel|resident   which кВт rate wins when recomputing (default: excel)
 *   --any-reading        --from-zaalt: take each contract's newest reading regardless of cycle
 *   --include-paid       also patch invoices already marked Төлсөн / partially paid
 *   --merge-duplicates   collapse duplicate Цахилгаан ledger rows on one invoice into one
 *   --report <path>      JSON report output
 */

const fs = require("fs");
const path = require("path");

// Resolve the env file against the project root, not the cwd, so the script runs
// from anywhere (./scripts, cron, pm2) rather than only from the repo root.
const PROJECT_ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(PROJECT_ROOT, "tokhirgoo", "tokhirgoo.env") });

const mongoose = require("mongoose");
const { calculateBillingCycleBounds } = require("../utils/dateUtils");

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);

const CONFIG = {
  fromZaalt: args["from-zaalt"] === true,
  file: typeof args.file === "string" ? args.file : null,
  json: typeof args.json === "string" ? args.json : null,
  apply: args.apply === true,
  baiguullagiinId: args.org || "697c70e81e782d8110d3b064",
  barilgiinId: args.barilga || "697c71171e782d8110d3be4b",
  tenantDb: args.db || "nairamdalSukh",
  refDate: args.date ? new Date(`${args.date}T12:00:00`) : new Date(),
  toots: args.toot
    ? String(args.toot)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : null,
  recompute: args.recompute === true,
  tariffSource: args["tariff-source"] === "resident" ? "resident" : "excel",
  anyReading: args["any-reading"] === true,
  includePaid: args["include-paid"] === true,
  mergeDuplicates: args["merge-duplicates"] === true,
  report:
    args.report ||
    `tsahilgaan_manual_update_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
};

const modeCount = [CONFIG.fromZaalt, !!CONFIG.file, !!CONFIG.json].filter(Boolean).length;
if (modeCount !== 1) {
  console.error(
    "❌ Нэг эх сурвалж сонгоно уу: --from-zaalt  |  --file <xlsx>  |  --json <path>\n" +
      "   Ж: node scripts/manual_update_tsahilgaan.js --from-zaalt"
  );
  process.exit(1);
}
for (const p of [CONFIG.file, CONFIG.json]) {
  if (p && !fs.existsSync(p)) {
    console.error(`❌ Файл олдсонгүй: ${p}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- helpers

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseNum(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/,/g, "").replace(/\s/g, "").trim();
  return parseFloat(cleaned) || 0;
}

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";

function getVal(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
    const found = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === name.toLowerCase()
    );
    if (found) return row[found];
  }
  return undefined;
}

/** Same predicate controller/excel.js and invoiceService.js use to pick the metered electricity line. */
function isVariableElectricity(z) {
  const n = (z.ner || "").toLowerCase();
  if (!n.includes("цахилгаан")) return false;
  if (n.includes("дундын") || n.includes("өмчлөл")) return false;
  if (n.includes("нийтийн") || n.includes("ерөнхий")) return false;
  if (n.includes("гадна") || n.includes("гэрэлтүүлэг") || n.includes("шат")) return false;
  return true;
}

function isElectricityLedgerRow(row) {
  return isVariableElectricity({ ner: row.zardliinNer || row.tailbar || "" });
}

/** Tiered tariff selection, mirroring controller/excel.js. */
function pickTariff(zoruu, baseTariff, tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return { tariff: baseTariff, tier: null };
  const sorted = [...tiers].sort((a, b) => (a.threshold || 0) - (b.threshold || 0));
  for (const t of sorted) {
    if (zoruu <= (t.threshold || Infinity)) {
      return { tariff: t.tariff || baseTariff, tier: { threshold: t.threshold, tariff: t.tariff } };
    }
  }
  const last = sorted[sorted.length - 1];
  return { tariff: last.tariff || baseTariff, tier: { threshold: last.threshold, tariff: last.tariff } };
}

// ---------------------------------------------------------------- input sources

/** Normalised shape every source produces. */
function makeEntry(o) {
  return {
    gereeniiDugaar: String(o.gereeniiDugaar || "").trim(),
    toot: String(o.toot ?? "").trim(),
    ner: String(o.ner || "").trim(),
    umnu: o.umnu,
    odor: o.odor,
    shone: o.shone,
    niitOdoo: o.niitOdoo,
    tariff: o.tariff,
    baseFee: o.baseFee,
    tulbur: o.tulbur, // stored amount, used verbatim unless --recompute
    origin: o.origin,
  };
}

function loadFromWorkbook(file) {
  const xlsx = require("xlsx");
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { raw: false });
  console.log(`📥 ${rows.length} мөр (sheet: "${wb.SheetNames[0]}")`);
  return rows.map((row) =>
    makeEntry({
      gereeniiDugaar: getVal(row, "Гэрээний дугаар", "gereeniiDugaar"),
      toot: getVal(row, "Тоот", "toot"),
      ner: getVal(row, "Нэр", "ner"),
      umnu: getVal(row, "Өмнө", "Өмнөх", "umnu", "Өмнөх заалт"),
      odor: getVal(row, "Өдөр", "odor", "Өдрийн заалт"),
      shone: getVal(row, "Шөнө", "shone", "Шөнийн заалт"),
      niitOdoo: getVal(row, "Нийт (одоо)", "Нийт", "niit", "suuliinZaalt"),
      tariff: getVal(row, "Цахилгаан кВт", "Цахилгаан тариф", "tsahilgaanTariff"),
      baseFee: getVal(row, "Суурь хураамж", "Суурь хүраамж", "defaultDun", "baseFee"),
      tulbur: getVal(row, "Төлбөр", "tulbur", "zaaltDun"),
      origin: "excel",
    })
  );
}

function loadFromJson(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.rows || [];
  console.log(`📥 ${rows.length} мөр (json)`);
  return rows.map((r) =>
    makeEntry({
      gereeniiDugaar: r.gereeniiDugaar,
      toot: r.toot,
      ner: r.ner,
      umnu: r.umnu ?? r["Өмнө"],
      odor: r.odor ?? r["Өдөр"],
      shone: r.shone ?? r["Шөнө"],
      niitOdoo: r.niitOdoo ?? r["Нийт (одоо)"],
      tariff: r.tariff ?? r["Цахилгаан кВт"],
      baseFee: r.suuriKhuraamj ?? r.baseFee ?? r["Суурь хураамж"],
      tulbur: r.tulbur ?? r.zaaltDun ?? r["Төлбөр"],
      origin: "json",
    })
  );
}

/** Newest zaaltUnshlalt row per contract, from the cycle unless --any-reading. */
async function loadFromZaalt(T, startOfCycle, endOfCycle) {
  const q = { baiguullagiinId: CONFIG.baiguullagiinId, barilgiinId: CONFIG.barilgiinId };
  if (!CONFIG.anyReading) {
    q.$or = [
      { unshlaltiinOgnoo: { $gte: startOfCycle, $lte: endOfCycle } },
      { importOgnoo: { $gte: startOfCycle, $lte: endOfCycle } },
    ];
  }
  const docs = await T.zaaltUnshlalt
    .find(q)
    .sort({ importOgnoo: -1, unshlaltiinOgnoo: -1 })
    .toArray();

  const newest = new Map();
  for (const d of docs) if (!newest.has(d.gereeniiId)) newest.set(d.gereeniiId, d);

  console.log(
    `📥 ${newest.size} уншилт (zaaltUnshlalt${CONFIG.anyReading ? ", бүх огноо" : ", энэ мөчлөг"}), нийт ${docs.length} мөрөөс`
  );

  return Array.from(newest.values()).map((d) =>
    makeEntry({
      gereeniiDugaar: d.gereeniiDugaar,
      toot: d.toot,
      umnu: d.umnukhZaalt ?? d.zaaltCalculation?.umnukhZaalt,
      odor: d.zaaltTog ?? d.zaaltCalculation?.zaaltTog,
      shone: d.zaaltUs ?? d.zaaltCalculation?.zaaltUs,
      niitOdoo: d.suuliinZaalt ?? d.zaaltCalculation?.suuliinZaalt,
      tariff: d.tariff ?? d.zaaltCalculation?.tariff,
      baseFee: d.defaultDun ?? d.zaaltCalculation?.defaultDun,
      tulbur: d.zaaltDun,
      origin: "zaalt",
    })
  );
}

// ---------------------------------------------------------------- main

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      `MONGODB_URI уншигдсангүй. Хайсан файл: ${path.join(PROJECT_ROOT, "tokhirgoo", "tokhirgoo.env")}`
    );
  }

  const centralConn = await mongoose.createConnection(uri).asPromise();
  const tenantUri = uri.replace(/\/([^/?]+)(\?|$)/, `/${CONFIG.tenantDb}$2`);
  const tenantConn = await mongoose.createConnection(tenantUri).asPromise();

  const C = {
    baiguullaga: centralConn.collection("baiguullaga"),
    orshinSuugch: centralConn.collection("orshinSuugch"),
  };
  const T = {
    geree: tenantConn.collection("geree"),
    orshinSuugch: tenantConn.collection("orshinSuugch"),
    zaaltUnshlalt: tenantConn.collection("zaaltUnshlalt"),
    ledger: tenantConn.collection("guilgeeAvlaguud"),
    nekhemjlekh: tenantConn.collection("nekhemjlekhiinTuukh"),
    cron: tenantConn.collection("cronSchedule"),
  };

  const mode = CONFIG.fromZaalt ? "zaaltUnshlalt" : CONFIG.file ? `xlsx ${CONFIG.file}` : `json ${CONFIG.json}`;
  console.log(
    `\n${CONFIG.apply ? "🟥 APPLY" : "🟦 DRY RUN"}  |  db=${CONFIG.tenantDb}  org=${CONFIG.baiguullagiinId}  barilga=${CONFIG.barilgiinId}`
  );
  console.log(`📄 эх сурвалж: ${mode}`);
  console.log(`💰 дүн: ${CONFIG.recompute ? "заалтаас дахин тооцоолно" : "хадгалагдсан Төлбөр-ийг шууд ашиглана"}`);

  // --- building-level electricity settings (tiers / fallback base fee)
  const baiguullaga = await C.baiguullaga.findOne({
    _id: new mongoose.Types.ObjectId(CONFIG.baiguullagiinId),
  });
  if (!baiguullaga) throw new Error("Байгууллага олдсонгүй");
  const barilga = (baiguullaga.barilguud || []).find(
    (b) => String(b._id) === String(CONFIG.barilgiinId)
  );
  if (!barilga) throw new Error("Барилга олдсонгүй");

  const barilgiinZardluud = barilga.tokhirgoo?.ashiglaltiinZardluud || [];
  const zaaltZardal =
    barilgiinZardluud.find((z) => z.zaalt === true && (z.ner || "").trim() === "Цахилгаан") ||
    barilgiinZardluud.find((z) => z.zaalt === true && isVariableElectricity(z)) ||
    barilgiinZardluud.find((z) => isVariableElectricity(z)) || {
      ner: "Цахилгаан",
      zardliinTurul: "Хувьсах",
      zaaltTariff: 0,
      suuriKhuraamj: 2000,
      zaalt: true,
    };

  // --- billing cycle
  const cronDoc = await T.cron
    .find({
      baiguullagiinId: CONFIG.baiguullagiinId,
      $or: [{ barilgiinId: CONFIG.barilgiinId }, { barilgiinId: null }],
    })
    .sort({ barilgiinId: -1 })
    .limit(1)
    .toArray();
  const cronDay = cronDoc[0]?.nekhemjlekhUusgekhOgnoo || 1;
  const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, CONFIG.refDate);
  console.log(
    `🗓  мөчлөг (өдөр=${cronDay}): ${startOfCycle.toISOString()} → ${endOfCycle.toISOString()}\n`
  );

  // --- entries
  const entries = CONFIG.fromZaalt
    ? await loadFromZaalt(T, startOfCycle, endOfCycle)
    : CONFIG.file
      ? loadFromWorkbook(CONFIG.file)
      : loadFromJson(CONFIG.json);
  console.log("");

  if (!entries.length) {
    console.log("⚠️  Боловсруулах мөр алга. --any-reading эсвэл --date шалгана уу.\n");
    await centralConn.close();
    await tenantConn.close();
    return;
  }

  const report = {
    config: { ...CONFIG, refDate: CONFIG.refDate.toISOString() },
    cycle: { cronDay, startOfCycle, endOfCycle },
    updated: [],
    skipped: [],
    failed: [],
  };
  const touchedGereeIds = new Set();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const rowNo = i + 2;

    if (!e.gereeniiDugaar) {
      report.skipped.push({ rowNo, reason: "Гэрээний дугаар хоосон" });
      continue;
    }
    if (CONFIG.toots && !CONFIG.toots.includes(e.toot)) continue;

    try {
      if (isEmpty(e.umnu) && isEmpty(e.odor) && isEmpty(e.shone) && isEmpty(e.niitOdoo) && isEmpty(e.tulbur)) {
        report.skipped.push({ rowNo, gereeniiDugaar: e.gereeniiDugaar, toot: e.toot, reason: "Уншилт хоосон" });
        continue;
      }

      const geree = await T.geree.findOne({
        gereeniiDugaar: e.gereeniiDugaar,
        baiguullagiinId: CONFIG.baiguullagiinId,
        barilgiinId: CONFIG.barilgiinId,
      });
      if (!geree) {
        report.failed.push({ rowNo, gereeniiDugaar: e.gereeniiDugaar, toot: e.toot, error: "Гэрээ олдсонгүй" });
        continue;
      }
      const gereeId = geree._id.toString();

      // ---- readings
      const umnu = !isEmpty(e.umnu) ? parseNum(e.umnu) : geree.umnukhZaalt || 0;
      const odor = !isEmpty(e.odor) ? parseNum(e.odor) : geree.zaaltTog || 0;
      const shone = !isEmpty(e.shone) ? parseNum(e.shone) : geree.zaaltUs || 0;
      let niitOdoo = geree.suuliinZaalt || 0;
      if (!isEmpty(e.niitOdoo)) niitOdoo = parseNum(e.niitOdoo);
      else if (!isEmpty(e.odor) || !isEmpty(e.shone)) niitOdoo = odor + shone;

      if (umnu < 0 || odor < 0 || shone < 0) {
        report.failed.push({ rowNo, gereeniiDugaar: e.gereeniiDugaar, toot: e.toot, error: "Сөрөг заалт" });
        continue;
      }
      const zoruu = round2(Math.abs(niitOdoo - umnu));

      // ---- resident
      const osId = geree.orshinSuugchId;
      let osTenant = null;
      let osCentral = null;
      if (osId && mongoose.Types.ObjectId.isValid(osId)) {
        const oid = new mongoose.Types.ObjectId(osId);
        osTenant = await T.orshinSuugch.findOne({ _id: oid });
        osCentral = await C.orshinSuugch.findOne({ _id: oid });
      }
      const residentTariff = Number(osCentral?.tsahilgaaniiZaalt || osTenant?.tsahilgaaniiZaalt || 0);

      // ---- tariff + base fee (needed for audit fields even when Төлбөр is used verbatim)
      const sheetTariff = isEmpty(e.tariff) ? 0 : parseNum(e.tariff);
      const sheetBaseFee = isEmpty(e.baseFee) ? 0 : parseNum(e.baseFee);

      const baseTariff =
        CONFIG.tariffSource === "resident"
          ? residentTariff || sheetTariff || zaaltZardal.zaaltTariff || zaaltZardal.tariff || 0
          : sheetTariff || residentTariff || zaaltZardal.zaaltTariff || zaaltZardal.tariff || 0;
      const baseFee = sheetBaseFee || zaaltZardal.suuriKhuraamj || 0;

      const gereeElecZardal = (geree.zardluud || []).find(
        (z) => (z.zaalt === true || z.zardliinTurul === "Хувьсах") && isVariableElectricity(z)
      );
      const tiers = gereeElecZardal?.zaaltTariffTiers || zaaltZardal.zaaltTariffTiers || [];
      const { tariff: usedTariff, tier: usedTier } = pickTariff(zoruu, baseTariff, tiers);

      // ---- the amount
      const storedTulbur = isEmpty(e.tulbur) ? 0 : round2(parseNum(e.tulbur));
      const recomputed = round2(zoruu * usedTariff + baseFee);
      let newZaaltDun;
      let amountFrom;
      if (!CONFIG.recompute && storedTulbur > 0) {
        newZaaltDun = storedTulbur;
        amountFrom = e.origin === "zaalt" ? "zaaltDun" : "Төлбөр";
      } else {
        newZaaltDun = recomputed;
        amountFrom = "тооцоолсон";
        if (!(baseTariff > 0)) {
          report.failed.push({
            rowNo,
            gereeniiDugaar: e.gereeniiDugaar,
            toot: e.toot,
            error: "кВт тариф ч, Төлбөр ч алга",
          });
          continue;
        }
      }
      if (!(newZaaltDun > 0)) {
        report.skipped.push({ rowNo, gereeniiDugaar: e.gereeniiDugaar, toot: e.toot, reason: "Дүн 0" });
        continue;
      }

      // ---- target invoice for the cycle
      const invoice = await T.nekhemjlekh.findOne(
        { gereeniiId: gereeId, ognoo: { $gte: startOfCycle, $lte: endOfCycle } },
        { sort: { ognoo: -1 } }
      );
      if (!invoice) {
        report.failed.push({
          rowNo,
          gereeniiDugaar: e.gereeniiDugaar,
          toot: e.toot,
          error: "Энэ мөчлөгт нэхэмжлэх олдсонгүй",
        });
        continue;
      }
      const invoiceId = invoice._id.toString();

      // ---- electricity ledger row(s) on that invoice
      const invoiceRows = await T.ledger.find({ nekhemjlekhId: invoiceId, gereeniiId: gereeId }).toArray();
      const elecRows = invoiceRows.filter((r) => (r.dun || 0) > 0 && isElectricityLedgerRow(r));

      if (elecRows.length > 1 && !CONFIG.mergeDuplicates) {
        report.failed.push({
          rowNo,
          gereeniiDugaar: e.gereeniiDugaar,
          toot: e.toot,
          error: `Нэхэмжлэх дээр ${elecRows.length} цахилгааны мөр — --merge-duplicates ашиглана уу`,
          ledgerIds: elecRows.map((r) => r._id.toString()),
        });
        continue;
      }

      const alreadyPaid = elecRows.some((r) => (r.tulsunDun || 0) > 0) || invoice.tuluv === "Төлсөн";
      if (alreadyPaid && !CONFIG.includePaid) {
        report.skipped.push({
          rowNo,
          gereeniiDugaar: e.gereeniiDugaar,
          toot: e.toot,
          reason: "Төлөгдсөн — --include-paid өгөөгүй тул алгаслаа",
          invoice: invoice.nekhemjlekhiinDugaar,
          tuluv: invoice.tuluv,
        });
        continue;
      }

      const keepRow = elecRows[0] || null;
      const dropRows = elecRows.slice(1);
      const oldDun = keepRow ? round2(keepRow.dun || 0) : 0;

      const change = {
        rowNo,
        toot: e.toot || geree.toot,
        gereeniiDugaar: e.gereeniiDugaar,
        ner: e.ner || `${geree.ovog || ""} ${geree.ner || ""}`.trim(),
        invoice: invoice.nekhemjlekhiinDugaar,
        invoiceId,
        readings: { umnu, odor, shone, niitOdoo, zoruu },
        tariff: { used: usedTariff, sheet: sheetTariff, resident: residentTariff, tier: usedTier },
        baseFee,
        amountFrom,
        recomputedWouldBe: recomputed,
        zaaltDun: { old: oldDun, new: newZaaltDun, delta: round2(newZaaltDun - oldDun) },
        ledgerId: keepRow ? keepRow._id.toString() : null,
        createdLedgerRow: !keepRow,
        removedDuplicateLedgerRows: dropRows.map((r) => ({ _id: r._id.toString(), dun: r.dun })),
        invoiceTotal: { old: round2(invoice.niitTulbur || 0) },
      };
      if (!CONFIG.recompute && storedTulbur > 0 && Math.abs(recomputed - storedTulbur) > 0.5) {
        change.warning = `Хадгалагдсан дүн (${storedTulbur}) тооцооллоос (${recomputed}) зөрж байна`;
      }

      if (CONFIG.apply) {
        const now = new Date();
        const chargeOgnoo = keepRow?.ognoo || invoice.ognoo || CONFIG.refDate;

        const zaaltCalculation = {
          umnukhZaalt: umnu,
          suuliinZaalt: niitOdoo,
          zaaltTog: odor,
          zaaltUs: shone,
          zoruu,
          tariff: usedTariff,
          tariffType: zaaltZardal.zardliinTurul,
          tariffName: zaaltZardal.ner,
          defaultDun: baseFee,
          tier: usedTier,
          calculatedAt: now,
        };

        // 1) ledger
        if (dropRows.length) {
          await T.ledger.deleteMany({ _id: { $in: dropRows.map((r) => r._id) } });
        }
        if (keepRow) {
          await T.ledger.updateOne(
            { _id: keepRow._id },
            { $set: { dun: newZaaltDun, undsenDun: newZaaltDun, tulukhDun: newZaaltDun, updatedAt: now } }
          );
        } else {
          const inserted = await T.ledger.insertOne({
            dun: newZaaltDun,
            baiguullagiinId: CONFIG.baiguullagiinId,
            baiguullagiinNer: geree.baiguullagiinNer || baiguullaga.ner || "",
            barilgiinId: CONFIG.barilgiinId,
            gereeniiId: gereeId,
            gereeniiDugaar: e.gereeniiDugaar,
            orshinSuugchId: geree.orshinSuugchId || "",
            nekhemjlekhId: invoiceId,
            toot: geree.toot || e.toot,
            toots: [],
            ognoo: chargeOgnoo,
            undsenDun: newZaaltDun,
            tulukhDun: newZaaltDun,
            tulukhAldangi: 0,
            tulsunDun: 0,
            tulsunAldangi: 0,
            turul: "Үндсэн",
            zardliinTurul: gereeElecZardal?.zardliinTurul || zaaltZardal.zardliinTurul || "Хувьсах",
            zardliinNer: "Цахилгаан",
            nekhemjlekhDeerKharagdakh: true,
            nuatBodokhEsekh: true,
            ekhniiUldegdelEsekh: false,
            tailbar: "Цахилгаан",
            source: "nekhemjlekh",
            guilgeeKhiisenAjiltniiNer: "Гар засвар (заалт)",
            guilgeeKhiisenAjiltniiId: geree.orshinSuugchId || "",
            createdAt: now,
            updatedAt: now,
            __v: 0,
          });
          change.ledgerId = inserted.insertedId.toString();
        }

        // 2) zaaltUnshlalt — only when the sheet is the source; in --from-zaalt it IS the source
        if (!CONFIG.fromZaalt) {
          const readingSet = {
            umnukhZaalt: umnu,
            suuliinZaalt: niitOdoo,
            zaaltTog: odor,
            zaaltUs: shone,
            zoruu,
            tariff: usedTariff,
            defaultDun: baseFee,
            usedTier,
            zaaltDun: newZaaltDun,
            zaaltCalculation,
            importOgnoo: now,
            updatedAt: now,
            importAjiltniiNer: "Гар засвар (заалт)",
          };
          const existingReading = await T.zaaltUnshlalt.findOne(
            { gereeniiId: gereeId, unshlaltiinOgnoo: { $gte: startOfCycle, $lte: endOfCycle } },
            { sort: { unshlaltiinOgnoo: -1 } }
          );
          if (existingReading) {
            await T.zaaltUnshlalt.updateOne({ _id: existingReading._id }, { $set: readingSet });
          } else {
            await T.zaaltUnshlalt.insertOne({
              gereeniiId: gereeId,
              gereeniiDugaar: e.gereeniiDugaar,
              toot: geree.toot || e.toot,
              baiguullagiinId: CONFIG.baiguullagiinId,
              barilgiinId: CONFIG.barilgiinId,
              unshlaltiinOgnoo: invoice.ognoo || CONFIG.refDate,
              zaaltZardliinId: zaaltZardal._id ? String(zaaltZardal._id) : "",
              zaaltZardliinNer: zaaltZardal.ner,
              zaaltZardliinTurul: zaaltZardal.zardliinTurul,
              tariffUsgeer: zaaltZardal.tariffUsgeer || "кВт",
              suuriKhuraamj: zaaltZardal.suuriKhuraamj || 0,
              nuatNemekhEsekh: zaaltZardal.nuatNemekhEsekh || false,
              createdAt: now,
              __v: 0,
              ...readingSet,
            });
          }
        }

        // 3) geree — readings + electricity zardal + niitTulbur
        const newZardluud = JSON.parse(JSON.stringify(geree.zardluud || []));
        const idx = newZardluud.findIndex(
          (z) => (z.zaalt === true || z.zardliinTurul === "Хувьсах") && isVariableElectricity(z)
        );
        const zardalPatch = {
          zaalt: true,
          zaaltTariff: baseTariff,
          zaaltDefaultDun: baseFee,
          tariff: usedTariff,
          tariffUsgeer: zaaltZardal.tariffUsgeer || "кВт",
          dun: newZaaltDun,
          zaaltCalculation,
        };
        if (idx >= 0) newZardluud[idx] = { ...newZardluud[idx], ...zardalPatch };
        else
          newZardluud.push({
            ner: zaaltZardal.ner || "Цахилгаан",
            turul: zaaltZardal.turul,
            zardliinTurul: zaaltZardal.zardliinTurul || "Хувьсах",
            barilgiinId: CONFIG.barilgiinId,
            ...zardalPatch,
          });

        const niitTulbur = round2(newZardluud.reduce((s, z) => s + (z.dun || z.tariff || 0), 0));
        await T.geree.updateOne(
          { _id: geree._id },
          {
            $set: {
              umnukhZaalt: umnu,
              suuliinZaalt: niitOdoo,
              zaaltTog: odor,
              zaaltUs: shone,
              zardluud: newZardluud,
              niitTulbur,
              ashiglaltiinZardal: niitTulbur,
              updatedAt: now,
            },
          }
        );
        change.gereeNiitTulbur = niitTulbur;

        // 4) resident readings (+ tariff when the sheet overrides it)
        const osSet = { odorZaalt: odor, shonoZaalt: shone, suuliinZaalt: niitOdoo, updatedAt: now };
        if (
          !CONFIG.fromZaalt &&
          CONFIG.tariffSource === "excel" &&
          sheetTariff > 0 &&
          sheetTariff !== residentTariff
        ) {
          osSet.tsahilgaaniiZaalt = sheetTariff;
          change.residentTariffUpdated = { from: residentTariff, to: sheetTariff };
        }
        if (osId && mongoose.Types.ObjectId.isValid(osId)) {
          const oid = new mongoose.Types.ObjectId(osId);
          if (osTenant) await T.orshinSuugch.updateOne({ _id: oid }, { $set: osSet });
          if (osCentral) await C.orshinSuugch.updateOne({ _id: oid }, { $set: osSet });
        }

        // 5) invoice header
        const freshRows = await T.ledger.find({ nekhemjlekhId: invoiceId, dun: { $gt: 0 } }).toArray();
        const invoiceTotal = round2(freshRows.reduce((s, r) => s + (r.dun || 0), 0));
        await T.nekhemjlekh.updateOne(
          { _id: invoice._id },
          { $set: { niitTulbur: invoiceTotal, tsahilgaanNekhemjlekh: newZaaltDun, updatedAt: now } }
        );
        change.invoiceTotal.new = invoiceTotal;
        touchedGereeIds.add(gereeId);
      } else {
        const others = invoiceRows
          .filter((r) => (r.dun || 0) > 0 && !elecRows.some((x) => String(x._id) === String(r._id)))
          .reduce((s, r) => s + (r.dun || 0), 0);
        change.invoiceTotal.new = round2(others + newZaaltDun);
      }

      change.invoiceTotal.delta = round2(change.invoiceTotal.new - change.invoiceTotal.old);
      report.updated.push(change);

      const nerCol = (change.ner || "").slice(0, 14).padEnd(14);
      console.log(
        `  ${CONFIG.apply ? "✔" : "·"} тоот ${String(change.toot).padEnd(5)} ${nerCol} ` +
          `${String(newZaaltDun.toLocaleString("mn-MN")).padStart(12)}₮  ` +
          `(өмнө ${String(oldDun.toLocaleString("mn-MN")).padStart(12)}₮, Δ ${change.zaaltDun.delta.toLocaleString("mn-MN")})  ` +
          `нэхэмжлэх ${String(change.invoiceTotal.old.toLocaleString("mn-MN")).padStart(12)} → ${String(change.invoiceTotal.new.toLocaleString("mn-MN")).padStart(12)}` +
          (change.warning ? `  ⚠️ ${change.warning}` : "")
      );
    } catch (err) {
      report.failed.push({ rowNo, gereeniiDugaar: e.gereeniiDugaar, toot: e.toot, error: err.message });
      console.log(`  ✖ ${e.gereeniiDugaar}: ${err.message}`);
    }
  }

  // ---- re-sync invoice statuses (FIFO), mirroring services/guilgeeService.syncInvoicesStatus
  //      but never deleting invoices — this is a correction pass, not a rebuild.
  if (CONFIG.apply && touchedGereeIds.size) {
    console.log(`\n🔄 ${touchedGereeIds.size} гэрээний төлөв/үлдэгдлийг дахин тооцоолж байна...`);
    for (const gereeId of touchedGereeIds) {
      const allLedger = await T.ledger.find({ gereeniiId: gereeId }).toArray();
      const totalPayments = allLedger
        .filter((r) => (r.dun || 0) < 0)
        .reduce((s, r) => s + Math.abs(r.dun || 0), 0);
      const looseCharges = allLedger
        .filter((r) => (r.dun || 0) > 0 && !r.nekhemjlekhId)
        .reduce((s, r) => s + (r.dun || 0), 0);
      let availableFunds = totalPayments - looseCharges;

      const invoices = await T.nekhemjlekh.find({ gereeniiId: gereeId }).sort({ ognoo: 1 }).toArray();
      for (const inv of invoices) {
        const invCharge = allLedger
          .filter((r) => String(r.nekhemjlekhId || "") === String(inv._id) && (r.dun || 0) > 0)
          .reduce((s, r) => s + (r.dun || 0), 0);
        const target = invCharge > 0 ? invCharge : inv.niitTulbur || 0;
        const isPaid = availableFunds + 0.1 >= target;
        const set = {
          tuluv: isPaid ? "Төлсөн" : "Төлөөгүй",
          uldegdel: isPaid ? 0 : round2(Math.max(0, target - availableFunds)),
          tulsunOgnoo: isPaid ? inv.tulsunOgnoo || new Date() : null,
        };
        if (invCharge > 0) set.niitTulbur = round2(invCharge);
        await T.nekhemjlekh.updateOne({ _id: inv._id }, { $set: set });
        availableFunds = isPaid ? availableFunds - target : 0;
      }
    }
  }

  // ---- summary
  const totalNew = round2(report.updated.reduce((s, c) => s + c.zaaltDun.new, 0));
  const totalOld = round2(report.updated.reduce((s, c) => s + c.zaaltDun.old, 0));
  const totalDelta = round2(totalNew - totalOld);
  console.log("\n────────────────────────────────────────────────────────");
  console.log(`  Шинэчлэх       : ${report.updated.length}`);
  console.log(`  Алгассан       : ${report.skipped.length}`);
  console.log(`  Алдаатай       : ${report.failed.length}`);
  console.log(`  Цахилгаан өмнө : ${totalOld.toLocaleString("mn-MN")}₮`);
  console.log(`  Цахилгаан шинэ : ${totalNew.toLocaleString("mn-MN")}₮`);
  console.log(`  Зөрүү          : ${totalDelta.toLocaleString("mn-MN")}₮`);
  console.log("────────────────────────────────────────────────────────");
  if (report.failed.length) {
    console.log("\n⚠️  Алдаатай:");
    report.failed.forEach((f) => console.log(`   тоот ${f.toot || "?"} ${f.gereeniiDugaar}: ${f.error}`));
  }
  if (report.skipped.length) {
    console.log("\nℹ️  Алгассан:");
    report.skipped.forEach((s) => console.log(`   тоот ${s.toot || "?"} ${s.gereeniiDugaar || ""}: ${s.reason}`));
  }

  report.summary = {
    updated: report.updated.length,
    skipped: report.skipped.length,
    failed: report.failed.length,
    totalOld,
    totalNew,
    totalDelta,
  };
  fs.writeFileSync(path.resolve(CONFIG.report), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n📝 Тайлан: ${path.resolve(CONFIG.report)}`);
  if (!CONFIG.apply) console.log("\n🟦 DRY RUN — юу ч бичээгүй. Бодитоор хийхдээ --apply нэмнэ үү.\n");

  await centralConn.close();
  await tenantConn.close();
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err);
  process.exit(1);
});
