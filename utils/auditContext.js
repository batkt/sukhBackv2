/**
 * Request context for audit logging
 * Stores request info that can be accessed by Mongoose hooks
 */
const auditContext = new Map();

/**
 * Set audit context for current request
 */
function setAuditContext(reqId, context) {
  auditContext.set(reqId, context);
}

/**
 * Get audit context for current request
 */
function getAuditContext(reqId) {
  return auditContext.get(reqId);
}

/**
 * Clear audit context after request
 */
function clearAuditContext(reqId) {
  auditContext.delete(reqId);
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  setAuditContext,
  getAuditContext,
  clearAuditContext,
  generateRequestId,
};
