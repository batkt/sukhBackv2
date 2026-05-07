
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const axios = require("axios");
const path = require("path");

// 1. Load config
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

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

const WALLET_API_BASE_URL = process.env.WALLET_API_BASE_URL || "http://localhost:30510/v1";
const WALLET_API_USERNAME = process.env.WALLET_API_USERNAME || "neo_bpay";
const WALLET_API_PASSWORD = process.env.WALLET_API_PASSWORD || "123456";

// INPUTS
const TARGET_WALLET_PAYMENT_ID = "8c59e528-2bf8-48be-b248-47b750fc48a0";
const TARGET_BAIGUULLAGIIN_ID = "698e7fd3b6dd386b6c56a808";

async function getWalletServiceToken() {
  const response = await axios.post(`${WALLET_API_BASE_URL}/auth/token`, {
    username: WALLET_API_USERNAME,
    password: WALLET_API_PASSWORD,
  });
  return response.data.accessToken || response.data.token;
}

async function sync() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
    
    const express = require("express");
    const app = express();

    console.log("🔌 Initializing database connection...");
    db.kholboltUusgey(app, MONGODB_URI);

    console.log("Waiting 6000ms for connections to initialize...");
    await new Promise((r) => setTimeout(r, 6000));

    if (!db.kholboltuud || db.kholboltuud.length === 0) {
      console.error("❌ No tenant connections. Check MONGODB_URI.");
      process.exit(1);
    }

    const kholbolt = getKholboltByBaiguullagiinId(TARGET_BAIGUULLAGIIN_ID);
    if (!kholbolt) {
      console.error(`❌ Connection info not found for baiguullagiinId: ${TARGET_BAIGUULLAGIIN_ID}`);
      console.log("Available IDs in db.kholboltuud:", db.kholboltuud.map(k => k.baiguullagiinId).join(", "));
      process.exit(1);
    }

    const { QuickQpayObject } = require("quickqpaypackvSukh");
    const WalletInvoice = require("../models/walletInvoice");
    const BankniiGuilgee = require("../models/bankniiGuilgee");

    console.log(`🔎 Searching for QuickQpayObject...`);
    const qpayObject = await QuickQpayObject(kholbolt).findOne({
      walletPaymentId: TARGET_WALLET_PAYMENT_ID
    });

    if (!qpayObject) {
       console.error("❌ Record not found in this database.");
       process.exit(1);
    }

    qpayObject.tulsunEsekh = true;
    const qpayPaymentId = qpayObject.invoice_id;
    const trxNo = qpayObject.legacy_id;
    const trxAmount = parseFloat(qpayObject.qpay?.amount || 0);

    await qpayObject.save();
    console.log("✅ Local record marked as PAID.");

    // Notify Wallet API
    const userId = "88046904"; // Forced correct userId
    console.log(`📡 Notifying Wallet API for userId: ${userId}...`);
    
    try {
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

      const result = await axios.put(`${WALLET_API_BASE_URL}/api/payment/qpay/${TARGET_WALLET_PAYMENT_ID}`, payload, {
        headers: { userId, Authorization: `Bearer ${token}` }
      });
      console.log("✅ Wallet API notified successfully. Response:", result.data?.responseMsg || "OK");

      // Create BankniiGuilgee
      try {
        const bg = new (BankniiGuilgee(kholbolt))({
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
      } catch (e) {
        console.warn("⚠️ Could not create BankniiGuilgee:", e.message);
      }
    } catch (apiErr) {
      console.error("❌ Wallet API Notification Error:", apiErr.response?.data || apiErr.message);
    }

    console.log("\n🏁 All done!");
    process.exit(0);
  } catch (err) {
    console.error("💥 Error:", err.message);
    process.exit(1);
  }
}

sync();
