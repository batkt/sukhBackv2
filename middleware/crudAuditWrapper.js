/**
 * Wrapper for CRUD operations to add audit logging
 * This can be used to wrap any route handler that performs updates/deletes
 */

const { logEdit, logDelete } = require("../services/auditService");

/**
 * Wrap a route handler to automatically log edits
 * Usage: router.put("/model/:id", tokenShalgakh, auditEditWrapper("modelName", handler))
 */
function auditEditWrapper(modelName, handler) {
  return async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      
      // Get old document before update
      let oldDoc = null;
      if (req.params.id && (req.method === "PUT" || req.method === "PATCH")) {
        try {
          // Try to determine the model from modelName
          const Model = getModelByName(modelName, db);
          if (Model) {
            oldDoc = await Model.findById(req.params.id).lean();
          }
        } catch (err) {
          // Ignore - model might not be found or might use different connection
        }
      }
      
      // Call original handler
      const originalJson = res.json.bind(res);
      res.json = async function (data) {
        // Log edit after successful update
        if (oldDoc && req.params.id && data && !data.error) {
          try {
            const Model = getModelByName(modelName, db);
            if (Model) {
              const newDoc = await Model.findById(req.params.id).lean();
              if (newDoc) {
                await logEdit(
                  req,
                  db,
                  modelName,
                  req.params.id,
                  oldDoc,
                  newDoc,
                  {
                    baiguullagiinId: newDoc.baiguullagiinId || null,
                    barilgiinId: newDoc.barilgiinId || null,
                  }
                );
              }
            }
          } catch (auditErr) {
            console.error(`❌ [AUDIT] Error logging ${modelName} edit:`, auditErr.message);
          }
        }
        return originalJson(data);
      };
      
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Wrap a route handler to automatically log deletes
 */
function auditDeleteWrapper(modelName, handler) {
  return async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      
      // Get document before deletion
      let deletedDoc = null;
      if (req.params.id && req.method === "DELETE") {
        try {
          const Model = getModelByName(modelName, db);
          if (Model) {
            deletedDoc = await Model.findById(req.params.id).lean();
          }
        } catch (err) {
          // Ignore
        }
      }
      
      // Call original handler
      const originalJson = res.json.bind(res);
      res.json = async function (data) {
        // Log delete after successful deletion
        if (deletedDoc && req.params.id && data && !data.error) {
          try {
            await logDelete(
              req,
              db,
              modelName,
              req.params.id,
              deletedDoc,
              "hard",
              null,
              {
                baiguullagiinId: deletedDoc.baiguullagiinId || null,
                barilgiinId: deletedDoc.barilgiinId || null,
              }
            );
          } catch (auditErr) {
            console.error(`❌ [AUDIT] Error logging ${modelName} delete:`, auditErr.message);
          }
        }
        return originalJson(data);
      };
      
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Helper to get model by name
 */
function getModelByName(modelName, db) {
  try {
    const modelMap = {
      ajiltan: require("../models/ajiltan"),
      orshinSuugch: require("../models/orshinSuugch"),
      baiguullaga: require("../models/baiguullaga"),
      geree: require("../models/geree"),
      mashin: require("../models/mashin"),
      medegdel: require("../models/medegdel"),
      ebarimt: require("../models/ebarimt"),
      nekhemjlekhiinTuukh: require("../models/nekhemjlekhiinTuukh"),
      dans: require("../models/dans"),
      license: require("../models/license"),
      gereeniiZagvar: require("../models/gereeniiZagvar"),
      ashiglaltiinZardluud: require("../models/ashiglaltiinZardluud"),
      bankniiGuilgee: require("../models/bankniiGuilgee"),
      zogsool: require("../models/zogsool"),
    };
    
    const Model = modelMap[modelName];
    if (Model) {
      // Most models use erunkhiiKholbolt, but some might use different connections
      return Model(db.erunkhiiKholbolt);
    }
  } catch (err) {
    // Model not found or different connection pattern
  }
  return null;
}

module.exports = {
  auditEditWrapper,
  auditDeleteWrapper,
};
