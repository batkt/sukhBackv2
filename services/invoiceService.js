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
        charges.push({
          ner: z.ner || "Цахилгаан",
          dun: zaaltDun,
          turul: normalizeTurul(z.turul),
          zardliinTurul: z.zardliinTurul || "Эрчим хүч",
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

  for (const c of charges) {
    await guilgeeService.recordCharge(kholbolt, {
      baiguullagiinId: geree.baiguullagiinId,
      gereeniiId: geree._id.toString(),
      nekhemjlekhId: invoice._id.toString(),
      dun: c.dun,
      zardliinNer: c.ner,
      zardliinTurul: c.zardliinTurul,
      ognoo: options.billingDate || new Date(),
      source: "nekhemjlekh",
    });
  }

  return { success: true, invoiceId: invoice._id, total };
}

module.exports = {
  calculateGereeCharges,
  createInvoiceForContract,
};
