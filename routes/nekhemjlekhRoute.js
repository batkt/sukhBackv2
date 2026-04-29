const express = require("express");
const router = express.Router();
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
  deleteInvoiceZardal,
  deleteInvoice,
} = require("../controller/nekhemjlekhController");

// Excel downloads
router.post("/nekhemjlekhiinTuukhExcelDownload", tokenShalgakh, downloadNekhemjlekhiinTuukhExcel);
router.post("/generateGenericExcel", tokenShalgakh, downloadExcelList);

// Core Invoice Operations
router.get("/preview", tokenShalgakh, previewInvoice);
router.post("/manualSend", tokenShalgakh, manualSendInvoice);
router.post("/manualSendMass", tokenShalgakh, manualSendMassInvoices);
router.post("/deleteInvoice", tokenShalgakh, deleteInvoice);
router.post("/nekhemjlekhiinTuukh/deleteZardal", tokenShalgakh, deleteInvoiceZardal);

// CRUD / Standard endpoints
router.delete("/nekhemjlekhiinTuukh/:id", tokenShalgakh, deleteInvoice);
crud(router, "nekhemjlekhiinTuukh", nekhemjlekhiinTuukh, UstsanBarimt);

module.exports = router;
