const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { db, tokenShalgakh } = require("zevbackv2");

const ZochinZogsooliinTuukh = require("../models/zochinZogsooliinTuukh");
const OrshinSuugch = require("../models/orshinSuugch");
const Geree = require("../models/geree");
const guilgeeService = require("../services/guilgeeService");
const tureesParkingService = require("../services/tureesParkingService");
const {
  getKholboltByBaiguullagiinId,
} = require("../utils/dbConnection");
const {
  orshinSuugchidSonorduulgaIlgeeye,
} = require("../controller/appNotification");
const { tokhirgooAvya } = require("../tokhirgoo/tureesKalituud");

/** Гарын үсгийн зөрүү зөвшөөрөх хугацаа (replay-ээс хамгаална) */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * tureesBack-ээс ирсэн webhook-ийн HMAC гарын үсгийг шалгах.
 * Түрээс тал `${timestamp}.${JSON.stringify(body)}` дээр HMAC-SHA256 тавьдаг.
 */
function garinUsegShalgaya(req) {
  // Нууц нь БАЙГУУЛЛАГА ТУС БҮРЭЭР tokhirgoo/tureesKalituud.js дээр байна.
  // Байгууллагыг body-гоос авна - гарын үсэг таарахгүй бол ямар ч байсан
  // татгалзах тул body-д итгэсэн болохгүй (зөвхөн нууцыг сонгоход хэрэглэнэ).
  const orgId = req.body && req.body.amarSukhBaiguullagiinId;
  if (!orgId)
    return { ok: false, message: "amarSukhBaiguullagiinId байхгүй" };

  const tokhirgoo = tokhirgooAvya(orgId);
  const secret = tokhirgoo && tokhirgoo.webhookSecret;
  if (!secret)
    return {
      ok: false,
      message: `${orgId} байгууллагын webhookSecret тохируулаагүй`,
    };

  const irsen = req.headers["x-zochin-signature"];
  const timestamp = req.headers["x-zochin-timestamp"];

  if (!irsen || !timestamp)
    return { ok: false, message: "Гарын үсэг эсвэл timestamp байхгүй" };

  const zuruu = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(zuruu) || zuruu > TIMESTAMP_TOLERANCE_MS)
    return { ok: false, message: "Timestamp хүчингүй болсон" };

  const payload = req.rawBody || JSON.stringify(req.body);
  const khuleegdej = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  // Урт зөрүүг ч нуухын тулд хэшлээд харьцуулна
  const hashA = crypto.createHash("sha256").update(String(irsen)).digest();
  const hashB = crypto.createHash("sha256").update(khuleegdej).digest();
  if (!crypto.timingSafeEqual(hashA, hashB))
    return { ok: false, message: "Гарын үсэг таарахгүй" };

  return { ok: true };
}

/**
 * POST /zochin/zogsool/webhook
 *
 * Түрээсийн зогсоолын систем зочны машин ОРОХ/ГАРАХ үед залгана.
 * Гарах үед төлбөрийг эзний нэхэмжлэхэд бичих сонголттой байвал авлага
 * үүсгээд `pay_type: "post_pay"` + `bill_id` буцаана - түрээс тал үүнийг
 * төлөгдсөнөөр тэмдэглэж хаалгыг онгойлгоно.
 */
