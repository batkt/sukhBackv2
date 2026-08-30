const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const express = require("express");
const app = express();
const { db } = require("zevbackv2");
const { syncAllTenantIndexes } = require("../utils/autoIndexer");

(async () => {
  try {
    console.log("🛠️ Connecting to MongoDB...");
    const MONGODB_URI =
      process.env.MONGODB_URI ||
      "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

    await db.kholboltUusgey(app, MONGODB_URI);

    // Wait 3 seconds for tenant connections to establish
    console.log("⏳ Waiting for tenant connections to load...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await syncAllTenantIndexes();
    console.log("🎉 All indexes created successfully! Exiting.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Indexing error:", err);
    process.exit(1);
  }
})();
