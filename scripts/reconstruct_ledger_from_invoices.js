const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh_legacy?authSource=admin";
const TARGET_MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function reconstruct() {
  try {
    console.log("🚀 [RECONSTRUCTION] Filling missing charge history from invoices...");
    
    const tenantDbs = [
      { legacy: "nairamdalSukh_legacy", target: "nairamdalSukh" },
      { legacy: "kharKhorumSukh_legacy", target: "kharKhorumSukh" }
    ];

    for (const db of tenantDbs) {
      console.log(`\n📂 Processing: ${db.target}`);
      
      const legacyConn = await mongoose.createConnection(MONGODB_URI.replace("/amarSukh_legacy", `/${db.legacy}`)).asPromise();
      const targetConn = await mongoose.createConnection(TARGET_MONGODB_URI.replace("/amarSukh", `/${db.target}`)).asPromise();

      const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud")({ kholbolt: targetConn });

      const invoices = await legacyConn.collection("nekhemjlekhiinTuukh").find({}).toArray();
      let chargeCount = 0;

      for (const inv of invoices) {
        const zardluud = inv.medeelel?.zardluud || [];
        
        const ledgerEntries = zardluud.map(z => ({
          baiguullagiinId: inv.baiguullagiinId,
          baiguullagiinNer: inv.baiguullagiinNer,
          barilgiinId: inv.barilgiinId,
          gereeniiId: inv.gereeniiId,
          gereeniiDugaar: inv.gereeniiDugaar,
          ognoo: inv.nekhemjlekhiinOgnoo || inv.ognoo || new Date(),
          dun: Number(z.dun || z.tariff || 0),
          undsenDun: Number(z.dun || z.tariff || 0),
          tulukhDun: Number(z.dun || z.tariff || 0),
          turul: z.isEkhniiUldegdel ? "avlaga" : "zardal",
          zardliinNer: z.ner,
          zardliinTurul: z.zardliinTurul,
          tailbar: z.tailbar || `Monthly Charge: ${z.ner}`,
          source: "invoice_migration",
          nekhemjlekhId: inv._id.toString()
        })).filter(e => e.dun > 0); // Only import actual charges

        if (ledgerEntries.length > 0) {
          try {
            await GuilgeeAvlaguud.insertMany(ledgerEntries, { ordered: false });
            chargeCount += ledgerEntries.length;
          } catch (e) {
            // Ignore duplicates if re-run
          }
        }
      }

      console.log(`✅ Created ${chargeCount} ledger charge entries for ${db.target}.`);
      await legacyConn.close();
      await targetConn.close();
    }

    console.log("\n🏁 [FINISHED] Ledger history is now complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  }
}

reconstruct();
