const crypto = require("crypto");
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

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(geree.baiguullagiinId).lean();
  const barilga = baiguullaga && baiguullaga.barilguud && baiguullaga.barilguud.find(b => String(b._id) === String(geree.barilgiinId));

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

  if (Number(geree.ekhniiUldegdel) > 0 && options.isFirstInvoice) {
    charges.push({
      ner: "Эхний үлдэгдэл",
      dun: Number(geree.ekhniiUldegdel),
      turul: "Авлага",
      zardliinTurul: "Авлага",
      isEkhniiUldegdel: true
    });
  }

  const isMeterCharge = (z) => {
    if (z.zaalt === true) return true;
    if (z.zardliinTurul === "Хувьсах") return true;

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

  const rawFixedZardluud = (geree.zardluud || []).filter(z => !isMeterCharge(z));
  const fixedMap = new Map();
  for (const z of rawFixedZardluud) {
    const key = (z.ner || "").trim().toLowerCase();
    if (meterNames.has(key)) continue;
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

  const total = charges.reduce((sum, c) => sum + c.dun, 0);
  console.log(`🔎 [calculateGereeCharges] charges:`, JSON.stringify(charges, null, 2), `Total: ${total}`);
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

  const priorInvoiceCount = await NekhemjlekhiinTuukhModel.countDocuments({
    gereeniiId: gereeId.toString(),
  });
  const isFirstInvoice = priorInvoiceCount === 0;

  const { charges, total } = await calculateGereeCharges(kholbolt, geree, { ...options, isFirstInvoice });

  if (total === 0 && !options.forceEmpty) {
    return { success: true, message: "No charges to bill", total: 0 };
  }

  let cronDay = 1;
  let cronSchedule = null;
  try {
    cronSchedule = await NekhemjlekhCron(kholbolt).findOne({
      baiguullagiinId: geree.baiguullagiinId,
      $or: [
        { barilgiinId: geree.barilgiinId },
        { barilgiinId: null }
      ]
    }).sort({ barilgiinId: -1 }).lean();

    if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
      cronDay = cronSchedule.nekhemjlekhUusgekhOgnoo;
    }
  } catch (err) {
    console.error("Error fetching cron schedule for cycle:", err);
  }

  const billingDate = options.billingDate || new Date();
  const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, billingDate);

  let invoice = await NekhemjlekhiinTuukhModel.findOne({
    gereeniiId: geree._id.toString(),
    ognoo: { $gte: startOfCycle, $lte: endOfCycle }
  }).sort({ ognoo: -1 });

  if (invoice && invoice.tuluv === "Төлсөн" && !options.override) {
    invoice = null;
  }

  if (invoice && !options.override) {
    return { success: false, message: "Тухайн сарын нэхэмжлэх аль хэдийн үүссэн байна." };
  }

  if (!invoice) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const dugaarModel = Dugaarlalt(db.erunkhiiKholbolt);
    const dugaarObj = await dugaarModel.findOneAndUpdate(
      { turul: `НЭХ-${stamp}`, baiguullagiinId: geree.baiguullagiinId },
      { $inc: { dugaar: 1 } },
      { upsert: true, new: true }
    );
    const invoiceNumber = `НЭХ-${stamp}-${String(dugaarObj.dugaar).padStart(4, "0")}`;

    let tulukhOgnoo = billingDate;
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
      niitTulbur: total,
      paymentToken: require("crypto").randomBytes(4).toString("hex"),
      tuluv: "Төлөөгүй",
      medeelel: { zardluud: [] },
    });
    await invoice.save();
  }

  const GuilgeeAvlaguudModel = require("../models/guilgeeAvlaguud")(kholbolt);

  await GuilgeeAvlaguudModel.updateMany(
    {
      gereeniiId: geree._id.toString(),
      nekhemjlekhId: { $exists: false },
      dun: { $gt: 0 }
    },
    { $set: { nekhemjlekhId: invoice._id.toString() } }
  );

  await GuilgeeAvlaguudModel.deleteMany({
    nekhemjlekhId: invoice._id.toString(),
    source: "nekhemjlekh"
  });

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

    // Reset pro-rating flags (one-time use)
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
        const resident = await OrshinSuugchModel.findById(residentId);
        if (resident) {
          let tootsChanged = false;
          (resident.toots || []).forEach(t => {
            const isMainMatch = String(t.toot) === String(geree.toot) && 
                                String(t.barilgiinId) === String(geree.barilgiinId) && 
                                String(t.baiguullagiinId) === String(geree.baiguullagiinId);
            const isNemeltMatch = Array.isArray(geree.nemeltTootnuud) && geree.nemeltTootnuud.some(nt => 
              String(nt.toot) === String(t.toot) && 
              String(t.barilgiinId) === String(geree.barilgiinId) && 
              String(t.baiguullagiinId) === String(geree.baiguullagiinId)
            );
            if (t.khonogoorBodokhEsekh && (isMainMatch || isNemeltMatch)) {
              tootsChanged = true;
              t.khonogoorBodokhEsekh = false;
              t.bodokhKhonog = 0;
            }
          });

          if (tootsChanged || resident.khonogoorBodokhEsekh || resident.bodokhKhonog !== 0) {
            resident.khonogoorBodokhEsekh = false;
            resident.bodokhKhonog = 0;
            await resident.save();
          }
        }

        const client = await KhariltsagchModel.findById(residentId);
        if (client) {
          let tootsChanged = false;
          (client.toots || []).forEach(t => {
            const isMainMatch = String(t.toot) === String(geree.toot) && 
                                String(t.barilgiinId) === String(geree.barilgiinId) && 
                                String(t.baiguullagiinId) === String(geree.baiguullagiinId);
            const isNemeltMatch = Array.isArray(geree.nemeltTootnuud) && geree.nemeltTootnuud.some(nt => 
              String(nt.toot) === String(t.toot) && 
              String(t.barilgiinId) === String(geree.barilgiinId) && 
              String(t.baiguullagiinId) === String(geree.baiguullagiinId)
            );
            if (t.khonogoorBodokhEsekh && (isMainMatch || isNemeltMatch)) {
              tootsChanged = true;
              t.khonogoorBodokhEsekh = false;
              t.bodokhKhonog = 0;
            }
          });

          if (tootsChanged || client.khonogoorBodokhEsekh || client.bodokhKhonog !== 0) {
            client.khonogoorBodokhEsekh = false;
            client.bodokhKhonog = 0;
            await client.save();
          }
        }
      }
    }
  }

  return { success: true, invoiceId: invoice._id, status: invoice.tuluv };
}

