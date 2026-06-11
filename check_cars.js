require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // List all databases
  const adminDb = mongoose.connection.db.admin();
  const dbs = await adminDb.listDatabases();
  console.log("Databases list:", dbs.databases.map(d => d.name));

  // Let's check "nairamdalSukh" db specifically
  const db = mongoose.connection.useDb("nairamdalSukh");
  const mashinCol = db.collection('mashin');
  
  const count = await mashinCol.countDocuments({});
  console.log(`Document count in nairamdalSukh.mashin: ${count}`);

  const residentIds = [
    '6982ada408db41c95a43fec9',
    '6982ada408db41c95a43fe7a',
    '6982ada308db41c95a43fe2b'
  ];

  console.log("\nSearching for resident cars by ezemshigchiinId:");
  for (const id of residentIds) {
    const cars = await mashinCol.find({ ezemshigchiinId: id }).toArray();
    console.log(`Resident ID: ${id}, found cars:`, cars.map(c => ({ _id: c._id, dugaar: c.dugaar, ezemshigchiinId: c.ezemshigchiinId })));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
