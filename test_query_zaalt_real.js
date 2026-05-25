require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.useDb("nairamdalSukh");
    
    const collections = await db.db.listCollections().toArray();
    
    console.log("=== SEARCHING FOR 599933.38 ===");
    for (const collInfo of collections) {
      const collName = collInfo.name;
      const coll = db.collection(collName);
      
      const match = await coll.findOne({
        $or: [
          { dun: 599933.38 },
          { undsenDun: 599933.38 },
          { tulukhDun: 599933.38 },
          { ekhniiUldegdel: 599933.38 },
          { niitTulbur: 599933.38 }
        ]
      });
      
      if (match) {
        console.log(`\nFound in collection: ${collName}`);
        console.log(JSON.stringify(match, null, 2));
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
