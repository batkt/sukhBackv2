const asyncHandler = require("express-async-handler");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const Baiguullaga = require("../models/baiguullaga");
const { Dugaarlalt, Token, Dans } = require("zevbackv2");
const xml2js = require("xml2js");
const axios = require("axios");
const got = require("got");
const { URL } = require("url");
var CryptoJS = require("crypto-js");

const instance = got.extend({
  hooks: {
    beforeRequest: [
      (options) => {
        options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        if (options.context && options.context.token) {
          options.headers["Authorization"] = options.context.token;
        }
      },
    ],
  },
});

const instanceJson = got.extend({
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
  barilgiinId,
  tukhainBaaziinKholbolt
) {
  try {
    console.log("Энэ рүү орлоо: tokenAvya");
    var url = new URL(
      "https://api.khanbank.com/v1/auth/token?grant_type=client_credentials"
    );
    url.username = username;
    url.password = password;
    const response = await instance.post(url).catch((err) => {
      console.error("Token request failed:", err.message);
      throw err;
    });
    var qeury = { turul: "khaanCorporate", baiguullagiinId: baiguullagiinId };
    if (!!barilgiinId) qeury["barilgiinId"] = barilgiinId;
    var khariu = JSON.parse(response.body);
    Token(tukhainBaaziinKholbolt)
      .updateOne(
        qeury,
        { ognoo: new Date(), token: khariu.access_token },
        { upsert: true }
      )
      .then((x) => {
        // Token saved
      })
      .catch((e) => {
        console.error("Failed to save token:", e.message);
      });
    return khariu;
  } catch (error) {
    console.error("Error getting token:", error.message);
    if (next) next(new Error("Банктай холбогдоход алдаа гарлаа!"));
  }
}

// Golomt token function
async function golomtTokenAvya(dans, tukhainBaaziinKholbolt) {
  try {
    console.log("Энэ рүү орлоо: golomtTokenAvya");
    var tokenObject = await Token(tukhainBaaziinKholbolt).findOne({
      turul: "golomt",
      baiguullagiinId: dans.baiguullagiinId,
      ognoo: { $gte: new Date(new Date().getTime() - 290000) },
    });
    if (!tokenObject) {
      var { username, password, sessionKey, ivKey } = dans;
      if (!sessionKey || !ivKey) return tokenObject;
      var sessionKey = CryptoJS.enc.Latin1.parse(sessionKey);
      var ivKey = CryptoJS.enc.Latin1.parse(ivKey);
      var encryptedPass = await CryptoJS.AES.encrypt(password, sessionKey, {
        mode: CryptoJS.mode.CBC,
        iv: ivKey,
      });
      var url = process.env.GOLOMT_SERVER + "/v1/auth/login";
      const response = await got
        .post(url, {
          headers: {
            "Content-Type": "application/json",
          },
          json: { name: username, password: encryptedPass.toString() },
        })
        .catch((err) => {
          throw err;
        });
      var khariu = JSON.parse(response.body);
      Token(tukhainBaaziinKholbolt)
        .updateOne(
          { turul: "golomt", baiguullagiinId: dans.baiguullagiinId },
          {
            ognoo: new Date(),
            token: khariu.token,
            refreshToken: khariu.refreshToken,
          },
          { upsert: true }
        )
        .then((x) => {})
        .catch((e) => {});
      tokenObject = khariu;
    } else if (tokenObject.ognoo < new Date(new Date().getTime() - 290000)) {
      var url = process.env.GOLOMT_SERVER + "/v1/auth/refresh";
      const response = await got
        .get(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + tokenObject.refreshToken,
          },
        })
        .catch((err) => {
          throw err;
        });
      var khariu = JSON.parse(response.body);
      Token(tukhainBaaziinKholbolt)
        .updateOne(
          { turul: "golomt", baiguullagiinId: dans.baiguullagiinId },
          {
            ognoo: new Date(),
            token: khariu.token,
            refreshToken: khariu.refreshToken,
          },
          { upsert: true }
        )
        .then((x) => {})
        .catch((e) => {});
      tokenObject = khariu;
    }
    return tokenObject;
  } catch (error) {
    new Error("Банктай холбогдоход алдаа гарлаа!" + error);
  }
}

