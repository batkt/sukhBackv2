const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");
const { Dugaarlalt, Token, Dans, db } = require("zevbackv2");
const QpayObject = require("../models/qpayObject");
const Geree = require("../models/geree");
const got = require("got");
const { QuickQpayObject } = require("quickqpaypackvSukh");
const { URL } = require("url");
const guilgeeService = require("../services/guilgeeService");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const { resolveDistrictCode } = require("../lib/districtMapping");

const instance = got.extend({
  hooks: {
    beforeRequest: [
      (options) => {
        options.headers["Content-Type"] = "application/json";
        if (options.context && options.context.token) {
          options.headers["Authorization"] = options.context.token;
        }
      },
    ],
  },
});

/**
 * Common QPay Token Fetcher
 */
async function tokenAvya(
  username,
  password,
  next,
  baiguullagiinId,
  tukhainBaaziinKholbolt
) {
  try {
    var url = new URL(process.env.QPAY_MERCHANT_SERVER + "v2/auth/token/");
    url.username = username;
    url.password = password;
    const stringBody = JSON.stringify({ terminal_id: "95000059" });
    const response = await instance.post(url, { body: stringBody });
    const khariu = JSON.parse(response.body);

    await Token(tukhainBaaziinKholbolt).updateOne(
      { turul: "qpay", baiguullagiinId: baiguullagiinId },
      {
        ognoo: new Date(),
        token: khariu.access_token,
        refreshToken: khariu.refresh_token,
      },
      { upsert: true }
    );
    return khariu;
  } catch (error) {
    if (next) next(error);
    throw error;
  }
}

/**
 * Standard QPay Callback (Original /qpayTulye)
 */
exports.qpayTulye = asyncHandler(async (req, res) => {
  const { baiguullagiinId, barilgiinId, dugaar } = req.params;
  console.log(`ℹ️ [QPAY CALLBACK] Received callback: baiguullagiinId=${baiguullagiinId}, dugaar=${dugaar}, query=${JSON.stringify(req.query)}`);
  
  const kholbolt = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(baiguullagiinId));
  
  if (!kholbolt) return res.status(404).send("Connection not found");

  const QpayModel = QpayObject(kholbolt);
  const QuickQpayModel = QuickQpayObject(kholbolt);

  let qpayBarimt = await QuickQpayModel.findOne({
    zakhialgiinDugaar: dugaar,
    baiguullagiinId,
  });

  if (!qpayBarimt) {
    qpayBarimt = await QpayModel.findOne({
      "qpay.sender_invoice_no": dugaar,
      baiguullagiinId,
    });
  }

  if (!qpayBarimt) {
    console.warn(`⚠️ [QPAY CALLBACK] Record not found for dugaar=${dugaar}, baiguullagiinId=${baiguullagiinId}`);
    return res.status(404).send("QPay record not found");
  }
  
  if (qpayBarimt.tulsunEsekh) {
    console.log(`ℹ️ [QPAY CALLBACK] Already paid (idempotent): dugaar=${dugaar}`);
    return res.sendStatus(200);
  }

  const amount = parseFloat(qpayBarimt.qpay?.amount || qpayBarimt.amount || 0);
  console.log(`ℹ️ [QPAY CALLBACK] Proceeding with payment: dugaar=${dugaar}, amount=${amount}`);
  if (amount <= 0) {
    console.error(`❌ [QPAY CALLBACK] Invalid amount for dugaar=${dugaar}: ${amount}`);
    return res.status(400).send("Invalid amount");
  }

  // Record payment in Ledger (Authoritative)
  await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    gereeniiId: qpayBarimt.gereeniiId,
    dun: amount,
    tailbar: `QPay төлөлт`,
    source: "nekhemjlekh",
    bankniiGuilgeeId: qpayBarimt.payment_id || dugaar,
    ognoo: new Date(),
    nekhemjlekhId: qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId
  });

  // Trigger ebarimt if invoice exists
  if (qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId) {
    generateEbarimtForQPay(kholbolt, baiguullagiinId, qpayBarimt.sukhNekhemjlekh.nekhemjlekhiinId, amount);
  }

  // Update record status
  qpayBarimt.tulsunEsekh = true;
  qpayBarimt.status = "paid";
  if (req.query?.qpay_payment_id) qpayBarimt.payment_id = req.query.qpay_payment_id;
  await qpayBarimt.save();
  console.log(`✅ [QPAY CALLBACK] Payment successful and recorded for dugaar=${dugaar}, amount=${amount}`);

  // Sync Invoice status
  if (qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId) {
    const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
    const invId = qpayBarimt.sukhNekhemjlekh.nekhemjlekhiinId;
    const balance = await guilgeeService.getBalance(kholbolt, { nekhemjlekhId: invId });
    await NekhemjlekhModel.findByIdAndUpdate(invId, {
      tuluv: balance <= 0.01 ? "Төлсөн" : "Төлөөгүй"
    });
  }

  // Socket updates
  const io = req.app.get("socketio");
  if (io) {
    io.emit(`qpay/${baiguullagiinId}/${qpayBarimt.zakhialgiinDugaar}`);
    io.emit(`tulburUpdated:${baiguullagiinId}`, {});

    // Targeted notification to the resident
    try {
      const GereeModel = Geree(kholbolt);
      const geree = await GereeModel.findById(qpayBarimt.gereeniiId);
      if (geree?.orshinSuugchId) {
        io.emit(`orshinSuugch${geree.orshinSuugchId}`, {
          title: "Төлбөр амжилттай",
          message: `Таны ${amount}₮-ийн төлөлт амжилттай бүртгэгдлээ.`,
          turul: "app",
          baiguullagiinId
        });
      }
    } catch (err) {
      console.error("⚠️ [SOCKET] Failed to send resident notification:", err.message);
    }
  }

  res.sendStatus(200);
});

