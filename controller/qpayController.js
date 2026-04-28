const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");
const Baiguullaga = require("../models/baiguullaga");
//const Dugaarlalt = require("../models/dugaarlalt");
const { Dugaarlalt, Token, Dans, db } = require("zevbackv2");
const QpayObject = require("../models/qpayObject");
const Geree = require("../models/geree");
const got = require("got");
const { QuickQpayObject } = require("quickqpaypackvSukh");
const { URL } = require("url");
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
    const response = await instance
      .post(url, { body: stringBody })
      .catch((err) => {
        throw err;
      });
    const khariu = JSON.parse(response.body);
    Token(tukhainBaaziinKholbolt)
      .updateOne(
        { turul: "qpay", baiguullagiinId: baiguullagiinId },
        {
          ognoo: new Date(),
          token: khariu.access_token,
          refreshToken: khariu.refresh_token,
        },
        { upsert: true }
      )
      .then((x) => {})
      .catch((e) => {});
    return khariu;
  } catch (error) {
    next(error);
  }
}

async function tokenAvyaKhuuchin(
  username,
  password,
  next,
  baiguullagiinId,
  tukhainBaaziinKholbolt
) {
  try {
    var url = new URL(process.env.QPAY_SERVER + "v2/auth/token/");
    url.username = username;
    url.password = password;
    const response = await instance.post(url).catch((err) => {
      throw err;
    });
    var khariu = JSON.parse(response.body);
    Token(tukhainBaaziinKholbolt)
      .updateOne(
        { turul: "qpay", baiguullagiinId: baiguullagiinId },
        {
          ognoo: new Date(),
          token: khariu.access_token,
          refreshToken: khariu.refresh_token,
        },
        { upsert: true }
      )
      .then((x) => {})
      .catch((e) => {
        throw e;
      });
    return khariu;
  } catch (error) {
    next(error);
  }
}

async function qpayMedeelelAvya(token, qpayObject, next) {
  try {
    var url = process.env.QPAY_MERCHANT_SERVER + "v2/payment/check/";
    url = new URL(url);
    const context = {
      token: "Bearer " + token,
    };
    const qpayObjectString = JSON.stringify(qpayObject);
    const response = await instance
      .post(url, {
        context,
        body: qpayObjectString,
      })
      .catch((err) => {
        throw err;
      });
    if (!response.body) {
      if (next) {
        next(new aldaa("Алдаа гарлаа!"));
      } else return null;
    }
    return JSON.parse(response.body);
  } catch (error) {
    next(error);
  }
}

async function tokenSungaya(token, next) {
  try {
    var url = process.env.QPAY_SERVER + "v2/auth/refresh";
    url = new URL(url);
    const context = {
      token: "Bearer " + token,
    };
    const response = await instance.post(url, { context }).catch((err) => {
      throw err;
    });
    if (!response.body) {
      if (next) {
        next(new aldaa("Алдаа гарлаа!"));
      } else return null;
    }
    return JSON.parse(response.body);
  } catch (error) {
    if (next) next(error);
  }
}

async function qpayShivye(token, qpayObject, next) {
  try {
    var url = process.env.QPAY_SERVER + "v2/invoice";
    url = new URL(url);
    const context = {
      token: "Bearer " + token,
    };
    const qpayObjectString = JSON.stringify(qpayObject);
    const response = await instance
      .post(url, {
        context,
        body: qpayObjectString,
      })
      .catch((err) => {
        throw err;
      });
    if (!response.body) {
      if (next) {
        next(new aldaa("Алдаа гарлаа!"));
      } else return null;
    }
    return JSON.parse(response.body);
  } catch (error) {
    if (next) next(error);
  }
}

