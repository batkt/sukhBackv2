require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
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
  const contractNo = "ГД-71823777";

  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);
  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  console.log(`\n--- Fetching NekhemjlekhiinTuukh for ${contractNo} ---`);
  const invoices = await NekhemjlekhiinTuukh(kh).find({ gereeniiDugaar: contractNo }).sort({ createdAt: 1 }).lean();
  console.log(`Found ${invoices.length} invoices:`);
  invoices.forEach(inv => {
    console.log(`- Invoice ID: ${inv._id} | No: ${inv.nekhemjlekhiinDugaar} | Amount: ${inv.niitTulbur} | Status: ${inv.tuluv} | QPay Invoice: ${inv.qpayInvoiceId || 'N/A'}`);
  });

  console.log(`\n--- Fetching EbarimtShine for ${contractNo} ---`);
  const ebarimts = await EbarimtShine(kh).find({ gereeniiDugaar: contractNo }).sort({ createdAt: 1 }).lean();
  console.log(`Found ${ebarimts.length} Ebarimts:`);
  ebarimts.forEach(eb => {
    console.log(`- Receipt ID: ${eb.receiptId || eb.id} | Amount: ${eb.totalAmount} | Invoice ID: ${eb.nekhemjlekhiinId} | Status: ${eb.status}`);
  });

  process.exit(0);
}

main().catch(console.error);
