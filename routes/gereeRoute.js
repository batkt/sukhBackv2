const express = require("express");
const router = express.Router();
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const ashiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const uilchilgeeniiZardluud = require("../models/uilchilgeeniiZardluud");
const LiftShalgaya = require("../models/liftShalgaya");
const { crud, tokenShalgakh, Dugaarlalt, UstsanBarimt } = require("zevbackv2");
const multer = require("multer");
const {
  gereeZasakhShalguur,
  gereeSungakhShalguur,
  gereeSergeekhShalguur,
  gereeTsutslakhShalguur,
  guilgeeUstgakhShalguur,
  shalguurFieldValidate,
} = require("../components/shalguur");
const {
  gereeniiExcelAvya,
  gereeniiExcelTatya,
  zaaltExcelTemplateAvya,
  zaaltExcelTatya,
  zaaltExcelDataAvya,
} = require("../controller/excel");
const {
  downloadGuilgeeniiTuukhExcel,
  generateTootBurtgelExcelTemplate,
  importTootBurtgelFromExcel,
  generateInitialBalanceTemplate,
  importInitialBalanceFromExcel,
} = require("../controller/excelImportController");
const { gereeniiGuilgeeKhadgalya } = require("../controller/gereeController");
const {
  markInvoicesAsPaid,
  getGereeniiTulsunSummary,
} = require("../services/invoicePaymentService");
const { getHistoryLedger } = require("../services/historyLedgerService");

const storage = multer.memoryStorage();
const uploadFile = multer({ storage: storage });

router
  .route("/gereeniiExcelAvya/:barilgiinId")
  .get(tokenShalgakh, gereeniiExcelAvya);
router
  .route("/gereeniiExcelTatya")
  .post(uploadFile.single("file"), tokenShalgakh, gereeniiExcelTatya);

// Electricity (Цахилгаан) Excel routes
router
  .route("/zaaltExcelTemplateAvya")
  .post(tokenShalgakh, zaaltExcelTemplateAvya);
router
  .route("/zaaltExcelTatya")
  .post(uploadFile.single("file"), tokenShalgakh, zaaltExcelTatya);
// Electricity data export - MUST be before crud to avoid conflicts
router.post("/zaaltExcelDataAvya", tokenShalgakh, zaaltExcelDataAvya);

// GuilgeeniiTuukh Excel download route - MUST be before crud to avoid conflicts
router.post(
  "/guilgeeniiTuukhExcelDownload",
  tokenShalgakh,
  downloadGuilgeeniiTuukhExcel,
);

// Initial Balance Excel routes
router.post(
  "/generateInitialBalanceTemplate",
  tokenShalgakh,
  generateInitialBalanceTemplate,
);
router.post(
  "/importInitialBalanceFromExcel",
  uploadFile.single("file"),
  tokenShalgakh,
  importInitialBalanceFromExcel,
);

// Payment summary for a single geree (from gereeniiTulsunAvlaga)
router.post("/tulsunSummary", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      gereeniiId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
    } = req.body || {};
    const result = await getGereeniiTulsunSummary({
      baiguullagiinId,
      gereeniiId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// History ledger with backend-calculated running balance (Үлдэгдэл)
// GET /geree/:gereeniiId/history-ledger?baiguullagiinId=...&barilgiinId=...
router.get(
  "/geree/:gereeniiId/history-ledger",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const gereeniiId = req.params.gereeniiId;
      const baiguullagiinId = req.query.baiguullagiinId;
      const barilgiinId = req.query.barilgiinId || null;
      if (!baiguullagiinId) {
        return res.status(400).json({
          success: false,
          message: "baiguullagiinId заавал шаардлагатай",
        });
      }
      const result = await getHistoryLedger({
        gereeniiId,
        baiguullagiinId,
        barilgiinId,
      });
      // Return a compact, human-friendly payload for the History UI.
      // Keep backend calculations in services/historyLedgerService, but avoid exposing
      // internal/summary fields like globalUldegdel/positiveBalance here.
      const jagsaalt = (result?.jagsaalt || []).map((r) => ({
        _id: r._id,
        ognoo: r.ognoo,
        burtgesenOgnoo: r.burtgesenOgnoo,
        ner: r.ner,
        khelber: r.khelber,
        tailbar: r.tailbar,
        ajiltan: r.ajiltan,
        tulukhDun: r.tulukhDun,
        tulsunDun: r.tulsunDun,
        uldegdel: r.uldegdel,
        nekhemjlekhiinDugaar: r.nekhemjlekhiinDugaar,
        nekhemjlekhiinTuluv: r.nekhemjlekhiinTuluv,
      }));
      res.json({ jagsaalt });
    } catch (err) {
      next(err);
    }
  },
);

