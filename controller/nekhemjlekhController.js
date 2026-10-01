const asyncHandler = require("express-async-handler");
const invoiceService = require("../services/invoiceService");
const previewService = require("../services/invoicePreviewService");
const sendService = require("../services/invoiceSendService");
const zardalService = require("../services/invoiceZardalService");
const deletionService = require("../services/invoiceDeletionService");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

/**
 * Common helper to emit socket updates
 */
function emitUpdate(req, baiguullagiinId) {
  if (baiguullagiinId && req.app) {
    try {
      req.app.get("socketio").emit(`tulburUpdated:${baiguullagiinId}`, {});
    } catch (e) {}
  }
}

/**
 * Generate invoice from contract (geree)
 */
async function gereeNeesNekhemjlekhUusgekh(
  geree,
  baiguullaga,
  kholbolt,
  source = "manual",
  skipIfRecent = false,
) {
  try {
    const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);

    const today = new Date();
    
    // Determine the exact billing cycle bounds from cronSchedule
    const NekhemjlekhCron = require("../models/cronSchedule");
    let cronDay = 1; // Default to 1st of month
    try {
      const schedule = await NekhemjlekhCron(kholbolt).findOne({
        baiguullagiinId: geree.baiguullagiinId,
        $or: [
          { barilgiinId: geree.barilgiinId },
          { barilgiinId: null }
        ]
      }).sort({ barilgiinId: -1 }).lean();
      
      if (schedule && schedule.nekhemjlekhUusgekhOgnoo) {
        cronDay = schedule.nekhemjlekhUusgekhOgnoo;
      }
    } catch (err) {
      console.error("Error fetching cron schedule for cycle:", err);
    }

    const { calculateBillingCycleBounds } = require("../utils/dateUtils");
    const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, today);

    // 1. Check for duplicates if requested
    //
    // ── Эхний үлдэгдлийн импортыг давхардал гэж тооцохгүй ────────────────
    // Excel-ийн импорт нь гэрээ үүсгэх үед «эхний үлдэгдэл» нэхэмжлэх
    // үүсгэдэг бөгөөд түүний `ognoo` нь гэрээний огноо болдог. Циклийн
    // өдөр нь мөн гэрээний огноо тул тэр нэхэмжлэх ҮРГЭЛЖ дараагийн
    // циклийн цонхонд унадаг.
    //
    // Жишээ (ГД-53590892): гэрээ 09-07, Excel-ийн нэхэмжлэх `ognoo` 09-07.
    // 10-01-д cron гүйхэд цикл нь [09-07, 10-07) болж, тэр нэхэмжлэхийг
    // олж `alreadyExists` буцаана — улмаас сарын нэхэмжлэх ҮҮСЭХГҮЙ, SMS
    // ч явахгүй. «Гараар явуулж чадна, автоматаар болдоггүй» гэдэг шалтгаан.
    //
    // Тиймээс давхардал гэж тооцохдоо «эхний үлдэгдлээс БУСАД зардалтай»
    // нэхэмжлэхийг л хайна. Зардалгүй (`forceEmpty`) нэхэмжлэхийг мөн
    // давхардал гэж үзнэ — эс бөгөөс cron дахин гүйвэл хоёр дахь удаа
    // үүсгэнэ.
    if (source === "automataar" || skipIfRecent) {
      const existing = await NekhemjlekhModel.findOne({
        gereeniiId: geree._id.toString(),
        ognoo: { $gte: startOfCycle, $lte: endOfCycle },
        $or: [
          // Сарын бодит зардал агуулсан нэхэмжлэх
          { "medeelel.zardluud": { $elemMatch: { isEkhniiUldegdel: { $ne: true } } } },
          // Зардалгүй нэхэмжлэх
          { "medeelel.zardluud": { $size: 0 } },
          { "medeelel.zardluud": { $exists: false } },
        ],
      }).lean();

      if (existing) {
        return { success: true, alreadyExists: true, nekhemjlekh: existing };
      }
    }

    // 2. Create the invoice using the service
    const result = await invoiceService.createInvoiceForContract(
      kholbolt,
      geree._id,
      {
        billingDate: today,
        ajiltanNer: source === "automataar" ? "Систем" : undefined,
        forceEmpty: true,
      },
    );

    if (!result.success) {
      return { success: false, error: result.message };
    }

    const newInvoice = await NekhemjlekhModel.findById(result.invoiceId).lean();

    return {
      success: true,
      alreadyExists: false,
      nekhemjlekh: newInvoice,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const previewInvoice = asyncHandler(async (req, res) => {
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const gereeId = first(req.query.gereeId);
  const baiguullagiinId = first(req.query.baiguullagiinId);
  const barilgiinId = first(req.query.barilgiinId);
  const targetMonth = first(req.query.targetMonth);
  const targetYear = first(req.query.targetYear);

  const result = await previewService.previewInvoice(
    gereeId,
    baiguullagiinId,
    barilgiinId,
    { targetMonth, targetYear },
  );
  res.status(result.success ? 200 : 400).json(result);
});

const manualSendInvoice = asyncHandler(async (req, res) => {
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const baiguullagiinId = first(req.body.baiguullagiinId);
  const gereeId = first(req.body.gereeId);
  const gereeIds = req.body.gereeniiIds || req.body.gereeIds;
  const override = req.body.override;
  const targetMonth = first(req.body.targetMonth);
  const targetYear = first(req.body.targetYear);
  const onlyGarageOrStorage = req.body.onlyGarageOrStorage;
  const onlyGarage = req.body.onlyGarage;
  const onlyStorage = req.body.onlyStorage;

  const ids = Array.isArray(gereeIds) ? gereeIds : (gereeId ? [gereeId] : []);
  
  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: "gereeId or gereeIds is required" });
  }

  const result = await sendService.manualSendMassInvoices(baiguullagiinId, ids, override, {
    targetMonth, targetYear, onlyGarageOrStorage, onlyGarage, onlyStorage
  });
  emitUpdate(req, baiguullagiinId);
  res.status(result.success ? 200 : 400).json(result);
});

