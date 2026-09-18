/**
 * Цэвэрлэгээ — оршин суугч аппаас захиалга үүсгэж, ажилтан админаас удирдана.
 *
 * Оршин суугчийн (апп) талын endpoint:
 *   POST /tseverlegee                    - шинэ захиалга үүсгэх
 *   GET  /orshinSuugchiinTseverlegee     - өөрийн захиалгын түүх
 *   PUT  /tseverlegee/:id/tsutsalya      - өөрийн захиалгаа цуцлах
 *
 * Ажилтны талын endpoint:
 *   GET    /tseverlegee/toollogo         - төлөв бүрийн тоо (самбарт)
 *   GET    /tseverlegee                  - жагсаалт (шүүлттэй)
 *   GET    /tseverlegee/:id              - нэгийг авах
 *   PUT    /tseverlegee/:id              - төлөв солих / гүйцэтгэгч хуваарилах
 *   DELETE /tseverlegee/:id              - устгах (зөөлөн)
 *
 * Ажилтны талыг zevtabs админ ч дууддаг. Тэрээр `tokenAvya("sukh")`-аар мастер
 * токен аваад ирдэг тул нэмэлт нууц шаардлагагүй — ердийн `tokenShalgakh` л
 * хангалттай. Харин zevtabs нь sukh дээрх baiguullagiinId-г мэддэггүй, зөвхөн
 * байгууллагын РЕГИСТРийг мэддэг тул ажилтны талын endpoint нь хоёуланг
 * хүлээж авна (`baiguullagiinId` эсвэл `register`).
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");

const Tseverlegee = require("../models/tseverlegee");
const { TULUVUUD, UILCHILGEENII_TURLUUD } = require("../models/tseverlegee");
const Baiguullaga = require("../models/baiguullaga");
const Ajiltan = require("../models/ajiltan");
const OrshinSuugch = require("../models/orshinSuugch");
const { ZEVTABS_MASTER_NER } = require("../controller/ajiltan");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/**
 * Баазын холболтыг НЭРЭЭР нь олно.
 *
 * bpay (хэтэвчний) хэрэглэгчид тусдаа байгууллагын бааз биш, нэгдсэн баазад
 * (`bpaySukh` / `amarSukh`) хадгалагддаг. Тэдний `baiguullagiinId` нь нэгдсэн
 * байгууллагынх байдаг тул түүгээр холболт олдохгүй байж болно — апп нь
 * `tukhainBaaziinKholbolt` талбараар баазынхаа НЭРийг дамжуулдаг.
 */
function kholboltAvyaNereer(baaziinNer) {
  if (!baaziinNer || typeof baaziinNer !== "string") return null;
  return (
    db.kholboltuud.find(
      (k) => String(k.baaziinNer || "") === String(baaziinNer),
    ) || null
  );
}

/**
 * Холболт олоод буцаана, олдоогүй бол хариуг нь өөрөө илгээнэ.
 *
 * Эхлээд байгууллагын id-гаар, олдохгүй бол баазын нэрээр хайна.
 */
function kholboltAvya(res, baiguullagiinId, baaziinNer) {
  if (!baiguullagiinId) {
    res
      .status(400)
      .json({ success: false, message: "baiguullagiinId шаардлагатай" });
    return null;
  }
  const kholbolt =
    getKholboltByBaiguullagiinId(baiguullagiinId) ||
    kholboltAvyaNereer(baaziinNer);
  if (!kholbolt) {
    res.status(404).json({
      success: false,
      message: "Холболтын мэдээлэл олдсонгүй",
    });
    return null;
  }
  return kholbolt;
}

