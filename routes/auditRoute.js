const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  getZasakhTuukh,
  getUstgakhTuukh,
  getDocumentHistory,
  getAjiltanHistory,
} = require("../controller/auditController");

/**
 * GET /api/audit/zasakhTuukh - Get edit history
 */
router.get("/zasakhTuukh", tokenShalgakh, getZasakhTuukh);

/**
 * GET /api/audit/ustgakhTuukh - Get delete history
 */
router.get("/ustgakhTuukh", tokenShalgakh, getUstgakhTuukh);

/**
 * GET /api/audit/document/:modelName/:documentId - Get all audit history for a specific document
 */
router.get("/document/:modelName/:documentId", tokenShalgakh, getDocumentHistory);

/**
 * GET /api/audit/ajiltan/:ajiltniiId - Get all audit history by a specific employee
 */
router.get("/ajiltan/:ajiltniiId", tokenShalgakh, getAjiltanHistory);

module.exports = router;
