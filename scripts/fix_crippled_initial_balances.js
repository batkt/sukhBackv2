const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI_BASE = "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

const DRY_RUN = process.argv.includes("--dry-run");

async function fix() {
  try {
    const targetDb = "nairamdalSukh";
    console.log(`🚀 Focusing on database: ${targetDb}`);
    if (DRY_RUN) console.log("🔍 [DRY RUN MODE]");

    const masterConn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", "amarSukh")).asPromise();
    const conn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", targetDb)).asPromise();
    
    // We'll check both collection names to be safe
    const collections = ["guilgeeAvlaguud", "guilgeeavlaguuds"];
    
    for (const collName of collections) {
      const collection = conn.collection(collName);
      
      // Extremely broad query to find any initial balance
      const query = {
        $or: [
          { zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" } },
          { ekhniiUldegdelEsekh: true }
        ]
      };

      const docs = await collection.find(query).toArray();
      if (docs.length === 0) {
        console.log(`   No records found in collection: ${collName}`);
        continue;
      }

      console.log(`   Checking ${docs.length} records in ${collName}...`);

      let matchCount = 0;
      for (const doc of docs) {
        const targetAmount = Number(doc.dun || doc.undsenDun || doc.undsenUne || 0);
        const currentTulukh = Number(doc.tulukhDun || 0);
        const currentUndsen = Number(doc.undsenDun || 0);
        
        // Is it crippled?
        if (targetAmount > 0 && (currentTulukh === 0 || currentUndsen === 0)) {
          matchCount++;
          
          // Get resident info
          let residentName = "N/A";
          let toot = doc.toot || "N/A";
          let davkhar = doc.davkhar || "N/A";
          
          if (doc.gereeniiId) {
            const geree = await conn.collection("geree").findOne({ _id: doc.gereeniiId });
            if (geree) {
              const resident = await masterConn.collection("orshinSuugch").findOne({ _id: geree.orshinSuugchiinId });
              if (resident) {
                residentName = resident.ner;
                if (toot === "N/A") toot = resident.toot;
                if (davkhar === "N/A") davkhar = resident.davkhar;
              }
            }
          }

          console.log(`      [CRIPPLED] ID: ${doc._id} | Resident: ${residentName} | Toot: ${toot} | Floor: ${davkhar}`);
          console.log(`                 Current: { dun: ${doc.dun}, undsenDun: ${doc.undsenDun}, tulukhDun: ${doc.tulukhDun} }`);
          console.log(`                 Target: ${targetAmount}`);
          
          if (!DRY_RUN) {
            await collection.updateOne(
              { _id: doc._id },
              { 
                $set: { 
                  undsenDun: targetAmount, 
                  tulukhDun: targetAmount,
                  fixNote: `Force synced to ${targetAmount} (detailed-fix)`
                } 
              }
            );
            console.log(`                 ✅ Fixed.`);
          }
        }
      }
      
      if (matchCount === 0) {
        console.log(`   No crippled records found in ${collName}.`);
      } else {
        console.log(`   Finished ${collName}: ${matchCount} records handled.`);
      }
    }

    await conn.close();
    await masterConn.close();
    console.log("\n🏁 Done!");
    process.exit(0);
  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exit(1);
  }
}

fix();
