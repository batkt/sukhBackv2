/**
 * Fix Starting Balance for a Single User (Аримурат Акерке / toot 1504 / ГД-52382382)
 * 
 * Usage:
 *   1. Dry-run (inspect current values):
 *      node scripts/fix-single-user.js
 *   2. Set starting balance to 138833.33 (reconciles with payments, leaving 0 balance):
 *      node scripts/fix-single-user.js --amount 138833.33 --fix
 *   3. Set starting balance to 194999.33 (leaves 56166.00 outstanding balance):
 *      node scripts/fix-single-user.js --amount 194999.33 --fix
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  const fixMode = process.argv.includes('--fix');
  
  // Parse --amount argument
  const amtIdx = process.argv.indexOf('--amount');
  let targetAmount = null;
  if (amtIdx !== -1 && process.argv[amtIdx + 1]) {
    targetAmount = parseFloat(process.argv[amtIdx + 1]);
  }

  console.log("🔌 Connecting to database...");
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
  const guilgeeService = require('../services/guilgeeService');

  const TARGET_CONTRACT_ID = "69faed1e6ebb5e0ed63e38ef";
  let contractFound = false;

  for (const kh of db.kholboltuud) {
    const GereeModel = Geree(kh);
    const contract = await GereeModel.findById(TARGET_CONTRACT_ID).lean();

    if (!contract) continue;

    contractFound = true;
    console.log(`\n======================================================================`);
    console.log(`🎯 FOUND TARGET CONTRACT IN ORG: ${kh.baiguullagiinId}`);
    console.log(`======================================================================`);
    console.log(`📋 Details:`);
    console.log(`  - Name:          ${contract.ovog || ""} ${contract.ner || ""}`);
    console.log(`  - Room (Toot):   ${contract.toot}`);
    console.log(`  - Contract No:   ${contract.gereeniiDugaar}`);
    console.log(`  - Status:        ${contract.tuluv}`);
    console.log(`  - Current ekhniiUldegdel in Contract doc: ${contract.ekhniiUldegdel} ₮`);

    const GuilgeeModel = GuilgeeAvlaguud(kh);
    const startingBalanceRecords = await GuilModelFindStarting(GuilgeeModel, TARGET_CONTRACT_ID);

    console.log(`\n💵 Starting Balance records in GuilgeeAvlaguud:`);
    if (startingBalanceRecords.length === 0) {
      console.log(`  ❌ No starting balance records found!`);
    } else {
      startingBalanceRecords.forEach((r, idx) => {
        console.log(`  Record [${idx}]:`);
        console.log(`    - ID:         ${r._id}`);
        console.log(`    - Description:${r.tailbar || r.zardliinNer}`);
        console.log(`    - dun:        ${r.dun} ₮`);
        console.log(`    - undsenDun:  ${r.undsenDun} ₮`);
        console.log(`    - tulukhDun:  ${r.tulukhDun} ₮`);
      });
    }

    if (targetAmount !== null) {
      console.log(`\n🎯 Target starting balance specified: ${targetAmount} ₮`);
      if (fixMode) {
        console.log(`🛠️ [FIX MODE] Updating database...`);

        // 1. Update contract's ekhniiUldegdel
        await GereeModel.updateOne(
          { _id: TARGET_CONTRACT_ID },
          { $set: { ekhniiUldegdel: targetAmount } }
        );
        console.log(`  ✅ Updated contract's ekhniiUldegdel to ${targetAmount} ₮`);

        // 2. Update ledger starting balance record(s)
        if (startingBalanceRecords.length > 0) {
          for (const r of startingBalanceRecords) {
            await GuilgeeModel.updateOne(
              { _id: r._id },
              { 
                $set: { 
                  dun: targetAmount,
                  undsenDun: targetAmount,
                  tulukhDun: targetAmount 
                } 
              }
            );
            console.log(`  ✅ Updated GuilgeeAvlaguud record ${r._id} (dun/undsenDun/tulukhDun = ${targetAmount} ₮)`);
          }
        } else {
          // If somehow no record exists, create one using recordCharge
          console.log(`  ⚠️ No starting balance record found. Creating one...`);
          await guilgeeService.recordCharge(kh, {
            ...contract,
            _id: undefined,
            gereeniiId: TARGET_CONTRACT_ID,
            dun: targetAmount,
            zardliinNer: "Эхний үлдэгдэл",
            tailbar: "Системээс үүсгэсэн эхний үлдэгдэл",
            zardliinTurul: "Энгийн",
            ognoo: contract.gereeniiOgnoo || new Date(),
            source: "geree",
            ekhniiUldegdelEsekh: true,
            guilgeeKhiisenAjiltniiNer: "Систем",
            guilgeeKhiisenAjiltniiId: "System",
          });
          console.log(`  ✅ Created new starting balance record in GuilgeeAvlaguud.`);
        }

        // 3. Re-sync invoice status
        console.log(`  🔄 Re-syncing invoice ledger statuses (guilgeeService.syncInvoicesStatus)...`);
        await guilgeeService.syncInvoicesStatus(kh, TARGET_CONTRACT_ID);
        console.log(`  ✅ Ledger and invoice status sync completed successfully!`);
      } else {
        console.log(`💡 Run with --fix to apply this change to the database:`);
        console.log(`   node scripts/fix-single-user.js --amount ${targetAmount} --fix`);
      }
    } else {
      console.log(`\n💡 To update this user's starting balance, specify the --amount and --fix flags:`);
      console.log(`   node scripts/fix-single-user.js --amount 138833.33 --fix`);
      console.log(`   or`);
      console.log(`   node scripts/fix-single-user.js --amount 194999.33 --fix`);
    }

    break; // target contract ID found, no need to scan other orgs
  }

  if (!contractFound) {
    console.log(`❌ Target contract ID ${TARGET_CONTRACT_ID} not found in database.`);
  }

  process.exit(0);
}

async function GuilModelFindStarting(GuilgeeModel, gereeniiId) {
  return await GuilgeeModel.find({
    gereeniiId: String(gereeniiId),
    $or: [
      { ekhniiUldegdelEsekh: true },
      { zardliinNer: { $regex: "Эхний үлдэгдэл", $options: "i" } }
    ]
  }).lean();
}

main().catch(console.error);
