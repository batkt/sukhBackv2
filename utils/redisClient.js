const redis = require("redis");

const pubClient = redis.createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();
const client = pubClient.duplicate(); // Generic client for caching

async function connectRedis() {
  try {
    await pubClient.connect();
    await subClient.connect();
    await client.connect();
    console.log("✅ Redis clients connected (pub/sub/cache)");
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
  }
}

pubClient.on("error", (err) => console.error("Redis Pub Error:", err));
subClient.on("error", (err) => console.error("Redis Sub Error:", err));
client.on("error", (err) => console.error("Redis Cache Error:", err));

async function clearOrgCache(baiguullagiinId) {
  if (!baiguullagiinId) return;
  try {
    const pattern = `api_cache:${baiguullagiinId}:*`;
    let cursor = 0;
    let count = 0;
    
    do {
      const result = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100
      });
      
      cursor = result.cursor;
      const keys = result.keys;
      
      if (keys.length > 0) {
        await client.del(keys);
        count += keys.length;
      }
    } while (cursor !== 0);

    if (count > 0) {
      console.log(`[CACHE CLEAR] Cleared ${count} keys for org: ${baiguullagiinId}`);
    }
  } catch (err) {
    console.error("Redis Cache Clear Error:", err);
  }
}

module.exports = {
  pubClient,
  subClient,
  client,
  connectRedis,
  clearOrgCache
};
