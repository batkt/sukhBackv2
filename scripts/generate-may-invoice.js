/**
 * Generate May 2026 Invoice data for contract ГД-86613454.
 * 
 * Usage:
 *   1. Dry-run (calculate May charges without saving):
 *      node scripts/generate-may-invoice.js
 *   2. Actually generate and save invoice & ledger entries:
 *      node scripts/generate-may-invoice.js --fix
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  const gereeniiDugaar = "ГД-86613454";
  const fixMode = process.argv.includes('--fix');

  // We want to generate the invoice for May 2026.
  // Standard billing date in May. Let's use 2026-05-06.
  const billingDate = new Date('2026-05-06T12:00:00Z');

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
  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');
  const invoiceService = require('../services/invoiceService');

  let contractFound = false;

  for (const kh of db.kholboltuud) {
    const GereeModel = Geree(kh);
    const contract = await GereeModel.findOne({ gereeniiDugaar: new RegExp(gereeniiDugaar, 'i') });

    if (!contract) continue;

    contractFound = true;
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

    // Check if there is already an invoice for May 2026
    const NekhemjlekhModel = NekhemjlekhiinTuukh(kh);
    
    // Check if prior invoices exist (to determine isFirstInvoice)
    const priorInvoiceCount = await NekhemjlekhModel.countDocuments({
      gereeniiId: contract._id.toString()
    });
    const isFirstInvoice = priorInvoiceCount === 0;

    console.log(`\n🔍 Checking May 2026 billing cycle...`);
    // May cycle range
    const startOfMay = new Date('2026-05-01T00:00:00Z');
    const endOfMay = new Date('2026-05-31T23:59:59Z');
    const existingMayInvoice = await NekhemjlekhModel.findOne({
      gereeniiId: contract._id.toString(),
      ognoo: { $gte: startOfMay, $lte: endOfMay }
    }).lean();

    if (existingMayInvoice) {
      console.log(`  ⚠️ May invoice already exists:`);
      console.log(`    - ID:      ${existingMayInvoice._id}`);
      console.log(`    - Number:  ${existingMayInvoice.nekhemjlekhiinDugaar}`);
      console.log(`    - Amount:  ${existingMayInvoice.niitTulbur} ₮`);
      console.log(`    - Status:  ${existingMayInvoice.tuluv}`);
    } else {
      console.log(`  ✅ No May invoice exists for this contract.`);
    }

    console.log(`\n📐 Calculating charges for May 2026 (billingDate: ${billingDate.toISOString().split('T')[0]})...`);
    try {
      const { charges, total } = await invoiceService.calculateGereeCharges(kh, contract, {
        billingDate,
        isFirstInvoice
      });

      console.log(`  Charges List:`);
      charges.forEach((c, idx) => {
        console.log(`    [${idx}] ${c.ner.padEnd(30)} | Type: ${c.turul.padEnd(10)} | Amount: ${c.dun} ₮`);
      });
      console.log(`  Total calculated charges: ${total} ₮`);

      if (fixMode) {
        console.log(`\n🛠️ [FIX MODE] Generating May 2026 invoice...`);
        const result = await invoiceService.createInvoiceForContract(kh, contract._id.toString(), {
          billingDate,
          forceEmpty: true,
          override: true // allow generation even if one existed
        });

        console.log(`  Result:`, JSON.stringify(result, null, 2));
        if (result.success) {
          console.log(`  ✅ May invoice generated successfully! Invoice ID: ${result.invoiceId}`);
        } else {
          console.log(`  ❌ Failed to generate May invoice: ${result.message}`);
        }
      } else {
        console.log(`\n💡 To generate this invoice, run the script with --fix:`);
        console.log(`   node scripts/generate-may-invoice.js --fix`);
      }
    } catch (calcErr) {
      console.error("❌ Error calculating charges:", calcErr.message, calcErr.stack);
    }

    break; // Target contract found, stop scanning other orgs
  }

  if (!contractFound) {
    console.log(`❌ Target contract number ${gereeniiDugaar} not found in database.`);
  }

  process.exit(0);
}

main().catch(console.error);
