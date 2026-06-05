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

    console.log(`Checking and modifying ${dbNames.length} databases...\n`);

    let totalModified = 0;

    for (const dbName of dbNames) {
      if (["admin", "config", "local"].includes(dbName)) continue;

      const tenantDb = mongoose.connection.useDb(dbName);
      
      const collections = await tenantDb.db.listCollections().toArray();
      const hasGeree = collections.some(c => c.name === "geree");

      if (!hasGeree) continue;

      const Geree = tenantDb.collection("geree");

      // Update documents to pull matching zardluud items by name
      const result = await Geree.updateMany(
        { "zardluud.ner": { $in: targetNames } },
        { $pull: { zardluud: { ner: { $in: targetNames } } } }
      );

      if (result.modifiedCount > 0) {
        console.log(`==================================================`);
        console.log(`Database: ${dbName}`);
        console.log(`Modified ${result.modifiedCount} contract(s) (Matched: ${result.matchedCount})`);
        console.log(`==================================================\n`);
        totalModified += result.modifiedCount;
      }
    }

    console.log("--------------------------------------------------");
    console.log(`Removal completed. Total modified contracts: ${totalModified}`);
    console.log("--------------------------------------------------");

  } catch (error) {
    console.error("Error running removal script:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
