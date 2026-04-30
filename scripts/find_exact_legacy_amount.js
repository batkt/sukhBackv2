const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh_legacy?authSource=admin";

async function find() {
  try {
    const conn = await mongoose.createConnection(MONGODB_URI).asPromise();
    console.log("🔍 Searching for exact amount 96270.74 in ALL collections of nairamdalSukh_legacy...");

    const collections = await conn.db.listCollections().toArray();
    for (const col of collections) {
      const name = col.name;
      const found = await conn.collection(name).find({
        $or: [
          { undsenDun: 96270.74 },
          { tulukhDun: 96270.74 },
          { dun: 96270.74 },
          { niitTulbur: 96270.74 },
          { uldegdel: 96270.74 },
          { tulsunDun: 96270.74 }
        ]
      }).toArray();

      if (found.length > 0) {
        console.log(`\n✅ Found ${found.length} records in [${name}]:`);
        found.forEach(r => {
          console.log(JSON.stringify(r, null, 2));
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
