require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const Guilgee = require('../models/guilgee');
  const EbarimtShine = require('../models/ebarimtShine');
  const Ebarimt = require('../models/ebarimt');

  const orgId = "697c70e81e782d8110d3b064";
  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);

  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  // 1. Search for any Guilgee with amount around 122577.6 or number containing "113"
  console.log("\nSearching in guilgees...");
  const guilgeeMatches = await Guilgee(kh).find({
    $or: [
      { guilgeeniiDugaar: /113/ },
      { niitUne: 122577.6 },
      { "tulbur.une": 122577.6 }
    ]
  }).lean();

  console.log(`Found ${guilgeeMatches.length} matching transactions:`);
  for (const g of guilgeeMatches) {
    console.log(`- Guilgee ID: ${g._id}`);
    console.log(`  guilgeeniiDugaar: ${g.guilgeeniiDugaar}`);
    console.log(`  niitUne: ${g.niitUne}`);
    console.log(`  ebarimtAvsanEsekh: ${g.ebarimtAvsanEsekh}`);
    console.log(`  ognoo (Date): ${g.ognoo}`);
    console.log(`  tulbur: ${JSON.stringify(g.tulbur)}`);
    console.log(`  baraanuud count: ${g.baraanuud?.length}`);
  }

  // 2. Search for any Ebarimt / EbarimtShine matching
  console.log("\nSearching in ebarimts...");
  const e1 = await Ebarimt(kh).find({
    $or: [
      { guilgeeniiDugaar: /113/ },
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
      { guilgeeniiDugaar: /113/ },
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
