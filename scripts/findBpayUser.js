const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const walletApiService = require("../services/walletApiService");

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

async function findBpayUser() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  await mongoose.connect(uri);
  const mainDb = mongoose.connection.db;

  const targetWalletPaymentId = "3806e248-8c10-4b39-81ff-af336b3d0f76";
  const targetCid = "2003260207000340";
  const targetEbill = "179123";

  console.log("🔍 Searching for user details for 698,170 ₮ payment...\n");

  // 1. Search in Main DB walletInvoice
  const winv = await mainDb.collection("walletInvoice").findOne({
    $or: [
      { walletPaymentId: targetWalletPaymentId },
      { customerId: targetCid },
      { "billIds": targetEbill },
    ],
  });

  if (winv) {
    console.log("📄 [walletInvoice олдсон]:", winv);
  }

  // 2. Search in orshinSuugch by customerId, billingId, or walletCustomerCode
  const resident = await mainDb.collection("orshinSuugch").findOne({
    $or: [
      { "toots.walletCustomerCode": targetCid },
      { "toots.walletCustomerId": targetCid },
      { "toots.billingId": targetCid },
      { "toots.billingId": targetEbill },
      { "toots.walletBairId": targetCid },
      { "billNicknames.billingId": targetCid },
    ],
  });

  if (resident) {
    console.log("👤 [Оршин суугч олдсон (Local DB)]:");
    console.log(`- Нэр: ${resident.ovog || ""} ${resident.ner || ""}`);
    console.log(`- Утас: ${resident.utas}`);
    console.log(`- Байр / Тоот: ${resident.bairniiNer || ""} ${resident.toot || ""}`);
    console.log(`- СӨХ: ${resident.baiguullagiinNer || resident.baiguullagiinId}`);
  }

  // 3. Search in all tenant DBs (bankniiGuilgee, geree, toots)
  const adminDb = mainDb.admin();
  const dbsInfo = await adminDb.listDatabases();
  const excluded = ["admin", "config", "local"];
  const tenantDbs = dbsInfo.databases.filter((d) => !excluded.includes(d.name));

  for (const dbInfo of tenantDbs) {
    const tDb = mongoose.connection.useDb(dbInfo.name).db;

    // Check bankniiGuilgee
    try {
      const bankRecord = await tDb.collection("bankniiGuilgee").findOne({
        $or: [
          { record: targetWalletPaymentId },
          { tranId: targetWalletPaymentId },
          { requestId: targetWalletPaymentId },
        ],
      });
      if (bankRecord) {
        console.log(`🏦 [Банкны гүйлгээний бичлэг (${dbInfo.name})]:`);
        console.log(JSON.stringify(bankRecord, null, 2));
      }
    } catch (e) {}

    // Check geree
    try {
      const gereeDoc = await tDb.collection("geree").findOne({
        $or: [{ gereeniiDugaar: targetCid }, { toot: targetCid }],
      });
      if (gereeDoc) {
        console.log(`📜 [Гэрээний бичлэг (${dbInfo.name})]:`);
        console.log(`- Нэр: ${gereeDoc.ovog} ${gereeDoc.ner}`);
        console.log(`- Утас: ${gereeDoc.utas}`);
        console.log(`- Тоот: ${gereeDoc.toot}`);
      }
    } catch (e) {}
  }

  // 4. Query live BPay / Wallet API for Customer ID details
  console.log(`\n🌐 [Wallet API-аас CID: ${targetCid} хайж байна]...`);
  try {
    const billingInfo = await walletApiService.getBillingByCustomer(targetCid);
    if (billingInfo) {
      console.log("🏢 [BPay Billing мэдээлэл]:", JSON.stringify(billingInfo, null, 2));
    }
  } catch (err) {
    console.log("Wallet API billing lookup notice:", err.message);
  }

  console.log("\n========================================================");
  await mongoose.disconnect();
}

findBpayUser().catch(console.error);
