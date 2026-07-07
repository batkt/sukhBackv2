// Verifies the indexes added to models/*.js sync to real tenant collections.
// Explicitly invokes each model factory (Model(kholbolt)) so Mongoose's
// autoIndex runs createIndexes() before we read them back - just having
// schema.index() declared does nothing until a model is compiled on that
// connection. Does not start Express's .listen() or schedule any cron.
const { db } = require("zevbackv2");
const express = require("express");
const app = express();

const MODELS_TO_CHECK = [
  ["geree", require("../models/geree")],
  ["guilgeeAvlaguud", require("../models/guilgeeAvlaguud")],
  ["nekhemjlekhiinTuukh", require("../models/nekhemjlekhiinTuukh")],
  ["mashin", require("../models/mashin")],
  ["medegdel", require("../models/medegdel")],
  ["ebarimt", require("../models/ebarimt")],
  ["ebarimtShine", require("../models/ebarimtShine")],
  ["bankniiGuilgee", require("../models/bankniiGuilgee")],
  ["zogsool", require("../models/zogsool")],
];

async function main() {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  await db.kholboltUusgey(app, MONGODB_URI);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const targets = [
    { label: "erunkhiiKholbolt (global)", kholbolt: db.erunkhiiKholbolt },
    ...db.kholboltuud
      .filter((k) => k.baiguullagiinId)
      .slice(0, 3)
      .map((k) => ({ label: `tenant ${k.baiguullagiinId}`, kholbolt: k })),
  ];

  for (const { label, kholbolt } of targets) {
    console.log(`\n=== ${label} ===`);
    for (const [name, factory] of MODELS_TO_CHECK) {
      try {
        const Model = factory(kholbolt);
        // Force index sync now instead of waiting on background autoIndex timing
        await Model.createIndexes();
        const indexes = await Model.collection.getIndexes();
        console.log(`  ${name}:`, Object.keys(indexes).join(", "));
      } catch (err) {
        console.log(`  ${name}: (skip - ${err.message})`);
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
