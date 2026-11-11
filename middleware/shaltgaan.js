/**
 * УСТГАЛ / ЗАСВАРЫН ШАЛТГААН.
 *
 * Ажилтан өгөгдөл устгах, засах бүрдээ шалтгаан бичих ёстой. Шалтгаан нь
 * «Устгасан түүх» (ustgakhTuukh.shaltgaan) болон «Зассан түүх»
 * (zassanBarimt.shaltgaan)-д ажилтны id, нэр, огноотой хамт хадгалагдана.
 *
 * Шалтгааныг дараах газраас уншина (эхнийх нь давуу):
 *   1. `X-Shaltgaan` толгой — вэб үүгээр явуулна. HTTP толгойд кирилл үсэг
 *      шууд орохгүй тул `encodeURIComponent`-ээр кодолсон байна.
 *   2. `req.body.shaltgaan`
 *   3. `req.query.shaltgaan`
 * Уншсан утгыг `req.shaltgaan`-д хадгална. Аудит plugin
 * (utils/auditPlugin.js) нь requestContext-оор дамжуулан үүнийг авна.
 *
 * ШААРДЛАГА (400, kod: SHALTGAAN_SHAARDLAGATAI) зөвхөн:
 *   • НЭВТЭРСЭН АЖИЛТНЫ (хүний) токен — `erkh` болон `exp`-тэй. Оршин
 *     суугч/харилцагчийн апп (`erkh`-гүй), хаалганы ажиллагч, гүүр
 *     (`exp`-гүй сервисийн токен), зочин, cron (токенгүй) хэзээ ч хаагдахгүй.
 *   • DELETE / PUT / PATCH (доорх KHAMAARAKHGUI-ээс бусад), эсвэл
 *     POST-оор хийгддэг устгал/засварын тусгай замууд (POST_ZAMUUD).
 *
 * Хориг нь ямар ч handler ажиллахаас ӨМНӨ болдог тул вэб 400 авсны дараа
 * шалтгаан асуугаад ижил хүсэлтийг дахин илгээхэд аюулгүй.
 */

const jwt = require("jsonwebtoken");

const KOD = "SHALTGAAN_SHAARDLAGATAI";
const MEDEGDEL = "Устгах, засах үйлдэлд шалтгаан заавал бичнэ үү.";
const DOOD_URT = 3;
const DEED_URT = 500;

/**
 * Шалтгаан шаардахгүй DELETE/PUT/PATCH замууд — өдөр тутмын ажиллагаа,
 * өгөгдлийн засвар биш эсвэл ажилтны бус хэрэглэгчийн зам.
 */
const KHAMAARAKHGUI = [
  // Мэдэгдэл «уншсан» гэж тэмдэглэх; санал хүсэлтийн төлөв солих
  /^\/medegdel\/[^/]+\/kharsanEsekh\/?$/,
  { method: "PUT", zam: /^\/medegdel\/[^/]+\/?$/ },
  // Хаалга/кассын ажилтны зогсоолын гүйлгээ (машин бүрд шалтгаан асуух боломжгүй)
  /^\/(zogsoolUilchluulegch|uilchluulegch|kassCameraKhaalt)(\/|$)/,
  // Оршин суугчийн хэтэвч, нэвтрэлт/сешн, аудитын өөрийнх нь замууд
  /^\/wallet(\/|$)/,
  /^\/(session|nevtreltiinTuukh|backTuukh)(\/|$)/,
  /^\/audit(\/|$)/,
];

/**
 * POST-оор хийгддэг устгал/засвар. `nukhtsul` нь тухайн хүсэлт үнэхээр
 * өөрчлөлт хийх эсэхийг шалгана (ж: зөвхөн тоолох dry-run бол шаардахгүй).
 */
const POST_ZAMUUD = [
  {
    zam: /^\/(geree|khariltsagch)\/[^/]+\/adminUstgakh\/?$/,
    nukhtsul: (req) => req.body?.zovkhonShalgakh !== true,
  },
  { zam: /^\/deleteInvoice\/?$/ },
  { zam: /^\/nekhemjlekhiinTuukh\/deleteZardal\/?$/ },
  { zam: /^\/(khariltsagch|orshinSuugch)\/remove-toot\/?$/ },
  { zam: /^\/zogsoolUstgay\/?$/ },
  { zam: /^\/ashiglaltiinZardalUstgaya\/?$/ },
  { zam: /^\/gerBuliinGishuun(Ustgakh|Zasakh)\/?$/ },
  { zam: /^\/mashiniiDugaarZasakh\/?$/ },
  { zam: /^\/davkharBarimtZasakh\/?$/ },
  { zam: /^\/ebarimtButsaaya\/?$/ },
  { zam: /^\/easyRegister\/user\/(delete|hardDelete)\/?$/ },
  // Тохиргоо (байгууллага/барилгын тохиргоо POST-оор хадгалагддаг), BPay горим
  { zam: /^\/baiguullaga\/[^/]+\/?$/ },
  { zam: /^\/bpay\/medeelel\/?$/ },
  // Гэрээ, тоот, гүйлгээ, хөнгөлөлт, зардал, оршин суугчийн бөөн засвар
  // Вэб body.shaltgaan-д системийн бичвэр явуулдаг тул ажилтны шалтгааныг
  // зөвхөн толгойгоос авна.
  { zam: /^\/gereeTsutslakh\/?$/, tolgoiZaaval: true },
  { zam: /^\/gereeNemeltTootKhasya\/?$/ },
  { zam: /^\/guilgeeSalgaya\/?$/ },
  { zam: /^\/khungulultZasvarlaya\/?$/ },
  { zam: /^\/zardalTseverlekhiya\/?$/ },
  { zam: /^\/orshinSuugch\/massUpdateKwt\/?$/ },
];

