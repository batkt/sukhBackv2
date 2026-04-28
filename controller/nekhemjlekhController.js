const asyncHandler = require("express-async-handler");
const invoiceService = require("../services/invoiceService");
const previewService = require("../services/invoicePreviewService");
const sendService = require("../services/invoiceSendService");
const paymentService = require("../services/invoicePaymentService");
const zardalService = require("../services/invoiceZardalService");
const deletionService = require("../services/invoiceDeletionService");

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

const markInvoicesAsPaid = asyncHandler(async (req, res) => {
  const result = await paymentService.markInvoicesAsPaid(req.body);
  emitUpdate(req, req.body.baiguullagiinId);
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
  previewInvoice,
  manualSendInvoice,
  manualSendMassInvoices,
  markInvoicesAsPaid,
  deleteInvoice,
  deleteInvoiceZardal,
};
