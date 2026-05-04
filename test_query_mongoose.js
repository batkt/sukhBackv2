require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");
const GuilgeeAvlaguud = require("./models/guilgeeAvlaguud");
const { db } = require("zevbackv2");

async function run() {
  const baiguullagiinId = "69f3f56a2899d5fdc24251d1"; // The user's specific baiguullagiinId
  try {
    console.log("Connecting to core DB...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Core db has kholboltuud inside "baiguullaguud" or similar, 
    // but zevbackv2 does this dynamically. Let's just connect manually to the tenant DB!
    // Often tenant db is "amarSukh_" + baiguullagiinId or something, let's look at how zevbackv2 does it.
    // Actually, I can just use zevbackv2's `db.erunkhiiKholbolt`. Wait, `db.kholboltUusgey` does the magic.
    
    // Instead of complex zevbackv2, let me just find out the DB names directly.
    const adminDb = mongoose.connection.useDb("amarSukh");
    const Baiguullaga = adminDb.model("Baiguullaga", new mongoose.Schema({}, { strict: false }));
    const b = await Baiguullaga.findById(baiguullagiinId);
    console.log("Found Baiguullaga:", b ? b.ner : "None");
    
    // Get all databases
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log("Databases:", dbs.databases.map(d => d.name).join(", "));
    
    // Check zevSukh database
    const zevSukhDb = mongoose.connection.useDb("nairamdalSukh");
    const guilgee = zevSukhDb.collection("guilgeeavlaguuds");
    
    console.log("\n--- MAY 2026 CHARGES (dun > 0) ---");
    const charges = await guilgee.find({
      baiguullagiinId: baiguullagiinId,
      ognoo: {
        $gte: new Date("2026-05-01T00:00:00Z"),
        $lte: new Date("2026-05-31T23:59:59Z")
      },
      dun: { $gt: 0 }
    }).toArray();
    console.log(`Found ${charges.length} charges for May.`);
    
    console.log("\n--- MAY 2026 PAYMENTS (dun < 0) ---");
    const payments = await guilgee.find({
      baiguullagiinId: baiguullagiinId,
      ognoo: {
        $gte: new Date("2026-05-01T00:00:00Z"),
        $lte: new Date("2026-05-31T23:59:59Z")
      },
      dun: { $lt: 0 }
    }).toArray();
    console.log(`Found ${payments.length} payments for May.`);
    
    const paymentSum = payments.reduce((sum, p) => sum + p.dun, 0);
    console.log(`Sum of payments in May: ${Math.abs(paymentSum)}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
