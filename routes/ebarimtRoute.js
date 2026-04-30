const express = require("express");
const router = express.Router();
const request = require("request");
const {
  tokenShalgakh,
  db,
  crud,
  khuudaslalt,
  UstsanBarimt,
  Token,
} = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const EbarimtShine = require("../models/ebarimtShine");
const EasyRegisterUser = require("../models/easyRegisterUser");

// Short-term cache for Easy Register API responses (government APIs are slow)
const easyRegisterCache = new Map();
const EASY_REGISTER_CACHE_TTL = 600000; // 10 minutes cache
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const { resolveDistrictCode } = require("../lib/districtMapping");
const { downloadEbarimtExcel } = require("../controller/excelImportController");
const copyQueryToBody = (req, res, next) => {
  if (req.method === "GET" && Object.keys(req.query).length > 0) {
    const existingTukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    req.body = { ...req.body, ...req.query };
    if (existingTukhainBaaziinKholbolt && typeof existingTukhainBaaziinKholbolt === 'object') {
      req.body.tukhainBaaziinKholbolt = existingTukhainBaaziinKholbolt;
    }
  }
  next();
};

function nuatBodyo(bodokhDun) {
  var nuatguiDun = bodokhDun / 1.1;
  return (bodokhDun - nuatguiDun).toFixed(2).toString();
}
crud(router, "ebarimtShine", EbarimtShine, UstsanBarimt);

async function nekhemjlekheesEbarimtShineUusgye(
  nekhemjlekh,
  customerNo,
  customerTin,
  merchantTin,
  districtCode,
  tukhainBaaziinKholbolt,
  nuatTulukhEsekh = true
) {
  try {

    const dun = nekhemjlekh.niitTulbur || 0;
    var ebarimt = new EbarimtShine(tukhainBaaziinKholbolt)();

    if (!!customerTin) {
      ebarimt.type = "B2B_RECEIPT";
      ebarimt.customerTin = customerTin;
    } else {
      ebarimt.type = "B2C_RECEIPT";
    }

    ebarimt.nekhemjlekhiinId = nekhemjlekh._id.toString();
    ebarimt.baiguullagiinId = nekhemjlekh.baiguullagiinId;
    ebarimt.barilgiinId = nekhemjlekh.barilgiinId;
    ebarimt.gereeniiDugaar = nekhemjlekh.gereeniiDugaar;
    ebarimt.utas = nekhemjlekh.utas?.[0] || "";

    ebarimt.totalAmount = dun.toFixed(2);
    ebarimt.totalVAT = !!nuatTulukhEsekh ? nuatBodyo(dun) : 0;
    ebarimt.totalCityTax = "0.00";
    ebarimt.branchNo = "001";
    ebarimt.districtCode = String(districtCode || "").padStart(4, "0");
    ebarimt.posNo = "0001";
    ebarimt.merchantTin = merchantTin;
    ebarimt.customerNo = customerNo || "";
    if (customerTin) ebarimt.customerTin = customerTin;
    ebarimt.createdAt = new Date();

    const taxType = nuatTulukhEsekh ? "VAT_ABLE" : "VAT_FREE";
    const item = {
      name: "СӨХИЙН ТӨЛБӨР",
      barCodeType: "UNDEFINED",
      classificationCode: "7211200",
      measureUnit: "шир",
      qty: "1.00",
      unitPrice: dun.toFixed(2),
      totalVat: !!nuatTulukhEsekh ? nuatBodyo(dun) : 0,
      totalCityTax: "0.00",
      totalAmount: dun.toFixed(2),
    };

    if (
      taxType === "VAT_FREE" ||
      taxType === "VAT_ZERO" ||
      taxType === "NOT_VAT"
    ) {
      item.taxProductCode = "401";
    }

    ebarimt.receipts = [
      {
        totalAmount: dun.toFixed(2),
        totalVAT: !!nuatTulukhEsekh ? nuatBodyo(dun) : 0,
        totalCityTax: "0.00",
        taxType: taxType,
        merchantTin: merchantTin,
        items: [item],
      },
    ];

    ebarimt.payments = [
      {
        code: "PAYMENT_CARD",
        paidAmount: dun.toFixed(2),
        status: "PAID",
      },
    ];

    return ebarimt;
  } catch (error) {
    throw error;
  }
}

