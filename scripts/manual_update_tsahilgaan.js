/**
 * Manual electricity (Цахилгаан) correction for an ALREADY-SENT invoice cycle.
 *
 * The normal flow (excel zaalt import -> invoiceService.createInvoiceForContract)
 * refuses to touch a cycle whose invoice already exists, so a late/corrected
 * "Заалтын загвар" spreadsheet cannot be applied through the UI. This script does the
 * same arithmetic the importer does and patches the already-created records in place:
 *
 *   zaaltUnshlalt       -> reading row for the cycle (upsert)
 *   geree               -> umnukhZaalt/suuliinZaalt/zaaltTog/zaaltUs, zardluud[Цахилгаан].dun, niitTulbur
 *   orshinSuugch        -> odorZaalt/shonoZaalt/suuliinZaalt (+ tsahilgaaniiZaalt when the sheet differs)
 *   guilgeeAvlaguud     -> the Цахилгаан charge row of that invoice (dun/undsenDun/tulukhDun)
 *   nekhemjlekhiinTuukh -> niitTulbur/tsahilgaanNekhemjlekh, then tuluv/uldegdel via FIFO re-sync
 *
 * Formula (identical to controller/excel.js):
 *   zaaltDun = |Нийт(одоо) - Өмнө| * тариф + суурь хураамж
 * with geree/building zaaltTariffTiers applied when present.
 *
 * DRY RUN BY DEFAULT. Nothing is written until you pass --apply.
 *
 *   node scripts/manual_update_tsahilgaan.js --file "C:\path\Заалтын загвар (6).xlsx"
 *   node scripts/manual_update_tsahilgaan.js --file "..." --apply
 *
 * Flags:
 *   --file <path>        Excel workbook (required)
 *   --apply              actually write (default: dry run)
 *   --org <id>           baiguullagiinId          (default: Найрамдал)
 *   --barilga <id>       barilgiinId              (default: Найрамдал building)
 *   --db <name>          tenant database          (default: nairamdalSukh)
 *   --date <YYYY-MM-DD>  reference date used to resolve the billing cycle (default: today)
 *   --toot 21,22         only these units
 *   --tariff-source excel|resident   which кВт rate wins (default: excel — the sheet is the correction)
 *   --include-paid       also patch rows on invoices already marked Төлсөн / partially paid
 *   --merge-duplicates   collapse duplicate Цахилгаан ledger rows in the cycle into one
 *   --report <path>      JSON report output
 */

