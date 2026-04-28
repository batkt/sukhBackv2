const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const LiftShalgaya = require("../models/liftShalgaya");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const { Dugaarlalt } = require("zevbackv2");
const moment = require("moment");
const lodash = require("lodash");

// --- Helpers ---

function monthKeyMnLedger(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ulaanbaatar",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(x);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    if (y && m) return `${y}-${m}`;
  } catch (_e) {}
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

function isAvlagaOnlyShellNekhemjlekh(inv) {
  const dugaar = String(inv.nekhemjlekhiinDugaar || "");
  if (dugaar.startsWith("AVL-")) return true;
  return inv.nekhemjlekhiin === "Авлагаар автоматаар үүсгэсэн нэхэмжлэх";
}

function invDateForMonthKey(inv) {
  return inv.ognoo || inv.nekhemjlekhiinOgnoo || inv.createdAt;
}

function nekhemjlekhiinZardluudSum(inv) {
  const z = inv.medeelel?.zardluud;
  if (!Array.isArray(z) || z.length === 0) return 0;
  return z.reduce((s, row) => {
    const t = typeof row.tulukhDun === "number" ? row.tulukhDun : null;
    const d = row.dun != null ? Number(row.dun) : null;
    const tariff = row.tariff != null ? Number(row.tariff) : 0;
    const val = t != null && t > 0 ? t : d != null && d > 0 ? d : tariff;
    return s + (Number(val) || 0);
  }, 0);
}

function nekhemjlekhiinHasRealPayments(inv) {
  const totalPaidHistory =
    Math.round(
      (inv.paymentHistory || []).reduce((s, p) => {
        if (p?.turul === "system_sync") return s;
        return s + (Number(p?.dun) || 0);
      }, 0) * 100,
    ) / 100;

  const totalPaidGuilgee =
    Math.round(
      (inv.medeelel?.guilgeenuud || []).reduce((s, g) => {
        return s + (Number(g?.tulsunDun || g?.dun) || 0);
      }, 0) * 100,
    ) / 100;

  return Math.max(totalPaidHistory, totalPaidGuilgee) > 0.01;
}

function avlagaShellInvoiceSafeToCascadeDelete(inv) {
  if (!isAvlagaOnlyShellNekhemjlekh(inv)) return false;
  if (inv.tuluv === "Хүчингүй") return false;
  if (inv.qpayPaymentId || inv.qpayInvoiceId) return false;
  if (nekhemjlekhiinHasRealPayments(inv)) return false;
  if (nekhemjlekhiinZardluudSum(inv) > 0.01) return false;
  return true;
}

// --- Handlers ---

exports.getTulsunSummary = asyncHandler(async (req, res, next) => {
  const { getGereeniiTulsunSummary } = require("../services/invoicePaymentService");
  const { baiguullagiinId, gereeniiId, barilgiinId, ekhlekhOgnoo, duusakhOgnoo } = req.body || {};
  const result = await getGereeniiTulsunSummary({
    baiguullagiinId,
    gereeniiId,
    barilgiinId,
    ekhlekhOgnoo,
    duusakhOgnoo,
  });
  res.json(result);
});

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