const manualSendMassInvoices = asyncHandler(async (req, res) => {
  const { baiguullagiinId, gereeIds, override, targetMonth, targetYear, onlyGarageOrStorage, onlyGarage, onlyStorage } = req.body;
  const result = await sendService.manualSendMassInvoices(baiguullagiinId, gereeIds, override, {
    targetMonth, targetYear, onlyGarageOrStorage, onlyGarage, onlyStorage
  });
  emitUpdate(req, baiguullagiinId);
  res.status(result.success ? 200 : 400).json(result);
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { invoiceId, baiguullagiinId } = req.body;
  const id = invoiceId || req.params.id;
  const result = await deletionService.deleteInvoice(id, baiguullagiinId);
  emitUpdate(req, baiguullagiinId);
  res.status(result.success ? 200 : 400).json(result);
});

const deleteInvoiceZardal = asyncHandler(async (req, res) => {
  const { invoiceId, zardalId, baiguullagiinId } = req.body;
  const result = await zardalService.deleteInvoiceZardal(invoiceId, zardalId, baiguullagiinId);
  emitUpdate(req, baiguullagiinId);
  res.status(result.success ? 200 : 400).json(result);
});

module.exports = {
  gereeNeesNekhemjlekhUusgekh,
  previewInvoice,
  manualSendInvoice,
  manualSendMassInvoices,
  deleteInvoice,
  deleteInvoiceZardal,
  // Add passthrough exports for other services as expected by smoke tests
  updateGereeAndNekhemjlekhFromZardluud:
    zardalService.updateGereeAndNekhemjlekhFromZardluud,
  recalculateGereeBalance: zardalService.recalculateGereeBalance,
};
