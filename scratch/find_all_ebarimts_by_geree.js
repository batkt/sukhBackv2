require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');
  const EbarimtShine = require('../models/ebarimtShine');
  const Ebarimt = require('../models/ebarimt');

  const orgId = "697c70e81e782d8110d3b064";
  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);

  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  const contractNo = "ГД-71812301";

  // 1. Fetch all invoices for this contract
  console.log(`\nFetching all invoices for contract ${contractNo}...`);
  const invoices = await NekhemjlekhiinTuukh(kh).find({ gereeniiDugaar: contractNo }).sort({ createdAt: 1 }).lean();
  console.log(`Found ${invoices.length} invoices:`);
  
  const invoiceIds = invoices.map(i => i._id.toString());

  // 2. Fetch all EbarimtShine (new style) for this contract or invoice IDs
  console.log(`\nFetching EbarimtShine records...`);
  const newEbarimts = await EbarimtShine(kh).find({
    $or: [
      { gereeniiDugaar: contractNo },
      { nekhemjlekhiinId: { $in: invoiceIds } }
    ]
  }).lean();
  console.log(`Found ${newEbarimts.length} EbarimtShine records:`);
  for (const eb of newEbarimts) {
    console.log(`- ReceiptId (DDTD): ${eb.receiptId || eb.id}`);
    console.log(`  nekhemjlekhiinId: ${eb.nekhemjlekhiinId}`);
    console.log(`  totalAmount: ${eb.totalAmount}`);
    console.log(`  lottery: ${eb.lottery}`);
    console.log(`  date: ${eb.date}`);
  }

  // 3. Fetch all Ebarimt (old style) for this contract or invoice IDs
  console.log(`\nFetching Ebarimt (old) records...`);
  const oldEbarimts = await Ebarimt(kh).find({
    $or: [
      { gereeniiDugaar: contractNo },
      { nekhemjlekhiinId: { $in: invoiceIds } }
    ]
  }).lean();
  console.log(`Found ${oldEbarimts.length} Ebarimt (old) records:`);
  for (const eb of oldEbarimts) {
    console.log(`- BillId (DDTD): ${eb.billId || eb.id}`);
    console.log(`  nekhemjlekhiinId: ${eb.nekhemjlekhiinId}`);
    console.log(`  amount: ${eb.amount}`);
    console.log(`  lottery: ${eb.lottery}`);
  }

  // 4. Match invoice by invoice to see if any are missing
  console.log(`\n=== Invoice to E-Barimt Matching Status ===`);
  for (const inv of invoices) {
    const matchedNew = newEbarimts.find(e => e.nekhemjlekhiinId === inv._id.toString());
    const matchedOld = oldEbarimts.find(e => e.nekhemjlekhiinId === inv._id.toString());
    const matched = matchedNew || matchedOld;
    
    console.log(`- [${inv.nekhemjlekhiinDugaar}] Amount: ${inv.niitTulbur} MNT | Status: ${inv.tuluv}`);
    if (matched) {
      console.log(`  ✅ Ebarimt: YES | DDTD: ${matched.receiptId || matched.billId || matched.id} | Lottery: ${matched.lottery}`);
    } else {
      console.log(`  ❌ Ebarimt: MISSING`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
