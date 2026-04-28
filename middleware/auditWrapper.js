const { logEdit, logDelete } = require("../services/auditService");
const { setAuditContext, getAuditContext, clearAuditContext, generateRequestId } = require("../utils/auditContext");

/**
 * Wrapper middleware to add audit logging to any route
 * Usage: app.put('/model/:id', auditWrapper('modelName'), handler)
 */
function auditWrapper(modelName, getAdditionalContext = null) {
  return async (req, res, next) => {
    const reqId = generateRequestId();
    req._auditReqId = reqId;
    req._auditModelName = modelName;
    
    // Store request in context
    setAuditContext(reqId, { req });
    
    // For PUT/PATCH - capture old document
    if ((req.method === "PUT" || req.method === "PATCH") && req.params.id) {
      try {
        const { db } = require("zevbackv2");
        
        // Try to find the model and get old document
        // This is model-specific, so we'll handle it in the route handler
        req._auditOldDoc = null; // Will be set by route handler if needed
      } catch (err) {
        // Ignore
      }
    }
    
    // For DELETE - capture document before deletion
    if (req.method === "DELETE" && req.params.id) {
      try {
        const { db } = require("zevbackv2");
        req._auditDeletedDoc = null; // Will be set by route handler
      } catch (err) {
        // Ignore
      }
    }
    
    // Wrap res.json to log after successful operations
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Clean up context after response
      setTimeout(() => {
        clearAuditContext(reqId);
      }, 1000);
      
      return originalJson(data);
    };
    
    next();
  };
}

/**
 * Helper to log edit after successful update
 * Call this in your route handler after update
 */
async function logEditAfterUpdate(req, db, oldDoc, newDoc, additionalContext = {}) {
  if (!req._auditReqId || !req._auditModelName) return;
  
  try {
    const documentId = req.params.id || newDoc?._id?.toString();
    if (!documentId) return;
    
    await logEdit(
      req,
      db,
      req._auditModelName,
      documentId,
      oldDoc,
      newDoc,
      additionalContext
    );
  } catch (err) {
    console.error("❌ [AUDIT WRAPPER] Error logging edit:", err.message);
  }
}

/**
 * Helper to log delete after successful deletion
 * Call this in your route handler after delete
 */
async function logDeleteAfterDelete(req, db, deletedDoc, deletionType = "hard", reason = null, additionalContext = {}) {
  if (!req._auditReqId || !req._auditModelName) return;
  
  try {
    const documentId = req.params.id || deletedDoc?._id?.toString();
    if (!documentId) return;
    
    await logDelete(
      req,
      db,
      req._auditModelName,
      documentId,
      deletedDoc,
      deletionType,
      reason,
      additionalContext
    );
  } catch (err) {
    console.error("❌ [AUDIT WRAPPER] Error logging delete:", err.message);
  }
}

module.exports = {
  auditWrapper,
  logEditAfterUpdate,
  logDeleteAfterDelete,
};
