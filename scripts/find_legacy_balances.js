const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh_legacy?authSource=admin";

async function find() {
  try {
    const conn = await mongoose.createConnection(MONGODB_URI).asPromise();
    console.log("🔍 Searching for 'Эхний үлдэгдэл' in nairamdalSukh_legacy...");

    const collections = await conn.db.listCollections().toArray();
    for (const col of collections) {
      const name = col.name;
      // Search in fields that might contain the description
      const found = await conn.collection(name).find({
        $or: [
          { zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" } },
          { tailbar: { $regex: "Эхний үлдэгдэл", $options: "i" } },
          { ner: { $regex: "Эхний үлдэгдэл", $options: "i" } },
          { "medeelel.zardluud.ner": { $regex: "Эхний үлдэгдэл", $options: "i" } }
        ]
      }).limit(5).toArray();

      if (found.length > 0) {
        console.log(`\n✅ Found ${found.length} records in [${name}]:`);
        found.forEach(r => {
          console.log(`   - Amount: ${r.undsenDun || r.tulukhDun || r.niitTulbur || r.dun || "???"}, Desc: ${r.zardliinNer || r.tailbar || r.ner || "???"}`);
        });
      }
    }

    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

find();
