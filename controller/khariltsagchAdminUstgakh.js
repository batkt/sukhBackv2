const asyncHandler = require("express-async-handler");
const khariltsagch = require("../models/khariltsagch");
const Geree = require("../models/geree");
const Ajiltan = require("../models/ajiltan");
const OrshinSuugch = require("../models/orshinSuugch");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const aldaa = require("../components/aldaa");
const { db } = require("zevbackv2");

/**
 * Гэрээний "цуцлагдсан" төлөв.
 *
 * models/geree.js дээрх enum нь ["Идэвхтэй", "Цуцалсан"] боловч тайлан талд
 * "Цуцлагдсан" гэсэн бичлэг ч тааралддаг тул хоёуланг нь цуцлагдсанд тооцно.
 */
const TSUTSALSAN_TULUV = ["Цуцалсан", "Цуцлагдсан"];

const ADMIN_ERKH = ["Admin", "SuperAdmin"];

/** Тухайн харилцагчийн холбогдох бүх байгууллагын ID-г цуглуулна. */
function baiguullagiinIdCollect(user) {
  const ids = new Set();
  if (user.baiguullagiinId) ids.add(String(user.baiguullagiinId));
  if (Array.isArray(user.toots)) {
    user.toots.forEach((t) => {
      if (t.baiguullagiinId) ids.add(String(t.baiguullagiinId));
    });
  }
  return [...ids];
}

/**
 * POST /khariltsagch/:id/adminUstgakh
 *
 * Зөвхөн ЦУЦЛАГДСАН гэрээтэй харилцагчийг админ эрхээр бүрмөсөн устгана.
 * Дагалдан устгах зүйлс (байгууллага тус бүрийн холболтоос):
 *   - geree
 *   - nekhemjlekhiinTuukh (тухайн гэрээнүүдийн нэхэмжлэх)
 *   - guilgeeAvlaguud     (тухайн гэрээнүүдийн гүйлгээ/авлага)
 *
 * `zovkhonShalgakh: true` дамжуулбал юу ч устгахгүй, зөвхөн юу устгагдахыг
 * тоолж буцаана. Устгах нь эргэшгүй үйлдэл тул UI үүнийг ашиглаж хэрэглэгчид
 * баталгаажуулах дэлгэц үзүүлнэ.
 */
