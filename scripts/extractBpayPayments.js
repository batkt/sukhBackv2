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

async function extractBpayData() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  console.log("🔌 Connecting to:", uri.replace(/:([^:@]+)@/, ":****@"));
  await mongoose.connect(uri);
  const mainDb = mongoose.connection.db;

  console.log("📊 Analyzing BPay / Wallet Payments & eBarimts...\n");

  // 1. Check walletInvoice collection (Main DB)
  const walletInvoices = await mainDb.collection("walletInvoice").find({}).toArray();

  // 2. Check ebarimtShine collection for Wallet/BPay sources
  const walletEbarimts = await mainDb
    .collection("ebarimtShine")
    .find({
      $or: [
        { source: "WALLET_API" },
        { source: "WALLET_QPAY" },
        { source: "WALLET" },
        { source: "wallet" },
        { source: "bpay" },
        { source: "BPAY" },
        { walletPaymentId: { $exists: true, $ne: null } },
        { walletInvoiceId: { $exists: true, $ne: null } },
      ],
    })
    .toArray();

  // 3. Check all tenant databases for guilgeeAvlaguud & ebarimtShine
  const adminDb = mainDb.admin();
  const dbsInfo = await adminDb.listDatabases();
  const excluded = ["admin", "config", "local"];
  const tenantDbs = dbsInfo.databases.filter((d) => !excluded.includes(d.name));

  const allTenantLedgerPayments = [];
  const allTenantEbarimts = [];

  for (const dbInfo of tenantDbs) {
    const tDb = mongoose.connection.useDb(dbInfo.name);
    const rawTDb = tDb.db;

    // Check guilgeeAvlaguud
    try {
      const gColl = rawTDb.collection("guilgeeAvlaguud");
      const walletLedgers = await gColl
        .find({
          $or: [
            { source: "wallet" },
            { source: "WALLET_API" },
            { source: "bpay" },
            { source: "BPAY" },
            { tailbar: { $regex: "bpay|wallet", $options: "i" } },
          ],
        })
        .toArray();

      walletLedgers.forEach((l) => {
        allTenantLedgerPayments.push({ ...l, _db: dbInfo.name });
      });
    } catch (e) {}

    // Check ebarimtShine in tenant DB
    try {
      const eColl = rawTDb.collection("ebarimtShine");
      const tEbarimts = await eColl
        .find({
          $or: [
            { source: "WALLET_API" },
            { source: "WALLET_QPAY" },
            { source: "WALLET" },
            { source: "wallet" },
            { walletPaymentId: { $exists: true, $ne: null } },
          ],
        })
        .toArray();

      tEbarimts.forEach((e) => {
        allTenantEbarimts.push({ ...e, _db: dbInfo.name });
      });
    } catch (e) {}
  }

  // Combine eBarimts
  const totalEbarimts = [...walletEbarimts, ...allTenantEbarimts];
  const successfulEbarimts = totalEbarimts.filter(
    (e) => e.lottery || e.qrData || e.status === "SUCCESS" || e.ebarimtId
  );

  console.log("========================================================");
  console.log("💳 [1] BPAY / WALLET НЭХЭМЖЛЭХҮҮД (walletInvoice):");
  console.log(`Нийт үүссэн Wallet нэхэмжлэх: ${walletInvoices.length}`);
  const totalInvoiceAmount = walletInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  console.log(`Нийт дүн: ${totalInvoiceAmount.toLocaleString()} ₮`);

  console.log("\n========================================================");
  console.log("🧾 [2] BPAY-Р ТӨЛӨГДӨЖ И-БАРИМТ ҮҮССЭН БАЙДАЛ (ebarimtShine):");
  console.log(`Нийт BPay холбогдолтой И-Баримт: ${totalEbarimts.length}`);
  console.log(`✅ Амжилттай гарсан И-Баримт (Сугалаа/QR кодтой): ${successfulEbarimts.length}`);
  const totalEbarimtAmount = successfulEbarimts.reduce((sum, eb) => sum + (eb.dun || eb.amount || 0), 0);
  console.log(`Амжилттай баримтын нийт төлбөрийн дүн: ${totalEbarimtAmount.toLocaleString()} ₮`);

  console.log("\n========================================================");
  console.log("📒 [3] ГҮЙЛГЭЭНИЙ ДЭВТЭРТ (guilgeeAvlaguud) СУУСАН BPAY ТӨЛӨЛТҮҮД:");
  console.log(`Нийт бүртгэгдсэн төлөлт: ${allTenantLedgerPayments.length}`);
  const totalLedgerPaid = allTenantLedgerPayments.reduce(
    (sum, l) => sum + Math.abs(l.dun || l.tulsunDun || 0),
    0
  );
  console.log(`Нийт гүйлгээний дүн: ${totalLedgerPaid.toLocaleString()} ₮`);

  // Sample Details
  if (successfulEbarimts.length > 0) {
    console.log("\n========================================================");
    console.log("📋 АМЖИЛТТАЙ ТӨЛӨГДӨЖ БАРИМТ АВСАН ЖИШЭЭ ГҮЙЛГЭЭНҮҮД:");
    successfulEbarimts.slice(0, 10).forEach((e, idx) => {
      console.log(
        `[${idx + 1}] Огноо: ${e.createdAt ? new Date(e.createdAt).toLocaleString("mn-MN") : "-"} | Дүн: ${(e.dun || e.amount || 0).toLocaleString()} ₮ | Сугалаа: ${e.lottery || "-"} | Хэрэглэгч/Утас: ${e.utas || e.userId || "-"}`
      );
    });
  } else if (walletInvoices.length > 0) {
    console.log("\n========================================================");
    console.log("📋 ҮҮССЭН BPAY НЭХЭМЖЛЭХҮҮДИЙН ЖАГСААЛТ:");
    walletInvoices.slice(0, 10).forEach((inv, idx) => {
      console.log(
        `[${idx + 1}] Хэрэглэгч: ${inv.userId} (${inv.customerName || "-"}) | Дүн: ${(inv.totalAmount || 0).toLocaleString()} ₮ | Байр: ${inv.billingName || "-"} | Огноо: ${inv.createdAt ? new Date(inv.createdAt).toLocaleString("mn-MN") : "-"}`
      );
    });
  }

  console.log("========================================================\n");

  await mongoose.disconnect();
}

extractBpayData().catch(console.error);
