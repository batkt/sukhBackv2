require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');
const request = require('request');

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

  // The remaining two non-QPay receipts generated in error
  const targets = [
    {
      id: "045200701561001096530001010002363",
      date: "2026-06-12 16:35:33",
      amount: "125060.8",
      invoiceNo: "НЭХ-20260401-0014"
    },
    {
      id: "045200701561001096530000610002363",
      date: "2026-06-12 16:35:29",
      amount: "122705.6",
      invoiceNo: "НЭХ-20260204-0014"
    }
  ];

  const url = (process.env.EBARIMTSHINE_IP || "http://103.143.40.43:7080/") + "rest/receipt";

  for (const t of targets) {
    console.log(`\n----------------------------------------`);
    console.log(`Processing void for Receipt ID: ${t.id} (Amount: ${t.amount}, Invoice: ${t.invoiceNo})`);
    
    // Find local record
    const localRecord = await EbarimtShine(kh).findOne({
      $or: [{ id: t.id }, { receiptId: t.id }]
    });

    if (!localRecord) {
      console.warn(`⚠️ Local EbarimtShine record not found for receipt ID ${t.id} in database. Skipping local DB update.`);
    }

    console.log(`Sending HTTP DELETE to void receipt: ${t.id}...`);
    
    await new Promise((resolve) => {
      request.delete(
        url,
        { json: true, body: { id: t.id, date: t.date } },
        async (err, response, body) => {
          if (err) {
            console.error(`❌ HTTP request failed for ${t.id}:`, err.message);
            return resolve();
          }

          console.log(`HTTP Status Code: ${response?.statusCode}`);
          console.log(`Response Body:`, body);

          if (response?.statusCode === 200) {
            console.log(`✅ Void request successful for receipt: ${t.id}`);
            
            if (localRecord) {
              console.log("Updating local DB record...");
              localRecord.ustgasanOgnoo = new Date();
              localRecord.ustgasanShaltgaan = "Duplicate billing of non-QPay transaction (already paid manually)";
              localRecord.status = "RETURNED";
              localRecord.success = false;
              await localRecord.save();
              console.log("✅ Local DB record updated.");
            }
          } else {
            console.error(`❌ Failed to void receipt: ${t.id}. Status code: ${response?.statusCode}`);
          }
          resolve();
        }
      );
    });

    // Short pause
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\nVoid run finished.");
  process.exit(0);
}

main().catch(console.error);