async function ebarimtDuudya(ugugdul, onFinish, next, shine = false, baiguullagiinId = null) {
  try {
    if (!!shine) {
      // Check if this baiguullaga should use TEST endpoint
      // baiguullagiinId "69159a06dd2ba5c30308b90f" uses TEST, others use IP
      // Get baiguullagiinId from parameter or from ugugdul if not provided
      const orgId = baiguullagiinId || ugugdul?.baiguullagiinId;
      const shouldUseTest = orgId && String(orgId) === "69f06870687e1fcbab74be82";
      
      const baseUrl = shouldUseTest 
        ? process.env.EBARIMTSHINE_TEST 
        : process.env.EBARIMTSHINE_IP;
      
      var url = baseUrl + "rest/receipt";
      console.log("[EBARIMT] Sending receipt request", {
        orgId,
        shouldUseTest,
        baseUrl: baseUrl || null,
        url,
      });
      
      const plainUgugdul = typeof ugugdul.toObject === 'function' ? ugugdul.toObject() : JSON.parse(JSON.stringify(ugugdul));
      
      // Ensure 'type' and 'districtCode' are correctly formatted
      if (!plainUgugdul.type && ugugdul.type) plainUgugdul.type = ugugdul.type;
      
      let finalDistrictCode = String(plainUgugdul.districtCode || "").replace(/[^0-9]/g, "");
      if (finalDistrictCode.length < 4) finalDistrictCode = finalDistrictCode.padStart(4, "0");
      if (finalDistrictCode.length > 4) finalDistrictCode = finalDistrictCode.substring(0, 4);
      if (finalDistrictCode === "0000") finalDistrictCode = "0001";
      plainUgugdul.districtCode = finalDistrictCode;

      console.log("[EBARIMT] Request Body:", JSON.stringify(plainUgugdul, null, 2));
      
      request.post(url, { json: true, body: plainUgugdul }, (err, res1, body) => {
        if (err) {
          console.error("[EBARIMT] request.post error:", err.message, { url });
          if (next) next(err);
          return;
        }
        
        console.log("[EBARIMT] receipt response", {
          statusCode: res1?.statusCode,
          hasBody: !!body,
          bodyStatus: body?.status || null,
          bodySuccess: body?.success,
          bodyMessage: body?.message || body?.error || null,
        });
        
        if (body && (body.error || body.message)) {
          console.error("[EBARIMT] receipt returned error/message", {
            error: body.error || null,
            message: body.message || null,
            statusCode: res1?.statusCode,
          });
          if (next)
            next(new Error(body.message || body.error || "E-barimt API error"));
          return;
        }
        
        onFinish(body, ugugdul);
      });
    } else if (!!next) next(new Error("ИБаримт dll холболт хийгдээгүй байна!"));
  } catch (aldaa) {
    console.error("[EBARIMT] ebarimtDuudya outer error:", aldaa.message);
    if (!!next) next(new Error("ИБаримт dll холболт хийгдээгүй байна!"));
  }
}

// Full password login - used as initial login or when refresh fails
async function ebarimtPasswordLogin(baiguullagiinId, tukhainBaaziinKholbolt, isTest = false) {
  return new Promise((resolve, reject) => {
    let authUrl = process.env.EBARIMTSHINE_AUTH_URL || 'https://auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token';
    if (isTest) {
      authUrl = 'https://st-auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token';
    }
    const clientId = process.env.EBARIMTSHINE_CLIENT_ID || 'vatps';
    const username = process.env.EBARIMTSHINE_USERNAME || 'Rooden_like@yahoo.com';
    const password = process.env.EBARIMTSHINE_PASSWORD || 'Br1stelback@';

    console.log(`[EBARIMT TOKEN] Password login for org: ${baiguullagiinId} (isTest: ${isTest})`);

    request.post({
      url: authUrl,
      form: {
        grant_type: 'password',
        client_id: clientId,
        username: username,
        password: password,
        scope: 'profile email'
      },
      json: true
    }, async (err, res, body) => {
      if (err) {
        console.error(`[EBARIMT TOKEN] Password login error:`, err.message);
        return reject(err);
      }

      if (body && (body.error || body.error_description)) {
        console.error(`[EBARIMT TOKEN] Password login failed:`, body.error_description || body.error);
        return reject(new Error(body.error_description || body.error));
      }

      if (!body.access_token) {
        return reject(new Error("Access token not received from Ebarimt Auth"));
      }

      console.log(`[EBARIMT TOKEN] Password login successful, expires_in: ${body.expires_in}s`);

      // Save token + refreshToken to DB
      try {
        await Token(tukhainBaaziinKholbolt).updateOne(
          { turul: 'ebarimt', baiguullagiinId: baiguullagiinId },
          {
            ognoo: new Date(),
            token: body.access_token,
            refreshToken: body.refresh_token || '',
            expires_in: new Date(Date.now() + (body.expires_in || 28800) * 1000)
          },
          { upsert: true }
        );
      } catch (dbErr) {
        console.error(`[EBARIMT TOKEN] DB save error (non-critical):`, dbErr.message);
      }

      resolve(body.access_token);
    });
  });
}