crud(router, "ashiglaltiinZardluud", ashiglaltiinZardluud, UstsanBarimt);
crud(router, "uilchilgeeniiZardluud", uilchilgeeniiZardluud, UstsanBarimt);
// Custom POST handler for liftShalgaya to handle upsert (prevent duplicate key error)
router.post("/liftShalgaya", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId, choloolugdokhDavkhar } = req.body;

    if (!baiguullagiinId || !barilgiinId) {
      return res.status(400).json({
        success: false,
        message: "baiguullagiinId and barilgiinId are required",
      });
    }

    // Find connection
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
    const update = {
      $set: {
        choloolugdokhDavkhar: choloolugdokhDavkhar || [],
      },
    };
    const options = { new: true, upsert: true, setDefaultsOnInsert: true };

    const result = await LiftShalgayaModel.findOneAndUpdate(
      filter,
      update,
      options,
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

crud(router, "liftShalgaya", LiftShalgaya, UstsanBarimt);

const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");

// Emit tulburUpdated on delete of avlaga records so web clients refresh
router.use((req, res, next) => {
  const isAvlagaDelete =
    (req.method === "DELETE" ||
      (req.method === "POST" && req.path?.includes("delete"))) &&
    (req.path?.includes("gereeniiTulsunAvlaga") ||
      req.path?.includes("gereeniiTulukhAvlaga"));
  if (!isAvlagaDelete) return next();
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const baiguullagiinId =
      req.query?.baiguullagiinId || req.body?.baiguullagiinId;
    if (baiguullagiinId && req.app) {
      try {
        req.app.get("socketio").emit(`tulburUpdated:${baiguullagiinId}`, {});
      } catch (e) {}
    }
    return originalJson(data);
  };
  next();
});

// Shared helper: full recalculation from raw amounts after delete
const { recalcGlobalUldegdel } = require("../utils/recalcGlobalUldegdel");
async function recalcGlobalAfterDelete(kholbolt, gereeniiId, baiguullagiinId) {
  const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
  await recalcGlobalUldegdel({
    gereeId: gereeniiId,
    baiguullagiinId,
    GereeModel: Geree(kholbolt),
    NekhemjlekhiinTuukhModel: NekhemjlekhiinTuukh(kholbolt),
    GereeniiTulukhAvlagaModel: GereeniiTulukhAvlaga(kholbolt),
    GereeniiTulsunAvlagaModel: GereeniiTulsunAvlaga(kholbolt),
  });
}

/** YYYY-MM in Asia/Ulaanbaatar (aligns with recalc / history ledger). */
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
    const val =
      t != null && t > 0 ? t : d != null && d > 0 ? d : tariff;
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

