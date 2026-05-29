const { db, Dugaarlalt } = require("zevbackv2");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
const guilgeeService = require("./guilgeeService");
const { normalizeTurul } = require("../utils/zardalUtils");
const NekhemjlekhCron = require("../models/cronSchedule");
const { calculateNextDueDate, calculateBillingCycleBounds } = require("../utils/dateUtils");

async function calculateGereeCharges(kholbolt, geree, options = {}) {
  console.log(`🔎 [calculateGereeCharges] Starting calculation for gereeId: ${geree._id?.toString() || geree._id}, gereeniiDugaar: ${geree.gereeniiDugaar}`);
  console.log(`🔎 [calculateGereeCharges] contractType: ${geree.turul}, options:`, JSON.stringify(options));
  console.log(`🔎 [calculateGereeCharges] nemeltTootnuud:`, JSON.stringify(geree.nemeltTootnuud));

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(geree.baiguullagiinId).lean();
  const barilga = baiguullaga?.barilguud?.find(b => String(b._id) === String(geree.barilgiinId));

  const charges = [];
  const totalDaysInMonth = getDaysInMonth(options.billingDate || new Date());
  const denominator = barilga?.tokhirgoo?.bodokhArga === "Тогтмол"
    ? (barilga.tokhirgoo.bodokhKhonog || 30)
    : totalDaysInMonth;

  const isProratingEnabled = !!barilga?.tokhirgoo?.bodokhArgaEnabled;

  const shouldProrate = (isProratingEnabled || geree.khonogoorBodokhEsekh) && geree.khonogoorBodokhEsekh && geree.bodokhKhonog > 0;
  const prorateFactor = shouldProrate
    ? (geree.bodokhKhonog / denominator)
    : 1;

  if (Number(geree.ekhniiUldegdel) > 0) {
    charges.push({
      ner: "Эхний үлдэгдэл",
      dun: Number(geree.ekhniiUldegdel),
      turul: "Авлага",
      zardliinTurul: "Авлага",
      isEkhniiUldegdel: true
    });
  }

  // --- ADDITIONAL NESTED GARAGES / STORAGES ---
  if (Array.isArray(geree.nemeltTootnuud) && geree.nemeltTootnuud.length > 0) {
    const garageEnabled = !!barilga?.tokhirgoo?.garsiinTolborEnabled;
    const method = barilga?.tokhirgoo?.garsiinTolborArga || "Тогтмол";
    const baseValue = Number(barilga?.tokhirgoo?.garsiinTolborUtga || 0);

    for (const au of geree.nemeltTootnuud) {
      // 1. Nest opening balance for additional unit if any
      if (Number(au.ekhniiUldegdel) > 0) {
        const label = (au.turul === "Гараж" || au.turul === "Зогсоол") ? "Эхний үлдэгдэл (Гараж " : "Эхний үлдэгдэл (Агуулах ";
        charges.push({
          ner: `${label}${au.toot})`,
          dun: Number(au.ekhniiUldegdel),
          turul: "Авлага",
          zardliinTurul: "Авлага",
          isEkhniiUldegdel: true
        });
      }

      // 2. Monthly constant payment for additional unit if enabled
      const isGarage = au.turul === "Гараж" || au.turul === "Зогсоол";
      const isStorage = au.turul === "Агуулах";

      const storageEnabled = !!barilga?.tokhirgoo?.aguulakhTolborEnabled;
      const storageMethod = barilga?.tokhirgoo?.aguulakhTolborArga || "Тогтмол";
      const storageBaseValue = Number(barilga?.tokhirgoo?.aguulakhTolborUtga || 0);

      const isEnabled = isGarage ? garageEnabled : isStorage ? storageEnabled : false;
      const currentMethod = isGarage ? method : storageMethod;
      const currentBaseValue = isGarage ? baseValue : storageBaseValue;

      if (isEnabled && (isGarage || isStorage)) {
        let dun = currentBaseValue;
        if (currentMethod === "Тогтмол" && dun > 0) {
          const isUnitProrating = au.khonogoorBodokhEsekh === true || au.khonogoorBodokhEsekh === "true";
          const unitProrateDays = Number(au.bodokhKhonog) || 0;

          const shouldProrateUnit = (isProratingEnabled || isUnitProrating) && isUnitProrating && unitProrateDays > 0;
          if (shouldProrateUnit) {
            const prorateFactorUnit = unitProrateDays / denominator;
            dun = Math.round(dun * prorateFactorUnit);
          }

          const label = isGarage ? "Зогсоолын төлбөр" : "Агуулахын төлбөр";
          charges.push({
            ner: `${label} (${au.toot})`,
            dun: dun,
            turul: "avlaga",
            zardliinTurul: au.turul,
            tailbar: isGarage ? "Зогсоол" : "Агуулах",
          });
        }
      }
    }
  }

  const isMeterCharge = (z) => {
    if (z.zaalt === true) return true;
    if (z.zardliinTurul === "Хувьсах") return true;

    // Robust detection fallback for main resident electricity charge
    const nameLower = (z.ner || "").toLowerCase();
    if (
      nameLower.includes("цахилгаан") &&
      !nameLower.includes("дундын") &&
      !nameLower.includes("өмчлөл") &&
      !nameLower.includes("нийтийн") &&
      !nameLower.includes("ерөнхий") &&
      !nameLower.includes("гадна") &&
      !nameLower.includes("гэрэлтүүлэг") &&
      !nameLower.includes("шат")
    ) {
      if (z.tariffUsgeer === "кВт" || z.zardliinTurul === "Хувьсах") {
        return true;
      }
    }
    return false;
  };

  // Separate and deduplicate meter charges by name, prioritizing "Хувьсах" or "zaalt === true"
  const rawZaaltZardluud = (geree.zardluud || []).filter(isMeterCharge);
  const zaaltMap = new Map();
  for (const z of rawZaaltZardluud) {
    const key = (z.ner || "").trim().toLowerCase();
    const existing = zaaltMap.get(key);
    if (!existing || z.zardliinTurul === "Хувьсах" || z.zaalt === true) {
      zaaltMap.set(key, z);
    }
  }
  const zaaltZardluud = Array.from(zaaltMap.values());
  const meterNames = new Set(zaaltMap.keys());

  // Deduplicate and filter fixed charges, excluding any duplicates that share a name with a meter charge
  const rawFixedZardluud = (geree.zardluud || []).filter(z => !isMeterCharge(z));
  const fixedMap = new Map();
  for (const z of rawFixedZardluud) {
    const key = (z.ner || "").trim().toLowerCase();
    if (meterNames.has(key)) continue; // Suppress duplicate fixed charge since a proper variable meter charge exists
    if (!fixedMap.has(key)) {
      fixedMap.set(key, z);
    }
  }
  const fixedZardluud = Array.from(fixedMap.values());

  for (const z of fixedZardluud) {
    const isLift = (z.ner || "").toLowerCase().includes("лифт") || (z.zardliinTurul || "").toLowerCase() === "лифт";
    if (isLift && barilga?.tokhirgoo?.liftShalgaya?.choloolugdokhDavkhar?.includes(String(geree.davkhar))) {
      continue;
    }

    let dun = z.dun || z.tariff || 0;
    if (prorateFactor !== 1) {
      dun = Math.round(dun * prorateFactor);
    }

    charges.push({
      ner: z.ner,
      dun: dun,
      turul: normalizeTurul(z.turul),
      zardliinTurul: z.zardliinTurul || "Бусад",
    });
  }

  if (zaaltZardluud.length > 0) {
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(geree.orshinSuugchId).select("tsahilgaaniiZaalt").lean();
    const kwhTariff = orshinSuugch?.tsahilgaaniiZaalt || 0;

    for (const z of zaaltZardluud) {
      let zaaltDun = 0;
      const latestReading = await ZaaltUnshlalt(kholbolt).findOne({ gereeniiId: String(geree._id) })
        .sort({ importOgnoo: -1, unshlaltiinOgnoo: -1 }).lean();

      if (latestReading && latestReading.zaaltDun > 0) {
        zaaltDun = latestReading.zaaltDun;
      } else if (z.dun > 0) {
        zaaltDun = z.dun;
      } else {
        const finalSuuliin = options.suuliinZaalt !== undefined ? options.suuliinZaalt : (geree.suuliinZaalt || 0);
        const finalUmnukh = options.umnukhZaalt !== undefined ? options.umnukhZaalt : (geree.umnukhZaalt || 0);
        const zoruu = finalSuuliin - finalUmnukh;
        const baseFee = Number(z.suuriKhuraamj || z.tariff || 0);
        zaaltDun = (zoruu * (kwhTariff || z.tariff || 0)) + baseFee;
      }

      if (zaaltDun > 0) {
        if (prorateFactor !== 1) {
          zaaltDun = Math.round(zaaltDun * prorateFactor);
        }

        const rawRecName = z.ner;
        const rawRecNameLc = (rawRecName || "").toLowerCase();
        const displayRecName =
          rawRecNameLc === "ашиглалт" || rawRecNameLc === "ashiglalt"
            ? "Цахилгаан"
            : rawRecName || "Авлага";
        let rowTailbar =
          z.tailbar || z.zardliinNer || z.ner || "Гараар нэмсэн авлага";
        charges.push({
          ner: displayRecName,
          dun: zaaltDun,
          turul: normalizeTurul(z.turul),
          zardliinTurul: z.zardliinTurul || "Эрчим хүч",
          tailbar: rowTailbar,
          isZaalt: true,
        });
      }
    }
  }

  console.log(`🔎 [calculateGereeCharges] Raw computed charges before filtering:`, JSON.stringify(charges, null, 2));

  if (options.onlyGarage || options.onlyStorage || options.onlyGarageOrStorage) {
    const contractType = (geree.turul || "").trim().toLowerCase();
    const isDedicatedGarage = contractType === "гараж" || contractType === "зогсоол";
    const isDedicatedStorage = contractType === "агуулах";

    console.log(`🔎 [calculateGereeCharges] Filtering active. isDedicatedGarage: ${isDedicatedGarage}, isDedicatedStorage: ${isDedicatedStorage}`);

    if (options.onlyGarage && isDedicatedStorage) {
      console.log(`🔎 [calculateGereeCharges] onlyGarage requested but contract is Dedicated Storage. Returning empty.`);
      return { charges: [], total: 0 };
    }
    if (options.onlyStorage && isDedicatedGarage) {
      console.log(`🔎 [calculateGereeCharges] onlyStorage requested but contract is Dedicated Garage. Returning empty.`);
      return { charges: [], total: 0 };
    }

    const filteredCharges = charges.filter((c) => {
      let keep = false;
      if (options.onlyGarage) {
        if (isDedicatedGarage) {
          keep = true;
        } else {
          keep = (
            (c.ner || "").toLowerCase().includes("гараж") ||
            (c.ner || "").toLowerCase().includes("зогсоол") ||
            (c.zardliinTurul || "").toLowerCase().includes("гараж") ||
            (c.zardliinTurul || "").toLowerCase().includes("зогсоол") ||
            (c.tailbar || "").toLowerCase().includes("гараж") ||
            (c.tailbar || "").toLowerCase().includes("зогсоол")
          );
        }
        console.log(`  [Filter onlyGarage] Charge: "${c.ner}", type: "${c.zardliinTurul}" -> KEEP: ${keep}`);
        return keep;
      }
      if (options.onlyStorage) {
        if (isDedicatedStorage) {
          keep = true;
        } else {
          keep = (
            (c.ner || "").toLowerCase().includes("агуулах") ||
            (c.zardliinTurul || "").toLowerCase().includes("агуулах") ||
            (c.tailbar || "").toLowerCase().includes("агуулах")
          );
        }
        console.log(`  [Filter onlyStorage] Charge: "${c.ner}", type: "${c.zardliinTurul}" -> KEEP: ${keep}`);
        return keep;
      }
      // onlyGarageOrStorage fallback
      if (isDedicatedGarage || isDedicatedStorage) {
        keep = true;
      } else {
        keep = (
          (c.ner || "").toLowerCase().includes("гараж") ||
          (c.ner || "").toLowerCase().includes("зогсоол") ||
          (c.ner || "").toLowerCase().includes("агуулах") ||
          (c.zardliinTurul || "").toLowerCase().includes("гараж") ||
          (c.zardliinTurul || "").toLowerCase().includes("зогсоол") ||
          (c.zardliinTurul || "").toLowerCase().includes("агуулах") ||
          (c.tailbar || "").toLowerCase().includes("гараж") ||
          (c.tailbar || "").toLowerCase().includes("зогсоол") ||
          (c.tailbar || "").toLowerCase().includes("агуулах")
        );
      }
      console.log(`  [Filter onlyGarageOrStorage] Charge: "${c.ner}", type: "${c.zardliinTurul}" -> KEEP: ${keep}`);
      return keep;
    });
    const total = filteredCharges.reduce((sum, c) => sum + c.dun, 0);
    console.log(`🔎 [calculateGereeCharges] Final FILTERED charges:`, JSON.stringify(filteredCharges, null, 2), `Total: ${total}`);
    return { charges: filteredCharges, total };
  }

  const total = charges.reduce((sum, c) => sum + c.dun, 0);
  console.log(`🔎 [calculateGereeCharges] Normal flow (no filter). Total: ${total}`);
  return { charges, total };
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

async function createInvoiceForContract(kholbolt, gereeId, options = {}) {
  console.log(`🚀 [createInvoiceForContract] STARTED with gereeId: ${gereeId}, options:`, JSON.stringify(options));
  const GereeModel = Geree(kholbolt);
  const NekhemjlekhiinTuukhModel = NekhemjlekhiinTuukh(kholbolt);

  const mongoose = require("mongoose");
  const geree = await GereeModel.collection.findOne({ _id: new mongoose.Types.ObjectId(gereeId) });
  if (!geree) {
    console.error(`❌ [createInvoiceForContract] Contract ${gereeId} NOT found in database!`);
    throw new Error("Contract not found");
  }

  const { charges, total } = await calculateGereeCharges(kholbolt, geree, options);

  if (total === 0 && !options.forceEmpty) {
    // Just return success even if empty, as requested
    return { success: true, message: "No charges to bill", total: 0 };
  }

  // Fetch cron schedule early to determine exact billing cycle bounds
  let cronDay = 1; // Default to 1st of month
  let cronSchedule = null;
  try {
    cronSchedule = await NekhemjlekhCron(kholbolt).findOne({
      baiguullagiinId: geree.baiguullagiinId,
      $or: [
        { barilgiinId: geree.barilgiinId },
        { barilgiinId: null }
      ]
    }).sort({ barilgiinId: -1 }).lean(); // Prioritize building-specific schedule

    if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
      cronDay = cronSchedule.nekhemjlekhUusgekhOgnoo;
    }
  } catch (err) {
    console.error("Error fetching cron schedule for cycle:", err);
  }

  const billingDate = options.billingDate || new Date();

  // Use exact billing cycle bounds based on cron schedule day
  const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, billingDate);

  let invoice = await NekhemjlekhiinTuukhModel.findOne({
    gereeniiId: geree._id.toString(),
    ognoo: { $gte: startOfCycle, $lte: endOfCycle }
  }).sort({ ognoo: -1 });

  const isDedicatedGarageContract =
    (geree.turul || "").toLowerCase() === "гараж" ||
    (geree.turul || "").toLowerCase() === "зогсоол" ||
    (geree.turul || "").toLowerCase() === "агуулах";

  const isGarageOrStorageOption = !!(options.onlyGarage || options.onlyStorage || options.onlyGarageOrStorage);

  if (invoice && !options.override && !(isGarageOrStorageOption && !isDedicatedGarageContract)) {
    return { success: false, message: "Тухайн мөчлөгийн нэхэмжлэх аль хэдийн үүссэн байна." };
  }

  if (!invoice) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    // Use atomic Dugaarlalt for unique invoice numbers
    const dugaarModel = Dugaarlalt(db.erunkhiiKholbolt);
    const dugaarObj = await dugaarModel.findOneAndUpdate(
      { turul: `НЭХ-${stamp}`, baiguullagiinId: geree.baiguullagiinId },
      { $inc: { dugaar: 1 } },
      { upsert: true, new: true }
    );
    const invoiceNumber = `НЭХ-${stamp}-${String(dugaarObj.dugaar).padStart(4, "0")}`;

    let tulukhOgnoo = billingDate;

    // Use previously fetched cronSchedule to determine due date
    if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
      tulukhOgnoo = calculateNextDueDate(cronSchedule.nekhemjlekhUusgekhOgnoo, billingDate);
    }

    invoice = new NekhemjlekhiinTuukhModel({
      ...geree,
      _id: undefined,
      gereeniiId: geree._id.toString(),
      nekhemjlekhiinDugaar: invoiceNumber,
      ognoo: billingDate,
      tulukhOgnoo: tulukhOgnoo,
      niitTulbur: 0,
      tuluv: "Төлөөгүй",
      medeelel: { zardluud: [] },
    });
    await invoice.save();
  }

  const GuilgeeAvlaguudModel = require("../models/guilgeeAvlaguud")(kholbolt);

  // 2. Adopt any unlinked ledger items (orphans)
  await GuilgeeAvlaguudModel.updateMany(
    {
      gereeniiId: geree._id.toString(),
      nekhemjlekhId: { $exists: false },
      dun: { $gt: 0 }
    },
    { $set: { nekhemjlekhId: invoice._id.toString() } }
  );


  // Delete existing auto-generated charges for this invoice, scoped to type if partial billing
  if (options.onlyGarage) {
    // Only delete existing garage/parking charges — preserve storage entries
    await GuilgeeAvlaguudModel.deleteMany({
      nekhemjlekhId: invoice._id.toString(),
      source: "nekhemjlekh",
      $or: [
        { zardliinTurul: { $in: ["Гараж", "Зогсоол"] } },
        { tailbar: { $in: ["Гараж", "Зогсоол"] } },
        { zardliinNer: /зогсоол|гараж/i }
      ]
    });
  } else if (options.onlyStorage) {
    // Only delete existing storage charges — preserve garage entries
    await GuilgeeAvlaguudModel.deleteMany({
      nekhemjlekhId: invoice._id.toString(),
      source: "nekhemjlekh",
      $or: [
        { zardliinTurul: "Агуулах" },
        { tailbar: "Агуулах" },
        { zardliinNer: /агуулах/i }
      ]
    });
  } else {
    // Normal full billing — wipe all auto-generated charges and recreate
    await GuilgeeAvlaguudModel.deleteMany({
      nekhemjlekhId: invoice._id.toString(),
      source: "nekhemjlekh"
    });
  }

  const existingEkhnii = await GuilgeeAvlaguudModel.findOne({
    gereeniiId: geree._id.toString(),
    ekhniiUldegdelEsekh: true
  });
  if (!options.skipCharges) {
    console.log(`🚀 [createInvoiceForContract] Processing ${charges.length} charges for ledger saving...`);
    for (const c of charges) {
      console.log(`  [Charge Processing] ner: "${c.ner}", dun: ${c.dun}, zardliinTurul: "${c.zardliinTurul}", isEkhniiUldegdel: ${!!c.isEkhniiUldegdel}`);
      if (c.isEkhniiUldegdel && existingEkhnii) {
        console.log(`  [Charge Processing] Skipping opening balance "${c.ner}" because existingEkhnii exists.`);
        continue;
      }

      const existingCharge = await GuilgeeAvlaguudModel.findOne({
        gereeniiId: geree._id.toString(),
        zardliinNer: c.ner,
        source: "nekhemjlekh",
        ognoo: {
          $gte: startOfCycle,
          $lte: endOfCycle
        }
      });

      if (existingCharge) {
        console.log(`  [Charge Processing] Found existing charge in this cycle (ID: ${existingCharge._id?.toString() || existingCharge._id}). Existing dun: ${existingCharge.dun}, new dun: ${c.dun}`);
        if (Number(existingCharge.dun) !== Number(c.dun)) {
          console.log(`  [Charge Processing] Amounts differ. Updating existing charge ID: ${existingCharge._id} to dun: ${c.dun}`);
          await GuilgeeAvlaguudModel.updateOne(
            { _id: existingCharge._id },
            {
              $set: {
                dun: c.dun,
                undsenDun: c.dun,
                tulukhDun: c.dun,
                nekhemjlekhId: invoice._id.toString()
              }
            }
          );
          await guilgeeService.syncInvoicesStatus(kholbolt, geree._id.toString()).catch(err => {
            console.error("❌ [LEDGER SYNC] syncInvoicesStatus failed after charge update:", err.message);
          });
        } else {
          console.log(`  [Charge Processing] Amounts match. No update needed.`);
        }
        continue;
      }

      console.log(`  [Charge Processing] Calling guilgeeService.recordCharge for "${c.ner}", amount: ${c.dun}`);
      try {
        const savedCharge = await guilgeeService.recordCharge(kholbolt, {
          ...geree,
          _id: undefined,
          gereeniiId: geree._id.toString(),
          nekhemjlekhId: invoice._id.toString(),
          dun: c.dun,
          zardliinNer: c.ner,
          tailbar: c.tailbar || c.ner,
          zardliinTurul: c.zardliinTurul,
          turul: c.turul || geree.turul || "avlaga",
          ognoo: options.billingDate || new Date(),
          source: c.isEkhniiUldegdel ? "geree" : "nekhemjlekh",
          ekhniiUldegdelEsekh: !!c.isEkhniiUldegdel,
          guilgeeKhiisenAjiltniiNer: options.ajiltanNer || "Систем",
          guilgeeKhiisenAjiltniiId: options.ajiltanId || geree.orshinSuugchId,
        });
        console.log(`  [Charge Processing] ✅ Saved new charge in ledger. ID: ${savedCharge?._id?.toString() || savedCharge?._id}`);
      } catch (recErr) {
        console.error(`  [Charge Processing] ❌ ERROR recording charge for "${c.ner}":`, recErr.message, recErr.stack);
      }
    }

  // 4.5. Reset pro-rating flags (one-time use)
  let resetRequired = false;
  let updatedNemeltTootnuud = geree.nemeltTootnuud;
  if (Array.isArray(geree.nemeltTootnuud)) {
    updatedNemeltTootnuud = geree.nemeltTootnuud.map(au => {
      if (au.khonogoorBodokhEsekh === true || au.khonogoorBodokhEsekh === "true") {
        resetRequired = true;
        return { ...au, khonogoorBodokhEsekh: false, bodokhKhonog: 0 };
      }
      return au;
    });
  }

  if (geree.khonogoorBodokhEsekh || resetRequired) {
    const GereeModel = Geree(kholbolt);
    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    const KhariltsagchModel = require("../models/khariltsagch")(db.erunkhiiKholbolt);

    await GereeModel.findByIdAndUpdate(geree._id, {
      $set: {
        khonogoorBodokhEsekh: false,
        bodokhKhonog: 0,
        ...(resetRequired ? { nemeltTootnuud: updatedNemeltTootnuud } : {})
      }
    });

    const residentId = geree.orshinSuugchId || geree.khariltsagchId;
    if (residentId) {
      // Try resetting in OrshinSuugch
      const resident = await OrshinSuugchModel.findById(residentId);
      if (resident) {
        let tootsChanged = false;
        let newToots = (resident.toots || []).map(t => {
          const match = t.khonogoorBodokhEsekh && (t.turul === "Гараж" || t.turul === "Агуулах");
          if (match) {
            tootsChanged = true;
            return { ...t, khonogoorBodokhEsekh: false, bodokhKhonog: 0 };
          }
          return t;
        });

        await OrshinSuugchModel.findByIdAndUpdate(residentId, {
          $set: {
            khonogoorBodokhEsekh: false,
            bodokhKhonog: 0,
            ...(tootsChanged ? { toots: newToots } : {})
          }
        });
      }

      // Try resetting in Khariltsagch
      const client = await KhariltsagchModel.findById(residentId);
      if (client) {
        let tootsChanged = false;
        let newToots = (client.toots || []).map(t => {
          const match = t.khonogoorBodokhEsekh && (t.turul === "Гараж" || t.turul === "Агуулах");
          if (match) {
            tootsChanged = true;
            return { ...t, khonogoorBodokhEsekh: false, bodokhKhonog: 0 };
          }
          return t;
        });

        await KhariltsagchModel.findByIdAndUpdate(residentId, {
          $set: {
            khonogoorBodokhEsekh: false,
            bodokhKhonog: 0,
            ...(tootsChanged ? { toots: newToots } : {})
          }
        });
      }
    }
  }
}

  // 5. Done. We no longer snapshot charges or totals into the invoice document.
  // The ledger is the only source of truth.
  return { success: true, invoiceId: invoice._id, status: invoice.tuluv };
}

