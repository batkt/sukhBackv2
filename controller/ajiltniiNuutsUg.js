/**
 * Ажилтны «Нууц үг мартсан?» — утасны дугаараар сэргээх урсгал.
 *
 *   1. POST /ajiltanNuutsUgCodeIlgeeye   { utas, nevtrekhNer? }
 *   2. POST /ajiltanNuutsUgCodeShalgaya  { utas, code, nevtrekhNer? }
 *   3. POST /ajiltanNuutsUgSergeeye      { utas, code, shineNuutsUg, davtakhNuutsUg, nevtrekhNer? }
 *
 * Бүгд НЭВТРЭЭГҮЙ хүнд нээлттэй — нэвтэрч чадахгүй байгаа хүнд зориулсан тул
 * өөрөөр боломжгүй. Хамгаалалт нь: SMS код, оролдлогын хязгаар (кодны загвар
 * дээр 3), дахин илгээх хүлээлт, кодны 10 минутын хугацаа.
 *
 * Ажилтан нь НЭГДСЭН баазад (`db.erunkhiiKholbolt`) байдаг — `ajiltanNevtrey`
 * ч яг тэндээс хайдаг. Тиймээс оршин суугчийнхаас ялгаатай нь байгууллага
 * сонгох шаардлагагүй: утасны дугаар бүх байгууллагын хэмжээнд өвөрмөц
 * ХАРАГДАХ албагүй ч нэг л газраас хайгдана.
 *
 * Нэг утсан дээр ОЛОН ажилтны данс байж болно (нэг хүн хэд хэдэн байгууллагад
 * ажилладаг). Тийм үед аль дансыг сэргээхийг таах нь аюултай тул нэвтрэх
 * нэрсийг нь буцааж, хэрэглэгчээр сонгуулна.
 */

const asyncHandler = require("express-async-handler");
const { db } = require("zevbackv2");

const Ajiltan = require("../models/ajiltan");
const BatalgaajuulahCode = require("../models/batalgaajuulahCode");
// `ajiltan.js` дээр ч ижил функц байдаг ч экспортлогдоогүй. `orshinSuugch.js`
// дээрх нь экспортлогдсон бөгөөд гарын үсэг нь яг адил — `gerBuliinGishuun.js`
// ч эндээс авдаг.
const { msgIlgeeye } = require("./orshinSuugch");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/** CallPro-гийн тохиргоо — оршин суугчийн урсгалтай ижил. */
const MSG_KEY = "aa8e588459fdd9b7ac0b809fc29cfae3";
const MSG_DUGAAR = "72002002";

/** Кодны зорилго. Загвар дээрх enum-ын утга. */
const PURPOSE = "password_reset";

/** Кодны хүчинтэй хугацаа (минут). */
const KODNII_KHUGATSAA_MIN = 10;

/**
 * Дахин код илгээх хүртэл хүлээх хугацаа (секунд).
 *
 * Үүнгүйгээр дурын хүн нэг дугаар руу SMS-ээр "бөмбөгдөх" боломжтой — мөнгө
 * зарцуулагдаад зогсохгүй тухайн ажилтан мессежинд дарагдана.
 */
const DAKHIN_ILGEEKH_SEKUND = 60;

/** Нууц үгийн доод урт. Оршин суугчийнхтай ижил байлгав. */
const NUUTS_UGIIN_DOOD_URT = 4;

/** Утасны дугаарыг цэгцэлнэ — зай, зураас, +976-г арилгана. */
function utasTseverleye(utas) {
  if (!utas) return "";
  const tsever = String(utas).replace(/[\s\-()]/g, "");
  return tsever.replace(/^\+?976/, "");
}

/** Нэвтрэх нэрийг хэсэгчлэн нуусан байдлаар харуулна: `CAdmin1` → `CA***n1`. */
function nerNuuya(ner) {
  const utga = String(ner || "");
  if (utga.length <= 4) return utga;
  return `${utga.slice(0, 2)}***${utga.slice(-2)}`;
}

/**
 * Утас (ба сонгосон бол нэвтрэх нэр)-ээр ажилтныг олно.
 *
 * Буцаах утга:
 *   { ajiltan }            — яг нэг данс олдлоо
 *   { olon: [...] }        — хэд хэдэн данс таарав, сонгуулах шаардлагатай
 *   { aldaa: "..." }       — олдсонгүй
 */
