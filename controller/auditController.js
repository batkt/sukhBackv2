const asyncHandler = require("express-async-handler");
const ZasakhTuukh = require("../models/zasakhTuukh");
const UstgakhTuukh = require("../models/ustgakhTuukh");

/**
 * Get edit history
 * Query params:
 * - modelName: Filter by model name (e.g., "ajiltan", "geree")
 * - documentId: Filter by document ID
 * - ajiltniiId: Filter by employee ID
 * - baiguullagiinId: Filter by organization ID
 * - ekhlekhOgnoo: Start date (ISO string)
 * - duusakhOgnoo: End date (ISO string)
 * - khuudasniiDugaar: Page number (default: 1)
 * - khuudasniiKhemjee: Page size (default: 50)
 */
exports.getZasakhTuukh = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const {
    modelName,
    documentId,
    ajiltniiId,
    baiguullagiinId,
    ekhlekhOgnoo,
    duusakhOgnoo,
    khuudasniiDugaar = 1,
    khuudasniiKhemjee = 50,
  } = req.query;

  const match = {};

  if (modelName) match.modelName = modelName;
  if (documentId) match.documentId = documentId.toString();
  if (ajiltniiId) match.ajiltniiId = ajiltniiId.toString();
  if (baiguullagiinId) match.baiguullagiinId = baiguullagiinId.toString();

  // Date range filter
  if (ekhlekhOgnoo || duusakhOgnoo) {
    const start = ekhlekhOgnoo
      ? new Date(ekhlekhOgnoo)
      : new Date("1970-01-01");
    const end = duusakhOgnoo
      ? new Date(duusakhOgnoo)
      : new Date("2999-12-31");
    match.ognoo = { $gte: start, $lte: end };
  }

  const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);

  const [list, niitMur] = await Promise.all([
    ZasakhTuukh(db.erunkhiiKholbolt)
      .find(match)
      .sort({ ognoo: -1 })
      .skip(skip)
      .limit(Number(khuudasniiKhemjee))
      .lean(),
    ZasakhTuukh(db.erunkhiiKholbolt).countDocuments(match),
  ]);

  const niitKhuudas = Math.ceil(niitMur / Number(khuudasniiKhemjee));

  res.json({
    success: true,
    data: list,
    pagination: {
      khuudasniiDugaar: Number(khuudasniiDugaar),
      khuudasniiKhemjee: Number(khuudasniiKhemjee),
      niitMur: niitMur,
      niitKhuudas: niitKhuudas,
    },
  });
});

/**
 * Get delete history
 * Query params: same as zasakhTuukh, plus:
 * - deletionType: "hard" or "soft"
 */
exports.getUstgakhTuukh = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const {
    modelName,
    documentId,
    ajiltniiId,
    baiguullagiinId,
    deletionType,
    ekhlekhOgnoo,
    duusakhOgnoo,
    khuudasniiDugaar = 1,
    khuudasniiKhemjee = 50,
  } = req.query;

  const match = {};

  if (modelName) match.modelName = modelName;
  if (documentId) match.documentId = documentId.toString();
  if (ajiltniiId) match.ajiltniiId = ajiltniiId.toString();
  if (baiguullagiinId) match.baiguullagiinId = baiguullagiinId.toString();
  if (deletionType) match.deletionType = deletionType;

  // Date range filter
  if (ekhlekhOgnoo || duusakhOgnoo) {
    const start = ekhlekhOgnoo
      ? new Date(ekhlekhOgnoo)
      : new Date("1970-01-01");
    const end = duusakhOgnoo
      ? new Date(duusakhOgnoo)
      : new Date("2999-12-31");
    match.ognoo = { $gte: start, $lte: end };
  }

  const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);

  const [list, niitMur] = await Promise.all([
    UstgakhTuukh(db.erunkhiiKholbolt)
      .find(match)
      .sort({ ognoo: -1 })
      .skip(skip)
      .limit(Number(khuudasniiKhemjee))
      .lean(),
    UstgakhTuukh(db.erunkhiiKholbolt).countDocuments(match),
  ]);

  const niitKhuudas = Math.ceil(niitMur / Number(khuudasniiKhemjee));

  res.json({
    success: true,
    data: list,
    pagination: {
      khuudasniiDugaar: Number(khuudasniiDugaar),
      khuudasniiKhemjee: Number(khuudasniiKhemjee),
      niitMur: niitMur,
      niitKhuudas: niitKhuudas,
    },
  });
});

/**
 * Get all audit history for a specific document
 */
exports.getDocumentHistory = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { modelName, documentId } = req.params;

  const [edits, deletes] = await Promise.all([
    ZasakhTuukh(db.erunkhiiKholbolt)
      .find({
        modelName: modelName,
        documentId: documentId.toString(),
      })
      .sort({ ognoo: -1 })
      .lean(),
    UstgakhTuukh(db.erunkhiiKholbolt)
      .find({
        modelName: modelName,
        documentId: documentId.toString(),
      })
      .sort({ ognoo: -1 })
      .lean(),
  ]);

  // Combine and sort by date
  const allHistory = [...edits, ...deletes].sort(
    (a, b) => new Date(b.ognoo) - new Date(a.ognoo)
  );

  res.json({
    success: true,
    data: allHistory,
    summary: {
      totalEdits: edits.length,
      totalDeletes: deletes.length,
      totalHistory: allHistory.length,
    },
  });
});

/**
 * Get all audit history by a specific employee
 */
exports.getAjiltanHistory = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { ajiltniiId } = req.params;
  const {
    ekhlekhOgnoo,
    duusakhOgnoo,
    khuudasniiDugaar = 1,
    khuudasniiKhemjee = 50,
  } = req.query;

  const match = { ajiltniiId: ajiltniiId.toString() };

  // Date range filter
  if (ekhlekhOgnoo || duusakhOgnoo) {
    const start = ekhlekhOgnoo
      ? new Date(ekhlekhOgnoo)
      : new Date("1970-01-01");
    const end = duusakhOgnoo
      ? new Date(duusakhOgnoo)
      : new Date("2999-12-31");
    match.ognoo = { $gte: start, $lte: end };
  }

  const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);

  const [edits, deletes] = await Promise.all([
    ZasakhTuukh(db.erunkhiiKholbolt)
      .find(match)
      .sort({ ognoo: -1 })
      .skip(skip)
      .limit(Number(khuudasniiKhemjee))
      .lean(),
    UstgakhTuukh(db.erunkhiiKholbolt)
      .find(match)
      .sort({ ognoo: -1 })
      .skip(skip)
      .limit(Number(khuudasniiKhemjee))
      .lean(),
  ]);

  const allHistory = [...edits, ...deletes].sort(
    (a, b) => new Date(b.ognoo) - new Date(a.ognoo)
  );

  res.json({
    success: true,
    data: allHistory,
    summary: {
      totalEdits: edits.length,
      totalDeletes: deletes.length,
    },
  });
});
