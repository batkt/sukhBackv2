const { db } = require("zevbackv2");
const Geree = require("../models/geree");
const OrshinSuugch = require("../models/orshinSuugch");
const tureesParkingService = require("./tureesParkingService");

/**
 * АмарСүх дээр үүссэн зочны урилгыг түрээсийн зогсоолын системтэй синк хийх.
 *
 * Зорилго: АмарСүх дээрх "Зочин урих" нь түрээсийн зогсоолын хаалган дээр
 * ажиллах. Түрээс тал parking-v2-ийн ezenUrisanMashin болгон хадгалдаг тул
 * тэнд бүртгэгдсэн машин хаалган дээр ирэхэд өөрөө танигдаж, "Зочин" төрлөөр
 * session үүсэн үнэгүй минут хасагдана.
 *
 * Бүх функц АЛДАА ШИДЭХГҮЙ - түрээс тал унасан ч АмарСүх дээрх урилга
 * хадгалагдсан хэвээр байх ёстой (сүүлд дахин синк хийж болно).
 */

/** Оршин суугчийн барилга/тоотын мэдээллийг олох */
async function orshinSuugchiinKhayagAvya(orshinSuugchId) {
  if (!orshinSuugchId) return null;
  try {
    const resObj = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(orshinSuugchId)
      .lean();
    if (!resObj) return null;

    if (Array.isArray(resObj.toots) && resObj.toots.length > 0) {
      const toot = resObj.toots[0];
      return {
        baiguullagiinId: toot.baiguullagiinId,
        barilgiinId: toot.barilgiinId,
        toot: toot.toot,
        gereeniiId: toot.gereeniiId,
        ner: resObj.ner,
        utas: Array.isArray(resObj.utas) ? resObj.utas[0] : resObj.utas,
        register: resObj.register,
      };
    }

    return {
      baiguullagiinId: resObj.baiguullagiinId,
      barilgiinId: resObj.barilgiinId,
      toot: resObj.toot,
      ner: resObj.ner,
      utas: Array.isArray(resObj.utas) ? resObj.utas[0] : resObj.utas,
      register: resObj.register,
    };
  } catch (err) {
    console.error("[TUREES-SYNC] Оршин суугчийн хаяг олоход алдаа:", err.message);
    return null;
  }
}

/**
 * Төлбөрийг эзэн даах бол уригсан оршин суугчийн ИДЭВХТЭЙ гэрээг олно.
 * Гэрээ олдохгүй бол "ezen" сонголт хүчингүй - зочин өөрөө төлөх болно.
 */
async function gereeOlyo(kholbolt, { gereeniiId, orshinSuugchId, utas, baiguullagiinId }) {
  try {
    const GereeModel = Geree(kholbolt);

    if (gereeniiId) {
      const geree = await GereeModel.findById(gereeniiId).lean();
      if (geree && geree.tuluv !== "Цуцалсан") return geree;
    }

    const query = { tuluv: "Идэвхтэй" };
    if (baiguullagiinId) query.baiguullagiinId = String(baiguullagiinId);

    if (orshinSuugchId) {
      const geree = await GereeModel.findOne({
        ...query,
        orshinSuugchId: String(orshinSuugchId),
      })
        .sort({ createdAt: -1 })
        .lean();
      if (geree) return geree;
    }

    if (utas) {
      const geree = await GereeModel.findOne({ ...query, utas: utas })
        .sort({ createdAt: -1 })
        .lean();
      if (geree) return geree;
    }

    return null;
  } catch (err) {
    console.error("[TUREES-SYNC] Гэрээ олоход алдаа:", err.message);
    return null;
  }
}

/**
 * Урилгыг түрээсийн зогсоолд бүртгүүлэх.
 *
 * @param {object} urilga - АмарСүх дээр хадгалагдсан ezenUrisanMashin document
 * @param {object} opts   - { kholbolt, tulburiinTurul, gereeniiId }
 * @returns {object} { success, data?, message? } - хэзээ ч throw хийхгүй
 */
