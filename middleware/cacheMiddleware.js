const { client } = require("../utils/redisClient");
const crypto = require("crypto");

/**
 * Redis Cache Middleware
 * @param {number} ttl - Time to live in seconds (default: 300 / 5 minutes)
 */
const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests (or specific POSTs used for data fetching)
    // We bypass caching if the user explicitly asks for fresh data via header
    if (req.method !== "GET" && req.method !== "POST") {
      return next();
    }

    if (req.headers["x-refresh-cache"] === "1" || req.headers["cache-control"] === "no-cache") {
      return next();
    }

    try {
      // Create a unique cache key based on URL, query params, and body
      const bodyString = req.body ? JSON.stringify(req.body) : "";
      const queryString = req.url;
      const baiguullagiinId = req.params.baiguullagiinId || req.query.baiguullagiinId || req.body.baiguullagiinId || "global";
      
      const rawKey = `${baiguullagiinId}:${queryString}:${bodyString}`;
      const hash = crypto.createHash("md5").update(rawKey).digest("hex");
      const cacheKey = `api_cache:${hash}`;

      // Check if data exists in Redis
      const cachedData = await client.get(cacheKey);

      if (cachedData) {
        // console.log(`[CACHE HIT] ${req.url}`);
        return res.json(JSON.parse(cachedData));
      }

      // If not in cache, capture the original res.json / res.send
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (data) => {
        // Store in Redis before sending
        // Only cache successful responses (200 OK)
        if (res.statusCode === 200) {
          client.setEx(cacheKey, ttl, JSON.stringify(data)).catch(err => {
            console.error("Redis Cache Set Error:", err);
          });
        }
        return originalJson(data);
      };

      res.send = (body) => {
        // If it's a string or buffer (likely from res.json eventually or direct send)
        if (res.statusCode === 200) {
          try {
             // We only want to cache if it's valid JSON
             JSON.parse(body);
             client.setEx(cacheKey, ttl, body).catch(err => {
                console.error("Redis Cache Set Error (send):", err);
             });
          } catch (e) {
             // Not JSON, don't cache (or handle differently)
          }
        }
        return originalSend(body);
      };

      next();
    } catch (err) {
      console.error("Cache Middleware Error:", err);
      // Fail silently to the database if Redis has an issue
      next();
    }
  };
};

module.exports = cacheMiddleware;
