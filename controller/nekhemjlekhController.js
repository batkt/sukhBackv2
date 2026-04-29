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
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // 1. Check for duplicates if requested
    if (source === "automataar" || skipIfRecent) {
      const existing = await NekhemjlekhModel.findOne({
        gereeniiId: geree._id.toString(),
        ognoo: { $gte: startOfMonth, $lte: endOfMonth },
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
  const { gereeId, baiguullagiinId, barilgiinId, targetMonth, targetYear } = req.query;
  const result = await previewService.previewInvoice(gereeId, baiguullagiinId, barilgiinId, {
    targetMonth, targetYear
  });
  res.status(result.success ? 200 : 400).json(result);
});

const manualSendInvoice = asyncHandler(async (req, res) => {
  const { gereeId, gereeIds, baiguullagiinId, override, targetMonth, targetYear } = req.body;
  const ids = gereeIds || (gereeId ? [gereeId] : []);
  
  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: "gereeId or gereeIds is required" });
  }

  const result = await sendService.manualSendMassInvoices(baiguullagiinId, ids, override, {
    targetMonth, targetYear
  });
  emitUpdate(req, baiguullagiinId);
  res.status(result.success ? 200 : 400).json(result);
});

const manualSendMassInvoices = asyncHandler(async (req, res) => {
  const { baiguullagiinId, gereeIds, override, targetMonth, targetYear } = req.body;
  const result = await sendService.manualSendMassInvoices(baiguullagiinId, gereeIds, override, {
    targetMonth, targetYear
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