async function urilgaSynclii(urilga, opts = {}) {
  if (!urilga || !urilga._id) {
    return { success: false, message: "Урилгын мэдээлэл дутуу" };
  }

  try {
    const kholbolt = opts.kholbolt || db.erunkhiiKholbolt;
    const orshinSuugchId = urilga.ezemshigchiinId || urilga.ezenId;

    const khayag = await orshinSuugchiinKhayagAvya(orshinSuugchId);

    const baiguullagiinId =
      urilga.baiguullagiinId || (khayag && khayag.baiguullagiinId);
    const barilgiinId = urilga.barilgiinId || (khayag && khayag.barilgiinId);

    if (!baiguullagiinId || !barilgiinId) {
      return {
        success: false,
        message:
          "Урилгад baiguullagiinId/barilgiinId байхгүй - түрээсийн зогсоолтой холбох боломжгүй",
      };
    }

    // Түлхүүр байгууллага тус бүрээр тул байгууллага тодорхойлогдсоны ДАРАА
    // тохиргоог шалгана.
    if (!tureesParkingService.idevkhiteiEsekh(baiguullagiinId)) {
      return {
        success: false,
        tokhirgoogui: true,
        message: "Интеграц энэ байгууллагад тохируулаагүй",
      };
    }

    let tulburiinTurul = opts.tulburiinTurul === "ezen" ? "ezen" : "zochin";
    let gereeniiId = opts.gereeniiId || (khayag && khayag.gereeniiId);

    if (tulburiinTurul === "ezen") {
      const geree = await gereeOlyo(kholbolt, {
        gereeniiId,
        orshinSuugchId,
        utas: urilga.ezemshigchiinUtas || (khayag && khayag.utas),
        baiguullagiinId,
      });

      if (geree) {
        gereeniiId = String(geree._id);
      } else {
        // Гэрээгүй бол эзний нэхэмжлэхэд бичих боломжгүй - зочин өөрөө төлнө
        console.warn(
          `⚠️ [TUREES-SYNC] ${urilga.urisanMashiniiDugaar}: эзний гэрээ олдсонгүй, tulburiinTurul=zochin болов`
        );
        tulburiinTurul = "zochin";
        gereeniiId = undefined;
      }
    }

    const khariu = await tureesParkingService.urilgaIlgeeye({
      amarSukhUrilgiinId: String(urilga._id),
      amarSukhBaiguullagiinId: String(baiguullagiinId),
      amarSukhBarilgiinId: String(barilgiinId),
      amarSukhOrshinSuugchId: orshinSuugchId,
      amarSukhGereeniiId: gereeniiId,
      amarSukhToot: khayag && khayag.toot,
      urisanMashiniiDugaar: urilga.urisanMashiniiDugaar,
      tusBurUneguiMinut: urilga.tusBurUneguiMinut || 0,
      davtamjiinTurul: urilga.davtamjiinTurul,
      ezemshigchiinNer:
        urilga.ezemshigchiinNer || (khayag && khayag.ner) || "",
      ezemshigchiinUtas:
        urilga.ezemshigchiinUtas || (khayag && khayag.utas) || "",
      ezemshigchiinRegister:
        urilga.ezemshigchiinRegister || (khayag && khayag.register) || "",
      tulburiinTurul,
      duusakhOgnoo: urilga.duusakhOgnoo,
    });

    if (khariu && khariu.success) {
      console.log(
        `✅ [TUREES-SYNC] Урилга түрээсийн зогсоолд бүртгэгдлээ: ${urilga.urisanMashiniiDugaar} (${tulburiinTurul})`
      );
    }

    return { ...khariu, tulburiinTurul, gereeniiId };
  } catch (err) {
    console.error("[TUREES-SYNC] urilgaSynclii алдаа:", err.message);
    return { success: false, message: err.message };
  }
}

/** Урилгыг түрээсийн зогсоол дээр цуцлах */
async function urilgaTsutslaya(urilga) {
  if (!urilga || !urilga._id) return { success: false };

  try {
    const orshinSuugchId = urilga.ezemshigchiinId || urilga.ezenId;
    let baiguullagiinId = urilga.baiguullagiinId;

    if (!baiguullagiinId) {
      const khayag = await orshinSuugchiinKhayagAvya(orshinSuugchId);
      baiguullagiinId = khayag && khayag.baiguullagiinId;
    }
    if (!baiguullagiinId) return { success: false };
    if (!tureesParkingService.idevkhiteiEsekh(baiguullagiinId))
      return { success: false, tokhirgoogui: true };

    return await tureesParkingService.urilgaTsutslaya({
      amarSukhBaiguullagiinId: String(baiguullagiinId),
      amarSukhUrilgiinId: String(urilga._id),
    });
  } catch (err) {
    console.error("[TUREES-SYNC] urilgaTsutslaya алдаа:", err.message);
    return { success: false, message: err.message };
  }
}

module.exports = {
  urilgaSynclii,
  urilgaTsutslaya,
  orshinSuugchiinKhayagAvya,
  gereeOlyo,
};
