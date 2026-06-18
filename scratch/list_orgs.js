const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");
  const db = mongoose.connection.db;
  const orgs = await db.collection("baiguullaga").find({}).toArray();
  console.log("Organizations:");
  for (const org of orgs) {
    console.log(`- ID: ${org._id.toString()}, Name: ${org.ner}, E-mail/Phone: ${org.utas || org.email}`);
  }
  
  // Let's also print active gate connections or cameras or zogsool configurations if any
  const zogsools = await db.collection("zogsool").find({}).toArray();
  console.log("\nZogsools:");
  for (const z of zogsools) {
    console.log(`- ID: ${z._id.toString()}, Name: ${z.ner}, OrgId: ${z.baiguullagiinId}, blockEntry: ${z.orokhKhyazgaarlakhEsekh || z.orokhKhyazgaarlakh || 'not set'}`);
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
