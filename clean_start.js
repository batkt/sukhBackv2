const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load env for the base URI
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

/**
 * DIRECT CLEAN START SCRIPT
 * DANGER: This script deletes ALL data from suhTest database:
 * - guilgeeAvlaguud
 * - nekhemjlekhiinTuukh
 * - geree
 * - orshinSuugch
 */

async function cleanStart() {
  const baseUri = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  
  // Replace the database name with suhTest
  const targetUri = baseUri.replace("/amarSukh", "/suhTest");

  console.log(`--- DIRECT CLEAN START ---`);
  console.log(`Target URI: ${targetUri}`);
  console.log(`--------------------------`);

  try {
    const conn = await mongoose.createConnection(targetUri).asPromise();
    console.log("Connected to suhTest successfully.");

    // Define Models
    const kholbolt = { kholbolt: conn }; // Mock kholbolt object for schemas
    const Geree = require("./models/geree")(kholbolt);
    const OrshinSuugch = require("./models/orshinSuugch")(kholbolt);
    const Invoice = require("./models/nekhemjlekhiinTuukh")(kholbolt);
    const Ledger = require("./models/guilgeeAvlaguud")(kholbolt);

    console.log("Cleaning records...");

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
    await conn.close();
    process.exit(0);

  } catch (err) {
    console.error("CRITICAL ERROR DURING CLEANUP:", err);
    process.exit(1);
  }
}

cleanStart();
