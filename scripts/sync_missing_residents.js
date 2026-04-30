const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh_legacy?authSource=admin";
const TARGET_MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function sync() {
  try {
    console.log("🚀 [SYNC] Recovering missing resident profiles...");
    
    const tenantDbs = [
      { legacy: "nairamdalSukh_legacy", target: "nairamdalSukh" },
      { legacy: "kharKhorumSukh_legacy", target: "kharKhorumSukh" }
    ];

    for (const db of tenantDbs) {
      console.log(`\n📂 Processing: ${db.target}`);
      
      const legacyConn = await mongoose.createConnection(MONGODB_URI.replace("/amarSukh_legacy", `/${db.legacy}`)).asPromise();
      const targetConn = await mongoose.createConnection(TARGET_MONGODB_URI.replace("/amarSukh", `/${db.target}`)).asPromise();

      const legacyResidents = await legacyConn.collection("orshinSuugch").find({}).toArray();
      const targetCollection = targetConn.collection("orshinSuugch");

      console.log(`🔍 Found ${legacyResidents.length} residents in legacy.`);

      let newCount = 0;
      for (const res of legacyResidents) {
        try {
          // Use upsert to avoid duplicates but ensure all data is there
          await targetCollection.updateOne(
            { _id: res._id },
            { $set: res },
            { upsert: true }
          );
          newCount++;
        } catch (e) {
          // Skip errors
        }
      }

      console.log(`✅ Synced ${newCount} resident profiles to ${db.target}.`);
      await legacyConn.close();
      await targetConn.close();
    }

    console.log("\n🏁 [FINISHED] Resident sync complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  }
}

sync();
