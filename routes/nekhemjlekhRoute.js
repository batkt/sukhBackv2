const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { crud, UstsanBarimt, tokenShalgakh } = require("zevbackv2");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh.js");
const {
  downloadNekhemjlekhiinTuukhExcel,
  downloadExcelList,
} = require("../controller/excelImportController");
const {
  previewInvoice,
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices,
  deleteInvoiceZardal,

  deleteInvoice,
} = require("../controller/nekhemjlekhController");
const { markInvoicesAsPaid } = require("../services/invoicePaymentService");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const { db } = require("zevbackv2");

/** Same as override — delete current-cycle invoice(s) then insert a new document. */
function manualSendOverrideFromBody(body) {
  const o = body?.override;
  const f = body?.forceNew;
  return (
    o === true ||
    o === "true" ||
    f === true ||
    f === "true"
  );
}

const MANUAL_SEND_NEW_DOC_HINT =
  "Энэ төлбөрийн мөчлөгт нэхэмжлэх аль хэдийн байгаа тул одоогийн баримт шинэчлэгдлээ. Шинэ баримт (шинэ _id) үүсгэхийн тулд body-д override: true эсвэл forceNew: true илгээнэ үү — одоогийн мөчлөгийн олдсон нэхэмжлэхүүд устгагдана.";

/** When newInvoices/created is 0 but existing rows were refreshed — user-facing explanation. */
const MANUAL_SEND_NO_NEW_USER_GUIDE =
  "Шинэ нэхэмжлэх үүсээгүй байна (created = 0). Давхар үүсгэх тохиргоо (override эсвэл forceNew) эсвэл тухайн сар аль хэдийн үүссэн эсэхийг шалгана уу.";

router.post(
  "/nekhemjlekhiinTuukhExcelDownload",
  tokenShalgakh,
  downloadNekhemjlekhiinTuukhExcel,
);

router.post(
  "/generateGenericExcel",
  tokenShalgakh,
  downloadExcelList,
);

// Emit tulburUpdated on delete of invoices so web clients refresh
router.use((req, res, next) => {
  const isInvoiceDelete =
    (req.method === "DELETE" ||
      (req.method === "POST" && req.path?.includes("delete"))) &&
    req.path?.includes("nekhemjlekhiinTuukh");
  if (!isInvoiceDelete) return next();
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

// For invoice list responses: set uldegdel = geree.globalUldegdel so "Үлдэгдэл" shows contract balance (including credit)
router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const jagsaalt = data?.jagsaalt;
    if (!Array.isArray(jagsaalt) || jagsaalt.length === 0) {
      return originalJson(data);
    }
    const baiguullagiinId =
      req.body?.baiguullagiinId || req.query?.baiguullagiinId;
    if (!baiguullagiinId || !db?.kholboltuud) {
      return originalJson(data);
    }
    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    );
    if (!kholbolt) {
      return originalJson(data);
    }
    const gereeIds = [
      ...new Set(
        jagsaalt
          .map((inv) => inv?.gereeniiId)
          .filter((id) => id != null && String(id).length > 0),
      ),
    ];
    if (gereeIds.length === 0) {
      return originalJson(data);
    }
    const GereeModel = Geree(kholbolt);
    GereeModel.find({ _id: { $in: gereeIds } })
      .select("globalUldegdel")
      .lean()
      .then((gerees) => {
        const byId = {};
        gerees.forEach((g) => {
          byId[String(g._id)] =
            typeof g.globalUldegdel === "number"
              ? g.globalUldegdel
              : (g.globalUldegdel ?? 0);
        });
        jagsaalt.forEach((inv) => {
          const gid = inv?.gereeniiId != null ? String(inv.gereeniiId) : null;
          if (gid && byId[gid] !== undefined) {
            inv.uldegdel = byId[gid];
          }
        });
        originalJson(data);
      })
      .catch(() => originalJson(data));
  };
  next();
});

router.delete("/nekhemjlekhiinTuukh/:id", tokenShalgakh, deleteInvoice);
crud(router, "nekhemjlekhiinTuukh", nekhemjlekhiinTuukh, UstsanBarimt);

