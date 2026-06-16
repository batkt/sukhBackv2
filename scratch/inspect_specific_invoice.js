require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');
  const { QuickQpayObject } = require("quickqpaypackvSukh");

  const targetId = "6a21af56f360e75de5aba45a";
  let invoice = null;
  let foundKholbolt = null;

  for (const kholbolt of db.kholboltuud) {
    try {
      const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
      const inv = await NekhemjlekhModel.findById(targetId).lean();
      if (inv) {
        invoice = inv;
        foundKholbolt = kholbolt;
        break;
      }
    } catch (err) {
      // Continue
    }
  }

  if (!invoice) {
    console.error(`Invoice not found for ID: ${targetId}`);
    process.exit(1);
  }

  console.log("\n=== INVOICE DETAILS ===");
  console.log(JSON.stringify(invoice, null, 2));

  if (invoice.qpayInvoiceId) {
    console.log("\n=== QUICK QPAY OBJECT DETAILS ===");
    try {
      const QuickQpayModel = QuickQpayObject(foundKholbolt);
      const qpayRec = await QuickQpayModel.findOne({ invoice_id: invoice.qpayInvoiceId }).lean();
      console.log(JSON.stringify(qpayRec, null, 2));
    } catch (err) {
      console.error("Failed to fetch QuickQpayObject:", err.message);
    }
  }

  process.exit(0);
}

main().catch(console.error);