async function ajiltanOloyo(utas, nevtrekhNer) {
  const tsever = utasTseverleye(utas);
  const Model = Ajiltan(db.erunkhiiKholbolt);
  const talbaruud = "ner ovog utas nevtrekhNer baiguullagiinId baiguullagiinNer";
  const nerShuult = nevtrekhNer
    ? { nevtrekhNer: String(nevtrekhNer).trim() }
    : {};

  // Ажилтны `utas` нь гараар бөглөгддөг тул баазад "99112233", "+97699112233",
  // "9911-2233" гэх мэт ЯНЗ БҮРИЙН хэлбэрээр хадгалагдсан байдаг. Эхлээд
  // түгээмэл хэлбэрүүдээр нь шууд хайна.
  const khuvilbaruud = [
    tsever,
    `+976${tsever}`,
    `976${tsever}`,
    `${tsever.slice(0, 4)}-${tsever.slice(4)}`,
    `${tsever.slice(0, 4)} ${tsever.slice(4)}`,
  ];

  let oldson = await Model.find({ ...nerShuult, utas: { $in: khuvilbaruud } })
    .select(talbaruud)
    .lean();

  // Олдоогүй бол цифр хооронд нь ямар ч тусгаарлагч байж болно гэж үзээд
  // төгсгөлөөр нь тааруулна. Индекс ашиглахгүй тул зөвхөн НӨӨЦ зам —
  // нууц үг сэргээх нь ховор үйлдэл учир зардал нь хүлээн зөвшөөрөгдөхүйц.
  if (!oldson.length && /^\d{8}$/.test(tsever)) {
    const rx = new RegExp(`${tsever.split("").join("[\\s\\-()]*")}$`);
    oldson = await Model.find({ ...nerShuult, utas: rx })
      .select(talbaruud)
      .lean();
  }

  if (!oldson.length)
    return {
      aldaa: nevtrekhNer
        ? "Энэ утас, нэвтрэх нэрийн хослолтой ажилтан олдсонгүй!"
        : "Энэ утасны дугаартай ажилтан олдсонгүй!",
    };

  if (oldson.length > 1)
    return {
      olon: oldson.map((a) => ({
        nevtrekhNer: a.nevtrekhNer,
        nuusanNer: nerNuuya(a.nevtrekhNer),
        baiguullagiinNer: a.baiguullagiinNer || "",
      })),
    };

  return { ajiltan: oldson[0] };
}

/** Кодын бичлэгийн загварыг нэгдсэн баазаас авна. */
const CodeModel = () => BatalgaajuulahCode(db.erunkhiiKholbolt);

/* ── 1. Код илгээх ───────────────────────────────────────────────────────── */

exports.ajiltanNuutsUgCodeIlgeeye = asyncHandler(async (req, res) => {
  const { utas, nevtrekhNer } = req.body || {};

  if (!utas)
    return res
      .status(400)
      .json({ success: false, message: "Утасны дугаар заавал бөглөнө үү!" });

  const tsever = utasTseverleye(utas);
  if (!/^\d{8}$/.test(tsever))
    return res
      .status(400)
      .json({ success: false, message: "Утасны дугаар 8 оронтой байх ёстой!" });

  const olson = await ajiltanOloyo(tsever, nevtrekhNer);

  if (olson.olon)
    return res.status(409).json({
      success: false,
      olonDans: true,
      message:
        "Энэ утсан дээр хэд хэдэн ажилтны данс бүртгэлтэй байна. " +
        "Аль дансаа сэргээхээ нэвтрэх нэрээрээ сонгоно уу.",
      dansnuud: olson.olon,
    });

  if (olson.aldaa)
    return res.status(404).json({ success: false, message: olson.aldaa });

  const ajiltan = olson.ajiltan;

  // SMS бөмбөгдөлтөөс сэргийлнэ: сүүлийн код хэт шинэхэн бол дахин илгээхгүй.
  const suuliinKod = await CodeModel()
    .findOne({ utas: tsever, purpose: PURPOSE })
    .sort({ createdAt: -1 })
    .lean();

  if (suuliinKod?.createdAt) {
    const ungursun = (Date.now() - new Date(suuliinKod.createdAt)) / 1000;
    if (ungursun < DAKHIN_ILGEEKH_SEKUND) {
      const uldsen = Math.ceil(DAKHIN_ILGEEKH_SEKUND - ungursun);
      return res.status(429).json({
        success: false,
        message: `Дахин код авахын тулд ${uldsen} секунд хүлээнэ үү.`,
        dakhinIlgeekhSekund: uldsen,
      });
    }
  }

  const kod = await CodeModel().batalgaajuulkhCodeUusgeye(
    tsever,
    PURPOSE,
    KODNII_KHUGATSAA_MIN,
  );

  // MsgTuukh нь байгууллагын баазад бичигддэг. Ажилтны байгууллагын холболт
  // олдохгүй бол нэгдсэн баазад бичнэ — SMS нь илгээгдэх нь чухал.
  const kholbolt =
    getKholboltByBaiguullagiinId(ajiltan.baiguullagiinId) ||
    db.erunkhiiKholbolt;

  msgIlgeeye(
    [
      {
        to: tsever,
        text: `Tany nuuts ugiig sergeex code: ${kod.code}.`,
        gereeniiId: PURPOSE,
      },
    ],
    MSG_KEY,
    MSG_DUGAAR,
    [],
    0,
    kholbolt,
    ajiltan.baiguullagiinId,
  );

  return res.json({
    success: true,
    message: "Баталгаажуулах код илгээгдлээ",
    khugatsaaMinut: KODNII_KHUGATSAA_MIN,
    dakhinIlgeekhSekund: DAKHIN_ILGEEKH_SEKUND,
  });
});