exports.khariltsagchAdminUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const token = req.body.nevtersenAjiltniiToken;
    if (!token?.id) {
      return res.status(401).json({
        success: false,
        message: "Нэвтрэх мэдээлэл олдсонгүй!",
      });
    }

    // Эрхийг token-оос биш, ажилтны бичлэгээс уншина.
    //
    // `ajiltanSchema.methods.tokenUusgeye` нь token дотор `erkh`-ийг оруулдаггүй
    // (id, ner, baiguullagiinId, salbaruud, duusakhOgnoo л явдаг). Тиймээс
    // `token.erkh` үргэлж undefined байх тул түүгээр шалгавал бүх хэрэглэгч
    // 403 авна. routes/ajiltanRoute.js ч мөн адил бичлэгээс нь уншдаг.
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

    const khariltsagchId = req.params.id || req.body.khariltsagchId;
    if (!khariltsagchId) {
      throw new aldaa("Харилцагчийн ID заавал шаардлагатай!");
    }

    const zovkhonShalgakh = req.body.zovkhonShalgakh === true;

    // Гэрээний эзэмшигч нь `khariltsagch` эсвэл `orshinSuugch` хоёрын аль нэг
    // коллекцид байж болно — geree дээр `khariltsagchId`, `orshinSuugchId`
    // гэсэн ХОЁР талбар байдаг бөгөөд аль нь бөглөгдсөн нь бүртгэлээс
    // шалтгаална. Тиймээс эхлээд харилцагчаас, олдохгүй бол оршин суугчаас
    // хайна.
    const khariltsagchModel = khariltsagch(db.erunkhiiKholbolt);
    const orshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);

    let user = await khariltsagchModel.findById(khariltsagchId);
    let ezemshigchTurul = "khariltsagch";
    let ezemshigchModel = khariltsagchModel;

    if (!user) {
      user = await orshinSuugchModel.findById(khariltsagchId);
      ezemshigchTurul = "orshinSuugch";
      ezemshigchModel = orshinSuugchModel;
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Харилцагч/оршин суугч олдсонгүй!",
      });
    }

    const orgIds = baiguullagiinIdCollect(user);
    // Эзэмшигчийн бичлэг дээр байгууллага дутуу байвал админы өөрийнх нь
    // байгууллагыг нэмнэ — эс тэгвээс ямар ч гэрээ олдохгүй өнгөрнө.
    if (req.body.baiguullagiinId) {
      const ownOrg = String(req.body.baiguullagiinId);
      if (!orgIds.includes(ownOrg)) orgIds.push(ownOrg);
    }

    // ── 1. Гэрээнүүдийг цуглуулж, идэвхтэй нь байгаа эсэхийг шалгана ──────
    /** @type {{ conn: any, orgId: string, gereenuud: any[] }[]} */
    const orgData = [];
    const idevkhteiGeree = [];

    for (const orgId of orgIds) {
      const conn = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(orgId),
      );
      if (!conn) continue;

      const gereenuud = await Geree(conn)
        .find({
          $or: [
            { khariltsagchId: String(khariltsagchId) },
            { orshinSuugchId: String(khariltsagchId) },
          ],
        })
        .select("_id gereeniiDugaar tuluv barilgiinId")
        .lean();

      gereenuud.forEach((g) => {
        if (!TSUTSALSAN_TULUV.includes(g.tuluv)) {
          idevkhteiGeree.push({
            gereeniiDugaar: g.gereeniiDugaar,
            tuluv: g.tuluv,
            baiguullagiinId: orgId,
          });
        }
      });

      orgData.push({ conn, orgId, gereenuud });
    }

    // Идэвхтэй гэрээ үлдсэн бол устгахыг зөвшөөрөхгүй. Энэ бол энэ endpoint-ийн
    // гол хамгаалалт: зөвхөн цуцлагдсан гэрээтэй харилцагч устана.
    if (idevkhteiGeree.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Идэвхтэй гэрээтэй харилцагчийг устгах боломжгүй. Эхлээд гэрээг нь цуцлана уу.",
        idevkhteiGeree,
      });
    }

    // ── 2. Устгагдах бичлэгүүдийг тоолно ────────────────────────────────
    const tootsoo = {
      geree: 0,
      nekhemjlekh: 0,
      guilgeeAvlaga: 0,
    };

    for (const item of orgData) {
      const gereeIds = item.gereenuud.map((g) => String(g._id));
      item.gereeIds = gereeIds;
      tootsoo.geree += gereeIds.length;

      if (gereeIds.length === 0) continue;

      tootsoo.nekhemjlekh += await NekhemjlekhiinTuukh(item.conn).countDocuments(
        { gereeniiId: { $in: gereeIds } },
      );
      tootsoo.guilgeeAvlaga += await GuilgeeAvlaguud(item.conn).countDocuments({
        gereeniiId: { $in: gereeIds },
      });
    }

    // Хуурай гүйлт — юу ч устгахгүй, зөвхөн тайлагнана.
    if (zovkhonShalgakh) {
      return res.status(200).json({
        success: true,
        zovkhonShalgakh: true,
        message: "Устгах боломжтой.",
        khariltsagch: {
          _id: user._id,
          ner: user.ner,
          ovog: user.ovog,
          utas: user.utas,
        },
        ezemshigchTurul,
        tootsoo,
      });
    }

    // ── 3. Устгах ────────────────────────────────────────────────────────
    const { logDelete } = require("../services/auditService");

    for (const item of orgData) {
      const gereeIds = item.gereeIds;
      if (gereeIds.length === 0) continue;

      // Устгахын өмнө бүрэн хуулбарыг нь audit руу бичнэ — сэргээх шаардлага
      // гарвал энэ л цорын ганц ул мөр болно.
      try {
        const gereeDocs = await Geree(item.conn)
          .find({ _id: { $in: gereeIds } })
          .lean();
        for (const g of gereeDocs) {
          await logDelete(
            req,
            db,
            "geree",
            String(g._id),
            g,
            "hard",
            "Админ: цуцлагдсан гэрээтэй харилцагчийг устгасан",
            { baiguullagiinId: item.orgId, barilgiinId: g.barilgiinId || null },
          );
        }

        const nekhemjlekhDocs = await NekhemjlekhiinTuukh(item.conn)
          .find({ gereeniiId: { $in: gereeIds } })
          .lean();
        for (const n of nekhemjlekhDocs) {
          await logDelete(
            req,
            db,
            "nekhemjlekhiinTuukh",
            String(n._id),
            n,
            "hard",
            "Админ: цуцлагдсан гэрээтэй харилцагчийг устгасан",
            { baiguullagiinId: item.orgId, barilgiinId: n.barilgiinId || null },
          );
        }

        const avlagaDocs = await GuilgeeAvlaguud(item.conn)
          .find({ gereeniiId: { $in: gereeIds } })
          .lean();
        for (const a of avlagaDocs) {
          await logDelete(
            req,
            db,
            "guilgeeAvlaguud",
            String(a._id),
            a,
            "hard",
            "Админ: цуцлагдсан гэрээтэй харилцагчийг устгасан",
            { baiguullagiinId: item.orgId, barilgiinId: a.barilgiinId || null },
          );
        }
      } catch (auditErr) {
        // Audit амжилтгүй болбол устгахаа зогсооно — ул мөргүй устгахаас
        // татгалзах нь дээр.
        console.error("adminUstgakh audit error:", auditErr);
        return res.status(500).json({
          success: false,
          message:
            "Устгалын түүх бичихэд алдаа гарлаа. Аюулгүйн үүднээс устгалыг зогсоолоо.",
        });
      }

      // Дараалал чухал: эхлээд хамаарал бүхий бичлэгүүд, дараа нь гэрээ.
      await GuilgeeAvlaguud(item.conn).deleteMany({
        gereeniiId: { $in: gereeIds },
      });
      await NekhemjlekhiinTuukh(item.conn).deleteMany({
        gereeniiId: { $in: gereeIds },
      });
      await Geree(item.conn).deleteMany({ _id: { $in: gereeIds } });
    }

    // ── 4. Харилцагчийг өөрийг нь устгана ───────────────────────────────
    try {
      const deletedDoc = user.toObject ? user.toObject() : user;
      await logDelete(
        req,
        db,
        ezemshigchTurul,
        String(khariltsagchId),
        deletedDoc,
        "hard",
        "Админ: цуцлагдсан гэрээтэй харилцагчийг устгасан",
        { baiguullagiinId: user.baiguullagiinId, barilgiinId: null },
      );
    } catch (auditErr) {
      console.error("adminUstgakh khariltsagch audit error:", auditErr);
      return res.status(500).json({
        success: false,
        message:
          "Устгалын түүх бичихэд алдаа гарлаа. Харилцагч устгагдаагүй байна.",
      });
    }

    await ezemshigchModel.findByIdAndDelete(khariltsagchId);

    res.status(200).json({
      success: true,
      message: "Харилцагч болон холбогдох бүх бичлэг устгагдлаа.",
      ezemshigchTurul,
      tootsoo,
    });
  } catch (error) {
    next(error);
  }
});
