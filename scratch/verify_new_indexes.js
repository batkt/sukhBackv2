// Read-only check: confirms the indexes added in models/*.js actually exist
// on real tenant collections. Does not start Express or schedule any cron.
const { db } = require("zevbackv2");
const express = require("express");
const app = express();

const COLLECTIONS_TO_CHECK = [
  "geree",
  "guilgeeAvlaguud",
  "nekhemjlekhiinTuukh",
  "mashin",
  "medegdel",
  "ebarimt",
  "ebarimtShine",
  "bankniiGuilgee",
  "zogsool",
];

async function main() {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  await db.kholboltUusgey(app, MONGODB_URI);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check ajiltan/orshinSuugch/khariltsagch (global connection) + a sample of tenant connections
  const targets = [
    { label: "erunkhiiKholbolt (global)", kholbolt: db.erunkhiiKholbolt },
    ...db.kholboltuud.slice(0, 3).map((k) => ({ label: `tenant ${k.baiguullagiinId}`, kholbolt: k })),
  ];

  for (const { label, kholbolt } of targets) {
    console.log(`\n=== ${label} ===`);
    for (const name of COLLECTIONS_TO_CHECK) {
      try {
        const conn = kholbolt.kholbolt || kholbolt;
        const collection = conn.collection(name);
        const indexes = await collection.getIndexes();
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
