
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const axios = require("axios");
const path = require("path");

// 1. Load config - checking multiple possible locations
const configPaths = [
  path.join(__dirname, "../tokhirgoo/tokhirgoo.env"),
  "./tokhirgoo/tokhirgoo.env",
  "tokhirgoo.env"
];

let loaded = false;
for (const p of configPaths) {
  const result = dotenv.config({ path: p });
  if (!result.error) {
    console.log(`✅ Loaded config from: ${p}`);
    loaded = true;
    break;
  }
}

if (!loaded) {
  console.warn("⚠️ Could not load .env file, using process.env defaults");
}

const WALLET_API_BASE_URL = process.env.WALLET_API_BASE_URL || "http://localhost:30510/v1";
const WALLET_API_USERNAME = process.env.WALLET_API_USERNAME || "neo_bpay";
const WALLET_API_PASSWORD = process.env.WALLET_API_PASSWORD || "123456";

// INPUTS
const TARGET_WALLET_PAYMENT_ID = "8c59e528-2bf8-48be-b248-47b750fc48a0";
const TARGET_BAIGUULLAGIIN_ID = "698e7fd3b6dd386b6c56a808";

async function getWalletServiceToken() {
  try {
    const response = await axios.post(`${WALLET_API_BASE_URL}/auth/token`, {
      username: WALLET_API_USERNAME,
      password: WALLET_API_PASSWORD,
    });
    return response.data.accessToken || response.data.token;
  } catch (err) {
    console.error("❌ Failed to get Wallet token:", err.message);
    throw err;
  }
}

async function sync() {
  const uris = [
    process.env.MONGODB_URI,
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin",
    "mongodb://admin:Br1stelback1@localhost:27017/amarSukh?authSource=admin",
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/bpaySukh?authSource=admin",
    "mongodb://admin:Br1stelback1@localhost:27017/bpaySukh?authSource=admin"
  ].filter(Boolean);

  let connected = false;
  for (const uri of uris) {
    try {
      const masked = uri.replace(/:([^:@]+)@/, ":****@");
      console.log(`🔌 Trying to connect to: ${masked}`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      connected = true;
      console.log("✅ Connected!");
      break;
    } catch (e) {
      console.warn(`❌ Failed: ${e.message}`);
    }
  }

  if (!connected) {
    console.error("❌ Could not connect to any MongoDB instance. Please check if MongoDB is running.");
    process.exit(1);
  }

  try {
    // Import models and packages - using relative paths correctly
    const { QuickQpayObject } = require("quickqpaypackvSukh");
    const WalletInvoice = require("../models/walletInvoice");
    const BankniiGuilgee = require("../models/bankniiGuilgee");

    console.log(`🔎 Searching for QuickQpayObject...`);
    // Pass the connection explicitly to the model function
    const qpayObject = await QuickQpayObject(mongoose.connection).findOne({
      walletPaymentId: TARGET_WALLET_PAYMENT_ID
    });

    if (!qpayObject) {
       console.error("❌ Record not found in this database.");
       process.exit(1);
    }

    console.log(`✅ Found record: ${qpayObject._id}. Current tulsunEsekh: ${qpayObject.tulsunEsekh}`);

    qpayObject.tulsunEsekh = true;
    const qpayPaymentId = qpayObject.invoice_id;
    const trxNo = qpayObject.legacy_id;
    const trxAmount = parseFloat(qpayObject.qpay?.amount || 0);

    await qpayObject.save();
    console.log("✅ Local record marked as PAID.");

    // Notify Wallet API
    const walletInvoiceDoc = await WalletInvoice(mongoose.connection).findOne({ walletPaymentId: TARGET_WALLET_PAYMENT_ID }).lean();
    const userId = walletInvoiceDoc?.userId || qpayObject.userId;

    if (userId) {
      console.log(`📡 Notifying Wallet API for userId: ${userId}...`);
      const token = await getWalletServiceToken();
      const bankAccount = qpayObject.qpay?.bank_accounts?.[0] || {};
      
      const payload = {
        qpayPaymentId,
        trxDate: new Date().toISOString(),
        trxNo,
        trxDescription: qpayObject.qpay?.description || "Manual Sync",
        amount: trxAmount,
        receiverBankCode: bankAccount.account_bank_code || "",
        receiverAccountNo: bankAccount.account_number || "",
        receiverAccountName: bankAccount.account_name || "",
      };

      try {
        await axios.put(`${WALLET_API_BASE_URL}/api/payment/qpay/${TARGET_WALLET_PAYMENT_ID}`, payload, {
          headers: { userId, Authorization: `Bearer ${token}` }
        });
        console.log("✅ Wallet API notified successfully.");
      } catch (apiErr) {
        console.error("❌ Wallet API notification failed:", apiErr.response?.data || apiErr.message);
      }

      // Create BankniiGuilgee
      try {
        const bg = new (BankniiGuilgee(mongoose.connection))({
           tranDate: new Date(),
           amount: trxAmount,
           description: qpayObject.qpay?.description || "Manual Sync",
           record: TARGET_WALLET_PAYMENT_ID,
           tranId: qpayPaymentId,
           bank: "qpay",
           baiguullagiinId: TARGET_BAIGUULLAGIIN_ID,
           drOrCr: "Credit",
           postDate: new Date()
        });
        await bg.save();
        console.log("✅ BankniiGuilgee created.");
      } catch (bgErr) {
        console.warn("⚠️ Could not create BankniiGuilgee record:", bgErr.message);
      }
    } else {
      console.warn("⚠️ userId not found, skipped Wallet API notification.");
    }

    console.log("\n🏁 All done!");
    process.exit(0);
  } catch (err) {
    console.error("💥 Error:", err);
    process.exit(1);
  }
}

sync();
