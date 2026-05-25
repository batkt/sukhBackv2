require("dotenv").config({ path: "./tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.useDb("nairamdalSukh");
    
    const Geree = db.collection("geree");
    const OrshinSuugch = db.collection("orshinSuugch");
    const Guilgee = db.collection("guilgeeAvlaguud");

    const geree = await Geree.findOne({ gereeniiDugaar: "ГД-71811549" });
    console.log("=== GEREE EKHNII ULDEGDEL ===");
    console.log("Geree ekhniiUldegdel:", geree ? geree.ekhniiUldegdel : "None");
    console.log("Geree orshinSuugchId:", geree ? geree.orshinSuugchId : "None");

    if (geree && geree.orshinSuugchId) {
      const suugch = await OrshinSuugch.findOne({ _id: new mongoose.Types.ObjectId(geree.orshinSuugchId) });
      console.log("\n=== ORSHIN SUUGCH DETAILS ===");
      console.log("OrshinSuugch ekhniiUldegdel:", suugch ? suugch.ekhniiUldegdel : "None");
      console.log("OrshinSuugch toots:", suugch ? JSON.stringify(suugch.toots, null, 2) : "None");
    }

    const ekhniiGuilgees = await Guilgee.find({ 
      gereeniiId: geree ? geree._id.toString() : "",
      ekhniiUldegdelEsekh: true
    }).toArray();

    console.log("\n=== LEDGER EKHNII ULDEGDEL CHARGES ===");
    console.log(JSON.stringify(ekhniiGuilgees, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
