const express = require("express");
const router = express.Router();
const Geree = require("../models/geree");
const ashiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const uilchilgeeniiZardluud = require("../models/uilchilgeeniiZardluud");
const LiftShalgaya = require("../models/liftShalgaya");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const { crud, tokenShalgakh, UstsanBarimt, khuudaslalt, db } = require("zevbackv2");
const multer = require("multer");
const {
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
const gereeController = require("../controller/gereeController");

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

// Electricity data export
router.post("/zaaltExcelDataAvya", tokenShalgakh, zaaltExcelDataAvya);

// GuilgeeniiTuukh Excel download
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


// CRUD for related models
crud(router, "ashiglaltiinZardluud", ashiglaltiinZardluud, UstsanBarimt);
crud(router, "uilchilgeeniiZardluud", uilchilgeeniiZardluud, UstsanBarimt);

// Lift Shalgaya
router.post("/liftShalgaya", tokenShalgakh, gereeController.postLiftShalgaya);
router.post("/uldegdelBodyo", tokenShalgakh, gereeController.uldegdelBodyo);
crud(router, "liftShalgaya", LiftShalgaya, UstsanBarimt);

// Emit tulburUpdated on delete of avlaga records so web clients refresh
// AND trigger Full Sync of invoice statuses
router.use((req, res, next) => {
  const isAvlagaMutation =
    (req.method === "DELETE" ||
      req.method === "POST" ||
      req.method === "PUT" ||
      (req.method === "POST" && req.path?.includes("delete"))) &&
    req.path?.includes("guilgeeAvlaguud");
  if (!isAvlagaMutation) return next();

  console.log(`ℹ️ [GEREE ROUTE] Avlaga mutation intercepted: ${req.method} ${req.path}`);
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let ranAfterResponse = false;

  const afterResponse = (data) => {
    if (ranAfterResponse) return;
    ranAfterResponse = true;

    const baiguullagiinId = req.query?.baiguullagiinId || req.body?.baiguullagiinId || (data && typeof data === "object" ? data.baiguullagiinId : null);
    if (baiguullagiinId && req.app) {
      try {
        console.log(`📡 [GEREE ROUTE] Emitting tulburUpdated socket event for org: ${baiguullagiinId}`);
        req.app.get("socketio").emit(`tulburUpdated:${baiguullagiinId}`, {});
      } catch (e) { }
    }

    // Trigger Full Sync for the affected contract
    const gereeniiId = req.body?.gereeniiId || (data && typeof data === "object" ? data.gereeniiId : null);
    const kholbolt = req.body?.tukhainBaaziinKholbolt;
    if (gereeniiId && kholbolt) {
      const guilgeeService = require("../services/guilgeeService");
      console.log(`🔄 [GEREE ROUTE] Syncing invoice status for contract: ${gereeniiId}`);
      guilgeeService.syncInvoicesStatus(kholbolt, gereeniiId)
        .then(async () => {
          console.log(`✅ [GEREE ROUTE] Invoice status sync completed for contract: ${gereeniiId}`);

          // If this is a creation (POST and not delete/update), trigger CallPro SMS notification
          const isPostCreation = req.method === "POST" && !req.path?.includes("delete") && !req.path?.includes("update");
          const invoiceId = req.body?.nekhemjlekhId || (data && typeof data === "object" ? data.nekhemjlekhId : null);

          if (isPostCreation) {
            if (invoiceId && baiguullagiinId) {
              const invoiceSendService = require("../services/invoiceSendService");
              const cleanDunStr = req.body?.dun ? String(req.body.dun).replace(/,/g, "") : null;
              const manualAmount = cleanDunStr ? Number(cleanDunStr) : null;
              console.log(`📡 [GEREE ROUTE] Triggering CallPro SMS notification for invoiceId: ${invoiceId} with manualAmount: ${manualAmount} after manual avlaga creation`);
              await invoiceSendService.sendInvoiceSmsNotification(kholbolt, invoiceId, baiguullagiinId, { manualAmount });
            } else {
              console.warn(`⚠️ [GEREE ROUTE] SMS skipped: invoiceId (${invoiceId}) or baiguullagiinId (${baiguullagiinId}) missing`);
            }
          } else {
            console.log(`ℹ️ [GEREE ROUTE] SMS skipped: Not a POST creation mutation`);
          }
        })
        .catch((err) => {
          console.error("❌ [GEREE ROUTE] syncInvoicesStatus or SMS failed:", err.message);
        });
    } else {
      console.warn(`⚠️ [GEREE ROUTE] Sync skipped: gereeniiId (${gereeniiId}) or kholbolt (${!!kholbolt}) missing`);
    }
  };

  res.json = function (data) {
    afterResponse(data);
    return originalJson(data);
  };

  res.send = function (data) {
    afterResponse(data);
    return originalSend(data);
  };
  next();
});

// Intercept manual receivable creation to ensure they get a nekhemjlekhId
// and to prevent duplicate garage/storage avlaga within the same billing cycle.
router.post("/guilgeeAvlaguud", tokenShalgakh, async (req, res, next) => {
  const { gereeniiId, nekhemjlekhId, tukhainBaaziinKholbolt, tailbar, baiguullagiinId, barilgiinId } = req.body;

  // --- Duplicate cycle check (garage / storage only) ---
  const tailbarLower = (tailbar || "").toLowerCase();
  const isGarage = tailbarLower.includes("зогсоол");
  const isStorage = tailbarLower.includes("агуулах");

  if ((isGarage || isStorage) && gereeniiId && tukhainBaaziinKholbolt) {
    try {
      const NekhemjlekhCron = require("../models/cronSchedule");
      const { calculateBillingCycleBounds } = require("../utils/dateUtils");

      let cronDay = 1;
      const cronSchedule = await NekhemjlekhCron(tukhainBaaziinKholbolt).findOne({
        baiguullagiinId,
        $or: [{ barilgiinId }, { barilgiinId: null }]
      }).sort({ barilgiinId: -1 }).lean();
      if (cronSchedule?.nekhemjlekhUusgekhOgnoo) {
        cronDay = cronSchedule.nekhemjlekhUusgekhOgnoo;
      }

      const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, new Date());
      const typeRegex = isGarage ? /зогсоол/i : /агуулах/i;
      const toot = req.body.toot ? String(req.body.toot) : undefined;

      const existing = await GuilgeeAvlaguud(tukhainBaaziinKholbolt).findOne({
        gereeniiId,
        ...(toot ? { toot } : {}),
        tailbar: typeRegex,
        ognoo: { $gte: startOfCycle, $lte: endOfCycle },
      }).lean();

      if (existing) {
        const typeLabel = isGarage ? "Зогсоол" : "Агуулах";
        return res.status(409).json({
          success: false,
          error: `Энэ сард ${typeLabel} авлага аль хэдийн бүртгэгдсэн байна.`,
        });
      }
    } catch (err) {
      console.error("Garage/storage duplicate check error:", err);
      // Non-fatal: if check fails, proceed and let record be created
    }
  }

  // --- Auto-link to active invoice ---
  if (!nekhemjlekhId && gereeniiId && tukhainBaaziinKholbolt) {
    try {
      const invoiceService = require("../services/invoiceService");
      const activeInv = await invoiceService.ensureActiveInvoice(
        tukhainBaaziinKholbolt,
        gereeniiId,
        { skipCharges: true }
      );
      if (activeInv) {
        req.body.nekhemjlekhId = activeInv._id.toString();
      }
    } catch (err) {
      console.error("Error auto-linking manual receivable:", err);
    }
  }
  next();
});

