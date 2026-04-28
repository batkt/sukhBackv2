/**
 * Global request context middleware
 * Stores the current request so Mongoose hooks can access it
 */
let currentRequest = null;

function setCurrentRequest(req) {
  currentRequest = req;
}

function getCurrentRequest() {
  return currentRequest;
}

function clearCurrentRequest() {
  currentRequest = null;
}

/**
 * Express middleware to set request context
 */
function requestContextMiddleware(req, res, next) {
  setCurrentRequest(req);
  
  // Clear after response
  res.on('finish', () => {
    clearCurrentRequest();
  });
  
  next();
}

module.exports = {
  setCurrentRequest,
  getCurrentRequest,
  clearCurrentRequest,
  requestContextMiddleware,
};