// TDB token function
async function tdbTokenAvya(dans, tukhainBaaziinKholbolt) {
  try {
    var turul = "tdb" + (dans.corporateDansTusBur ? dans.dugaar : "");
    var tokenObject = await Token(tukhainBaaziinKholbolt).findOne({
      turul: turul,
      baiguullagiinId: dans.baiguullagiinId,
      ognoo: { $gte: new Date(new Date().getTime() - 50000) },
    });
    if (!tokenObject) {
      var url = process.env.TDB_SERVER + "/oauth2/token";
      const response = await got
        .post(url, {
          headers: {
            "Content-Type": "application/json",
          },
          json: {
            grant_type: "client_credentials",
            client_id: dans.corporateNevtrekhNer,
            client_secret: dans.corporateNuutsUg,
          },
        })
        .catch((err) => {
          throw err;
        });
      var khariu = JSON.parse(response.body);
      Token(tukhainBaaziinKholbolt)
        .updateOne(
          { turul: turul, baiguullagiinId: dans.baiguullagiinId },
          {
            ognoo: new Date(),
            token: khariu.token,
          },
          { upsert: true }
        )
        .then((x) => {})
        .catch((e) => {});
      tokenObject = khariu;
    }
    return tokenObject;
  } catch (error) {
    next(new Error("Банктай холбогдоход алдаа гарлаа!"));
  }
}

// Bogd token function
async function bogdTokentAvya(dans, tukhainBaaziinKholbolt) {
  var tokenObject = await Token(tukhainBaaziinKholbolt).findOne({
    turul: "bogd",
    baiguullagiinId: dans.baiguullagiinId,
    ognoo: { $gte: new Date(new Date().getTime() - 590000) },
  });
  if (!tokenObject) {
    const paramsVal = new URLSearchParams(
      "username=" +
        dans.corporateNevtrekhNer +
        "&password=" +
        dans.corporateNuutsUg
    );
    const response = await got
      .post(process.env.BOGD_SERVER + "authentication/login", {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          lang_code: "MN",
        },
        body: paramsVal.toString(),
      })
      .catch((err) => {
        throw err;
      });
    var khariu = JSON.parse(response.body);
    Token(tukhainBaaziinKholbolt)
      .updateOne(
        { turul: "bogd", baiguullagiinId: dans.baiguullagiinId },
        {
          ognoo: new Date(),
          token: khariu.data.access_token,
        },
        { upsert: true }
      )
      .then((x) => {})
      .catch((e) => {});
    return khariu.data.access_token;
  } else return tokenObject?.token;
}

// Golomt service call function
async function golomtServiceDuudya(
  dans,
  yawuulaxBody,
  url,
  serviceNer,
  next,
  tukhainBaaziinKholbolt
) {
  try {
    var { sessionKey, ivKey } = dans;
    var tokenObject = await golomtTokenAvya(dans, tukhainBaaziinKholbolt);
    var a = JSON.stringify(yawuulaxBody);
    var hash = CryptoJS.SHA256(a.toString());
    var hex = hash.toString(CryptoJS.enc.Hex);
    if (!sessionKey || !ivKey) return "";
    var sessionKey = CryptoJS.enc.Latin1.parse(sessionKey);
    var ivKey = CryptoJS.enc.Latin1.parse(ivKey);
    var encrypted = CryptoJS.AES.encrypt(hex, sessionKey, {
      mode: CryptoJS.mode.CBC,
      iv: ivKey,
    });
    var url = process.env.GOLOMT_SERVER + url;
    const response = await got
      .post(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + tokenObject.token,
          "X-Golomt-Checksum": encrypted.toString(),
          "X-Golomt-Service": serviceNer,
        },
        json: yawuulaxBody,
      })
      .catch((err) => {
        throw err;
      });
    var stringKhariu = response?.body;
    var khariu;
    if (!!stringKhariu) {
      var encrypt = CryptoJS.enc.Base64.parse(stringKhariu);
      var decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encrypt },
        sessionKey,
        {
          mode: CryptoJS.mode.CBC,
          iv: ivKey,
        }
      );
      var plain = decrypted.toString(CryptoJS.enc.Utf8);
      var khariu = JSON.parse(plain);
    }
    return khariu;
  } catch (error) {
    if (next) next(new Error("Банктай холбогдоход алдаа гарлаа!" + error));
  }
}

// Khan Bank account list function
async function dansniiJagsaaltAvya(token, next) {
  try {
    var url = new URL("https://api.khanbank.com/v1/accounts/");
    const context = {
      token: "Bearer " + token,
    };
    const response = await instance.get(url, { context });
    return JSON.parse(response.body);
  } catch (error) {
    next(error);
  }
}

