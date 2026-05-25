require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.useDb("nairamdalSukh");
    
    const Geree = db.collection("geree");
    const Nekhemjlekh = db.collection("nekhemjlekhiinTuukh");
    const Guilgee = db.collection("guilgeeAvlaguud");

    const geree = await Geree.findOne({ gereeniiDugaar: "ГД-71811549" });
    if (!geree) {
      console.log("Contract not found!");
      return;
    }

    console.log("=== STEP 1: CLEANING UP DUPLICATE EMPTY INVOICES ===");
    // Delete the empty duplicate invoice created on May 25
    const deleteDuplicateResult = await Nekhemjlekh.deleteMany({
      gereeniiId: geree._id.toString(),
      nekhemjlekhiinDugaar: "НЭХ-20260525-0001"
    });
    console.log(`Deleted duplicate empty invoices: ${deleteDuplicateResult.deletedCount}`);

    console.log("\n=== STEP 2: REMOVING DUPLICATE ЦАХИЛГААН CHARGES IN GEREE ===");
    // Keep only the correct 'Хувьсах' charge and filter out 'Энгийн' charge
    const originalLength = geree.zardluud.length;
    const cleanedZardluud = geree.zardluud.filter(z => {
      if (z.ner === "Цахилгаан" && z.zardliinTurul === "Энгийн") {
        return false; // Remove old manual charge
      }
      return true;
    });

    if (cleanedZardluud.length !== originalLength) {
      await Geree.updateOne(
        { _id: geree._id },
        { $set: { zardluud: cleanedZardluud } }
      );
      console.log(`Cleaned up duplicate 'Цахилгаан' from contract zardluud.`);
    } else {
      console.log("No duplicate 'Цахилгаан' in contract zardluud.");
    }

    console.log("\n=== STEP 3: RE-GENERATING INVOICE AND SYNCING LEDGER ===");
    // Now trigger the invoice service to recalculate and sync ledger charges
    const invoiceService = require("./services/invoiceService");
    
    // Initialize core connection for zevbackv2 models inside standalone script
    const zevbackv2 = require("zevbackv2");
    zevbackv2.db.erunkhiiKholbolt = { kholbolt: mongoose.connection };

    const kholbolt = { kholbolt: db };

    const result = await invoiceService.createInvoiceForContract(kholbolt, geree._id.toString(), {
      billingDate: new Date("2026-05-19T17:01:01.126Z")
    });

    console.log("Sync result:", result);

    // Find the updated Guilgee entries to verify
    const guilgees = await Guilgee.find({ 
      gereeniiId: geree._id.toString(),
      zardliinNer: "Цахилгаан"
    }).toArray();

    console.log("\n=== VERIFIED LEDGER CHARGES FOR ЦАХИЛГААН ===");
    console.log(JSON.stringify(guilgees, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
