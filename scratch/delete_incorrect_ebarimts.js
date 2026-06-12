require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const EbarimtShine = require('../models/ebarimtShine');
  const orgId = "697c70e81e782d8110d3b064";

  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);
  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  // The three receipt IDs to delete completely from DB
  const receiptIds = [
    "045200701561001096530000410002363",
    "045200701561001096530001010002363",
    "045200701561001096530000610002363"
  ];

  console.log(`\nAttempting to delete ${receiptIds.length} EbarimtShine records...`);

  const deleteResult = await EbarimtShine(kh).deleteMany({
    $or: [
      { id: { $in: receiptIds } },
      { receiptId: { $in: receiptIds } }
    ]
  });

  console.log(`✅ Deleted count: ${deleteResult.deletedCount}`);
  console.log("Database cleanup complete!");
  process.exit(0);
}

main().catch(console.error);
