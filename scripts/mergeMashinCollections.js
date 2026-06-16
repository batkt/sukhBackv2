/**
 * Migration script to merge Mashin and mashin collections
 * Copies all records from uppercase 'Mashin' to lowercase 'mashin'
 * Updates existing records in lowercase 'mashin' if they exist in both
 * 
 * Run: node scripts/mergeMashinCollections.js
 */

const { db } = require("zevbackv2");

async function mergeMashinCollections() {
  console.log("[MERGE] Starting mashin collection merge...");
  
  try {
    const kholboltuud = db.kholboltuud || [];
    console.log(`[MERGE] Found ${kholboltuud.length} database connections`);
    
    for (const kholbolt of kholboltuud) {
      if (!kholbolt.kholbolt) continue;
      
      const baiguullagiinId = kholbolt.baiguullagiinId;
      console.log(`\n[MERGE] Processing organization: ${baiguullagiinId}`);
      
      try {
        const mashinModel = require("../models/mashin");
        const MashinUpper = require("sukhParking-v1").Mashin;
        
        // Get all records from uppercase Mashin
        const upperRecords = await MashinUpper(kholbolt.kholbolt).find({}).lean();
        console.log(`  - Found ${upperRecords.length} records in uppercase 'Mashin'`);
        
        if (upperRecords.length === 0) {
          console.log(`  - No records to merge`);
          continue;
        }
        
        let inserted = 0;
        let updated = 0;
        let errors = 0;
        
        for (const record of upperRecords) {
          try {
            const existing = await mashinModel(kholbolt.kholbolt).findOne({
              dugaar: record.dugaar
            }).lean();
            
            if (existing) {
              // Update existing record in lowercase mashin with data from uppercase
              await mashinModel(kholbolt.kholbolt).updateOne(
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
                _id: undefined, // Let MongoDB generate new _id
                createdAt: new Date(),
                updatedAt: new Date()
              };
              delete newRecord._id;
              
              await mashinModel(kholbolt.kholbolt).create(newRecord);
              inserted++;
            }
          } catch (e) {
            console.log(`    Error processing ${record.dugaar}: ${e.message}`);
            errors++;
          }
        }
        
        console.log(`  - Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`);
        
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
    
    console.log("\n[MERGE] Complete!");
    console.log("You can now optionally drop the uppercase 'Mashin' collection after verifying everything works.");
    process.exit(0);
    
  } catch (e) {
    console.error("[MERGE] Fatal error:", e);
    process.exit(1);
  }
}

mergeMashinCollections();
