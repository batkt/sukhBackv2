require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

// Helper to wrap ebarimtDuudya in a Promise
function callEbarimtApi(ebarimt, orgId) {
  const { ebarimtDuudya } = require('../routes/ebarimtRoute');
  return new Promise((resolve, reject) => {
    ebarimtDuudya(
      ebarimt,
      (response, requestObj) => {
        resolve({ success: true, response, requestObj });
      },
      (error) => {
        resolve({ success: false, error });
      },
      true,
      orgId
    );
  });
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections...");
  await new Promise(r => setTimeout(r, 3000));

  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');
  const Baiguullaga = require('../models/baiguullagiin'); // Wait, let's verify if baiguullaga.js is required as '../models/baiguullaga'
  const BaiguullagaModel = require('../models/baiguullaga');
  const EasyRegisterUser = require('../models/easyRegisterUser');
  const EbarimtShine = require('../models/ebarimtShine');
  const Ebarimt = require('../models/ebarimt');
  const BankniiGuilgee = require('../models/bankniiGuilgee');

  const { resolveDistrictCode } = require('../lib/districtMapping');
  const { nekhemjlekheesEbarimtShineUusgye, autoApproveQr } = require('../routes/ebarimtRoute');

  const scanStartDate = new Date("2026-01-01T00:00:00Z");
  
  let totalBilled = 0;
  let totalFailed = 0;

  console.log("\n=========================================");
  console.log("⚡ STARTING SYSTEM-WIDE BULK E-BARIMT BILLING ⚡");
  console.log("=========================================");

  for (const kh of db.kholboltuud) {
    const orgId = kh.baiguullagiinId;
    console.log(`\nScanning Org ID: ${orgId}...`);

    try {
      // 1. Fetch paid invoices since Jan 1st, 2026 that were paid by QPay (verified via QuickQpayObject)
      const { QuickQpayObject } = require("quickqpaypackvSukh");
      const paidQpayObjs = await QuickQpayObject(kh).find({ tulsunEsekh: true }).lean();
      const paidInvoiceIds = paidQpayObjs.map(q => q.walletPaymentId).filter(Boolean);

      if (paidInvoiceIds.length === 0) {
        console.log("- No paid QPay transactions found.");
        continue;
      }

      const invoices = await NekhemjlekhiinTuukh(kh).find({
        _id: { $in: paidInvoiceIds },
        tuluv: "Төлсөн",
        createdAt: { $gte: scanStartDate }
      }).lean();

      if (invoices.length === 0) {
        console.log("- No matching paid invoices found in DB.");
        continue;
      }

      // 2. Filter out already registered invoices
      const invoiceIds = invoices.map(i => i._id.toString());
      const existingNew = await EbarimtShine(kh).find({ nekhemjlekhiinId: { $in: invoiceIds } }).lean();
      const existingOld = await Ebarimt(kh).find({ nekhemjlekhiinId: { $in: invoiceIds } }).lean();

      const processedIds = new Set([
        ...existingNew.map(e => e.nekhemjlekhiinId),
        ...existingOld.map(e => e.nekhemjlekhiinId)
      ]);

      const missingInvoices = invoices.filter(i => !processedIds.has(i._id.toString()));
      console.log(`- Paid Invoices: ${invoices.length} | Missing E-Barimts: ${missingInvoices.length}`);

      if (missingInvoices.length === 0) {
        continue;
      }

      const baiguullaga = await BaiguullagaModel(db.erunkhiiKholbolt).findById(orgId);
      if (!baiguullaga) {
        console.warn(`⚠️ Organization profile not found in main DB! Skipping.`);
        continue;
      }

      // Process each missing invoice for this tenant
      for (const nekhemjlekh of missingInvoices) {
        console.log(`\n  👉 Billing ${nekhemjlekh.nekhemjlekhiinDugaar} (Contract: ${nekhemjlekh.gereeniiDugaar})`);
        console.log(`     Amount: ${nekhemjlekh.niitTulbur} MNT`);

        const tuxainSalbar = baiguullaga?.barilguud?.find(
          (e) => e._id.toString() == nekhemjlekh.barilgiinId
        )?.tokhirgoo;

        if (!tuxainSalbar) {
          console.warn(`     ⚠️ Building config not found! Skipping.`);
          totalFailed++;
          continue;
        }

        const nuatTulukhEsekh = !!tuxainSalbar.nuatTulukhEsekh;

        // Resolve customerNo (Easy Register ID)
        let autoCustomerNo = "";
        const userFilter = { baiguullagiinId: orgId, ustgasan: { $ne: true } };
        const residentId = nekhemjlekh.orshinSuugchId || nekhemjlekh.orshinSuugchiinId || (nekhemjlekh.medeelel && nekhemjlekh.medeelel.orshinSuugchiinId);

        if (residentId) {
          userFilter.orshinSuugchiinId = residentId;
        } else if (nekhemjlekh.gereeniiId) {
          userFilter.gereeniiId = nekhemjlekh.gereeniiId;
        }

        if (userFilter.orshinSuugchiinId || userFilter.gereeniiId) {
          const savedUser = await EasyRegisterUser(kh).findOne(userFilter).lean();
          if (savedUser && savedUser.loginName) {
            autoCustomerNo = savedUser.loginName;
            console.log(`     Easy Register Profile: ${autoCustomerNo}`);
          }
        }

        const ebarimtDistrictCode = await resolveDistrictCode(tuxainSalbar, kh);
        
        // Generate Ebarimt Object
        const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
          nekhemjlekh,
          autoCustomerNo,
          "", // customerTin (B2C)
          tuxainSalbar.merchantTin,
          ebarimtDistrictCode,
          kh,
          nuatTulukhEsekh
        );

        // Submit to Government Portal
        const apiResult = await callEbarimtApi(ebarimt, orgId);
        
        if (!apiResult.success || apiResult.response?.status !== "SUCCESS") {
          console.error(`     ❌ API Error:`, apiResult.error || apiResult.response?.message);
          totalFailed++;
          continue;
        }

        const d = apiResult.response;
        const khariuObject = apiResult.requestObj;

        console.log(`     ✅ Billed Successfully! DDTD: ${d.id} | Lottery: ${d.lottery}`);

        // Save EbarimtShine Locally
        const shineBarimt = new (EbarimtShine(kh))(d);
        shineBarimt.nekhemjlekhiinId = khariuObject.nekhemjlekhiinId;
        shineBarimt.baiguullagiinId = khariuObject.baiguullagiinId;
        shineBarimt.barilgiinId = khariuObject.barilgiinId;
        shineBarimt.gereeniiDugaar = khariuObject.gereeniiDugaar;
        shineBarimt.utas = khariuObject.utas;
        shineBarimt.toot = khariuObject.toot;
        shineBarimt.status = d.status;
        shineBarimt.success = d.success;

        if (d.qrData) shineBarimt.qrData = d.qrData;
        if (d.lottery) shineBarimt.lottery = d.lottery;
        if (d.id) shineBarimt.receiptId = d.id;
        if (d.date) shineBarimt.date = d.date;

        await shineBarimt.save();

        // Update corresponding BankniiGuilgee if exists
        await BankniiGuilgee(kh).findOneAndUpdate(
          {
            $or: [
              { record: nekhemjlekh._id.toString() },
              { record: nekhemjlekh.qpayInvoiceId },
              { tranId: nekhemjlekh.qpayInvoiceId },
              { description: new RegExp(nekhemjlekh.gereeniiDugaar, "i"), amount: { $gte: nekhemjlekh.niitTulbur - 5, $lte: nekhemjlekh.niitTulbur + 5 } }
            ],
            ebarimtAvsanEsekh: { $ne: true }
          },
          { $set: { ebarimtAvsanEsekh: true } }
        );

        // Auto approve to Easy Register if applicable
        if (khariuObject.customerNo && d.qrData) {
          try {
            await autoApproveQr(khariuObject.customerNo, d.qrData, orgId, kh);
          } catch (e) {
            // ignore
          }
        }

        totalBilled++;
        
        // Wait 2 seconds between invoices to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
      }

    } catch (err) {
      console.error(`❌ Error in Org ID ${orgId}:`, err.message);
    }
  }

  console.log("\n=========================================");
  console.log(`🏁 BULK BILLING COMPLETE!`);
  console.log(`Total Ebarimts successfully generated: ${totalBilled}`);
  console.log(`Total Ebarimts failed:                 ${totalFailed}`);
  console.log("=========================================");
  process.exit(0);
}

main().catch(console.error);
