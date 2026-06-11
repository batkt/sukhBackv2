require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const conn = mongoose.connection.useDb("nairamdalSukh");
  
  // Let's create schemas and models
  const Schema = mongoose.Schema;
  const mashinSchema = new Schema({
    dugaar: String,
    ezemshigchiinId: String
  }, { collection: 'mashin' }); // Explicitly set lowercase collection
  
  const MashinSchemaDefault = new Schema({
    dugaar: String,
    ezemshigchiinId: String
  }); // Let Mongoose decide

  // Compile models
  mongoose.pluralize(null);
  const ModelLowercase = conn.model('mashin', mashinSchema);
  const ModelUppercase = conn.model('Mashin', MashinSchemaDefault);

  console.log("Lowercase model collection name:", ModelLowercase.collection.name);
  console.log("Uppercase model collection name:", ModelUppercase.collection.name);

  const countLower = await ModelLowercase.countDocuments({});
  const countUpper = await ModelUppercase.countDocuments({});

  console.log(`Lowercase model doc count: ${countLower}`);
  console.log(`Uppercase model doc count: ${countUpper}`);

  const residentId = '6982ada408db41c95a43fec9';

  const lowerCars = await ModelLowercase.find({ ezemshigchiinId: residentId }).lean();
  console.log("Lowercase query results:", lowerCars);

  const upperCars = await ModelUppercase.find({ ezemshigchiinId: residentId }).lean();
  console.log("Uppercase query results:", upperCars);

  await mongoose.disconnect();
}

run().catch(console.error);
