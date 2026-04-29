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
      // 1. Sanitize URL (Remove cache-busters like _t)
      let sanitizedUrl = req.originalUrl || req.url;
      try {
        const [path, query] = sanitizedUrl.split("?");
        if (query) {
          const params = new URLSearchParams(query);
          params.delete("_t");
          params.delete("t");
          params.delete("timestamp");
          const newQuery = params.toString();
          sanitizedUrl = newQuery ? `${path}?${newQuery}` : path;
        }
      } catch (e) {
        // Fallback simple regex if URL parsing fails
        sanitizedUrl = sanitizedUrl.replace(/([?&])(_t|t|timestamp)=[^&]+/g, "");
      }

      // 2. Sanitize Body (Remove circular objects and sensitive tokens)
      let sanitizedBody = "";
      if (req.body) {
        try {
          const { tukhainBaaziinKholbolt, erunkhiiKholbolt, nevtersenAjiltniiToken, ...rest } = req.body;
          // Also remove cache busters if they are in the body
          delete rest._t;
          delete rest.t;
          delete rest.timestamp;
          sanitizedBody = JSON.stringify(rest);
        } catch (e) {
          sanitizedBody = "complex-body-hash";
        }
      }
      
      const baiguullagiinId = req.params.baiguullagiinId || req.query.baiguullagiinId || req.body.baiguullagiinId || "global";
      
      const rawKey = `${baiguullagiinId}:${sanitizedUrl}:${sanitizedBody}`;
      const hash = crypto.createHash("md5").update(rawKey).digest("hex");
      const cacheKey = `api_cache:${hash}`;

      // Check if data exists in Redis
      const cachedData = await client.get(cacheKey);

      if (cachedData) {
        console.log(`[CACHE HIT] ${req.method} ${sanitizedUrl}`);
        return res.json(JSON.parse(cachedData));
      }

      console.log(`[CACHE MISS] ${req.method} ${sanitizedUrl}`);

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
