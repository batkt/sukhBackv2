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

// Helper function to pad numbers
async function pad(num, size) {
  num = num.toString();
  while (num.length < size) num = "0" + num;
  return num;
}

module.exports = {
  tokenAvya,
  golomtTokenAvya,
  tdbTokenAvya,
  bogdTokentAvya,
  golomtServiceDuudya,
  dansniiJagsaaltAvya,
  dansniiKhuulgaAvya,
  pad,
};