/**
 * Invoice-specific QPay Callback
 */
exports.qpayNekhemjlekhCallback = asyncHandler(async (req, res) => {
  const { baiguullagiinId, nekhemjlekhiinId } = req.params;
  console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Received: baiguullagiinId=${baiguullagiinId}, nekhemjlekhiinId=${nekhemjlekhiinId}`);
  
  const kholbolt = db.kholboltuud.find((a) => String(a.baiguullagiinId) === String(baiguullagiinId));

  if (!kholbolt) return res.status(404).send("Organization not found");

  const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
  const nekhemjlekh = await NekhemjlekhModel.findById(nekhemjlekhiinId);

  if (!nekhemjlekh) {
    console.error(`❌ [QPAY-INVOICE CALLBACK] Invoice not found: ${nekhemjlekhiinId}`);
    return res.status(404).send("Invoice not found");
  }

  console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Found invoice: ${nekhemjlekhiinId}, gereeniiId=${nekhemjlekh.gereeniiId}, niitTulbur=${nekhemjlekh.niitTulbur}`);

  // Allow re-processing to ensure ledger sync (recordPayment handles idempotency)
  let paymentTransactionId = req.query.qpay_payment_id || nekhemjlekh.qpayPaymentId;

  // Try to fetch latest info from QPay if possible
  const { qpayShalgay } = require("quickqpaypackvSukh");
  let paidAmount = 0;

  if (nekhemjlekh.qpayInvoiceId) {
    try {
      console.log(`📡 [QPAY_SYNC] Verifying status for QPay invoice: ${nekhemjlekh.qpayInvoiceId}`);
      const khariu = await qpayShalgay({ invoice_id: nekhemjlekh.qpayInvoiceId }, kholbolt);
      console.log(`📡 [QPAY_SYNC] QPay Response: ${JSON.stringify(khariu)}`);
      
      if (khariu?.payments?.[0]?.transactions?.[0]?.id) {
        paymentTransactionId = khariu.payments[0].transactions[0].id;
        if (khariu.payments[0].amount) {
          paidAmount = parseFloat(khariu.payments[0].amount);
          console.log(`📡 [QPAY_SYNC] Verified amount: ${paidAmount}, transactionId: ${paymentTransactionId}`);
        }
      } else {
        console.warn(`📡 [QPAY_SYNC] No payment transactions found in QPay response for: ${nekhemjlekh.qpayInvoiceId}`);
      }
    } catch (err) {
      console.error("⚠️ [QPAY_SYNC] Failed to fetch QPay status:", err.message);
    }
  } else {
    console.log(`ℹ️ [QPAY_SYNC] No qpayInvoiceId found on invoice record; using niitTulbur for ledger record.`);
  }

  // FALLBACK HIERARCHY for paidAmount:
  // If paidAmount is still 0 (due to QPay status check failure or niitTulbur=0),
  // we try to resolve it from the local QPay record or ledger balance.
  if (paidAmount <= 0) {
    console.warn(`⚠️ [QPAY-INVOICE CALLBACK] paidAmount is 0. Attempting fallback for invoice: ${nekhemjlekhiinId}`);
    try {
      // 1. Try to get the amount from our local QPay record (QuickQpayObject)
      const { QuickQpayObject } = require("quickqpaypackvSukh");
      const QuickQpayModel = QuickQpayObject(kholbolt);
      const qpayRecord = await QuickQpayModel.findOne({ 
        $or: [
          { invoice_id: nekhemjlekh.qpayInvoiceId },
          { "sukhNekhemjlekh.nekhemjlekhiinId": nekhemjlekhiinId }
        ]
      }).sort({ ognoo: -1 });

      if (qpayRecord) {
        const recordAmount = parseFloat(qpayRecord.sukhNekhemjlekh?.pay_amount || qpayRecord.amount || qpayRecord.qpay?.amount || 0);
        if (recordAmount > 0) {
          paidAmount = recordAmount;
          console.log(`✅ [QPAY-INVOICE CALLBACK] Resolved amount from QPay record: ${paidAmount}`);
        }
      }

      // 2. If still 0, try current contract balance (more authoritative than invoice-only balance)
      if (paidAmount <= 0) {
        const currentBalance = await guilgeeService.getBalance(kholbolt, { gereeniiId: nekhemjlekh.gereeniiId });
        if (currentBalance > 0) {
          paidAmount = currentBalance;
          console.log(`✅ [QPAY-INVOICE CALLBACK] Resolved amount from Contract balance: ${paidAmount}`);
        }
      }
    } catch (fallbackErr) {
      console.error(`❌ [QPAY-INVOICE CALLBACK] Fallback logic failed:`, fallbackErr.message);
    }
  }

  if (paidAmount <= 0) {
    console.error(`❌ [QPAY-INVOICE CALLBACK] All amount resolution strategies failed for invoice: ${nekhemjlekhiinId}`);
    return res.status(400).send("Could not determine payment amount");
  }

  // Record in Ledger (GuilgeeAvlaguud)
  console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Sending to Ledger: amount=${paidAmount}, transactionId=${paymentTransactionId}`);
  const ledgerResult = await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    baiguullagiinNer: nekhemjlekh.baiguullagiinNer || "",
    barilgiinId: nekhemjlekh.barilgiinId || "",
    gereeniiId: nekhemjlekh.gereeniiId,
    gereeniiDugaar: nekhemjlekh.gereeniiDugaar || "",
    orshinSuugchId: nekhemjlekh.orshinSuugchId || "",
    dun: paidAmount,
    tailbar: `QPay төлөлт`,
    source: "nekhemjlekh",
    bankniiGuilgeeId: paymentTransactionId || nekhemjlekh.qpayInvoiceId || "manual_sync",
    ognoo: new Date(),
    nekhemjlekhId: nekhemjlekhiinId,
  });

  // Trigger ebarimt
  generateEbarimtForQPay(kholbolt, baiguullagiinId, nekhemjlekhiinId, paidAmount);
  console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Ledger Result: ${JSON.stringify(ledgerResult)}`);

  // Record in Bank Statement (BankniiGuilgee) for accounting/reconciliation
  try {
    const GereeModel = Geree(kholbolt);
    const geree = await GereeModel.findById(nekhemjlekh.gereeniiId).lean();
    
    if (geree) {
      const BankniiGuilgeeModel = BankniiGuilgee(kholbolt);
      const bankGuilgee = new BankniiGuilgeeModel();

      bankGuilgee.tranDate = new Date();
      bankGuilgee.amount = paidAmount;
      bankGuilgee.description = `QPay төлбөр - Гэрээ ${nekhemjlekh.gereeniiDugaar || ""}`;
      bankGuilgee.accName = nekhemjlekh.nekhemjlekhiinDansniiNer || "";
      bankGuilgee.accNum = nekhemjlekh.nekhemjlekhiinDans || "";

      bankGuilgee.record = paymentTransactionId || nekhemjlekh.qpayInvoiceId || "manual_sync";
      bankGuilgee.tranId = paymentTransactionId || nekhemjlekh.qpayInvoiceId || "manual_sync";
      bankGuilgee.balance = 0;
      bankGuilgee.requestId = nekhemjlekh.qpayInvoiceId || "";

      bankGuilgee.kholbosonGereeniiId = [nekhemjlekh.gereeniiId];
      bankGuilgee.kholbosonTalbainId = geree?.talbainDugaar ? [geree.talbainDugaar] : [];
      bankGuilgee.dansniiDugaar = nekhemjlekh.nekhemjlekhiinDans || "";
      bankGuilgee.bank = "qpay";
      bankGuilgee.baiguullagiinId = baiguullagiinId;
      bankGuilgee.barilgiinId = nekhemjlekh.barilgiinId || "";
      bankGuilgee.kholbosonDun = paidAmount;
      bankGuilgee.ebarimtAvsanEsekh = false;
      bankGuilgee.drOrCr = "Credit";
      bankGuilgee.tranCrnCode = "MNT";
      bankGuilgee.exchRate = 1;
      bankGuilgee.postDate = new Date();

      bankGuilgee.indexTalbar = `${bankGuilgee.barilgiinId}${bankGuilgee.bank}${bankGuilgee.dansniiDugaar}${bankGuilgee.record}${bankGuilgee.amount}`;

      await bankGuilgee.save();
      console.log(`✅ [QPAY-INVOICE CALLBACK] BankniiGuilgee created: amount=${paidAmount}`);
    }
  } catch (bankErr) {
    console.error("❌ [QPAY-INVOICE CALLBACK] BankniiGuilgee creation failed:", bankErr.message);
  }

  // Update Invoice state
  const balance = await guilgeeService.getBalance(kholbolt, { nekhemjlekhId: nekhemjlekhiinId });
  nekhemjlekh.tuluv = balance <= 0.01 ? "Төлсөн" : "Төлөөгүй";
  nekhemjlekh.tulsunOgnoo = new Date();
  nekhemjlekh.qpayPaymentId = paymentTransactionId;
  
  nekhemjlekh.paymentHistory = nekhemjlekh.paymentHistory || [];
  nekhemjlekh.paymentHistory.push({
    ognoo: new Date(),
    dun: paidAmount,
    turul: "төлөлт",
    guilgeeniiId: paymentTransactionId || "manual_sync",
    tailbar: "QPay төлбөр амжилттай синхрончлогдлоо",
  });

  await nekhemjlekh.save();

  // Update QPay Record status for history/consistency
  try {
    const { QuickQpayObject } = require("quickqpaypackvSukh");
    const QuickQpayModel = QuickQpayObject(kholbolt);
    await QuickQpayModel.findOneAndUpdate(
      { 
        $or: [
          { invoice_id: nekhemjlekh.qpayInvoiceId },
          { "sukhNekhemjlekh.nekhemjlekhiinId": nekhemjlekhiinId }
        ]
      },
      { 
        $set: { 
          tulsunEsekh: true, 
          status: "paid", 
          payment_id: paymentTransactionId || "manual_sync" 
        } 
      }
    ).sort({ ognoo: -1 });
    console.log(`✅ [QPAY-INVOICE CALLBACK] QuickQpayObject marked PAID`);
  } catch (qpayUpdateErr) {
    console.error("❌ [QPAY-INVOICE CALLBACK] QuickQpayObject status update failed:", qpayUpdateErr.message);
  }

  // Socket updates
  const io = req.app.get("socketio");
  if (io) {
    io.emit(`tulburUpdated:${baiguullagiinId}`, {});

    // Targeted notification to the resident
    try {
      const GereeModel = Geree(kholbolt);
      const geree = await GereeModel.findById(nekhemjlekh.gereeniiId);
      if (geree?.orshinSuugchId) {
        io.emit(`orshinSuugch${geree.orshinSuugchId}`, {
          title: "Төлбөр амжилттай",
          message: `Таны ${paidAmount}₮-ийн төлөлт амжилттай бүртгэгдлээ.`,
          turul: "app",
          baiguullagiinId
        });
      }
    } catch (err) {
      console.error("⚠️ [SOCKET] Failed to send resident notification:", err.message);
    }
  }

  res.sendStatus(200);
});


