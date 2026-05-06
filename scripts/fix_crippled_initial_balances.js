const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI_BASE = "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

const DRY_RUN = process.argv.includes("--dry-run");

async function fix() {
  try {
    if (DRY_RUN) {
      console.log("🔍 [DRY RUN] Simulating repair of crippled initial balances...");
    } else {
      console.log("🚀 [FIX] Repairing crippled initial balances (tulukhDun: 0)...");
    }
    
    const masterConn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", "amarSukh")).asPromise();
    const Baiguullaga = masterConn.model("baiguullaga", new mongoose.Schema({}, { strict: false }), "baiguullaga");
    const orgs = await Baiguullaga.find({}).lean();
    
    console.log(`Found ${orgs.length} organizations to check.`);

    for (const org of orgs) {
      if (!org.dotoodNer) continue;
      const dbName = `${org.dotoodNer}Sukh`;
      
      let conn;
      try {
        conn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", dbName)).asPromise();
      } catch (connErr) {
        // Skip silent error for missing dbs unless it's an actual auth/conn error
        if (!connErr.message.includes("does not exist")) {
           // console.error(`   ❌ Connection error for ${dbName}: ${connErr.message}`);
        }
        continue;
      }

      const collection = conn.collection("guilgeeavlaguuds");

      const query = {
        $and: [
          {
            $or: [
              { zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" } },
              { ekhniiUldegdelEsekh: true }
            ]
          },
          { turul: "avlaga" },
          { 
            $or: [
              { tulukhDun: 0 },
              { tulukhDun: { $exists: false } }
            ]
          },
          { 
            $or: [
              { dun: { $gt: 0 } },
              { undsenDun: { $gt: 0 } },
              { undsenUne: { $gt: 0 } }
            ]
          }
        ]
      };

      const crippledDocs = await collection.find(query).toArray();
      
      if (crippledDocs.length > 0) {
        console.log(`\n📂 Organization: ${org.ner} (${dbName})`);
        console.log(`   🔍 Found ${crippledDocs.length} crippled documents`);
        
        let fixedCount = 0;
        for (const doc of crippledDocs) {
          const targetAmount = Number(doc.dun || doc.undsenDun || doc.undsenUne || 0);
          if (targetAmount > 0) {
            if (DRY_RUN) {
              console.log(`      [DRY RUN] Would fix doc ${doc._id}: Setting tulukhDun and undsenDun to ${targetAmount} (Tailbar: ${doc.tailbar || 'N/A'})`);
            } else {
              console.log(`      🛠️ Fixing doc ${doc._id}: Setting tulukhDun and undsenDun to ${targetAmount}`);
              await collection.updateOne(
                { _id: doc._id },
                { 
                  $set: { 
                    undsenDun: targetAmount, 
                    tulukhDun: targetAmount,
                    fixNote: `Force synced to undsenDun (${targetAmount})`
                  } 
                }
              );
            }
            fixedCount++;
          }
        }
        if (!DRY_RUN) console.log(`   ✅ Fixed ${fixedCount} documents in ${dbName}`);
      }
      
      await conn.close();
    }

    await masterConn.close();
    console.log(`\n🏁 [FINISHED] ${DRY_RUN ? 'Dry run' : 'Repair'} complete!`);
    process.exit(0);
  } catch (err) {
    console.error("❌ CRITICAL ERROR:", err);
    process.exit(1);
  }
}

fix();
