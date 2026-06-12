const { MongoClient } = require("mongodb");
const fs = require("fs");

const uri = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

async function main() {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  try {
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("✅ Connected!");

    // Search in nairamdalSukh database
    const dbSukh = client.db("nairamdalSukh");
    // Search in amarSukh database
    const dbAmar = client.db("amarSukh");

    const searchStr = "71812301";
    console.log(`Searching for string: "${searchStr}"`);

    const results = {};

    // 1. Search in amarSukh.walletinvoices
    try {
      const walletInvoices = await dbAmar.collection("walletinvoices").find({
        $or: [
          { walletInvoiceId: searchStr },
          { walletPaymentId: searchStr },
          { zakhialgiinDugaar: searchStr },
          { userId: searchStr },
          { billIds: searchStr }
        ]
      }).toArray();
      results.amarSukh_walletinvoices = walletInvoices;
      console.log(`Found in amarSukh.walletinvoices: ${walletInvoices.length}`);
    } catch (e) {
      console.error("Error searching walletinvoices:", e.message);
    }

    // 2. Search in nairamdalSukh.quickqpayobjects
    try {
      const qpayObjs = await dbSukh.collection("quickqpayobjects").find({
        $or: [
          { zakhialgiinDugaar: new RegExp(searchStr, "i") },
          { walletPaymentId: searchStr },
          { walletInvoiceId: searchStr },
          { invoice_id: searchStr },
          { "qpay.description": new RegExp(searchStr, "i") }
        ]
      }).toArray();
      results.nairamdalSukh_quickqpayobjects = qpayObjs;
      console.log(`Found in nairamdalSukh.quickqpayobjects: ${qpayObjs.length}`);
    } catch (e) {
      console.error("Error searching quickqpayobjects:", e.message);
    }

    // 3. Search in nairamdalSukh.bankniiguilgees
    try {
      const bankGuilgees = await dbSukh.collection("bankniiguilgees").find({
        $or: [
          { description: new RegExp(searchStr, "i") },
          { record: searchStr },
          { tranId: searchStr }
        ]
      }).toArray();
      results.nairamdalSukh_bankniiguilgees = bankGuilgees;
      console.log(`Found in nairamdalSukh.bankniiguilgees: ${bankGuilgees.length}`);
    } catch (e) {
      console.error("Error searching bankniiguilgees:", e.message);
    }

    // 4. Search in nairamdalSukh.ebarimtshines
    try {
      const ebarimts = await dbSukh.collection("ebarimtshines").find({
        $or: [
          { id: searchStr },
          { receiptId: searchStr },
          { nekhemjlekhiinId: searchStr },
          { customerNo: searchStr }
        ]
      }).toArray();
      results.nairamdalSukh_ebarimtshines = ebarimts;
      console.log(`Found in nairamdalSukh.ebarimtshines: ${ebarimts.length}`);
    } catch (e) {
      console.error("Error searching ebarimtshines:", e.message);
    }

    // 5. Search in nairamdalSukh.guilgees
    try {
      const guilgees = await dbSukh.collection("guilgees").find({
        $or: [
          { guilgeeniiDugaar: new RegExp(searchStr, "i") },
          { "tulbur.khariltsagchiinId": searchStr }
        ]
      }).toArray();
      results.nairamdalSukh_guilgees = guilgees;
      console.log(`Found in nairamdalSukh.guilgees: ${guilgees.length}`);
    } catch (e) {
      console.error("Error searching guilgees:", e.message);
    }

    // 6. Generic search in all collections of nairamdalSukh for "71812301"
    console.log("Performing generic search in all collections...");
    const collections = await dbSukh.listCollections().toArray();
    for (const collInfo of collections) {
      const collName = collInfo.name;
      if (["system.profile", "system.indexes"].includes(collName)) continue;
      try {
        const count = await dbSukh.collection(collName).countDocuments({
          $or: [
            { _id: searchStr },
            { zakhialgiinDugaar: searchStr },
            { walletPaymentId: searchStr },
            { invoice_id: searchStr },
            { nekhemjlekhiinId: searchStr },
            { record: searchStr },
            { tranId: searchStr }
          ]
        });
        if (count > 0) {
          console.log(`Generic Match in collection ${collName}: ${count} records`);
          const matchedDocs = await dbSukh.collection(collName).find({
            $or: [
              { _id: searchStr },
              { zakhialgiinDugaar: searchStr },
              { walletPaymentId: searchStr },
              { invoice_id: searchStr },
              { nekhemjlekhiinId: searchStr },
              { record: searchStr },
              { tranId: searchStr }
            ]
          }).toArray();
          results[`generic_${collName}`] = matchedDocs;
        }
      } catch (err) {
        // ignore
      }
    }

    fs.writeFileSync("./search_results.json", JSON.stringify(results, null, 2));
    console.log("Search completed. Results saved to search_results.json");

  } catch (err) {
    console.error("Main Error:", err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

main();