router.post("/zochin/zogsool/webhook", async (req, res, next) => {
  try {
    const shalgalt = garinUsegShalgaya(req);
    if (!shalgalt.ok) {
      console.warn("⚠️ [ZOCHIN-WEBHOOK] Татгалзав:", shalgalt.message);
      return res.status(401).json({ success: false, message: shalgalt.message });
    }

    const {
      turul,
      amarSukhUrilgiinId,
      amarSukhBaiguullagiinId,
      amarSukhBarilgiinId,
      amarSukhOrshinSuugchId,
      amarSukhGereeniiId,
      amarSukhToot,
      tulburiinTurul,
      uilchluulegchId,
      mashiniiDugaar,
      zogsooliinId,
      orsonKhaalga,
      garsanKhaalga,
      orsonTsag,
      garsanTsag,
      niitKhugatsaa,
      uneguiMinutAshiglasan,
      uneguiMinutUldsen,
      tulukhDun,
      niitDun,
    } = req.body || {};

    if (!uilchluulegchId || !amarSukhBaiguullagiinId || !mashiniiDugaar) {
      return res.status(400).json({
        success: false,
        message: "uilchluulegchId, amarSukhBaiguullagiinId, mashiniiDugaar шаардлагатай",
      });
    }

    const kholbolt =
      getKholboltByBaiguullagiinId(amarSukhBaiguullagiinId) || db.erunkhiiKholbolt;
    const TuukhModel = ZochinZogsooliinTuukh(kholbolt);

    const suuriData = {
      urilgiinId: amarSukhUrilgiinId ? String(amarSukhUrilgiinId) : undefined,
      uilchluulegchId: String(uilchluulegchId),
      baiguullagiinId: String(amarSukhBaiguullagiinId),
      barilgiinId: amarSukhBarilgiinId ? String(amarSukhBarilgiinId) : undefined,
      orshinSuugchId: amarSukhOrshinSuugchId
        ? String(amarSukhOrshinSuugchId)
        : undefined,
      gereeniiId: amarSukhGereeniiId ? String(amarSukhGereeniiId) : undefined,
      toot: amarSukhToot,
      mashiniiDugaar,
      zogsooliinId,
      orsonKhaalga,
      orsonTsag: orsonTsag ? new Date(orsonTsag) : undefined,
      uneguiMinutAshiglasan,
      uneguiMinutUldsen,
      tulburiinTurul: tulburiinTurul || "zochin",
      tuluv: turul === "garakh" ? 2 : 1,
    };

    if (turul === "garakh") {
      suuriData.garsanKhaalga = garsanKhaalga;
      suuriData.garsanTsag = garsanTsag ? new Date(garsanTsag) : undefined;
      suuriData.niitKhugatsaa = niitKhugatsaa;
      suuriData.tulukhDun = Number(tulukhDun) || 0;
      suuriData.niitDun = Number(niitDun) || 0;
    }

    // Идемпотент: ижил session дахин ирвэл шинэчилнэ
    let tuukh = await TuukhModel.findOneAndUpdate(
      {
        baiguullagiinId: String(amarSukhBaiguullagiinId),
        uilchluulegchId: String(uilchluulegchId),
      },
      { $set: suuriData },
      { upsert: true, new: true }
    );

    let billId = null;
    let payType = null;

    if (
      turul === "garakh" &&
      tulburiinTurul === "ezen" &&
      Number(tulukhDun) > 0
    ) {
      // Аль хэдийн авлага үүсгэсэн бол дахин үүсгэхгүй (давхар бичилтээс хамгаална)
      if (tuukh.guilgeeniiId) {
        billId = tuukh.guilgeeniiId;
        payType = "post_pay";
      } else if (!amarSukhGereeniiId) {
        console.error(
          "❌ [ZOCHIN-WEBHOOK] tulburiinTurul=ezen боловч amarSukhGereeniiId байхгүй - авлага үүсгэсэнгүй"
        );
      } else {
        const gereeObj = await Geree(kholbolt)
          .findById(amarSukhGereeniiId)
          .lean()
          .catch(() => null);

        if (!gereeObj) {
          console.error(
            `❌ [ZOCHIN-WEBHOOK] Гэрээ олдсонгүй: ${amarSukhGereeniiId} - авлага үүсгэсэнгүй`
          );
        } else {
          const charge = await guilgeeService.recordCharge(kholbolt, {
            baiguullagiinId: String(amarSukhBaiguullagiinId),
            barilgiinId: amarSukhBarilgiinId
              ? String(amarSukhBarilgiinId)
              : gereeObj.barilgiinId,
            gereeniiId: String(amarSukhGereeniiId),
            gereeniiDugaar: gereeObj.gereeniiDugaar,
            orshinSuugchId: amarSukhOrshinSuugchId
              ? String(amarSukhOrshinSuugchId)
              : gereeObj.orshinSuugchId,
            toot: amarSukhToot || gereeObj.toot,
            ognoo: garsanTsag ? new Date(garsanTsag) : new Date(),
            dun: Number(tulukhDun),
            turul: "Авлага",
            zardliinTurul: "Зогсоол",
            zardliinNer: "Зочны зогсоолын төлбөр",
            tailbar: `Зочин ${mashiniiDugaar} - зогсоолын төлбөр`,
            nemeltTailbar: `Түрээсийн зогсоол / session ${uilchluulegchId}`,
            source: "zogsool",
            nekhemjlekhDeerKharagdakh: true,
          });

          if (charge && charge._id) {
            billId = String(charge._id);
            payType = "post_pay";
            tuukh = await TuukhModel.findByIdAndUpdate(
              tuukh._id,
              {
                $set: {
                  guilgeeniiId: billId,
                  nekhemjlekhId: charge.nekhemjlekhId,
                },
              },
              { new: true }
            );
            console.log(
              `✅ [ZOCHIN-WEBHOOK] Зочны зогсоолын төлбөр нэхэмжлэхэд бичигдлээ: ${tulukhDun}₮ geree=${amarSukhGereeniiId} bill=${billId}`
            );
          }
        }
      }
    }

    // Оршин суугчид мэдэгдэх (алдаа гарсан ч webhook-ийг унагахгүй)
    sonorduulyaTry({ req, kholbolt, tuukh, turul, mashiniiDugaar, tulukhDun });

    return res.json({
      success: true,
      message: "Amjilttai",
      data: {
        uilchluulegchId,
        tuluv: tuukh.tuluv,
        pay_type: payType,
        bill_id: billId,
      },
    });
  } catch (error) {
    console.error("❌ [ZOCHIN-WEBHOOK] Алдаа:", error.message);
    next(error);
  }
});

