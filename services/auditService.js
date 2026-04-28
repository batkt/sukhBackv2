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

/**
 * Compare two objects and return array of changes
 */
function getChanges(oldDoc, newDoc, excludeFields = ["updatedAt", "__v", "_id"]) {
  const changes = [];
  const allKeys = new Set([...Object.keys(oldDoc || {}), ...Object.keys(newDoc || {})]);

  for (const key of allKeys) {
    if (excludeFields.includes(key)) continue;

    const oldValue = oldDoc?.[key];
    const newValue = newDoc?.[key];

    // Deep comparison for objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      // Structure for zassanBarimt.uurchlult
      changes.push({
        talbar: key,
        talbarNer: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim(),
        umnukhUtga: oldValue !== null && oldValue !== undefined ? String(oldValue) : "",
        shineUtga: newValue !== null && newValue !== undefined ? String(newValue) : "",
        utganiiTurul: typeof newValue,
      });
    }
  }

  return changes;
}

/**
 * Log edit/update operation
 */
async function logEdit(req, db, modelName, documentId, oldDoc, newDoc, additionalContext = {}) {
  try {
    const ajiltan = await getAjiltanFromRequest(req, db);
    if (!ajiltan) {
      // No user logged in - skip logging silently
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

    const classDugaar = newDoc?.gereeniiDugaar || 
                      newDoc?.nekhemjlekhiinDugaar || 
                      newDoc?.dugaar || 
                      newDoc?.register || 
                      "";
    
    const classOgnoo = newDoc?.ognoo || 
                     newDoc?.createdAt || 
                     new Date();

    const zassanBarimt = new ZassanBarimt(db.erunkhiiKholbolt)({
      baiguullagiinId: ajiltan.baiguullagiinId,
      barilgiinId: additionalContext.barilgiinId || null,
      classType: modelName,
      className: modelName.charAt(0).toUpperCase() + modelName.slice(1).replace(/([A-Z])/g, ' $1').trim(),
      classId: documentId?.toString(),
      classDugaar: classDugaar?.toString() || "",
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
    if (!ajiltan) {
      // No user logged in - skip logging silently
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

    const ustgakhTuukh = new UstgakhTuukh(db.erunkhiiKholbolt)({
      modelName: modelName,
      documentId: documentId?.toString(),
      collectionName: modelName,
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
};
