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

    console.log(`Checking and modifying ${dbNames.length} databases...\n`);

    let totalModified = 0;

    for (const dbName of dbNames) {
      if (["admin", "config", "local"].includes(dbName)) continue;

      const tenantDb = mongoose.connection.useDb(dbName);
      
      const collections = await tenantDb.db.listCollections().toArray();
      const hasGeree = collections.some(c => c.name === "geree");

      if (!hasGeree) continue;

      const Geree = tenantDb.collection("geree");

      // Update documents to pull matching zardluud items
      const result = await Geree.updateMany(
        { "zardluud._id": { $in: targetIds } },
        { $pull: { zardluud: { _id: { $in: targetIds } } } }
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
