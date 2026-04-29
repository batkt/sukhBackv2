const express = require("express");
const router = express.Router();
const Geree = require("../models/geree");
const ashiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const uilchilgeeniiZardluud = require("../models/uilchilgeeniiZardluud");
const LiftShalgaya = require("../models/liftShalgaya");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const { crud, tokenShalgakh, UstsanBarimt } = require("zevbackv2");
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
const cacheMiddleware = require("../middleware/cacheMiddleware");

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
router.use((req, res, next) => {
  const isAvlagaMutation =
    (req.method === "DELETE" ||
      req.method === "POST" ||
      req.method === "PUT" ||
      (req.method === "POST" && req.path?.includes("delete"))) &&
    req.path?.includes("guilgeeAvlaguud");
  if (!isAvlagaMutation) return next();
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const baiguullagiinId = req.query?.baiguullagiinId || req.body?.baiguullagiinId;
    if (baiguullagiinId && req.app) {
      try {
        req.app.get("socketio").emit(`tulburUpdated:${baiguullagiinId}`, {});
      } catch (e) {}
    }
    return originalJson(data);
  };
  next();
});
// Intercept manual receivable creation to ensure they get a nekhemjlekhId
router.post("/guilgeeAvlaguud", tokenShalgakh, async (req, res, next) => {
  const { gereeniiId, nekhemjlekhId, tukhainBaaziinKholbolt } = req.body;
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

router.get("/guilgeeAvlaguud", tokenShalgakh, cacheMiddleware(300), async (req, res, next) => {
  try {
     const body = req.query;
     if (!!body?.query) body.query = JSON.parse(body.query);
     if (!!body?.order) body.order = JSON.parse(body.order);
     khuudaslalt(GuilgeeAvlaguud(req.body.tukhainBaaziinKholbolt), body).then(res.send.bind(res)).catch(next);
  } catch (e) { next(e); }
});
// Main GuilgeeAvlaguud CRUD
crud(router, "guilgeeAvlaguud", GuilgeeAvlaguud, UstsanBarimt);


router.get("/geree", tokenShalgakh, cacheMiddleware(300), async (req, res, next) => {
  try {
     const body = req.query;
     if (!!body?.query) body.query = JSON.parse(body.query);
     if (!!body?.order) body.order = JSON.parse(body.order);
     khuudaslalt(Geree(req.body.tukhainBaaziinKholbolt), body).then(res.send.bind(res)).catch(next);
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