router.get(
  "/nekhemjlekhiinTuukh/:id",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Нэхэмжлэхийн ID буруу байна!",
        });
      }

      const nekhemjlekh = await nekhemjlekhiinTuukh(
        req.body.tukhainBaaziinKholbolt,
      ).findById(id);
      if (!nekhemjlekh) {
        return res.status(404).json({
          success: false,
          message: "Нэхэмжлэх олдсонгүй!",
        });
      }

      const wasUpdated = nekhemjlekh.checkOverdue();
      if (wasUpdated) {
        await nekhemjlekh.save();
      }

      res.json({
        success: true,
        data: nekhemjlekh,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Delete invoice(s): body { baiguullagiinId } = delete ALL invoices for org; { invoiceId, baiguullagiinId } = delete one
router.post("/deleteInvoice", tokenShalgakh, deleteInvoice);

// Mark invoices as paid
router.post("/markInvoicesAsPaid", tokenShalgakh, async (req, res, next) => {
  try {
    // Extract barilgiinId from body
    const { barilgiinId } = req.body || {};

    const result = await markInvoicesAsPaid({
      ...req.body,
      barilgiinId: barilgiinId, // Pass barilgiinId to service
      nevtersenAjiltniiToken:
        req.body.nevtersenAjiltniiToken ?? req.nevtersenAjiltniiToken,
    });
    const baiguullagiinId = req.body?.baiguullagiinId;
    if (baiguullagiinId) {
      const io = req.app.get("socketio");
      if (io) io.emit(`tulburUpdated:${baiguullagiinId}`, {});
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Preview invoice before sending
// GET /nekhemjlekh/preview?gereeId=xxx&baiguullagiinId=xxx&barilgiinId=xxx&targetMonth=1&targetYear=2026
router.get("/preview", tokenShalgakh, async (req, res, next) => {
  try {
    // Handle duplicate query parameters (Express converts them to arrays)
    const gereeId = Array.isArray(req.query.gereeId)
      ? req.query.gereeId[0]
      : req.query.gereeId;
    const baiguullagiinId = Array.isArray(req.query.baiguullagiinId)
      ? req.query.baiguullagiinId[0]
      : req.query.baiguullagiinId;
    const barilgiinId = Array.isArray(req.query.barilgiinId)
      ? req.query.barilgiinId[0]
      : req.query.barilgiinId;
    const targetMonth = Array.isArray(req.query.targetMonth)
      ? req.query.targetMonth[0]
      : req.query.targetMonth;
    const targetYear = Array.isArray(req.query.targetYear)
      ? req.query.targetYear[0]
      : req.query.targetYear;

    if (!gereeId || !baiguullagiinId) {
      return res.status(400).json({
        success: false,
        message: "gereeId болон baiguullagiinId шаардлагатай",
      });
    }

    const month = targetMonth ? parseInt(targetMonth) : null;
    const year = targetYear ? parseInt(targetYear) : null;

    const result = await previewInvoice(
      gereeId,
      baiguullagiinId,
      barilgiinId || null,
      month,
      year,
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Manual invoice creation – one or more contracts.
 * POST /nekhemjlekh/manualSend
 * Headers: Authorization (token)
 * Body (JSON):
 *   - gereeIds (required): string[] – contract IDs, e.g. ["507f1f77bcf86cd799439011"]
 *   - baiguullagiinId (required): string – organization ID
 *   - gereeId (optional): string – single contract ID (alternative to gereeIds)
 *   - override (optional): boolean – if true, delete existing invoices for the month before creating (default: false)
 *   - forceNew (optional): boolean – alias for override (clearer name for “new DB document”)
 *   - targetMonth (optional): number – month 1–12 (default: current month)
 *   - targetYear (optional): number – year (default: current year)
 */
router.post("/manualSend", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      gereeIds,
      gereeId,
      baiguullagiinId,
      targetMonth,
      targetYear,
    } = req.body;

    // Support both new format (gereeIds array) and old format (single gereeId) for backward compatibility
    let contractIds = gereeIds;
    if (!contractIds && gereeId) {
      // Backward compatibility: if gereeId is provided, convert to array
      contractIds = [gereeId];
    }

    if (
      !contractIds ||
      !Array.isArray(contractIds) ||
      contractIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "gereeIds (массив) болон baiguullagiinId шаардлагатай",
      });
    }

    if (!baiguullagiinId) {
      return res.status(400).json({
        success: false,
        message: "baiguullagiinId шаардлагатай",
      });
    }

    const month = targetMonth ? parseInt(targetMonth) : null;
    const year = targetYear ? parseInt(targetYear) : null;

    const result = await manualSendSelectedInvoices(
      contractIds,
      baiguullagiinId,
      manualSendOverrideFromBody(req.body),
      month,
      year,
      req.app,
    );

    if (result.success) {
      const baiguullagiinId = req.body?.baiguullagiinId;
      if (baiguullagiinId) {
        const io = req.app.get("socketio");
        if (io) io.emit(`tulburUpdated:${baiguullagiinId}`, {});
      }
      const nNew = result.newInvoices ?? 0;
      const nUp = result.updatedExisting ?? 0;
      const nSame = result.unchangedExisting ?? 0;
      const dataPayload =
        nNew === 0 && nUp > 0
          ? { ...result, hint: MANUAL_SEND_NEW_DOC_HINT }
          : result;
      let message;
      if (nNew > 0 && nUp === 0 && nSame === 0) {
        message =
          nNew === 1
            ? "Шинэ нэхэмжлэх 1 үүсгэгдлээ"
            : `Шинэ нэхэмжлэх ${nNew} үүсгэгдлээ`;
      } else if (nNew === 0 && (nUp > 0 || nSame > 0)) {
        message =
          nUp > 0 && nSame === 0
            ? `${MANUAL_SEND_NO_NEW_USER_GUIDE} Нэхэмжлэх ${nUp} шинэчлэгдлээ.`
            : nUp === 0 && nSame > 0
              ? nSame === 1
                ? "Одоогийн сарын нэхэмжлэх аль хэдийн байна — өөрчлөлт оруулаагүй"
                : `${nSame} гэрээнд одоогийн нэхэмжлэх өөрчлөгдөөгүй`
              : `${MANUAL_SEND_NO_NEW_USER_GUIDE} Шинэ ${nNew}, шинэчилсэн ${nUp}, өөрчлөгдөөгүй ${nSame}.`;
      } else {
        message = `Шинэ нэхэмжлэх ${nNew}, шинэчилсэн ${nUp}, өөрчлөгдөөгүй ${nSame}`;
      }

      res.json({
        success: true,
        message: message,
        data: dataPayload,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || "Нэхэмжлэхүүд үүсгэхэд алдаа гарлаа",
        error: result.error,
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Manual invoice creation – all active contracts in org (optionally filtered by building).
 * POST /nekhemjlekh/manualSendMass
 * Headers: Authorization (token)
 * Body (JSON):
 *   - baiguullagiinId (required): string – organization ID
 *   - barilgiinId (optional): string – limit to contracts in this building
 *   - override (optional): boolean – if true, delete existing invoices for the month before creating (default: false)
 *   - forceNew (optional): boolean – alias for override
 *   - targetMonth (optional): number – month 1–12 (default: current month)
 *   - targetYear (optional): number – year (default: current year)
 */
router.post("/manualSendMass", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      barilgiinId,
      targetMonth,
      targetYear,
    } = req.body;

    if (!baiguullagiinId) {
      return res.status(400).json({
        success: false,
        message: "baiguullagiinId шаардлагатай",
      });
    }

    const month = targetMonth ? parseInt(targetMonth) : null;
    const year = targetYear ? parseInt(targetYear) : null;

    const result = await manualSendMassInvoices(
      baiguullagiinId,
      barilgiinId || null,
      manualSendOverrideFromBody(req.body),
      month,
      year,
      req.app,
    );

    if (result.success) {
      const baiguullagiinId = req.body?.baiguullagiinId;
      if (baiguullagiinId) {
        const io = req.app.get("socketio");
        if (io) io.emit(`tulburUpdated:${baiguullagiinId}`, {});
      }
      const nNew = result.newInvoices ?? 0;
      const nUp = result.updatedExisting ?? 0;
      const nSame = result.unchangedExisting ?? 0;
      const dataPayload =
        nNew === 0 && nUp > 0
          ? { ...result, hint: MANUAL_SEND_NEW_DOC_HINT }
          : result;
      let message;
      if (nNew > 0 && nUp === 0 && nSame === 0) {
        message = `Шинэ нэхэмжлэх ${nNew} үүсгэгдлээ`;
      } else if (nNew === 0 && (nUp > 0 || nSame > 0)) {
        message =
          nUp > 0 && nSame === 0
            ? `${MANUAL_SEND_NO_NEW_USER_GUIDE} Нэхэмжлэх ${nUp} шинэчлэгдлээ.`
            : nUp === 0 && nSame > 0
              ? `Өөрчлөлтгүй: одоогийн сарын нэхэмжлэх аль хэдийн ${nSame} гэрээнд байна`
              : `${MANUAL_SEND_NO_NEW_USER_GUIDE} Шинэ ${nNew}, шинэчилсэн ${nUp}, өөрчлөгдөөгүй ${nSame}.`;
      } else {
        message = `Шинэ нэхэмжлэх ${nNew}, шинэчилсэн ${nUp}, өөрчлөгдөөгүй ${nSame}`;
      }
      res.json({
        success: true,
        message: message,
        data: dataPayload,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || "Нэхэмжлэхүүд үүсгэхэд алдаа гарлаа",
        error: result.error,
      });
    }
  } catch (error) {
    next(error);
  }
});





// Delete a specific zardal from an invoice
router.post(
  "/nekhemjlekhiinTuukh/deleteZardal",
  tokenShalgakh,
  deleteInvoiceZardal,
);

/**
 * POST /nekhemjlekh/sync-all-from-ledger
 * 
 * Uses the history ledger as the single source of truth to sync:
 *   1. Each invoice's niitTulbur, uldegdel, tuluv  (from niitTulburOriginal - paymentHistory)
 *   2. Each geree's globalUldegdel, positiveBalance (from ledger final balance)
 * 
 * Processes ALL contracts for the given baiguullaga.
 * 
 * Body: { baiguullagiinId, dryRun?: boolean }
 *   dryRun = true  → only report what would change, don't write to DB
 *   dryRun = false → apply all changes (default)
 */
router.post("/sync-all-from-ledger", tokenShalgakh, async (req, res, next) => {
  res.status(501).json({ success: false, message: "This feature is temporarily disabled during refactoring." });
});

module.exports = router;
