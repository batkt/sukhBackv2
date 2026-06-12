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

  const receiptId = "045200701561001096530000410002363";
  const receiptDate = "2026-06-12 16:35:27";

  console.log(`\nSearching local DB for receipt ID: ${receiptId}...`);
  const localRecord = await EbarimtShine(kh).findOne({
    $or: [
      { id: receiptId },
      { receiptId: receiptId }
    ]
  });

  if (!localRecord) {
    console.error("Local EbarimtShine record not found in database!");
    process.exit(1);
  }

  console.log("Found local record. Details:");
  console.log(`- Local ID: ${localRecord._id}`);
  console.log(`- Total Amount: ${localRecord.totalAmount}`);
  console.log(`- Created At: ${localRecord.createdAt}`);
  console.log(`- Invoice ID: ${localRecord.nekhemjlekhiinId}`);

  const url = (process.env.EBARIMTSHINE_IP || "http://103.143.40.43:7080/") + "rest/receipt";
  console.log(`\nSending HTTP DELETE to: ${url}`);
  console.log(`Payload: ${JSON.stringify({ id: receiptId, date: receiptDate })}`);

  request.delete(
    url,
    { json: true, body: { id: receiptId, date: receiptDate } },
    async (err, response, body) => {
      if (err) {
        console.error("❌ HTTP request failed:", err.message);
        process.exit(1);
      }

      console.log(`HTTP Status Code: ${response?.statusCode}`);
      console.log(`Response Body:`, body);

      // POS API return endpoint might return empty body, success status, or { success: true }
      // A successful void typically returns statusCode 200.
      if (response?.statusCode === 200) {
        console.log("\n✅ Government API void request successful!");
        console.log("Updating local DB record...");

        localRecord.ustgasanOgnoo = new Date();
        localRecord.ustgasanShaltgaan = "Duplicate billing of non-QPay transaction (already registered manually)";
        localRecord.status = "RETURNED";
        localRecord.success = false;

        await localRecord.save();
        console.log("✅ Local database updated successfully!");
        process.exit(0);
      } else {
        console.error(`❌ Failed to void with PosAPI. Status code: ${response?.statusCode}. Body:`, body);
        process.exit(1);
      }
    }
  );
}

main().catch(console.error);
