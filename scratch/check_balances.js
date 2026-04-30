const mongoose = require("mongoose");

const LEGACY_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh_legacy?authSource=admin";
const TARGET_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh?authSource=admin";

async function check() {
  try {
    const legacyConn = await mongoose.createConnection(LEGACY_URI).asPromise();
    const targetConn = await mongoose.createConnection(TARGET_URI).asPromise();

    console.log("🔍 Searching for 96270.74 in legacy...");
    const legacyRecord = await legacyConn.collection("guilgeeAvlaguud").findOne({ undsenDun: 96270.74 });
    
    if (legacyRecord) {
      console.log("✅ Found in legacy:", JSON.stringify(legacyRecord, null, 2));
      
      console.log("\n🔍 Checking same record in NEW database...");
      const targetRecord = await targetConn.collection("guilgeeAvlaguud").findOne({ _id: legacyRecord._id });
      if (targetRecord) {
        console.log("⚠️ Found in NEW but with data:", JSON.stringify(targetRecord, null, 2));
      } else {
        console.log("❌ NOT found in NEW database with same ID.");
        
        // Search by description or date
        console.log("\n🔍 Searching by description 'Эхний үлдэгдэл' in NEW database...");
        const byDesc = await targetConn.collection("guilgeeAvlaguud").findOne({ 
          zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" },
          ognoo: legacyRecord.ognoo
        });
        if (byDesc) {
          console.log("Found record by description in NEW:", JSON.stringify(byDesc, null, 2));
        }
      }
    } else {
      console.log("❌ 96270.74 not found in legacy guilgeeAvlaguud.");
      
      // Maybe it's in another collection?
      console.log("\n🔍 Searching for any record with 96270.74 in legacy...");
      const collections = await legacyConn.db.listCollections().toArray();
      for (const col of collections) {
        const found = await legacyConn.collection(col.name).findOne({ 
          $or: [
            { undsenDun: 96270.74 },
            { niitTulbur: 96270.74 },
            { dun: 96270.74 }
          ]
        });
        if (found) {
          console.log(`✅ Found in collection [${col.name}]:`, JSON.stringify(found, null, 2));
        }
      }
    }

    await legacyConn.close();
    await targetConn.close();
  } catch (err) {
    console.error("Error:", err);
  }
}

check();
