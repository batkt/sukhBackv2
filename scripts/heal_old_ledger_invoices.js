/**
 * Database Migration Script
 * ONLY for dotoodOrg (baiguullagiinId = "69f3f56a2899d5fdc24251d1", zevSukh tenant DB).
 *
 * Find all manual ledger entries (charges) that are missing a nekhemjlekhId,
 * automatically associate them with an active/unpaid invoice using ensureActiveInvoice,
 * and then trigger a status synchronization (FIFO settlement) to fix the app UI.
 *
 * Run it with:
 *   node scripts/heal_old_ledger_invoices.js
 */

const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const BAIGUULLAGIIN_ID = "69f3f56a2899d5fdc24251d1";
const TENANT_DATABASE_NAME = "zevSukh";

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });
process.env.TZ = process.env.TZ || "Asia/Ulaanbaatar";
process.setMaxListeners(0);

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const invoiceService = require("../services/invoiceService");
const guilgeeService = require("../services/guilgeeService");

async function main() {
  console.log("=== HEALING ORPHAN LEDGER CHARGES (dotoodOrg only) ===");
  console.log("  baiguullagiinId:", BAIGUULLAGIIN_ID);
  console.log("  tenantDbName:", TENANT_DATABASE_NAME);
  console.log("");

  const app = express();
  db.kholboltUusgey(
    app,
    process.env.MONGODB_URI ||
      "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin",
  );

  console.log("Waiting 4000ms for DB connections...");
  await new Promise((r) => setTimeout(r, 4000));

  if (!db.kholboltuud || db.kholboltuud.length === 0) {
    console.error("No tenant connections available. Check MONGODB_URI.");
    process.exit(1);
  }

  const kholboltEntry = getKholboltByBaiguullagiinId(BAIGUULLAGIIN_ID);
  if (!kholboltEntry) {
    console.error("❌ No kholbolt entry found for dotoodOrg ID:", BAIGUULLAGIIN_ID);
    process.exit(1);
  }

  const tenantDbName = kholboltEntry.kholbolt?.db?.databaseName ?? "(unknown)";
  console.log("Connecting to tenant database:", tenantDbName);

  if (tenantDbName !== TENANT_DATABASE_NAME) {
    console.error("❌ Target database mismatch!");
    console.error(`   Found databaseName: "${tenantDbName}", expected: "${TENANT_DATABASE_NAME}"`);
    process.exit(1);
  }

  const GuilgeeModel = GuilgeeAvlaguud(kholboltEntry);

  // 1. Find all positive manual charges that lack a nekhemjlekhId
  const orphanCharges = await GuilgeeModel.find({
    baiguullagiinId: BAIGUULLAGIIN_ID,
    dun: { $gt: 0 },
    $or: [
      { nekhemjlekhId: { $exists: false } },
      { nekhemjlekhId: null },
      { nekhemjlekhId: "" }
    ]
  });

  console.log(`\nFound ${orphanCharges.length} orphan charges to fix.`);

  if (orphanCharges.length === 0) {
    console.log("Nothing to heal! All charges are already associated with invoices.");
    process.exit(0);
  }

  const affectedContracts = new Set();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < orphanCharges.length; i++) {
    const charge = orphanCharges[i];
    const chargeId = charge._id.toString();
    const gereeId = charge.gereeniiId;

    if (!gereeId) {
      console.warn(`[WARN] Charge ${chargeId} lacks gereeniiId, skipping.`);
      continue;
    }

    affectedContracts.add(gereeId);
    console.log(`[${i + 1}/${orphanCharges.length}] Healing charge ${chargeId} (toot: ${charge.toot || "unknown"}, dun: ${charge.dun}, tailbar: "${charge.tailbar}") for contract ${gereeId}...`);

    try {
      // Find or create the active/unpaid invoice for this contract
      const activeInv = await invoiceService.ensureActiveInvoice(kholboltEntry, gereeId);
      if (!activeInv) {
        throw new Error(`Could not find or create active invoice for contract ${gereeId}`);
      }

      // Update the charge
      charge.nekhemjlekhId = activeInv._id.toString();
      await GuilgeeModel.findByIdAndUpdate(charge._id, {
        nekhemjlekhId: activeInv._id.toString()
      });

      console.log(`  -> Associated with invoice ID: ${activeInv._id.toString()}`);
      successCount++;
    } catch (err) {
      console.error(`  -> ❌ Failed to heal charge ${chargeId}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\nRe-syncing invoice statuses for ${affectedContracts.size} affected contracts...`);
  const contractList = Array.from(affectedContracts);
  for (let i = 0; i < contractList.length; i++) {
    const gereeId = contractList[i];
    try {
      await guilgeeService.syncInvoicesStatus(kholboltEntry, gereeId);
      console.log(`  [${i + 1}/${contractList.length}] Sync completed for contract ${gereeId}`);
    } catch (err) {
      console.error(`  [${i + 1}/${contractList.length}] ❌ Sync failed for contract ${gereeId}:`, err.message);
    }
  }

  console.log("\n=== HEALING SUMMARY ===");
  console.log(`  Total Found: ${orphanCharges.length}`);
  console.log(`  Successfully Healed: ${successCount}`);
  console.log(`  Errors/Skipped: ${errorCount}`);
  console.log(`  Affected Contracts Sync'd: ${affectedContracts.size}`);
  console.log("=======================");

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL ERROR running healing script:", err);
  process.exit(1);
});
