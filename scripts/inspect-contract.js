/**
 * Inspect contract and invoices/ledger entries for a specific contract number.
 * 
 * Usage:
 *   node scripts/inspect-contract.js <contract_number>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  const gereeniiDugaar = process.argv[2] || "ГД-86613454";

  console.log(`🔌 Connecting to database...`);
  try {
    await db.kholboltUusgey(null, MONGODB_URI);
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }

  console.log("⏳ Waiting 3 seconds for client connections to load...");
  await new Promise(r => setTimeout(r, 3000));

  const Geree = require('../models/geree');
  const GuilgeeAvlaguud = require('../models/guilgeeAvlaguud');
  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');

  let found = false;

  for (const kh of db.kholboltuud) {
    const GereeModel = Geree(kh);
    const contract = await GereeModel.findOne({ gereeniiDugaar: new RegExp(gereeniiDugaar, 'i') }).lean();

    if (!contract) continue;

    found = true;
    console.log(`\n======================================================================`);
    console.log(`🎯 FOUND CONTRACT IN ORG: ${kh.baiguullagiinId}`);
    console.log(`======================================================================`);
    console.log(`📋 Details:`);
    console.log(`  - ID:            ${contract._id}`);
    console.log(`  - Name:          ${contract.ovog || ""} ${contract.ner || ""}`);
    console.log(`  - Room (Toot):   ${contract.toot}`);
    console.log(`  - Contract No:   ${contract.gereeniiDugaar}`);
    console.log(`  - Status:        ${contract.tuluv}`);
    console.log(`  - ekhniiUldegdel: ${contract.ekhniiUldegdel} ₮`);
    console.log(`  - Created At:    ${contract.createdAt}`);

    const NekhemjlekhModel = NekhemjlekhiinTuukh(kh);
    const invoices = await NekhemjlekhModel.find({ gereeniiId: String(contract._id) }).sort({ ognoo: 1 }).lean();

    console.log(`\n🧾 Invoices count: ${invoices.length}`);
    invoices.forEach((inv, idx) => {
      console.log(`  [${idx}] ID: ${inv._id} | Date: ${inv.ognoo ? inv.ognoo.toISOString().split('T')[0] : 'N/A'} | Number: ${inv.nekhemjlekhiinDugaar} | Amount: ${inv.niitTulbur} | Balance: ${inv.uldegdel} | Status: ${inv.tuluv}`);
    });

    const GuilgeeModel = GuilgeeAvlaguud(kh);
    const ledger = await GuilgeeModel.find({ gereeniiId: String(contract._id) }).sort({ ognoo: 1, createdAt: 1 }).lean();

    console.log(`\n💵 Ledger Entries count: ${ledger.length}`);
    ledger.forEach((l, idx) => {
      const typeStr = l.dun > 0 ? "AVLAGA" : "TOLOLT";
      console.log(`  [${idx}] Date: ${l.ognoo ? l.ognoo.toISOString().split('T')[0] : 'N/A'} | Amount: ${l.dun} | Type: ${typeStr} | Desc: ${l.tailbar || l.zardliinNer} | InvID: ${l.nekhemjlekhId || 'null'}`);
    });
  }

  if (!found) {
    console.log(`❌ No contract matching "${gereeniiDugaar}" found in database.`);
  }

  process.exit(0);
}

main().catch(console.error);
