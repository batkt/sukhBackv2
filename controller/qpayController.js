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

exports.qpayTulye = asyncHandler(async (req, res, next) => {
  try {
    var kholboltuud = db.kholboltuud;
    var tukhainBaaziinKholbolt = kholboltuud.find(
      (a) => a.baiguullagiinId == req.params.baiguullagiinId
    );
    if (req.params.baiguullagiinId == "664ac9b28bfeed5bdce01388") {
      var qpayBarimt = await QpayObject(tukhainBaaziinKholbolt).findOne({
        "qpay.sender_invoice_no": req.params.dugaar,
        baiguullagiinId: req.params.baiguullagiinId,
        barilgiinId: req.params.barilgiinId,
      });
      if (req.query && req.query.qpay_payment_id)
        qpayBarimt.payment_id = req.query.qpay_payment_id;
      qpayBarimt.tulsunEsekh = true;
      qpayBarimt.isNew = false;
      req.app
        .get("socketio")
        .emit(
          `qpay/${req.params.baiguullagiinId}/${qpayBarimt.zakhialgiinDugaar}`
        );
      qpayBarimt.save();
      res.sendStatus(200);
    } else {
      var qpayBarimt = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
        zakhialgiinDugaar: req.params.dugaar,
        baiguullagiinId: req.params.baiguullagiinId,
        salbariinId: req.params.barilgiinId,
      });
      if (!!qpayBarimt.zogsooliinId) {
        const body = {
          tukhainBaaziinKholbolt,
          turul: "qpayUridchilsan",
          uilchluulegchiinId: qpayBarimt.zogsoolUilchluulegch.uId,
          paid_amount: qpayBarimt.zogsoolUilchluulegch.pay_amount,
          plate_number: qpayBarimt.zogsoolUilchluulegch.plate_number,
          barilgiinId: qpayBarimt.salbariinId,
          ajiltniiNer: "zochin",
          zogsooliinId: qpayBarimt.zogsooliinId,
        };
        qpayBarimt.tulsunEsekh = true;
        qpayBarimt.isNew = false;
        qpayBarimt.save();
        res.sendStatus(200);
      } else if (!!qpayBarimt.gereeniiId) {
        if (req.query && req.query.qpay_payment_id)
          qpayBarimt.payment_id = req.query.qpay_payment_id;
        qpayBarimt.tulsunEsekh = true;
        qpayBarimt.isNew = false;
        var tulbur = [];
        var updateQuery = {};
        var updatePush = {};
        var geree = await Geree(tukhainBaaziinKholbolt, true).findOne({
          _id: qpayBarimt.gereeniiId,
        });
        var qpayAmount = parseFloat(qpayBarimt.qpay.amount);
        // qpayShimtgel feature removed
        if (geree.aldangiinUldegdel && geree.aldangiinUldegdel > 0) {
          var tulsunDun = 0;
          if (geree.aldangiinUldegdel >= qpayAmount) {
            geree.aldangiinUldegdel = geree.aldangiinUldegdel - qpayAmount;
            tulsunDun = qpayAmount;
          } else {
            tulsunDun = geree.aldangiinUldegdel;
            var iluuDun = qpayAmount - tulsunDun;
            tulbur.push({
              turul: "qpay",
              tulsunDun: iluuDun,
              ognoo: qpayBarimt.ognoo,
              guilgeeKhiisenOgnoo: new Date(),
            });
            geree.aldangiinUldegdel = 0;
          }
          tulbur.push({
            tailbar: "систем алданги qpay ээр төлсөн",
            turul: "aldangi",
            aldangiinTurul: "qpay",
            tulukhAldangi: geree.aldangiinUldegdel,
            tulsunAldangi: tulsunDun,
            ognoo: qpayBarimt.ognoo,
            guilgeeKhiisenOgnoo: new Date(),
          });
          var niitTulsunAldangi = tulbur
            ?.filter((a) => a.turul == "aldangi")
            .reduce((a, b) => a + b.tulsunAldangi, 0);
          const niitTulsun = (geree.niitTulsunAldangi || 0) + niitTulsunAldangi;
          updateQuery = {
            $set: {
              aldangiinUldegdel: geree.aldangiinUldegdel,
              niitTulsunAldangi: niitTulsun,
            },
          };
          updatePush = {
            $push: {
              "avlaga.guilgeenuud": {
                $each: tulbur,
              },
            },
          };
        } else {
          tulbur.push({
            turul: "qpay",
            tulsunDun: qpayAmount,
            ognoo: qpayBarimt.ognoo,
            guilgeeKhiisenOgnoo: new Date(),
          });
          updateQuery = {
            $push: {
              [`avlaga.guilgeenuud`]: {
                $each: tulbur,
              },
            },
          };
        }
        await Geree(tukhainBaaziinKholbolt).findByIdAndUpdate(
          { _id: qpayBarimt.gereeniiId },
          updatePush,
          { new: true }
        );

        const result = await Geree(tukhainBaaziinKholbolt).findByIdAndUpdate(
          { _id: qpayBarimt.gereeniiId },
          updateQuery,
          { new: true }
        );

        await qpayBarimt.save();
        var tulsunDun = tulbur
          .filter((a) => a.turul == "qpay")
          .reduce((a, b) => a + b.tulsunDun, 0);

        var tulsunAldangi = tulbur
          .filter((a) => a.turul == "aldangi")
          .reduce((a, b) => a + b.tulsunAldangi, 0);

        // TEMPORARILY DISABLED: Payment confirmation SMS
        // await tulultiinMsgIlgeeye(
        //   req.params.baiguullagiinId,
        //   result.gereeniiDugaar,
        //   result.utas[0],
        //   tulsunDun,
        //   tulsunAldangi
        // );

        await daraagiinTulukhOgnooZasya(
          qpayBarimt.gereeniiId,
          tukhainBaaziinKholbolt
        );
        res.sendStatus(200);
      }
    }
  } catch (err) {
    if (next) next(err);
  }
});
