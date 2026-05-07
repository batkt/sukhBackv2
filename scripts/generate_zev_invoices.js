const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI_BASE = "mongodb://admin:Br1stelback1@localhost:27017/{db}?authSource=admin";

// Models
const Geree = require("../models/geree");
const invoiceService = require("../services/invoiceService");

async function connectWithRetry(uri, name) {
  console.log(`🔌 Connecting to ${name}...`);
  const conn = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout connecting to ${name}`));
    }, 15000);

    conn.once("open", () => {
      clearTimeout(timeout);
      console.log(`✅ Connected to ${name}`);
      resolve(conn);
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`❌ Connection error for ${name}:`, err);
      reject(err);
    });
  });
}

async function run() {
  try {
    const masterConn = await connectWithRetry(MONGODB_URI_BASE.replace("{db}", "amarSukh"), "amarSukh");

    // Find zevSukh info
    const baiguullaga = await masterConn.collection("baiguullaga").findOne({ dotoodNer: "zev" });
    if (!baiguullaga) {
      console.error("❌ Could not find organization with dotoodNer: zev");
      process.exit(1);
    }
    const baiguullagiinId = baiguullaga._id.toString();
    console.log(`✅ Found organization: ${baiguullaga.ner} (${baiguullagiinId})`);

    const tenantDb = "zevSukh";
    const tenantConn = await connectWithRetry(MONGODB_URI_BASE.replace("{db}", tenantDb), tenantDb);

    const kholbolt = { kholbolt: tenantConn };

    const GereeModel = Geree(kholbolt);
    const contracts = await GereeModel.find({ 
      baiguullagiinId: baiguullagiinId,
      tuluv: { $ne: "Цуцалсан" } 
    }).lean();

    console.log(`📋 Found ${contracts.length} active contracts in ${tenantDb}`);

    const months = [
      { year: 2026, month: 1, name: "February" },
      { year: 2026, month: 2, name: "March" },
      { year: 2026, month: 3, name: "April" },
      { year: 2026, month: 4, name: "May" }
    ];

    for (const m of months) {
      console.log(`\n🚀 Generating invoices for ${m.name} ${m.year}...`);
      const billingDate = new Date(m.year, m.month, 1, 12, 0, 0);
      
      let count = 0;
      let skipped = 0;
      for (const geree of contracts) {
        try {
          const result = await invoiceService.createInvoiceForContract(kholbolt, geree._id, {
            billingDate,
            ajiltanNer: "Batch Script",
            forceEmpty: false
          });
          
          if (result.success) {
            if (result.message === "No charges to bill") {
              skipped++;
            } else {
              count++;
            }
            if ((count + skipped) % 5 === 0) process.stdout.write(".");
          }
        } catch (err) {
          console.error(`\n   ❌ Error for ${geree.toot || geree._id}: ${err.message}`);
        }
      }
      console.log(`\n   ✅ Created ${count} invoices, Skipped ${skipped} empty ones for ${m.name}`);
    }

    console.log("\n🏁 Batch processing complete!");
    process.exit(0);
  } catch (err) {
    console.error("💥 CRITICAL ERROR:", err);
    process.exit(1);
  }
}

run();
