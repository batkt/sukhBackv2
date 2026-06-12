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
  const BankniiGuilgee = require('../models/bankniiGuilgee');
  const EbarimtShine = require('../models/ebarimtShine');
  const Ebarimt = require('../models/ebarimt');

  const orgId = "697c70e81e782d8110d3b064";
  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);

  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  // 1. Search for any NekhemjlekhiinTuukh (Invoices) with amount around 122577.6 or matching target contract
  console.log("\nSearching in nekhemjlekhiinTuukh (Invoices)...");
  const invoices = await NekhemjlekhiinTuukh(kh).find({
    $or: [
      { gereeniiDugaar: /71812301/ },
      { niitTulbur: 122577.6 },
      { qpayInvoiceId: "d2393c74-4a77-43ba-ba79-a7cbbf90b027" }
    ]
  }).lean();

  console.log(`Found ${invoices.length} matching invoices:`);
  for (const inv of invoices) {
    console.log(`- Invoice ID: ${inv._id}`);
    console.log(`  nekhemjlekhiinDugaar: ${inv.nekhemjlekhiinDugaar}`);
    console.log(`  gereeniiDugaar: ${inv.gereeniiDugaar}`);
    console.log(`  niitTulbur: ${inv.niitTulbur}`);
    console.log(`  tuluv: ${inv.tuluv}`);
    console.log(`  qpayInvoiceId: ${inv.qpayInvoiceId}`);
    console.log(`  qpayPaymentId: ${inv.qpayPaymentId}`);
    console.log(`  tulsunOgnoo: ${inv.tulsunOgnoo}`);
    console.log(`  createdAt: ${inv.createdAt}`);
  }

  // 2. Search for any BankniiGuilgee with amount around 122577.6
  console.log("\nSearching in bankniiGuilgee (Bank Transactions)...");
  const bankGuilgees = await BankniiGuilgee(kh).find({
    $or: [
      { amount: 122577.6 },
      { description: /71812301/ }
    ]
  }).lean();

  console.log(`Found ${bankGuilgees.length} matching bank transactions:`);
  for (const bg of bankGuilgees) {
    console.log(`- Transaction ID: ${bg._id}`);
    console.log(`  tranDate: ${bg.tranDate}`);
    console.log(`  amount: ${bg.amount}`);
    console.log(`  description: ${bg.description}`);
    console.log(`  tranId: ${bg.tranId}`);
    console.log(`  record: ${bg.record}`);
    console.log(`  bank: ${bg.bank}`);
    console.log(`  ebarimtAvsanEsekh: ${bg.ebarimtAvsanEsekh}`);
    console.log(`  kholbosonGereeniiId: ${JSON.stringify(bg.kholbosonGereeniiId)}`);
  }

  // 3. Search for any Ebarimt / EbarimtShine matching
  console.log("\nSearching in ebarimts...");
  const e1 = await Ebarimt(kh).find({
    $or: [
      { amount: "122577.60" },
      { amount: 122577.6 }
    ]
  }).lean();
  console.log(`Found in ebarimt (old): ${e1.length}`);
  for (const eb of e1) {
    console.log(`- DDTD: ${eb.billId || eb.id}, Amount: ${eb.amount}, Lottery: ${eb.lottery}`);
  }

  console.log("\nSearching in ebarimtshines (new)...");
  const e2 = await EbarimtShine(kh).find({
    $or: [
      { totalAmount: 122577.6 }
    ]
  }).lean();
  console.log(`Found in ebarimtshine (new): ${e2.length}`);
  for (const eb of e2) {
    console.log(`- DDTD: ${eb.receiptId || eb.id}, TotalAmount: ${eb.totalAmount}, Lottery: ${eb.lottery}`);
  }

  process.exit(0);
}

main().catch(console.error);