/* ─── СЕРВИСИЙН ТОКЕН ──────────────────────────────────────────────────────
 *
 * ЗӨВХӨН цэвэрлэгээний ажилтны endpoint дээр ажиллах хугацаагүй түлхүүр.
 * Үүгээр ирсэн хүсэлт нь `register`-ээр дурын байгууллагыг сонгож чадна —
 * ганц түлхүүрээр бүх байгууллагын захиалгыг харах зам нь энэ.
 *
 * Яагаад ажилтны токен биш вэ:
 *   - Ажилтны токен 12 цагт хүчингүй болдог тул дахин нэвтрэх шаардлагатай.
 *   - Мастер ажилтны токен нь amarhome дээр БҮХ эрхтэй. Алдагдвал хохирол
 *     хязгааргүй. Энэ түлхүүр нь харин цэвэрлэгээнээс өөр юунд ч хүчингүй.
 *
 * Найдвартай байлгах нөхцөл:
 *   - Зөвхөн сервер хооронд (udirdlagaBack → энд), HTTPS-ээр явна.
 *   - Хөтөч рүү ХЭЗЭЭ Ч гарахгүй.
 *   - Алдагдсан гэж сэжиглэвэл орчны утгыг сольж, хоёр талдаа deploy хийнэ.
 *
 * Утгыг эх кодонд БИЧИХГҮЙ — git-д орвол түүхээс арилахгүй. Зөвхөн орчны
 * хувьсагчаар өгнө. Тохируулаагүй бол түлхүүр хэзээ ч таарахгүй тул ажилтны
 * талын endpoint ердийн токен рүү шилжинэ (хаалттай суурь).
 *
 * ДУУДАХ ҮЕД нь уншина, модуль ачаалах үед биш. Одоогоор `index.js` нь
 * `dotenv.config()`-оо route require-ээс өмнө дууддаг тул асуудалгүй ч,
 * дарааллыг нь сольсон өдөр түлхүүр чимээгүйхэн хоосон болохоос сэргийлэв.
 */
const servisTulkhuurAvya = () => process.env.TSEVERLEGEE_SERVICE_TOKEN || "";

/**
 * Хоёр түлхүүрийг тэнцүү хугацаанд харьцуулна. Энгийн `===` нь эхний зөрүү
 * дээрээ зогсдог тул хариу ирэх хугацаагаар түлхүүрийг таах зай үлдээдэг.
 */
