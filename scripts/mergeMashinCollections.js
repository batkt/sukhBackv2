/**
 * Migration script to merge Mashin and mashin collections
 * Copies all records from uppercase 'Mashin' to lowercase 'mashin'
 * Updates existing records in lowercase 'mashin' if they exist in both
 * 
 * Run: node scripts/mergeMashinCollections.js
 */

const path = require("path");
const mongoose = require("mongoose");

// Change to project root to load env and modules properly
process.chdir(path.join(__dirname, ".."));

require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh?authSource=admin";

// Create schemas for the collections
const MashinSchema = new mongoose.Schema({
  dugaar: String,
  turul: String,
  zochinTurul: String,
  ezenToot: String,
  orshinSuugchiinId: String,
  ezemshigchiinNer: String,
  ezemshigchiinUtas: String,
  baiguullagiinId: String,
  barilgiinId: String,
}, { strict: false });

async function mergeMashinCollections() {
  console.log("[MERGE] Starting mashin collection merge...");
  console.log(`[MERGE] Connecting to: ${MONGODB_URI.replace(/:.*@/, ":****@")}`);
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("[MERGE] Connected to MongoDB");
    
    // Get the database
    const db = mongoose.connection.db;
    
    // Get all records from uppercase Mashin collection
    const upperCollection = db.collection("Mashin");
    const lowerCollection = db.collection("mashin");
    
    const upperRecords = await upperCollection.find({}).toArray();
    console.log(`[MERGE] Found ${upperRecords.length} records in uppercase 'Mashin'`);
    
    if (upperRecords.length === 0) {
      console.log("[MERGE] No records to merge");
      await mongoose.disconnect();
      process.exit(0);
    }
    
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    for (const record of upperRecords) {
      try {
        const existing = await lowerCollection.findOne({ dugaar: record.dugaar });
        
        if (existing) {
          // Update existing record in lowercase mashin with data from uppercase
          await lowerCollection.updateOne(
            { _id: existing._id },
            { 
              $set: {
                turul: record.turul || existing.turul,
                zochinTurul: record.zochinTurul || existing.zochinTurul,
                ezenToot: record.ezenToot || existing.ezenToot,
                orshinSuugchiinId: record.orshinSuugchiinId || existing.orshinSuugchiinId,
                ezemshigchiinNer: record.ezemshigchiinNer || existing.ezemshigchiinNer,
                ezemshigchiinUtas: record.ezemshigchiinUtas || existing.ezemshigchiinUtas,
                updatedAt: new Date()
              }
            }
          );
          updated++;
        } else {
          // Insert new record into lowercase mashin
          const newRecord = {
            ...record,
            _id: new mongoose.Types.ObjectId(),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          delete newRecord._id;
          
          await lowerCollection.insertOne(newRecord);
          inserted++;
        }
      } catch (e) {
        console.log(`  Error processing ${record.dugaar}: ${e.message}`);
        errors++;
      }
    }
    
    console.log(`\n[MERGE] Results: Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
    console.log("[MERGE] Complete! You can now optionally drop the uppercase 'Mashin' collection.");
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (e) {
    console.error("[MERGE] Fatal error:", e);
    process.exit(1);
  }
}

mergeMashinCollections();
