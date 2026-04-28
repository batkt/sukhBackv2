const { logEdit, logDelete } = require("../services/auditService");

/**
 * Middleware to track edits (PUT/PATCH operations)
 * Should be added before the final handler in routes
 */
async function auditEditMiddleware(req, res, next) {
  // Store original res.json to intercept the response
  const originalJson = res.json.bind(res);
  
  res.json = async function (data) {
    try {
      // Only log if it was a successful update (PUT/PATCH)
      if ((req.method === "PUT" || req.method === "PATCH") && req.params.id && data && !data.error) {
        const { db } = require("zevbackv2");
        
        // Determine model name from route
        const modelName = req.route?.path?.split("/")[1] || req.baseUrl?.split("/").pop() || "unknown";
        
        // Get the old document before update
        // We need to get it from the model - try common models
        let oldDoc = null;
        try {
          // Try to get old document - this is tricky since we're in middleware
          // The actual update might have already happened
          // We'll need to rely on the model's pre/post hooks instead
        } catch (err) {
          // Ignore
        }
        
        // If we have the updated document, we can try to get old one
        // But this is best handled in model hooks
      }
    } catch (err) {
      // Don't break the response
      console.error("❌ [AUDIT MIDDLEWARE] Error:", err.message);
    }
    
    return originalJson(data);
  };
  
  next();
}

/**
 * Middleware to track deletes (DELETE operations)
 */
async function auditDeleteMiddleware(req, res, next) {
  const { db } = require("zevbackv2");
  
  try {
    if (req.method === "DELETE" && req.params.id) {
      const modelName = req.route?.path?.split("/")[1] || req.baseUrl?.split("/").pop() || "unknown";
      
      // Try to get the document before deletion
      // This is model-specific, so we'll handle it in model hooks
      // But we can still log the delete attempt here
      
      // Store delete info in req for model hooks to use
      req._auditDelete = {
        modelName: modelName,
        documentId: req.params.id,
      };
    }
  } catch (err) {
    // Don't break the request
    console.error("❌ [AUDIT DELETE MIDDLEWARE] Error:", err.message);
  }
  
  next();
}

/**
 * Helper function to add audit logging to model operations
 * Call this after successful update/delete operations
 */
async function logModelEdit(req, db, modelName, documentId, oldDoc, newDoc, additionalContext = {}) {
  await logEdit(req, db, modelName, documentId, oldDoc, newDoc, additionalContext);
}

async function logModelDelete(req, db, modelName, documentId, deletedDoc, deletionType = "hard", reason = null, additionalContext = {}) {
  await logDelete(req, db, modelName, documentId, deletedDoc, deletionType, reason, additionalContext);
}

module.exports = {
  auditEditMiddleware,
  auditDeleteMiddleware,
  logModelEdit,
  logModelDelete,
};