// Refresh token - uses existing refresh_token to get new access_token
async function ebarimtRefreshToken(refreshTokenValue, baiguullagiinId, tukhainBaaziinKholbolt, isTest = false) {
  return new Promise((resolve, reject) => {
    let authUrl = process.env.EBARIMTSHINE_AUTH_URL || 'https://auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token';
    if (isTest) {
      authUrl = 'https://st-auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token';
    }
    const clientId = process.env.EBARIMTSHINE_CLIENT_ID || 'vatps';

    console.log(`[EBARIMT TOKEN] Refreshing token for org: ${baiguullagiinId} (isTest: ${isTest})`);

    request.post({
      url: authUrl,
      form: {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshTokenValue
      },
      json: true
    }, async (err, res, body) => {
      if (err) {
        console.error(`[EBARIMT TOKEN] Refresh error:`, err.message);
        return reject(err);
      }

      if (body && (body.error || body.error_description)) {
        console.error(`[EBARIMT TOKEN] Refresh failed:`, body.error_description || body.error);
        return reject(new Error(body.error_description || body.error));
      }

      if (!body.access_token) {
        return reject(new Error("Access token not received from refresh"));
      }

      console.log(`[EBARIMT TOKEN] Refresh successful, new expires_in: ${body.expires_in}s`);

      // Save new token + new refreshToken to DB
      try {
        await Token(tukhainBaaziinKholbolt).updateOne(
          { turul: 'ebarimt', baiguullagiinId: baiguullagiinId },
          {
            ognoo: new Date(),
            token: body.access_token,
            refreshToken: body.refresh_token || refreshTokenValue,
            expires_in: new Date(Date.now() + (body.expires_in || 28800) * 1000)
          },
          { upsert: true }
        );
      } catch (dbErr) {
        console.error(`[EBARIMT TOKEN] DB save error (non-critical):`, dbErr.message);
      }

      resolve(body.access_token);
    });
  });
}

async function getEbarimtToken(baiguullagiinId, tukhainBaaziinKholbolt, isTest = false) {
  try {
    // 1. Check if we have a valid (non-expired) token in DB
    const tokenObject = await Token(tukhainBaaziinKholbolt).findOne({
      turul: 'ebarimt',
      baiguullagiinId: baiguullagiinId
    }).lean();

    // If token exists and not expired (5 min buffer), use it
    if (tokenObject && tokenObject.token && tokenObject.expires_in) {
      const fiveMinFromNow = new Date(Date.now() + 5 * 60000);
      if (new Date(tokenObject.expires_in) > fiveMinFromNow) {
        return tokenObject.token;
      }
    }

    // 2. Token expired — try refresh_token if we have one
    if (tokenObject && tokenObject.refreshToken) {
      try {
        console.log(`[EBARIMT TOKEN] Token expired, attempting refresh...`);
        return await ebarimtRefreshToken(tokenObject.refreshToken, baiguullagiinId, tukhainBaaziinKholbolt, isTest);
      } catch (refreshErr) {
        console.error(`[EBARIMT TOKEN] Refresh failed, falling back to password login:`, refreshErr.message);
        // Fall through to password login
      }
    }

    // 3. No token, no refresh token, or refresh failed — full password login
    console.log(`[EBARIMT TOKEN] Performing full password login...`);
    return await ebarimtPasswordLogin(baiguullagiinId, tukhainBaaziinKholbolt, isTest);
  } catch (error) {
    console.error(`[EBARIMT TOKEN] getEbarimtToken failed:`, error.message);
    throw error;
  }
}

// Helper function to auto-approve QR for Easy Register when receipt is created
async function autoApproveQr(customerNo, qrData, baiguullagiinId, tukhainBaaziinKholbolt) {
  if (!customerNo || !qrData) {
    return null; // Skip if customerNo or qrData is missing
  }

  try {
    const path = "api/easy-register/rest/v1/approveQr";
    const body = {
      customerNo: customerNo,
      qrData: qrData
    };

    return new Promise((resolve, reject) => {
      easyRegisterDuudya(
        "POST",
        path,
        body,
        (err) => {
          if (err) {
            console.log("Auto-approveQr failed (non-critical):", err.message);
          }
          resolve(null);
        },
        (data) => {
          console.log("Auto-approveQr successful for customerNo:", customerNo);
          resolve(data);
        },
        baiguullagiinId,
        tukhainBaaziinKholbolt
      );
    });
  } catch (error) {
    console.log("Auto-approveQr error (non-critical):", error.message);
    return null;
  }
}