exports.qpayGuilgeeUtgaAvya = asyncHandler(async (req, res, next) => {
  const { baiguullagiinId, tukhainBaaziinKholbolt } = req.body;
  
  const guilgeenuud = await QuickQpayObject(tukhainBaaziinKholbolt).find({
    tulsunEsekh: true,
    ognoo: { $gt: new Date("2023-12-01") },
    baiguullagiinId
  });

  let tokenObject = await Token(tukhainBaaziinKholbolt).findOne({
    turul: "qpay",
    baiguullagiinId,
    ognoo: { $gte: new Date(new Date().getTime() - 25 * 60000) },
  });

  if (!tokenObject) {
    return res.status(400).send("Active QPay token not found. Please generate an invoice first.");
  }

  const token = tokenObject.token;
  const { qpayShalgay } = require("quickqpaypackvSukh");

  for (const guilgee of guilgeenuud) {
    if (guilgee.legacy_id) continue;

    try {
      const khariu = await qpayShalgay({ invoice_id: guilgee.qpay?.invoice_id || guilgee.invoice_id }, tukhainBaaziinKholbolt);
      if (khariu?.payments?.[0]?.transactions?.[0]?.id) {
        await QuickQpayObject(tukhainBaaziinKholbolt).updateOne(
          { _id: guilgee._id },
          { legacy_id: khariu.payments[0].transactions[0].id }
        );
      }
    } catch (err) {
      console.error(`Failed to sync qpay ${guilgee._id}:`, err.message);
    }
  }

  res.send("Amjilttai");
});