async function ensureEkhniiUldegdel(kholbolt, geree, options = {}) {
  const GuilgeeAvlaguudModel = require("../models/guilgeeAvlaguud")(kholbolt);
  const guilgeeService = require("./guilgeeService");

  const rows = await GuilgeeAvlaguudModel.find({
    gereeniiId: geree._id.toString(),
    ekhniiUldegdelEsekh: true,
  }).lean();

  const currentTotal = rows.reduce((sum, r) => sum + (Number(r.undsenDun || r.tulukhDun || r.dun || r.undsenUne) || 0), 0);
  const targetEkhnii = Number(geree.ekhniiUldegdel || 0);
  const delta = Math.round((targetEkhnii - currentTotal) * 100) / 100;

  if (Math.abs(delta) < 0.01) return true;

  if (rows.length > 0) {
    // Once created, the initial balance ledger record is completely untouchable by automated updates.
    console.log(`ℹ️ [ensureEkhniiUldegdel] Record already exists, keeping untouchable (no update).`);
    return true;
  } else {
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

  const geree = await GereeModel.findById(gereeId).lean();
  if (!geree) return null;

  const targetDate = options.billingDate ? new Date(options.billingDate) : new Date();

  // Determine billing cycle bounds for targetDate
  let cronDay = 1;
  try {
    const cronSchedule = await NekhemjlekhCron(kholbolt).findOne({
      baiguullagiinId: geree.baiguullagiinId,
      $or: [{ barilgiinId: geree.barilgiinId }, { barilgiinId: null }]
    }).sort({ barilgiinId: -1 }).lean();
    if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
      cronDay = cronSchedule.nekhemjlekhUusgekhOgnoo;
    }
  } catch (e) {}

  const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, targetDate);

  // 1. First look for an invoice in the target date's billing cycle
  let invoice = await NekhemjlekhiinTuukhModel.findOne({
    gereeniiId: gereeId.toString(),
    ognoo: { $gte: startOfCycle, $lte: endOfCycle }
  }).sort({ ognoo: -1, createdAt: -1 });

  // 2. Fallback to latest unpaid invoice if no specific billing date was requested
  if (!invoice && !options.billingDate) {
    invoice = await NekhemjlekhiinTuukhModel.findOne({
      gereeniiId: gereeId.toString(),
      tuluv: "Төлөөгүй",
    }).sort({ ognoo: -1, createdAt: -1 });
  }

  if (invoice) return invoice;

  // 3. Create invoice with targetDate as billingDate
  const result = await createInvoiceForContract(kholbolt, gereeId, {
    ...options,
    forceEmpty: true,
    billingDate: targetDate
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
