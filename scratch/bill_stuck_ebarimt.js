require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

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
  const BankniiGuilgee = require('../models/bankniiGuilgee');

  const { resolveDistrictCode } = require('../lib/districtMapping');
  const { nekhemjlekheesEbarimtShineUusgye, ebarimtDuudya, autoApproveQr } = require('../routes/ebarimtRoute');

  const orgId = "697c70e81e782d8110d3b064";
  const nekhemjlekhiinId = "6a0eaebd4ba18c3bdad079b6";
  const bankGuilgeeId = "6a17ac5a0858a3efe921c288"; // The corresponding bank transaction ID

  const kh = db.kholboltuud.find(k => String(k.baiguullagiinId) === orgId);

  if (!kh) {
    console.error(`Org connection not found for ID: ${orgId}`);
    process.exit(1);
  }

  console.log("Fetching invoice...");
  const nekhemjlekh = await NekhemjlekhiinTuukh(kh).findById(nekhemjlekhiinId);
  if (!nekhemjlekh) {
    console.error("Invoice not found!");
    process.exit(1);
  }

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(orgId);
  const tuxainSalbar = baiguullaga?.barilguud?.find(
    (e) => e._id.toString() == nekhemjlekh.barilgiinId
  )?.tokhirgoo;

  if (!tuxainSalbar) {
    console.error("Building configuration not found!");
    process.exit(1);
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
      console.log(`[EASY REGISTER] Found Easy Register Profile: ${autoCustomerNo}`);
    }
  }

  const ebarimtDistrictCode = await resolveDistrictCode(tuxainSalbar, kh);
  console.log(`Resolved district code: ${ebarimtDistrictCode}`);

  console.log("Generating Ebarimt object...");
  const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
    nekhemjlekh,
    autoCustomerNo,
    "", // customerTin, empty for B2C
    tuxainSalbar.merchantTin,
    ebarimtDistrictCode,
    kh,
    nuatTulukhEsekh
  );

  console.log("Ebarimt Object ready:", JSON.stringify(ebarimt, null, 2));

  console.log("Calling ebarimtDuudya to register with ITC/Gov...");
  ebarimtDuudya(
    ebarimt,
    async (d, khariuObject) => {
      console.log("Gov API response:", JSON.stringify(d, null, 2));
      if (d?.status !== "SUCCESS" && !d.success) {
        console.error("Failed to generate Ebarimt:", d?.message || d?.error);
        process.exit(1);
      }

      console.log("Saving EbarimtShine to database...");
      var shineBarimt = new (EbarimtShine(kh))(d);
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
      console.log("✅ EbarimtShine saved!");

      // Update BankniiGuilgee
      console.log("Updating BankniiGuilgee...");
      await BankniiGuilgee(kh).findByIdAndUpdate(bankGuilgeeId, {
        $set: { ebarimtAvsanEsekh: true }
      });
      console.log("✅ BankniiGuilgee updated!");

      // Auto approve to Easy Register
      if (khariuObject.customerNo && d.qrData) {
        console.log(`Auto-approving QR to Easy Register profile: ${khariuObject.customerNo}...`);
        try {
          await autoApproveQr(
            khariuObject.customerNo,
            d.qrData,
            orgId,
            kh
          );
          console.log("✅ Auto-approve successful!");
        } catch (err) {
          console.error("Auto-approve failed:", err.message);
        }
      }

      console.log("🎉 SUCCESS! Ebarimt created and fully synced!");
      process.exit(0);
    },
    (err) => {
      console.error("Error in ebarimtDuudya:", err);
      process.exit(1);
    },
    true,
    orgId
  );
}

main().catch(console.error);