function tulkhuurTaaravUu(irsen, khadgalsan) {
  if (!irsen || !khadgalsan) return false;
  const a = Buffer.from(String(irsen));
  const b = Buffer.from(String(khadgalsan));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Энэ хүсэлт сервисийн түлхүүрээр ирсэн үү */
const servisMuUu = (req) =>
  tulkhuurTaaravUu(req.headers["x-tseverlegee-token"], servisTulkhuurAvya());

/**
 * Ажилтны талын хандалт.
 *
 * Сервисийн түлхүүртэй бол `tokenShalgakh`-г бүрэн алгасана — тэр нь
 * `baiguullagiinId`-г токеноос дарж бичдэг тул бусад байгууллагыг харах
 * боломжгүй болгоно. Түлхүүргүй бол ердийн ажилтны токеноор дамжина.
 */
function tseverlegeeKhandalt(req, res, next) {
  if (servisMuUu(req)) {
    // tokenShalgakh хийдэг зүйлсээс зөвхөн хэрэгтэйг нь гараар тавина.
    if (!req.body) req.body = {};
    return next();
  }
  return tokenShalgakh(req, res, next);
}

/**
 * Дуудсан ажилтан zevtabs-ийн мастер мөн эсэх.
 *
 * Мастер нь ерөнхий баазад нэг л удаа байдаг бөгөөд аль ч байгууллагын
 * өгөгдөл рүү хандах эрхтэй — `zevtabsNevtrelt` ч яг үүнийг шалгадаг.
 */
async function masterMuUu(req) {
  const nevtersen = req.body?.nevtersenAjiltniiToken;
  if (!nevtersen?.id) return false;
  const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
    .findById(nevtersen.id)
    .lean();
  return ajiltan?.nevtrekhNer === ZEVTABS_MASTER_NER;
}

/**
 * Ажилтны талын хүсэлтээс баазын холболтыг олно.
 *
 * ЧУХАЛ: `tokenShalgakh` нь `req.body.baiguullagiinId`-г ТОКЕНЫ утгаар
 * дарж бичдэг. Тиймээс ердийн ажилтан үргэлж өөрийн байгууллагаа л хардаг —
 * энэ нь зөв зан төлөв.
 *
 * Харин сервисийн түлхүүр (эсвэл zevtabs-ийн мастер) бол ганцаараа БҮХ
 * байгууллагыг харах шаардлагатай. Тийм үед `register` ирэх бөгөөд токеноос
 * давуу хүчинтэйгээр тухайн байгууллагыг сонгоно. Эрхгүй хүн register
 * явуулбал татгалзана — эс бөгөөс хэн ч бусдын өгөгдлийг уншиж чадна.
 */
async function baiguullagaTodorkhoiloyo(req, res) {
  const register = req.query?.register || req.body?.register;
  // tokenShalgakh-ийн тавьсан утга. Эрхгүй хүнд энэ нь цорын ганц эх сурвалж.
  let baiguullagiinId = req.body?.baiguullagiinId;

  if (register) {
    const zovshoortoi = servisMuUu(req) || (await masterMuUu(req));
    if (!zovshoortoi) {
      res.status(403).json({
        success: false,
        message: "Өөр байгууллагын өгөгдөлд хандах эрх байхгүй байна",
      });
      return null;
    }
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
      .findOne({ register: String(register) })
      .lean();
    if (!baiguullaga) {
      res
        .status(404)
        .json({ success: false, message: "Байгууллага олдсонгүй" });
      return null;
    }
    baiguullagiinId = String(baiguullaga._id);
  }

  const kholbolt = kholboltAvya(res, baiguullagiinId);
  if (!kholbolt) return null;
  return { kholbolt, baiguullagiinId: String(baiguullagiinId) };
}

/**
 * Оршин суугчийн ЖИНХЭНЭ тоот, нэрийг сервер талаас нь олно.
 *
 * Аппаас ирсэн тоотод найдаж болохгүй: OWN_ORG хаягтай хэрэглэгчийн
 * `wallet_door_no` дотор "OWN_ORG" гэсэн ОРЛУУЛАГЧ текст хадгалагддаг
 * (burtguulekh_signup.dart). Жинхэнэ тоот нь оршин суугчийн бичлэгийн
 * `toots` массивд, байгууллага/барилгаараа ялгарч байдаг.
 *
 * Олдоогүй бол null буцаана — дуудагч нь аппын утгыг нөөцөөр ашиглана.
 */
async function orshinSuugchiinMedeelel(
  kholbolt,
  { orshinSuugchiinId, baiguullagiinId, barilgiinId },
) {
  if (!orshinSuugchiinId) return null;

  const orshinSuugch = await OrshinSuugch(kholbolt)
    .findById(orshinSuugchiinId)
    .lean()
    .catch(() => null);
  if (!orshinSuugch) return null;

  const toots = Array.isArray(orshinSuugch.toots) ? orshinSuugch.toots : [];
  const ijilBaiguullaga = (t) =>
    String(t?.baiguullagiinId || "") === String(baiguullagiinId);
  const ijilBarilga = (t) =>
    !!barilgiinId && String(t?.barilgiinId || "") === String(barilgiinId);

  // Нэг хэрэглэгч олон тооттой байж болно (орон сууц, гараж, агуулах).
  //
  // Тааруулалт нь ЗӨӨЛӨН байх ёстой: `baiguullagiinId`/`barilgiinId` нь зөвхөн
  // OWN_ORG хаяг дээр заавал байдаг бөгөөд WALLET_API хаяг дээр огт байхгүй
  // байж болно. Түүнчлэн sukh нь байгууллага бүрийг ТУСДАА баазад хадгалдаг
  // тул энэ бичлэг дэх бүх хаяг аль хэдийн энэ байгууллагынх — сүүлийн
  // нөөцөөр ямар ч хаягийг авахад аюулгүй.
  const tokhirokh =
    toots.find((t) => ijilBaiguullaga(t) && ijilBarilga(t)) ||
    toots.find(ijilBarilga) ||
    toots.find((t) => ijilBaiguullaga(t) && t?.turul === "Орон сууц") ||
    toots.find(ijilBaiguullaga) ||
    toots.find((t) => t?.turul === "Орон сууц") ||
    toots[0] ||
    null;

  // WALLET_API хаяг дээр дугаар нь `walletDoorNo` талбарт байдаг.
  const toot =
    tokhirokh?.toot || tokhirokh?.walletDoorNo || orshinSuugch.toot || null;

  if (!toot) {
    // Чимээгүй хоосон үлдвэл админ дээр яагаад тоотгүй болсныг олоход бэрх.
    console.warn("[tseverlegee] тоот олдсонгүй:", {
      orshinSuugchiinId: String(orshinSuugchiinId),
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : null,
      tootniiToo: toots.length,
    });
  }

  return { toot, ner: tokhirokh?.ner || orshinSuugch.ner || null };
}

/** Огноог Date болгоно, буруу бол null */
function ognooBolgoyo(utga) {
  if (!utga) return null;
  const ognoo = new Date(utga);
  return Number.isNaN(ognoo.getTime()) ? null : ognoo;
}

/* ─── Оршин суугчийн тал ───────────────────────────────────────────────── */

router.post("/tseverlegee", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      barilgiinId,
      toot,
      orshinSuugchiinId,
      orshinSuugchiinNer,
      uilchilgeeniiTurul,
      utasniiDugaar,
      nemelttMedeelel,
      khusesenOgnoo,
      // `tukhainBaaziinKholbolt`-ыг tokenShalgakh нь обьектоор дарж бичдэг тул
      // аппаас ӨӨР нэрээр авна.
      baaziinNer,
    } = req.body || {};

    const kholbolt = kholboltAvya(res, baiguullagiinId, baaziinNer);
    if (!kholbolt) return;

    if (!utasniiDugaar || !String(utasniiDugaar).trim())
      return res
        .status(400)
        .json({ success: false, message: "Утасны дугаар шаардлагатай" });

    const ognoo = ognooBolgoyo(khusesenOgnoo);
    if (!ognoo)
      return res
        .status(400)
        .json({ success: false, message: "Хүссэн огноо, цаг шаардлагатай" });

    // Өнгөрсөн цаг рүү захиалах нь утгагүй. Цагийн бүсийн бага зэргийн зөрүүг
    // тэвчихийн тулд 5 минутын хүлцэл үлдээв.
    if (ognoo.getTime() < Date.now() - 5 * 60 * 1000)
      return res.status(400).json({
        success: false,
        message: "Өнгөрсөн цаг дээр захиалга үүсгэх боломжгүй",
      });

    const turul = UILCHILGEENII_TURLUUD.includes(uilchilgeeniiTurul)
      ? uilchilgeeniiTurul
      : "Өрхийн цэвэрлэгээ";

    // Тоот, нэрийг серверээс нь баталгаажуулна. Аппын утга нь зөвхөн нөөц —
    // OWN_ORG хэрэглэгчийн тоот нь "OWN_ORG" гэсэн орлуулагч байдаг тул
    // түүнийг хүчингүйд тооцно.
    const serveriinkh = await orshinSuugchiinMedeelel(kholbolt, {
      orshinSuugchiinId,
      baiguullagiinId,
      barilgiinId,
    });
    const appToot = toot && String(toot) !== "OWN_ORG" ? String(toot) : null;
    const jinkheneToot = serveriinkh?.toot || appToot;

    const zakhialga = await Tseverlegee(kholbolt).create({
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : undefined,
      toot: jinkheneToot || undefined,
      orshinSuugchiinId: orshinSuugchiinId
        ? String(orshinSuugchiinId)
        : undefined,
      orshinSuugchiinNer: serveriinkh?.ner || orshinSuugchiinNer,
      uilchilgeeniiTurul: turul,
      utasniiDugaar: String(utasniiDugaar).trim(),
      nemelttMedeelel: nemelttMedeelel
        ? String(nemelttMedeelel).trim()
        : undefined,
      khusesenOgnoo: ognoo,
      tuluv: "Шинэ",
    });

    return res.status(201).json({ success: true, data: zakhialga });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/orshinSuugchiinTseverlegee",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId, orshinSuugchiinId } = req.query || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      if (!orshinSuugchiinId)
        return res.status(400).json({
          success: false,
          message: "orshinSuugchiinId шаардлагатай",
        });

      const jagsaalt = await Tseverlegee(kholbolt)
        .find({
          baiguullagiinId: String(baiguullagiinId),
          orshinSuugchiinId: String(orshinSuugchiinId),
          ustgagdakhEsekh: { $ne: true },
        })
        .sort({ khusesenOgnoo: -1 })
        .lean();

      return res.json({ success: true, data: jagsaalt });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/tseverlegee/:id/tsutsalya",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId, orshinSuugchiinId } = req.body || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      const zakhialga = await Tseverlegee(kholbolt).findById(req.params.id);
      if (!zakhialga || zakhialga.ustgagdakhEsekh)
        return res
          .status(404)
          .json({ success: false, message: "Захиалга олдсонгүй" });

      // Зөвхөн өөрийнхөө захиалгыг цуцална.
      if (String(zakhialga.orshinSuugchiinId) !== String(orshinSuugchiinId))
        return res
          .status(403)
          .json({ success: false, message: "Энэ захиалга таных биш байна" });

      if (["Дууссан", "Цуцалсан"].includes(zakhialga.tuluv))
        return res.status(400).json({
          success: false,
          message: `"${zakhialga.tuluv}" захиалгыг цуцлах боломжгүй`,
        });

      zakhialga.tuluv = "Цуцалсан";
      await zakhialga.save();

      return res.json({ success: true, data: zakhialga });
    } catch (err) {
      next(err);
    }
  },
);

