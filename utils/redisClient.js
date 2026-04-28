const redis = require("redis");

const pubClient = redis.createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();

async function connectRedis() {
  try {
    await pubClient.connect();
    await subClient.connect();
    console.log("✅ Redis clients connected for pub/sub");
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
  }
}

pubClient.on("error", (err) => console.error("Redis Pub Error:", err));
subClient.on("error", (err) => console.error("Redis Sub Error:", err));

module.exports = {
  pubClient,
  subClient,
  connectRedis
};
