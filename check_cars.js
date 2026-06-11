const mongoose = require('mongoose');

const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  const mashinCol = db.collection('mashin');

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

  console.log("\nSearching for resident cars by any other potential ID field:");
  for (const id of residentIds) {
    const cars = await mashinCol.find({
      $or: [
        { ezemshigchiinId: mongoose.Types.ObjectId(id) },
        { ezemshigchiinId: id },
        { orshinSuugchiinId: id },
        { orshinSuugchiinId: mongoose.Types.ObjectId(id) }
      ]
    }).toArray();
    console.log(`Resident ID: ${id}, found cars (flexible):`, cars.map(c => ({ _id: c._id, dugaar: c.dugaar, ezemshigchiinId: c.ezemshigchiinId, orshinSuugchiinId: c.orshinSuugchiinId })));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
