const mongoose = require("mongoose");

async function test() {
  const uri = "mongodb://admin:Br1stelback1@localhost:27017/amarSukh?authSource=admin";
  console.log("Connecting to:", uri);
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log("✅ Connected to amarSukh");
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));

    if (collections.some(c => c.name === 'baiguullaga')) {
      const orgs = await mongoose.connection.db.collection('baiguullaga').find({}).toArray();
      console.log(`Found ${orgs.length} organizations:`);
      orgs.forEach(o => console.log(`- ${o.ner} (${o._id})`));
    }

    if (collections.some(c => c.name === 'baaziinMedeelel')) {
      const conns = await mongoose.connection.db.collection('baaziinMedeelel').find({}).toArray();
      console.log(`Found ${conns.length} database connections:`);
      conns.forEach(c => console.log(`- ${c.baaziinNer} for org ${c.baiguullagiinId}`));
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Connection failed!");
    console.error("Error Name:", err.name);
    console.error("Error Message:", err.message);
    if (err.reason) {
      console.error("Reason:", JSON.stringify(err.reason, null, 2));
    }
  }
}

test();
