const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const MONGODB_URI_BASE = "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

async function compare() {
  try {
    const tenant = "nairamdalSukh";
    const legacyDb = "nairamdalSukh_legacy";
    
    console.log(`🚀 Comparing balances per resident for ${tenant}...`);
    
    const legacyConn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", legacyDb)).asPromise();
    const targetConn = await mongoose.createConnection(MONGODB_URI_BASE.replace("{db}", tenant)).asPromise();

    // 1. Get all legacy contracts and their balances
    const legacyCharges = await legacyConn.collection("gereeniiTulukhAvlaga").find({}).toArray();
    const legacyPayments = await legacyConn.collection("gereeniiTulsunAvlaga").find({}).toArray();

    const legacyBalances = {};
    legacyCharges.forEach(r => {
      const gid = String(r.gereeniiId);
      legacyBalances[gid] = (legacyBalances[gid] || 0) + Number(r.undsenDun || r.tulukhDun || 0);
    });
    legacyPayments.forEach(r => {
      const gid = String(r.gereeniiId);
      legacyBalances[gid] = (legacyBalances[gid] || 0) - Number(r.tulsunDun || 0);
    });

    // 2. Get all target records and calculate balances per contract
    const targetEntries = await targetConn.collection("guilgeeAvlaguud").find({}).toArray();
    const targetBalances = {};
    targetEntries.forEach(r => {
      const gid = String(r.gereeniiId);
      if (!gid || gid === "undefined") return;

      const type = String(r.turul || "").toLowerCase();
      const amount = Number(r.undsenDun || r.tulukhDun || r.dun || 0);
      const tulsun = Number(r.tulsunDun || 0);
      const isPayment = ["tulult", "төлөлт", "төлбөр", "invoice_payment"].includes(type) || amount < 0;

      if (isPayment) {
        const pAmt = amount < 0 ? Math.abs(amount) : tulsun;
        targetBalances[gid] = (targetBalances[gid] || 0) - pAmt;
      } else {
        targetBalances[gid] = (targetBalances[gid] || 0) + amount;
      }
    });

    // 3. Compare
    console.log("\n❌ DISCREPANCIES FOUND:");
    console.log("--------------------------------------------------");
    console.log("Contract ID          | Legacy Bal | Target Bal | Diff");
    console.log("--------------------------------------------------");

    let totalDiff = 0;
    const allGids = new Set([...Object.keys(legacyBalances), ...Object.keys(targetBalances)]);
    
    for (const gid of allGids) {
      const leg = legacyBalances[gid] || 0;
      const tar = targetBalances[gid] || 0;
      const diff = leg - tar;

      if (Math.abs(diff) > 1) {
        console.log(`${gid.padEnd(20)} | ${leg.toFixed(2).padStart(10)} | ${tar.toFixed(2).padStart(10)} | ${diff.toFixed(2).padStart(10)}`);
        totalDiff += diff;
      }
    }

    console.log("--------------------------------------------------");
    console.log(`TOTAL DISCREPANCY: ${totalDiff.toLocaleString()} ₮`);

    await legacyConn.close();
    await targetConn.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

compare();
