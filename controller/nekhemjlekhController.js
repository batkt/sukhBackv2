const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const NekhemjlekhCron = require("../models/cronSchedule");
const OrshinSuugch = require("../models/orshinSuugch");
const MsgTuukh = require("../models/msgTuukh");
const Medegdel = require("../models/medegdel");
const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");
const request = require("request");
const { db } = require("zevbackv2");
const asyncHandler = require("express-async-handler");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const {
  normalizeTurul,
  normalizeZardluudTurul,
  deduplicateZardluud,
} = require("../utils/zardalUtils");
const {
  gereeNeesNekhemjlekhUusgekh,
} = require("../services/invoiceCreationService");
const { previewInvoice } = require("../services/invoicePreviewService");
const {
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices,
} = require("../services/invoiceSendService");
const {
  updateGereeAndNekhemjlekhFromZardluud,
  deleteInvoiceZardal: deleteInvoiceZardalLogic,
  recalculateGereeBalance: recalculateGereeBalanceLogic,
} = require("../services/invoiceZardalService");
const {
  deleteInvoice: deleteInvoiceLogic,
  deleteAllInvoicesForOrg: deleteAllInvoicesForOrgLogic,
} = require("../services/invoiceDeletionService");

const markInvoicesAsPaid = asyncHandler(async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      dun,
      orshinSuugchId,
      gereeniiId,
      nekhemjlekhiinIds,
      markEkhniiUldegdel = false,
      tailbar = null,
    } = req.body;

    if (!baiguullagiinId) {
      return res.status(400).json({
        success: false,
        error: "baiguullagiinId is required",
      });
    }

    if (!dun || dun <= 0) {
      return res.status(400).json({
        success: false,
        error: "dun (payment amount) is required and must be greater than 0",
      });
    }

    const {
      markInvoicesAsPaid: markInvoices,
    } = require("../services/invoicePaymentService");

    const result = await markInvoices({
      baiguullagiinId,
      dun,
      orshinSuugchId,
      gereeniiId,
      nekhemjlekhiinIds,
      markEkhniiUldegdel,
      tailbar,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const deleteInvoiceZardal = asyncHandler(async (req, res, next) => {
  const { invoiceId, zardalId, baiguullagiinId } = req.body;

  if (!invoiceId || !zardalId || !baiguullagiinId) {
    return res.status(400).json({
      success: false,
      error: "invoiceId, zardalId, and baiguullagiinId are required",
    });
  }

  const result = await deleteInvoiceZardalLogic(
    invoiceId,
    zardalId,
    baiguullagiinId,
  );

  if (result.statusCode && result.statusCode !== 200) {
    return res.status(result.statusCode).json({
      success: false,
      error: result.error,
      message: result.message,
    });
  }

  if (result.success && baiguullagiinId) {
    const io = req.app?.get("socketio");
    if (io) io.emit(`tulburUpdated:${baiguullagiinId}`, {});
  }

  res.json({
    success: result.success,
    message: result.message,
    newTotal: result.newTotal,
  });
});

const recalculateGereeBalance = asyncHandler(async (req, res) => {
  const { gereeId, baiguullagiinId } = req.body;

  if (!gereeId || !baiguullagiinId) {
    return res.status(400).json({
      success: false,
      message: "gereeId and baiguullagiinId are required",
    });
  }

  const result = await recalculateGereeBalanceLogic(gereeId, baiguullagiinId);

  if (result.statusCode && result.statusCode !== 200) {
    return res
      .status(result.statusCode)
      .json({ success: false, message: result.message });
  }

  res.json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const deleteInvoice = asyncHandler(async (req, res) => {
  const { invoiceId: bodyInvId, baiguullagiinId: bodyOrgId } = req.body ?? {};
  const { id: paramInvId } = req.params ?? {};
  const { baiguullagiinId: queryOrgId } = req.query ?? {};

  const invoiceId = bodyInvId || paramInvId;
  const baiguullagiinId = bodyOrgId || queryOrgId;

  if (!baiguullagiinId) {
    return res.status(400).json({
      success: false,
      error: "baiguullagiinId is required",
    });
  }
  const result = invoiceId
    ? await deleteInvoiceLogic(invoiceId, baiguullagiinId)
    : await deleteAllInvoicesForOrgLogic(baiguullagiinId);

  const statusCode = result.statusCode || (result.success ? 200 : 400);
  if (result.success && baiguullagiinId) {
    const io = req.app?.get("socketio");
    if (io) io.emit(`tulburUpdated:${baiguullagiinId}`, {});
  }
  res.status(statusCode).json(
    result.success
      ? {
          success: true,
          message: result.message,
          ...(result.deletedCount !== undefined && {
            deletedCount: result.deletedCount,
          }),
          ...(result.deletedTulsunAvlaga !== undefined && {
            deletedTulsunAvlaga: result.deletedTulsunAvlaga,
          }),
          ...(result.deletedTulukhAvlaga !== undefined && {
            deletedTulukhAvlaga: result.deletedTulukhAvlaga,
          }),
        }
      : { success: false, error: result.error },
  );
});

module.exports = {
  gereeNeesNekhemjlekhUusgekh,
  updateGereeAndNekhemjlekhFromZardluud,
  markInvoicesAsPaid,
  previewInvoice,
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices,
  deleteInvoiceZardal,
  recalculateGereeBalance,
  deleteInvoice,
};