async function easyRegisterDuudya(method, path, body, next, onFinish, baiguullagiinId = null, tukhainBaaziinKholbolt = null, _retried = false) {
  try {
    const orgId = baiguullagiinId;
    
    // Create a cache key for GET requests or specific POST requests like getProfile
    let cacheKey = null;
    if (method === "GET" || (method === "POST" && (path.includes("getProfile") || path.includes("info/foreigner")))) {
      cacheKey = `${method}:${path}:${JSON.stringify(body || {})}`;
      const cached = easyRegisterCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < EASY_REGISTER_CACHE_TTL)) {
        console.log(`⚡ [EASY REGISTER] Returning cached response for: ${path}`);
        return onFinish(cached.data);
      }
    }

    const shouldUseTest = orgId && String(orgId) === "697723dc3e77b46e52ccf577";

    let baseUrl;
    if (shouldUseTest) {
      baseUrl = 'https://st-service.itc.gov.mn';
    } else {
      baseUrl = 'https://service.itc.gov.mn';
    }
    
    if (process.env.EBARIMTSHINE_EASY_REGISTER_URL) {
      baseUrl = process.env.EBARIMTSHINE_EASY_REGISTER_URL;
    }

    // Resolve connection object
    let connectionObj = tukhainBaaziinKholbolt;
    if (connectionObj && typeof connectionObj === 'string') {
      connectionObj = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(orgId)
      );
      if (!connectionObj) {
        throw new Error("Байгууллагын холболт олдсонгүй");
      }
    }

    // Get token using the proper reuse + refresh system
    let token;
    if (connectionObj && orgId) {
      token = await getEbarimtToken(orgId, connectionObj, shouldUseTest);
    } else {
      token = process.env.EBARIMTSHINE_TOKEN;
    }
    
    const url = baseUrl + (path.startsWith('/') ? '' : '/') + path;

    const options = {
      method: method,
      url: url,
      json: true,
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    if (path.includes('setReturnReceipt')) {
      options.headers['X-API-KEY'] = process.env.EBARIMTSHINE_X_API_KEY || 'eaab09fdb83c4affc210b8fb96f9977db7978e8a';
    }

    if (body) options.body = body;

    request(options, async (err, res, resBody) => {
      if (err) {
        if (next) next(err);
        return;
      }

      if (res?.statusCode === 401 && !_retried && connectionObj && orgId) {
        console.log(`[EASY REGISTER] Got 401, clearing token and retrying...`);
        try {
          await Token(connectionObj).deleteOne({
            turul: 'ebarimt',
            baiguullagiinId: orgId
          });
        } catch (delErr) {
          console.error(`[EASY REGISTER] Error clearing token:`, delErr.message);
        }
        return easyRegisterDuudya(method, path, body, next, onFinish, baiguullagiinId, connectionObj, true);
      }
      
      if ((res?.statusCode >= 400) || (resBody && resBody.error)) {
        if (next) {
          const msg = (resBody && (resBody.msg || resBody.error))
            ? (resBody.msg || resBody.error)
            : `Easy Register API error: ${res?.statusCode}`;
          next(new Error(msg));
        }
        return;
      }
      
      // Store in cache if successful
      if (cacheKey && resBody && !resBody.error) {
         easyRegisterCache.set(cacheKey, { timestamp: Date.now(), data: resBody });
      }

      onFinish(resBody);
    });
  } catch (error) {
    if (next) next(error);
  }
}

