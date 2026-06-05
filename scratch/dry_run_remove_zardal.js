const mongoose = require("mongoose");
const path = require("path");

// Load environment variables relative to this script's directory
require("dotenv").config({ path: path.join(__dirname, "..", "tokhirgoo", "tokhirgoo.env") });

const targetNames = ['ttt', 'test', 'Ажиллах хүчний зардал'];

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected successfully.\n");

    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    const dbNames = dbs.databases.map(d => d.name);

    console.log(`Checking ${dbNames.length} databases for 'geree' collections...\n`);

    let totalMatches = 0;

    for (const dbName of dbNames) {
      if (["admin", "config", "local"].includes(dbName)) continue;

      const tenantDb = mongoose.connection.useDb(dbName);
      
      const collections = await tenantDb.db.listCollections().toArray();
      const hasGeree = collections.some(c => c.name === "geree");

      if (!hasGeree) continue;

      const Geree = tenantDb.collection("geree");

      // Find contracts that have any matching zardluud items by name
      const matches = await Geree.find({
        zardluud: {
          $elemMatch: {
            ner: { $in: targetNames }
          }
        }
      }).toArray();

      if (matches.length > 0) {
        console.log(`==================================================`);
        console.log(`Database: ${dbName} | Found ${matches.length} matching contract(s)`);
        console.log(`==================================================`);

        for (const contract of matches) {
          console.log(`Contract: ${contract.gereeniiDugaar || "No contract number"} | Toot: ${contract.toot || "N/A"} | Resident: ${contract.ner || ""} ${contract.ovog || ""}`);
          console.log(`Contract Building ID: ${contract.barilgiinId ? contract.barilgiinId.toString() : "N/A"}`);
          
          const itemsToRemove = contract.zardluud.filter(z => 
            z && targetNames.includes(z.ner)
          );

          console.log("Items to be removed:");
          itemsToRemove.forEach(item => {
            console.log(`  - _id: ${item._id ? item._id.toString() : "N/A"} | Name: "${item.ner}" | BuildingID: ${item.barilgiinId ? item.barilgiinId.toString() : "N/A"} | Type: ${item.turul} | Tariff: ${item.tariff}`);
          });
          console.log();
          totalMatches += itemsToRemove.length;
        }
      }
    }

    console.log("--------------------------------------------------");
    console.log(`Dry Run completed. Total zardal items to remove: ${totalMatches}`);
    console.log("--------------------------------------------------");

  } catch (error) {
    console.error("Error running dry run:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
