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
    const contract = await GereeModel.findOne({ gereeniiDugaar: TARGET_GEREE });
    if (!contract) continue;

    console.log(`\n🏢 Found contract in Organization: ${kh.baiguullagiinId}`);
    
    // 1. Process Geree Document
    const contractChanges = [];
    const topFields = ['ekhniiUldegdel', 'ashiglaltiinZardal', 'umnukhZaalt', 'suuliinZaalt', 'zaaltTog', 'zaaltUs'];
    topFields.forEach(field => {
      if (contract[field] !== undefined && contract[field] !== null) {
        const original = contract[field];
        const fixed = convertToNumber(original);
        if (original !== fixed) {
          contractChanges.push(`    - geree.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
          contract[field] = fixed;
        }
      }
    });

    if (contract.zardluud && Array.isArray(contract.zardluud)) {
      contract.zardluud.forEach((z, idx) => {
        fixZardalItem(z, `zardluud[${idx}] (${z.ner})`, contractChanges);
      });
    }

    if (contractChanges.length > 0) {
      console.log(`\n  📄 Contract Geree Changes:`);
      contractChanges.forEach(c => console.log(c));
      totalChanges += contractChanges.length;

      if (isWrite) {
        contract.markModified('zardluud');
        await contract.save();
        console.log(`    ✅ Saved Geree contract document.`);
      }
    } else {
      console.log(`  📄 No changes needed in Geree contract document.`);
    }

    // 2. Process Invoices (nekhemjlekhiinTuukh)
    const invoices = await NekhemjlekhModel.find({ gereeniiId: String(contract._id) });
    console.log(`\n  🧾 Found ${invoices.length} invoices.`);
    
    for (const inv of invoices) {
      const invChanges = [];
      const topFields = ['niitTulbur', 'niitTulburOriginal', 'uldegdel', 'dugaalaltDugaar', 'tsahilgaanNekhemjlekh'];
      topFields.forEach(field => {
        if (inv[field] !== undefined && inv[field] !== null) {
          const original = inv[field];
          const fixed = convertToNumber(original);
          if (original !== fixed) {
            invChanges.push(`      - invoice.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
            inv[field] = fixed;
          }
        }
      });

      if (inv.toots && Array.isArray(inv.toots)) {
        inv.toots.forEach((t, idx) => {
          fixZardalItem(t, `toots[${idx}] (${t.ner})`, invChanges);
        });
      }

      if (inv.medeelel) {
        if (inv.medeelel.zardluud && Array.isArray(inv.medeelel.zardluud)) {
          inv.medeelel.zardluud.forEach((z, idx) => {
            fixZardalItem(z, `medeelel.zardluud[${idx}] (${z.ner})`, invChanges);
          });
        }
        if (inv.medeelel.guilgeenuud && Array.isArray(inv.medeelel.guilgeenuud)) {
          inv.medeelel.guilgeenuud.forEach((g, idx) => {
            fixGuilgeeItem(g, `medeelel.guilgeenuud[${idx}]`, invChanges);
          });
        }
      }

      if (invChanges.length > 0) {
        console.log(`    - Invoice ID: ${inv._id} (Ognoo: ${inv.ognoo ? inv.ognoo.toISOString().split('T')[0] : 'N/A'})`);
        invChanges.forEach(c => console.log(c));
        totalChanges += invChanges.length;

        if (isWrite) {
          inv.markModified('toots');
          inv.markModified('medeelel');
          await inv.save();
          console.log(`      ✅ Saved Invoice document.`);
        }
      }
    }

    // 3. Process Ledger Entries (guilgeeAvlaguud)
    const ledgerEntries = await GuilgeeModel.find({ gereeniiId: String(contract._id) });
    console.log(`\n  💵 Found ${ledgerEntries.length} ledger entries.`);
    
    for (const entry of ledgerEntries) {
      const ledgerChanges = [];
      const topFields = ['dun', 'undsenDun', 'tulukhDun', 'tulsunDun'];
      topFields.forEach(field => {
        if (entry[field] !== undefined && entry[field] !== null) {
          const original = entry[field];
          const fixed = convertToNumber(original);
          if (original !== fixed) {
            ledgerChanges.push(`      - ledger.${field}: "${original}" (${typeof original}) -> ${fixed} (${typeof fixed})`);
            entry[field] = fixed;
          }
        }
      });

      if (ledgerChanges.length > 0) {
        console.log(`    - Ledger Entry: ${entry._id} (Ognoo: ${entry.ognoo ? entry.ognoo.toISOString().split('T')[0] : 'N/A'}, Tailbar: ${entry.tailbar || entry.zardliinNer})`);
        ledgerChanges.forEach(c => console.log(c));
        totalChanges += ledgerChanges.length;

        if (isWrite) {
          await entry.save();
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
