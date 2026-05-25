require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.useDb("nairamdalSukh");
    
    const Geree = db.collection("geree");
    const Nekhemjlekh = db.collection("nekhemjlekhiinTuukh");
    const Guilgee = db.collection("guilgeeAvlaguud");

    const contractDugaar = "ГД-71848318"; // Toot 166 contract
    const targetGeree = await Geree.findOne({ gereeniiDugaar: contractDugaar });

    if (!targetGeree) {
      console.log(`Contract ${contractDugaar} not found!`);
      return;
    }

    console.log(`=== STEP 1: RESETTING EKHNII ULDEGDEL ON CONTRACT ${contractDugaar} ===`);
    const resetGereeResult = await Geree.updateOne(
      { _id: targetGeree._id },
      { $set: { ekhniiUldegdel: 0 } }
    );
    console.log(`Contract reset: matched ${resetGereeResult.matchedCount}, modified ${resetGereeResult.modifiedCount}`);

    console.log("\n=== STEP 2: COMPLETELY DELETING 599,933.38 LEDGER CHARGE ===");
    const deleteGuilgeeResult = await Guilgee.deleteMany({
      gereeniiId: targetGeree._id.toString(),
      dun: 599933.38
    });
    console.log(`Deleted ledger starting balance documents: ${deleteGuilgeeResult.deletedCount}`);

    console.log("\n=== STEP 3: RE-SYNCING INVOICES AND LEDGER CHARGES ===");
    const invoiceService = require("./services/invoiceService");
    const zevbackv2 = require("zevbackv2");
    zevbackv2.db.erunkhiiKholbolt = { kholbolt: mongoose.connection };

    const kholbolt = { kholbolt: db };
    const syncResult = await invoiceService.createInvoiceForContract(kholbolt, targetGeree._id.toString(), {
      billingDate: new Date("2026-05-25T00:00:00.000Z")
    });
    console.log("Sync result:", syncResult);

    console.log("\n=== STEP 4: VERIFYING UPDATED LEDGER FOR TOOT 166 ===");
    const remainingGuilgees = await Guilgee.find({ 
      gereeniiId: targetGeree._id.toString() 
    }).sort({ ognoo: -1 }).toArray();
    console.log(JSON.stringify(remainingGuilgees, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
