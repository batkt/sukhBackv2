const { MongoClient } = require("mongodb");

async function test() {
  const uri = "mongodb://127.0.0.1:27017";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log("✅ Connected without auth!");
    const dbs = await client.db().admin().listDatabases();
    console.log("Databases:", dbs.databases.map(d => d.name));
    await client.close();
  } catch (err) {
    console.error("❌ Failed without auth:", err.message);
  }
}

test();