function tsevarlaya(utga) {
  if (utga === null || utga === undefined) return "";
  return String(utga).replace(/\s+/g, " ").trim().slice(0, DEED_URT);
}

/** Хүсэлтээс шалтгааныг уншина (толгой → body → query). */
function tolgoinoosUnshya(req) {
  const tolgoi = req.headers?.["x-shaltgaan"];
  if (!tolgoi) return "";
  let utga = Array.isArray(tolgoi) ? tolgoi[0] : tolgoi;
  try {
    utga = decodeURIComponent(utga);
  } catch (_) {
    // Кодлоогүй (латин) утга байж болно — байгаагаар нь авна
  }
  return tsevarlaya(utga);
}

function shaltgaanUnshya(req) {
  const tolgoi = req.headers?.["x-shaltgaan"];
  if (tolgoi) {
    let utga = Array.isArray(tolgoi) ? tolgoi[0] : tolgoi;
    try {
      utga = decodeURIComponent(utga);
    } catch (_) {
      // Кодлоогүй (латин) утга байж болно — байгаагаар нь авна
    }
    const t = tsevarlaya(utga);
    if (t) return t;
  }
  const body = req.body && typeof req.body.shaltgaan === "string" ? req.body.shaltgaan : "";
  if (tsevarlaya(body)) return tsevarlaya(body);
  return tsevarlaya(req.query?.shaltgaan);
}

/** Хүний (ажилтны) токен мөн эсэх. Буруу токенийг tokenShalgakh өөрөө барина. */
function ajiltniiTokenEsekh(req) {
  const header = String(req.headers?.authorization || "");
  const token = header.split(" ")[1];
  if (!token) return false;
  try {
    const p = jwt.verify(token, process.env.APP_SECRET);
    return !!(p && p.id && p.id !== "zochin" && p.erkh && p.exp);
  } catch (_) {
    return false;
  }
}

function postMur(req) {
  if (String(req.method || "").toUpperCase() !== "POST") return null;
  return POST_ZAMUUD.find((d) => d.zam.test(req.path || "")) || null;
}

function shaardakhEsekh(req) {
  const method = String(req.method || "").toUpperCase();
  const zam = req.path || "";
  if (method === "DELETE" || method === "PUT" || method === "PATCH") {
    return !KHAMAARAKHGUI.some((d) =>
      d instanceof RegExp ? d.test(zam) : d.method === method && d.zam.test(zam),
    );
  }
  if (method === "POST") {
    const mur = POST_ZAMUUD.find((d) => d.zam.test(zam));
    return !!mur && (!mur.nukhtsul || mur.nukhtsul(req));
  }
  return false;
}

function shaltgaanMiddleware(req, res, next) {
  try {
    // Зарим замд body.shaltgaan нь системийн бичвэр — зөвхөн толгойг тооцно
    req.shaltgaan = (postMur(req)?.tolgoiZaaval ? tolgoinoosUnshya(req) : shaltgaanUnshya(req)) || null;
    if (!shaardakhEsekh(req) || !ajiltniiTokenEsekh(req)) return next();
    if (req.shaltgaan && req.shaltgaan.length >= DOOD_URT) return next();
    return res.status(400).json({
      success: false,
      kod: KOD,
      aldaa: MEDEGDEL,
      message: MEDEGDEL,
    });
  } catch (aldaa) {
    // Энэ шалгалт унаснаас болж систем зогсох ёсгүй
    console.error("[shaltgaan] шалгахад алдаа:", aldaa.message);
    return next();
  }
}

/** Аудит бичихэд: хүсэлтэд хавсаргасан шалтгаан (байхгүй бол null). */
function shaltgaanAvya(req) {
  if (!req) return null;
  if (req.shaltgaan !== undefined) return req.shaltgaan || null;
  return shaltgaanUnshya(req) || null;
}

module.exports = shaltgaanMiddleware;
module.exports.KOD = KOD;
module.exports.MEDEGDEL = MEDEGDEL;
module.exports.shaltgaanAvya = shaltgaanAvya;
module.exports.shaardakhEsekh = shaardakhEsekh;
module.exports.shaltgaanUnshya = shaltgaanUnshya;