async function ensureEkhniiUldegdel(kholbolt, geree, options = {}) {
  const GuilgeeAvlaguudModel = require("../models/guilgeeAvlaguud")(kholbolt);
  const guilgeeService = require("./guilgeeService");

  // 1. Calculate current ledger-based initial balance total
  const rows = await GuilgeeAvlaguudModel.find({
    gereeniiId: geree._id.toString(),
    ekhniiUldegdelEsekh: true,
  }).lean();

  const currentTotal = rows.reduce((sum, r) => sum + (Number(r.undsenDun || r.tulukhDun || r.dun || r.undsenUne) || 0), 0);
  const targetEkhnii = Number(geree.ekhniiUldegdel || 0);
  const delta = Math.round((targetEkhnii - currentTotal) * 100) / 100;

  if (Math.abs(delta) < 0.01) return true; // Already synced

  // 2. Adjust ledger
  if (rows.length > 0) {
    // Update the first existing record with the delta
    await GuilgeeAvlaguudModel.updateOne(
      { _id: rows[0]._id },
      { $inc: { undsenDun: delta, tulukhDun: delta } }
    );
  } else {
    // Create a new record
    const gereeObj = typeof geree.toObject === "function" ? geree.toObject() : geree;
    await guilgeeService.recordCharge(kholbolt, {
      ...gereeObj,
      _id: undefined,
      gereeniiId: String(geree._id),
      baiguullagiinId: String(geree.baiguullagiinId || ""),
      barilgiinId: String(geree.barilgiinId || ""),
      dun: delta,
      zardliinNer: "Эхний үлдэгдэл",
      tailbar: "Системээс үүсгэсэн эхний үлдэгдэл",
      zardliinTurul: "Энгийн",
      ognoo: geree.gereeniiOgnoo || new Date(),
      source: "geree",
      ekhniiUldegdelEsekh: true,
      guilgeeKhiisenAjiltniiNer: options.ajiltanNer || "Систем",
      guilgeeKhiisenAjiltniiId: options.ajiltanId || "System",
    });
  }

  return true;
}

async function ensureActiveInvoice(kholbolt, gereeId, options = {}) {
  const NekhemjlekhiinTuukhModel = NekhemjlekhiinTuukh(kholbolt);
  const GereeModel = Geree(kholbolt);

  const unpaid = await NekhemjlekhiinTuukhModel.findOne({
    gereeniiId: gereeId,
    tuluv: "Төлөөгүй",
  }).sort({ ognoo: -1, createdAt: -1 });

  if (unpaid) return unpaid;

  // If no unpaid invoice, create a new one to house any new debt
  const geree = await GereeModel.findById(gereeId).lean();
  if (!geree) return null;

  const result = await createInvoiceForContract(kholbolt, gereeId, {
    ...options,
    forceEmpty: true, // Create even if only ekhniiUldegdel exists
    billingDate: new Date()
  });

  if (result.success) {
    return await NekhemjlekhiinTuukhModel.findById(result.invoiceId);
  }
  return null;
}

module.exports = {
  calculateGereeCharges,
  createInvoiceForContract,
  ensureEkhniiUldegdel,
  ensureActiveInvoice,
};
