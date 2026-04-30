const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh_legacy?authSource=admin";

async function migrate() {
  try {
    console.log("🚀 [MIGRATION] Starting Production Ledger Migration...");
    
    // 1. Connect to Main DB
    const mainConn = await mongoose.createConnection(MONGODB_URI).asPromise();
    console.log("✅ Connected to General DB (amarSukh_legacy)");

    const tenantDbs = [
      { legacy: "nairamdalSukh_legacy", target: "nairamdalSukh" },
      { legacy: "kharKhorumSukh_legacy", target: "kharKhorumSukh" }
    ];

    for (const db of tenantDbs) {
      console.log(`\n📂 [DATABASE] Migrating: ${db.legacy} -> ${db.target}`);
      
      const legacyConn = await mongoose.createConnection(MONGODB_URI.replace("/amarSukh_legacy", `/${db.legacy}`)).asPromise();
      const targetConn = await mongoose.createConnection(MONGODB_URI.replace("/amarSukh_legacy", `/${db.target}`)).asPromise();

      // Models
      const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud")({ kholbolt: targetConn });
      const Geree = require("../models/geree")({ kholbolt: targetConn });

      // --- STEP 1: MIGRATE LEDGER (CHARGES) ---
      console.log("➡️  Migrating Charges (gereeniiTulukhAvlaga)...");
      const charges = await legacyConn.collection("gereeniiTulukhAvlaga").find({}).toArray();
      const mappedCharges = charges.map(c => ({
        ...c,
        _id: c._id, // Preserve ID to prevent duplicates if re-run
        dun: Number(c.tulukhDun || 0),
        source: c.source || "excel_import",
        undsenDun: Number(c.undsenDun || c.tulukhDun || 0),
        tulukhDun: Number(c.tulukhDun || 0),
      }));
      if (mappedCharges.length > 0) await GuilgeeAvlaguud.insertMany(mappedCharges);
      console.log(`✅ Migrated ${mappedCharges.length} charges.`);

      // --- STEP 2: MIGRATE LEDGER (PAYMENTS) ---
      console.log("➡️  Migrating Payments (gereeniiTulsunAvlaga)...");
      const payments = await legacyConn.collection("gereeniiTulsunAvlaga").find({}).toArray();
      const mappedPayments = payments.map(p => ({
        ...p,
        _id: p._id,
        dun: -Number(p.tulsunDun || 0), // NEGATIVE for payments
        source: p.source || "excel_import",
        tulsunDun: Number(p.tulsunDun || 0),
      }));
      if (mappedPayments.length > 0) await GuilgeeAvlaguud.insertMany(mappedPayments);
      console.log(`✅ Migrated ${mappedPayments.length} payments.`);

      // --- STEP 3: MIGRATE CONTRACTS (GEREE) ---
      console.log("➡️  Migrating Contracts (geree)...");
      const legacyGereenuud = await legacyConn.collection("geree").find({}).toArray();
      const mappedGeree = legacyGereenuud.map(g => {
        // Fix status mapping
        let status = "Идэвхтэй";
        if (g.tuluv === "Цуцалсан" || g.tuluv === 0) status = "Цуцалсан";
        
        return {
          ...g,
          tuluv: status,
          // Ensure ekhniiUldegdel is set if missing
          ekhniiUldegdel: g.ekhniiUldegdel || 0
        };
      });
      if (mappedGeree.length > 0) await Geree.insertMany(mappedGeree);
      console.log(`✅ Migrated ${mappedGeree.length} contracts.`);

      await legacyConn.close();
      await targetConn.close();
    }

    console.log("\n🏁 [FINISHED] All data migrated successfully.");
    await mainConn.close();
    process.exit(0);

  } catch (err) {
    console.error("❌ [ERROR] Migration failed:", err);
    process.exit(1);
  }
}

migrate();
