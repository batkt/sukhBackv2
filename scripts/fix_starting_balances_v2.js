const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI_BASE = "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

async function fix() {
  try {
    console.log("🚀 [FIX V2] Syncing Starting Balances from Legacy (gereeniiTulukhAvlaga)...");
    
    const tenantDbs = [
      { legacy: "nairamdalSukh_legacy", target: "nairamdalSukh" },
      { legacy: "kharKhorumSukh_legacy", target: "kharKhorumSukh" }
    ];

    for (const dbInfo of tenantDbs) {
      console.log(`\n📂 Processing: ${dbInfo.target}`);
      
      const legacyConn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", dbInfo.legacy)).asPromise();
      const targetConn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", dbInfo.target)).asPromise();

      // Find all records with "Эхний үлдэгдэл" in legacy collection gereeniiTulukhAvlaga
      const legacyRecords = await legacyConn.collection("gereeniiTulukhAvlaga").find({
        zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" }
      }).toArray();

      console.log(`🔍 Found ${legacyRecords.length} starting balance records in legacy [gereeniiTulukhAvlaga].`);

      let updateCount = 0;
      let matchCount = 0;
      let missingCount = 0;

      for (const leg of legacyRecords) {
        // Find matching record in target guilgeeAvlaguud by ID or by (GereeniiId + Description + Date)
        let targetRec = await targetConn.collection("guilgeeAvlaguud").findOne({ _id: leg._id });
        
        if (!targetRec) {
          // Try finding by GereeId + Description + Date if ID changed
          targetRec = await targetConn.collection("guilgeeAvlaguud").findOne({
            gereeniiId: leg.gereeniiId,
            zardliinNer: leg.zardliinNer,
            ognoo: leg.ognoo
          });
        }

        if (targetRec) {
          const legDun = Number(leg.undsenDun || leg.tulukhDun || 0);
          const tarDun = Number(targetRec.undsenDun || targetRec.tulukhDun || targetRec.dun || 0);

          if (Math.abs(legDun - tarDun) > 0.01) {
            console.log(`   ⚠️ Mismatch for ${leg.gereeniiDugaar || leg.gereeniiId}: Legacy=${legDun}, Target=${tarDun}`);
            
            await targetConn.collection("guilgeeAvlaguud").updateOne(
              { _id: targetRec._id },
              { 
                $set: { 
                  undsenDun: legDun,
                  tulukhDun: legDun,
                  dun: legDun,
                  updatedAt: new Date(),
                  fixNote: `Restored from legacy (${legDun})`
                } 
              }
            );
            updateCount++;
          } else {
            matchCount++;
          }
        } else {
          // If record is missing in target, maybe we should re-import it?
          // Let's just log for now.
          missingCount++;
        }
      }

      console.log(`✅ Finished ${dbInfo.target}: ${updateCount} updated, ${matchCount} correct, ${missingCount} missing in target.`);
      
      await legacyConn.close();
      await targetConn.close();
    }

    console.log("\n🏁 [FINISHED] Balance fix V2 complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  }
}

fix();
