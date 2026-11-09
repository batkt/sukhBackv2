/**
 * match_timetower_bpay.js
 * 
 * Тайм тауэр СӨХ (6a9786569a202a8f8f859f94) - 216, 217, 218, 219-р байрны
 * оршин суугчдын хаяг (orshinSuugch, geree)-ийг BPay (WALLET_API, walletInvoice)-ийн
 * хаягтай 100% тулгаж шалгах READ-ONLY аудит скрипт.
 * 
 * 🛡️ [DRY RUN MODE: 100% READ ONLY - ZERO DATABASE MUTATIONS]
 * ⚠️ Баазад ямар ч бичилт, засвар, шинэчлэлт хийхгүй. Зөвхөн харьцуулж тайлан гаргана.
 * 
 * Автомат холболт (Auto-connect DB):
 *   tokhirgoo/tokhirgoo.env файлын MONGODB_URI-аар автоматаар холбогдоно.
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

  const envUri = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  // Ensure template replaces database name
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
    console.log(`💡 Зөвлөмж: Сервер эсвэл MongoDB порт 27017 ажиллаж байгаа эсэхийг шалгана уу.`);
    console.log(`   Эсвэл өөр холболтын хаяг ашиглах бол: node scripts/match_timetower_bpay.js --uri "mongodb://..."`);
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
          walletBairId: t.walletBairId || "",
          walletDoorNo: t.walletDoorNo || "",
          walletCustomerId: t.walletCustomerId || "",
          billingId: t.billingId || "",
          bairniiNer: t.bairniiNer || "",
        });
      });
    }

    // From walletInvoice
    for (const winv of walletInvoices) {
      const bCode = extractBuildingCode(winv.customerAddress || winv.billingName);
      if (!bCode) continue;

      const tootMatch = (winv.customerAddress || "").match(/(\d+)\s*тоот/i) ||
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

    const allKeys = new Set([...sukhMap.keys(), ...bpayMap.keys()]);

    const tier1_perfectMatches = []; // 100% Match (Building + Toot + Phone or Verified Name)
    const tier2_tootMatches_phoneDiff = []; // Toot Matches, but Phone or Name differs
    const tier3_onlyInSukh = []; // In Sukh but not yet on BPay
    const tier4_onlyInBpay = []; // In BPay but no Sukh contract found

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
        const bpayItem = bpayEntries[0];

        const matchRecord = {
          key,
          building: bCode,
          toot: normToot,
          sukh: {
            ner: sukhItem.ner,
            ovog: sukhItem.ovog,
            utas: sukhItem.utas,
            rawUtas: sukhItem.rawUtas,
            gereeniiDugaar: sukhItem.gereeniiDugaar,
            gereeId: sukhItem.gereeId,
          },
          bpay: {
            ner: bpayItem.ner || bpayItem.customerName,
            utas: bpayItem.utas,
            walletBairId: bpayItem.walletBairId,
            walletDoorNo: bpayItem.walletDoorNo,
            billingId: bpayItem.billingId,
            customerId: bpayItem.walletCustomerId || bpayItem.customerId,
          },
          phoneMatched: phoneMatch,
        };

        if (phoneMatch) {
          tier1_perfectMatches.push(matchRecord);
        } else {
          tier2_tootMatches_phoneDiff.push(matchRecord);
        }
      } else if (sukhEntries.length > 0 && bpayEntries.length === 0) {
        const item = sukhEntries[0];
        tier3_onlyInSukh.push({
          key,
          building: bCode,
          toot: normToot,
          ner: item.ner,
          utas: item.utas,
          gereeniiDugaar: item.gereeniiDugaar,
        });
      } else if (sukhEntries.length === 0 && bpayEntries.length > 0) {
        const item = bpayEntries[0];
        tier4_onlyInBpay.push({
          key,
          building: bCode,
          toot: normToot,
          ner: item.ner || item.customerName,
          utas: item.utas,
          billingId: item.billingId,
          customerId: item.walletCustomerId || item.customerId,
        });
      }
    }

    // -------------------------------------------------------------
    // АЛХАМ 4: ҮР ДҮНГИЙН ТАЙЛАН ХЭВЛЭХ
    // -------------------------------------------------------------
    console.log("\n" + "=".repeat(88));
    console.log("📊 ТУЛГАЛТЫН НЭГДСЭН ДҮН (DRY RUN REPORT):");
    console.log("=".repeat(88));
    console.log(`✅ ТҮВШИН 1 (Ногоон - 100% Бүрэн таарсан: Байр + Тоот + Утас): ${tier1_perfectMatches.length} өрх`);
    console.log(`⚠️  ТҮВШИН 2 (Шар - Байр + Тоот таарсан, гэвч утас/нэр зөрсөн) : ${tier2_tootMatches_phoneDiff.length} өрх`);
    console.log(`ℹ️  ТҮВШИН 3 (Цэнхэр - Зөвхөн Sukh системд бүртгэлтэй гэрээ)       : ${tier3_onlyInSukh.length} өрх`);
    console.log(`❓ ТҮВШИН 4 (Улаан - Зөвхөн BPay дээр байгаа, СӨХ гэрээгүй)      : ${tier4_onlyInBpay.length} өрх`);
    console.log("-".repeat(88));

    if (tier1_perfectMatches.length > 0) {
      console.log(`\n🟢 ТҮВШИН 1 ЖИШЭЭ (Эхний 5 өрх - 100% таарсан):`);
      tier1_perfectMatches.slice(0, 5).forEach((m, idx) => {
        console.log(
          `   [${idx + 1}] Байр ${m.building}, ${m.toot} тоот | Нэр: ${m.sukh.ner || "-"} | Утас: ${m.sukh.utas} | BPay BillingId: ${m.bpay.billingId || "-"}`
        );
      });
    }

    if (tier2_tootMatches_phoneDiff.length > 0) {
      console.log(`\n🟡 ТҮВШИН 2 ЖИШЭЭ (Утас зөрсөн өрхүүд):`);
      tier2_tootMatches_phoneDiff.slice(0, 5).forEach((m, idx) => {
        console.log(
          `   [${idx + 1}] Байр ${m.building}, ${m.toot} тоот | Sukh: [${m.sukh.ner || "-"} - ${m.sukh.utas || "-"}] vs BPay: [${m.bpay.ner || "-"} - ${m.bpay.utas || "-"}]`
        );
      });
    }

    // Save report to JSON file
    const reportPath = path.join(__dirname, "timetower_bpay_match_report.json");
    const reportData = {
      dryRun: true,
      generatedAt: new Date().toISOString(),
      organization: {
        id: TIMETOWER_ORG_ID,
        name: "Тайм тауэр СӨХ",
        buildings: BUILDINGS,
      },
      counts: {
        tier1_perfectMatches: tier1_perfectMatches.length,
        tier2_tootMatches_phoneDiff: tier2_tootMatches_phoneDiff.length,
        tier3_onlyInSukh: tier3_onlyInSukh.length,
        tier4_onlyInBpay: tier4_onlyInBpay.length,
        totalKeysAnalyzed: allKeys.size,
      },
      tier1_perfectMatches,
      tier2_tootMatches_phoneDiff,
      tier3_onlyInSukh,
      tier4_onlyInBpay,
    };

    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf-8");
    console.log(`\n📄 Бүрэн тайланг амжилттай хадгаллаа: ${reportPath}`);
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