// Custom DELETE for gereeniiTulukhAvlaga — full recalculation after delete
router.delete("/gereeniiTulukhAvlaga/:id", tokenShalgakh, async (req, res) => {
  try {
    const { Types } = require("mongoose");
    const { db } = require("zevbackv2");
    const kholbolt = db.kholboltuud.find(
      (a) => a.baiguullagiinId == req.query.baiguullagiinId
    );
    if (!kholbolt) return res.status(400).json({ error: "Холболт олдсонгүй" });
    const Model = GereeniiTulukhAvlaga(kholbolt);
    const incomingId = String(req.params.id || "");
    if (!Types.ObjectId.isValid(incomingId)) {
      const syntheticPrefix = "geree-ekhnii-";
      if (incomingId.startsWith(syntheticPrefix)) {
        const gereeniiId = incomingId.slice(syntheticPrefix.length);
        if (!gereeniiId) {
          return res.status(400).json({ error: "Буруу synthetic id" });
        }
        const oid = String(req.query.baiguullagiinId || "");
        let openingRows = await Model.find({
          gereeniiId: String(gereeniiId),
          baiguullagiinId: oid,
          ekhniiUldegdelEsekh: true,
        })
          .select("_id")
          .lean();

        // Fallback for legacy/misaligned rows where flag/org may be missing or inconsistent.
        if (openingRows.length === 0) {
          const fallbackOr = [{ zardliinNer: "Эхний үлдэгдэл" }];
          fallbackOr.push({ tailbar: /эхний\s*үлдэгдэл/i });
          openingRows = await Model.find({
            gereeniiId: String(gereeniiId),
            ...(oid ? { baiguullagiinId: oid } : {}),
            $or: fallbackOr,
          })
            .select("_id")
            .lean();
        }

        // Last-resort fallback: if org-scoped lookup still misses, try contract-wide.
        if (openingRows.length === 0) {
          openingRows = await Model.find({
            gereeniiId: String(gereeniiId),
            $or: [{ ekhniiUldegdelEsekh: true }, { zardliinNer: "Эхний үлдэгдэл" }],
          })
            .select("_id")
            .lean();
        }

        if (openingRows.length === 0) {
          return res.status(404).json({ error: "Олдсонгүй" });
        }

        await Model.deleteMany({
          _id: { $in: openingRows.map((r) => r._id) },
        });

        try {
          await recalcGlobalAfterDelete(kholbolt, gereeniiId, req.query.baiguullagiinId);
        } catch (recalcErr) {
          console.error(
            "❌ Error recalculating globalUldegdel after synthetic opening delete:",
            recalcErr.message,
          );
        }

        return res.json({
          success: true,
          deletedSyntheticOpening: true,
          deletedCount: openingRows.length,
        });
      }
      // Frontend may send temporary client-side ids (e.g. init-*) for unsaved rows.
      return res.json({ success: true, skipped: true, reason: "invalid_id" });
    }

    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Олдсонгүй" });

    const gereeniiId = doc.gereeniiId;
    const oid = String(
      doc.baiguullagiinId || req.query.baiguullagiinId || "",
    );

    // Clean up inside invoice if it was attached
    const NekhemjlekhiinTuukhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);
    await NekhemjlekhiinTuukhModel.updateMany(
      { "medeelel.guilgeenuud._id": doc._id },
      { $pull: { "medeelel.guilgeenuud": { _id: doc._id } } }
    );

    const deletedMonthKey = monthKeyMnLedger(doc.ognoo || doc.createdAt);
    let nekhemjlekhiinIdsToDelete = [];

    if (deletedMonthKey && oid) {
      const allTulukh = await Model.find({
        gereeniiId: String(gereeniiId),
        baiguullagiinId: oid,
      })
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
        console.error(
          "❌ Error deleting avlaga-only nekhemjlekhiin after tulukh delete:",
          invDelErr.message,
        );
      }
    }

    try {
      await recalcGlobalAfterDelete(kholbolt, gereeniiId, req.query.baiguullagiinId);
    } catch (recalcErr) {
      console.error("❌ Error recalculating globalUldegdel after avlaga delete:", recalcErr.message);
    }

    res.json({
      success: true,
      deletedNekhemjlekhiinIds: nekhemjlekhiinIdsToDelete.map((id) =>
        String(id),
      ),
    });
  } catch (err) {
    console.error("❌ Error deleting gereeniiTulukhAvlaga:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Custom DELETE for gereeniiTulsunAvlaga — full recalculation after delete
router.delete("/gereeniiTulsunAvlaga/:id", tokenShalgakh, async (req, res) => {
  try {
    const { Types } = require("mongoose");
    const { db } = require("zevbackv2");
    const kholbolt = db.kholboltuud.find(
      (a) => a.baiguullagiinId == req.query.baiguullagiinId
    );
    if (!kholbolt) return res.status(400).json({ error: "Холболт олдсонгүй" });
    if (!Types.ObjectId.isValid(req.params.id)) {
      // Frontend may send temporary client-side ids before a row is persisted.
      return res.json({ success: true, skipped: true, reason: "invalid_id" });
    }

    const Model = GereeniiTulsunAvlaga(kholbolt);
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Олдсонгүй" });

    const gereeniiId = doc.gereeniiId;

    // Remove from any invoice's paymentHistory before recalculating
    const NekhemjlekhiinTuukhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);
    await NekhemjlekhiinTuukhModel.updateMany(
      { "paymentHistory.guilgeeniiId": String(doc._id) },
      { $pull: { paymentHistory: { guilgeeniiId: String(doc._id) } } }
    );

    // Save each affected invoice so its pre-save hook computes properly before the global sync
    const affectedInvoices = await NekhemjlekhiinTuukhModel.find({ "paymentHistory.guilgeeniiId": String(doc._id) });
    for (const inv of affectedInvoices) {
      inv.paymentHistory = inv.paymentHistory.filter(p => String(p.guilgeeniiId) !== String(doc._id));
      inv.markModified("paymentHistory");
      await inv.save();
    }

    await Model.collection.deleteOne({ _id: doc._id });

    try {
      await recalcGlobalAfterDelete(kholbolt, gereeniiId, req.query.baiguullagiinId);
    } catch (recalcErr) {
      console.error("❌ Error recalculating globalUldegdel after payment delete:", recalcErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting gereeniiTulsunAvlaga:", err.message);
    res.status(500).json({ error: err.message });
  }
});

crud(router, "gereeniiTulsunAvlaga", GereeniiTulsunAvlaga, UstsanBarimt);
crud(router, "gereeniiTulukhAvlaga", GereeniiTulukhAvlaga, UstsanBarimt);
crud(
  router,
  "geree",
  Geree,
  UstsanBarimt,
  async (req, res, next) => {
    // This middleware is specifically for resident auto-creation/association during contract creation (POST)
    if (req.method !== "POST") return next();

    try {
      const { db } = require("zevbackv2");
      const tukhainBaaziinKholbolt = db.kholboltuud.find(
        (kholbolt) =>
          String(kholbolt.baiguullagiinId) === String(req.body.baiguullagiinId),
      );

      if (!tukhainBaaziinKholbolt) {
        return next(new Error("Холболтын мэдээлэл олдсонгүй!"));
      }

      // Normalize utas field: convert array to string for OrshinSuugch model
      const orshinSuugchData = { ...req.body };
      if (
        Array.isArray(orshinSuugchData.utas) &&
        orshinSuugchData.utas.length > 0
      ) {
        orshinSuugchData.utas = orshinSuugchData.utas[0];
      } else if (!orshinSuugchData.utas) {
        orshinSuugchData.utas = "";
      }

      // 1. Check if resident already exists by phone number (cross-org check in main DB)
      const phoneNumber = orshinSuugchData.utas;
      let orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
        utas: phoneNumber,
      });

      if (orshinSuugch) {
        // User already exists - preserve their "primary" org/building at top level
        // only update personal info if provided
        if (orshinSuugchData.ner) orshinSuugch.ner = orshinSuugchData.ner;
        if (orshinSuugchData.ovog) orshinSuugch.ovog = orshinSuugchData.ovog;
        if (orshinSuugchData.mail) orshinSuugch.mail = orshinSuugchData.mail;

        console.log(
          `ℹ️ [GEREE] Existing resident found (${phoneNumber}). Preserving primary org: ${orshinSuugch.baiguullagiinId}`,
        );
      } else {
        // Create NEW resident document
        orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(orshinSuugchData);
        // For new users, the provided org/building IS the primary one
        orshinSuugch.baiguullagiinId = req.body.baiguullagiinId;
        orshinSuugch.baiguullagiinNer = req.body.baiguullagiinNer; // Assuming it's in body or will be fetched
        orshinSuugch.barilgiinId = req.body.barilgiinId;
        console.log(
          `ℹ️ [GEREE] Creating new resident for org: ${req.body.baiguullagiinId}`,
        );
      }

      // 2. Add/Update the specific building association in the toots array
      if (req.body.barilgiinId && (req.body.toot || orshinSuugchData.toot)) {
        if (!orshinSuugch.toots) orshinSuugch.toots = [];

        const targetToot = req.body.toot || orshinSuugchData.toot;
        const barilgiinIdStr = String(req.body.barilgiinId);

        const existingTootIndex = orshinSuugch.toots.findIndex(
          (t) =>
            t.toot === targetToot && String(t.barilgiinId) === barilgiinIdStr,
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
          orshinSuugch.toots[existingTootIndex] = {
            ...orshinSuugch.toots[existingTootIndex],
            ...tootEntry,
          };
        } else {
          orshinSuugch.toots.push(tootEntry);
        }
      }

      var unuudur = new Date();
      // ... rest of the date logic ...
      unuudur = new Date(
        unuudur.getFullYear(),
        unuudur.getMonth(),
        unuudur.getDate(),
      );

      var maxDugaar = 1;
      const dugaarlaltResult = await Dugaarlalt(tukhainBaaziinKholbolt)
        .find({
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.body.barilgiinId,
          turul: "geree",
          ognoo: unuudur,
        })
        .sort({
          dugaar: -1,
        })
        .limit(1);

      if (dugaarlaltResult && dugaarlaltResult.length > 0) {
        maxDugaar = dugaarlaltResult[0].dugaar + 1;
      }

      var dugaarlalt = new Dugaarlalt(tukhainBaaziinKholbolt)({
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
        dugaar: maxDugaar,
        turul: "geree",
        ognoo: unuudur,
        isNew: true,
      });

      if (maxDugaar && maxDugaar > 1) {
        req.body.gereeniiDugaar = req.body.gereeniiDugaar + "-" + maxDugaar;
      }

      // Set orshinSuugchId in req.body so geree can reference it
      req.body.orshinSuugchId = orshinSuugch._id.toString();

      try {
        await orshinSuugch.save();
        await dugaarlalt.save();
        next();
      } catch (err) {
        next(err);
      }
    } catch (error) {
      next(error);
    }
  },
  async (req, res, next) => {
    if (req.method === "GET") {
      try {
        const { db } = require("zevbackv2");
        const body = req.query;
        const baiguullagiinId = body.baiguullagiinId;
        const barilgiinId = body.barilgiinId;

        if (!baiguullagiinId) {
          return res.status(400).json({
            success: false,
            aldaa: "Байгууллагын ID заавал бөглөх шаардлагатай!",
          });
        }

        // Validate db and kholboltuud exist
        if (!db || !db.kholboltuud || !Array.isArray(db.kholboltuud)) {
          return res.status(500).json({
            success: false,
            aldaa: "Холболтын мэдээлэл алдаатай байна!",
          });
        }

        const tukhainBaaziinKholbolt = db.kholboltuud.find(
          (kholbolt) =>
            kholbolt &&
            String(kholbolt.baiguullagiinId) === String(baiguullagiinId),
        );

        if (!tukhainBaaziinKholbolt) {
          return res.status(404).json({
            success: false,
            aldaa: "Байгууллагын холболт олдсонгүй!",
          });
        }

        // Initialize body.query if it doesn't exist
        if (!body.query) {
          body.query = {};
        } else if (typeof body.query === "string") {
          body.query = JSON.parse(body.query);
        }

        // Parse other query parameters
        if (!!body?.order) body.order = JSON.parse(body.order);
        if (!!body?.select) body.select = JSON.parse(body.select);
        if (!!body?.collation) body.collation = JSON.parse(body.collation);

        // Set default values and parse pagination parameters
        const khuudasniiDugaar = body.khuudasniiDugaar
          ? Number(body.khuudasniiDugaar)
          : 1;
        const khuudasniiKhemjee = body.khuudasniiKhemjee
          ? Number(body.khuudasniiKhemjee)
          : 10;

        // Add baiguullagiinId filter (required) - ensure it's set even if in query JSON
        body.query.baiguullagiinId = String(baiguullagiinId);

        // Add barilgiinId filter if provided in query params
        if (barilgiinId) {
          body.query.barilgiinId = String(barilgiinId);
        }

        // Debug: Log the query
        console.log(
          "🔍 [geree GET] Query:",
          JSON.stringify(body.query, null, 2),
        );

        let jagsaalt = await Geree(tukhainBaaziinKholbolt)
          .find(body.query)
          .sort(body.order)
          .collation(body.collation ? body.collation : {})
          .select(body.select)
          .skip((khuudasniiDugaar - 1) * khuudasniiKhemjee)
          .limit(khuudasniiKhemjee);

        let niitMur = await Geree(tukhainBaaziinKholbolt).countDocuments(
          body.query,
        );
        let niitKhuudas =
          niitMur % khuudasniiKhemjee == 0
            ? Math.floor(niitMur / khuudasniiKhemjee)
            : Math.floor(niitMur / khuudasniiKhemjee) + 1;

        console.log("✅ [geree GET] Found", niitMur, "records");

        // Normalize horoo field to always be an object format for consistency
        // Set uldegdel = globalUldegdel so frontend "Үлдэгдэл" shows contract balance (including positiveBalance/credit)
        if (jagsaalt != null) {
          jagsaalt.forEach((mur) => {
            mur.key = mur._id;
            mur.uldegdel =
              typeof mur.globalUldegdel === "number"
                ? mur.globalUldegdel
                : (mur.globalUldegdel ?? 0);
            // Normalize horoo field: convert string to object if needed
            if (mur.horoo && typeof mur.horoo === "string") {
              mur.horoo = { ner: mur.horoo, kod: mur.horoo };
            } else if (!mur.horoo || typeof mur.horoo !== "object") {
              mur.horoo = {};
            }
          });
        }

        console.log("Found contracts:", jagsaalt.length);

        res.json({
          khuudasniiDugaar,
          khuudasniiKhemjee,
          jagsaalt,
          niitMur,
          niitKhuudas,
        });
        return;
      } catch (error) {
        console.error("Geree GET error:", error);
        next(error);
        return;
      }
    }

    // Handle PUT requests - automatically update electricity readings if tsahilgaaniiZaalt is provided
    if (req.method === "PUT" && req.body.tsahilgaaniiZaalt !== undefined) {
      try {
        const { db } = require("zevbackv2");
        const baiguullagiinId = req.body.baiguullagiinId;

        if (!baiguullagiinId) {
          // Try to get baiguullagiinId from the geree document if ID is provided
          if (req.params.id) {
            const allConnections = db.kholboltuud || [];
            let foundGeree = null;

            for (const conn of allConnections) {
              try {
                const tempGeree = await Geree(conn, true)
                  .findById(req.params.id)
                  .select("baiguullagiinId");
                if (tempGeree) {
                  foundGeree = tempGeree;
                  req.body.baiguullagiinId = tempGeree.baiguullagiinId;
                  break;
                }
              } catch (err) {
                // Continue searching
              }
            }
          }

          if (!req.body.baiguullagiinId) {
            console.log(
              "⚠️ [GEREE PUT] baiguullagiinId not found, skipping automatic electricity update",
            );
            return next();
          }
        }

        const tukhainBaaziinKholbolt = db.kholboltuud.find(
          (kholbolt) =>
            String(kholbolt.baiguullagiinId) ===
            String(req.body.baiguullagiinId),
        );

        if (!tukhainBaaziinKholbolt) {
          console.log(
            "⚠️ [GEREE PUT] Connection not found, skipping automatic electricity update",
          );
          return next();
        }

        // Parse tsahilgaaniiZaalt (default to 0 if invalid)
        const tsahilgaaniiZaalt =
          req.body.tsahilgaaniiZaalt !== undefined
            ? parseFloat(req.body.tsahilgaaniiZaalt) || 0
            : 0;

        // Automatically update electricity readings in req.body
        req.body.umnukhZaalt = tsahilgaaniiZaalt;
        req.body.suuliinZaalt = tsahilgaaniiZaalt;
        req.body.zaaltTog =
          req.body.zaaltTog !== undefined ? req.body.zaaltTog : 0;
        req.body.zaaltUs =
          req.body.zaaltUs !== undefined ? req.body.zaaltUs : 0;

        console.log(
          "⚡ [GEREE PUT] Automatically updated electricity readings from tsahilgaaniiZaalt:",
          {
            tsahilgaaniiZaalt: tsahilgaaniiZaalt,
            umnukhZaalt: req.body.umnukhZaalt,
            suuliinZaalt: req.body.suuliinZaalt,
            zaaltTog: req.body.zaaltTog,
            zaaltUs: req.body.zaaltUs,
          },
        );

        // Remove tsahilgaaniiZaalt from body as it's not a geree field
        delete req.body.tsahilgaaniiZaalt;
      } catch (error) {
        console.error(
          "⚠️ [GEREE PUT] Error updating electricity readings:",
          error,
        );
        // Don't block the request, just log the error
      }
    }

    // IMPORTANT: When cancelling a geree (tuluv: "Цуцалсан"), preserve the original barilgiinId
    // Do NOT allow barilgiinId to be changed when cancelling a contract
    if (
      req.method === "PUT" &&
      req.body.tuluv === "Цуцалсан" &&
      req.params.id
    ) {
      try {
        const { db } = require("zevbackv2");
        const allConnections = db.kholboltuud || [];
        let originalGeree = null;

        // Find the original geree to preserve its barilgiinId
        for (const conn of allConnections) {
          try {
            const tempGeree = await Geree(conn, true)
              .findById(req.params.id)
              .select("barilgiinId");
            if (tempGeree) {
              originalGeree = tempGeree;
              break;
            }
          } catch (err) {
            // Continue searching
          }
        }

        // If original geree found, preserve its barilgiinId
        if (originalGeree && originalGeree.barilgiinId) {
          req.body.barilgiinId = originalGeree.barilgiinId;
          console.log(
            `🔒 [GEREE PUT] Preserving original barilgiinId: ${originalGeree.barilgiinId} when cancelling contract`,
          );
        }
      } catch (error) {
        console.error("⚠️ [GEREE PUT] Error preserving barilgiinId:", error);
        // Don't block the request, just log the error
      }
    }

    next();
  },
);

// router
//   .route("/gereeTsutslaya")
//   .post(tokenShalgakh, async (req, res, next) => {
//     try {
//       var geree = await Geree(req.body.tukhainBaaziinKholbolt, true)
//         .findById(req.body.gereeniiId)
//         .select({
//           gereeniiTuukhuud: 1,
//           duusakhOgnoo: 1,
//         });
//       var tuukh = {
//         umnukhDuusakhOgnoo: geree.duusakhOgnoo,
//         tsutslasanShaltgaan: req.body.shaltgaan,
//         khiisenOgnoo: new Date(),
//         turul: "Tsutslakh",
//         ajiltniiNer: req.body.nevtersenAjiltniiToken.ner,
//         ajiltniiId: req.body.nevtersenAjiltniiToken.id,
//       };
//       var avlagaMatch = req.body.udruurBodokhEsekh
//         ? {
//             ognoo: {
//               $gte: new Date(moment(req.body.tsutslakhOgnoo).startOf("month")),
//             },
//             tulsunDun: { $exists: false },
//           }
//         : { ognoo: { $gt: new Date() } };
//       if (geree.gereeniiTuukhuud) {
//         Geree(req.body.tukhainBaaziinKholbolt)
//           .findOneAndUpdate(
//             { _id: req.body.gereeniiId },
//             {
//               $push: {
//                 [`gereeniiTuukhuud`]: tuukh,
//               },
//               $set: {
//                 tsutsalsanOgnoo: new Date(),
//                 tuluv: -1,
//               },
//               $pull: { "avlaga.guilgeenuud": avlagaMatch },
//             }
//           )
//           .then((result) => {
//             talbaiKhariltsagchiinTuluvUurchluy(
//               [geree._id],
//               req.body.tukhainBaaziinKholbolt
//             );
//             res.send("Amjilttai");
//           })
//           .catch((err) => {
//             next(err);
//           });
//       } else {
//         tuukh = [tuukh];
//         Geree(req.body.tukhainBaaziinKholbolt)
//           .findOneAndUpdate(
//             { _id: req.body.gereeniiId },
//             {
//               $set: {
//                 gereeniiTuukhuud: tuukh,
//                 tsutsalsanOgnoo: new Date(),
//                 tuluv: -1,
//               },
//               $pull: { "avlaga.guilgeenuud": avlagaMatch },
//             }
//           )
//           .then((result) => {
//             talbaiKhariltsagchiinTuluvUurchluy(
//               [geree._id],
//               req.body.tukhainBaaziinKholbolt
//             );
//             res.send("Amjilttai");
//           })
//           .catch((err) => {
//             next(err);
//           });
//       }
//       if (
//         req.body.udruurBodokhEsekh &&
//         req.body.suuliinSariinAvlaguud &&
//         req.body.suuliinSariinAvlaguud?.length > 0
//       ) {
//         var suuliinSariinAvlaguud = req.body.suuliinSariinAvlaguud;
//         for (const savlaga of suuliinSariinAvlaguud)
//           savlaga.tailbar = req.body.shaltgaan;
//         Geree(req.body.tukhainBaaziinKholbolt)
//           .findOneAndUpdate(
//             { _id: req.body.gereeniiId },
//             {
//               $push: { "avlaga.guilgeenuud": suuliinSariinAvlaguud },
//             }
//           )
//           .then((result) => {})
//           .catch((err) => {
//             next(err);
//           });
//       }
//     } catch (error) {
//       next(error);
//     }
//   });

router
  .route("/gereeKhadgalya")
  .post(
    tokenShalgakh,
    shalguurFieldValidate(["register", "customerTin"]),
    async (req, res, next) => {
      const { db } = require("zevbackv2");
      const orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(req.body);
      orshinSuugch.id = orshinSuugch.register
        ? orshinSuugch.register
        : orshinSuugch.customerTin;
      if (
        req.body.gereeniiDugaar === `ГД${moment(new Date()).format("YYMMDD")}`
      ) {
        var unuudur = new Date();
        unuudur = new Date(
          unuudur.getFullYear(),
          unuudur.getMonth(),
          unuudur.getDate(),
        );
        var maxDugaar = 1;
        await Dugaarlalt(req.body.tukhainBaaziinKholbolt)
          .find({
            baiguullagiinId: req.body.baiguullagiinId,
            barilgiinId: req.body.barilgiinId,
            turul: "geree",
            ognoo: unuudur,
          })
          .sort({
            dugaar: -1,
          })
          .limit(1)
          .then((result) => {
            if (result != 0) maxDugaar = result[0].dugaar + 1;
          });
        var dugaarlalt = new Dugaarlalt(req.body.tukhainBaaziinKholbolt)({
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.body.barilgiinId,
          dugaar: maxDugaar,
          turul: "geree",
          ognoo: unuudur,
          isNew: true,
        });
        // Only append maxDugaar suffix if it's greater than 1 (multiple contracts on same day)
        // This prevents "-0" or "-1" suffixes from appearing
        if (maxDugaar && maxDugaar > 1) {
          req.body.gereeniiDugaar = req.body.gereeniiDugaar + "-" + maxDugaar;
        }
        dugaarlalt.save();
      }

      var orshinSuugchShalguur;
      if (!!orshinSuugch.register) {
        orshinSuugchShalguur = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
          register: orshinSuugch.register,
          barilgiinId: req.body.barilgiinId,
        });
      } else if (!!orshinSuugch.customerTin) {
        orshinSuugchShalguur = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
          customerTin: orshinSuugch.customerTin,
          barilgiinId: req.body.barilgiinId,
        });
      }
      if (!orshinSuugchShalguur) await orshinSuugch.save();
      var geree = new Geree(req.body.tukhainBaaziinKholbolt)(req.body);
      var daraagiinTulukhOgnoo = geree.duusakhOgnoo;
      try {
        if (geree.avlaga.guilgeenuud && geree.avlaga.guilgeenuud.length > 0)
          daraagiinTulukhOgnoo = geree.avlaga.guilgeenuud[0].ognoo;
      } catch (err) {
        if (!!next) next(err);
      }
      geree.daraagiinTulukhOgnoo = daraagiinTulukhOgnoo;
      geree.tuluv = 1;
      await geree.save().then((result) => {
        talbaiKhariltsagchiinTuluvUurchluy(
          [result._id],
          req.body.tukhainBaaziinKholbolt,
        );
      });
      res.send("Amjilttai");
    },
  );

