require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.useDb("nairamdalSukh");
    
    // Find Geree
    const Geree = db.collection("geree");
    const geree = await Geree.findOne({ gereeniiDugaar: "ГД-71811549" });
    console.log("=== GEREE ===");
    console.log(JSON.stringify(geree, null, 2));

    if (!geree) {
      console.log("Geree not found!");
      return;
    }

    // Find GuilgeeAvlaguud for this geree
    const Guilgee = db.collection("guilgeeavlaguuds");
    const guilgees = await Guilgee.find({ gereeniiId: geree._id.toString() }).sort({ ognoo: -1 }).toArray();
    console.log("\n=== GUILGEE AVLAGUUD ===");
    console.log(JSON.stringify(guilgees, null, 2));

    // Find Invoices for this geree
    const Nekhemjlekh = db.collection("nekhemjlekhiintuukhs");
    const invoices = await Nekhemjlekh.find({ gereeniiId: geree._id.toString() }).sort({ ognoo: -1 }).toArray();
    console.log("\n=== INVOICES ===");
    console.log(JSON.stringify(invoices, null, 2));

    // Find ZaaltUnshlalt for this geree
    const Zaalt = db.collection("zaaltunshlalts");
    const zaalts = await Zaalt.find({ gereeniiId: geree._id.toString() }).sort({ importOgnoo: -1 }).toArray();
    console.log("\n=== ZAALT UNSHLALT ===");
    console.log(JSON.stringify(zaalts, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
