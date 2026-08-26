/**
 * Гадаа наалтын QR-аар зогсоолын төлбөр төлөх (нэвтрэлтгүй) endpoint-ууд.
 *
 * QR уншуулсан хүн хоёр сонголттой:
 *   1. "Өөрөө төлөх"      - QPay-ээр төлнө. Энэ нь одоо байгаа /qpayGargaya
 *                            (turul: "QRGadaa") + /qpaycallbackGadaaSticker
 *                            гэсэн замаар явна, энд шинэ юм хэрэггүй.
 *   2. "Байрны эзэн төлөх" - тоотоо бичихэд тухайн гэрээний авлагад төлбөр
 *                            бичигдэж, зогсоолын session төлөгдсөн болно.
 *
 * Машины session-ыг хайх нь одоо байгаа нэвтрэлтгүй
 * GET /v1/search_car/:plate_number?baiguullagiinId=&barilgiinId=&freeze=true
 * -аар явна.
 *
 * ЖИЧ: замд "tokhirgoo" гэсэн үг ХЭРЭГЛЭЖ БОЛОХГҮЙ - index.js дээрх
 * exploit-bot шүүлтүүр (tokhirgoo.env-ийг хамгаалдаг) URL-д тэр тэмдэгт
 * орсон бүх хүсэлтийг handler хүртэл хүргэлгүй хоосон 404-ээр тасалдаг.
 *
 * Хамгаалалт: эдгээр endpoint нэвтрэлтгүй тул
 *   - дүнг клиентээс АВАХГҮЙ, серверт дахин бодно,
 *   - зөвхөн зогсоол дээр байгаа, төлөгдөөгүй session-д л бичнэ,
 *   - тоотыг зөвхөн ЯГ таарсан үед л зөвшөөрнө (жагсаалт гаргаж өгөхгүй).
 */

const express = require("express");
const router = express.Router();
const {
  Parking,
  Uilchluulegch,
  zogsooliinDunAvya,
} = require("sukhParking-v1");

const Geree = require("../models/geree");
const guilgeeService = require("../services/guilgeeService");
const { tulburUridchiljTulukh } = require("../controller/zogsool");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/** Нэрийг бүтнээр нь нийтийн хуудсанд гаргахгүй - зөвхөн танихад хүрэлцэхүйц */
function nerKhuraangui(ovog, ner) {
  const o = String(ovog || "").trim();
  const n = String(ner || "").trim();
  if (!o && !n) return "";
  const terguun = o ? `${o.charAt(0)}.` : "";
  if (!n) return terguun;
  return `${terguun}${n.charAt(0)}${n.length > 1 ? "*".repeat(Math.min(n.length - 1, 5)) : ""}`;
}

/**
 * Зогсоолыг олно.
 *
 * Нэг барилгад хэд хэдэн зогсоол (гадаа/дотор) байж болно. Иймд zogsooliinId
 * дамжуулсан бол ЯГ түүнийг авна - эс тэгвээс буруу зогсоолын данс руу төлбөр
 * явуулах эрсдэлтэй. zogsooliinId байхгүй үед хамгийн эртнийхийг тогтвортой
 * (үргэлж ижил) сонгоно.
 */
async function zogsoolOlyo(kholbolt, baiguullagiinId, barilgiinId, zogsooliinId) {
  if (zogsooliinId) {
    const zogsool = await Parking(kholbolt).findOne({ _id: zogsooliinId });
    // Дамжуулсан зогсоол өөр байгууллагад хамаарах бол хүлээж авахгүй
    if (
      zogsool &&
      String(zogsool.baiguullagiinId) === String(baiguullagiinId)
    )
      return zogsool;
    return null;
  }
  return Parking(kholbolt)
    .findOne({
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: String(barilgiinId),
    })
    .sort({ createdAt: 1 });
}

/**
 * GET /zogsool/qr/medeelel/:baiguullagiinId/:barilgiinId
 *
 * Нийтийн QR хуудсыг зурахад хэрэгтэй ХАМГИЙН БАГА мэдээлэл.
 * Зогсоолын бүтэн бичлэгийг нэвтрэлтгүй гаргах нь зохимжгүй тул
 * зөвхөн шаардлагатай талбаруудыг буцаана.
 */
