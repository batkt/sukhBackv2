const Ajiltan = require("../models/ajiltan");
const ZassanBarimt = require("../models/zassanBarimt");
const ZasakhTuukh = require("../models/zasakhTuukh"); // Keep for dupe check / transition
const UstgakhTuukh = require("../models/ustgakhTuukh");

/**
 * Get employee info from request token
 * Also handles orshinSuugch tokens
 */
async function getAjiltanFromRequest(req, db) {
  try {
    // First try to get from request body (set by tokenShalgakh middleware)
    if (req.body?.nevtersenAjiltniiToken) {
      const token = req.body.nevtersenAjiltniiToken;
      return {
        id: token.id?.toString(),
        ner: token.ner,
        nevtrekhNer: token.nevtrekhNer,
        baiguullagiinId: token.baiguullagiinId,
        isOrshinSuugch: false,
      };
    }

    // Try orshinSuugch token
    if (req.body?.nevtersenOrshinSuugchiinToken) {
      const token = req.body.nevtersenOrshinSuugchiinToken;
      return {
        id: token.id?.toString(),
        ner: token.ner,
        nevtrekhNer: token.nevtrekhNer || token.utas,
        baiguullagiinId: token.baiguullagiinId,
        isOrshinSuugch: true,
      };
    }

    // Fallback to authorization header
    if (req.headers.authorization) {
      const token = req.headers.authorization.replace("Bearer ", "");
      if (!token) {
        return null;
      }

      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.APP_SECRET || "secret");

      if (decoded && decoded.id) {
        // Try ajiltan first
        const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
          .findById(decoded.id)
          .select("_id ner nevtrekhNer baiguullagiinId")
          .lean();

        if (ajiltan) {
          return {
            id: ajiltan._id.toString(),
            ner: ajiltan.ner,
            nevtrekhNer: ajiltan.nevtrekhNer,
            baiguullagiinId: ajiltan.baiguullagiinId,
            isOrshinSuugch: false,
          };
        }

        // If not ajiltan, try orshinSuugch
        const OrshinSuugch = require("../models/orshinSuugch");
        const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
          .findById(decoded.id)
          .select("_id ner utas baiguullagiinId")
          .lean();

        if (orshinSuugch) {
          return {
            id: orshinSuugch._id.toString(),
            ner: orshinSuugch.ner,
            nevtrekhNer: orshinSuugch.utas,
            baiguullagiinId: orshinSuugch.baiguullagiinId,
            isOrshinSuugch: true,
          };
        }
      }
    }
  } catch (err) {
    // Token invalid or expired - that's okay, just return null
    console.warn("⚠️ [AUDIT] Error getting user from request:", err.message);
  }

  return null;
}

/**
 * Get IP address from request
 */
function getIpFromRequest(req) {
  return (
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.connection.remoteAddress ||
    ""
  );
}

/**
 * Get user agent from request
 */
function getUserAgentFromRequest(req) {
  if (req.headers["user-agent"]) {
    try {
      const useragent = require("express-useragent");
      return useragent.parse(req.headers["user-agent"]);
    } catch (err) {
      return { browser: req.headers["user-agent"] };
    }
  }
  return {};
}

/** Хэзээд ч засвар гэж тооцохгүй техникийн талбарууд (том жижиг үсэг хамаарахгүй) */
const UURCHLULT_BISH_TALBARUUD = new Set(["createdat", "updatedat", "__v", "_id"]);

const ISO_OGNOO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Утгыг харьцуулахад зориулж хэвийн болгоно: Date болон ISO огноон тэмдэгт
 * мөрийг нэг ISO хэлбэрт оруулна, null/undefined-ийг адил гэж үзнэ, дотоод
 * объектын createdAt/updatedAt/__v/_id-г хасна.
 */