router.get("/guilgeeAvlaguud", tokenShalgakh, async (req, res, next) => {
  try {
    const body = req.query;
    if (!!body?.query) body.query = JSON.parse(body.query);
    if (!!body?.order) body.order = JSON.parse(body.order);
    khuudaslalt(GuilgeeAvlaguud(req.body.tukhainBaaziinKholbolt), body).then(res.send.bind(res)).catch(next);
  } catch (e) { next(e); }
});
// Main GuilgeeAvlaguud CRUD
crud(router, "guilgeeAvlaguud", GuilgeeAvlaguud, UstsanBarimt);

// Manual sync endpoint - triggers FIFO reconciliation for a contract
router.post("/syncInvoices", tokenShalgakh, async (req, res, next) => {
  try {
    const { gereeniiId, tukhainBaaziinKholbolt } = req.body;
    if (!gereeniiId || !tukhainBaaziinKholbolt) {
      return res.status(400).json({ success: false, error: "gereeniiId and tukhainBaaziinKholbolt required" });
    }
    const guilgeeService = require("../services/guilgeeService");
    await guilgeeService.syncInvoicesStatus(tukhainBaaziinKholbolt, gereeniiId);
    res.json({ success: true, message: `Sync completed for contract ${gereeniiId}` });
  } catch (err) {
    next(err);
  }
});

router.get("/geree", tokenShalgakh, async (req, res, next) => {
  try {
    const body = req.query;
    if (!!body?.query) body.query = JSON.parse(body.query);
    if (!!body?.order) body.order = JSON.parse(body.order);

    const result = await khuudaslalt(Geree(req.body.tukhainBaaziinKholbolt), body);

    // Calculate uldegdel for each returned geree based on ledger
    if (result.jagsaalt && result.jagsaalt.length > 0) {
      const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud")(req.body.tukhainBaaziinKholbolt);
      const gereeIds = result.jagsaalt.map(g => String(g._id));

      const ledgerStats = await GuilgeeAvlaguud.aggregate([
        { $match: { gereeniiId: { $in: gereeIds } } },
        {
          $group: {
            _id: "$gereeniiId",
            totalBalance: { $sum: "$dun" },
          }
        }
      ]);

      const balanceMap = {};
      ledgerStats.forEach(s => {
        balanceMap[String(s._id)] = s.totalBalance || 0;
      });

      result.jagsaalt = result.jagsaalt.map(g => {
        const gObj = g.toObject ? g.toObject() : g;
        gObj.uldegdel = balanceMap[String(g._id)] || 0;
        return gObj;
      });
    }

    res.send(result);
  } catch (e) { next(e); }
});
router.post("/geree", tokenShalgakh, gereeController.createGeree);
crud(
  router,
  "geree",
  Geree,
  UstsanBarimt
);


router
  .route("/zaaltOlnoorOruulya")
  .post(tokenShalgakh, gereeController.zaaltOlnoorOruulya);

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
