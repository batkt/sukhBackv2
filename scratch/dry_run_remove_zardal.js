const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

// Load environment variables
require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });

const targetIds = [
  new ObjectId("6a05830ca481717f34d6480c"), // ner: 'ttt'
  new ObjectId("6a05832ddfd2324d9e69d4c4"), // ner: 'test'
  new ObjectId("6a22723ff360e75de5b108a5")  // ner: 'Ажиллах хүчний зардал'
];

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
      // Exclude system databases if appropriate, but let's check everything
      if (["admin", "config", "local"].includes(dbName)) continue;

      const tenantDb = mongoose.connection.useDb(dbName);
      
      // Get all collections
      const collections = await tenantDb.db.listCollections().toArray();
      const hasGeree = collections.some(c => c.name === "geree");

      if (!hasGeree) continue;

      const Geree = tenantDb.collection("geree");

      // Find contracts that have any of the target IDs in their zardluud array
      const matches = await Geree.find({
        "zardluud._id": { $in: targetIds }
      }).toArray();

      if (matches.length > 0) {
        console.log(`==================================================`);
        console.log(`Database: ${dbName} | Found ${matches.length} matching contract(s)`);
        console.log(`==================================================`);

        for (const contract of matches) {
          console.log(`Contract: ${contract.gereeniiDugaar || "No contract number"} | Toot: ${contract.toot || "N/A"} | Resident: ${contract.ner || ""} ${contract.ovog || ""}`);
          
          const itemsToRemove = contract.zardluud.filter(z => 
            z._id && targetIds.some(tid => tid.equals(z._id))
          );

          console.log("Items to be removed:");
          itemsToRemove.forEach(item => {
            console.log(`  - _id: ${item._id.toString()} | Name: "${item.ner}" | Type: ${item.turul} | Tariff: ${item.tariff}`);
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