require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const xlsx = require("xlsx");
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
  file: args.file,
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
  tariffSource: args["tariff-source"] === "resident" ? "resident" : "excel",
  includePaid: args["include-paid"] === true,
  mergeDuplicates: args["merge-duplicates"] === true,
  report:
    args.report ||
    `tsahilgaan_manual_update_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
};

if (!CONFIG.file) {
  console.error('❌ --file шаардлагатай. Ж: --file "C:\\Users\\...\\Заалтын загвар (6).xlsx"');
  process.exit(1);
}
if (!fs.existsSync(CONFIG.file)) {
  console.error(`❌ Файл олдсонгүй: ${CONFIG.file}`);
  process.exit(1);
}

// ---------------------------------------------------------------- helpers

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseExcelNum(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/,/g, "").replace(/\s/g, "").trim();
  return parseFloat(cleaned) || 0;
}

const isEmptyStr = (v) => v === undefined || v === null || String(v).trim() === "";

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
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return { tariff: baseTariff, tier: null };
  }
  const sorted = [...tiers].sort((a, b) => (a.threshold || 0) - (b.threshold || 0));
  for (const t of sorted) {
    if (zoruu <= (t.threshold || Infinity)) {
      return {
        tariff: t.tariff || baseTariff,
        tier: { threshold: t.threshold, tariff: t.tariff },
      };
    }
  }
  const last = sorted[sorted.length - 1];
  return {
    tariff: last.tariff || baseTariff,
    tier: { threshold: last.threshold, tariff: last.tariff },
  };
}

// ---------------------------------------------------------------- main

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI тохируулаагүй байна (tokhirgoo/tokhirgoo.env)");

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

  console.log(
    `\n${CONFIG.apply ? "🟥 APPLY" : "🟦 DRY RUN"}  |  db=${CONFIG.tenantDb}  org=${CONFIG.baiguullagiinId}  barilga=${CONFIG.barilgiinId}`
  );
  console.log(`📄 ${CONFIG.file}`);

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

  // --- billing cycle for this correction
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
    `🗓  Тооцооны мөчлөг (өдөр=${cronDay}): ${startOfCycle.toISOString()} → ${endOfCycle.toISOString()}\n`
  );

  // --- spreadsheet
  const wb = xlsx.readFile(CONFIG.file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { raw: false });
  console.log(`📥 ${rows.length} мөр уншлаа (sheet: "${wb.SheetNames[0]}")\n`);

  const report = {
    config: { ...CONFIG, refDate: CONFIG.refDate.toISOString() },
    cycle: { cronDay, startOfCycle, endOfCycle },
    updated: [],
    skipped: [],
    failed: [],
  };
  const touchedGereeIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2;
    const gereeniiDugaar = String(getVal(row, "Гэрээний дугаар", "gereeniiDugaar") || "").trim();
    const tootFromSheet = String(getVal(row, "Тоот", "toot") || "").trim();

    if (!gereeniiDugaar) {
      report.skipped.push({ rowNo, reason: "Гэрээний дугаар хоосон" });
      continue;
    }
    if (CONFIG.toots && !CONFIG.toots.includes(tootFromSheet)) continue;

    try {
      const umnuRaw = getVal(row, "Өмнө", "Өмнөх", "umnu", "Өмнөх заалт");
      const odorRaw = getVal(row, "Өдөр", "odor", "Өдрийн заалт");
      const shoneRaw = getVal(row, "Шөнө", "shone", "Шөнийн заалт");
      const niitRaw = getVal(row, "Нийт (одоо)", "Нийт", "niit", "suuliinZaalt");

      if (isEmptyStr(umnuRaw) && isEmptyStr(odorRaw) && isEmptyStr(shoneRaw) && isEmptyStr(niitRaw)) {
        report.skipped.push({ rowNo, gereeniiDugaar, toot: tootFromSheet, reason: "Уншилт хоосон" });
        continue;
      }

      const geree = await T.geree.findOne({
        gereeniiDugaar,
        baiguullagiinId: CONFIG.baiguullagiinId,
        barilgiinId: CONFIG.barilgiinId,
      });
      if (!geree) {
        report.failed.push({ rowNo, gereeniiDugaar, toot: tootFromSheet, error: "Гэрээ олдсонгүй" });
        continue;
      }

      const gereeId = geree._id.toString();

      // ---- readings
      const umnu = !isEmptyStr(umnuRaw) ? parseExcelNum(umnuRaw) : geree.umnukhZaalt || 0;
      const odor = !isEmptyStr(odorRaw) ? parseExcelNum(odorRaw) : geree.zaaltTog || 0;
      const shone = !isEmptyStr(shoneRaw) ? parseExcelNum(shoneRaw) : geree.zaaltUs || 0;
      let niitOdoo = geree.suuliinZaalt || 0;
      if (!isEmptyStr(niitRaw)) niitOdoo = parseExcelNum(niitRaw);
      else if (!isEmptyStr(odorRaw) || !isEmptyStr(shoneRaw)) niitOdoo = odor + shone;

      if (umnu < 0 || odor < 0 || shone < 0) {
        report.failed.push({ rowNo, gereeniiDugaar, toot: tootFromSheet, error: "Сөрөг заалт" });
        continue;
      }

      const zoruu = round2(Math.abs(niitOdoo - umnu));

      // ---- resident (tenant copy first, then central — importer reads both)
      const osId = geree.orshinSuugchId;
      let osTenant = null;
      let osCentral = null;
      if (osId && mongoose.Types.ObjectId.isValid(osId)) {
        const oid = new mongoose.Types.ObjectId(osId);
        osTenant = await T.orshinSuugch.findOne({ _id: oid });
        osCentral = await C.orshinSuugch.findOne({ _id: oid });
      }
      const residentTariff = Number(
        osCentral?.tsahilgaaniiZaalt || osTenant?.tsahilgaaniiZaalt || 0
      );

      // ---- tariff + base fee
      const excelTariffRaw = getVal(row, "Цахилгаан кВт", "Цахилгаан тариф", "tsahilgaanTariff");
      const excelTariff = isEmptyStr(excelTariffRaw) ? 0 : parseExcelNum(excelTariffRaw);
      const excelBaseFee = parseExcelNum(
        getVal(row, "Суурь хураамж", "Суурь хүраамж", "defaultDun", "baseFee")
      );

      let baseTariff;
      if (CONFIG.tariffSource === "resident") {
        baseTariff =
          residentTariff > 0
            ? residentTariff
            : excelTariff > 0
              ? excelTariff
              : zaaltZardal.zaaltTariff || zaaltZardal.tariff || 0;
      } else {
        baseTariff =
          excelTariff > 0
            ? excelTariff
            : residentTariff > 0
              ? residentTariff
              : zaaltZardal.zaaltTariff || zaaltZardal.tariff || 0;
      }
      if (!(baseTariff > 0)) {
        report.failed.push({
          rowNo,
          gereeniiDugaar,
          toot: tootFromSheet,
          error: "кВт тариф олдсонгүй (0)",
        });
        continue;
      }

      const baseFee = excelBaseFee || zaaltZardal.suuriKhuraamj || 0;

      const gereeElecZardal = (geree.zardluud || []).find(
        (z) => (z.zaalt === true || z.zardliinTurul === "Хувьсах") && isVariableElectricity(z)
      );
      const tiers = gereeElecZardal?.zaaltTariffTiers || zaaltZardal.zaaltTariffTiers || [];
      const { tariff: usedTariff, tier: usedTier } = pickTariff(zoruu, baseTariff, tiers);

      const newZaaltDun = round2(zoruu * usedTariff + baseFee);

      // ---- target invoice for the cycle
      const invoice = await T.nekhemjlekh.findOne(
        { gereeniiId: gereeId, ognoo: { $gte: startOfCycle, $lte: endOfCycle } },
        { sort: { ognoo: -1 } }
      );

      if (!invoice) {
        report.failed.push({
          rowNo,
          gereeniiDugaar,
          toot: tootFromSheet,
          error: "Энэ мөчлөгт нэхэмжлэх олдсонгүй",
        });
        continue;
      }
      const invoiceId = invoice._id.toString();

      // ---- electricity ledger row(s) on that invoice
      const invoiceRows = await T.ledger
        .find({ nekhemjlekhId: invoiceId, gereeniiId: gereeId })
        .toArray();
      const elecRows = invoiceRows.filter((r) => (r.dun || 0) > 0 && isElectricityLedgerRow(r));

      if (elecRows.length > 1 && !CONFIG.mergeDuplicates) {
        report.failed.push({
          rowNo,
          gereeniiDugaar,
          toot: tootFromSheet,
          error: `Нэхэмжлэх дээр ${elecRows.length} цахилгааны мөр байна — --merge-duplicates ашиглана уу`,
          ledgerIds: elecRows.map((r) => r._id.toString()),
        });
        continue;
      }

      const alreadyPaid = elecRows.some((r) => (r.tulsunDun || 0) > 0) || invoice.tuluv === "Төлсөн";
      if (alreadyPaid && !CONFIG.includePaid) {
        report.skipped.push({
          rowNo,
          gereeniiDugaar,
          toot: tootFromSheet,
          reason: "Төлөгдсөн — --include-paid өгөөгүй тул алгаслаа",
          invoice: invoice.nekhemjlekhiinDugaar,
          tuluv: invoice.tuluv,
        });
        continue;
      }

      const keepRow = elecRows[0] || null;
      const dropRows = elecRows.slice(1);
      const oldDun = keepRow ? round2(keepRow.dun || 0) : 0;
      const droppedDun = round2(dropRows.reduce((s, r) => s + (r.dun || 0), 0));

      const change = {
        rowNo,
        toot: tootFromSheet || geree.toot,
        gereeniiDugaar,
        ner: String(getVal(row, "Нэр", "ner") || "").trim(),
        invoice: invoice.nekhemjlekhiinDugaar,
        invoiceId,
        readings: { umnu, odor, shone, niitOdoo, zoruu },
        tariff: {
          used: usedTariff,
          excel: excelTariff,
          resident: residentTariff,
          source: CONFIG.tariffSource,
          tier: usedTier,
        },
        baseFee,
        zaaltDun: { old: oldDun, new: newZaaltDun, delta: round2(newZaaltDun - oldDun) },
        ledgerId: keepRow ? keepRow._id.toString() : null,
        createdLedgerRow: !keepRow,
        removedDuplicateLedgerRows: dropRows.map((r) => ({ _id: r._id.toString(), dun: r.dun })),
        droppedDun,
        invoiceTotal: { old: round2(invoice.niitTulbur || 0) },
      };

      if (CONFIG.apply) {
        const now = new Date();
        const chargeOgnoo = keepRow?.ognoo || invoice.ognoo || CONFIG.refDate;

        // 1) ledger
        if (dropRows.length) {
          await T.ledger.deleteMany({ _id: { $in: dropRows.map((r) => r._id) } });
        }
        if (keepRow) {
          await T.ledger.updateOne(
            { _id: keepRow._id },
            {
              $set: {
                dun: newZaaltDun,
                undsenDun: newZaaltDun,
                tulukhDun: newZaaltDun,
                updatedAt: now,
              },
            }
          );
        } else {
          const inserted = await T.ledger.insertOne({
            dun: newZaaltDun,
            baiguullagiinId: CONFIG.baiguullagiinId,
            baiguullagiinNer: geree.baiguullagiinNer || baiguullaga.ner || "",
            barilgiinId: CONFIG.barilgiinId,
            gereeniiId: gereeId,
            gereeniiDugaar,
            orshinSuugchId: geree.orshinSuugchId || "",
            nekhemjlekhId: invoiceId,
            toot: geree.toot || tootFromSheet,
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

        // 2) zaaltUnshlalt — update the cycle's reading, otherwise insert one
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
            gereeniiDugaar,
            toot: geree.toot || tootFromSheet,
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
        if (idx >= 0) {
          newZardluud[idx] = { ...newZardluud[idx], ...zardalPatch };
        } else {
          newZardluud.push({
            ner: zaaltZardal.ner || "Цахилгаан",
            turul: zaaltZardal.turul,
            zardliinTurul: zaaltZardal.zardliinTurul || "Хувьсах",
            barilgiinId: CONFIG.barilgiinId,
            ...zardalPatch,
          });
        }
        const niitTulbur = round2(
          newZardluud.reduce((s, z) => s + (z.dun || z.tariff || 0), 0)
        );
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
        const osSet = {
          odorZaalt: odor,
          shonoZaalt: shone,
          suuliinZaalt: niitOdoo,
          updatedAt: now,
        };
        if (CONFIG.tariffSource === "excel" && excelTariff > 0 && excelTariff !== residentTariff) {
          osSet.tsahilgaaniiZaalt = excelTariff;
          change.residentTariffUpdated = { from: residentTariff, to: excelTariff };
        }
        if (osId && mongoose.Types.ObjectId.isValid(osId)) {
          const oid = new mongoose.Types.ObjectId(osId);
          if (osTenant) await T.orshinSuugch.updateOne({ _id: oid }, { $set: osSet });
          if (osCentral) await C.orshinSuugch.updateOne({ _id: oid }, { $set: osSet });
        }

        // 5) invoice header
        const freshRows = await T.ledger
          .find({ nekhemjlekhId: invoiceId, dun: { $gt: 0 } })
          .toArray();
        const invoiceTotal = round2(freshRows.reduce((s, r) => s + (r.dun || 0), 0));
        await T.nekhemjlekh.updateOne(
          { _id: invoice._id },
          {
            $set: {
              niitTulbur: invoiceTotal,
              tsahilgaanNekhemjlekh: newZaaltDun,
              updatedAt: now,
            },
          }
        );
        change.invoiceTotal.new = invoiceTotal;
        touchedGereeIds.add(gereeId);
      } else {
        // dry run: project what the invoice header would become
        const others = invoiceRows
          .filter(
            (r) => (r.dun || 0) > 0 && !elecRows.some((e) => String(e._id) === String(r._id))
          )
          .reduce((s, r) => s + (r.dun || 0), 0);
        change.invoiceTotal.new = round2(others + newZaaltDun);
      }

      change.invoiceTotal.delta = round2(change.invoiceTotal.new - change.invoiceTotal.old);
      report.updated.push(change);

      console.log(
        `  ${CONFIG.apply ? "✔" : "·"} тоот ${String(change.toot).padEnd(4)} ${gereeniiDugaar}  ` +
          `зөрүү ${String(zoruu).padStart(8)} × ${String(usedTariff).padStart(6)} + ${baseFee}  =  ` +
          `${String(newZaaltDun).padStart(10)}  (өмнө ${String(oldDun).padStart(10)}, Δ ${change.zaaltDun.delta})`
      );
    } catch (err) {
      report.failed.push({ rowNo, gereeniiDugaar, toot: tootFromSheet, error: err.message });
      console.log(`  ✖ ${gereeniiDugaar}: ${err.message}`);
    }
  }

  // ---- re-sync invoice statuses (FIFO), mirroring services/guilgeeService.syncInvoicesStatus
  //      but never deleting invoices — this is a correction pass, not a rebuild.
  if (CONFIG.apply && touchedGereeIds.size) {
    console.log(
      `\n🔄 ${touchedGereeIds.size} гэрээний нэхэмжлэхийн төлөв/үлдэгдлийг дахин тооцоолж байна...`
    );
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
  const totalDelta = round2(report.updated.reduce((s, c) => s + c.zaaltDun.delta, 0));
  console.log("\n──────────────────────────────────────────────");
  console.log(`  Шинэчилсэн : ${report.updated.length}`);
  console.log(`  Алгассан   : ${report.skipped.length}`);
  console.log(`  Алдаатай   : ${report.failed.length}`);
  console.log(`  Нийт зөрүү : ${totalDelta.toLocaleString("mn-MN")}₮`);
  console.log("──────────────────────────────────────────────");
  if (report.failed.length) {
    console.log("\n⚠️  Алдаатай мөрүүд:");
    report.failed.forEach((f) =>
      console.log(`   тоот ${f.toot || "?"} ${f.gereeniiDugaar}: ${f.error}`)
    );
  }
  if (report.skipped.length) {
    console.log("\nℹ️  Алгассан мөрүүд:");
    report.skipped.forEach((s) =>
      console.log(`   тоот ${s.toot || "?"} ${s.gereeniiDugaar || ""}: ${s.reason}`)
    );
  }

  report.summary = {
    updated: report.updated.length,
    skipped: report.skipped.length,
    failed: report.failed.length,
    totalDelta,
  };
  fs.writeFileSync(path.resolve(CONFIG.report), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n📝 Тайлан: ${path.resolve(CONFIG.report)}`);
  if (!CONFIG.apply)
    console.log("\n🟦 DRY RUN — юу ч бичээгүй. Бодитоор хийхдээ --apply нэмнэ үү.\n");

  await centralConn.close();
  await tenantConn.close();
}

main().catch((err) => {
  console.error("\n❌ Script failed:", err);
  process.exit(1);
});
