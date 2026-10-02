const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");
const { Dugaarlalt, Token, Dans, db } = require("zevbackv2");
const QpayObject = require("../models/qpayObject");
const Geree = require("../models/geree");
const Medegdel = require("../models/medegdel");
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

  let isQuickQpay = true;
  if (!qpayBarimt) {
    qpayBarimt = await QpayModel.findOne({
      "qpay.sender_invoice_no": dugaar,
      baiguullagiinId,
    });
    isQuickQpay = false;
  }

  if (!qpayBarimt) {
    console.warn(`⚠️ [QPAY CALLBACK] Record not found for dugaar=${dugaar}, baiguullagiinId=${baiguullagiinId}`);
    return res.status(404).send("QPay record not found");
  }
  
  if (qpayBarimt.tulsunEsekh) {
    console.log(`ℹ️ [QPAY CALLBACK] Already paid (idempotent): dugaar=${dugaar}`);
    return res.sendStatus(200);
  }

  // Иргэн бодитоор төлсөн огноо (QPay-ийн payment_date)
  let tulsunOgnoo = new Date();
  // АЮУЛГҮЙ БАЙДАЛ: нийтэд нээлттэй callback — QPay «PAID» гэж баталсан үед л бүртгэнэ.
  {
    const qpayInvoiceId = qpayBarimt.invoice_id || qpayBarimt.qpay?.invoice_id;
    let batalgaajsan = false;
    if (qpayInvoiceId) {
      try {
        const khariu = await require("../utils/qpayShalgayAyulgui").qpayShalgayAyulgui({ invoice_id: qpayInvoiceId, baiguullagiinId, barilgiinId: qpayBarimt?.salbariinId || barilgiinId }, kholbolt);
        const tuluv = String(khariu?.invoice_status || "").toUpperCase();
        tulsunOgnoo = require("../utils/qpayShalgayAyulgui").qpayTulsunOgnoo(khariu);
        batalgaajsan =
          tuluv === "PAID" ||
          tuluv === "CLOSED" ||
          (Array.isArray(khariu?.payments) &&
            khariu.payments.some((p) => p?.payment_status === "PAID" || p?.status === "PAID"));
      } catch (err) {
        console.error("⚠️ [QPAY CALLBACK] QPay шалгахад алдаа:", err.message);
      }
    }
    if (!batalgaajsan) {
      console.warn(`⛔ [QPAY CALLBACK] QPay төлбөрийг баталгаажуулсангүй — бүртгэхгүй: dugaar=${dugaar}`);
      return res.sendStatus(200);
    }
  }

  // Atomically lock/update the record to prevent concurrent double callback executions.
  const targetModel = isQuickQpay ? QuickQpayModel : QpayModel;
  const lockedBarimt = await targetModel.findOneAndUpdate(
    {
      _id: qpayBarimt._id,
      tulsunEsekh: { $ne: true }
    },
    {
      $set: { tulsunEsekh: true, status: "paid" }
    },
    { new: true }
  );

  if (!lockedBarimt) {
    console.log(`ℹ️ [QPAY CALLBACK] Already processing or paid (skipped): dugaar=${dugaar}`);
    return res.sendStatus(200);
  }

  qpayBarimt = lockedBarimt;

  const amount = parseFloat(qpayBarimt.qpay?.amount || qpayBarimt.amount || 0);
  console.log(`ℹ️ [QPAY CALLBACK] Proceeding with payment: dugaar=${dugaar}, amount=${amount}`);
  if (amount <= 0) {
    console.error(`❌ [QPAY CALLBACK] Invalid amount for dugaar=${dugaar}: ${amount}`);
    return res.status(400).send("Invalid amount");
  }

  // Ангиллаар төлсөн бол ledger мөрийг ангиллаар нь тэмдэглэнэ (вэбийн
  // TransactionModal-ын «Орон сууц / Гараж / Агуулах» төлөлттэй ижил zardliinNer).
  const ANGILAL = { oron: "Орон сууц", zogsool: "Зогсоол", aguulakh: "Агуулах" };
  const angilliinNer = ANGILAL[String(req.params.angilal || "")];
  const angilliinShoshgo = angilliinNer === "Зогсоол" ? "Гараж" : angilliinNer;

  // Record payment in Ledger (Authoritative)
  const ledgerResult = await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    gereeniiId: qpayBarimt.gereeniiId || req.params.gereeniiId,
    dun: amount,
    tailbar: angilliinShoshgo ? `QPay төлөлт (${angilliinShoshgo})` : `QPay төлөлт`,
    ...(angilliinNer ? { zardliinNer: angilliinNer } : {}),
    source: "nekhemjlekh",
    bankniiGuilgeeId: qpayBarimt.payment_id || dugaar,
    ognoo: tulsunOgnoo,
    nekhemjlekhId: qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId
  });

  if (ledgerResult && ledgerResult.alreadyExists) {
    console.log(`ℹ️ [QPAY CALLBACK] Ledger payment record already exists (skipped duplicate): dugaar=${dugaar}`);
    return res.sendStatus(200);
  }

  if (!ledgerResult || !ledgerResult.success) {
    console.error(`❌ [QPAY CALLBACK] Ledger recording failed: ${ledgerResult?.error || "Unknown error"}`);
    return res.status(500).send("Ledger recording failed");
  }

  // Trigger ebarimt if invoice exists
  if (qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId) {
    generateEbarimtForQPay(kholbolt, baiguullagiinId, qpayBarimt.sukhNekhemjlekh.nekhemjlekhiinId, amount);
  }

  // Update payment ID if provided in query
  if (req.query?.qpay_payment_id) {
    qpayBarimt.payment_id = req.query.qpay_payment_id;
    await qpayBarimt.save();
  }
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

    // Targeted notification to the resident & admin panel
    try {
      const GereeModel = Geree(kholbolt);
      const geree = await GereeModel.findById(qpayBarimt.gereeniiId).lean();
      
      if (geree?.orshinSuugchId) {
        io.emit(`orshinSuugch${geree.orshinSuugchId}`, {
          title: "Төлбөр амжилттай",
          message: `Таны ${amount}₮-ийн төлөлт амжилттай бүртгэгдлээ.`,
          turul: "app",
          baiguullagiinId
        });
      }

      // Notify admin panel
      io.emit("baiguullagiin" + baiguullagiinId, {
        type: "qpayPayment",
        data: {
          toot: geree?.toot || qpayBarimt.toot || "",
          ner: `${geree?.ovog || ""} ${geree?.ner || ""}`.trim() || qpayBarimt.ner || "Оршин суугч",
          amount: amount,
          baiguullagiinId: baiguullagiinId,
          barilgiinId: geree?.barilgiinId || qpayBarimt.barilgiinId || "",
          gereeniiDugaar: geree?.gereeniiDugaar || qpayBarimt.gereeniiDugaar || "",
        }
      });

      // Create and save web notification (turul: "medegdel")
      try {
        const MedegdelModel = Medegdel(kholbolt);
        const notifMsg = `${geree?.toot || qpayBarimt.toot || ""} тоот, ${geree?.ner || qpayBarimt.ner || "Оршин суугч"} QPay-ээр ${amount.toLocaleString()}₮ төллөө.`;
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
        const existingNotif = await MedegdelModel.findOne({
          baiguullagiinId,
          message: notifMsg,
          ognoo: { $gte: twoMinAgo },
        });

        if (existingNotif) {
          console.log(`ℹ️ [QPAY CALLBACK] Duplicate web notification prevented: ${notifMsg}`);
        } else {
          const m = new MedegdelModel({
            baiguullagiinId,
            barilgiinId: geree?.barilgiinId || qpayBarimt.barilgiinId || "",
            title: "QPay төлөлт",
            message: notifMsg,
            orshinSuugchId: geree?.orshinSuugchId || qpayBarimt.orshinSuugchId || "",
            orshinSuugchNer: `${geree?.ovog || ""} ${geree?.ner || ""}`.trim() || qpayBarimt.ner || "",
            orshinSuugchUtas: (Array.isArray(geree?.utas) ? geree?.utas[0] : geree?.utas) || qpayBarimt.utas || "",
            gereeniiDugaar: geree?.gereeniiDugaar || qpayBarimt.gereeniiDugaar || "",
            // Хүснэгтэд шууд ашиглах бүтэцтэй талбарууд (текстээс задлахгүй).
            toot: geree?.toot || qpayBarimt.toot || "",
            dun: amount,
            kharsanEsekh: false,
            status: "pending",
            turul: "medegdel",
            ognoo: new Date()
          });
          await m.save();

          io.emit("baiguullagiin" + baiguullagiinId, {
            type: "medegdelNew",
            data: m.toObject ? m.toObject() : m
          });
        }
      } catch (err) {
        console.error("⚠️ [QPAY CALLBACK] Failed to create web notification:", err.message);
      }
    } catch (err) {
      console.error("⚠️ [SOCKET] Failed to send resident or admin notification:", err.message);
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

  if (nekhemjlekh.tuluv === "Төлсөн") {
    console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Invoice is already PAID (idempotent skip): ${nekhemjlekhiinId}`);
    return res.sendStatus(200);
  }

  // ── АЮУЛГҮЙ БАЙДАЛ: QPay-ээс баталгаажуулна ─────────────────────────────
  // Callback нийтэд нээлттэй. Өмнө нь QPay «төлөгдөөгүй» гэж хариулсан ч
  // QuickQpay бичлэгийн дүн эсвэл ГЭРЭЭНИЙ ҮЛДЭГДЛЭЭР төлбөр бүртгэж,
  // И-баримт гаргадаг байв — URL нээхэд л өр төлөгдсөн болдог. Одоо QPay
  // «PAID» гэсэн үед л, QPay-ийн төлсөн дүнгээр бүртгэнэ.
  const { QuickQpayObject, qpayShalgay } = require("quickqpaypackvSukh");
  const QuickQpayModel = QuickQpayObject(kholbolt);
  const qpayBichleg = await QuickQpayModel.findOne({
    $or: [
      ...(nekhemjlekh.qpayInvoiceId ? [{ invoice_id: nekhemjlekh.qpayInvoiceId }] : []),
      { "sukhNekhemjlekh.nekhemjlekhiinId": nekhemjlekhiinId },
      { "qpay.callback_url": { $regex: String(nekhemjlekhiinId).replace(/[^a-fA-F0-9]/g, "") } },
    ],
  })
    .sort({ ognoo: -1 })
    .lean();
  const qpayInvoiceId =
    nekhemjlekh.qpayInvoiceId || qpayBichleg?.invoice_id || qpayBichleg?.qpay?.invoice_id || null;

  let paidAmount = 0;
  // Иргэн бодитоор төлсөн огноо (QPay-ийн payment_date)
  let tulsunOgnoo = new Date();
  let paymentTransactionId = null;
  if (qpayInvoiceId) {
    try {
      const khariu = await require("../utils/qpayShalgayAyulgui").qpayShalgayAyulgui({ invoice_id: qpayInvoiceId, baiguullagiinId, barilgiinId: qpayBichleg?.salbariinId || nekhemjlekh?.barilgiinId }, kholbolt);
      const tulburuud = (Array.isArray(khariu?.payments) ? khariu.payments : []).filter(
        (p) => p?.payment_status === "PAID" || p?.status === "PAID",
      );
      const tuluv = String(khariu?.invoice_status || "").toUpperCase();
      if (tulburuud.length > 0 || tuluv === "PAID" || tuluv === "CLOSED") {
        tulsunOgnoo = require("../utils/qpayShalgayAyulgui").qpayTulsunOgnoo(khariu);
        paidAmount =
          tulburuud.reduce((sum, p) => sum + (Number(p?.payment_amount ?? p?.amount) || 0), 0) ||
          Number(khariu?.paid_amount) ||
          0;
        paymentTransactionId =
          tulburuud[0]?.transactions?.[0]?.id || khariu?.payments?.[0]?.transactions?.[0]?.id || null;
      }
    } catch (err) {
      console.error("⚠️ [QPAY-INVOICE CALLBACK] QPay шалгахад алдаа:", err.message);
    }
  }

  if (!(paidAmount > 0)) {
    console.warn(
      `⛔ [QPAY-INVOICE CALLBACK] QPay төлбөрийг баталгаажуулсангүй — бүртгэхгүй: ${nekhemjlekhiinId} (qpay=${qpayInvoiceId || "-"})`,
    );
    return res.sendStatus(200);
  }

  // Давхар ажиллахаас сэргийлж QPay бичлэгийг атомаар түгжинэ.
  const lockedQpayRecord = await QuickQpayModel.findOneAndUpdate(
    {
      $or: [
        { invoice_id: qpayInvoiceId },
        { "sukhNekhemjlekh.nekhemjlekhiinId": nekhemjlekhiinId },
      ],
      tulsunEsekh: { $ne: true },
    },
    { $set: { tulsunEsekh: true, status: "paid", payment_id: paymentTransactionId || "qpay_verified" } },
    { new: true },
  ).sort({ ognoo: -1 });
  if (!lockedQpayRecord && qpayBichleg) {
    console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Already processing or paid (skipped): ${nekhemjlekhiinId}`);
    return res.sendStatus(200);
  }

  console.log(`ℹ️ [QPAY-INVOICE CALLBACK] QPay баталгаажсан: ${nekhemjlekhiinId}, дүн=${paidAmount}, гүйлгээ=${paymentTransactionId}`);

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
    ognoo: tulsunOgnoo,
    nekhemjlekhId: nekhemjlekhiinId,
  });

  if (ledgerResult && ledgerResult.alreadyExists) {
    console.log(`ℹ️ [QPAY-INVOICE CALLBACK] Ledger payment record already exists (skipped duplicate): ${paymentTransactionId}`);
    return res.sendStatus(200);
  }

  if (!ledgerResult || !ledgerResult.success) {
    console.error(`❌ [QPAY-INVOICE CALLBACK] Ledger recording failed: ${ledgerResult?.error || "Unknown error"}`);
    return res.status(500).send("Ledger recording failed");
  }

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

      bankGuilgee.tranDate = tulsunOgnoo;
      bankGuilgee.amount = paidAmount;
      bankGuilgee.description = `QPay төлбөр - Гэрээ ${nekhemjlekh.gereeniiDugaar || ""}`;
      bankGuilgee.accName = nekhemjlekh.nekhemjlekhiinDansniiNer || "";
      bankGuilgee.accNum = nekhemjlekh.nekhemjlekhiinDans || "";

      bankGuilgee.record = paymentTransactionId || nekhemjlekh.qpayInvoiceId || "manual_sync";
      bankGuilgee.tranId = paymentTransactionId || nekhemjlekh.qpayInvoiceId || "manual_sync";
      bankGuilgee.balance = 0;
      bankGuilgee.requestId = nekhemjlekh.qpayInvoiceId || "";

      // Гэрээгүй нэхэмжлэх дээр `[null]` хадгалагдвал вэб тал нь "null" мөр
      // болгон `_id: {$in: [...]}`-д явуулж CastError өгдөг.
      bankGuilgee.kholbosonGereeniiId = nekhemjlekh.gereeniiId
        ? [nekhemjlekh.gereeniiId]
        : [];
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
      bankGuilgee.postDate = tulsunOgnoo;

      bankGuilgee.indexTalbar = `${bankGuilgee.barilgiinId}${bankGuilgee.bank}${bankGuilgee.dansniiDugaar}${bankGuilgee.record}${bankGuilgee.amount}`;

      await bankGuilgee.save();
      console.log(`✅ [QPAY-INVOICE CALLBACK] BankniiGuilgee created: amount=${paidAmount}`);
    }
  } catch (bankErr) {
    console.error("❌ [QPAY-INVOICE CALLBACK] BankniiGuilgee creation failed:", bankErr.message);
  }

  // Update Invoice state
  const balance = await guilgeeService.getBalance(kholbolt, { nekhemjlekhId: nekhemjlekhiinId });
  const isFullyPaid = balance <= 0.01;
  const currentTulsun = Number(nekhemjlekh.tulsunDun || 0);
  const newTulsun = currentTulsun + paidAmount;
  const newUldegdel = Math.max(0, Number(nekhemjlekh.niitTulbur || 0) - newTulsun);
  
  nekhemjlekh.tuluv = isFullyPaid ? "Төлсөн" : "Төлөөгүй";
  nekhemjlekh.tulsunDun = newTulsun;
  nekhemjlekh.uldegdel = newUldegdel;
  nekhemjlekh.tulsunOgnoo = tulsunOgnoo;
  nekhemjlekh.qpayPaymentId = paymentTransactionId;
  
  nekhemjlekh.paymentHistory = nekhemjlekh.paymentHistory || [];
  nekhemjlekh.paymentHistory.push({
    ognoo: tulsunOgnoo,
    dun: paidAmount,
    turul: "төлөлт",
    guilgeeniiId: paymentTransactionId || "manual_sync",
    tailbar: "QPay төлбөр амжилттай синхрончлогдлоо",
  });

  // Expire the one-time payment token so the link can no longer be used
  nekhemjlekh.paymentTokenExpiresAt = new Date();

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

    // Targeted notification to the resident & admin panel
    try {
      const GereeModel = Geree(kholbolt);
      const geree = await GereeModel.findById(nekhemjlekh.gereeniiId).lean();
      
      if (geree?.orshinSuugchId) {
        io.emit(`orshinSuugch${geree.orshinSuugchId}`, {
          title: "Төлбөр амжилттай",
          message: `Таны ${paidAmount}₮-ийн төлөлт амжилттай бүртгэгдлээ.`,
          turul: "app",
          baiguullagiinId
        });
      }

      // Notify admin panel
      io.emit("baiguullagiin" + baiguullagiinId, {
        type: "qpayPayment",
        data: {
          toot: geree?.toot || nekhemjlekh.toot || "",
          ner: `${geree?.ovog || ""} ${geree?.ner || ""}`.trim() || nekhemjlekh.ner || "Оршин суугч",
          amount: paidAmount,
          baiguullagiinId: baiguullagiinId,
          barilgiinId: geree?.barilgiinId || nekhemjlekh.barilgiinId || "",
          gereeniiDugaar: geree?.gereeniiDugaar || nekhemjlekh.gereeniiDugaar || "",
        }
      });

      // Create and save web notification (turul: "medegdel")
      try {
        const MedegdelModel = Medegdel(kholbolt);
        const notifMsg = `${geree?.toot || nekhemjlekh.toot || ""} тоот, ${geree?.ner || nekhemjlekh.ner || "Оршин суугч"} QPay-ээр ${paidAmount.toLocaleString()}₮ төллөө.`;
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
        const existingNotif = await MedegdelModel.findOne({
          baiguullagiinId,
          message: notifMsg,
          ognoo: { $gte: twoMinAgo },
        });

        if (existingNotif) {
          console.log(`ℹ️ [QPAY PAYMENT] Duplicate web notification prevented: ${notifMsg}`);
        } else {
          const m = new MedegdelModel({
            baiguullagiinId,
            barilgiinId: geree?.barilgiinId || nekhemjlekh.barilgiinId || "",
            title: "QPay төлөлт",
            message: notifMsg,
            orshinSuugchId: geree?.orshinSuugchId || nekhemjlekh.orshinSuugchId || "",
            orshinSuugchNer: `${geree?.ovog || ""} ${geree?.ner || ""}`.trim() || nekhemjlekh.ner || "",
            orshinSuugchUtas: (Array.isArray(geree?.utas) ? geree?.utas[0] : geree?.utas) || nekhemjlekh.utas || "",
            gereeniiDugaar: geree?.gereeniiDugaar || nekhemjlekh.gereeniiDugaar || "",
            toot: geree?.toot || nekhemjlekh.toot || "",
            dun: paidAmount,
            kharsanEsekh: false,
            status: "pending",
            turul: "medegdel",
            ognoo: new Date()
          });
          await m.save();

          io.emit("baiguullagiin" + baiguullagiinId, {
            type: "medegdelNew",
            data: m.toObject ? m.toObject() : m
          });
        }
      } catch (err) {
        console.error("⚠️ [QPAY-INVOICE CALLBACK] Failed to create web notification:", err.message);
      }
    } catch (err) {
      console.error("⚠️ [SOCKET] Failed to send resident or admin notification:", err.message);
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
      const khariu = await require("../utils/qpayShalgayAyulgui").qpayShalgayAyulgui(
        {
          invoice_id: guilgee.qpay?.invoice_id || guilgee.invoice_id,
          baiguullagiinId: guilgee.baiguullagiinId,
          barilgiinId: guilgee.salbariinId,
        },
        tukhainBaaziinKholbolt,
      );
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
          shineBarimt.toot = nekhemjlekh.toot || "";
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
