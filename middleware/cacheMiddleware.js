/**
 * Redis Cache Middleware (DISABLED)
 */
const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    // Redis Caching is disabled to ensure data consistency during migration
    return next();
  };
};

/**
 * Middleware to clear cache for a specific organization (DISABLED)
 */
const clearCacheMiddleware = async (req, res, next) => {
  // Redis Caching is disabled
  return next();
};

module.exports = { cacheMiddleware, clearCacheMiddleware };
