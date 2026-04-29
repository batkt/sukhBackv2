const { db } = require("zevbackv2");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
const guilgeeService = require("./guilgeeService");
const { normalizeTurul } = require("../utils/zardalUtils");

async function calculateGereeCharges(kholbolt, geree, options = {}) {
  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(geree.baiguullagiinId).lean();
  const barilga = baiguullaga?.barilguud?.find(b => String(b._id) === String(geree.barilgiinId));
  
  const charges = [];

  // 1. Add Starting Balance if exists in the contract document
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

    charges.push({
      ner: z.ner,
      dun: z.dun || z.tariff || 0,
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

async function createInvoiceForContract(kholbolt, gereeId, options = {}) {
  const GereeModel = Geree(kholbolt);
  const NekhemjlekhiinTuukhModel = NekhemjlekhiinTuukh(kholbolt);
  
  const geree = await GereeModel.findById(gereeId).lean();
  if (!geree) throw new Error("Contract not found");

  const { charges, total } = await calculateGereeCharges(kholbolt, geree, options);

  if (total === 0 && !options.forceEmpty) {
    return { success: false, message: "No charges to bill" };
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await NekhemjlekhiinTuukhModel.countDocuments({ 
    nekhemjlekhiinDugaar: { $regex: `^НЭХ-${stamp}-` } 
  });
  const invoiceNumber = `НЭХ-${stamp}-${String(count + 1).padStart(4, "0")}`;

  const invoice = new NekhemjlekhiinTuukhModel({
    ...geree,
    _id: undefined,
    gereeniiId: geree._id.toString(),
    nekhemjlekhiinDugaar: invoiceNumber,
    ognoo: options.billingDate || new Date(),
    niitTulbur: total,
    tuluv: "Төлөөгүй",
    medeelel: { zardluud: charges },
  });
  await invoice.save();

  let hasEkhniiUldegdel = false;
  for (const c of charges) {
    if (c.isEkhniiUldegdel) hasEkhniiUldegdel = true;

    await guilgeeService.recordCharge(kholbolt, {
      baiguullagiinId: geree.baiguullagiinId,
      baiguullagiinNer: geree.baiguullagiinNer,
      barilgiinId: geree.barilgiinId,
      gereeniiId: geree._id.toString(),
      gereeniiDugaar: geree.gereeniiDugaar,
      orshinSuugchId: geree.orshinSuugchId,
      nekhemjlekhId: invoice._id.toString(),
      dun: c.dun,
      zardliinNer: c.ner,
      zardliinTurul: c.zardliinTurul,
      tailbar: c.ner,
      ognoo: options.billingDate || new Date(),
      source: c.isEkhniiUldegdel ? "geree" : "nekhemjlekh",
      ekhniiUldegdelEsekh: !!c.isEkhniiUldegdel,
      guilgeeKhiisenAjiltniiId: options.ajiltanId || geree.burtgesenAjiltan,
      guilgeeKhiisenAjiltniiNer: options.ajiltanNer || "Систем",
    });
  }

  // If Starting Balance was billed, clear it from the contract so it doesn't repeat
  if (hasEkhniiUldegdel) {
    await GereeModel.updateOne({ _id: geree._id }, { $set: { ekhniiUldegdel: 0 } });
  }

  return { success: true, invoiceId: invoice._id, total };
}

async function ensureEkhniiUldegdel(kholbolt, geree, options = {}) {
  // This logic is now handled during first invoice generation
  return false;
}

module.exports = {
  calculateGereeCharges,
  createInvoiceForContract,
  ensureEkhniiUldegdel,
};
