/**
 * Standalone diagnostics and repair script for resident database issues.
 * 
 * Usage:
 *   1. Dry-run analysis:
 *      node scripts/diagnose-user.js
 *   2. Apply repairs to sync database:
 *      node scripts/diagnose-user.js --fix
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  const fixMode = process.argv.includes('--fix');

  console.log("🔌 Connecting to database...");
  try {
    await db.kholboltUusgey(null, MONGODB_URI);
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB using zevbackv2:", err.message);
    process.exit(1);
  }

  console.log("⏳ Waiting 3 seconds for client connections to load...");
  await new Promise(r => setTimeout(r, 3000));

  const Geree = require('../models/geree');
  const GuilgeeAvlaguud = require('../models/guilgeeAvlaguud');
  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');

  let matchFound = false;

  for (const kh of db.kholboltuud) {
    const GereeModel = Geree(kh);
    
    // Search contract by phone, name, or contract number
    const contracts = await GereeModel.find({
      $or: [
        { ner: /Акэркэ/i },
        { ovog: /Акэркэ/i },
        { utas: /99099403/ },
        { gereeniiDugaar: /ГД-52382382/i }
      ]
    }).lean();

    if (contracts.length === 0) continue;

    matchFound = true;
    console.log(`\n======================================================================`);
    console.log(`🎯 FOUND MATCHING CONTRACT IN ORG: ${kh.baiguullagiinId}`);
    console.log(`======================================================================`);

    for (const contract of contracts) {
      console.log(`\n📋 Contract Details:`);
      console.log(`  - ID:            ${contract._id}`);
      console.log(`  - Name:          ${contract.ovog || ""} ${contract.ner || ""}`);
      console.log(`  - Room (Toot):   ${contract.toot}`);
      console.log(`  - Phone(s):      ${Array.isArray(contract.utas) ? contract.utas.join(', ') : contract.utas}`);
      console.log(`  - Contract No:   ${contract.gereeniiDugaar}`);
      console.log(`  - Status:        ${contract.tuluv}`);

      // 1. Fetch GuilgeeAvlaguud entries
      const GuilgeeModel = GuilgeeAvlaguud(kh);
      const entries = await GuilgeeModel.find({ gereeniiId: String(contract._id) })
        .sort({ ognoo: 1, createdAt: 1 })
        .lean();

      console.log(`\n💵 Ledger Entries (GuilgeeAvlaguud) count: ${entries.length}`);
      
      let sumTulbur = 0;
      let sumTulsun = 0;
      let looseCharges = 0;
      let invoicedCharges = 0;

      console.log("--------------------------------------------------------------------------------------------------");
      console.log("Index | Date       | Amount (dun) | Type     | Description                    | Invoice ID");
      console.log("--------------------------------------------------------------------------------------------------");
      entries.forEach((e, idx) => {
        const dateStr = e.ognoo ? new Date(e.ognoo).toISOString().split('T')[0] : 'N/A';
        const typeStr = e.dun > 0 ? "AVLAGA" : "TOLOLT";
        const amt = Math.abs(e.dun);
        
        if (e.dun > 0) {
          sumTulbur += e.dun;
          if (e.nekhemjlekhId) {
            invoicedCharges += e.dun;
          } else {
            looseCharges += e.dun;
          }
        } else {
          sumTulsun += amt;
        }

        console.log(
          `${String(idx).padEnd(5)} | ` +
          `${dateStr.padEnd(10)} | ` +
          `${String(e.dun.toFixed(2)).padStart(12)} | ` +
          `${typeStr.padEnd(8)} | ` +
          `${(e.tailbar || e.zardliinNer || "").substring(0, 30).padEnd(30)} | ` +
          `${e.nekhemjlekhId || 'null'}`
        );
      });
      console.log("--------------------------------------------------------------------------------------------------");

      console.log(`\nLedger Totals:`);
      console.log(`  - Total Positive Charges (totalTulbur):  ${sumTulbur.toLocaleString()} ₮`);
      console.log(`    * Invoiced Charges:                    ${invoicedCharges.toLocaleString()} ₮`);
      console.log(`    * Loose Charges (no invoiceId):        ${looseCharges.toLocaleString()} ₮`);
      console.log(`  - Total Payments (totalTulsun):          ${sumTulsun.toLocaleString()} ₮`);
      console.log(`  - Ledger Balance (Tulbur - Tulsun):       ${(sumTulbur - sumTulsun).toLocaleString()} ₮`);

      // 2. Fetch NekhemjlekhiinTuukh invoices
      const NekhemjlekhModel = NekhemjlekhiinTuukh(kh);
      const invoices = await NekhemjlekhModel.find({ gereeniiId: String(contract._id) })
        .sort({ ognoo: 1 })
        .lean();

      console.log(`\n🧾 Invoices (NekhemjlekhiinTuukh) count: ${invoices.length}`);
      console.log("----------------------------------------------------------------------------------");
      console.log("Invoice ID               | Date       | Amount (niitTulbur) | Balance (uldegdel) | Status");
      console.log("----------------------------------------------------------------------------------");
      invoices.forEach((inv) => {
        const dateStr = inv.ognoo ? new Date(inv.ognoo).toISOString().split('T')[0] : 'N/A';
        console.log(
          `${inv._id.toString().padEnd(24)} | ` +
          `${dateStr.padEnd(10)} | ` +
          `${String((inv.niitTulbur || 0).toFixed(2)).padStart(19)} | ` +
          `${String((inv.uldegdel || 0).toFixed(2)).padStart(18)} | ` +
          `${inv.tuluv}`
        );
      });
      console.log("----------------------------------------------------------------------------------");

      // 3. Simulate uldegdelBodyo behavior
      console.log(`\n🔄 Simulating /uldegdelBodyo calculation logic...`);
      let uldegdelBodyo_totalTulbur = 0;
      let uldegdelBodyo_totalTulsun = 0;
      const invoiceCharges = {};

      entries.forEach((it) => {
        const dun = Number(it.dun || 0);
        const invId = it.nekhemjlekhId ? String(it.nekhemjlekhId) : null;

        if (dun > 0) {
          uldegdelBodyo_totalTulbur += dun;
          if (invId) {
            if (!invoiceCharges[invId]) {
              invoiceCharges[invId] = { charges: 0, date: it.ognoo || it.createdAt, id: invId };
            }
            invoiceCharges[invId].charges += dun;
          }
        } else {
          uldegdelBodyo_totalTulsun += Math.abs(dun);
        }
      });

      const sortedInvoices = Object.values(invoiceCharges).sort((a, b) => new Date(a.date) - new Date(b.date));
      let availableFunds = uldegdelBodyo_totalTulsun;
      const calcInvoices = [];

      for (const inv of sortedInvoices) {
        const targetAmount = inv.charges;
        const isPaid = availableFunds + 0.1 >= targetAmount;
        const uld = isPaid ? 0 : Math.max(0, targetAmount - availableFunds);
        const status = (isPaid && targetAmount > 0) ? "Төлсөн" : "Төлөөгүй";

        calcInvoices.push({
          nekhemjlekhId: inv.id,
          niitTulbur: inv.charges,
          uldegdel: Number(uld.toFixed(2)),
          tuluv: status
        });

        if (isPaid) {
          availableFunds -= targetAmount;
        } else {
          availableFunds = 0;
        }
      }

      console.log(`  - API totalTulbur:   ${uldegdelBodyo_totalTulbur}`);
      console.log(`  - API totalTulsun:   ${uldegdelBodyo_totalTulsun}`);
      console.log(`  - API uldegdel:      ${uldegdelBodyo_totalTulbur - uldegdelBodyo_totalTulsun}`);
      console.log(`  - Distributed invoice balances:`);
      calcInvoices.forEach(ci => {
        console.log(`    * Invoice ${ci.nekhemjlekhId}: niitTulbur=${ci.niitTulbur}, uldegdel=${ci.uldegdel}, status=${ci.tuluv}`);
      });

      // 4. Inconsistency Analysis
      console.log(`\n🔍 Inconsistency analysis:`);
      let issuesFound = false;

      // Check if there are loose charges that should have been linked to invoices
      if (looseCharges > 0) {
        console.log(`  ⚠️ ISSUE: There are loose charges totaling ${looseCharges.toLocaleString()} ₮ with NO nekhemjlekhId.`);
        console.log(`     These entries bypass FIFO invoice distribution but still consume available payments.`);
        issuesFound = true;
      }

      // Check if the calculated summary uldegdel matches the database values
      const dbSumUldegdel = invoices.reduce((sum, inv) => sum + (inv.uldegdel || 0), 0);
      const ledgerUldegdel = sumTulbur - sumTulsun;
      if (Math.abs(dbSumUldegdel - ledgerUldegdel) > 1.0) {
        console.log(`  ⚠️ ISSUE: Sum of invoice uldegdel in DB (${dbSumUldegdel.toFixed(2)} ₮) does not match total ledger balance (${ledgerUldegdel.toFixed(2)} ₮).`);
        issuesFound = true;
      }

      // 5. Automatic Repair (if --fix is provided)
      if (issuesFound) {
        if (fixMode) {
          console.log(`\n🛠️ [REPAIR MODE] Executing repairs...`);

          // Helper to link loose charges to their corresponding monthly invoices
          // Usually, monthly charges generated at the same time correspond to the same invoice
          console.log(`  1. Re-syncing loose charges to invoices based on date proximity...`);
          
          for (const entry of entries) {
            if (entry.dun > 0 && !entry.nekhemjlekhId) {
              // Find invoice created around the same date
              const entryDate = new Date(entry.ognoo || entry.createdAt);
              const matchedInvoice = invoices.find(inv => {
                const invDate = new Date(inv.ognoo || inv.createdAt);
                // Within 5 days
                return Math.abs(invDate - entryDate) < 5 * 24 * 60 * 60 * 1000;
              });

              if (matchedInvoice) {
                console.log(`     Link: Linking entry "${entry.tailbar || entry.zardliinNer}" (${entry.dun}₮) to Invoice ${matchedInvoice._id}`);
                await GuilgeeModel.updateOne(
                  { _id: entry._id },
                  { $set: { nekhemjlekhId: matchedInvoice._id.toString() } }
                );
              }
            }
          }

          // Trigger authoritative ledger re-sync
          console.log(`  2. Triggering authoritative ledger re-sync (guilgeeService.syncInvoicesStatus)...`);
          const guilgeeService = require('../services/guilgeeService');
          await guilgeeService.syncInvoicesStatus(kh, String(contract._id));
          
          console.log(`  ✅ REPAIR COMPLETE! Please run without --fix to verify the new status.`);
        } else {
          console.log(`\n💡 Run with --fix option to automatically link loose charges and recalculate/sync invoice balances:`);
          console.log(`   node scripts/diagnose-user.js --fix`);
        }
      } else {
        console.log(`  ✅ No structural inconsistencies found in MongoDB for this user.`);
      }
    }
  }

  if (!matchFound) {
    console.log(`\n❌ No contracts matching "Акэркэ" or phone "99099403" or contract "ГД-52382382" found in database.`);
  }

  process.exit(0);
}

run().catch(console.error);
