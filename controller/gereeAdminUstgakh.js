const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const Ajiltan = require("../models/ajiltan");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const { db } = require("zevbackv2");

/**
 * Гэрээний "цуцлагдсан" төлөв.
 *
 * models/geree.js дээрх enum нь ["Идэвхтэй", "Цуцалсан"] боловч тайлан талд
 * "Цуцлагдсан" гэсэн бичлэг ч тааралддаг тул хоёуланг нь цуцлагдсанд тооцно.
 */
const TSUTSALSAN_TULUV = ["Цуцалсан", "Цуцлагдсан"];

const ADMIN_ERKH = ["Admin", "SuperAdmin"];

/**
 * POST /geree/:id/adminUstgakh
 *
 * ГАНЦ цуцлагдсан гэрээг түүний нэхэмжлэх болон гүйлгээ/авлагатай нь хамт
 * устгана. Эзэмшигч (оршин суугч / харилцагч) болон түүний бусад гэрээнд
 * хүрэхгүй — нэг хүн олон гэрээтэй байж, зарим нь идэвхтэй хэвээр байх нь
 * хэвийн тохиолдол.
 *
 * `zovkhonShalgakh: true` үед юу ч устгахгүй, зөвхөн юу устгагдахыг тоолж
 * буцаана.
 */
exports.gereeAdminUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const token = req.body.nevtersenAjiltniiToken;
    if (!token?.id) {
      return res
        .status(401)
        .json({ success: false, message: "Нэвтрэх мэдээлэл олдсонгүй!" });
    }

    // Эрхийг token-оос биш ажилтны бичлэгээс уншина — tokenUusgeye нь `erkh`-ийг
    // token дотор оруулдаггүй.
    const nevtersenAjiltan = await Ajiltan(db.erunkhiiKholbolt)
      .findById(token.id)
      .select("erkh ner baiguullagiinId")
      .lean();

    if (!nevtersenAjiltan || !ADMIN_ERKH.includes(nevtersenAjiltan.erkh)) {
      return res.status(403).json({
        success: false,
        message: "Энэ үйлдлийг зөвхөн админ эрхтэй хэрэглэгч гүйцэтгэнэ.",
      });
    }

    const gereeniiId = req.params.id;
    if (!gereeniiId) {
      return res
        .status(400)
        .json({ success: false, message: "Гэрээний ID шаардлагатай!" });
    }

    const zovkhonShalgakh = req.body.zovkhonShalgakh === true;

    // Гэрээ нь байгууллага тус бүрийн холболтод байдаг. Админы өөрийнх нь
    // байгууллагаас эхлэн хайж, олдохгүй бол бусдаас нь хайна.
    const orgIds = [];
    if (req.body.baiguullagiinId) orgIds.push(String(req.body.baiguullagiinId));
    if (
      nevtersenAjiltan.baiguullagiinId &&
      !orgIds.includes(String(nevtersenAjiltan.baiguullagiinId))
    ) {
      orgIds.push(String(nevtersenAjiltan.baiguullagiinId));
    }

    let conn = null;
    let geree = null;

    for (const orgId of orgIds) {
      const c = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(orgId),
      );
      if (!c) continue;
      const found = await Geree(c).findById(gereeniiId).lean();
      if (found) {
        conn = c;
        geree = found;
        break;
      }
    }

    if (!geree) {
      return res
        .status(404)
        .json({ success: false, message: "Гэрээ олдсонгүй!" });
    }

    // Цуцлагдаагүй гэрээг энэ замаар устгахыг зөвшөөрөхгүй.
    if (!TSUTSALSAN_TULUV.includes(geree.tuluv)) {
      return res.status(400).json({
        success: false,
        message: `Зөвхөн цуцлагдсан гэрээг устгана. Одоогийн төлөв: ${
          geree.tuluv || "тодорхойгүй"
        }.`,
      });
    }

    const gereeniiIdStr = String(geree._id);

    const tootsoo = {
      geree: 1,
      nekhemjlekh: await NekhemjlekhiinTuukh(conn).countDocuments({
        gereeniiId: gereeniiIdStr,
      }),
      guilgeeAvlaga: await GuilgeeAvlaguud(conn).countDocuments({
        gereeniiId: gereeniiIdStr,
      }),
    };

    if (zovkhonShalgakh) {
      return res.status(200).json({
        success: true,
        zovkhonShalgakh: true,
        message: "Устгах боломжтой.",
        geree: {
          _id: geree._id,
          gereeniiDugaar: geree.gereeniiDugaar,
          tuluv: geree.tuluv,
          toot: geree.toot,
        },
        tootsoo,
      });
    }

    // ── Audit эхлээд ────────────────────────────────────────────────────
    const { logDelete } = require("../services/auditService");
    const shaltgaan = "Админ: цуцлагдсан гэрээг авлагатай нь устгасан";
    const context = {
      baiguullagiinId: geree.baiguullagiinId,
      barilgiinId: geree.barilgiinId || null,
    };

    try {
      await logDelete(req, db, "geree", gereeniiIdStr, geree, "hard", shaltgaan, context);

      const nekhemjlekhDocs = await NekhemjlekhiinTuukh(conn)
        .find({ gereeniiId: gereeniiIdStr })
        .lean();
      for (const n of nekhemjlekhDocs) {
        await logDelete(
          req,
          db,
          "nekhemjlekhiinTuukh",
          String(n._id),
          n,
          "hard",
          shaltgaan,
          context,
        );
      }

      const avlagaDocs = await GuilgeeAvlaguud(conn)
        .find({ gereeniiId: gereeniiIdStr })
        .lean();
      for (const a of avlagaDocs) {
        await logDelete(
          req,
          db,
          "guilgeeAvlaguud",
          String(a._id),
          a,
          "hard",
          shaltgaan,
          context,
        );
      }
    } catch (auditErr) {
      // Ул мөргүй устгахаас татгалзана.
      console.error("gereeAdminUstgakh audit error:", auditErr);
      return res.status(500).json({
        success: false,
        message:
          "Устгалын түүх бичихэд алдаа гарлаа. Аюулгүйн үүднээс устгалыг зогсоолоо.",
      });
    }

    // ── Устгах — эхлээд хамаарал, дараа нь гэрээ ────────────────────────
    await GuilgeeAvlaguud(conn).deleteMany({ gereeniiId: gereeniiIdStr });
    await NekhemjlekhiinTuukh(conn).deleteMany({ gereeniiId: gereeniiIdStr });
    await Geree(conn).findByIdAndDelete(gereeniiIdStr);

    res.status(200).json({
      success: true,
      message: "Цуцлагдсан гэрээ болон холбогдох бичлэгүүд устгагдлаа.",
      tootsoo,
    });
  } catch (error) {
    next(error);
  }
});
