/**
 * Diagnostic script to search for the string "44010" in all database documents
 * related to the contract ГД-71841562.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

const TARGET_GEREE = "ГД-71841562";
const VALUE_TO_FIND = "44010";

function searchObj(obj, path, found) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === 'string') {
    if (obj === VALUE_TO_FIND) {
      found.push(`${path}: "${obj}" (string)`);
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        searchObj(obj[key], path ? `${path}.${key}` : key, found);
      }
    }
  }
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

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

  for (const kh of db.kholboltuud) {
    const GereeModel = Geree(kh);
    const NekhemjlekhModel = NekhemjlekhiinTuukh(kh);
    const GuilgeeModel = GuilgeeAvlaguud(kh);

    const contract = await GereeModel.findOne({ gereeniiDugaar: TARGET_GEREE });
    if (!contract) continue;

    console.log(`\n🏢 Searching in Organization: ${kh.baiguullagiinId}`);

    // Search Geree
    const contractRaw = await GereeModel.findById(contract._id).lean();
    const contractFound = [];
    searchObj(contractRaw, 'geree', contractFound);
    if (contractFound.length > 0) {
      console.log(`  📄 Found in Geree contract document:`);
      contractFound.forEach(f => console.log(`    ${f}`));
    }

    // Search Invoices
    const invoices = await NekhemjlekhModel.find({ gereeniiId: String(contract._id) }).lean();
    for (const inv of invoices) {
      const invFound = [];
      searchObj(inv, 'invoice', invFound);
      if (invFound.length > 0) {
        console.log(`  🧾 Found in Invoice ID: ${inv._id} (Ognoo: ${inv.ognoo ? inv.ognoo.toISOString().split('T')[0] : 'N/A'}):`);
        invFound.forEach(f => console.log(`    ${f}`));
      }
    }

    // Search Ledger
    const ledger = await GuilgeeModel.find({ gereeniiId: String(contract._id) }).lean();
    for (const entry of ledger) {
      const ledgerFound = [];
      searchObj(entry, 'ledger', ledgerFound);
      if (ledgerFound.length > 0) {
        console.log(`  💵 Found in Ledger Entry: ${entry._id}:`);
        ledgerFound.forEach(f => console.log(`    ${f}`));
      }
    }
  }

  console.log(`\n🔍 Search complete.`);
  process.exit(0);
}

main().catch(console.error);
