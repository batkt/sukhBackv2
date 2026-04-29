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
  const baiguullagiinId = "69f06870687e1fcbab74be82";
  const barilgiinId = "69f161e3e9e5c1202ca0153d";

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

    // 2. IMPORTANT: Populate the global db object so controllers can find connections
    const { db: globalDb } = require("zevbackv2");
    const kholbolt = {
      baiguullagiinId,
      kholbolt: orgConn,
      databaseNer: "suhTest"
    };
    
    globalDb.erunkhiiKholbolt = { kholbolt: genConn };
    globalDb.kholboltuud = [kholbolt];
    
    console.log("Initialized global connection registry.");

    // 2. Define Models
    const kholboltOrg = { kholbolt: orgConn };
    const kholboltGen = { kholbolt: genConn };

    const Geree = require("./models/geree")(kholboltOrg);
    const Invoice = require("./models/nekhemjlekhiinTuukh")(kholboltOrg);
    const Ledger = require("./models/guilgeeAvlaguud")(kholboltOrg);
    
    // OrshinSuugch lives in amarSukh
    const OrshinSuugch = require("./models/orshinSuugch")(kholboltGen);

    // 2. Prepare Building Config (Ensure toots 101, 102, 103 exist in Baiguullaga)
    console.log("Ensuring test toots exist in building configuration...");
    const BaiguullagaModel = require("./models/baiguullaga")(kholboltGen);
    const orgData = await BaiguullagaModel.findById(baiguullagiinId);
    
    if (orgData) {
      const bIdx = orgData.barilguud.findIndex(b => String(b._id) === String(barilgiinId));
      if (bIdx >= 0) {
        const tokh = orgData.barilguud[bIdx].tokhirgoo || {};
        tokh.davkhar = ["1", "2", "3"];
        tokh.davkhariinToonuud = {
          "1::1": ["1"],
          "1::2": ["2"],
          "1::3": ["3"]
        };
        orgData.barilguud[bIdx].tokhirgoo = tokh;
        orgData.markModified(`barilguud.${bIdx}.tokhirgoo`);
        await orgData.save();
        console.log("Building configuration updated with test toots 1, 2, 3.");
      }
    }

    console.log("Cleaning records...");

    const [res1, res2, res3, res4] = await Promise.all([
      Ledger.deleteMany({}),
      Invoice.deleteMany({}),
      Geree.deleteMany({}),
      OrshinSuugch.deleteMany({}) // Clearing from amarSukh
    ]);

    console.log("Seeding 3 test residents using orshinSuugchBurtgey...");

    const { orshinSuugchBurtgey } = require("./controller/orshinSuugch");

    for (let i = 1; i <= 3; i++) {
      console.log(`Registering Resident ${i} (Toot: ${i})...`);
      
      const req = {
        body: {
          ner: `Test Resident ${i}`,
          ovog: `Test`,
          utas: `9911000${i}`,
          toot: String(i),
          davkhar: String(i),
          orts: "1",
          baiguullagiinId,
          barilgiinId,
          nevtrekhNer: `testuser${i}`,
          nuutsUg: "1234",
          ekhniiUldegdel: 9000
        }
      };

      const res = {
        status: () => res,
        json: (data) => {
          // console.log(`Result for ${i}:`, data.success ? "Success" : data.message);
        }
      };

      // Call the controller (it's wrapped in express-async-handler, so it returns a promise internally)
      // We manually await the logic
      await orshinSuugchBurtgey(req, res, (err) => {
        if (err) console.error(`Error seeding resident ${i}:`, err.message);
      });
    }

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
