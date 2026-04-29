const { MongoClient } = require("mongodb");

async function test() {
  const uris = [
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin",
    "mongodb://admin:Br1stelback1@localhost:27017/amarSukh?authSource=admin",
    "mongodb://127.0.0.1:27017/amarSukh"
  ];

  for (const uri of uris) {
    console.log(`Trying ${uri}...`);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    try {
      await client.connect();
      console.log("✅ Connected!");
      const dbs = await client.db().admin().listDatabases();
      console.log("Databases:", dbs.databases.map(d => d.name));
      await client.close();
      break;
    } catch (err) {
      console.error("❌ Failed:", err.message);
    }
  }
}

test();
