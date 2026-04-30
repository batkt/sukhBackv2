const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh_legacy?authSource=admin";
const TARGET_MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function sync() {
  try {
    console.log("🚀 [SYNC] Recovering missing resident profiles from Central Legacy DB...");
    
    // 1. Connect to Central Legacy DB
    const centralLegacyConn = await mongoose.createConnection(MONGODB_URI).asPromise();
    const allLegacyResidents = await centralLegacyConn.collection("orshinSuugch").find({}).toArray();
    console.log(`🔍 Found ${allLegacyResidents.length} total residents in central legacy.`);

    const tenantMappings = [
      { id: "697c70e81e782d8110d3b064", target: "nairamdalSukh" },
      { id: "697b0a797858c8959d2a2345", target: "kharKhorumSukh" }
    ];

    for (const tenant of tenantMappings) {
      console.log(`\n📂 Processing: ${tenant.target}`);
      const targetConn = await mongoose.createConnection(TARGET_MONGODB_URI.replace("/amarSukh", `/${tenant.target}`)).asPromise();
      const targetCollection = targetConn.collection("orshinSuugch");

      const tenantResidents = allLegacyResidents.filter(r => r.baiguullagiinId === tenant.id);
      console.log(`   Found ${tenantResidents.length} residents belonging to this tenant.`);

      let newCount = 0;
      for (const res of tenantResidents) {
        try {
          await targetCollection.updateOne(
            { _id: res._id },
            { $set: res },
            { upsert: true }
          );
          newCount++;
        } catch (e) {
          // Skip
        }
      }

      console.log(`✅ Synced ${newCount} profiles to ${tenant.target}.`);
      await targetConn.close();
    }

    await centralLegacyConn.close();
    console.log("\n🏁 [FINISHED] Resident sync complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  }
}

sync();