async function qpayObjectUusgeye(
  body,
  invoiceCode,
  next,
  tukhainBaaziinKholbolt
) {
  try {
    var maxDugaar = 1;
    await Dugaarlalt(tukhainBaaziinKholbolt)
      .find({
        baiguullagiinId: body.baiguullagiinId,
        barilgiinId: body.barilgiinId,
        turul: "qpay",
      })
      .sort({
        dugaar: -1,
      })
      .limit(1)
      .then((result) => {
        if (result != 0) maxDugaar = result[0].dugaar + 1;
      });
    var object = {
      invoice_code: invoiceCode,
      sender_invoice_no: maxDugaar.toString(),
      invoice_receiver_code: body.burtgeliinDugaar,
      invoice_description: "Төлбөр", //xuuchnaar n zuwxun master yawj baigaa uchir...
      allow_partial: false,
      minimum_amount: null,
      allow_exceed: false,
      maximum_amount: null,
      amount: body.dun,
      callback_url:
        process.env.UNDSEN_SERVER +
        "/qpayTulye/" +
        body.baiguullagiinId.toString() +
        "/" +
        body.barilgiinId.toString() +
        "/" +
        maxDugaar.toString(),
    };
    return object;
  } catch (error) {
    if (next) next(error);
  }
}

exports.qpayGargayaKhuuchin = asyncHandler(async (req, res, next) => {
  var dans = await Dans(req.body.tukhainBaaziinKholbolt).findOne({
    dugaar: req.body.dansniiDugaar,
  });
  if (!dans) throw new aldaa("Дансны тохиргоо хийгдээгүй байна!");
  if (
    !dans.qpayAshiglakhEsekh ||
    !dans.qpayUsername ||
    !dans.qpayPassword ||
    !dans.qpayInvoiceCode
  )
    throw new aldaa("Qpay тохиргоо хийгдээгүй байна!");

  var tokenObject = await Token(req.body.tukhainBaaziinKholbolt).findOne({
    turul: "qpay",
    baiguullagiinId: req.body.baiguullagiinId,
    ognoo: { $gte: new Date(new Date().getTime() - 29 * 60000) },
  });
  var token;
  if (!tokenObject) {
    tokenObject = await tokenAvyaKhuuchin(
      dans.qpayUsername,
      dans.qpayPassword,
      next,
      req.body.baiguullagiinId,
      req.body.tukhainBaaziinKholbolt
    );
    token = tokenObject.access_token;
  } else {
    var tokenO = await tokenSungaya(tokenObject.refreshToken, next);
    token = tokenO.access_token;
  }
  var qpayObject = await qpayObjectUusgeye(
    req.body,
    dans.qpayInvoiceCode,
    next,
    req.body.tukhainBaaziinKholbolt
  );
  var khariu = await qpayShivye(token, qpayObject, next);
  if (khariu && khariu.invoice_id) qpayObject.invoice_id = khariu.invoice_id;
  var dugaarlalt = new Dugaarlalt(req.body.tukhainBaaziinKholbolt)();
  dugaarlalt.baiguullagiinId = req.body.baiguullagiinId;
  dugaarlalt.barilgiinId = req.body.barilgiinId;
  dugaarlalt.ognoo = new Date();
  dugaarlalt.turul = "qpay";
  dugaarlalt.dugaar = Number(qpayObject.sender_invoice_no) + 1;
  dugaarlalt.save();
  var khadgalakhQpay = new QpayObject(req.body.tukhainBaaziinKholbolt)();
  khadgalakhQpay.zakhialgiinDugaar = req.body.zakhialgiinDugaar;
  khadgalakhQpay.qpay = qpayObject;
  khadgalakhQpay.baiguullagiinId = req.body.baiguullagiinId;
  khadgalakhQpay.barilgiinId = req.body.barilgiinId;
  khadgalakhQpay.ognoo = new Date();
  khadgalakhQpay.gereeniiId = req.body.gereeniiId;
  khadgalakhQpay.tulsunEsekh = false;
  khadgalakhQpay.save();
  res.send(khariu);
});