exports.deleteGuilgeeAvlaguudTulukh = asyncHandler(async (req, res, next) => {
  const { Types } = require("mongoose");
  const { db } = require("zevbackv2");
  const kholbolt = db.kholboltuud.find((a) => a.baiguullagiinId == req.query.baiguullagiinId);
  if (!kholbolt) return res.status(400).json({ error: "Холболт олдсонгүй" });

  const Model = GuilgeeAvlaguud(kholbolt);
  const incomingId = String(req.params.id || "");

  if (!Types.ObjectId.isValid(incomingId)) {
    const syntheticPrefix = "geree-ekhnii-";
    if (incomingId.startsWith(syntheticPrefix)) {
      const gereeniiId = incomingId.slice(syntheticPrefix.length);
      if (!gereeniiId) return res.status(400).json({ error: "Буруу synthetic id" });
      const oid = String(req.query.baiguullagiinId || "");
      let openingRows = await Model.find({
        gereeniiId: String(gereeniiId),
        baiguullagiinId: oid,
        chiglel: "tulukh",
        ekhniiUldegdelEsekh: true,
      }).select("_id").lean();

      if (openingRows.length === 0) {
        openingRows = await Model.find({
          gereeniiId: String(gereeniiId),
          ...(oid ? { baiguullagiinId: oid } : {}),
          $or: [{ zardliinNer: "Эхний үлдэгдэл" }, { tailbar: /эхний\s*үлдэгдэл/i }],
        }).select("_id").lean();
      }

      if (openingRows.length === 0) {
        openingRows = await Model.find({
          gereeniiId: String(gereeniiId),
          $or: [{ ekhniiUldegdelEsekh: true }, { zardliinNer: "Эхний үлдэгдэл" }],
        }).select("_id").lean();
      }

      if (openingRows.length === 0) return res.status(404).json({ error: "Олдсонгүй" });

      await Model.deleteMany({ _id: { $in: openingRows.map((r) => r._id) } });

      return res.json({
        success: true,
        deletedSyntheticOpening: true,
        deletedCount: openingRows.length,
      });
    }
    return res.json({ success: true, skipped: true, reason: "invalid_id" });
  }

  const doc = await Model.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Олдсонгүй" });

  const gereeniiId = doc.gereeniiId;
  const oid = String(doc.baiguullagiinId || req.query.baiguullagiinId || "");
  const NekhemjlekhiinTuukhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);

  await NekhemjlekhiinTuukhModel.updateMany(
    { "medeelel.guilgeenuud._id": doc._id },
    { $pull: { "medeelel.guilgeenuud": { _id: doc._id } } },
  );

  const deletedMonthKey = monthKeyMnLedger(doc.ognoo || doc.createdAt);
  let nekhemjlekhiinIdsToDelete = [];

  if (deletedMonthKey && oid) {
    const allTulukh = await Model.find({ gereeniiId: String(gereeniiId), baiguullagiinId: oid })
      .select("_id ognoo createdAt")
      .lean();

    const othersSameMonth = allTulukh.filter(
      (row) =>
        String(row._id) !== String(doc._id) &&
        monthKeyMnLedger(row.ognoo || row.createdAt) === deletedMonthKey,
    );

    if (othersSameMonth.length === 0) {
      const invoices = await NekhemjlekhiinTuukhModel.find({
        gereeniiId: String(gereeniiId),
        baiguullagiinId: oid,
        tuluv: { $ne: "Хүчингүй" },
      }).lean();

      nekhemjlekhiinIdsToDelete = invoices
        .filter(
          (inv) =>
            monthKeyMnLedger(invDateForMonthKey(inv)) === deletedMonthKey &&
            avlagaShellInvoiceSafeToCascadeDelete(inv),
        )
        .map((inv) => inv._id);
    }
  }

  await Model.collection.deleteOne({ _id: doc._id });

  for (const invId of nekhemjlekhiinIdsToDelete) {
    try {
      const invDoc = await NekhemjlekhiinTuukhModel.findById(invId);
      if (invDoc && avlagaShellInvoiceSafeToCascadeDelete(invDoc)) {
        await invDoc.deleteOne();
      }
    } catch (invDelErr) {
      console.error("❌ Error deleting avlaga-only nekhemjlekhiin after tulukh delete:", invDelErr.message);
    }
  }

  res.json({
    success: true,
    deletedNekhemjlekhiinIds: nekhemjlekhiinIdsToDelete.map((id) => String(id)),
  });
});

exports.deleteGuilgeeAvlaguudTulsun = asyncHandler(async (req, res, next) => {
  const { Types } = require("mongoose");
  const { db } = require("zevbackv2");
  const kholbolt = db.kholboltuud.find((a) => a.baiguullagiinId == req.query.baiguullagiinId);
  if (!kholbolt) return res.status(400).json({ error: "Холболт олдсонгүй" });
  if (!Types.ObjectId.isValid(req.params.id)) {
    return res.json({ success: true, skipped: true, reason: "invalid_id" });
  }

  const Model = GuilgeeAvlaguud(kholbolt);
  const doc = await Model.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Олдсонгүй" });

  const NekhemjlekhiinTuukhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);
  await NekhemjlekhiinTuukhModel.updateMany(
    { "paymentHistory.guilgeeniiId": String(doc._id) },
    { $pull: { paymentHistory: { guilgeeniiId: String(doc._id) } } },
  );

  const affectedInvoices = await NekhemjlekhiinTuukhModel.find({
    "paymentHistory.guilgeeniiId": String(doc._id),
  });
  for (const inv of affectedInvoices) {
    inv.paymentHistory = inv.paymentHistory.filter((p) => String(p.guilgeeniiId) !== String(doc._id));
    inv.markModified("paymentHistory");
    await inv.save();
  }

  await Model.collection.deleteOne({ _id: doc._id });
  res.json({ success: true });
});

