const { MongoClient } = require("mongodb");

async function migrate() {
  const uri = "mongodb://admin:Br1stelback1@127.0.0.1:27017/?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("amarSukh");
    
    // 1. List all organizations
    const orgs = await db.collection("baiguullaga").find({}).toArray();
    console.log(`Found ${orgs.length} organizations in 'amarSukh.baiguullaga'`);

    // 2. List all database connection info (baaziinMedeelel)
    // zevbackv2 stores tenant database info here
    const connections = await db.collection("baaziinMedeelel").find({}).toArray();
    console.log(`Found ${connections.length} database connections in 'amarSukh.baaziinMedeelel'`);

    orgs.forEach(org => {
      const conn = connections.find(c => c.baiguullagiinId && c.baiguullagiinId.toString() === org._id.toString());
      console.log(`\nOrganization: ${org.ner} (${org.register})`);
      if (conn) {
        console.log(`  Database: ${conn.baaziinNer}`);
        console.log(`  Cluster: ${conn.clusterUrl}`);
      } else {
        console.log(`  No tenant database found.`);
      }
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

migrate();
