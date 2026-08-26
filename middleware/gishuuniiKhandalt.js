/**
 * Гэр бүлийн гишүүний хандалт — "өгөгдлийн эзэн"-г солих middleware.
 *
 * Гишүүн өөрийн _id-тэй нэвтэрдэг ч гэрээ, нэхэмжлэх, төлбөр, мэдэгдлээ
 * үндсэн эзэмшигчийнхээс уншина. Апп нь `orshinSuugchId`-г шууд query/body
 * дотор явуулдаг тул энд түүнийг үндсэн эзэмшигчийн id рүү хөрвүүлж өгснөөр
 * одоо байгаа бүх endpoint ямар ч өөрчлөлтгүйгээр ажиллана.
 *
 * ЗӨВХӨН гишүүн ӨӨРИЙНХӨӨ id-г заасан үед л сольдог — өөр хүний id өгвөл
 * хөндөхгүй (тэр тохиолдолд baiguullagiinId-ийн хамгаалалт хэвээр үлдэнэ).
 *
 * Анхаар: Express 5 дээр `req.query` нь хандах болгонд ДАХИН задардаг тул
 * түүнийг газар дээр нь өөрчлөх нь үр дүнгүй. Иймд query string-ийг
 * `req.url` дээр бичиж солино.
 */

const jwt = require("jsonwebtoken");

// Оршин суугчийн id-г агуулдаг талбарын нэрс
const ID_TALBARUUD = [
  "orshinSuugchId",
  "orshinSuugchiinId",
  "residentId",
  "ezenId",
  "ezemshigchiinId",
];

/** Токеныг чимээгүйхэн задлана. Буруу/байхгүй бол null. */
function tokenAvya(req) {
  try {
    const header = req.headers && req.headers.authorization;
    if (!header) return null;
    const token = header.split(" ")[1];
    if (!token) return null;
    return jwt.verify(token, process.env.APP_SECRET);
  } catch (err) {
    return null; // Токены алдааг доод дахь tokenShalgakh барина
  }
}

/** Обьект дотор давхарлан орж id-г солино ($or, $and зэрэгт ч хүрнэ) */
function obiektSoliyo(obiekt, ownId, ezenId, gunUlkhu = 0) {
  if (!obiekt || typeof obiekt !== "object" || gunUlkhu > 6) return false;

  let uurchlugdsun = false;

  if (Array.isArray(obiekt)) {
    for (const zuil of obiekt) {
      if (obiektSoliyo(zuil, ownId, ezenId, gunUlkhu + 1)) uurchlugdsun = true;
    }
    return uurchlugdsun;
  }

  for (const [tulkhuur, utga] of Object.entries(obiekt)) {
    if (ID_TALBARUUD.includes(tulkhuur)) {
      if (typeof utga === "string" && utga === ownId) {
        obiekt[tulkhuur] = ezenId;
        uurchlugdsun = true;
      } else if (utga && typeof utga === "object") {
        // { $in: [...] } / { $eq: "..." } хэлбэрүүд
        if (Array.isArray(utga.$in)) {
          const shine = utga.$in.map((v) => (v === ownId ? ezenId : v));
          if (shine.some((v, i) => v !== utga.$in[i])) {
            utga.$in = shine;
            uurchlugdsun = true;
          }
        }
        if (utga.$eq === ownId) {
          utga.$eq = ezenId;
          uurchlugdsun = true;
        }
      }
    } else if (utga && typeof utga === "object") {
      if (obiektSoliyo(utga, ownId, ezenId, gunUlkhu + 1)) uurchlugdsun = true;
    }
  }

  return uurchlugdsun;
}

/** URL дээрх query string-ийг дахин бичнэ */
function urlSoliyo(req, ownId, ezenId) {
  const [zam, queryString] = String(req.url || "").split("?");
  if (!queryString) return;

  const params = new URLSearchParams(queryString);
  let uurchlugdsun = false;

  // 1. `query={"orshinSuugchId":"..."}` хэлбэрийн JSON шүүлт
  const queryJson = params.get("query");
  if (queryJson) {
    try {
      const parsed = JSON.parse(queryJson);
      if (obiektSoliyo(parsed, ownId, ezenId)) {
        params.set("query", JSON.stringify(parsed));
        uurchlugdsun = true;
      }
    } catch (err) {
      // JSON биш бол хөндөхгүй
    }
  }

  // 2. Энгийн `?orshinSuugchId=...` параметрүүд
  for (const talbar of ID_TALBARUUD) {
    if (params.get(talbar) === ownId) {
      params.set(talbar, ezenId);
      uurchlugdsun = true;
    }
  }

  if (uurchlugdsun) {
    req.url = `${zam}?${params.toString()}`;
    if (req.originalUrl) {
      const [ezam, eqs] = String(req.originalUrl).split("?");
      if (eqs) req.originalUrl = `${ezam}?${params.toString()}`;
    }
  }
}

function gishuuniiKhandalt(req, res, next) {
  try {
    const token = tokenAvya(req);
    if (!token || !token.id || token.id === "zochin") return next();

    // Дараагийн handler-ууд ашиглах боломжтой мэдээлэл
    req.gishuun = {
      gishuunEsekh: !!token.undsenId,
      uuriinId: String(token.id),
      ugugdliinEzniiId: String(token.undsenId || token.id),
      erkh: token.undsenId ? token.gishuuniiErkh || "Харах + Төлөх" : null,
    };

    if (!token.undsenId) return next();

    const ownId = String(token.id);
    const ezenId = String(token.undsenId);
    if (ownId === ezenId) return next();

    urlSoliyo(req, ownId, ezenId);
    if (req.body && typeof req.body === "object") {
      obiektSoliyo(req.body, ownId, ezenId);
    }

    next();
  } catch (err) {
    next();
  }
}

/**
 * "Харах" эрхтэй гишүүнээс төлбөрийн үйлдлийг хаана.
 * Үндсэн эзэмшигч, ажилтан, зочинд огт хамаарахгүй.
 */
function tulukhErkhShalgaya(req, res, next) {
  const gishuun = req.gishuun;
  if (!gishuun || !gishuun.gishuunEsekh) return next();
  if (gishuun.erkh !== "Харах") return next();

  return res.status(403).json({
    success: false,
    message:
      "Танд төлбөр төлөх эрх байхгүй байна. Үндсэн эзэмшигчид хандана уу.",
    code: "GISHUUN_TULUKH_ERKHGUI",
  });
}

module.exports = gishuuniiKhandalt;
module.exports.gishuuniiKhandalt = gishuuniiKhandalt;
module.exports.tulukhErkhShalgaya = tulukhErkhShalgaya;
