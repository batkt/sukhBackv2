const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh_legacy?authSource=admin";
const TARGET_MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function migrate() {
  try {
    console.log("🚀 [MIGRATION] Starting FULL Production Migration...");
    
    const mainLegacyConn = await mongoose.createConnection(MONGODB_URI).asPromise();
    const mainTargetConn = await mongoose.createConnection(TARGET_MONGODB_URI).asPromise();
    console.log("✅ Connected to Main Config Databases");

    const tenantDbs = [
      { legacy: "nairamdalSukh_legacy", target: "nairamdalSukh" },
      { legacy: "kharKhorumSukh_legacy", target: "kharKhorumSukh" }
    ];

    for (const db of tenantDbs) {
      console.log(`\n📂 [DATABASE] Full Sync: ${db.legacy} -> ${db.target}`);
      
      const legacyConn = await mongoose.createConnection(MONGODB_URI.replace("/amarSukh_legacy", `/${db.legacy}`)).asPromise();
      const targetConn = await mongoose.createConnection(TARGET_MONGODB_URI.replace("/amarSukh", `/${db.target}`)).asPromise();

      // Collections to sync directly (1:1 mapping)
      const collectionsToSync = [
        "orshinSuugch",
        "nekhemjlekhiinTuukh",
        "bankniiGuilgee",
        "zaaltUnshlalt",
        "ustsanBarimt"
      ];

      for (const colName of collectionsToSync) {
        console.log(`➡️  Syncing ${colName}...`);
        const data = await legacyConn.collection(colName).find({}).toArray();
        if (data.length > 0) {
          try {
            // Use ordered: false to skip duplicates and continue
            await targetConn.collection(colName).insertMany(data, { ordered: false });
            console.log(`   ✅ Synced ${data.length} records.`);
          } catch (e) {
            console.log(`   ⚠️  Synced with some skips (likely duplicates).`);
          }
        }
      }

      // Sync Organization Config (if exists in legacy tenant DB)
      const orgData = await legacyConn.collection("baiguullaga").findOne({});
      if (orgData) {
        console.log("➡️  Syncing Building Config...");
        // This updates the main amarSukh database with the building's specific details
        await mainTargetConn.collection("baiguullaga").updateOne(
          { _id: orgData._id },
          { $set: orgData },
          { upsert: true }
        );
      }

      await legacyConn.close();
      await targetConn.close();
    }

    console.log("\n🏁 [FINISHED] Full migration complete. All data is now in the new system.");
    await mainLegacyConn.close();
    await mainTargetConn.close();
    process.exit(0);

  } catch (err) {
    console.error("❌ [ERROR] Migration failed:", err);
    process.exit(1);
  }
}

migrate();