router
  .route("/gereeniiGuilgeeKhadgalya")
  .post(tokenShalgakh, gereeniiGuilgeeKhadgalya);

router
  .route("/zaaltOlnoorOruulya")
  .post(tokenShalgakh, async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        req.body.baiguullagiinId,
      );
      var ashiglaltiinZardal = await AshiglaltiinZardluud(
        req.body.tukhainBaaziinKholbolt,
      ).findById(req.body.ashiglaltiinId);
      const jagsaalt = req.body.jagsaalt;
      var talbainDugaaruud = [];
      for await (const mur of jagsaalt) {
        talbainDugaaruud.push(mur.talbainId);
      }
      var niitGereenuud = [];
      var oldooguiGeree = [];
      var aldaaniiMsg = "";
      if (talbainDugaaruud.length > 0) {
        gereenuud = await Geree(req.body.tukhainBaaziinKholbolt, true)
          .find({
            talbainIdnuud: { $in: talbainDugaaruud },
            barilgiinId: req.body.barilgiinId,
            tuluv: 1,
          })
          .select("+avlaga");
        if (!!gereenuud) {
          oldooguiGeree = [];
          talbainDugaaruud.forEach((a) => {
            var oldsonGeree = gereenuud.find((b) =>
              b.talbainIdnuud.includes(a),
            );
            if (!oldsonGeree)
              oldooguiGeree.push(
                jagsaalt.find((x) => x.talbainId == a).talbainDugaar,
              );
          });
          if (oldooguiGeree.length > 0) {
            aldaaniiMsg =
              aldaaniiMsg +
              " Дараах талбайн дугаартай гэрээнүүд олдсонгүй! " +
              oldooguiGeree.toString();
          } else niitGereenuud.push(...gereenuud);
        }
      }
      var bulkOps = [];
      var updateObject;
      if (niitGereenuud.length > 0) {
        for await (const tukhainZardal of jagsaalt) {
          var geree = niitGereenuud.find((x) =>
            x.talbainIdnuud.includes(tukhainZardal.talbainId),
          );
          updateObject = {};
          if (
            ashiglaltiinZardal.turul == "кВт" ||
            ashiglaltiinZardal.turul == "1м3" ||
            ashiglaltiinZardal.turul === "кг"
          ) {
            var umnukhZaalt = 0;
            var suuliinGuilgee = geree.avlaga.guilgeenuud.filter((x) => {
              return (
                x.khemjikhNegj == ashiglaltiinZardal.turul &&
                x.tailbar == ashiglaltiinZardal.ner &&
                (!x.tooluuriinDugaar ||
                  tukhainZardal.tooluuriinDugaar == x.tooluuriinDugaar)
              );
            });
            if (!!suuliinGuilgee && suuliinGuilgee.length > 0) {
              suuliinGuilgee = lodash.orderBy(
                suuliinGuilgee,
                ["ognoo"],
                ["asc"],
              );
              suuliinGuilgee = suuliinGuilgee[suuliinGuilgee.length - 1];
            }
            if (!!suuliinGuilgee?.suuliinZaalt) {
              umnukhZaalt = suuliinGuilgee.suuliinZaalt;
            }
          }
          var zoruuDun = tukhainZardal.suuliinZaalt - umnukhZaalt;
          var tsakhilgaanDun = 0;
          var tsakhilgaanKBTST = 0;
          var chadalDun = 0;
          var tsekhDun = 0;
          var sekhDemjikhTulburDun = 0;
          if (baiguullaga?.tokhirgoo?.guidelBuchiltKhonogEsekh) {
            tsakhilgaanKBTST =
              zoruuDun *
              (ashiglaltiinZardal.tsakhilgaanUrjver || 1) *
              (tukhainZardal.guidliinKoep || 1);
            chadalDun =
              baiguullaga?.tokhirgoo?.bichiltKhonog > 0 && tsakhilgaanKBTST > 0
                ? (tsakhilgaanKBTST /
                    baiguullaga?.tokhirgoo?.bichiltKhonog /
                    12) *
                  (req.body.baiguullagiinId === "679aea9032299b7ba8462a77"
                    ? 11520
                    : 15500)
                : 0;
            tsekhDun = ashiglaltiinZardal.tariff * tsakhilgaanKBTST;
            if (baiguullaga?.tokhirgoo?.sekhDemjikhTulburAvakhEsekh) {
              // URANGAN iknayd
              sekhDemjikhTulburDun =
                zoruuDun * (ashiglaltiinZardal.tsakhilgaanUrjver || 1) * 23.79;
              tsakhilgaanDun = chadalDun + tsekhDun + sekhDemjikhTulburDun;
            } else tsakhilgaanDun = chadalDun + tsekhDun;
          } else
            tsakhilgaanDun =
              ashiglaltiinZardal.tariff *
              (ashiglaltiinZardal.tsakhilgaanUrjver || 1) *
              (zoruuDun || 0);
          var tempDun =
            (ashiglaltiinZardal.ner?.includes("Хүйтэн ус") ||
              ashiglaltiinZardal.ner?.includes("Халуун ус")) &&
            ashiglaltiinZardal.bodokhArga === "Khatuu"
              ? ashiglaltiinZardal.tseverUsDun * zoruuDun +
                ashiglaltiinZardal.bokhirUsDun * zoruuDun +
                (ashiglaltiinZardal.ner?.includes("Халуун ус")
                  ? ashiglaltiinZardal.usKhalaasniiDun * zoruuDun
                  : 0)
              : tsakhilgaanDun;
          updateObject = {
            turul: "avlaga",
            tulsunDun: 0,
            tulukhDun: !!req.body.nuatBodokhEsekh
              ? ((ashiglaltiinZardal.suuriKhuraamj || 0) + tempDun) * 1.1
              : (ashiglaltiinZardal.suuriKhuraamj || 0) + tempDun,
            negj: zoruuDun && zoruuDun,
            khemjikhNegj: ashiglaltiinZardal.turul,
            tariff: ashiglaltiinZardal.tariff,
            tseverUsDun: ashiglaltiinZardal.tseverUsDun * zoruuDun || 0,
            bokhirUsDun: ashiglaltiinZardal.bokhirUsDun * zoruuDun || 0,
            usKhalaasanDun: ashiglaltiinZardal.ner?.includes("Халуун ус")
              ? ashiglaltiinZardal.usKhalaasniiDun * zoruuDun
              : 0,
            suuriKhuraamj: ashiglaltiinZardal.suuriKhuraamj || 0,
            tsakhilgaanUrjver: ashiglaltiinZardal.tsakhilgaanUrjver || 1,
            tsakhilgaanKBTST: tsakhilgaanKBTST || 0,
            guidliinKoep: tukhainZardal.guidliinKoep || 0,
            bichiltKhonog: baiguullaga?.tokhirgoo?.bichiltKhonog || 0,
            chadalDun: chadalDun || 0,
            tsekhDun: tsekhDun || 0,
            sekhDemjikhTulburDun: sekhDemjikhTulburDun || 0,
            ognoo: tukhainZardal.ognoo,
            gereeniiId: geree._id,
            tailbar: ashiglaltiinZardal.ner,
            nuatBodokhEsekh: req.body.nuatBodokhEsekh,
            tooluuriinDugaar: tukhainZardal.tooluuriinDugaar,
          };
          if (
            ashiglaltiinZardal.turul === "кВт" ||
            ashiglaltiinZardal.turul === "1м3" ||
            ashiglaltiinZardal.turul === "кг"
          ) {
            updateObject["suuliinZaalt"] = tukhainZardal.suuliinZaalt;
            updateObject["umnukhZaalt"] = umnukhZaalt;
          }
          updateObject["guilgeeKhiisenOgnoo"] = new Date();
          if (req.body.nevtersenAjiltniiToken) {
            updateObject["guilgeeKhiisenAjiltniiNer"] =
              req.body.nevtersenAjiltniiToken.ner;
            updateObject["guilgeeKhiisenAjiltniiId"] =
              req.body.nevtersenAjiltniiToken.id;
          }
          tukhainZardal.gereeniiId = geree._id;
          tukhainZardal.zoruu = ashiglaltiinZardal.zoruuDun;
          tukhainZardal.niitDun = tempDun;

          // Prepare document for GereeniiTulukhAvlaga
          if (updateObject.tulukhDun > 0) {
            const avlagaDoc = {
              baiguullagiinId: req.body.baiguullagiinId,
              baiguullagiinNer: baiguullaga?.ner || "",
              barilgiinId: req.body.barilgiinId,
              gereeniiId: geree._id,
              gereeniiDugaar: geree.gereeniiDugaar,
              orshinSuugchId: geree.orshinSuugchId,

              ognoo: updateObject.guilgeeKhiisenOgnoo || new Date(),
              undsenDun: updateObject.tulukhDun,
              tulukhDun: updateObject.tulukhDun,
              uldegdel: updateObject.tulukhDun,

              turul: "avlaga",
              zardliinTurul: updateObject.khemjikhNegj || "", // or derive from ashiglaltiinZardal
              zardliinId: req.body.ashiglaltiinId,
              zardliinNer: ashiglaltiinZardal.ner,

              tailbar: updateObject.tailbar,

              khuraamj: updateObject.suuriKhuraamj,
              negj: updateObject.negj,
              tariff: updateObject.tariff,

              umnukhZaalt: updateObject.umnukhZaalt,
              suuliinZaalt: updateObject.suuliinZaalt,
              tooluuriinDugaar: updateObject.tooluuriinDugaar,

              source: "excel_import",

              // Fields from updateObject that map to schema
              nuatBodokhEsekh: updateObject.nuatBodokhEsekh,

              guilgeeKhiisenAjiltniiNer: updateObject.guilgeeKhiisenAjiltniiNer || "",
              guilgeeKhiisenAjiltniiId: updateObject.guilgeeKhiisenAjiltniiId || "",
            };

            let upsertDoc = {
              insertOne: {
                document: avlagaDoc,
              },
            };
            bulkOps.push(upsertDoc);
          }
        }
      }
      if (aldaaniiMsg) throw new Error(aldaaniiMsg);
      if (bulkOps && bulkOps.length > 0)
        await GereeniiTulukhAvlaga(req.body.tukhainBaaziinKholbolt)
          .bulkWrite(bulkOps)
          .then((bulkWriteOpResult) => {
            const AshiglaltiinExcel = require("../models/ashiglaltiinExcel");
            const AshiglaltiinExcelModel = require("../models/ashiglaltiinExcel");
            AshiglaltiinExcelModel(req.body.tukhainBaaziinKholbolt).insertMany(
              jagsaalt,
            );
            res.status(200).send("Amjilttai");
          })
          .catch((err) => {
            next(err);
          });
    } catch (err) {
      next(err);
    }
  });

router.get(
  "/tootBurtgelExcelTemplate",
  tokenShalgakh,
  generateTootBurtgelExcelTemplate,
);

router.post(
  "/tootBurtgelExcelImport",
  tokenShalgakh,
  uploadFile.single("excelFile"),
  importTootBurtgelFromExcel,
);

router.put(
  "/tootBurtgelExcelImport",
  tokenShalgakh,
  uploadFile.single("excelFile"),
  importTootBurtgelFromExcel,
);

module.exports = router;