function kharitsuulakhUtga(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    if (ISO_OGNOO_REGEX.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(kharitsuulakhUtga);
  if (typeof value === "object") {
    // ObjectId, Decimal128 зэрэг — toJSON/toString-оор харьцуулна
    if (value._bsontype) return String(value);
    const ur = {};
    for (const k of Object.keys(value).sort()) {
      if (UURCHLULT_BISH_TALBARUUD.has(k.toLowerCase())) continue;
      ur[k] = kharitsuulakhUtga(value[k]);
    }
    return ur;
  }
  return value;
}

/**
 * Compare two objects and return array of changes
 */
function getChanges(oldDoc, newDoc, excludeFields = ["updatedAt", "__v", "_id", "globalUldegdel", "paymentHistory", "tulsunOgnoo", "tuluv"]) {
  const changes = [];
  const allKeys = new Set([...Object.keys(oldDoc || {}), ...Object.keys(newDoc || {})]);
  const khasakh = new Set(
    (excludeFields || []).map((f) => String(f).toLowerCase()),
  );

  for (const key of allKeys) {
    const keyJijig = key.toLowerCase();
    if (khasakh.has(keyJijig) || UURCHLULT_BISH_TALBARUUD.has(keyJijig)) continue;

    const oldValue = oldDoc?.[key];
    const newValue = newDoc?.[key];

    // Огноо/null зэргийг хэвийн болгосны дараа ижил бол засвар биш
    if (
      JSON.stringify(kharitsuulakhUtga(oldValue)) !==
      JSON.stringify(kharitsuulakhUtga(newValue))
    ) {
      // Structure for zassanBarimt.uurchlult
      changes.push({
        talbar: key,
        talbarNer: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim(),
        umnukhUtga: oldValue !== null && oldValue !== undefined ? (typeof oldValue === "object" ? JSON.stringify(oldValue) : String(oldValue)) : "",
        shineUtga: newValue !== null && newValue !== undefined ? (typeof newValue === "object" ? JSON.stringify(newValue) : String(newValue)) : "",
        utganiiTurul: typeof newValue,
      });
    }
  }

  return changes;
}

/**
 * Баримтын хүнд ойлгомжтой нэрийг гаргана (UI-д дугаарын оронд харуулна):
 * овог + нэр, эсвэл ner/name/gereeniiDugaar/toot/mashiniiDugaar/dugaar.
 */
function classNerAvya(doc) {
  if (!doc || typeof doc !== "object") return "";
  const utga = (v) =>
    v !== null && v !== undefined && typeof v !== "object" ? String(v).trim() : "";
  const ovogNer = [utga(doc.ovog), utga(doc.ner)].filter(Boolean).join(" ");
  if (ovogNer) return ovogNer;
  for (const talbar of ["name", "gereeniiDugaar", "toot", "mashiniiDugaar", "dugaar"]) {
    const v = utga(doc[talbar]);
    if (v) return v;
  }
  return "";
}

/** Баримтын дугаар (logEdit-д) */
function classDugaarAvya(doc) {
  const v =
    doc?.gereeniiDugaar ||
    doc?.nekhemjlekhiinDugaar ||
    doc?.dugaar ||
    doc?.register ||
    "";
  return v?.toString() || "";
}

/** "gereeniiDugaar" → "Gereenii Dugaar" */
function classNameAvya(modelName) {
  return modelName.charAt(0).toUpperCase() + modelName.slice(1).replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Log edit/update operation
 */
async function logEdit(req, db, modelName, documentId, oldDoc, newDoc, additionalContext = {}) {
  try {
    const ajiltan = await getAjiltanFromRequest(req, db);
    if (!ajiltan || ajiltan.isOrshinSuugch) {
      // No user logged in or user is orshinSuugch - skip logging silently
      return;
    }

    const changes = getChanges(oldDoc, newDoc);
    if (changes.length === 0) {
      // No actual changes - skip logging silently
      return;
    }

    // --- DE-DUPLICATION CHECK ---
    // Transition period: check both if possible, but mainly look for recent logs
    try {
      const twoSecondsAgo = new Date(Date.now() - 2000);
      const duplicate = await ZassanBarimt(db.erunkhiiKholbolt).findOne({
        classType: modelName,
        classId: documentId?.toString(),
        ajiltniiId: ajiltan.id,
        createdAt: { $gte: twoSecondsAgo },
        // Compare changes array size
        uurchlult: { $size: changes.length }
      }).lean();

      if (duplicate) {
        return;
      }
    } catch (dupErr) {
      // Ignore errors in duplicate check, proceed to log
    }


    const documentCreatedAt = oldDoc?.createdAt || 
                              oldDoc?.createdDate || 
                              oldDoc?.ekhlekhOgnoo || 
                              oldDoc?.ognoo ||
                              newDoc?.createdAt ||
                              newDoc?.createdDate ||
                              null;

    let baiguullagiinRegister = null;
    if (ajiltan.baiguullagiinId) {
      try {
        const Baiguullaga = require("../models/baiguullaga");
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
          .findById(ajiltan.baiguullagiinId)
          .select("register")
          .lean();
        if (baiguullaga) {
          baiguullagiinRegister = baiguullaga.register;
        }
      } catch (err) {
        // Ignore errors
      }
    }

    const classDugaar = classDugaarAvya(newDoc);
    const classNer = classNerAvya(newDoc) || classNerAvya(oldDoc);

    const classOgnoo = newDoc?.ognoo || 
                     newDoc?.createdAt || 
                     new Date();

    const zassanBarimt = new ZassanBarimt(db.erunkhiiKholbolt)({
      baiguullagiinId: ajiltan.baiguullagiinId,
      barilgiinId: additionalContext.barilgiinId || null,
      classType: modelName,
      className: classNameAvya(modelName),
      classId: documentId?.toString(),
      classDugaar: classDugaar,
      classNer: classNer,
      classOgnoo: classOgnoo,
      ajiltniiId: ajiltan.id,
      ajiltniiNer: ajiltan.ner,
      uurchlult: changes,
    });

    await zassanBarimt.save();
  } catch (err) {
    // Don't throw errors - audit logging should not break the main operation
    console.error("❌ [AUDIT] Error logging edit:", err.message);
  }
}

/**
 * Log delete operation
 */
async function logDelete(
  req,
  db,
  modelName,
  documentId,
  deletedDoc,
  deletionType = "hard",
  reason = null,
  additionalContext = {}
) {
  try {
    const ajiltan = await getAjiltanFromRequest(req, db);
    if (!ajiltan || ajiltan.isOrshinSuugch) {
      // No user logged in or user is orshinSuugch - skip logging silently
      return;
    }

    // Get organization info if available
    let baiguullagiinRegister = null;
    if (ajiltan.baiguullagiinId) {
      try {
        const Baiguullaga = require("../models/baiguullaga");
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
          .findById(ajiltan.baiguullagiinId)
          .select("register")
          .lean();
        if (baiguullaga) {
          baiguullagiinRegister = baiguullaga.register;
        }
      } catch (err) {
        // Ignore errors
      }
    }

    // Extract baiguullagiinId and barilgiinId from deleted document if available
    const docBaiguullagiinId = deletedDoc?.baiguullagiinId || additionalContext.baiguullagiinId || ajiltan.baiguullagiinId;
    const docBarilgiinId = deletedDoc?.barilgiinId || additionalContext.barilgiinId;

    // Extract the original creation date from the deleted document
    // Try createdAt first (Mongoose timestamps), then createdDate, then any date field
    const documentCreatedAt = deletedDoc?.createdAt || 
                              deletedDoc?.createdDate || 
                              deletedDoc?.ekhlekhOgnoo || 
                              deletedDoc?.ognoo ||
                              null;

    // Давхардал: глобал аудит plugin (utils/auditPlugin.js) болон гараар
    // дуудсан logDelete хоёулаа нэг устгалыг бичиж болно. 10 секундэд ижил
    // баримт бүртгэгдсэн бол шинээр бичихгүй — шалтгаан нь дутуу бол нөхнө.
    try {
      const umnukh = await UstgakhTuukh(db.erunkhiiKholbolt).findOne({
        modelName: modelName,
        documentId: documentId?.toString(),
        ognoo: { $gte: new Date(Date.now() - 10000) },
      });
      if (umnukh) {
        if (reason && !umnukh.reason) {
          umnukh.reason = reason;
          await umnukh.save();
        }
        return;
      }
    } catch (_) {
      // Давхардал шалгаж чадаагүй бол бичсээр байна
    }

    const ustgakhTuukh = new UstgakhTuukh(db.erunkhiiKholbolt)({
      modelName: modelName,
      documentId: documentId?.toString(),
      collectionName: modelName,
      classNer: classNerAvya(deletedDoc),
      deletedData: deletedDoc,
      documentCreatedAt: documentCreatedAt,
      ajiltniiId: ajiltan.id,
      ajiltniiNer: ajiltan.ner,
      ajiltniiNevtrekhNer: ajiltan.nevtrekhNer,
      baiguullagiinId: docBaiguullagiinId,
      baiguullagiinRegister: baiguullagiinRegister,
      barilgiinId: docBarilgiinId,
      ip: getIpFromRequest(req),
      useragent: getUserAgentFromRequest(req),
      method: req.method || "DELETE",
      deletionType: deletionType,
      reason: reason,
      ognoo: new Date(),
    });

    await ustgakhTuukh.save();
  } catch (err) {
    // Don't throw errors - audit logging should not break the main operation
    console.error("❌ [AUDIT] Error logging delete:", err.message);
  }
}

module.exports = {
  logEdit,
  logDelete,
  getChanges,
  classNerAvya,
};
