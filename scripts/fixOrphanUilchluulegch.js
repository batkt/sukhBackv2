/**
 * Migration script to fix orphan Uilchluulegch data
 * Updates records missing turul by looking up mashin/Mashin collections
 * 
 * Run: node scripts/fixOrphanUilchluulegch.js
 */

const path = require("path");
const mongoose = require("mongoose");

// Change to project root to load env and modules properly
process.chdir(path.join(__dirname, ".."));

require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });

// Get MONGODB_URI from env or default, then replace with nairamdalSukh
const rawUri = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
const MONGODB_URI = rawUri.replace(/\/[^/\?]+\?/, "/nairamdalSukh?");

async function fixOrphanData() {
  console.log("[MIGRATION] Starting orphan data fix...");
  console.log(`[MIGRATION] Connecting to: ${MONGODB_URI.replace(/:.*@/, ":****@")}`);
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("[MIGRATION] Connected to MongoDB");
    
    // Get the database
    const db = mongoose.connection.db;
    
    // Step 1: Build a map of all mashin data from both collections
    const mashinMap = new Map();
    
    // Query lowercase mashin collection
    try {
      const mashinColl = db.collection("mashin");
      const mashinDocs = await mashinColl.find({}).toArray();
      for (const m of mashinDocs) {
        if (m.dugaar) {
          mashinMap.set(m.dugaar, m);
        }
      }
      console.log(`  - Found ${mashinDocs.length} records in lowercase 'mashin'`);
    } catch (e) {
      console.log(`  - Lowercase 'mashin' collection error: ${e.message}`);
    }
    
    // Query uppercase Mashin collection
    try {
      const MashinColl = db.collection("Mashin");
      const mashinDocs = await MashinColl.find({}).toArray();
      for (const m of mashinDocs) {
        if (m.dugaar && !mashinMap.has(m.dugaar)) {
          mashinMap.set(m.dugaar, m);
        }
      }
      console.log(`  - Found ${mashinDocs.length} records in uppercase 'Mashin'`);
    } catch (e) {
      console.log(`  - Uppercase 'Mashin' collection error: ${e.message}`);
    }
    
    console.log(`  - Total unique plates in mashin collections: ${mashinMap.size}`);
    
    // Step 2: Find Uilchluulegch records missing turul
    // Get current month collection name
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const archiveName = `Uilchluulegch${year}${month}`;
    
    const collectionsToFix = [
      { name: "Uilchluulegch", label: "main" },
      { name: archiveName, label: `archive-${archiveName}` }
    ];
    
    for (const { name, label } of collectionsToFix) {
      try {
        const collection = db.collection(name);
        
        // Find records missing turul but having mashiniiDugaar
        const orphanRecords = await collection.find({
          $or: [
            { turul: { $exists: false } },
            { turul: null },
            { turul: "" }
          ],
          mashiniiDugaar: { $exists: true, $ne: null, $ne: "" }
        }).toArray();
        
        console.log(`\n  [${label}] Found ${orphanRecords.length} orphan records`);
        
        if (orphanRecords.length === 0) continue;
        
        // Step 3: Update each orphan record
        let updated = 0;
        let notFound = 0;
        
        for (const record of orphanRecords) {
          const plate = record.mashiniiDugaar;
          const mashin = mashinMap.get(plate);
          
          if (!mashin) {
            notFound++;
            continue;
          }
          
          const hasResidentData = mashin.ezenToot || mashin.orshinSuugchiinId || mashin.ezemshigchiinNer;
          const mashinTurul = mashin.turul || mashin.zochinTurul;
          
          if (mashinTurul || hasResidentData) {
            const updateData = {
              turul: mashinTurul || "Оршин суугч",
              toot: record.toot || mashin.ezenToot,
              orshinSuugchiinNer: record.orshinSuugchiinNer || mashin.ezemshigchiinNer,
              mashin: mashin
            };
            
            await collection.updateOne(
              { _id: record._id },
              { $set: updateData }
            );
            updated++;
          }
        }
        
        console.log(`  [${label}] Updated: ${updated}, Not found in mashin: ${notFound}`);
        
      } catch (e) {
        console.log(`  [${label}] Error: ${e.message}`);
      }
    }
    
    console.log("\n[MIGRATION] Complete!");
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (e) {
    console.error("[MIGRATION] Fatal error:", e);
    process.exit(1);
  }
}

// Run the migration
fixOrphanData();
