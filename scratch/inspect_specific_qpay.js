require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const { QuickQpayObject } = require("quickqpaypackvSukh");
  const orgId = "697c70e81e782d8110d3b064";

  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);
  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  console.log("\nFetching all QuickQpayObjects for contract ГД-71812301...");
  const qpays = await QuickQpayObject(kh).find({
    $or: [
      { zakhialgiinDugaar: /71812301/ },
      { "qpay.description": /71812301/ }
    ]
  }).lean();
  console.log(JSON.stringify(qpays, null, 2));

  process.exit(0);
}

main().catch(console.error);
