const asyncHandler = require("express-async-handler");
const ZasakhTuukh = require("../models/zasakhTuukh");
const ZassanBarimt = require("../models/zassanBarimt");
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
    barilgiinId,
    ekhlekhOgnoo,
    duusakhOgnoo,
    khuudasniiDugaar = 1,
    khuudasniiKhemjee = 50,
  } = req.query;

  const matchLegacy = {};
  const matchNew = {};

  if (modelName) {
    matchLegacy.modelName = modelName;
    matchNew.classType = modelName;
  }
  if (documentId) {
    matchLegacy.documentId = documentId.toString();
    matchNew.classId = documentId.toString();
  }
  if (ajiltniiId) {
    matchLegacy.ajiltniiId = ajiltniiId.toString();
    matchNew.ajiltniiId = ajiltniiId.toString();
  }
  if (baiguullagiinId) {
    matchLegacy.baiguullagiinId = baiguullagiinId.toString();
    matchNew.baiguullagiinId = baiguullagiinId.toString();
  }
  if (barilgiinId) {
    matchLegacy.barilgiinId = barilgiinId.toString();
    matchNew.barilgiinId = barilgiinId.toString();
  }

  // Date range filter
  if (ekhlekhOgnoo || duusakhOgnoo) {
    const start = ekhlekhOgnoo ? new Date(ekhlekhOgnoo) : new Date("1970-01-01");
    const end = duusakhOgnoo ? new Date(duusakhOgnoo) : new Date("2999-12-31");
    matchLegacy.ognoo = { $gte: start, $lte: end };
    matchNew.createdAt = { $gte: start, $lte: end };
  }

  const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);

  // Fetch from both collections
  const [legacyList, newList, legacyCount, newCount] = await Promise.all([
    ZasakhTuukh(db.erunkhiiKholbolt).find(matchLegacy).sort({ ognoo: -1 }).lean(),
    ZassanBarimt(db.erunkhiiKholbolt).find(matchNew).sort({ createdAt: -1 }).lean(),
    ZasakhTuukh(db.erunkhiiKholbolt).countDocuments(matchLegacy),
    ZassanBarimt(db.erunkhiiKholbolt).countDocuments(matchNew),
  ]);

  // Combine and sort by date
  // For ZassanBarimt, we'll map 'createdAt' to 'ognoo' for consistent sorting if needed, 
  // but the frontend normalization handles multiple date fields.
  const combined = [...legacyList, ...newList].sort((a, b) => {
    const dateA = new Date(a.ognoo || a.createdAt);
    const dateB = new Date(b.ognoo || b.createdAt);
    return dateB - dateA;
  });

  const niitMur = legacyCount + newCount;
  const paginated = combined.slice(skip, skip + Number(khuudasniiKhemjee));
  const niitKhuudas = Math.ceil(niitMur / Number(khuudasniiKhemjee));

  res.json({
    success: true,
    data: paginated,
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
 */
exports.getUstgakhTuukh = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const {
    modelName,
    documentId,
    ajiltniiId,
    baiguullagiinId,
    barilgiinId,
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
  if (barilgiinId) match.barilgiinId = barilgiinId.toString();
  if (deletionType) match.deletionType = deletionType;

  // Date range filter
  if (ekhlekhOgnoo || duusakhOgnoo) {
    const start = ekhlekhOgnoo ? new Date(ekhlekhOgnoo) : new Date("1970-01-01");
    const end = duusakhOgnoo ? new Date(duusakhOgnoo) : new Date("2999-12-31");
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

  const [legacyEdits, newEdits, deletes] = await Promise.all([
    ZasakhTuukh(db.erunkhiiKholbolt)
      .find({
        modelName: modelName,
        documentId: documentId.toString(),
      })
      .sort({ ognoo: -1 })
      .lean(),
    ZassanBarimt(db.erunkhiiKholbolt)
      .find({
        classType: modelName,
        classId: documentId.toString(),
      })
      .sort({ createdAt: -1 })
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
  const allHistory = [...legacyEdits, ...newEdits, ...deletes].sort(
    (a, b) => new Date(b.ognoo || b.createdAt) - new Date(a.ognoo || a.createdAt)
  );

  res.json({
    success: true,
    data: allHistory,
    summary: {
      totalEdits: legacyEdits.length + newEdits.length,
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

  const matchLegacy = { ajiltniiId: ajiltniiId.toString() };
  const matchNew = { ajiltniiId: ajiltniiId.toString() };

  // Date range filter
  if (ekhlekhOgnoo || duusakhOgnoo) {
    const start = ekhlekhOgnoo ? new Date(ekhlekhOgnoo) : new Date("1970-01-01");
    const end = duusakhOgnoo ? new Date(duusakhOgnoo) : new Date("2999-12-31");
    matchLegacy.ognoo = { $gte: start, $lte: end };
    matchNew.createdAt = { $gte: start, $lte: end };
  }

  const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);

  const [legacyEdits, newEdits, deletes] = await Promise.all([
    ZasakhTuukh(db.erunkhiiKholbolt)
      .find(matchLegacy)
      .sort({ ognoo: -1 })
      .lean(),
    ZassanBarimt(db.erunkhiiKholbolt)
      .find(matchNew)
      .sort({ createdAt: -1 })
      .lean(),
    UstgakhTuukh(db.erunkhiiKholbolt)
      .find(matchLegacy)
      .sort({ ognoo: -1 })
      .lean(),
  ]);

  const allHistory = [...legacyEdits, ...newEdits, ...deletes].sort(
    (a, b) => new Date(b.ognoo || b.createdAt) - new Date(a.ognoo || a.createdAt)
  );

  const paginated = allHistory.slice(skip, skip + Number(khuudasniiKhemjee));

  res.json({
    success: true,
    data: paginated,
    summary: {
      totalEdits: legacyEdits.length + newEdits.length,
      totalDeletes: deletes.length,
    },
  });
});