exports.qpayGuilgeeUtgaAvya = asyncHandler(async (req, res, next) => {
  try {
    var dans = await Dans(req.body.tukhainBaaziinKholbolt).findOne({
      dugaar: req.body.dansniiDugaar,
    });
    var guilgeenuud = await QuickQpayObject(
      req.body.tukhainBaaziinKholbolt
    ).find({
      tulsunEsekh: true,
      ognoo: { $gt: new Date("2023-12-02") },
    });
    var tokenObject = await Token(req.body.tukhainBaaziinKholbolt).findOne({
      turul: "quickQpay",
      baiguullagiinId: req.body.baiguullagiinId,
      ognoo: { $gte: new Date(new Date().getTime() - 29 * 60000) },
    });
    var token;
    if (!tokenObject) {
      tokenObject = await tokenAvya(
        "ZEV_TABS1",
        "PB5RcI2g",
        next,
        req.body.baiguullagiinId,
        req.body.tukhainBaaziinKholbolt
      );
      token = tokenObject.access_token;
    } else {
      var tokenO = await tokenSungaya(tokenObject.refreshToken, next);
      token = tokenO.access_token;
    }
    for await (const guilgee of guilgeenuud) {
      var khariu = await qpayMedeelelAvya(
        token,
        { invoice_id: guilgee.invoice_id },
        next
      );
      if (
        !!khariu &&
        !!khariu.payments &&
        !!khariu.payments[0].transactions &&
        !!khariu.payments[0].transactions[0].id
      ) {
        await QuickQpayObject(req.body.tukhainBaaziinKholbolt).updateOne(
          {
            invoice_id: guilgee.invoice_id,
          },
          {
            legacy_id: khariu.payments[0].transactions[0].id,
          }
        );
      }
    }
    res.send("Amjilttai");
  } catch (err) {
    next(err);
  }
});

const guilgeeService = require("../services/guilgeeService");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

exports.qpayTulye = asyncHandler(async (req, res) => {
  const { baiguullagiinId, barilgiinId, dugaar } = req.params;
  const { db } = require("zevbackv2");

  const kholbolt = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(baiguullagiinId));
  if (!kholbolt) return res.status(404).send("Connection not found");

  // Support both legacy QpayObject and new QuickQpayObject
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
  if (qpayBarimt.tulsunEsekh) return res.sendStatus(200); // Idempotent

  const amount = parseFloat(qpayBarimt.qpay?.amount || qpayBarimt.amount || 0);
  if (amount <= 0) return res.status(400).send("Invalid amount");

  // Record payment in Ledger
  const paymentResult = await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    gereeniiId: qpayBarimt.gereeniiId,
    dun: amount,
    tailbar: `QPay төлөлт (${dugaar})`,
    source: "nekhemjlekh",
    bankniiGuilgeeId: qpayBarimt.payment_id || dugaar,
    allocationFilter: qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId 
      ? { nekhemjlekhId: qpayBarimt.sukhNekhemjlekh.nekhemjlekhiinId }
      : {}
  });

  // Update QPay record status
  qpayBarimt.tulsunEsekh = true;
  qpayBarimt.status = "paid";
  if (req.query?.qpay_payment_id) qpayBarimt.payment_id = req.query.qpay_payment_id;
  await qpayBarimt.save();

  // Sync Invoice status (Binary: Paid/Unpaid)
  if (qpayBarimt.sukhNekhemjlekh?.nekhemjlekhiinId) {
    const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
    const invId = qpayBarimt.sukhNekhemjlekh.nekhemjlekhiinId;
    const balance = await guilgeeService.getBalance(kholbolt, { nekhemjlekhId: invId });
    await NekhemjlekhModel.findByIdAndUpdate(invId, {
      tuluv: balance <= 0.01 ? "Төлсөн" : "Төлөөгүй"
    });
  }

  // Emit socket updates
  const io = req.app.get("socketio");
  if (io) {
    io.emit(`qpay/${baiguullagiinId}/${qpayBarimt.zakhialgiinDugaar}`);
    io.emit(`tulburUpdated:${baiguullagiinId}`, {});
  }

  res.sendStatus(200);
});
