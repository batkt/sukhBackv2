const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh?authSource=admin";

async function check() {
  try {
    const conn = await mongoose.createConnection(MONGODB_URI).asPromise();
    // Search by gereeniiDugaar and amount 0.5 (since we suspect it's 0.5 in target)
    const doc = await conn.collection("guilgeeAvlaguud").findOne({
      gereeniiDugaar: "ГД-71808359",
      zardliinNer: /Эхний үлдэгдэл/i
    });

    if (doc) {
      console.log("✅ Found in Target:", JSON.stringify(doc, null, 2));
    } else {
      console.log("❌ Record not found in Target for ГД-71808359.");
    }

    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

check();