// Khan Bank statement function
async function dansniiKhuulgaAvya(token, next, body) {
  try {
    const context = {
      token: "Bearer " + token,
    };
    var url;
    const responseShunuEsekh = await instance.get(
      "https://api.khanbank.com/v1/statements/corporate/state",
      { context }
    );
    const resultValue = body.corporateShunuUntraakhEsekh
      ? false
      : JSON.parse(responseShunuEsekh?.body);
    url =
      "https://api.khanbank.com/v1/statements/" +
      (resultValue ? "corporate/" : "") +
      body.dansniiDugaar;
    if (body.record)
      url = url + (resultValue ? "" : "/record?record=" + body.record);
    const response = await instance.get(url, { context });
    if (!response.body) {
      if (next) next(new Error("Татах хуулга байхгүй"));
      else return null;
    }
    return JSON.parse(response?.body);
  } catch (error) {
    if (next) next(error);
  }
}

// Trans (Tengerin) bank token function
async function transTokenAvya(dans, tukhainBaaziinKholbolt) {
  try {
    var tokenObject = await Token(tukhainBaaziinKholbolt).findOne({
      turul: "trans",
      ognoo: { $gte: new Date(new Date().getTime() - 590000) },
    });
    if (!tokenObject) {
      var url =
        process.env.TRANS_SERVER +
        "/getToken?apikey=" +
        (dans.apikey ? dans.apikey : "p_uZ6A");
      const response = await got
        .post(url, {
          headers: { "Content-Type": "application/json" },
          json: {
            username: dans.corporateNevtrekhNer,
            password: dans.corporateNuutsUg,
          },
        })
        .catch((err) => { throw err; });
      var khariu = JSON.parse(response.body);
      tokenObject = khariu;
      Token(tukhainBaaziinKholbolt)
        .updateOne(
          { turul: "trans" },
          { ognoo: new Date(), token: khariu.result },
          { upsert: true }
        )
        .then(() => {})
        .catch(() => {});
    }
    return tokenObject;
  } catch (error) {
    throw new Error("Trans банктай холбогдоход алдаа гарлаа!");
  }
}

// Helper function to pad numbers
async function pad(num, size) {
  num = num.toString();
  while (num.length < size) num = "0" + num;
  return num;
}

