/**
 * Migration script to populate uppercase Mashin collection from lowercase mashin
 * Copies all records from lowercase 'mashin' to uppercase 'Mashin'
 * 
 * Run: node scripts/populateUppercaseMashin.js
 */

const path = require("path");
const mongoose = require("mongoose");

// Change to project root to load env and modules properly
process.chdir(path.join(__dirname, ".."));

require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });

// Get MONGODB_URI from env or default, then replace with nairamdalSukh
const rawUri = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
const MONGODB_URI = rawUri.replace(/\/[^/\?]+\?/, "/nairamdalSukh?");

async function populateUppercaseMashin() {
  console.log("[POPULATE] Starting uppercase Mashin population...");
  console.log(`[POPULATE] Connecting to: ${MONGODB_URI.replace(/:.*@/, ":****@")}`);
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("[POPULATE] Connected to MongoDB");
    
    // Get the database
    const db = mongoose.connection.db;
    
    // Get all records from lowercase mashin collection
    const lowerCollection = db.collection("mashin");
    const upperCollection = db.collection("Mashin");
    
    const lowerRecords = await lowerCollection.find({}).toArray();
    console.log(`[POPULATE] Found ${lowerRecords.length} records in lowercase 'mashin'`);
    
    if (lowerRecords.length === 0) {
      console.log("[POPULATE] No records to copy");
      await mongoose.disconnect();
      process.exit(0);
    }
    
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    for (const record of lowerRecords) {
      try {
        const existing = await upperCollection.findOne({ dugaar: record.dugaar });
        
        if (existing) {
          // Update existing record in uppercase Mashin with data from lowercase
          await upperCollection.updateOne(
            { _id: existing._id },
            { 
              $set: {
                turul: record.turul || existing.turul,
                zochinTurul: record.zochinTurul || existing.zochinTurul,
                ezenToot: record.ezenToot || existing.ezenToot,
                orshinSuugchiinId: record.orshinSuugchiinId || existing.orshinSuugchiinId,
                ezemshigchiinNer: record.ezemshigchiinNer || existing.ezemshigchiinNer,
                ezemshigchiinUtas: record.ezemshigchiinUtas || existing.ezemshigchiinUtas,
                baiguullagiinId: record.baiguullagiinId || existing.baiguullagiinId,
                barilgiinId: record.barilgiinId || existing.barilgiinId,
                updatedAt: new Date()
              }
            }
          );
          updated++;
        } else {
          // Insert new record into uppercase Mashin
          const newRecord = {
            ...record,
            _id: new mongoose.Types.ObjectId(),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          delete newRecord._id;
          
          await upperCollection.insertOne(newRecord);
          inserted++;
        }
      } catch (e) {
        console.log(`  Error processing ${record.dugaar}: ${e.message}`);
        errors++;
      }
    }
    
    console.log(`\n[POPULATE] Results: Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
    console.log("[POPULATE] Complete!");
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (e) {
    console.error("[POPULATE] Fatal error:", e);
    process.exit(1);
  }
}

populateUppercaseMashin();
