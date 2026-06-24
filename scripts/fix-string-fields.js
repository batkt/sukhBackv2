/**
 * Migration script to clean up string-valued numeric fields in the database.
 * Converts string numbers (like "44010" or "2000") to actual Numbers.
 * 
 * DRY RUN BY DEFAULT - ONLY TARGETS ГД-71841562
 * 
 * Usage:
 *   node scripts/fix-string-fields.js         (Dry run for ГД-71841562)
 *   node scripts/fix-string-fields.js --write (Write changes for ГД-71841562)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

// Target contract only
const TARGET_GEREE = "ГД-71841562";

// Check write flag
const isWrite = process.argv.includes('--write');

// Helper to safely convert value to Number if it's a string representing a number
function convertToNumber(val) {
  if (val === undefined || val === null) return val;
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num)) {
      return num;
    }
  }
  return val;
}

// Convert fields in zardluud/toots item
function fixZardalItem(item, pathPrefix, changes) {
  if (!item) return;
  const fields = ['tariff', 'tulukhDun', 'dun', 'undsenDun', 'zaaltDefaultDun', 'togtmolUtga', 'zaaltTariff', 'suuriKhuraamj'];
  fields.forEach(field => {
    if (item[field] !== undefined && item[field] !== null) {
      const original = item[field];
      const fixed = convertToNumber(original);
      if (original !== fixed) {
        changes.push(`      [CHANGE] ${pathPrefix}.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
        item[field] = fixed;
      }
    }
  });
  if (item.zaaltCalculation) {
    const zcFields = ['umnukhZaalt', 'suuliinZaalt', 'zaaltTog', 'zaaltUs', 'zoruu', 'tariff', 'defaultDun'];
    zcFields.forEach(f => {
      if (item.zaaltCalculation[f] !== undefined && item.zaaltCalculation[f] !== null) {
        const original = item.zaaltCalculation[f];
        const fixed = convertToNumber(original);
        if (original !== fixed) {
          changes.push(`      [CHANGE] ${pathPrefix}.zaaltCalculation.${f}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
          item.zaaltCalculation[f] = fixed;
        }
      }
    });
  }
}

// Convert fields in guilgeenuud item
function fixGuilgeeItem(item, pathPrefix, changes) {
  if (!item) return;
  const fields = ['tulukhDun', 'undsenDun', 'tulsunDun', 'dun'];
  fields.forEach(field => {
    if (item[field] !== undefined && item[field] !== null) {
      const original = item[field];
      const fixed = convertToNumber(original);
      if (original !== fixed) {
        changes.push(`      [CHANGE] ${pathPrefix}.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
        item[field] = fixed;
      }
    }
  });
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

  console.log(`\n==================================================`);
  console.log(`🔍 MODE: ${isWrite ? "⚠️ WRITE (Saving to Database)" : "🔍 DRY RUN (No changes will be saved)"}`);
  console.log(`🎯 TARGET CONTRACT: ${TARGET_GEREE}`);
  console.log(`==================================================\n`);

  let totalChanges = 0;

  for (const kh of db.kholboltuud) {
    const GereeModel = Geree(kh);
    const NekhemjlekhModel = NekhemjlekhiinTuukh(kh);
    const GuilgeeModel = GuilgeeAvlaguud(kh);

    // Find contract first
    const contract = await GereeModel.findOne({ gereeniiDugaar: TARGET_GEREE }).lean();
    if (!contract) continue;

    console.log(`\n🏢 Found contract in Organization: ${kh.baiguullagiinId}`);
    
    // 1. Process Geree Document
    const contractChanges = [];
    const updatedContract = JSON.parse(JSON.stringify(contract));
    const topFieldsGeree = ['ekhniiUldegdel', 'ashiglaltiinZardal', 'umnukhZaalt', 'suuliinZaalt', 'zaaltTog', 'zaaltUs'];
    
    topFieldsGeree.forEach(field => {
      if (updatedContract[field] !== undefined && updatedContract[field] !== null) {
        const original = updatedContract[field];
        const fixed = convertToNumber(original);
        if (original !== fixed) {
          contractChanges.push(`    - geree.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
          updatedContract[field] = fixed;
        }
      }
    });

    if (updatedContract.zardluud && Array.isArray(updatedContract.zardluud)) {
      updatedContract.zardluud.forEach((z, idx) => {
        fixZardalItem(z, `zardluud[${idx}] (${z.ner})`, contractChanges);
      });
    }

    if (contractChanges.length > 0) {
      console.log(`\n  📄 Contract Geree Changes:`);
      contractChanges.forEach(c => console.log(c));
      totalChanges += contractChanges.length;

      if (isWrite) {
        const setObj = {};
        topFieldsGeree.forEach(field => {
          if (updatedContract[field] !== undefined) {
            setObj[field] = updatedContract[field];
          }
        });
        if (updatedContract.zardluud) {
          setObj.zardluud = updatedContract.zardluud;
        }
        await GereeModel.updateOne({ _id: contract._id }, { $set: setObj });
        console.log(`    ✅ Saved Geree contract document.`);
      }
    } else {
      console.log(`  📄 No changes needed in Geree contract document.`);
    }

    // 2. Process Invoices (nekhemjlekhiinTuukh)
    const invoices = await NekhemjlekhModel.find({ gereeniiId: String(contract._id) }).lean();
    console.log(`\n  🧾 Found ${invoices.length} invoices.`);
    
    for (const inv of invoices) {
      const invChanges = [];
      const updatedInv = JSON.parse(JSON.stringify(inv));
      const topFieldsInvoice = ['niitTulbur', 'niitTulburOriginal', 'uldegdel', 'dugaalaltDugaar', 'tsahilgaanNekhemjlekh'];
      
      topFieldsInvoice.forEach(field => {
        if (updatedInv[field] !== undefined && updatedInv[field] !== null) {
          const original = updatedInv[field];
          const fixed = convertToNumber(original);
          if (original !== fixed) {
            invChanges.push(`      - invoice.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
            updatedInv[field] = fixed;
          }
        }
      });

      if (updatedInv.toots && Array.isArray(updatedInv.toots)) {
        updatedInv.toots.forEach((t, idx) => {
          fixZardalItem(t, `toots[${idx}] (${t.ner})`, invChanges);
        });
      }

      if (updatedInv.medeelel) {
        if (updatedInv.medeelel.zardluud && Array.isArray(updatedInv.medeelel.zardluud)) {
          updatedInv.medeelel.zardluud.forEach((z, idx) => {
            fixZardalItem(z, `medeelel.zardluud[${idx}] (${z.ner})`, invChanges);
          });
        }
        if (updatedInv.medeelel.guilgeenuud && Array.isArray(updatedInv.medeelel.guilgeenuud)) {
          updatedInv.medeelel.guilgeenuud.forEach((g, idx) => {
            fixGuilgeeItem(g, `medeelel.guilgeenuud[${idx}]`, invChanges);
          });
        }
      }

      if (invChanges.length > 0) {
        console.log(`    - Invoice ID: ${inv._id} (Ognoo: ${inv.ognoo ? new Date(inv.ognoo).toISOString().split('T')[0] : 'N/A'})`);
        invChanges.forEach(c => console.log(c));
        totalChanges += invChanges.length;

        if (isWrite) {
          const setObj = {};
          topFieldsInvoice.forEach(field => {
            if (updatedInv[field] !== undefined) {
              setObj[field] = updatedInv[field];
            }
          });
          if (updatedInv.toots) setObj.toots = updatedInv.toots;
          if (updatedInv.medeelel) setObj.medeelel = updatedInv.medeelel;

          await NekhemjlekhModel.updateOne({ _id: inv._id }, { $set: setObj });
          console.log(`      ✅ Saved Invoice document.`);
        }
      }
    }

    // 3. Process Ledger Entries (guilgeeAvlaguud)
    const ledgerEntries = await GuilgeeModel.find({ gereeniiId: String(contract._id) }).lean();
    console.log(`\n  💵 Found ${ledgerEntries.length} ledger entries.`);
    
    for (const entry of ledgerEntries) {
      const ledgerChanges = [];
      const updatedEntry = JSON.parse(JSON.stringify(entry));
      const topFieldsLedger = ['dun', 'undsenDun', 'tulukhDun', 'tulsunDun'];
      
      topFieldsLedger.forEach(field => {
        if (updatedEntry[field] !== undefined && updatedEntry[field] !== null) {
          const original = updatedEntry[field];
          const fixed = convertToNumber(original);
          if (original !== fixed) {
            ledgerChanges.push(`      - ledger.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
            updatedEntry[field] = fixed;
          }
        }
      });

      if (ledgerChanges.length > 0) {
        console.log(`    - Ledger Entry: ${entry._id} (Ognoo: ${entry.ognoo ? new Date(entry.ognoo).toISOString().split('T')[0] : 'N/A'}, Tailbar: ${entry.tailbar || entry.zardliinNer})`);
        ledgerChanges.forEach(c => console.log(c));
        totalChanges += ledgerChanges.length;

        if (isWrite) {
          const setObj = {};
          topFieldsLedger.forEach(field => {
            if (updatedEntry[field] !== undefined) {
              setObj[field] = updatedEntry[field];
            }
          });
          await GuilgeeModel.updateOne({ _id: entry._id }, { $set: setObj });
          console.log(`      ✅ Saved Ledger Entry document.`);
        }
      }
    }
  }

  console.log(`\n==================================================`);
  console.log(`📊 SUMMARY:`);
  console.log(`  - Total fields requiring type conversion: ${totalChanges}`);
  console.log(`  - Database Status: ${isWrite ? "UPDATED" : "NOT MODIFIED (Dry run mode)"}`);
  console.log(`==================================================\n`);

  process.exit(0);
}

main().catch(console.error);
