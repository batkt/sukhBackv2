const { db } = require("zevbackv2");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
const guilgeeService = require("./guilgeeService");
const { normalizeTurul } = require("../utils/zardalUtils");
const NekhemjlekhCron = require("../models/cronSchedule");
const { calculateNextDueDate } = require("../utils/dateUtils");

async function calculateGereeCharges(kholbolt, geree, options = {}) {
  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(geree.baiguullagiinId).lean();
  const barilga = baiguullaga?.barilguud?.find(b => String(b._id) === String(geree.barilgiinId));
  
  const charges = [];
  const totalDaysInMonth = getDaysInMonth(options.billingDate || new Date());
  const denominator = barilga?.tokhirgoo?.bodokhArga === "Тогтмол" 
    ? (barilga.tokhirgoo.bodokhKhonog || 30)
    : totalDaysInMonth;

  const isProratingEnabled = !!barilga?.tokhirgoo?.bodokhArgaEnabled;
  const prorateFactor = (isProratingEnabled && geree.khonogoorBodokhEsekh && geree.bodokhKhonog > 0)
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

  const fixedZardluud = (geree.zardluud || []).filter(z => !z.zaalt);
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

  const zaaltZardluud = (geree.zardluud || []).filter(z => z.zaalt);
  if (zaaltZardluud.length > 0) {
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(geree.orshinSuugchId).select("tsahilgaaniiZaalt").lean();
    const kwhTariff = orshinSuugch?.tsahilgaaniiZaalt || 0;

    for (const z of zaaltZardluud) {
      let zaaltDun = 0;
      const latestReading = await ZaaltUnshlalt(db.erunkhiiKholbolt).findOne({ gereeniiId: geree._id })
        .sort({ importOgnoo: -1, unshlaltiinOgnoo: -1 }).lean();

      if (latestReading && latestReading.zaaltDun > 0) {
        zaaltDun = latestReading.zaaltDun;
      } else {
        const zoruu = (options.suuliinZaalt || 0) - (options.umnukhZaalt || 0);
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
  return { charges, total };
}

function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

async function createInvoiceForContract(kholbolt, gereeId, options = {}) {
  const GereeModel = Geree(kholbolt);
  const NekhemjlekhiinTuukhModel = NekhemjlekhiinTuukh(kholbolt);
  
  const geree = await GereeModel.findById(gereeId).lean();
  if (!geree) throw new Error("Contract not found");

  const { charges, total } = await calculateGereeCharges(kholbolt, geree, options);

  if (total === 0 && !options.forceEmpty) {
    // Just return success even if empty, as requested
    return { success: true, message: "No charges to bill", total: 0 };
  }

  // 1. Get or Create the one unpaid invoice
  let invoice = await NekhemjlekhiinTuukhModel.findOne({
    gereeniiId: geree._id.toString(),
    tuluv: "Төлөөгүй"
  }).sort({ ognoo: -1 });

  if (!invoice) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await NekhemjlekhiinTuukhModel.countDocuments({ 
      nekhemjlekhiinDugaar: { $regex: `^НЭХ-${stamp}-` } 
    });
    const invoiceNumber = `НЭХ-${stamp}-${String(count + 1).padStart(4, "0")}`;

    const billingDate = options.billingDate || new Date();
    let tulukhOgnoo = billingDate;

    // Fetch cron schedule to determine due date based on billing cycle
    try {
      const cronSchedule = await NekhemjlekhCron(kholbolt).findOne({
        baiguullagiinId: geree.baiguullagiinId,
        $or: [
          { barilgiinId: geree.barilgiinId },
          { barilgiinId: null }
        ]
      }).sort({ barilgiinId: -1 }); // Prioritize building-specific schedule

      if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
        tulukhOgnoo = calculateNextDueDate(cronSchedule.nekhemjlekhUusgekhOgnoo, billingDate);
      }
    } catch (err) {
      console.error("Error fetching cron schedule for due date:", err);
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


  await GuilgeeAvlaguudModel.deleteMany({
    nekhemjlekhId: invoice._id.toString(),
    source: "nekhemjlekh"
  });

  const existingEkhnii = await GuilgeeAvlaguudModel.findOne({
    gereeniiId: geree._id.toString(),
    ekhniiUldegdelEsekh: true
  });

  if (!options.skipCharges) {
    const billingMonth = (options.billingDate || new Date()).getMonth();
    const billingYear = (options.billingDate || new Date()).getFullYear();

    for (const c of charges) {
      if (c.isEkhniiUldegdel && existingEkhnii) continue;

      const existingCharge = await GuilgeeAvlaguudModel.findOne({
        gereeniiId: geree._id.toString(),
        zardliinNer: c.ner,
        source: "nekhemjlekh",
        ognoo: {
          $gte: new Date(billingYear, billingMonth, 1),
          $lte: new Date(billingYear, billingMonth, 31, 23, 59, 59)
        }
      });

      if (existingCharge) {
        console.log(`Skipping duplicate charge: ${c.ner} for this month`);
        continue;
      }

      await guilgeeService.recordCharge(kholbolt, {
        ...geree,
        _id: undefined,
        gereeniiId: geree._id.toString(),
        nekhemjlekhId: invoice._id.toString(),
        dun: c.dun,
        zardliinNer: c.ner,
        tailbar: c.ner,
        zardliinTurul: c.zardliinTurul,
        ognoo: options.billingDate || new Date(),
        source: c.isEkhniiUldegdel ? "geree" : "nekhemjlekh",
        ekhniiUldegdelEsekh: !!c.isEkhniiUldegdel,
        guilgeeKhiisenAjiltniiNer: options.ajiltanNer || "Систем",
        guilgeeKhiisenAjiltniiId: options.ajiltanId || geree.orshinSuugchId,
      });
    }

    // 4.5. Reset pro-rating flags (one-time use)
    if (geree.khonogoorBodokhEsekh) {
      const GereeModel = Geree(kholbolt);
      const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);

      await GereeModel.findByIdAndUpdate(geree._id, {
        $set: { khonogoorBodokhEsekh: false, bodokhKhonog: 0 }
      });

      if (geree.orshinSuugchId) {
        await OrshinSuugchModel.findByIdAndUpdate(geree.orshinSuugchId, {
          $set: { khonogoorBodokhEsekh: false, bodokhKhonog: 0 }
        });
      }
    }
  }

  // 5. Done. We no longer snapshot charges or totals into the invoice document.
  // The ledger is the only source of truth.
  return { success: true, invoiceId: invoice._id, status: invoice.tuluv };
}

async function ensureEkhniiUldegdel(kholbolt, geree, options = {}) {
  // This logic is now handled during first invoice generation
  return false;
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
