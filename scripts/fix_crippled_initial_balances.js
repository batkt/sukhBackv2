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
          
          const findGeree = async (id) => {
            if (!id) return null;
            // Try as is
            let res = await conn.collection("geree").findOne({ _id: id });
            if (res) return res;
            // Try as ObjectId
            try { 
              res = await conn.collection("geree").findOne({ _id: new mongoose.Types.ObjectId(id) });
              if (res) return res;
            } catch(e) {}
            // Try as String
            try {
              res = await conn.collection("geree").findOne({ _id: String(id) });
              if (res) return res;
            } catch(e) {}
            return null;
          };

          const findResident = async (rId) => {
             if (!rId) return null;
             let res = await masterConn.collection("orshinSuugch").findOne({ _id: rId });
             if (res) return res;
             try {
                res = await masterConn.collection("orshinSuugch").findOne({ _id: new mongoose.Types.ObjectId(rId) });
                if (res) return res;
             } catch(e) {}
             try {
                res = await masterConn.collection("orshinSuugch").findOne({ _id: String(rId) });
                if (res) return res;
             } catch(e) {}
             return null;
          };

          let gId = doc.gereeniiId;
          let geree = await findGeree(gId);
          
          if (!geree && doc.nekhemjlekhId) {
             // Try via invoice
             let nId = doc.nekhemjlekhId;
             let inv = await conn.collection("nekhemjlekhiinTuukh").findOne({ _id: nId });
             if (!inv) {
                try { inv = await conn.collection("nekhemjlekhiinTuukh").findOne({ _id: new mongoose.Types.ObjectId(nId) }); } catch(e) {}
             }
             if (inv && inv.gereeniiId) {
                gereeniiId = inv.gereeniiId;
                geree = await findGeree(inv.gereeniiId);
             }
          }

          if (geree) {
            residentName = geree.ner || geree.suhNer || "N/A";
            if (toot === "N/A") toot = geree.toot || "N/A";
            if (davkhar === "N/A") davkhar = geree.davkhar || "N/A";
            
            // If still N/A, try resident lookup
            if (residentName === "N/A" && geree.orshinSuugchiinId) {
               const resident = await findResident(geree.orshinSuugchiinId);
               if (resident) {
                  residentName = resident.ner;
                  if (toot === "N/A") toot = resident.toot;
                  if (davkhar === "N/A") davkhar = resident.davkhar;
               }
            }
          }

          console.log(`      [CRIPPLED] ID: ${doc._id} | Resident: ${residentName} | Toot: ${toot} | Floor: ${davkhar}`);
          if (residentName === "N/A") {
             console.log(`                 Debug Info: gereeniiId=${doc.gereeniiId}, nekhemjlekhId=${doc.nekhemjlekhId}, toot=${doc.toot}`);
          }
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
