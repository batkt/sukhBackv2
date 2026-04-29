const mongoose = require("mongoose");
const { db } = require("zevbackv2");

/**
 * CLEAN START SCRIPT
 * DANGER: This script deletes ALL data from:
 * - guilgeeAvlaguud (Ledger)
 * - nekhemjlekhiinTuukh (Invoices)
 * - geree (Contracts)
 * - orshinSuugch (Residents)
 * 
 * Usage: node clean_start.js <baiguullagiinId>
 */

async function cleanStart(baiguullagiinId) {
  if (!baiguullagiinId) {
    console.error("Please provide a Baiguullaga ID: node clean_start.js <ID>");
    process.exit(1);
  }

  try {
    // 1. Find the connection for this organization (tukhain)
    const kholbolt = db.kholboltuud.find(k => String(k.baiguullagiinId) === String(baiguullagiinId));
    
    if (!kholbolt) {
      console.error(`Could not find database connection for organization: ${baiguullagiinId}`);
      process.exit(1);
    }

    const dbName = kholbolt.kholbolt.name; // Get the actual connected DB name
    console.log(`--- CLEAN START ---`);
    console.log(`Target Organization: ${baiguullagiinId}`);
    console.log(`Target Database: ${dbName}`);
    console.log(`General Database (Reference): amarSukh`);
    console.log(`-------------------`);

    if (dbName !== "suhTest") {
      console.warn(`WARNING: Target DB is ${dbName}, not suhTest. Proceed? (Ctrl+C to abort)`);
    }

    // 2. Define Models on this specific organizational connection
    const Geree = require("./models/geree")(kholbolt);
    const OrshinSuugch = require("./models/orshinSuugch")(kholbolt);
    const Invoice = require("./models/nekhemjlekhiinTuukh")(kholbolt);
    const Ledger = require("./models/guilgeeAvlaguud")(kholbolt);

    // 3. Delete Data from the Organization DB
    console.log("Cleaning organizational database records...");

    const [res1, res2, res3, res4] = await Promise.all([
      Ledger.deleteMany({}),
      Invoice.deleteMany({}),
      Geree.deleteMany({}),
      OrshinSuugch.deleteMany({})
    ]);

    console.log(`- Ledger: ${res1.deletedCount} deleted`);
    console.log(`- Invoices: ${res2.deletedCount} deleted`);
    console.log(`- Contracts: ${res3.deletedCount} deleted`);
    console.log(`- Residents: ${res4.deletedCount} deleted`);

    console.log("--- CLEANUP COMPLETE ---");
    process.exit(0);

  } catch (err) {
    console.error("CRITICAL ERROR DURING CLEANUP:", err);
    process.exit(1);
  }
}

// Run if called directly
const orgId = process.argv[2];
cleanStart(orgId);
