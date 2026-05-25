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

    console.log("\n🔍 STARTING COMPREHENSIVE SCAN FOR ELECTRICITY & INVOICE ISSUES...\n");

    const activeContracts = await Geree.find({ tuluv: "Идэвхтэй" }).toArray();
    console.log(`Scanned ${activeContracts.length} active contracts.`);

    const issues = [];

    for (const geree of activeContracts) {
      const toot = geree.toot || "N/A";
      const dugaar = geree.gereeniiDugaar;
      const name = `${geree.ovog || ""} ${geree.ner || ""}`.trim();

      const contractIssues = [];

      // --- ISSUE 1: Duplicate "Цахилгаан" Charges in Contract ---
      const zardluud = geree.zardluud || [];
      const elecCharges = zardluud.filter(z => (z.ner || "").trim().toLowerCase() === "цахилгаан");
      if (elecCharges.length > 1) {
        const types = elecCharges.map(z => z.zardliinTurul || "N/A").join(", ");
        contractIssues.push({
          type: "DUPLICATE_CONTRACT_CHARGES",
          details: `Contract zardluud has ${elecCharges.length} electricity charges. Types: [${types}]`
        });
      }

      // --- ISSUE 2: Duplicate Invoices in the Same Cycle (Grouping by Cycle) ---
      // We will look at the last 3 months to see if any cycle has duplicates
      const targetStartDate = new Date("2026-03-01T00:00:00.000Z");
      const targetEndDate = new Date("2026-05-31T23:59:59.999Z");

      const invoices = await Nekhemjlekh.find({
        gereeniiId: geree._id.toString(),
        ognoo: { $gte: targetStartDate, $lte: targetEndDate }
      }).toArray();

      // Group by Year-Month
      const cycleGroups = {};
      invoices.forEach(inv => {
        const d = new Date(inv.ognoo);
        const cycleKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!cycleGroups[cycleKey]) cycleGroups[cycleKey] = [];
        cycleGroups[cycleKey].push(inv);
      });

      for (const [cycle, invs] of Object.entries(cycleGroups)) {
        if (invs.length > 1) {
          const invList = invs.map(i => `${i.nekhemjlekhiinDugaar} (${i.tuluv})`).join(", ");
          contractIssues.push({
            type: "DUPLICATE_INVOICES",
            details: `Billing cycle ${cycle} has ${invs.length} duplicate invoices: [${invList}]`
          });
        }
      }

      // --- ISSUE 3: Duplicate Electricity Charges in Ledger for May 2026 ---
      const startOfMay = new Date("2026-05-01T00:00:00.000Z");
      const endOfMay = new Date("2026-05-31T23:59:59.999Z");

      const ledgerMayCharges = await Guilgee.find({
        gereeniiId: geree._id.toString(),
        ognoo: { $gte: startOfMay, $lte: endOfMay },
        zardliinNer: { $regex: /^цахилгаан$/i }
      }).toArray();

      if (ledgerMayCharges.length > 1) {
        const list = ledgerMayCharges.map(l => `${l.dun} (${l.source})`).join(", ");
        contractIssues.push({
          type: "DUPLICATE_LEDGER_CHARGES",
          details: `Ledger has ${ledgerMayCharges.length} electricity charges in May 2026: [${list}]`
        });
      }

      // Record any issues found
      if (contractIssues.length > 0) {
        issues.push({
          toot,
          dugaar,
          name,
          contractIssues
        });
      }
    }

    // --- REPORT GENERATION ---
    console.log("\n==================================================");
    console.log(`📊 DIAGNOSTIC SCAN REPORT`);
    console.log(`Total Active Contracts Scanned: ${activeContracts.length}`);
    console.log(`Contracts with Suspicious Issues: ${issues.length}`);
    console.log("==================================================\n");

    if (issues.length === 0) {
      console.log("✅ PERFECT! No duplicate electricity charges or duplicate invoices found.");
    } else {
      issues.forEach((iss, index) => {
        console.log(`${index + 1}. 🏠 TOOT: ${iss.toot} | Contract: ${iss.dugaar} | Owner: ${iss.name}`);
        iss.contractIssues.forEach(ci => {
          console.log(`   ⚠️  [${ci.type}] -> ${ci.details}`);
        });
        console.log("");
      });
      
      const tootList = issues.map(i => i.toot);
      console.log(`💡 Recommendation: You can update the 'heal_toots_real.js' script to include these Toot numbers:`);
      console.log(`   const toots = [${tootList.map(t => `"${t}"`).join(", ")}];`);
    }

    console.log("\n==================================================");

  } catch (err) {
    console.error("❌ Error running scanner script:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from database.");
  }
}
run();