router.get("/ebarimtJagsaaltAvya", tokenShalgakh, async (req, res, next) => {
  try {
    const body = req.query;
    if (!!body?.query) body.query = JSON.parse(body.query);
    if (!!body?.order) body.order = JSON.parse(body.order);
    if (!!body?.khuudasniiDugaar)
      body.khuudasniiDugaar = Number(body.khuudasniiDugaar);
    if (!!body?.khuudasniiKhemjee)
      body.khuudasniiKhemjee = Number(body.khuudasniiKhemjee);
    if (!!body?.search) body.search = String(body.search);
    if (!body.query) body.query = {};
    if (req.body.baiguullagiinId) body.query["baiguullagiinId"] = req.body.baiguullagiinId;
    if (req.query.baiguullagiinId) body.query["baiguullagiinId"] = req.query.baiguullagiinId;
    if (req.query.barilgiinId) body.query["barilgiinId"] = req.query.barilgiinId;
    if (req.query.merchantTin) body.query["merchantTin"] = req.query.merchantTin;
    if (req.query.districtCode) body.query["districtCode"] = req.query.districtCode;

    const shine = true;

    khuudaslalt(EbarimtShine(req.body.tukhainBaaziinKholbolt), body)
      .then((result) => {
        res.send(result);
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

router.post("/ebarimtToololtAvya", tokenShalgakh, async (req, res, next) => {
  try {
    var ebarimtShine = true;
    var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      req.body.baiguullagiinId
    );
    var tuxainSalbar = baiguullaga?.barilguud?.find(
      (e) => e._id.toString() == req.body?.barilgiinId
    )?.tokhirgoo;

    var match = {
      baiguullagiinId: req.body.baiguullagiinId,
      barilgiinId: req.body.barilgiinId,
    };

    if (!!ebarimtShine) {
      match.createdAt = {
        $gte: new Date(req.body.ekhlekhOgnoo),
        $lte: new Date(req.body.duusakhOgnoo),
      };
    }

    if (req.body.barimtTurul === "nekhemjlekhiinId")
      match.nekhemjlekhiinId = { $exists: true };

    var query = [
      {
        $match: match,
      },
      {
        $facet: {
          butsaasan: [
            {
              $match: {
                ustgasanOgnoo: {
                  $exists: true,
                },
              },
            },
            {
              $group: {
                _id: "butsaasan",
                too: {
                  $sum: 1,
                },
                dun: {
                  $sum: {
                    $toDecimal: { $ifNull: ["$totalAmount", 0] },
                  },
                },
              },
            },
          ],
          ilgeesen: [
            {
              $match: {
                ustgasanOgnoo: {
                  $exists: false,
                },
              },
            },
            {
              $group: {
                _id: "ilgeesen",
                too: {
                  $sum: 1,
                },
                dun: {
                  $sum: {
                    $toDecimal: { $ifNull: ["$totalAmount", 0] },
                  },
                },
              },
            },
          ],
        },
      },
    ];

    var result = await EbarimtShine(req.body.tukhainBaaziinKholbolt)
      .aggregate(query)
      .catch((err) => {
        next(err);
      });

    var khariu = {
      ilgeesenDun: 0,
      ilgeesenToo: 0,
      butsaasanDun: 0,
      butsaasanToo: 0,
    };

    if (result[0]) {
      if (result[0].butsaasan[0]) {
        khariu.butsaasanDun = parseFloat(result[0].butsaasan[0].dun);
        khariu.butsaasanToo = result[0].butsaasan[0].too;
      }
      if (result[0].ilgeesen[0]) {
        khariu.ilgeesenDun = parseFloat(result[0].ilgeesen[0].dun);
        khariu.ilgeesenToo = result[0].ilgeesen[0].too;
      }
    }

    res.send(khariu);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/nekhemjlekhEbarimtShivye",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      console.log("Энэ рүү орлоо: nekhemjlekhEbarimtShivye");
      const nekhemjlekh = await NekhemjlekhiinTuukh(
        req.body.tukhainBaaziinKholbolt
      ).findById(req.body.nekhemjlekhiinId);

      if (!nekhemjlekh) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        req.body.baiguullagiinId
      );

      const tuxainSalbar = baiguullaga?.barilguud?.find(
        (e) => e._id.toString() == nekhemjlekh.barilgiinId
      )?.tokhirgoo;

      if (!tuxainSalbar) {
        throw new Error("Building configuration not found");
      }

      const nuatTulukhEsekh = !!tuxainSalbar.nuatTulukhEsekh;

      // --- AUTOMATIC EASY REGISTER LINKING ---
      let autoCustomerNo = req.body.customerNo || "";
      if (!autoCustomerNo) {
        // Find saved Easy Register profile for this resident or contract
        const userFilter = { baiguullagiinId: req.body.baiguullagiinId, ustgasan: { $ne: true } };
        const residentId = nekhemjlekh.orshinSuugchiinId || (nekhemjlekh.medeelel && nekhemjlekh.medeelel.orshinSuugchiinId);
        
        if (residentId) {
          userFilter.orshinSuugchiinId = residentId;
        } else if (nekhemjlekh.gereeniiId) {
          userFilter.gereeniiId = nekhemjlekh.gereeniiId;
        }

        if (userFilter.orshinSuugchiinId || userFilter.gereeniiId) {
          const savedUser = await EasyRegisterUser(req.body.tukhainBaaziinKholbolt).findOne(userFilter).lean();
          if (savedUser && savedUser.loginName) {
            autoCustomerNo = savedUser.loginName;
            console.log(`[EASY REGISTER] Auto-linking invoice to customerNo: ${autoCustomerNo}`);
          }
        }
      }

      const ebarimtDistrictCode = await resolveDistrictCode(tuxainSalbar, req.body.tukhainBaaziinKholbolt);
      console.log(`ℹ️ [EBARIMT SHIVYE] Resolved district code: ${ebarimtDistrictCode} for building: ${nekhemjlekh.barilgiinId}`);

      const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
        nekhemjlekh,
        autoCustomerNo,
        req.body.customerTin || "",
        tuxainSalbar.merchantTin,
        ebarimtDistrictCode,
        req.body.tukhainBaaziinKholbolt,
        nuatTulukhEsekh
      );

      var butsaakhMethod = async function (d, khariuObject) {
        try {
          if (d?.status != "SUCCESS" && !d.success) throw new Error(d.message);

          var shineBarimt = new EbarimtShine(req.body.tukhainBaaziinKholbolt)(
            d
          );
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

          shineBarimt.save().catch((err) => {
            next(err);
          });

          if (khariuObject.customerNo && d.qrData) {
            autoApproveQr(
              khariuObject.customerNo,
              d.qrData,
              req.body.baiguullagiinId,
              req.body.tukhainBaaziinKholbolt
            ).catch((err) => {
              console.log("Auto-approveQr failed (non-critical):", err.message);
            });
          }

          res.send(d);
        } catch (err) {
          next(err);
        }
      };

      ebarimtDuudya(ebarimt, butsaakhMethod, next, true, req.body.baiguullagiinId);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/ebarimtExcelDownload",
  tokenShalgakh,
  downloadEbarimtExcel
);

async function saveEasyRegisterUser(data, baiguullagiinId, tukhainBaaziinKholbolt, turul, extraFields = {}) {
  try {
    if (!data || (!data.loginName && !data.regNo)) return;
    console.log(`[EASY REGISTER] Saving user: loginName=${data.loginName || ''}, regNo=${data.regNo || ''}, turul=${turul || 'consumer'}`);

    const saveData = {
      baiguullagiinId: baiguullagiinId,
      loginName: data.loginName || '',
      regNo: data.regNo || '',
      givenName: data.givenName || '',
      familyName: data.familyName || '',
      email: data.email || '',
      passportNo: data.passportNo || '',
      fNumber: data.fNumber || '',
      country: data.country || '',
      refund: data.refund || '',
      phoneNum: data.phoneNum || '',
      turul: turul || (data.passportNo ? 'foreigner' : 'consumer'),
      ustgasan: false,
      orshinSuugchiinId: data.orshinSuugchiinId || '',
      ...extraFields
    };

    const filter = {
      baiguullagiinId: baiguullagiinId,
      ustgasan: { $ne: true }
    };

    // Make the record unique to the resident who saved it
    const effectiveResidentId = extraFields.orshinSuugchiinId || data.orshinSuugchiinId;
    if (effectiveResidentId) {
      filter.orshinSuugchiinId = effectiveResidentId;
    }

    if (data.loginName) {
      filter.loginName = data.loginName;
    } else if (data.regNo) {
      filter.regNo = data.regNo;
    }

    await EasyRegisterUser(tukhainBaaziinKholbolt).findOneAndUpdate(
      filter,
      { $set: saveData },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('[EASY REGISTER] Auto-save user error (non-critical):', err.message);
  }
}


router.post("/easyRegister/approveQr", tokenShalgakh, async (req, res, next) => {
  console.log(`[EASY REGISTER] approveQr: customerNo=${req.body.customerNo || ''}`);
  const path = "api/easy-register/rest/v1/approveQr";
  easyRegisterDuudya("POST", path, req.body, next, (data) => res.send(data), req.body.baiguullagiinId, req.body.tukhainBaaziinKholbolt);
});

router.post("/easyRegister/setReturnReceipt", tokenShalgakh, async (req, res, next) => {
  console.log(`[EASY REGISTER] setReturnReceipt: posRno=${req.body.posRno || ''}, lottery=${req.body.lotteryNumber || ''}`);
  const path = "api/easy-register/rest/v1/setReturnReceipt";
  easyRegisterDuudya("POST", path, req.body, next, (data) => res.send(data), req.body.baiguullagiinId, req.body.tukhainBaaziinKholbolt);
});


router.post("/easyRegister/user/search", tokenShalgakh, async (req, res, next) => {
  try {
    const { identity, phoneNum, customerNo, turul, passportNo, email } = req.body;
    
    // High-level search cache check
    const searchKey = `search:${JSON.stringify({ identity, phoneNum, customerNo, turul, passportNo, email })}`;
    const cachedSearch = easyRegisterCache.get(searchKey);
    if (cachedSearch && (Date.now() - cachedSearch.timestamp < EASY_REGISTER_CACHE_TTL)) {
      console.log(`⚡ [EASY REGISTER] Returning high-level cached search result`);
      return res.send(cachedSearch.data);
    }

    console.log(`[EASY REGISTER] user/search: identity=${identity || ''}, phone=${phoneNum || ''}, customerNo=${customerNo || ''}, turul=${turul || 'consumer'}`);
    
    const baiguullagiinId = req.body.baiguullagiinId;
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;

    const callApi = (method, path, body) => new Promise((resolve, reject) => {
      easyRegisterDuudya(method, path, body, (err) => reject(err), (data) => resolve(data), baiguullagiinId, tukhainBaaziinKholbolt);
    });

    let finalData = null;

    const isNumericIdentity = identity && /^\d{8,9}$/.test(identity);
    const searchIdentity = (isNumericIdentity) ? null : identity;
    const searchPhoneOrCode = (isNumericIdentity) ? identity : (phoneNum || customerNo);

    if (turul === 'foreigner' && passportNo && email) {
      finalData = await callApi("POST", `api/easy-register/api/info/foreigner/${encodeURIComponent(passportNo)}`, { email });
    } else if (turul === 'foreigner' && searchIdentity) {
      finalData = await callApi("GET", `api/easy-register/api/info/foreigner/${encodeURIComponent(searchIdentity)}`, null);
    } else if (searchIdentity) {
      console.log(`[EASY REGISTER] Smart Search (Identity base) started for ${searchIdentity}`);
      const info = await callApi("GET", `api/easy-register/api/info/consumer/${encodeURIComponent(searchIdentity)}`, null);
      if (info && info.loginName) {
        try {
          const profile = await callApi("POST", 'api/easy-register/rest/v1/getProfile', { customerNo: info.loginName });
          finalData = { ...info, ...profile };
        } catch (e) { finalData = info; }
      } else { finalData = info; }
    } else if (searchPhoneOrCode) {
      console.log(`[EASY REGISTER] Smart Search (Profile base) started for ${searchPhoneOrCode}`);
      const profileBody = {};
      if (/^\d{8}$/.test(searchPhoneOrCode) && !customerNo) {
        profileBody.phoneNum = searchPhoneOrCode;
      } else {
        profileBody.customerNo = searchPhoneOrCode;
      }
      
      try {
        const profile = await callApi("POST", 'api/easy-register/rest/v1/getProfile', profileBody);
        if (profile && profile.loginName) {
          try {
            const fullInfo = await callApi("GET", `api/easy-register/api/info/consumer/${encodeURIComponent(profile.loginName)}`, null);
            finalData = { ...profile, ...fullInfo };
          } catch (e) { finalData = profile; }
        } else { finalData = profile; }
      } catch (e) {
        console.log(`[EASY REGISTER] Profile search failed for ${searchPhoneOrCode}: ${e.message}`);
        // If not found by code/phone, try to return 404 instead of 500
        return res.status(404).json({ success: false, error: "Хэрэглэгч олдсонгүй" });
      }
    } else {
      return res.status(400).json({ error: "identity, phoneNum, customerNo эсвэл passportNo+email-н нэгийг нь заавал оруулна" });
    }

    if (finalData) {
      const effectivePhone = phoneNum || (isNumericIdentity && searchPhoneOrCode.length === 8 ? searchPhoneOrCode : '') || finalData.phoneNum || '';
      
      if (effectivePhone && !finalData.phoneNum) {
        finalData.phoneNum = effectivePhone;
      }

      await saveEasyRegisterUser(finalData, baiguullagiinId, tukhainBaaziinKholbolt, turul, {
        phoneNum: effectivePhone,
        gereeniiId: req.body.gereeniiId || '',
        gereeniiDugaar: req.body.gereeniiDugaar || '',
        talbainDugaar: req.body.talbainDugaar || '',
        barilgiinId: req.body.barilgiinId || '',
        orshinSuugchiinId: req.body.orshinSuugchiinId || ''
      });

      // Cache the final search result
      easyRegisterCache.set(searchKey, { timestamp: Date.now(), data: finalData });
    }

    res.send(finalData);
  } catch (error) {
    console.error(`[EASY REGISTER] Search error:`, error.message);
    next(error);
  }
});

router.get("/easyRegister/user/list", copyQueryToBody, tokenShalgakh, async (req, res, next) => {
  try {
    console.log(`[EASY REGISTER] user/list: org=${req.body.baiguullagiinId}`);
    const body = req.query;
    if (body?.query) body.query = JSON.parse(body.query);
    if (body?.order) body.order = JSON.parse(body.order);
    if (body?.khuudasniiDugaar) body.khuudasniiDugaar = Number(body.khuudasniiDugaar);
    if (body?.khuudasniiKhemjee) body.khuudasniiKhemjee = Number(body.khuudasniiKhemjee);
    if (body?.search) body.search = String(body.search);

    if (!body.query) body.query = {};
    body.query.baiguullagiinId = req.body.baiguullagiinId;
    body.query.ustgasan = { $ne: true };
    
    // Filter by resident ID for security
    if (req.body.orshinSuugchiinId) {
      body.query.orshinSuugchiinId = req.body.orshinSuugchiinId;
    }

    khuudaslalt(EasyRegisterUser(req.body.tukhainBaaziinKholbolt), body)
      .then((result) => res.send(result))
      .catch((err) => next(err));
  } catch (error) {
    next(error);
  }
});

router.post("/easyRegister/user/delete", tokenShalgakh, async (req, res, next) => {
  try {
    const { userId } = req.body;
    console.log(`[EASY REGISTER] user/delete: userId=${userId}`);
    const baiguullagiinId = req.body.baiguullagiinId;
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;

    if (!userId) {
      return res.status(400).json({ error: "userId заавал оруулна" });
    }

    const filter = { _id: userId, baiguullagiinId: baiguullagiinId };
    if (req.body.orshinSuugchiinId) {
      filter.orshinSuugchiinId = req.body.orshinSuugchiinId;
    }

    const result = await EasyRegisterUser(tukhainBaaziinKholbolt).findOneAndUpdate(
      filter,
      {
        $set: {
          ustgasan: true,
          ustgasanOgnoo: new Date()
        }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй" });
    }

    res.send({ success: true, message: "Хэрэглэгч амжилттай устгагдлаа" });
  } catch (error) {
    next(error);
  }
});

router.post("/easyRegister/user/hardDelete", tokenShalgakh, async (req, res, next) => {
  try {
    const { userId } = req.body;
    console.log(`[EASY REGISTER] user/hardDelete: userId=${userId}`);
    const baiguullagiinId = req.body.baiguullagiinId;
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;

    if (!userId) {
      return res.status(400).json({ error: "userId заавал оруулна" });
    }

    const filter = { _id: userId, baiguullagiinId: baiguullagiinId };
    if (req.body.orshinSuugchiinId) {
      filter.orshinSuugchiinId = req.body.orshinSuugchiinId;
    }

    const result = await EasyRegisterUser(tukhainBaaziinKholbolt).findOneAndDelete(
      filter
    );

    if (!result) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй" });
    }

    res.send({ success: true, message: "Хэрэглэгч бүрмөсөн устгагдлаа" });
  } catch (error) {
    next(error);
  }
});

// Get single Easy Register user by ID
router.get("/easyRegister/user/:id", copyQueryToBody, tokenShalgakh, async (req, res, next) => {
  try {
    console.log(`[EASY REGISTER] user/get: id=${req.params.id}`);
    const filter = {
      _id: req.params.id,
      baiguullagiinId: req.body.baiguullagiinId,
      ustgasan: { $ne: true }
    };
    
    if (req.body.orshinSuugchiinId) {
      filter.orshinSuugchiinId = req.body.orshinSuugchiinId;
    }

    const user = await EasyRegisterUser(req.body.tukhainBaaziinKholbolt).findOne(filter);

    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй" });
    }

    res.send(user);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.nekhemjlekheesEbarimtShineUusgye =
  nekhemjlekheesEbarimtShineUusgye;
module.exports.ebarimtDuudya = ebarimtDuudya;
module.exports.autoApproveQr = autoApproveQr;
module.exports.easyRegisterDuudya = easyRegisterDuudya;
module.exports.getEbarimtToken = getEbarimtToken;