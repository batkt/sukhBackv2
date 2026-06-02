const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const BAIGUULLAGIIN_ID = "69f3f56a2899d5fdc24251d1";

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

async function main() {
  const app = express();
  db.kholboltUusgey(
    app,
    process.env.MONGODB_URI ||
      "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin",
  );

  await new Promise((r) => setTimeout(r, 4000));

  const kholboltEntry = getKholboltByBaiguullagiinId(BAIGUULLAGIIN_ID);
  if (!kholboltEntry) {
    console.error("No kholbolt entry!");
    process.exit(1);
  }

  const Geree = require("../models/geree")(kholboltEntry);
  const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh")(kholboltEntry);
  const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud")(kholboltEntry);

  const geree = await Geree.findOne({ gereeniiDugaar: "ГД-48834429" }).lean();
  console.log("=== CONTRACT ===");
  console.log(JSON.stringify(geree, null, 2));

  if (geree) {
    const invoices = await NekhemjlekhiinTuukh.find({ gereeniiId: geree._id.toString() }).lean();
    console.log("\n=== INVOICES ===");
    console.log(JSON.stringify(invoices, null, 2));

    const ledger = await GuilgeeAvlaguud.find({ gereeniiId: geree._id.toString() }).lean();
    console.log("\n=== LEDGER ENTRIES ===");
    console.log(JSON.stringify(ledger, null, 2));
  }

  process.exit(0);
}

main().catch(console.error);