exports.gereeMiddleware = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");

  // POST Logic: Resident auto-creation
  if (req.method === "POST" && req.path === "/") {
    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => String(kholbolt.baiguullagiinId) === String(req.body.baiguullagiinId),
    );

    if (!tukhainBaaziinKholbolt) return next(new Error("Холболтын мэдээлэл олдсонгүй!"));

    const orshinSuugchData = { ...req.body };
    if (Array.isArray(orshinSuugchData.utas) && orshinSuugchData.utas.length > 0) {
      orshinSuugchData.utas = orshinSuugchData.utas[0];
    } else if (!orshinSuugchData.utas) {
      orshinSuugchData.utas = "";
    }

    let orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({ utas: orshinSuugchData.utas });

    if (orshinSuugch) {
      if (orshinSuugchData.ner) orshinSuugch.ner = orshinSuugchData.ner;
      if (orshinSuugchData.ovog) orshinSuugch.ovog = orshinSuugchData.ovog;
      if (orshinSuugchData.mail) orshinSuugch.mail = orshinSuugchData.mail;
    } else {
      orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(orshinSuugchData);
      orshinSuugch.baiguullagiinId = req.body.baiguullagiinId;
      orshinSuugch.barilgiinId = req.body.barilgiinId;
    }

    if (req.body.barilgiinId && (req.body.toot || orshinSuugchData.toot)) {
      if (!orshinSuugch.toots) orshinSuugch.toots = [];
      const targetToot = req.body.toot || orshinSuugchData.toot;
      const barilgiinIdStr = String(req.body.barilgiinId);
      const existingTootIndex = orshinSuugch.toots.findIndex(
        (t) => t.toot === targetToot && String(t.barilgiinId) === barilgiinIdStr,
      );
      const tootEntry = {
        toot: targetToot,
        barilgiinId: barilgiinIdStr,
        baiguullagiinId: String(req.body.baiguullagiinId),
        davkhar: req.body.davkhar || orshinSuugchData.davkhar || "",
        orts: req.body.orts || orshinSuugchData.orts || "1",
        source: "OWN_ORG",
      };
      if (existingTootIndex >= 0) {
        orshinSuugch.toots[existingTootIndex] = { ...orshinSuugch.toots[existingTootIndex], ...tootEntry };
      } else {
        orshinSuugch.toots.push(tootEntry);
      }
    }

    let unuudur = new Date();
    unuudur = new Date(unuudur.getFullYear(), unuudur.getMonth(), unuudur.getDate());

    let maxDugaar = 1;
    const dugaarlaltResult = await Dugaarlalt(tukhainBaaziinKholbolt)
      .find({
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
        turul: "geree",
        ognoo: unuudur,
      })
      .sort({ dugaar: -1 })
      .limit(1);

    if (dugaarlaltResult && dugaarlaltResult.length > 0) maxDugaar = dugaarlaltResult[0].dugaar + 1;

    const dugaarlalt = new Dugaarlalt(tukhainBaaziinKholbolt)({
      baiguullagiinId: req.body.baiguullagiinId,
      barilgiinId: req.body.barilgiinId,
      dugaar: maxDugaar,
      turul: "geree",
      ognoo: unuudur,
      isNew: true,
    });

    if (maxDugaar && maxDugaar > 1) req.body.gereeniiDugaar = req.body.gereeniiDugaar + "-" + maxDugaar;
    req.body.orshinSuugchId = orshinSuugch._id.toString();

    await orshinSuugch.save();
    await dugaarlalt.save();
    return next();
  }

  // GET Logic: Listing/Pagination
  if (req.method === "GET" && req.path === "/") {
    const body = req.query;
    const baiguullagiinId = body.baiguullagiinId;
    const barilgiinId = body.barilgiinId;

    if (!baiguullagiinId) return res.status(400).json({ success: false, aldaa: "Байгууллагын ID заавал бөглөх шаардлагатай!" });

    const tukhainBaaziinKholbolt = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(baiguullagiinId));
    if (!tukhainBaaziinKholbolt) return res.status(404).json({ success: false, aldaa: "Байгууллагын холболт олдсонгүй!" });

    if (!body.query) body.query = {};
    else if (typeof body.query === "string") body.query = JSON.parse(body.query);

    if (!!body?.order) body.order = JSON.parse(body.order);
    if (!!body?.select) body.select = JSON.parse(body.select);
    if (!!body?.collation) body.collation = JSON.parse(body.collation);

    const khuudasniiDugaar = body.khuudasniiDugaar ? Number(body.khuudasniiDugaar) : 1;
    const khuudasniiKhemjee = body.khuudasniiKhemjee ? Number(body.khuudasniiKhemjee) : 10;

    body.query.baiguullagiinId = String(baiguullagiinId);
    if (barilgiinId) body.query.barilgiinId = String(barilgiinId);

    const jagsaalt = await Geree(tukhainBaaziinKholbolt)
      .find(body.query)
      .sort(body.order)
      .collation(body.collation ? body.collation : {})
      .select(body.select)
      .skip((khuudasniiDugaar - 1) * khuudasniiKhemjee)
      .limit(khuudasniiKhemjee);

    const niitMur = await Geree(tukhainBaaziinKholbolt).countDocuments(body.query);
    const niitKhuudas = Math.ceil(niitMur / khuudasniiKhemjee);

    if (jagsaalt != null) {
      jagsaalt.forEach((mur) => {
        mur.key = mur._id;
        mur.uldegdel = typeof mur.globalUldegdel === "number" ? mur.globalUldegdel : (mur.globalUldegdel ?? 0);
        if (mur.horoo && typeof mur.horoo === "string") mur.horoo = { ner: mur.horoo, kod: mur.horoo };
        else if (!mur.horoo || typeof mur.horoo !== "object") mur.horoo = {};
      });
    }

    return res.json({ khuudasniiDugaar, khuudasniiKhemjee, jagsaalt, niitMur, niitKhuudas });
  }

  // PUT Logic: Electricity/Cancel preservation
  if (req.method === "PUT") {
    if (req.body.tsahilgaaniiZaalt !== undefined) {
      let baiguullagiinId = req.body.baiguullagiinId;
      if (!baiguullagiinId && req.params.id) {
        for (const conn of db.kholboltuud) {
          try {
            const tempGeree = await Geree(conn, true).findById(req.params.id).select("baiguullagiinId");
            if (tempGeree) {
              baiguullagiinId = tempGeree.baiguullagiinId;
              req.body.baiguullagiinId = baiguullagiinId;
              break;
            }
          } catch (err) {}
        }
      }

      if (baiguullagiinId) {
        const tsahilgaaniiZaalt = parseFloat(req.body.tsahilgaaniiZaalt) || 0;
        req.body.umnukhZaalt = tsahilgaaniiZaalt;
        req.body.suuliinZaalt = tsahilgaaniiZaalt;
        req.body.zaaltTog = req.body.zaaltTog !== undefined ? req.body.zaaltTog : 0;
        req.body.zaaltUs = req.body.zaaltUs !== undefined ? req.body.zaaltUs : 0;
        delete req.body.tsahilgaaniiZaalt;
      }
    }

    if (req.body.tuluv === "Цуцалсан" && req.params.id) {
      for (const conn of db.kholboltuud) {
        try {
          const tempGeree = await Geree(conn, true).findById(req.params.id).select("barilgiinId");
          if (tempGeree && tempGeree.barilgiinId) {
            req.body.barilgiinId = tempGeree.barilgiinId;
            break;
          }
        } catch (err) {}
      }
    }
  }

  next();
});

