/**
 * НЭГ ЭРХЭЭР НЭГ Л ТӨХӨӨРӨМЖ.
 *
 * Нэвтрэх үед `controller/ajiltan.js`-ийн `sessionUusgekh` нь тухайн
 * ажилтны ӨМНӨХ бүх session-ийг идэвхгүй болгоод шинийг үүсгэдэг. Гэвч тэр
 * шалгалт нь ердөө ХОЁР замд (`sessionShalgakh`) залгагдсан байсан тул
 * хуучин төхөөрөмж нь JWT-гээрээ бусад бүх эндпойнтыг хэвийн дуудсаар
 * байв — өөрөөр хэлбэл «нэг session» бодлого нь нэрэндээ л байсан.
 *
 * Энэ middleware түүнийг БҮХ замд хэрэгжүүлнэ.
 *
 * ЯАГААД «идэвхтэй session байхгүй бол нэвтрүүлнэ» гэж вэ:
 *   • Оршин суугчийн апп, зочин, камер, хаалга, QPay зэрэг нь session
 *     бүртгэдэггүй — тэднийг хаах ёсгүй.
 *   • Нэвтрэх үед session үүсгэх нь алдвал (`sessionUusgekh` нь алдааг
 *     барьж үргэлжилдэг) хэрэглэгч гацах ёсгүй.
 *   • Session нь 12 цагийн TTL-тэй; хугацаа дуусахад JWT хүчинтэй хэвээр
 *     байвал хэрэглэгчийг гэнэт хаяхгүй.
 * Иймд ЗӨВХӨН «энэ ажилтанд идэвхтэй session БАЙГАА бөгөөд энэ токен
 * тэдгээрийн дунд АЛГА» үед л хаана. Тэр нөхцөл яг «өөр төхөөрөмжөөс
 * нэвтэрсэн» гэсэн утгатай.
 */

const jwt = require("jsonwebtoken");

/** Фронт энэ кодоор «өөр төхөөрөмж» гэдгийг ялгаж, мэдэгдэл харуулна. */
const KOD = "OOR_TOKHOOROMJ";
const MEDEGDEL =
  "Таны эрхээр өөр төхөөрөмжөөс нэвтэрсэн тул системээс гарлаа.";

/**
 * Хүсэлт бүрд бааз уншихгүйн тулд богино хугацааны санах ой.
 *
 * Хуучин төхөөрөмж хамгийн ихдээ энэ хугацааны дараа хаагдана — шууд
 * хаахын тулд бааз руу хандах нь ачааллыг дэмий нэмнэ.
 */
const SANAKH_MS = Number(process.env.SESSION_SANAKH_MS) || 10000;
const sanakh = new Map();

function sanakhAvya(tulkhuur) {
  const mur = sanakh.get(tulkhuur);
  if (!mur) return undefined;
  if (Date.now() - mur.tsag > SANAKH_MS) {
    sanakh.delete(tulkhuur);
    return undefined;
  }
  return mur.zuv;
}

function sanakhTaviya(tulkhuur, zuv) {
  // Хязгааргүй өсөхөөс сэргийлнэ (олон ажилтан, олон токен).
  if (sanakh.size > 5000) sanakh.clear();
  sanakh.set(tulkhuur, { zuv, tsag: Date.now() });
}

/**
 * Байгууллагын «нэг эрхээр нэг л төхөөрөмж» бодлогын тохиргоог шалгах.
 * Хүсэлт бүрд бааз руу хандахгүй байх үүднээс 15 секунд кэшлэнэ.
 */
const orgSanakh = new Map();
const ORG_SANAKH_MS = 15000;

async function negSessionIdevkhteiEsekh(baiguullagiinId) {
  if (!baiguullagiinId) return true;
  const key = String(baiguullagiinId);
  const odoo = Date.now();
  const cached = orgSanakh.get(key);
  if (cached && odoo - cached.tsag < ORG_SANAKH_MS) {
    return cached.negSessionEsekh;
  }

  try {
    const { db } = require("zevbackv2");
    const Baiguullaga = require("../models/baiguullaga")(db.erunkhiiKholbolt);
    const org = await Baiguullaga.findById(baiguullagiinId)
      .select({
        "tokhirgoo.negSessionEsekh": 1,
        "tokhirgoo.olonTokhooromjZuvshuurukh": 1,
      })
      .lean();

    // negSessionEsekh: false эсвэл olonTokhooromjZuvshuurukh: true үед хязгаарлалт унтраалттай
    const negSessionEsekh =
      org?.tokhirgoo?.negSessionEsekh !== false &&
      !org?.tokhirgoo?.olonTokhooromjZuvshuurukh;

    if (orgSanakh.size > 2000) orgSanakh.clear();
    orgSanakh.set(key, { negSessionEsekh, tsag: odoo });
    return negSessionEsekh;
  } catch (aldaa) {
    console.error(
      "[negSession] байгууллагын тохиргоо уншихад алдаа:",
      aldaa.message,
    );
    return true;
  }
}