const dansniiUldegdelAvya = asyncHandler(async (req, res, next) => {
  try {
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const dans = await Dans(tukhainBaaziinKholbolt).findOne({
      dugaar: req.body.dansniiDugaar,
    }).lean();

    console.log("[ULDEGDEL] dans lookup", {
      dansniiDugaar: req.body.dansniiDugaar,
      found: !!dans,
      bank: dans?.bank || null,
      corporateBarilgaTusBur: dans?.corporateBarilgaTusBur || false,
      hasCorporateCreds: !!(dans?.corporateNevtrekhNer && dans?.corporateNuutsUg),
      hasAnyBIC: !!dans?.AnyBIC,
      hasRoleID: !!dans?.RoleID,
    });

    var uldegdel = 0;

    if (dans && dans.bank === "khanbank") {
      const { Token } = require("zevbackv2");
      var query = {
        turul: "khaanCorporate",
        baiguullagiinId: dans.baiguullagiinId,
        ognoo: { $gte: new Date(new Date().getTime() - 29 * 60000) },
      };
      if (dans.corporateBarilgaTusBur && !!dans.barilgiinId)
        query["barilgiinId"] = dans.barilgiinId;
      var tokenObject = await Token(tukhainBaaziinKholbolt).findOne(query);
      var token;
      if (!tokenObject) {
        tokenObject = await tokenAvya(
          dans.corporateNevtrekhNer,
          dans.corporateNuutsUg,
          next,
          dans.baiguullagiinId,
          dans.corporateBarilgaTusBur ? dans.barilgiinId : null,
          tukhainBaaziinKholbolt
        );
        token = tokenObject?.access_token;
      } else token = tokenObject.token;
      if (!token)
        throw new Error("Corporate Gateway үйлчилгээний нэвтрэх мэдээллээ шалгана уу!");
      var khariu = await dansniiJagsaaltAvya(token, next);
      khariu = khariu?.accounts?.filter((a) => a.number == req.body.dansniiDugaar);
      if (khariu && khariu.length > 0) uldegdel = khariu[0].avalaibleBalance;
      res.send({ uldegdel });

    } else if (dans && dans.bank === "tdb") {
      if (
        !!dans.corporateNevtrekhNer &&
        !!dans.corporateNuutsUg &&
        !dans.AnyBIC &&
        !dans.RoleID &&
        !!dans.dugaar &&
        (dans.dugaar.includes("mn") || dans.dugaar.includes("MN"))
      ) {
        var tokenObject = await tdbTokenAvya(dans, tukhainBaaziinKholbolt);
        var url = process.env.TDB_SERVER + "/accounts/" + dans.dugaar + "/balance";
        const response = await got.get(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + tokenObject.token,
          },
        }).catch((err) => { throw err; });
        var khariu = JSON.parse(response.body);
        res.send({ uldegdel: khariu.acntno.BALANCE });
      } else {
        console.error("[ULDEGDEL] TDB dans missing required corporate credentials/format", {
          dansniiDugaar: dans.dugaar,
        });
        res.send({ uldegdel: 0 });
      }

    } else if (dans && dans.bank === "golomt") {
      var yawuulaxBody = { registerNo: dans.register, accountId: dans.dugaar };
      var khariu = await golomtServiceDuudya(
        dans, yawuulaxBody, "/v1/account/balance/inq", "ACCTBALINQ", next, tukhainBaaziinKholbolt
      );
      if (!!khariu && !!khariu.balanceLL && khariu.balanceLL.length > 0)
        khariu = { uldegdel: khariu?.balanceLL[0].amount?.value };
      res.send(khariu);

    } else if (dans && dans.bank === "bogd") {
      var tokenObject = await bogdTokentAvya(dans, tukhainBaaziinKholbolt);
      const response = await got.post(process.env.BOGD_SERVER + "api/accounts", {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          lang_code: "MN",
          Authorization: "Bearer " + tokenObject,
        },
      }).catch((err) => { throw err; });
      var khariu = JSON.parse(response.body);
      var khariltsakh = khariu?.data?.types[0].accounts?.filter(
        (e) => e.accountNo === dans.dugaar
      )[0];
      res.send({ uldegdel: khariltsakh?.balance });

    } else if (dans && dans.bank === "trans") {
      var tokenObject = await transTokenAvya(dans, tukhainBaaziinKholbolt);
      var url =
        process.env.TRANS_SERVER +
        "/getAccountBalance?apikey=" +
        (dans.apikey ? dans.apikey : "p_uZ6A");
      const response = await got.post(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + tokenObject.token,
        },
        json: { acnt_code: dans.dugaar },
      }).catch((err) => { throw err; });
      var khariu = JSON.parse(response.body);
      res.send(khariu);

    } else {
      res.send({ uldegdel: 0 });
    }
  } catch (err) {
    next(err);
  }
});