exports.gereeKhadgalya = asyncHandler(async (req, res, next) => {
  const { db, Dugaarlalt } = require("zevbackv2");
  const orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(req.body);
  orshinSuugch.id = orshinSuugch.register ? orshinSuugch.register : orshinSuugch.customerTin;

  if (req.body.gereeniiDugaar === `ГД${moment(new Date()).format("YYMMDD")}`) {
    let unuudur = new Date();
    unuudur = new Date(unuudur.getFullYear(), unuudur.getMonth(), unuudur.getDate());
    let maxDugaar = 1;
    const result = await Dugaarlalt(req.body.tukhainBaaziinKholbolt)
      .find({ baiguullagiinId: req.body.baiguullagiinId, barilgiinId: req.body.barilgiinId, turul: "geree", ognoo: unuudur })
      .sort({ dugaar: -1 })
      .limit(1);
    if (result.length > 0) maxDugaar = result[0].dugaar + 1;

    const dugaarlalt = new Dugaarlalt(req.body.tukhainBaaziinKholbolt)({
      baiguullagiinId: req.body.baiguullagiinId,
      barilgiinId: req.body.barilgiinId,
      dugaar: maxDugaar,
      turul: "geree",
      ognoo: unuudur,
      isNew: true,
    });
    if (maxDugaar > 1) req.body.gereeniiDugaar = req.body.gereeniiDugaar + "-" + maxDugaar;
    await dugaarlalt.save();
  }

  let orshinSuugchShalguur;
  if (orshinSuugch.register) {
    orshinSuugchShalguur = await OrshinSuugch(db.erunkhiiKholbolt).findOne({ register: orshinSuugch.register, barilgiinId: req.body.barilgiinId });
  } else if (orshinSuugch.customerTin) {
    orshinSuugchShalguur = await OrshinSuugch(db.erunkhiiKholbolt).findOne({ customerTin: orshinSuugch.customerTin, barilgiinId: req.body.barilgiinId });
  }

  if (!orshinSuugchShalguur) await orshinSuugch.save();

  const geree = new Geree(req.body.tukhainBaaziinKholbolt)(req.body);
  let daraagiinTulukhOgnoo = geree.duusakhOgnoo;
  if (geree.avlaga?.guilgeenuud?.length > 0) daraagiinTulukhOgnoo = geree.avlaga.guilgeenuud[0].ognoo;
  geree.daraagiinTulukhOgnoo = daraagiinTulukhOgnoo;
  geree.tuluv = 1;

  const result = await geree.save();
  const { talbaiKhariltsagchiinTuluvUurchluy } = require("../utils/sharedFunctions"); // Placeholder if needed
  if (typeof talbaiKhariltsagchiinTuluvUurchluy === "function") {
    await talbaiKhariltsagchiinTuluvUurchluy([result._id], req.body.tukhainBaaziinKholbolt);
  }
  res.send("Amjilttai");
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
      .find({ talbainIdnuud: { $in: talbainDugaaruud }, barilgiinId: req.body.barilgiinId, tuluv: 1 })
      .select("+avlaga");

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
      let suuliinGuilgee = geree.avlaga.guilgeenuud.filter(
        (x) => x.khemjikhNegj == ashiglaltiinZardal.turul && x.tailbar == ashiglaltiinZardal.ner && (!x.tooluuriinDugaar || tukhainZardal.tooluuriinDugaar == x.tooluuriinDugaar),
      );
      if (suuliinGuilgee.length > 0) {
        suuliinGuilgee = lodash.orderBy(suuliinGuilgee, ["ognoo"], ["asc"]);
        umnukhZaalt = suuliinGuilgee[suuliinGuilgee.length - 1].suuliinZaalt || 0;
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
            chiglel: "tulukh",
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

exports.gereeniiGuilgeeKhadgalya = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const guilgee = req.body.guilgee || req.body;
  if (!guilgee.gereeniiId) throw new Error("Гэрээний ID заавал бөглөх шаардлагатай!");

  let baiguullagiinId = req.body.baiguullagiinId || guilgee.baiguullagiinId;
  if (!baiguullagiinId) {
    for (const conn of db.kholboltuud) {
      try {
        const tempGeree = await Geree(conn, true).findById(guilgee.gereeniiId).select("baiguullagiinId");
        if (tempGeree) { baiguullagiinId = tempGeree.baiguullagiinId; break; }
      } catch (err) {}
    }
  }
  if (!baiguullagiinId) throw new Error("Байгууллагын ID олдсонгүй!");

  const tukhainBaaziinKholbolt = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(baiguullagiinId));
  const geree = await Geree(tukhainBaaziinKholbolt, true).findById(guilgee.gereeniiId);
  const AshiglaltiinZardluudModel = AshiglaltiinZardluud(tukhainBaaziinKholbolt);

  const zardluudData = { ...guilgee, baiguullagiinId, barilgiinId: geree.barilgiinId || guilgee.barilgiinId || "" };

  if (guilgee._id || guilgee.zardliinId) {
    const id = guilgee._id || guilgee.zardliinId;
    let saved = await AshiglaltiinZardluudModel.findByIdAndUpdate(id, zardluudData, { new: true });
    if (!saved) await new AshiglaltiinZardluudModel(zardluudData).save();
  } else {
    await new AshiglaltiinZardluudModel(zardluudData).save();
  }

  const result = await Geree(tukhainBaaziinKholbolt).findById(guilgee.gereeniiId);
  res.send(result);
});