/**
 * Helper to generate ebarimt after QPay payment
 */
async function generateEbarimtForQPay(kholbolt, baiguullagiinId, nekhemjlekhId, paidAmount) {
  try {
    const Baiguullaga = require("../models/baiguullaga");
    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
    const BankniiGuilgeeModel = BankniiGuilgee(kholbolt);
    const EasyRegisterUser = require("../models/easyRegisterUser");
    const { nekhemjlekheesEbarimtShineUusgye, ebarimtDuudya } = require("../routes/ebarimtRoute");

    const nekhemjlekh = await NekhemjlekhiinTuukh(kholbolt).findById(nekhemjlekhId).lean();
    if (!nekhemjlekh) return;

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId).lean();
    const building = baiguullaga?.barilguud?.find(b => String(b._id) === String(nekhemjlekh.barilgiinId));
    const tokhirgoo = building?.tokhirgoo;

    if (tokhirgoo?.eBarimtShine || tokhirgoo?.eBarimtAshiglakhEsekh) {
      if (!tokhirgoo.merchantTin) {
        console.error("❌ [QPAY EBARIMT] merchantTin missing");
        return;
      }

      // Try to find autoCustomerNo
      let autoCustomerNo = "";
      const residentId = nekhemjlekh.orshinSuugchiinId || (nekhemjlekh.medeelel && nekhemjlekh.medeelel.orshinSuugchiinId);
      const userFilter = { baiguullagiinId, ustgasan: { $ne: true } };
      if (residentId) userFilter.orshinSuugchiinId = residentId;
      else if (nekhemjlekh.gereeniiId) userFilter.gereeniiId = nekhemjlekh.gereeniiId;

      if (userFilter.orshinSuugchiinId || userFilter.gereeniiId) {
        const savedUser = await EasyRegisterUser(kholbolt).findOne(userFilter).lean();
        if (savedUser?.loginName) autoCustomerNo = savedUser.loginName;
      }

      const ebarimtDistrictCode = await resolveDistrictCode(tokhirgoo, kholbolt);
      console.log(`ℹ️ [QPAY EBARIMT] Resolved district code: ${ebarimtDistrictCode} for building: ${nekhemjlekh.barilgiinId}`);

      const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
        { ...nekhemjlekh, niitTulbur: paidAmount },
        autoCustomerNo,
        "",
        tokhirgoo.merchantTin,
        ebarimtDistrictCode,
        kholbolt,
        !!tokhirgoo.nuatTulukhEsekh
      );

      const onFinish = async (d) => {
        if (d?.status === "SUCCESS" || d?.success) {
          const EbarimtShine = require("../models/ebarimtShine");
          const shineBarimt = new (EbarimtShine(kholbolt))(d);
          shineBarimt.nekhemjlekhiinId = nekhemjlekhId;
          shineBarimt.baiguullagiinId = baiguullagiinId;
          shineBarimt.barilgiinId = nekhemjlekh.barilgiinId;
          shineBarimt.gereeniiDugaar = nekhemjlekh.gereeniiDugaar;
          shineBarimt.toot = nekhemjlekh.toot;
          shineBarimt.status = d.status;
          shineBarimt.success = d.success;
          if (d.qrData) shineBarimt.qrData = d.qrData;
          if (d.lottery) shineBarimt.lottery = d.lottery;
          if (d.id) shineBarimt.receiptId = d.id;
          await shineBarimt.save().catch(e => console.error("Ebarimt save error:", e));
          
          // Update BankniiGuilgee
          await BankniiGuilgeeModel.updateMany(
            { $or: [
                { record: nekhemjlekh.qpayInvoiceId }, 
                { requestId: nekhemjlekh.qpayInvoiceId },
                { tranId: nekhemjlekh.qpayInvoiceId }
              ] 
            },
            { $set: { ebarimtAvsanEsekh: true } }
          ).catch(() => {});
        }
      };

      ebarimtDuudya(ebarimt, onFinish, null, true, baiguullagiinId);
    }
  } catch (err) {
    console.error("⚠️ [QPAY EBARIMT] Generation failed:", err.message);
  }
}