const bankniiKhuulgaTatajKhadgalya = asyncHandler(async (req, res, next) => {
  try {
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    var dansnuud;
    var firstDay;
    var lastDay;

    if (req.body.ognoo) {
      var ognoo = new Date(req.body.ognoo);
      firstDay = new Date(ognoo.getFullYear(), ognoo.getMonth(), 1);
      lastDay = new Date(ognoo.getFullYear(), ognoo.getMonth() + 1, 0);
    } else {
      firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    }

    if (req.body.dansniiDugaar) {
      dansnuud = await Dans(tukhainBaaziinKholbolt).find({
        corporateAshiglakhEsekh: true,
        dugaar: req.body.dansniiDugaar,
      }).lean();
    } else {
      dansnuud = await Dans(tukhainBaaziinKholbolt).find({
        corporateAshiglakhEsekh: true,
        oirkhonTatakhEsekh: { $exists: false },
        baiguullagiinId: req.body.baiguullagiinId,
      }).lean();
    }

    if (!dansnuud || dansnuud.length === 0) {
      return res.status(200).send("Татах дансны мэдээлэл байхгүй!");
    }

    const { Token } = require("zevbackv2");

    for (const dans of dansnuud) {
      try {
        if (dans.bank === "khanbank") {
          var query = {
            turul: "khaanCorporate",
            baiguullagiinId: dans.baiguullagiinId,
            ognoo: { $gte: new Date(new Date().getTime() - 29 * 60000) },
          };
          if (dans.corporateBarilgaTusBur && !!dans.barilgiinId)
            query["barilgiinId"] = dans.barilgiinId;
          var tokenObject = await Token(tukhainBaaziinKholbolt).findOne(query);
          var token;
          if (!tokenObject) {
            tokenObject = await tokenAvya(
              dans.corporateNevtrekhNer,
              dans.corporateNuutsUg,
              next,
              dans.baiguullagiinId,
              dans.corporateBarilgaTusBur ? dans.barilgiinId : null,
              tukhainBaaziinKholbolt
            );
            token = tokenObject?.access_token;
          } else token = tokenObject.token;

          var maxMatch = { dansniiDugaar: dans.dugaar, baiguullagiinId: dans.baiguullagiinId };
          if (dans.barilgiinId) maxMatch.barilgiinId = dans.barilgiinId;
          var maxAgg = [
            { $match: maxMatch },
            { $group: { _id: "$dansniiDugaar", max: { $max: { $toInt: "$record" } } } },
          ];
          var max = await BankniiGuilgee(tukhainBaaziinKholbolt, false).aggregate(maxAgg);
          console.log(`📌 [ХУУЛГА] khanbank ${dans.dugaar}: max record=${max?.[0]?.max ?? "байхгүй (бүгдийг татна)"} barilgiinId=${dans.barilgiinId || "тохируулаагүй"}`);
          var bodyKhuulga = {
            baiguullagiinId: dans.baiguullagiinId,
            barilgiinId: dans.barilgiinId,
            dansniiDugaar: dans.dugaar,
            corporateShunuUntraakhEsekh: dans.corporateShunuUntraakhEsekh,
          };
          if (max && max.length !== 0) bodyKhuulga["record"] = max[0].max;
          var khariu = await dansniiKhuulgaAvya(token, next, bodyKhuulga);

          if (khariu && khariu.transactions) {
            var guilgeenuud = [];
            for (const mur of khariu.transactions) {
              var existing = await BankniiGuilgee(tukhainBaaziinKholbolt, false).findOne({
                record: mur?.record,
                dansniiDugaar: dans.dugaar,
                barilgiinId: dans.barilgiinId || req.body.barilgiinId || null,
              });
              if (!existing) {
                var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))(mur);
                g.dansniiDugaar = dans.dugaar;
                g.bank = dans.bank;
                g.baiguullagiinId = dans.baiguullagiinId;
                g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
                guilgeenuud.push(g);
              }
            }
            if (guilgeenuud.length > 0) {
              await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch(() => { });
            }
          }

        } else if (dans.bank === "tdb") {
          if (!!dans.corporateNevtrekhNer && !!dans.corporateNuutsUg && !dans.AnyBIC && !dans.RoleID &&
            !!dans.dugaar && (dans.dugaar.includes("mn") || dans.dugaar.includes("MN"))) {
            var tokenObject = await tdbTokenAvya(dans, tukhainBaaziinKholbolt);
            var url = process.env.TDB_SERVER + "/accounts/statement/" + dans.dugaar;
            var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
              .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar })
              .sort({ TxDt: -1 }).limit(1);
            if (!!maxDoc) firstDay = new Date(maxDoc.TxDt);
            const fmt = (d) =>
              d.getFullYear() + "/" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "/" +
              (d.getDate() < 10 ? "0" : "") + d.getDate();
            url += `?from=${fmt(firstDay)}&to=${fmt(lastDay)}&page=0&size=100`;
            var response = await axios.get(url, {
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenObject.token },
            }).catch(() => { });
            var khariu = response?.data;
            if (!!khariu && !!khariu.txn && khariu.txn.length > 0) {
              var guilgeenuud = [];
              for (const mur of khariu.txn) {
                var existing = await BankniiGuilgee(tukhainBaaziinKholbolt, false).findOne({
                  refno: mur?.refno,
                  dansniiDugaar: dans.dugaar,
                  barilgiinId: dans.barilgiinId || req.body.barilgiinId || null,
                });
                if (!existing) {
                  var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                    TxDt: mur?.txndate, refno: mur?.refno, TxAddInf: mur?.txndesc,
                    Amt: mur?.credit ? mur?.credit : mur?.debit, balance: mur?.balance,
                    CtAcntOrg: mur?.contacntno, CtActnName: mur?.contacntname,
                    curRate: mur?.currate, CtBankNo: mur?.bankcode,
                  });
                  g.dansniiDugaar = dans.dugaar; g.bank = dans.bank;
                  g.baiguullagiinId = dans.baiguullagiinId; g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
                  guilgeenuud.push(g);
                }
              }
              if (guilgeenuud.length > 0) {
                await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch(() => { });
              }
            }
          }

        } else if (dans.bank === "golomt") {
          var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
            .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar, bank: "golomt" })
            .sort({ createdAt: -1 }).limit(1);
          if (!!maxDoc) firstDay = new Date(maxDoc.tranDate);
          const fmtDash = (d) =>
            d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
            (d.getDate() < 10 ? "0" : "") + d.getDate();
          var yawuulaxBody = {
            registerNo: dans.register, accountId: dans.dugaar,
            startDate: fmtDash(firstDay), endDate: fmtDash(lastDay),
          };
          var khariu = await golomtServiceDuudya(
            dans, yawuulaxBody, "/v1/account/operative/statement", "OPERACCTSTA", next, tukhainBaaziinKholbolt
          );
          if (!!khariu && !!khariu.statements && khariu.statements.length > 0) {
            var guilgeenuud = [];
            for (const mur of khariu.statements) {
              var existing = await BankniiGuilgee(tukhainBaaziinKholbolt, false).findOne({
                tranId: mur?.tranId,
                dansniiDugaar: dans.dugaar,
                barilgiinId: dans.barilgiinId || req.body.barilgiinId || null,
              });
              if (!existing) {
                var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                  requestId: mur?.requestId, recNum: mur?.recNum, tranId: mur?.tranId,
                  tranDate: mur?.tranDate, drOrCr: mur?.drOrCr, tranAmount: mur?.tranAmount,
                  tranDesc: mur?.tranDesc, tranPostedDate: mur?.tranPostedDate,
                  tranCrnCode: mur?.tranCrnCode, exchRate: mur?.exchRate, balance: mur?.balance,
                  accName: mur?.accName, accNum: mur?.accNum,
                });
                g.dansniiDugaar = dans.dugaar; g.bank = dans.bank;
                g.baiguullagiinId = dans.baiguullagiinId; g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
                guilgeenuud.push(g);
              }
            }
            if (guilgeenuud.length > 0) {
              await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch((err) => {
                console.error("BankniiGuilgee golomt insertMany >>>", err);
              });
            }
          }

        } else if (dans.bank === "bogd") {
          var tokenObject = await bogdTokentAvya(dans, tukhainBaaziinKholbolt);
          var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
            .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar })
            .sort({ createdAt: -1 }).limit(1);
          if (!!maxDoc) firstDay = new Date(maxDoc.tranDate);
          const fmtDash = (d) =>
            d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
            (d.getDate() < 10 ? "0" : "") + d.getDate();
          const paramsVal = new URLSearchParams(
            "account_no=" + dans.dugaar + "&start_date=" + fmtDash(firstDay) + "&end_date=" + fmtDash(lastDay)
          );
          const response = await got.post(process.env.BOGD_SERVER + "api/statement", {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              lang_code: "MN",
              Authorization: "Bearer " + tokenObject,
            },
            body: paramsVal.toString(),
          }).catch((err) => { throw err; });
          var khariu = JSON.parse(response.body);
          var guilgeenuud = [];
          if (khariu?.data?.transactions?.length > 0) {
            khariu.data.transactions.forEach((mur) => {
              var postedDate = new Date(mur?.date);
              postedDate.setHours(mur?.time?.split(":")[0]);
              postedDate.setMinutes(mur?.time?.split(":")[1]);
              postedDate.setSeconds(mur?.time?.split(":")[2]);
              guilgeenuud.push(new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                requestId: mur?.txn_id, recNum: mur?.txn_no, tranId: mur?.txn_id,
                tranDate: new Date(mur?.date), drOrCr: "Credit", amount: mur?.debit,
                description: mur?.description, tranPostedDate: postedDate,
                tranCrnCode: mur?.currency, exchRate: 1, balance: mur?.balance_after,
                beforeBalance: mur?.balance_before, accName: mur?.to_acc_name,
                accNum: mur?.to_acc_no, relatedAccount: mur?.to_acc_no, time: mur?.time,
              }));
            });
          }
          // Deduplicate — skip already-saved records
          var ustgakhJagsaalt = [];
          for (const item of guilgeenuud) {
            var existing = await BankniiGuilgee(tukhainBaaziinKholbolt, false).findOne({
              requestId: item.requestId, recNum: item.recNum,
              dansniiDugaar: dans.dugaar, barilgiinId: dans.barilgiinId,
            });
            if (existing) ustgakhJagsaalt.push(item);
          }
          guilgeenuud = guilgeenuud.filter((el) => !ustgakhJagsaalt.includes(el));
          guilgeenuud.forEach((x) => {
            x.dansniiDugaar = dans.dugaar; x.bank = dans.bank;
            x.baiguullagiinId = dans.baiguullagiinId; x.barilgiinId = dans.barilgiinId;
          });
          if (guilgeenuud.length > 0) {
            await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch((err) => { next(err); });
          }

        } else if (dans.bank === "trans") {
          var tokenObject = await transTokenAvya(dans, tukhainBaaziinKholbolt);
          var url =
            process.env.TRANS_SERVER +
            "/getStatement?apikey=" +
            (dans.apikey ? dans.apikey : "p_uZ6A");
          var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
            .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar })
            .sort({ createdAt: -1 }).limit(1);
          if (!!maxDoc) firstDay = new Date(maxDoc.txnDate);
          const fmtDash = (d) =>
            d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
            (d.getDate() < 10 ? "0" : "") + d.getDate();
          const response = await got.post(url, {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + tokenObject.token,
            },
            json: {
              acnt_code: dans.dugaar,
              start_date: fmtDash(firstDay),
              end_date: fmtDash(lastDay),
              start_paging_position: 0,
              page_row_count: 100,
            },
          }).catch((err) => { throw err; });
          var khariu = JSON.parse(response.body);
          if (!!khariu && !!khariu.result && !!khariu.result.txns && khariu.result.txns.length > 0) {
            var guilgeenuud = [];
            const txnBarilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
            // Batch dedup check: one query for the whole page instead of one findOne per row
            const existingDocs = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
              .find({
                dansniiDugaar: dans.dugaar,
                barilgiinId: txnBarilgiinId,
                jrno: { $in: khariu.result.txns.map((t) => t?.jrno) },
              })
              .select("jrno jritemNo")
              .lean();
            const existingKeySet = new Set(
              existingDocs.map((d) => `${d.jrno}|${d.jritemNo}`),
            );
            for (const mur of khariu.result.txns) {
              var existing = existingKeySet.has(`${mur?.jrno}|${mur?.jritemNo}`);
              if (!existing) {
                var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                  jrno: mur?.jrno, jritemNo: mur?.jritemNo, contCurRate: mur?.contCurRate,
                  username: mur?.username, userId: mur?.userId, userBrchCode: mur?.userBrchCode,
                  txnCode: mur?.txnCode, txnNo: mur?.txnNo, balTypeCode: mur?.balTypeCode,
                  income: mur?.income, outcome: mur?.outcome, curCode: mur?.curCode,
                  curRate: mur?.curRate, contAcntName: mur?.contAcntName, contAcntCode: mur?.contAcntCode,
                  contBankAcntCode: mur?.contBankAcntCode, contBankAcntName: mur?.contBankAcntName,
                  txnDesc: mur?.txnDesc, txnDate: mur?.txnDate, postDate: mur?.postDate,
                });
                g.dansniiDugaar = dans.dugaar; g.bank = dans.bank;
                g.baiguullagiinId = dans.baiguullagiinId; g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
                guilgeenuud.push(g);
              }
            }
            if (guilgeenuud.length > 0) {
              await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch((err) => { next(err); });
            }
          }
        }

      } catch (aldaaa) {
        console.error("bankniiKhuulgaTatajKhadgalya дотоод алдаа:", aldaaa?.message || aldaaa);
        continue;
      }
    }

    const io = req.app.get("socketio");
    if (io) io.emit("baiguullagiin" + req.body.baiguullagiinId, { turul: "bankniiGuilgeeShine" });
    res.status(200).send("Амжилттай татаж хадгаллаа");
  } catch (err) {
    console.error("bankniiKhuulgaTatajKhadgalya >>>", err);
    next(err);
  }
});

module.exports = {
  tokenAvya,
  golomtTokenAvya,
  tdbTokenAvya,
  bogdTokentAvya,
  transTokenAvya,
  golomtServiceDuudya,
  dansniiJagsaaltAvya,
  dansniiKhuulgaAvya,
  pad,
  dansniiUldegdelAvya,
  bankniiKhuulgaTatajKhadgalya,
};
