const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const Baiguullaga = require("../models/baiguullaga");
const LiftShalgaya = require("../models/liftShalgaya");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const lodash = require("lodash");

// --- Helpers ---

exports.postLiftShalgaya = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, barilgiinId, choloolugdokhDavkhar } = req.body;

  if (!baiguullagiinId || !barilgiinId) {
    return res.status(400).json({
      success: false,
      message: "baiguullagiinId and barilgiinId are required",
    });
  }

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
  );

  if (!tukhainBaaziinKholbolt) {
    return res.status(404).json({
      success: false,
      message: "Байгууллагын холболт олдсонгүй",
    });
  }

  const LiftShalgayaModel = LiftShalgaya(tukhainBaaziinKholbolt);
  const filter = { baiguullagiinId, barilgiinId };
  const update = { $set: { choloolugdokhDavkhar: choloolugdokhDavkhar || [] } };
  const options = { new: true, upsert: true, setDefaultsOnInsert: true };

  const result = await LiftShalgayaModel.findOneAndUpdate(filter, update, options);
  res.json(result);
});

exports.zaaltOlnoorOruulya = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(req.body.baiguullagiinId);
  const ashiglaltiinZardal = await AshiglaltiinZardluud(req.body.tukhainBaaziinKholbolt).findById(req.body.ashiglaltiinId);
  const jagsaalt = req.body.jagsaalt;
  const talbainDugaaruud = jagsaalt.map((m) => m.talbainId);

  let niitGereenuud = [];
  if (talbainDugaaruud.length > 0) {
    const gereenuud = await Geree(req.body.tukhainBaaziinKholbolt, true)
      .find({ talbainIdnuud: { $in: talbainDugaaruud }, barilgiinId: req.body.barilgiinId, tuluv: "Идэвхтэй" });

    const oldooguiGeree = talbainDugaaruud
      .filter((a) => !gereenuud.find((b) => b.talbainIdnuud.includes(a)))
      .map((a) => jagsaalt.find((x) => x.talbainId == a).talbainDugaar);

    if (oldooguiGeree.length > 0) throw new Error("Дараах талбайн дугаартай гэрээнүүд олдсонгүй! " + oldooguiGeree.toString());
    niitGereenuud = gereenuud;
  }

  const bulkOps = [];
  for (const tukhainZardal of jagsaalt) {
    const geree = niitGereenuud.find((x) => x.talbainIdnuud.includes(tukhainZardal.talbainId));
    let updateObject = {};
    let umnukhZaalt = 0;

    if (["кВт", "1м3", "кг"].includes(ashiglaltiinZardal.turul)) {
      const GuilgeeAvlaguudModel = GuilgeeAvlaguud(req.body.tukhainBaaziinKholbolt);
      const suuliinGuilgee = await GuilgeeAvlaguudModel.findOne({
        gereeniiId: String(geree._id),
        khemjikhNegj: ashiglaltiinZardal.turul,
        zardliinNer: ashiglaltiinZardal.ner,
        ...((tukhainZardal.tooluuriinDugaar) && { tooluuriinDugaar: tukhainZardal.tooluuriinDugaar })
      }).sort({ ognoo: -1 }).lean();

      if (suuliinGuilgee) {
        umnukhZaalt = suuliinGuilgee.suuliinZaalt || 0;
      }
    }

    const zoruuDun = tukhainZardal.suuliinZaalt - umnukhZaalt;
    let tsakhilgaanDun = 0,
      tsakhilgaanKBTST = 0,
      chadalDun = 0,
      tsekhDun = 0,
      sekhDemjikhTulburDun = 0;

    if (baiguullaga?.tokhirgoo?.guidelBuchiltKhonogEsekh) {
      tsakhilgaanKBTST = zoruuDun * (ashiglaltiinZardal.tsakhilgaanUrjver || 1) * (tukhainZardal.guidliinKoep || 1);
      chadalDun = baiguullaga?.tokhirgoo?.bichiltKhonog > 0 && tsakhilgaanKBTST > 0 ? (tsakhilgaanKBTST / baiguullaga?.tokhirgoo?.bichiltKhonog / 12) * (req.body.baiguullagiinId === "679aea9032299b7ba8462a77" ? 11520 : 15500) : 0;
      tsekhDun = ashiglaltiinZardal.tariff * tsakhilgaanKBTST;
      if (baiguullaga?.tokhirgoo?.sekhDemjikhTulburAvakhEsekh) {
        sekhDemjikhTulburDun = zoruuDun * (ashiglaltiinZardal.tsakhilgaanUrjver || 1) * 23.79;
        tsakhilgaanDun = chadalDun + tsekhDun + sekhDemjikhTulburDun;
      } else tsakhilgaanDun = chadalDun + tsekhDun;
    } else tsakhilgaanDun = ashiglaltiinZardal.tariff * (ashiglaltiinZardal.tsakhilgaanUrjver || 1) * (zoruuDun || 0);

    const isWater = ashiglaltiinZardal.ner?.includes("Хүйтэн ус") || ashiglaltiinZardal.ner?.includes("Халуун ус");
    const tempDun = isWater && ashiglaltiinZardal.bodokhArga === "Khatuu" ? ashiglaltiinZardal.tseverUsDun * zoruuDun + ashiglaltiinZardal.bokhirUsDun * zoruuDun + (ashiglaltiinZardal.ner?.includes("Халуун ус") ? ashiglaltiinZardal.usKhalaasniiDun * zoruuDun : 0) : tsakhilgaanDun;

    updateObject = {
      tulukhDun: req.body.nuatBodokhEsekh ? ((ashiglaltiinZardal.suuriKhuraamj || 0) + tempDun) * 1.1 : (ashiglaltiinZardal.suuriKhuraamj || 0) + tempDun,
      negj: zoruuDun,
      khemjikhNegj: ashiglaltiinZardal.turul,
      tariff: ashiglaltiinZardal.tariff,
      suuriKhuraamj: ashiglaltiinZardal.suuriKhuraamj || 0,
      umnukhZaalt: umnukhZaalt,
      suuliinZaalt: tukhainZardal.suuliinZaalt,
      tailbar: ashiglaltiinZardal.ner,
      guilgeeKhiisenOgnoo: new Date(),
    };

    if (req.body.nevtersenAjiltniiToken) {
      updateObject.guilgeeKhiisenAjiltniiNer = req.body.nevtersenAjiltniiToken.ner;
      updateObject.guilgeeKhiisenAjiltniiId = req.body.nevtersenAjiltniiToken.id;
    }

    if (updateObject.tulukhDun > 0) {
      bulkOps.push({
        insertOne: {
          document: {
            baiguullagiinId: req.body.baiguullagiinId,
            baiguullagiinNer: baiguullaga?.ner || "",
            barilgiinId: req.body.barilgiinId,
            gereeniiId: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            orshinSuugchId: geree.orshinSuugchId,
            ognoo: updateObject.guilgeeKhiisenOgnoo,
            undsenDun: updateObject.tulukhDun,
            tulukhDun: updateObject.tulukhDun,
            uldegdel: updateObject.tulukhDun,
            dun: updateObject.tulukhDun,
            turul: "avlaga",

            zardliinId: req.body.ashiglaltiinId,
            zardliinNer: ashiglaltiinZardal.ner,
            tailbar: updateObject.tailbar,
            negj: updateObject.negj,
            tariff: updateObject.tariff,
            umnukhZaalt: updateObject.umnukhZaalt,
            suuliinZaalt: updateObject.suuliinZaalt,
            tooluuriinDugaar: tukhainZardal.tooluuriinDugaar,
            source: "excel_import",
            guilgeeKhiisenAjiltniiNer: updateObject.guilgeeKhiisenAjiltniiNer || "",
            guilgeeKhiisenAjiltniiId: updateObject.guilgeeKhiisenAjiltniiId || "",
          },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await GuilgeeAvlaguud(req.body.tukhainBaaziinKholbolt).bulkWrite(bulkOps);
    const AshiglaltiinExcelModel = require("../models/ashiglaltiinExcel")(req.body.tukhainBaaziinKholbolt);
    await AshiglaltiinExcelModel.insertMany(jagsaalt);
    res.status(200).send("Amjilttai");
  } else {
    res.status(200).send("No records to process");
  }
});


