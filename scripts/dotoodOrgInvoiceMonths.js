/**
 * Standalone CLI — NOT part of API routes or controllers.
 * One fixed organization only (hardcoded below). Runs mass nekhemjlekh for chosen months.
 *
 *   node scripts/dotoodOrgInvoiceMonths.js
 *   node scripts/dotoodOrgInvoiceMonths.js --year=2026 --months=2,3
 *   node scripts/dotoodOrgInvoiceMonths.js --override
 *   node scripts/dotoodOrgInvoiceMonths.js --skip-db-name-check   # if kholbolt DB name differs on purpose
 *
 * Uses invoiceSendService.manualSendMassInvoices internally; org-specific wiring lives only here.
 * Tenant DB for this org must resolve to databaseName "dotoodSukh" (zevback kholbolt URI), or the script exits.
 */

const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const BAIGUULLAGIIN_ID = "697723dc3e77b46e52ccf577";
/** Must match the database name in this org's Mongo URI inside zevback `kholboltuud`. */
const TENANT_DATABASE_NAME = "dotoodSukh";

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });
process.env.TZ = process.env.TZ || "Asia/Ulaanbaatar";
process.setMaxListeners(0);

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const Geree = require("../models/geree");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const { manualSendMassInvoices } = require("../services/invoiceSendService");

function parseArgs(argv) {
  const out = {
    year: new Date().getFullYear(),
    months: [2, 3],
    override: false,
    barilgiinId: null,
    waitMs: 4000,
    skipDbNameCheck: false,
  };

  for (const arg of argv) {
    if (arg === "--override") out.override = true;
    else if (arg === "--skip-db-name-check") out.skipDbNameCheck = true;
    else if (arg.startsWith("--year="))
      out.year = parseInt(arg.slice("--year=".length), 10);
    else if (arg.startsWith("--months=")) {
      out.months = arg
        .slice("--months=".length)
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => n >= 1 && n <= 12);
    } else if (arg.startsWith("--barilgiinId="))
      out.barilgiinId = arg.slice("--barilgiinId=".length).trim() || null;
    else if (arg.startsWith("--waitMs="))
      out.waitMs = parseInt(arg.slice("--waitMs=".length), 10) || 4000;
  }

  if (!out.months.length) out.months = [2, 3];
  if (Number.isNaN(out.year)) out.year = new Date().getFullYear();
  return out;
}

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("dotoodOrgInvoiceMonths (standalone tool)");
  console.log("  baiguullagiinId (fixed):", BAIGUULLAGIIN_ID);
  console.log("  year:", opts.year);
  console.log(
    "  months:",
    opts.months.map((m) => `${m} (${MONTH_NAMES[m]})`).join(", "),
  );
  console.log("  override:", opts.override);
  if (opts.barilgiinId) console.log("  barilgiinId:", opts.barilgiinId);
  console.log("");

  const app = express();
  db.kholboltUusgey(
    app,
    process.env.MONGODB_URI ||
      "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin",
  );

  console.log(`Waiting ${opts.waitMs}ms for DB connections...`);
  await new Promise((r) => setTimeout(r, opts.waitMs));

  if (!db.kholboltuud || db.kholboltuud.length === 0) {
    console.error("No tenant connections (db.kholboltuud). Check MONGODB_URI.");
    process.exit(1);
  }

  const kholMatches = db.kholboltuud.filter(
    (k) => String(k.baiguullagiinId) === String(BAIGUULLAGIIN_ID),
  );
  if (kholMatches.length > 1) {
    console.warn(
      "\n⚠️  Multiple db.kholboltuud rows for this org — first match is used:",
      kholMatches.length,
    );
    kholMatches.forEach((m, i) => {
      console.warn(
        `   [${i}] databaseName: ${m.kholbolt?.db?.databaseName ?? "?"}`,
      );
    });
    console.warn("");
  }

  const kholboltEntry = getKholboltByBaiguullagiinId(BAIGUULLAGIIN_ID);
  if (!kholboltEntry) {
    console.error("No kholbolt for baiguullagiinId:", BAIGUULLAGIIN_ID);
    process.exit(1);
  }

  const mongooseConn = kholboltEntry.kholbolt;
  const tenantDbName =
    mongooseConn?.db?.databaseName ?? "(unknown)";
  let hosts = "(unknown)";
  try {
    const h = mongooseConn?.client?.options?.hosts;
    if (Array.isArray(h) && h.length) {
      hosts = h.map((x) => `${x.host}:${x.port}`).join(", ");
    }
  } catch (_e) {}

  console.log("\n========== TENANT TARGET (invoices written here) ==========");
  console.log("  MongoDB databaseName:", tenantDbName);
  console.log("  hosts:", hosts);
  try {
    const gid = String(BAIGUULLAGIIN_ID);
    const gereeTotal = await Geree(kholboltEntry).countDocuments({
      baiguullagiinId: gid,
    });
    const gereeActive = await Geree(kholboltEntry).countDocuments({
      baiguullagiinId: gid,
      tuluv: "Идэвхтэй",
    });
    const invCount = await nekhemjlekhiinTuukh(kholboltEntry).countDocuments({
      baiguullagiinId: gid,
    });
    console.log("  geree (total):", gereeTotal);
    console.log('  geree (Идэвхтэй):', gereeActive);
    console.log("  nekhemjlekhiinTuukh:", invCount);
  } catch (countErr) {
    console.warn("  (counts failed:", countErr.message, ")");
  }
  console.log(
    "  Compare databaseName to the DB you use in mongosh (e.g. use dotoodSukh).",
  );
  console.log("============================================================\n");

  if (
    !opts.skipDbNameCheck &&
    tenantDbName !== TENANT_DATABASE_NAME
  ) {
    console.error("❌ Tenant database mismatch for this org.");
    console.error(
      `   kholbolt databaseName (what the app writes to): "${tenantDbName}"`,
    );
    console.error(
      `   This script expects:                             "${TENANT_DATABASE_NAME}"`,
    );
    console.error(
      "   In MongoDB, open the registry DB your app uses on startup (often the db in MONGODB_URI),",
    );
    console.error(
      "   find the baiguullaga / tenant row for this org, and set its Mongo URI so the database",
    );
    console.error(
      `   name is ${TENANT_DATABASE_NAME} (path before ?authSource=…).`,
    );
    console.error(
      "   Until that matches, invoices will not show up in `use dotoodSukh`.",
    );
    console.error(
      "   Override: add --skip-db-name-check (not recommended).\n",
    );
    process.exit(1);
  }

  const summary = [];

  for (const month of opts.months) {
    const label = `${MONTH_NAMES[month]} ${opts.year}`;
    console.log(`\n---------- ${label} (month=${month}) ----------`);
    const result = await manualSendMassInvoices(
      BAIGUULLAGIIN_ID,
      opts.barilgiinId,
      opts.override,
      month,
      opts.year,
      null,
    );

    summary.push({ month, year: opts.year, result });

    if (!result.success) {
      console.error("Batch failed:", result.error);
      continue;
    }

    console.log(
      `Total gerees: ${result.total}, success rows: ${result.created}, errors: ${result.errors}`,
    );
    if (result.errorsList && result.errorsList.length) {
      console.log("Errors (first 20):");
      console.log(JSON.stringify(result.errorsList.slice(0, 20), null, 2));
    }
  }

  console.log("\n========== Done ==========");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
