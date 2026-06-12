require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  
  // Use simple MongoClient if mongoose connects in a complex way, or use zevbackv2's db connection helper:
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const Geree = require('../models/geree');
  const { QuickQpayObject } = require("quickqpaypackvSukh");
  const EbarimtShine = require('../models/ebarimtShine');
  const WalletInvoice = require('../models/walletInvoice');

  const targetGereeNo = "ГД-71812301";
  
  for (const kh of db.kholboltuud) {
    const geree = await Geree(kh).findOne({ gereeniiDugaar: targetGereeNo }).lean();
    if (geree) {
      console.log(`\n========================================`);
      console.log(`Found Geree: ${targetGereeNo}`);
      console.log(`Org ID: ${kh.baiguullagiinId}`);
      console.log(`Geree ID: ${geree._id}`);
      console.log(`Resident (Orshin Suugch) ID: ${geree.orshinSuugchId}`);
      console.log(`Toot: ${geree.toot}`);
      console.log(`Name: ${geree.ovog} ${geree.ner}`);
      console.log(`Phone: ${geree.utas}`);

      // Search QPay objects in this tenant db
      console.log(`\nSearching QuickQpayObjects for this Geree ID / description / tenant...`);
      const qpayObjs = await QuickQpayObject(kh).find({
        $or: [
          { gereeniiId: geree._id.toString() },
          { "qpay.description": new RegExp(targetGereeNo, "i") },
          { talbainDugaar: geree.toot }
        ]
      }).lean();

      console.log(`Found ${qpayObjs.length} QPay objects:`);
      for (const q of qpayObjs) {
        console.log(`- ID: ${q._id}`);
        console.log(`  zakhialgiinDugaar: ${q.zakhialgiinDugaar}`);
        console.log(`  invoice_id (QPay QR ID): ${q.invoice_id}`);
        console.log(`  payment_id (QPay payment ID): ${q.payment_id}`);
        console.log(`  walletPaymentId: ${q.walletPaymentId}`);
        console.log(`  tulsunEsekh: ${q.tulsunEsekh}`);
        console.log(`  amount: ${q.qpay?.amount}`);
        console.log(`  description: ${q.qpay?.description}`);
        console.log(`  createdAt: ${q.createdAt}`);
        console.log(`  updatedAt: ${q.updatedAt}`);
        
        // Search local ebarimt shines for this nekhemjlekhiinId
        if (q.walletPaymentId) {
          const ebarimt = await EbarimtShine(kh).findOne({
            $or: [
              { nekhemjlekhiinId: q.walletPaymentId },
              { id: q.payment_id }
            ]
          }).lean();
          if (ebarimt) {
            console.log(`  - Local EbarimtShine Found! DDTD: ${ebarimt.id}, Lottery: ${ebarimt.lottery}, QR: ${ebarimt.qrData}`);
          } else {
            console.log(`  - Local EbarimtShine NOT Found for walletPaymentId: ${q.walletPaymentId}`);
          }
        }
      }

      // Search in WalletInvoice metadata (in main db)
      console.log(`\nSearching WalletInvoice metadata in main DB...`);
      const walletInvoices = await WalletInvoice(db.erunkhiiKholbolt).find({
        $or: [
          { orshinSuugchId: geree.orshinSuugchId },
          { userId: { $in: Array.isArray(geree.utas) ? geree.utas : [geree.utas] } }
        ]
      }).lean();
      
      console.log(`Found ${walletInvoices.length} WalletInvoices in main DB:`);
      for (const wi of walletInvoices) {
        console.log(`- WalletPaymentId: ${wi.walletPaymentId}`);
        console.log(`  zakhialgiinDugaar: ${wi.zakhialgiinDugaar}`);
        console.log(`  totalAmount: ${wi.totalAmount}`);
        console.log(`  billIds: ${wi.billIds}`);
        console.log(`  createdAt: ${wi.createdAt}`);
      }
    }
  }

  process.exit(0);
}

main().catch(console.error);
