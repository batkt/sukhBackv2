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

    console.log("Seeding 3 test residents and contracts...");

    const baiguullagiinId = "69f06870687e1fcbab74be82";
    const barilgiinId = "69f161e3e9e5c1202ca0153d";

    const residents = [];

    for (let i = 1; i <= 3; i++) {
      const residentId = new mongoose.Types.ObjectId();
      residents.push({
        _id: residentId,
        ner: `Test Resident ${i}`,
        ovog: `Test`,
        utas: `9911000${i}`,
        baiguullagiinId,
        barilgiinId,
        toots: [{
          toot: `10${i}`,
          baiguullagiinId,
          barilgiinId,
          orts: "1",
          davkhar: String(i)
        }]
      });

      
    }

    await OrshinSuugch.insertMany(residents);

    console.log(`- Residents (amarSukh): 3 seeded`);

    console.log("--- CLEANUP & SEED COMPLETE ---");
    await orgConn.close();
    await genConn.close();
    process.exit(0);

  } catch (err) {
    console.error("CRITICAL ERROR DURING CLEANUP:", err);
    process.exit(1);
  }
}

cleanStart();
