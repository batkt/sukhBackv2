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
  const orgUri = baseUri.replace("/amarSukh", "/suhTest");

  console.log(`--- DUAL DB CLEAN START ---`);
  console.log(`Org DB (suhTest): ${orgUri}`);
  console.log(`General DB (amarSukh): ${baseUri}`);
  console.log(`---------------------------`);

  try {
    // 1. Connect to both
    const orgConn = await mongoose.createConnection(orgUri).asPromise();
    const genConn = await mongoose.createConnection(baseUri).asPromise();
    console.log("Connected to both databases.");

    // 2. Define Models
    const kholboltOrg = { kholbolt: orgConn };
    const kholboltGen = { kholbolt: genConn };

    const Geree = require("./models/geree")(kholboltOrg);
    const Invoice = require("./models/nekhemjlekhiinTuukh")(kholboltOrg);
    const Ledger = require("./models/guilgeeAvlaguud")(kholboltOrg);
    
    // OrshinSuugch lives in amarSukh
    const OrshinSuugch = require("./models/orshinSuugch")(kholboltGen);

    console.log("Cleaning records...");

    const [res1, res2, res3, res4] = await Promise.all([
      Ledger.deleteMany({}),
      Invoice.deleteMany({}),
      Geree.deleteMany({}),
      OrshinSuugch.deleteMany({}) // Clearing from amarSukh
    ]);

    console.log(`- Ledger (suhTest): ${res1.deletedCount} deleted`);
    console.log(`- Invoices (suhTest): ${res2.deletedCount} deleted`);
    console.log(`- Contracts (suhTest): ${res3.deletedCount} deleted`);
    console.log(`- Residents (amarSukh): ${res4.deletedCount} deleted`);

    console.log("--- CLEANUP COMPLETE ---");
    await orgConn.close();
    await genConn.close();
    process.exit(0);

  } catch (err) {
    console.error("CRITICAL ERROR DURING CLEANUP:", err);
    process.exit(1);
  }
}

cleanStart();