router.get(
  "/zogsool/qr/medeelel/:baiguullagiinId/:barilgiinId",
  async (req, res, next) => {
    try {
      const { baiguullagiinId, barilgiinId } = req.params;
      // Машиныг олсны дараа тухайн машины БОДИТ зогсоолын тохиргоог (данс,
      // гарах хугацаа) авахын тулд zogsooliinId-аар дахин дуудаж болно.
      const { zogsooliinId } = req.query;
      const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
      if (!kholbolt)
        return res
          .status(404)
          .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });

      const zogsool = await zogsoolOlyo(
        kholbolt,
        baiguullagiinId,
        barilgiinId,
        zogsooliinId,
      );
      if (!zogsool)
        return res
          .status(404)
          .json({ success: false, message: "Зогсоол олдсонгүй" });

      return res.json({
        success: true,
        data: {
          _id: String(zogsool._id),
          ner: zogsool.ner || "",
          garakhTsag: zogsool.garakhTsag || 30,
          undsenUne: zogsool.undsenUne || 0,
          zogsooliinDans: zogsool.zogsooliinDans || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /zogsool/qr/tootShalgaya
 * { baiguullagiinId, barilgiinId, toot }
 *
 * Тоотоор ЯГ таарсан нэг л ACTIVE гэрээ олдвол зөвшөөрнө. Жагсаалт гаргаж
 * өгөхгүй - ингэснээр нийтийн хуудсаар оршин суугчдын нэрийг тоолж авах
 * боломжгүй болно.
 */
router.post("/zogsool/qr/tootShalgaya", async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, toot } = req.body || {};
    if (!baiguullagiinId || !barilgiinId || !toot)
      return res.status(400).json({
        success: false,
        message: "baiguullagiinId, barilgiinId, toot шаардлагатай",
      });

    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    if (!kholbolt)
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });

    const gereenuud = await Geree(kholbolt)
      .find({
        baiguullagiinId: String(baiguullagiinId),
        barilgiinId: String(barilgiinId),
        tuluv: "ACTIVE",
        ustgagdakhEsekh: { $ne: true },
        toot: String(toot).trim(),
      })
      .select("_id gereeniiDugaar toot ovog ner")
      .limit(5)
      .lean();

    if (!gereenuud.length)
      return res
        .status(404)
        .json({ success: false, message: "Тухайн тоот олдсонгүй" });

    if (gereenuud.length > 1)
      return res.status(409).json({
        success: false,
        message:
          "Тухайн тоотод хэд хэдэн гэрээ байна. Ажилтанд хандана уу.",
      });

    const geree = gereenuud[0];
    return res.json({
      success: true,
      data: {
        gereeniiId: String(geree._id),
        gereeniiDugaar: geree.gereeniiDugaar || "",
        toot: geree.toot || "",
        nerKhuraangui: nerKhuraangui(geree.ovog, geree.ner),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /zogsool/qr/ezenTulukh
 * { baiguullagiinId, barilgiinId, zogsooliinId, uilchluulegchiinId,
 *   gereeniiId, mashiniiDugaar, cameraIP }
 *
 * Зогсоолын төлбөрийг байрны эзний авлагад бичиж, session-ыг төлөгдсөн
 * болгоно. Дүнг клиентээс НЬ АВАХГҮЙ - серверт zogsooliinDunAvya-аар
 * дахин бодож, түүгээр авлага үүсгэнэ.
 */
router.post("/zogsool/qr/ezenTulukh", async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      barilgiinId,
      zogsooliinId,
      uilchluulegchiinId,
      gereeniiId,
      mashiniiDugaar,
      cameraIP,
      kharuulsanDun,
    } = req.body || {};

    if (!baiguullagiinId || !uilchluulegchiinId || !gereeniiId)
      return res.status(400).json({
        success: false,
        message:
          "baiguullagiinId, uilchluulegchiinId, gereeniiId шаардлагатай",
      });

    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    if (!kholbolt)
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });

    const zogsool = await zogsoolOlyo(
      kholbolt,
      baiguullagiinId,
      barilgiinId,
      zogsooliinId,
    );
    if (!zogsool)
      return res
        .status(404)
        .json({ success: false, message: "Зогсоол олдсонгүй" });

    const uilchluulegch = await Uilchluulegch(kholbolt, true).findOne({
      _id: uilchluulegchiinId,
      "tuukh.0.zogsooliinId": zogsool._id,
    });
    if (!uilchluulegch)
      return res
        .status(404)
        .json({ success: false, message: "Машины мэдээлэл олдсонгүй" });

    // Клиентээс ирсэн дугаар session-тэй таарах ёстой (өөр машины session-д
    // бичихээс сэргийлнэ)
    if (
      mashiniiDugaar &&
      String(mashiniiDugaar).trim().toUpperCase() !==
        String(uilchluulegch.mashiniiDugaar || "").trim().toUpperCase()
    )
      return res
        .status(400)
        .json({ success: false, message: "Машины дугаар таарахгүй байна" });

    // Аль хэдийн төлөгдсөн бол дахин бичихгүй (давхар авлагаас хамгаална)
    const tulsunTuukh = uilchluulegch.tuukh?.[0]?.tulbur || [];
    if (tulsunTuukh.length > 0)
      return res.status(409).json({
        success: false,
        message: "Тухайн машины төлбөр аль хэдийн төлөгдсөн байна",
      });

    // Дүнг серверт дахин бодно
    const dun = await zogsooliinDunAvya(zogsool, uilchluulegch, kholbolt);
    if (!(Number(dun) > 0))
      return res.status(400).json({
        success: false,
        message: "Тухайн машинд төлбөр бодогдоогүй байна",
      });

    // Дэлгэц дээр харуулсан дүнгээс зөрсөн бол (хүлээх хугацаанд төлбөр
    // нэмэгдсэн) шинэ дүнг буцааж дахин батлуулна - хүнийг гэнэтийн дүнгээр
    // нэхэмжлэхгүй.
    if (kharuulsanDun != null && Math.abs(Number(kharuulsanDun) - Number(dun)) > 1)
      return res.status(409).json({
        success: false,
        message: "Төлбөр өөрчлөгдсөн байна. Шинэ дүнг батлана уу.",
        code: "DUN_ZURUU",
        data: { dun: Number(dun) },
      });

    const geree = await Geree(kholbolt).findById(gereeniiId).lean();
    if (!geree)
      return res
        .status(404)
        .json({ success: false, message: "Гэрээ олдсонгүй" });
    if (String(geree.baiguullagiinId) !== String(baiguullagiinId))
      return res
        .status(403)
        .json({ success: false, message: "Гэрээ энэ байгууллагад хамаарахгүй" });

    // 1. Эзний авлагад бичих
    const charge = await guilgeeService.recordCharge(kholbolt, {
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : geree.barilgiinId,
      gereeniiId: String(geree._id),
      gereeniiDugaar: geree.gereeniiDugaar,
      orshinSuugchId: geree.orshinSuugchiinId
        ? String(geree.orshinSuugchiinId)
        : undefined,
      toot: geree.toot,
      ognoo: new Date(),
      dun: Number(dun),
      turul: "Авлага",
      zardliinTurul: "Зогсоол",
      zardliinNer: "Зогсоолын төлбөр",
      tailbar: `Зогсоол ${uilchluulegch.mashiniiDugaar} - гадаа QR`,
      nemeltTailbar: `Зогсоолын session ${uilchluulegchiinId}`,
      source: "zogsool",
      nekhemjlekhDeerKharagdakh: true,
    });

    // 2. Зогсоолын session-ыг төлөгдсөн болгох.
    //    tulburUridchiljTulukh алдаа гарвал дотроо next(err) дууддаг тул
    //    express-ийн next-ийг өгөхгүй - эс тэгвээс давхар хариу явна.
    let sessionAldaa = null;
    const durslel = await tulburUridchiljTulukh(
      {
        tukhainBaaziinKholbolt: kholbolt,
        turul: "EzenTulukh",
        uilchluulegchiinId: String(uilchluulegchiinId),
        paid_amount: Number(dun),
        plate_number: uilchluulegch.mashiniiDugaar,
        barilgiinId: barilgiinId ? String(barilgiinId) : geree.barilgiinId,
        ajiltniiNer: "gadaaQrEzen",
        zogsooliinId: String(zogsool._id),
      },
      (err) => {
        sessionAldaa = err;
      },
    );
    if (sessionAldaa)
      console.error(
        "❌ [ZOGSOOL QR EZEN] session шинэчлэхэд алдаа:",
        sessionAldaa.message,
      );

    // 3. Хаалга онгойлгох (гадаа камерын IP байвал)
    const garakhKhaalga =
      uilchluulegch.tuukh?.[0]?.garsanKhaalga || cameraIP || null;
    if (garakhKhaalga && garakhKhaalga !== "dotor") {
      const io = req.app.get("socketio");
      if (io)
        io.emit(`qpayMobileSdk${baiguullagiinId}${garakhKhaalga}`, {
          baiguullagiinId: String(baiguullagiinId),
          khaalgaTurul: "Гарах",
          turul: "qpayMobile",
          mashiniiDugaar: uilchluulegch.mashiniiDugaar,
          cameraIP: garakhKhaalga,
          uilchluulegchiinId: String(uilchluulegchiinId),
        });
    }

    console.log(
      `✅ [ZOGSOOL QR EZEN] ${uilchluulegch.mashiniiDugaar} - ${dun}₮ гэрээ ${geree.gereeniiDugaar} (${geree.toot}) авлагад бичигдлээ`,
    );

    return res.json({
      success: true,
      message: "Amjilttai",
      data: {
        dun: Number(dun),
        guilgeeniiId: charge?._id ? String(charge._id) : null,
        nekhemjlekhId: charge?.nekhemjlekhId || null,
        toot: geree.toot,
        gereeniiDugaar: geree.gereeniiDugaar,
        sessionTuluv: durslel,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
