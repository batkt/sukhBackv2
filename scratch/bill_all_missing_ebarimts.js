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
  const Baiguullaga = require('../models/baiguullaga');
  const EasyRegisterUser = require('../models/easyRegisterUser');
  const EbarimtShine = require('../models/ebarimtShine');
  const Ebarimt = require('../models/ebarimt');
  const BankniiGuilgee = require('../models/bankniiGuilgee');

  const { resolveDistrictCode } = require('../lib/districtMapping');
  const { nekhemjlekheesEbarimtShineUusgye } = require('../routes/ebarimtRoute');

  const orgId = "697c70e81e782d8110d3b064";
  const contractNo = "ГД-71812301";

  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);

  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  // 1. Fetch all paid invoices since Jan 1st, 2026 that were paid by QPay (verified via QuickQpayObject)
  const { QuickQpayObject } = require("quickqpaypackvSukh");
  const paidQpayObjs = await QuickQpayObject(kh).find({ tulsunEsekh: true }).lean();
  const paidInvoiceIds = paidQpayObjs.map(q => q.walletPaymentId).filter(Boolean);

  const invoices = await NekhemjlekhiinTuukh(kh).find({
    _id: { $in: paidInvoiceIds },
    gereeniiDugaar: contractNo,
    tuluv: "Төлсөн"
  }).sort({ createdAt: 1 }).lean();
  console.log(`Found ${invoices.length} paid QPay invoices total.`);

  // 2. Fetch existing Ebarimts
  const invoiceIds = invoices.map(i => i._id.toString());
  const existingNew = await EbarimtShine(kh).find({ nekhemjlekhiinId: { $in: invoiceIds } }).lean();
  const existingOld = await Ebarimt(kh).find({ nekhemjlekhiinId: { $in: invoiceIds } }).lean();

  const processedInvoiceIds = new Set([
    ...existingNew.map(e => e.nekhemjlekhiinId),
    ...existingOld.map(e => e.nekhemjlekhiinId)
  ]);

  // Exclude invoices that the customer already manually generated/registered outside the system
  const manualExclusions = [
    "НЭХ-20260430-0021", // User already got this ebarimt manually
    "НЭХ-20260401-0014", // Paid manually, not QPay
    "НЭХ-20260204-0014"  // Paid manually, not QPay
  ];

  const missingInvoices = invoices.filter(i => 
    !processedInvoiceIds.has(i._id.toString()) && 
    !manualExclusions.includes(i.nekhemjlekhiinDugaar)
  );
  console.log(`Missing QPay E-Barimts count (after manual exclusions): ${missingInvoices.length}`);

  if (missingInvoices.length === 0) {
    console.log("No missing E-Barimts found. All paid invoices are already registered or excluded!");
    process.exit(0);
  }

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(orgId);
  
  // Process each missing invoice
  for (const nekhemjlekh of missingInvoices) {
    console.log(`\n----------------------------------------`);
    console.log(`Processing missing Ebarimt for invoice: ${nekhemjlekh.nekhemjlekhiinDugaar}`);
    console.log(`Amount: ${nekhemjlekh.niitTulbur} MNT | Date: ${nekhemjlekh.createdAt}`);

    const tuxainSalbar = baiguullaga?.barilguud?.find(
      (e) => e._id.toString() == nekhemjlekh.barilgiinId
    )?.tokhirgoo;

    if (!tuxainSalbar) {
      console.warn(`⚠️ Building configuration not found for invoice ${nekhemjlekh.nekhemjlekhiinDugaar}! Skipping.`);
      continue;
    }

    const nuatTulukhEsekh = !!tuxainSalbar.nuatTulukhEsekh;

    // Resolve customerNo
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
        console.log(`Found Easy Register Profile for customer: ${autoCustomerNo}`);
      }
    }

    const ebarimtDistrictCode = await resolveDistrictCode(tuxainSalbar, kh);
    
    console.log("Generating Ebarimt object...");
    const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
      nekhemjlekh,
      autoCustomerNo,
      "", // customerTin (empty for B2C)
      tuxainSalbar.merchantTin,
      ebarimtDistrictCode,
      kh,
      nuatTulukhEsekh
    );

    console.log("Submitting to government portal...");
    const apiResult = await callEbarimtApi(ebarimt, orgId);
    
    if (!apiResult.success || apiResult.response?.status !== "SUCCESS") {
      console.error(`❌ Failed to register with E-Barimt API! Error:`, apiResult.error || apiResult.response?.message);
      continue;
    }

    const d = apiResult.response;
    const khariuObject = apiResult.requestObj;

    console.log(`✅ Success! DDTD: ${d.id} | Lottery: ${d.lottery}`);

    console.log("Saving EbarimtShine record locally...");
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
    console.log("Saved locally to EbarimtShine.");

    // Update corresponding BankniiGuilgee if exists
    console.log("Searching for matching BankniiGuilgee to update...");
    // Try matching by transaction record ID (if it was paid via QPay, the invoice ID or QPay invoice ID might be in the record field)
    const matchingBg = await BankniiGuilgee(kh).findOneAndUpdate(
      {
        $or: [
          { record: nekhemjlekh._id.toString() },
          { record: nekhemjlekh.qpayInvoiceId },
          { tranId: nekhemjlekh.qpayInvoiceId },
          { description: new RegExp(contractNo, "i"), amount: { $gte: nekhemjlekh.niitTulbur - 5, $lte: nekhemjlekh.niitTulbur + 5 } }
        ],
        ebarimtAvsanEsekh: { $ne: true }
      },
      { $set: { ebarimtAvsanEsekh: true } }
    );
    if (matchingBg) {
      console.log(`✅ Updated matching Bank Transaction (ID: ${matchingBg._id}, Amount: ${matchingBg.amount}).`);
    } else {
      console.log("No matching/unflagged bank transaction found to update.");
    }
    
    // Pause 2 seconds between requests to be gentle on government servers
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n========================================");
  console.log("🎉 Run completed! Missing Ebarimts billed successfully.");
  process.exit(0);
}

main().catch(console.error);
