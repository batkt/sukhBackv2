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

  if (!qpayBarimt) return res.status(404).send("QPay record not found");
  if (qpayBarimt.tulsunEsekh) return res.sendStatus(200);

  const amount = parseFloat(qpayBarimt.qpay?.amount || qpayBarimt.amount || 0);
  if (amount <= 0) return res.status(400).send("Invalid amount");

  // Record payment in Ledger (Authoritative)
  await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    gereeniiId: qpayBarimt.gereeniiId,
    dun: amount,
    tailbar: `QPay төлөлт (${dugaar})`,
    source: "nekhemjlekh",
    bankniiGuilgeeId: qpayBarimt.payment_id || dugaar,
    ognoo: new Date(),
    nekhemjlekhId: qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId
  });

  // Update record status
  qpayBarimt.tulsunEsekh = true;
  qpayBarimt.status = "paid";
  if (req.query?.qpay_payment_id) qpayBarimt.payment_id = req.query.qpay_payment_id;
  await qpayBarimt.save();

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
    const { clearOrgCache } = require("../utils/redisClient");
    clearOrgCache(baiguullagiinId).catch(() => {});
    io.emit(`qpay/${baiguullagiinId}/${qpayBarimt.zakhialgiinDugaar}`);
    io.emit(`tulburUpdated:${baiguullagiinId}`, {});
  }

  res.sendStatus(200);
});

/**
 * Invoice-specific QPay Callback
 */
exports.qpayNekhemjlekhCallback = asyncHandler(async (req, res) => {
  const { baiguullagiinId, nekhemjlekhiinId } = req.params;
  const kholbolt = db.kholboltuud.find((a) => String(a.baiguullagiinId) === String(baiguullagiinId));

  if (!kholbolt) return res.status(404).send("Organization not found");

  const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
  const nekhemjlekh = await NekhemjlekhModel.findById(nekhemjlekhiinId);

  if (!nekhemjlekh) return res.status(404).send("Invoice not found");

  // Allow re-processing to ensure ledger sync (recordPayment handles idempotency)
  let paymentTransactionId = req.query.qpay_payment_id || nekhemjlekh.qpayPaymentId;

  // Try to fetch latest info from QPay if possible
  const { qpayShalgay } = require("quickqpaypackvSukh");
  let paidAmount = nekhemjlekh.niitTulbur || 0;

  if (nekhemjlekh.qpayInvoiceId) {
    try {
      const khariu = await qpayShalgay({ invoice_id: nekhemjlekh.qpayInvoiceId }, kholbolt);
      if (khariu?.payments?.[0]?.transactions?.[0]?.id) {
        paymentTransactionId = khariu.payments[0].transactions[0].id;
        if (khariu.payments[0].amount) {
          paidAmount = parseFloat(khariu.payments[0].amount);
        }
      }
    } catch (err) {
      console.error("⚠️ [QPAY_SYNC] Failed to fetch QPay status:", err.message);
    }
  }

  // Record in Ledger (GuilgeeAvlaguud)
  await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    gereeniiId: nekhemjlekh.gereeniiId,
    dun: paidAmount,
    tailbar: `QPay төлөлт (Callback: ${nekhemjlekhiinId})`,
    source: "nekhemjlekh",
    bankniiGuilgeeId: paymentTransactionId || nekhemjlekh.qpayInvoiceId || "manual_sync",
    ognoo: new Date(),
    nekhemjlekhId: nekhemjlekhiinId,
  });

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

  // Socket updates
  const io = req.app.get("socketio");
  if (io) {
    const { clearOrgCache } = require("../utils/redisClient");
    clearOrgCache(baiguullagiinId).catch(() => {});
    io.emit(`tulburUpdated:${baiguullagiinId}`, {});
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


