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

async function checkBpayUsers() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  console.log("Connecting to:", uri.replace(/:([^:@]+)@/, ":****@"));
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const residentColl = db.collection("orshinSuugch");

  // 1. Users whose toots contains source: "WALLET_API" (BPay source)
  const bpaySourceUsers = await residentColl
    .find({
      $or: [
        { "toots.source": "WALLET_API" },
        { "toots.source": "B_PAY" },
        { "toots.source": "BPAY" },
      ],
    })
    .toArray();

  console.log("\n========================================================");
  console.log("💳 1. BPAY ЭХ СУРВАЛЖТАЙ ТОOT/БАЙРТАЙ ХЭРЭГЛЭГЧИД (toots.source == 'WALLET_API'):");
  console.log("Нийт хэрэглэгчдийн тоо:", bpaySourceUsers.length);
  if (bpaySourceUsers.length > 0) {
    bpaySourceUsers.forEach((u, i) => {
      const bpayToots = (u.toots || []).filter((t) => t.source === "WALLET_API" || t.source === "B_PAY" || t.source === "BPAY");
      console.log(`[${i + 1}] Нэр: ${u.ner || "-"} | Утас: ${u.utas} | BPay тоотын тоо: ${bpayToots.length}`);
      bpayToots.forEach((t) => {
        console.log(`   └─ Байр: ${t.bairniiNer || t.soh || "-"} | Тоот: ${t.toot || "-"} | BPay BairId: ${t.walletBairId || "-"} | BillingId: ${t.billingId || "-"}`);
      });
    });
  }

  // 2. Users with walletUserId linked
  const walletUsers = await residentColl
    .find({
      $or: [
        { walletUserId: { $exists: true, $ne: null, $ne: "" } },
        { "toots.walletUserId": { $exists: true, $ne: null, $ne: "" } },
      ],
    })
    .toArray();

  console.log("\n========================================================");
  console.log("🆔 2. BPAY / WALLET USER ID ХОЛБОГДСОН ХЭРЭГЛЭГЧИД:");
  console.log("Нийт холбогдсон хэрэглэгчид:", walletUsers.length);
  if (walletUsers.length > 0) {
    walletUsers.slice(0, 10).forEach((u, i) => {
      console.log(`[${i + 1}] Нэр: ${u.ner || "-"} | Утас: ${u.utas} | walletUserId: ${u.walletUserId || (u.toots && u.toots[0]?.walletUserId)}`);
    });
    if (walletUsers.length > 10) {
      console.log(`... болон цаана нь ${walletUsers.length - 10} хэрэглэгч байна.`);
    }
  }

  // 3. Pure BPay users (do not belong to any OWN_ORG)
  const pureBpayUsers = await residentColl
    .find({
      "toots.source": "WALLET_API",
      "toots.source": { $ne: "OWN_ORG" },
      $or: [{ baiguullagiinId: { $exists: false } }, { baiguullagiinId: null }, { baiguullagiinId: "" }],
    })
    .toArray();

  console.log("\n========================================================");
  console.log("🌐 3. ЗӨВХӨН BPAY СИСТЕМЭЭС ОРЖ ИРСЭН (Өөрийн СӨХ/байгууллагад бүртгэлгүй) ХЭРЭГЛЭГЧИД:");
  console.log("Тоо:", pureBpayUsers.length);

  console.log("========================================================\n");

  await mongoose.disconnect();
}

checkBpayUsers().catch(console.error);