/* ─── Ажилтны тал ──────────────────────────────────────────────────────── */

// `/:id`-аас ӨМНӨ бичигдэх ёстой, эс бөгөөс "toollogo" нь id гэж уншигдана.
router.get(
  "/tseverlegee/toollogo",
  tseverlegeeKhandalt,
  async (req, res, next) => {
    try {
      const { barilgiinId } = req.query || {};
      const oldson = await baiguullagaTodorkhoiloyo(req, res);
      if (!oldson) return;
      const { kholbolt, baiguullagiinId } = oldson;

      const shuult = {
        baiguullagiinId,
        ustgagdakhEsekh: { $ne: true },
      };
      if (barilgiinId) shuult.barilgiinId = String(barilgiinId);

      const bulgeluud = await Tseverlegee(kholbolt).aggregate([
        { $match: shuult },
        { $group: { _id: "$tuluv", too: { $sum: 1 } } },
      ]);

      // Бүх төлвийг 0-ээр эхлүүлнэ — фронт дээр байхгүй түлхүүр шалгахгүй.
      const toollogo = TULUVUUD.reduce((dun, tuluv) => {
        dun[tuluv] = 0;
        return dun;
      }, {});
      bulgeluud.forEach((b) => {
        if (b._id in toollogo) toollogo[b._id] = b.too;
      });
      toollogo.niit = bulgeluud.reduce((d, b) => d + b.too, 0);

      return res.json({ success: true, data: toollogo });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/tseverlegee", tseverlegeeKhandalt, async (req, res, next) => {
  try {
    const {
      barilgiinId,
      tuluv,
      search,
      ekhlekhOgnoo,
      duusakhOgnoo,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 50,
    } = req.query || {};

    const oldson = await baiguullagaTodorkhoiloyo(req, res);
    if (!oldson) return;
    const { kholbolt, baiguullagiinId } = oldson;

    const shuult = {
      baiguullagiinId,
      ustgagdakhEsekh: { $ne: true },
    };
    if (barilgiinId) shuult.barilgiinId = String(barilgiinId);
    if (tuluv) shuult.tuluv = tuluv;

    const ekhlekh = ognooBolgoyo(ekhlekhOgnoo);
    const duusakh = ognooBolgoyo(duusakhOgnoo);
    if (ekhlekh || duusakh) {
      shuult.khusesenOgnoo = {};
      if (ekhlekh) shuult.khusesenOgnoo.$gte = ekhlekh;
      if (duusakh) shuult.khusesenOgnoo.$lte = duusakh;
    }

    if (search && String(search).trim()) {
      // Хэрэглэгчийн бичсэн текстийг regex болгохын өмнө тусгай тэмдэгтийг нь
      // мулт болгоно — эс бөгөөс "(" гэх мэт нь query-г унагана.
      const tseverkhen = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(tseverkhen, "i");
      shuult.$or = [
        { orshinSuugchiinNer: rx },
        { utasniiDugaar: rx },
        { toot: rx },
        { nemelttMedeelel: rx },
      ];
    }

    const khuudas = Math.max(1, Number(khuudasniiDugaar) || 1);
    const khemjee = Math.min(200, Math.max(1, Number(khuudasniiKhemjee) || 50));

    const Model = Tseverlegee(kholbolt);
    const [jagsaalt, niitMur] = await Promise.all([
      Model.find(shuult)
        .sort({ khusesenOgnoo: -1 })
        .skip((khuudas - 1) * khemjee)
        .limit(khemjee)
        .lean(),
      Model.countDocuments(shuult),
    ]);

    return res.json({
      success: true,
      data: {
        jagsaalt,
        khuudasniiDugaar: khuudas,
        khuudasniiKhemjee: khemjee,
        niitMur,
        niitKhuudas: Math.ceil(niitMur / khemjee),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/tseverlegee/:id", tseverlegeeKhandalt, async (req, res, next) => {
  try {
    const oldson = await baiguullagaTodorkhoiloyo(req, res);
    if (!oldson) return;
    const { kholbolt } = oldson;

    const zakhialga = await Tseverlegee(kholbolt).findById(req.params.id).lean();
    if (!zakhialga || zakhialga.ustgagdakhEsekh)
      return res
        .status(404)
        .json({ success: false, message: "Захиалга олдсонгүй" });

    return res.json({ success: true, data: zakhialga });
  } catch (err) {
    next(err);
  }
});

router.put("/tseverlegee/:id", tseverlegeeKhandalt, async (req, res, next) => {
  try {
    const {
      tuluv,
      guitsetgegchiinId,
      guitsetgegchiinNer,
      ajiltniiTailbar,
      khusesenOgnoo,
    } = req.body || {};

    const oldson = await baiguullagaTodorkhoiloyo(req, res);
    if (!oldson) return;
    const { kholbolt } = oldson;

    const uurchlult = {};

    if (tuluv !== undefined) {
      if (!TULUVUUD.includes(tuluv))
        return res
          .status(400)
          .json({ success: false, message: `"${tuluv}" төлөв байхгүй` });
      uurchlult.tuluv = tuluv;
    }

    if (guitsetgegchiinId !== undefined)
      uurchlult.guitsetgegchiinId = guitsetgegchiinId || undefined;
    if (guitsetgegchiinNer !== undefined)
      uurchlult.guitsetgegchiinNer = guitsetgegchiinNer || undefined;
    if (ajiltniiTailbar !== undefined)
      uurchlult.ajiltniiTailbar = ajiltniiTailbar || undefined;

    if (khusesenOgnoo !== undefined) {
      const ognoo = ognooBolgoyo(khusesenOgnoo);
      if (!ognoo)
        return res
          .status(400)
          .json({ success: false, message: "Огноо буруу байна" });
      uurchlult.khusesenOgnoo = ognoo;
    }

    if (!Object.keys(uurchlult).length)
      return res
        .status(400)
        .json({ success: false, message: "Өөрчлөх утга алга" });

    const zakhialga = await Tseverlegee(kholbolt).findOneAndUpdate(
      { _id: req.params.id, ustgagdakhEsekh: { $ne: true } },
      { $set: uurchlult },
      { new: true, runValidators: true },
    );

    if (!zakhialga)
      return res
        .status(404)
        .json({ success: false, message: "Захиалга олдсонгүй" });

    return res.json({ success: true, data: zakhialga });
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/tseverlegee/:id",
  tseverlegeeKhandalt,
  async (req, res, next) => {
    try {
      const oldson = await baiguullagaTodorkhoiloyo(req, res);
      if (!oldson) return;
      const { kholbolt } = oldson;

      // Зөөлөн устгал — тайлан, түүхэнд мөр нь үлдэнэ.
      const zakhialga = await Tseverlegee(kholbolt).findByIdAndUpdate(
        req.params.id,
        { $set: { ustgagdakhEsekh: true } },
        { new: true },
      );

      if (!zakhialga)
        return res
          .status(404)
          .json({ success: false, message: "Захиалга олдсонгүй" });

      return res.json({ success: true, data: { _id: zakhialga._id } });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
