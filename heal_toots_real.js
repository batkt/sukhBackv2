require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");

async function run() {
  try {
    console.log("🔌 Connecting to database...");
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.useDb("nairamdalSukh");
    
    const Geree = db.collection("geree");
    const Guilgee = db.collection("guilgeeAvlaguud");
    const Nekhemjlekh = db.collection("nekhemjlekhiinTuukh");

    const toots = ["54", "116", "126", "155", "41"];
    const startOfMay = new Date("2026-05-01T00:00:00.000Z");
    const endOfMay = new Date("2026-05-31T23:59:59.999Z");
    const targetBillingDate = new Date("2026-05-25T00:00:00.000Z");

    console.log(`\n=== STARTING COMPREHENSIVE HEALING & DEDUPLICATION FOR TOOTS: ${toots.join(", ")} ===\n`);

    for (const tootNum of toots) {
      console.log(`--------------------------------------------------`);
      console.log(`🔍 Processing TOOT: ${tootNum}`);
      
      // 1. Find the active contract
      const geree = await Geree.findOne({ toot: tootNum, tuluv: "Идэвхтэй" });
      if (!geree) {
        console.log(`❌ Active contract not found for Toot ${tootNum}!`);
        continue;
      }

      console.log(`Contract Found: ${geree.gereeniiDugaar} (${geree.ovog} ${geree.ner})`);

      // 2. Clean duplicate "Цахилгаан" charges in contract's zardluud array
      let zardluud = geree.zardluud || [];
      const electricityCharges = zardluud.filter(z => (z.ner || "").trim().toLowerCase() === "цахилгаан");

      if (electricityCharges.length > 1) {
        console.log(`⚠️ Found duplicate electricity charges in contract! Count: ${electricityCharges.length}`);
        
        const hasVariable = electricityCharges.some(z => z.zardliinTurul === "Хувьсах");
        if (hasVariable) {
          console.log("Removing duplicate manual 'Энгийн' electricity charges and keeping the dynamic 'Хувьсах' one...");
          
          const cleanedZardluud = zardluud.filter(z => {
            const isElectricity = (z.ner || "").trim().toLowerCase() === "цахилгаан";
            if (isElectricity && z.zardliinTurul === "Энгийн") {
              console.log(`-> Removed from contract model: ${z.ner} (Tariff: ${z.tariff}, Type: ${z.zardliinTurul})`);
              return false;
            }
            return true;
          });

          await Geree.updateOne(
            { _id: geree._id },
            { $set: { zardluud: cleanedZardluud } }
          );
          console.log(`✅ Cleaned up contract zardluud.`);
        } else {
          console.log("No dynamic 'Хувьсах' charge found among duplicates. Skipping automatic removal.");
        }
      } else {
        console.log(`✅ No duplicate electricity charges in contract.`);
      }

      // 3. Find and handle duplicate invoices in the May 2026 cycle
      const invoices = await Nekhemjlekh.find({
        gereeniiId: geree._id.toString(),
        ognoo: { $gte: startOfMay, $lte: endOfMay }
      }).sort({ ognoo: 1, createdAt: 1 }).toArray(); // Sort oldest first

      let primaryInvoice = null;

      if (invoices.length > 0) {
        console.log(`ℹ️ Found ${invoices.length} invoice(s) for May 2026 cycle.`);
        primaryInvoice = invoices[0];
        console.log(`Primary Invoice to KEEP: ${primaryInvoice.nekhemjlekhiinDugaar} (ID: ${primaryInvoice._id}, Date: ${new Date(primaryInvoice.ognoo).toLocaleDateString()}, Status: ${primaryInvoice.tuluv})`);

        if (invoices.length > 1) {
          console.log(`⚠️ Cleaning up duplicate invoices...`);
          const duplicateInvoices = invoices.slice(1);
          for (const dup of duplicateInvoices) {
            console.log(`-> Deleting duplicate invoice: ${dup.nekhemjlekhiinDugaar} (ID: ${dup._id}, Date: ${new Date(dup.ognoo).toLocaleDateString()})`);
            await Nekhemjlekh.deleteOne({ _id: dup._id });

            // Delete any ledger entries tied to this duplicate invoice
            const delLedgerResult = await Guilgee.deleteMany({ nekhemjlekhId: dup._id.toString() });
            console.log(`   Deleted ${delLedgerResult.deletedCount} ledger entries tied to duplicate invoice.`);
          }
        }
      }

      // 4. Clean up any redundant ledger charges (source: "nekhemjlekh") for May to avoid duplication
      // We will let createInvoiceForContract re-record everything cleanly
      console.log("Clearing all 'nekhemjlekh' source ledger charges for May to allow clean re-sync...");
      const delLedgerResult = await Guilgee.deleteMany({
        gereeniiId: geree._id.toString(),
        source: "nekhemjlekh",
        ognoo: { $gte: startOfMay, $lte: endOfMay }
      });
      console.log(`Deleted ${delLedgerResult.deletedCount} old ledger charges.`);

      // 5. Re-generate invoice and sync ledger
      console.log(`Re-generating invoice and syncing ledger charges...`);
      const invoiceService = require("./services/invoiceService");
      const zevbackv2 = require("zevbackv2");
      zevbackv2.db.erunkhiiKholbolt = { kholbolt: mongoose.connection };

      const kholbolt = { kholbolt: db };
      const syncResult = await invoiceService.createInvoiceForContract(kholbolt, geree._id.toString(), {
        billingDate: targetBillingDate
      });

      console.log("Sync Result:", syncResult);

      // 6. Verify updated ledger
      const remainingGuilgees = await Guilgee.find({ 
        gereeniiId: geree._id.toString(),
        ognoo: { $gte: startOfMay, $lte: endOfMay }
      }).sort({ ognoo: -1 }).toArray();

      console.log(`\nVerified Ledger State for May 2026:`);
      remainingGuilgees.forEach(g => {
        console.log(`- ${g.zardliinNer}: ${g.dun} (${g.source}) [Date: ${new Date(g.ognoo).toLocaleDateString()}]`);
      });
      console.log(`--------------------------------------------------\n`);
    }

    console.log("🎉 Healing and deduplication process completed successfully!");

  } catch (err) {
    console.error("❌ Error running healing script:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from database.");
  }
}
run();