/** Оршин суугчид апп/socket-оор мэдэгдэх - хэзээ ч throw хийхгүй */
function sonorduulyaTry({
  req,
  kholbolt,
  tuukh,
  turul,
  mashiniiDugaar,
  tulukhDun,
}) {
  (async () => {
    try {
      const io = req.app.get("socketio");
      if (io && tuukh.orshinSuugchId) {
        io.emit(`orshinSuugch${tuukh.orshinSuugchId}`, {
          type: turul === "garakh" ? "ZOCHIN_GARSAN" : "ZOCHIN_ORSON",
          message:
            turul === "garakh"
              ? `Зочин ${mashiniiDugaar} зогсоолоос гарлаа`
              : `Зочин ${mashiniiDugaar} зогсоолд орлоо`,
          data: tuukh,
        });
      }

      if (!tuukh.orshinSuugchId) return;

      const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
        .findById(tuukh.orshinSuugchId)
        .select("firebaseToken")
        .lean();

      if (!orshinSuugch || !orshinSuugch.firebaseToken) return;

      const body =
        turul === "garakh"
          ? Number(tulukhDun) > 0 && tuukh.tulburiinTurul === "ezen"
            ? `${mashiniiDugaar} зогсоолоос гарлаа. ${Number(
                tulukhDun
              ).toLocaleString()}₮ нэхэмжлэхэд бичигдлээ.`
            : `${mashiniiDugaar} зогсоолоос гарлаа.`
          : `${mashiniiDugaar} зогсоолд орлоо.`;

      await orshinSuugchidSonorduulgaIlgeeye(orshinSuugch.firebaseToken, {
        title: "Зочны зогсоол",
        body,
      });
    } catch (err) {
      console.error("⚠️ [ZOCHIN-WEBHOOK] Сонордуулга илгээхэд алдаа:", err.message);
    }
  })();
}

/**
 * GET /zochin/zogsool/tuukh
 * Оршин суугч / ажилтны вэб дээр зочны зогсоолын хөдөлгөөнийг харах.
 */
router.get("/zochin/zogsool/tuukh", tokenShalgakh, async (req, res, next) => {
  try {
    const token = req.body.nevtersenAjiltniiToken || {};

    // Webhook нь тухайн байгууллагын холболт руу бичдэг тул УНШИХдаа ч мөн
    // тэр холболтоор л уншина. GET хүсэлтэд body байхгүй (апп query-ээр
    // ирдэг) тул baiguullagiinId-гаас холболтыг эхлээд шийднэ - эс тэгвэл
    // өөрийн баазтай байгууллагын бичлэг олдохгүй хоосон буцна.
    const orgId = req.query.baiguullagiinId || token.baiguullagiinId;
    const kholbolt =
      getKholboltByBaiguullagiinId(orgId) ||
      req.body.tukhainBaaziinKholbolt ||
      db.erunkhiiKholbolt;

    const query = {};
    if (req.query.baiguullagiinId)
      query.baiguullagiinId = String(req.query.baiguullagiinId);
    if (req.query.barilgiinId)
      query.barilgiinId = String(req.query.barilgiinId);
    if (req.query.urilgiinId) query.urilgiinId = String(req.query.urilgiinId);
    if (req.query.mashiniiDugaar)
      query.mashiniiDugaar = String(req.query.mashiniiDugaar)
        .trim()
        .toUpperCase();

    // Олон дугаараар нэг дор (вэб дээр харагдаж буй мөрүүдийн дугаарууд).
    // Ингэснээр бүх түүхийг татаж клиент дээр шүүхгүй - яг хэрэгтэйг нь авна.
    if (req.query.mashiniiDugaaruud) {
      const dugaaruud = String(req.query.mashiniiDugaaruud)
        .split(",")
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);
      if (dugaaruud.length) query.mashiniiDugaar = { $in: dugaaruud };
    }

    // Огнооны завсар - хуудасны шүүлттэй ижил хугацааг харуулахад
    if (req.query.start || req.query.end) {
      query.createdAt = {};
      if (req.query.start) query.createdAt.$gte = new Date(req.query.start);
      if (req.query.end) {
        const tugsgul = new Date(req.query.end);
        // Зөвхөн огноо ирвэл тухайн өдрийн төгсгөл хүртэл хамруулна
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end)))
          tugsgul.setHours(23, 59, 59, 999);
        query.createdAt.$lte = tugsgul;
      }
    }

    // Оршин суугч зөвхөн өөрийн уригсан зочдыг харна
    if (token.erkh === "OrshinSuugch") {
      query.orshinSuugchId = String(token.id);
    } else if (req.query.orshinSuugchId) {
      query.orshinSuugchId = String(req.query.orshinSuugchId);
    }

    const page = parseInt(req.query.khuudasniiDugaar) || 1;
    const limit = Math.min(parseInt(req.query.khuudasniiKhemjee) || 20, 200);

    const [jagsaalt, niitMur] = await Promise.all([
      ZochinZogsooliinTuukh(kholbolt)
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ZochinZogsooliinTuukh(kholbolt).countDocuments(query),
    ]);

    res.json({ success: true, jagsaalt, niitMur });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /zochin/zogsool/urilgiinTuluv/:urilgiinId
 * Түрээсийн зогсоол дээрх урилгын одоогийн байдлыг шууд асуух
 * (үнэгүй минут хэд үлдсэн гэх мэт).
 */
