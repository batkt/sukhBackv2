require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");
const { db } = require("zevbackv2");
const Geree = require("../models/geree");
const OrshinSuugch = require("../models/orshinSuugch");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const invoiceService = require("../services/invoiceService");

async function run() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    console.log("🔌 Connecting to database...");
    
    // Use zevbackv2 connection method to match app behavior
    const app = {}; 
    await db.kholboltUusgey(app, MONGODB_URI);
    console.log("✅ Connected successfully!");

    const targetKholbolt = db.kholboltuud.find(k => k.baaziinNer === "zevSukh");
    if (!targetKholbolt) {
      console.log("Available databases in kholboltuud:", db.kholboltuud.map(k => k.baaziinNer));
      throw new Error("zevSukh connection not found!");
    }
    const kholbolt = { kholbolt: targetKholbolt.kholbolt };
    const contractDugaar = "ГД-91346582";

    // 1. Fetch Contract & Resident
    const GereeModel = Geree(kholbolt);
    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);

    const geree = await GereeModel.findOne({ gereeniiDugaar: contractDugaar });
    if (!geree) {
      console.error(`❌ Contract ${contractDugaar} not found!`);
      process.exit(1);
    }
    const resident = await OrshinSuugchModel.findById(geree.orshinSuugchId);
    if (!resident) {
      console.error(`❌ Resident not found for contract!`);
      process.exit(1);
    }

    console.log("\n--- STEP 1: Setting up pro-rating flags (testing state) ---");
    // Set flag on Contract
    await GereeModel.findByIdAndUpdate(geree._id, {
      $set: {
        khonogoorBodokhEsekh: true,
        bodokhKhonog: 18
      }
    });

    // Set flag on Resident's toot
    let targetToot = resident.toots.find(t => String(t.toot) === String(geree.toot));
    if (!targetToot) {
      console.error(`❌ Resident does not have toot ${geree.toot} in toots array!`);
      process.exit(1);
    }

    const updatedToots = resident.toots.map(t => {
      if (String(t.toot) === String(geree.toot)) {
        return { ...t.toObject(), khonogoorBodokhEsekh: true, bodokhKhonog: 18 };
      }
      return t;
    });

    await OrshinSuugchModel.findByIdAndUpdate(resident._id, {
      $set: {
        khonogoorBodokhEsekh: true,
        bodokhKhonog: 18,
        toots: updatedToots
      }
    });
    console.log("✅ Pro-rating flags set to true / 18 days for contract and resident toot!");
    console.log("Diagnostic Comparison:");
    resident.toots.forEach(t => {
      console.log(`- t.toot: "${t.toot}" vs geree.toot: "${geree.toot}"`);
      console.log(`  t.barilgiinId: "${t.barilgiinId}" (${typeof t.barilgiinId}) vs geree.barilgiinId: "${geree.barilgiinId}" (${typeof geree.barilgiinId})`);
      console.log(`  t.baiguullagiinId: "${t.baiguullagiinId}" (${typeof t.baiguullagiinId}) vs geree.baiguullagiinId: "${geree.baiguullagiinId}" (${typeof geree.baiguullagiinId})`);
    });

    console.log("\n--- STEP 2: Creating Test Invoice ---");
    // Use billingDate in the future to avoid collision or override option
    const testBillingDate = new Date();
    const result = await invoiceService.createInvoiceForContract(kholbolt, geree._id.toString(), {
      billingDate: testBillingDate,
      override: true // Allow creating even if invoice already exists for this cycle
    });

    console.log("✅ Invoice Creation Result:", result);

    console.log("\n--- STEP 3: Verifying Reset ---");
    const updatedGeree = await GereeModel.findById(geree._id);
    const updatedResident = await OrshinSuugchModel.findById(resident._id);
    const updatedTargetToot = updatedResident.toots.find(t => String(t.toot) === String(geree.toot));

    console.log("Contract flags (expected false/0):", {
      khonogoorBodokhEsekh: updatedGeree.khonogoorBodokhEsekh,
      bodokhKhonog: updatedGeree.bodokhKhonog
    });
    
    console.log("Resident toot flags (expected false/0):", {
      khonogoorBodokhEsekh: updatedTargetToot.khonogoorBodokhEsekh,
      bodokhKhonog: updatedTargetToot.bodokhKhonog
    });

    const success = 
      updatedGeree.khonogoorBodokhEsekh === false && 
      updatedGeree.bodokhKhonog === 0 &&
      updatedTargetToot.khonogoorBodokhEsekh === false &&
      updatedTargetToot.bodokhKhonog === 0;

    if (success) {
      console.log("\n🎉 SUCCESS: The pro-rating flags were successfully reset for both the contract and the resident's toot list!");
    } else {
      console.log("\n❌ FAILURE: Flags were not reset correctly.");
    }

    console.log("\n--- STEP 4: Cleaning Up Test Invoice & Ledger Data ---");
    if (result.invoiceId) {
      const NekhemjModel = NekhemjlekhiinTuukh(kholbolt);
      const GuilgeeModel = GuilgeeAvlaguud(kholbolt);

      const delLedger = await GuilgeeModel.deleteMany({ nekhemjlekhId: result.invoiceId.toString() });
      const delInv = await NekhemjModel.deleteOne({ _id: result.invoiceId });
      console.log(`Deleted ${delLedger.deletedCount} test ledger entries and test invoice.`);
    }

  } catch (err) {
    console.error("❌ Test Error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
