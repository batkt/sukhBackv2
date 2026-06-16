const { MongoClient, ObjectId } = require("mongodb");

async function main() {
  const uri = "mongodb://admin:Br1stelback1@127.0.0.1:27017/?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const adminDb = client.db("amarSukh");
    
    // Get all tenant databases
    const connections = await adminDb.collection("baaziinMedeelel").find({}).toArray();
    console.log(`Found ${connections.length} tenant databases.`);

    const targetId = "6a21af56f360e75de5aba45a";
    let foundInvoice = null;
    let foundDbName = null;

    for (const conn of connections) {
      const dbName = conn.baaziinNer;
      if (!dbName) continue;
      
      try {
        const db = client.db(dbName);
        const inv = await db.collection("nekhemjlekhiintuukhs").findOne({ _id: new ObjectId(targetId) });
        if (inv) {
          foundInvoice = inv;
          foundDbName = dbName;
          break;
        }
      } catch (err) {
        // Skip databases where table doesn't exist or other error
      }
    }

    if (!foundInvoice) {
      console.error(`Invoice not found for ID: ${targetId} in any database.`);
      return;
    }

    console.log("\n=== INVOICE DETAILS ===");
    console.log(JSON.stringify(foundInvoice, null, 2));

    if (foundInvoice.qpayInvoiceId) {
      console.log("\n=== QUICK QPAY OBJECT DETAILS ===");
      try {
        const db = client.db(foundDbName);
        const qpayRec = await db.collection("quickqpayobjects").findOne({ invoice_id: foundInvoice.qpayInvoiceId });
        console.log(JSON.stringify(qpayRec, null, 2));
      } catch (err) {
        console.error("Failed to fetch QuickQpayObject:", err.message);
      }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
