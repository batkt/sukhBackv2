const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh_legacy?authSource=admin";

async function inspect() {
  try {
    const conn = await mongoose.createConnection(MONGODB_URI).asPromise();
    const doc = await conn.collection("gereeniiTulukhAvlaga").findOne({
      zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" }
    });

    if (doc) {
      console.log("✅ Sample Record:", JSON.stringify(doc, null, 2));
    } else {
      console.log("❌ No record found.");
    }

    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

inspect();
