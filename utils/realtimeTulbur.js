/**
 * Төлбөрийн өөрчлөлтийг апп руу бодит цагт мэдэгдэнэ.
 *
 * Гүйлгээ (guilgeeAvlaguud) бичигдэх/засагдах/устгагдах бүрд тухайн гэрээний
 * оршин суугч руу `orshinSuugch<id>` суваг дээр `{ type: "billing_update" }`
 * илгээнэ. Апп үүнийг хүлээн аваад нүүрний карт, нэхэмжлэхийн төлөвийг
 * refresh хийлгүйгээр шинэчилнэ. Гарчиг/мессежгүй тул push banner гарахгүй.
 *
 * Олон мөр зэрэг бичигдэхэд (нэхэмжлэх үүсгэх, Excel импорт) гэрээ бүрт
 * НЭГ л удаа илгээхээр 800ms-ээр нэгтгэнэ.
 */

let io = null;
const khuleegdej = new Map();
const NEGTGEKH_MS = 800;

exports.setIo = (socketIo) => {
  io = socketIo;
};

exports.tulburShinechlegdlee = (baiguullagiinId, gereeniiId) => {
  if (!io || !baiguullagiinId || !gereeniiId) return;
  const tulkhuur = `${baiguullagiinId}|${gereeniiId}`;
  if (khuleegdej.has(tulkhuur)) return;

  khuleegdej.set(
    tulkhuur,
    setTimeout(async () => {
      khuleegdej.delete(tulkhuur);
      try {
        const { db } = require("zevbackv2");
        const kholbolt = db.kholboltuud.find(
          (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
        );
        if (!kholbolt) return;
        const Geree = require("../models/geree");
        const geree = await Geree(kholbolt)
          .findById(String(gereeniiId))
          .select({ orshinSuugchId: 1 })
          .lean();
        if (!geree?.orshinSuugchId) return;
        io.emit(`orshinSuugch${geree.orshinSuugchId}`, {
          type: "billing_update",
          gereeniiId: String(gereeniiId),
          baiguullagiinId: String(baiguullagiinId),
        });
      } catch (err) {
        console.error("[realtimeTulbur] илгээж чадсангүй:", err.message);
      }
    }, NEGTGEKH_MS),
  );
};