/* ── 2. Код шалгах (хэрэглэхгүйгээр) ─────────────────────────────────────── */

exports.ajiltanNuutsUgCodeShalgaya = asyncHandler(async (req, res) => {
  const { utas, code, nevtrekhNer } = req.body || {};

  if (!utas || !code)
    return res
      .status(400)
      .json({ success: false, message: "Утас болон код заавал бөглөнө үү!" });

  const tsever = utasTseverleye(utas);
  const olson = await ajiltanOloyo(tsever, nevtrekhNer);
  if (olson.aldaa || olson.olon)
    return res.status(olson.olon ? 409 : 404).json({
      success: false,
      message: olson.aldaa || "Аль дансаа сэргээхээ сонгоно уу.",
    });

  // ЗӨВХӨН шалгана — кодыг энд "хэрэглэсэн" болгохгүй. Эс бөгөөс 3-р алхам
  // дээр нууц үгээ тавих гэхэд код нь аль хэдийн хүчингүй болно.
  const idevkhtei = await CodeModel()
    .findOne({
      utas: tsever,
      code: String(code).trim(),
      purpose: PURPOSE,
      khereglesenEsekh: false,
      expiresAt: { $gt: new Date() },
    })
    .sort({ createdAt: -1 });

  if (!idevkhtei) {
    // Буруу оролдлогыг идэвхтэй код дээр бүртгэнэ — 4 оронтой кодыг таах
    // боломжийг хаана.
    const uldsen = await CodeModel().buruuOroldlogoBurtgeye(tsever, PURPOSE);
    return res.status(400).json({
      success: false,
      message: "Код буруу эсвэл хугацаа нь дууссан байна!",
      uldsenOroldlogo: uldsen?.uldsen ?? 0,
    });
  }

  if (idevkhtei.oroldlogo >= idevkhtei.niitOroldokhErkh)
    return res.status(429).json({
      success: false,
      message: "Хэт олон удаа буруу оролдсон байна. Шинэ код авна уу.",
    });

  return res.json({ success: true, message: "Код зөв байна" });
});

/* ── 3. Нууц үг сэргээх ──────────────────────────────────────────────────── */

exports.ajiltanNuutsUgSergeeye = asyncHandler(async (req, res) => {
  const { utas, code, shineNuutsUg, davtakhNuutsUg, nevtrekhNer } =
    req.body || {};

  if (!utas || !code || !shineNuutsUg)
    return res
      .status(400)
      .json({ success: false, message: "Бүх талбарыг бөглөнө үү!" });

  if (davtakhNuutsUg !== undefined && String(shineNuutsUg) !== String(davtakhNuutsUg))
    return res
      .status(400)
      .json({ success: false, message: "Шинэ нууц үг таарахгүй байна!" });

  if (String(shineNuutsUg).length < NUUTS_UGIIN_DOOD_URT)
    return res.status(400).json({
      success: false,
      message: `Нууц үг хамгийн багадаа ${NUUTS_UGIIN_DOOD_URT} тэмдэгт байх ёстой!`,
    });

  const tsever = utasTseverleye(utas);
  const olson = await ajiltanOloyo(tsever, nevtrekhNer);

  if (olson.olon)
    return res.status(409).json({
      success: false,
      olonDans: true,
      message: "Аль дансаа сэргээхээ нэвтрэх нэрээрээ сонгоно уу.",
      dansnuud: olson.olon,
    });

  if (olson.aldaa)
    return res.status(404).json({ success: false, message: olson.aldaa });

  // Энд кодыг ХЭРЭГЛЭНЭ — амжилттай бол дахин ашиглагдахгүй болно.
  const shalgalt = await CodeModel().verifyCode(
    tsever,
    String(code).trim(),
    PURPOSE,
  );
  if (!shalgalt.success)
    return res.status(400).json({ success: false, message: shalgalt.message });

  // `save()` дээр pre-hook нь bcrypt-ээр хэшилнэ. `updateOne` нь зөвхөн
  // `this._update.register + nevtrekhNer`-ийг индекслэхийг оролддог тул
  // баримтыг бүтнээр нь ачаалж хадгалах нь аюулгүй.
  const ajiltan = await Ajiltan(db.erunkhiiKholbolt).findById(
    olson.ajiltan._id,
  );
  if (!ajiltan)
    return res
      .status(404)
      .json({ success: false, message: "Ажилтны мэдээлэл олдсонгүй!" });

  ajiltan.nuutsUg = String(shineNuutsUg);
  await ajiltan.save();

  console.log(
    `[ajiltanNuutsUg] ${ajiltan.nevtrekhNer} (${tsever}) нууц үгээ сэргээлээ`,
  );

  return res.json({
    success: true,
    message: "Нууц үг амжилттай сэргээгдлээ. Шинэ нууц үгээрээ нэвтэрнэ үү.",
    nevtrekhNer: ajiltan.nevtrekhNer,
  });
});
