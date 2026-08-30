const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Parse tokhirgoo.env
const envPath = path.join(__dirname, "../tokhirgoo/tokhirgoo.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...vals] = line.split("=");
    if (key && vals.length) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  });
}

async function inspectUnknownPaid() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  await mongoose.connect(uri);
  const mainDb = mongoose.connection.db;

  const adminDb = mainDb.admin();
  const dbsInfo = await adminDb.listDatabases();
  const excluded = ["admin", "config", "local"];
  const tenantDbs = dbsInfo.databases.filter((d) => !excluded.includes(d.name));

  const targetAmounts = [139237.18, 52610, 104325.48, 52051.75, 73333.36, 698170, 48018.79, 163560.32, 54186.71, 220641.98, 93589.2, 26399];

  console.log("🔍 Inspecting records for [23]-[34] across databases...\n");

  for (const dbInfo of tenantDbs) {
    const tDb = mongoose.connection.useDb(dbInfo.name).db;
    const collections = await tDb.listCollections().toArray();
    const qCollName = collections.find((c) => c.name.toLowerCase().includes("quickqpay") || c.name.toLowerCase() === "qpay")?.name;

    if (qCollName) {
      const docs = await tDb.collection(qCollName).find({}).toArray();
      for (const doc of docs) {
        const amt = doc.dun || doc.amount || doc.qpay?.amount || 0;
        const matches = targetAmounts.some((t) => Math.abs(t - amt) < 1);

        if (matches) {
          console.log("--------------------------------------------------");
          console.log(`Бааз (Tenant DB): ${dbInfo.name}`);
          console.log(`Дүн: ${amt} ₮`);
          console.log(`Тайлбар / Description: ${doc.tailbar || doc.qpay?.description || doc.description || "-"}`);
          console.log(`Захиалгын дугаар: ${doc.zakhialgiinDugaar || doc.order_no || "-"}`);
          console.log(`Утас / Утасны дугаар: ${doc.utas || doc.phone || doc.phoneNumber || "-"}`);
          console.log(`Нэр: ${doc.ner || doc.customerName || doc.name || "-"}`);
          console.log(`Гэрээ / Тоот: ${doc.gereeniiDugaar || doc.gereeniiId || doc.toot || "-"}`);
          console.log(`Source: ${doc.source || "-"}`);
          console.log(`Огноо: ${doc.createdAt || doc.date || doc.updatedAt || "-"}`);
          console.log(`Payment Status: ${doc.tulsunEsekh ? "ТӨЛӨГДСӨН (tulsunEsekh=true)" : doc.invoice_status || doc.status}`);
          console.log(`WalletPaymentId: ${doc.walletPaymentId || "-"}`);
          console.log(`BillingId: ${doc.billingId || "-"}`);
        }
      }
    }
  }

  console.log("--------------------------------------------------\n");
  await mongoose.disconnect();
}

inspectUnknownPaid().catch(console.error);
