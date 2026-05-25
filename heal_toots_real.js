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
    const targetBillingDate = new Date("2026-05-25T00:00:00.000Z");

    console.log(`\n=== STARTING HEALING PROCESS FOR TOOTS: ${toots.join(", ")} ===\n`);

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
        
        // Find if there is a correct dynamic one (Хувьсах) and a duplicate manual one (Энгийн)
        const hasVariable = electricityCharges.some(z => z.zardliinTurul === "Хувьсах");
        if (hasVariable) {
          console.log("Removing duplicate manual 'Энгийн' electricity charges and keeping the dynamic 'Хувьсах' one...");
          
          // Filter out any "Цахилгаан" that is "Энгийн" if we have a "Хувьсах" one
          const cleanedZardluud = zardluud.filter(z => {
            const isElectricity = (z.ner || "").trim().toLowerCase() === "цахилгаан";
            if (isElectricity && z.zardliinTurul === "Энгийн") {
              console.log(`-> Removed: ${z.ner} (Tariff: ${z.tariff}, Type: ${z.zardliinTurul})`);
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
          console.log("No dynamic 'Хувьсах' charge found among duplicates. Skipping automatic removal to avoid losing data.");
        }
      } else {
        console.log(`✅ No duplicate electricity charges in contract.`);
      }

      // 3. Re-generate invoice and sync ledger
      console.log(`Re-generating invoice and syncing ledger charges for May 2026...`);
      const invoiceService = require("./services/invoiceService");
      const zevbackv2 = require("zevbackv2");
      zevbackv2.db.erunkhiiKholbolt = { kholbolt: mongoose.connection };

      const kholbolt = { kholbolt: db };
      const syncResult = await invoiceService.createInvoiceForContract(kholbolt, geree._id.toString(), {
        billingDate: targetBillingDate
      });

      console.log("Sync Result:", syncResult);

      // 4. Verify updated ledger
      const remainingGuilgees = await Guilgee.find({ 
        gereeniiId: geree._id.toString(),
        ognoo: {
          $gte: new Date("2026-05-01T00:00:00.000Z"),
          $lte: new Date("2026-05-31T23:59:59.000Z")
        }
      }).sort({ ognoo: -1 }).toArray();

      console.log(`\nVerified Ledger Charges for May 2026:`);
      remainingGuilgees.forEach(g => {
        console.log(`- ${g.zardliinNer}: ${g.dun} (${g.source}) [Date: ${new Date(g.ognoo).toLocaleDateString()}]`);
      });
      console.log(`--------------------------------------------------\n`);
    }

    console.log("🎉 Healing process completed successfully!");

  } catch (err) {
    console.error("❌ Error running healing script:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from database.");
  }
}
run();