router.get(
  "/zochin/zogsool/urilgiinTuluv/:urilgiinId",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const baiguullagiinId =
        req.query.baiguullagiinId ||
        (req.body.nevtersenAjiltniiToken || {}).baiguullagiinId;

      if (!baiguullagiinId)
        return res
          .status(400)
          .json({ success: false, message: "baiguullagiinId шаардлагатай" });

      const khariu = await tureesParkingService.urilgaAvya({
        amarSukhBaiguullagiinId: baiguullagiinId,
        amarSukhUrilgiinId: req.params.urilgiinId,
      });

      res.json(khariu);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Оршин суугчийг админы тохиргооны endpoint-уудаас хориглох.
 * Барилгын холбоос тохируулах нь ажилтны эрх.
 */
function zovkhonAjiltan(req, res, next) {
  const token = req.body.nevtersenAjiltniiToken || {};
  if (token.erkh === "OrshinSuugch") {
    return res
      .status(403)
      .json({ success: false, message: "Танд энэ үйлдлийг хийх эрх байхгүй!" });
  }
  next();
}

/**
 * GET /zochin/zogsool/tureesBaiguullaga
 *
 * Түрээсийн байгууллага -> барилга -> зогсоолын бүтцийг татаж харуулна.
 * Админ вэб дээр "манай барилгыг аль түрээсийн зогсоолтой холбох"
 * гэдгийг dropdown-оор сонгуулахад хэрэглэнэ - ID-г бааз дундуур хайх
 * шаардлагагүй болно.
 */
router.get(
  "/zochin/zogsool/tureesBaiguullaga",
  tokenShalgakh,
  zovkhonAjiltan,
  async (req, res, next) => {
    try {
      const baiguullagiinId =
        req.query.baiguullagiinId ||
        (req.body.nevtersenAjiltniiToken || {}).baiguullagiinId;

      if (!baiguullagiinId)
        return res
          .status(400)
          .json({ success: false, message: "baiguullagiinId шаардлагатай" });

      const khariu = await tureesParkingService.tureesBaiguullagaJagsaalt(
        baiguullagiinId
      );
      res.json(khariu);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /zochin/zogsool/barilgaMap
 * Манай барилгууд түрээстэй хэрхэн холбогдсоныг харах.
 *
 * Холбоос нь түрээс тал дээрх tokhirgoo/zochinKalituud.js дээр байдаг тул
 * зөвхөн УНШИХ - нэмэх/хасах бол тэр файлыг засна.
 */
router.get(
  "/zochin/zogsool/barilgaMap",
  tokenShalgakh,
  zovkhonAjiltan,
  async (req, res, next) => {
    try {
      const baiguullagiinId =
        req.query.baiguullagiinId ||
        (req.body.nevtersenAjiltniiToken || {}).baiguullagiinId;

      if (!baiguullagiinId)
        return res
          .status(400)
          .json({ success: false, message: "baiguullagiinId шаардлагатай" });

      const khariu = await tureesParkingService.barilgaMapAvya(baiguullagiinId);
      res.json(khariu);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
