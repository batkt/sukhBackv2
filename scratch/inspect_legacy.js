const mongoose = require("mongoose");

async function inspect() {
  try {
    const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const baiguullagaSchema = new mongoose.Schema({}, { strict: false });
    const Baiguullaga = mongoose.model("baiguullaga", baiguullagaSchema, "baiguullaga");

    const organizations = await Baiguullaga.find({}).lean();
    console.log(`Found ${organizations.length} organizations:`);
    organizations.forEach(org => {
      console.log(`- ${org.ner} (ID: ${org._id}, Register: ${org.register})`);
    });

    // Check if there are other collections that might be relevant
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("\nCollections in amarSukh database:");
    collections.forEach(c => console.log(`- ${c.name}`));

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

inspect();