async function negSession(req, res, next) {
  try {
    const header = req.headers && req.headers.authorization;
    if (!header) return next();

    const token = String(header).split(" ")[1];
    if (!token) return next();

    let payload = null;
    try {
      payload = jwt.verify(token, process.env.APP_SECRET);
    } catch (_aldaa) {
      // Буруу/хугацаа дууссан токеныг доорх `tokenShalgakh` барина.
      return next();
    }

    const ajiltanId = payload?.id;
    if (!ajiltanId || ajiltanId === "zochin") return next();

    /* ─── МАШИН (SERVICE) ТОКЕНЫГ ХААХГҮЙ ────────────────────────────────
     *
     * Хаалганы ажиллагч (gate worker), гүүр зэрэг нь ХҮНИЙ төхөөрөмж биш —
     * `khugatsaaguiTokenUusgeye`-ээр үүсгэсэн ХУГАЦААГҮЙ токеноор ажилладаг.
     * Тэд дахин нэвтэрч чаддаггүй.
     *
     * Админ вэбээс ижил эрхээр нэвтрэхэд `sessionUusgekh` нь өмнөх бүх
     * session-ийг идэвхгүй болгодог тул ажиллагчийн токен «өөр
     * төхөөрөмжийнх» болж 401 авдаг байв — үр дүнд нь ХААЛГА ЗОГСОНО
     * (PLATE GIVE UP, машин оруулахгүй).
     *
     * Хүний нэвтрэлт бүр `exp`-тэй (12 цаг / 7 хоног) байдаг тул `exp`
     * байхгүй нь сервисийн токен гэсэн найдвартай шинж. Хүний «нэг
     * төхөөрөмж» бодлого ХЭВЭЭРЭЭ үлдэнэ.
     */
    if (!payload.exp) return next();

    /* ─── БАЙГУУЛЛАГЫН «1 ЭРХЭЭР ОЛОН ТӨХӨӨРӨМЖ» ТОХИРГОО ──────────────
     * Тохиргоонд «1 эрхээр зөвхөн 1 төхөөрөмжнөөс хандах»-ыг унтраасан бол
     * хэдэн ч төхөөрөмжнөөс нэгэн зэрэг хандахыг зөвшөөрнө.
     */
    const baiguullagiinId = payload?.baiguullagiinId;
    if (baiguullagiinId) {
      const idevkhteiEsekh = await negSessionIdevkhteiEsekh(baiguullagiinId);
      if (!idevkhteiEsekh) {
        sanakhTaviya(token, true);
        return next();
      }
    }

    const sanasan = sanakhAvya(token);
    if (sanasan === true) return next();
    if (sanasan === false) {
      return res
        .status(401)
        .json({ success: false, kod: KOD, message: MEDEGDEL });
    }

    const { db } = require("zevbackv2");
    const session = require("../models/session");

    const idevkhteiSessionuud = await session(db.erunkhiiKholbolt)
      .find({ ajiltanId: String(ajiltanId), isActive: true })
      .select({ sessionToken: 1 })
      .lean();

    // Энэ хэрэглэгч session бүртгэдэггүй төрлийнх (оршин суугч, камер г.м.)
    // эсвэл session нь хугацаа дуусч устсан — хуучин зан төлвөөр үргэлжилнэ.
    if (!idevkhteiSessionuud.length) {
      sanakhTaviya(token, true);
      return next();
    }

    const zuv = idevkhteiSessionuud.some((s) => s.sessionToken === token);
    sanakhTaviya(token, zuv);

    if (zuv) return next();

    return res
      .status(401)
      .json({ success: false, kod: KOD, message: MEDEGDEL });
  } catch (aldaa) {
    // Энэ шалгалт унаснаас болж систем зогсох ёсгүй.
    console.error("[negSession] шалгахад алдаа:", aldaa.message);
    return next();
  }
}

module.exports = negSession;
module.exports.KOD = KOD;
module.exports.MEDEGDEL = MEDEGDEL;
