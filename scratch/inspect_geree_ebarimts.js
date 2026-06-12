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
  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');

  const orgId = "697c70e81e782d8110d3b064";
  const contractNo = "ГД-71812301";

  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);
  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  console.log(`\nFetching EbarimtShine records for ${contractNo}...`);
  const ebarimts = await EbarimtShine(kh).find({ gereeniiDugaar: contractNo }).sort({ createdAt: -1 }).lean();
  console.log(`Found ${ebarimts.length} ebarimt(s) for this contract.`);

  for (const eb of ebarimts) {
    console.log(`\n========================================`);
    console.log(`Ebarimt ID: ${eb._id}`);
    console.log(`DDTD/ReceiptId: ${eb.receiptId || eb.id}`);
    console.log(`Lottery: ${eb.lottery}`);
    console.log(`Amount: ${eb.totalAmount}`);
    console.log(`Status: ${eb.status}`);
    console.log(`Created At: ${eb.createdAt}`);
    console.log(`Ustgasan Ognoo (Voided Date): ${eb.ustgasanOgnoo}`);

    if (eb.nekhemjlekhiinId) {
      const invoice = await NekhemjlekhiinTuukh(kh).findById(eb.nekhemjlekhiinId).lean();
      if (invoice) {
        console.log(`Corresponding Invoice:`);
        console.log(`  Invoice ID: ${invoice._id}`);
        console.log(`  Invoice No: ${invoice.nekhemjlekhiinDugaar}`);
        console.log(`  Tuluv (Status): ${invoice.tuluv}`);
        console.log(`  QPay Invoice ID: ${invoice.qpayInvoiceId || 'N/A'}`);
        console.log(`  QPay Payment ID: ${invoice.qpayPaymentId || 'N/A'}`);
        console.log(`  Created At: ${invoice.createdAt}`);
      } else {
        console.log(`Invoice with ID ${eb.nekhemjlekhiinId} NOT found.`);
      }
    } else {
      console.log(`No nekhemjlekhiinId in Ebarimt record.`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
