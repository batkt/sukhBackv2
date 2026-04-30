const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh?authSource=admin";

async function check() {
  try {
    const conn = await mongoose.createConnection(MONGODB_URI).asPromise();
    const doc = await conn.collection("guilgeeAvlaguud").findOne({ _id: "69e1ee3ac0851358c301b595" });

    if (doc) {
      console.log("✅ New Record:", JSON.stringify(doc, null, 2));
    } else {
      // Try searching by description and date
      const byDesc = await conn.collection("guilgeeAvlaguud").findOne({
        tailbar: "Эхний үлдэгдэл - 2026.04.17"
      });
      if (byDesc) {
        console.log("✅ Found by description in New:", JSON.stringify(byDesc, null, 2));
      } else {
        console.log("❌ Record not found in New database.");
      }
    }

    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

check();
