/**
 * Ашиглалтын зардал ба гэрээний ӨМЧИЙН ТӨРӨЛ (Орон сууц / Гараж / Агуулах).
 *
 * ЯАГААД: гэрээнд өмчийн төрөл хадгалагддаггүй тул барилгын бүх ашиглалтын
 * зардал (СӨХ, цэвэрлэгээ, лифт, ус...) зогсоол/агуулахын гэрээнд ч хуулагдаж,
 * нэхэмжлэгдэж байв. Зардлыг нэрээр нь ангилах дүрэм нь khungulultController
 * -ын angilalTaniya-тай ижил.
 *
 * Орон сууцны гэрээнд хавсаргасан гараж/агуулахын зардал байж болох тул
 * ОРОН СУУЦНЫ гэрээг шүүхгүй — зөвхөн гараж/агуулахын гэрээнээс өөр
 * ангиллын зардлыг хасна.
 */

const OR_SUUTS = "Орон сууц";
const GARAJ = "Гараж";
const AGUULAKH = "Агуулах";

/** Өмчийн төрлийн аливаа бичлэгийг (зогсоол, гараш...) нэг хэлбэрт оруулна. */
function tootTurulKhevshuulekh(turul) {
  const t = String(turul || "").toLowerCase();
  if (t.includes("гараж") || t.includes("гараш") || t.includes("зогсоол")) return GARAJ;
  if (t.includes("агуулах")) return AGUULAKH;
  return OR_SUUTS;
}

/** Зардал аль төрлийн өмчид хамаарах вэ (нэр/зардлын төрлөөр). */
function zardalAngilal(z) {
  return tootTurulKhevshuulekh(`${z?.ner || ""} ${z?.zardliinTurul || ""}`);
}

/** Гэрээний өмчийн төрөлд тохирох зардлуудыг л үлдээнэ. */
function zardluudShuuye(zardluud, tootTurul) {
  const turul = tootTurulKhevshuulekh(tootTurul);
  if (turul === OR_SUUTS) return zardluud || [];
  return (zardluud || []).filter((z) => {
    // Хэрэв уг зардал нь тусгайлан Харилцагчид зориулагдсан бол өмчийн шүүлтүүрээр хасахгүй
    if (z?.zoriulalt === "khariltsagch") return true;
    return zardalAngilal(z) === turul;
  });
}

// Эзэмшигчийн хайлтыг богино хугацаанд санах (нэхэмжлэх үүсгэхэд олон дуудагдана)
const sanakh = new Map();
const SANAKH_MS = 10 * 60 * 1000;

/**
 * Гэрээний өмчийн төрөл. `geree.tootTurul` байвал түүнийг, үгүй бол эзэмшигчийн
 * (оршин суугч / харилцагч) `toots`-оос тухайн барилга+тоотоор тодорхойлно.
 * Ижил тоот орон сууцаар бүртгэлтэй бол Орон сууц гэж үзнэ (аюулгүй тал).
 */
async function gereeniiTootTurul(geree) {
  if (!geree) return OR_SUUTS;
  if (geree.tootTurul) return tootTurulKhevshuulekh(geree.tootTurul);

  const tulkhuur = String(geree._id || "");
  const umnukh = tulkhuur && sanakh.get(tulkhuur);
  if (umnukh && Date.now() - umnukh.t < SANAKH_MS) return umnukh.v;

  let ur = OR_SUUTS;
  try {
    const { db } = require("zevbackv2");
    const toot = String(geree.toot || "").trim();
    let ezen = null;
    if (geree.khariltsagchId) {
      ezen = await require("../models/khariltsagch")(db.erunkhiiKholbolt)
        .findById(String(geree.khariltsagchId))
        .select({ toots: 1 })
        .lean()
        .catch(() => null);
    }
    if (!ezen && geree.orshinSuugchId) {
      ezen = await require("../models/orshinSuugch")(db.erunkhiiKholbolt)
        .findById(String(geree.orshinSuugchId))
        .select({ toots: 1 })
        .lean()
        .catch(() => null);
    }
    const taarsan = (ezen?.toots || []).filter(
      (t) =>
        String(t?.toot || "").trim() === toot &&
        (!geree.barilgiinId || !t?.barilgiinId || String(t.barilgiinId) === String(geree.barilgiinId)),
    );
    if (taarsan.length && !taarsan.some((t) => tootTurulKhevshuulekh(t.turul) === OR_SUUTS)) {
      ur = tootTurulKhevshuulekh(taarsan[0].turul);
    }
  } catch (err) {
    console.error("[zardalAngilal] өмчийн төрөл тодорхойлж чадсангүй:", err.message);
  }

  if (tulkhuur) {
    sanakh.set(tulkhuur, { v: ur, t: Date.now() });
    if (sanakh.size > 20000) sanakh.clear();
  }
  return ur;
}

/**
 * Харилцагчийн гараар сонгосон зардлууд (`songosonZardluud`).
 *
 * Сонголт хийгээгүй (эсвэл харилцагчийн гэрээ биш) бол `null` — тэр үед
 * хуучин дүрэм (`zardluudShuuye`) үйлчилнэ. Массив бол сонголт нь тоотын
 * төрлийн шүүлтээс ДАВАМГАЙ: гаражтай харилцагчид «Цэвэрлэгээ» сонговол
 * бодогдох ёстой.
 *
 * Санахгүй — сонголтыг өөрчилсний дараа шууд үйлчлэх ёстой.
 */
async function khariltsagchiinZardalSongolt(geree) {
  if (!geree?.khariltsagchId) return null;
  try {
    const { db } = require("zevbackv2");
    const kh = await require("../models/khariltsagch")(db.erunkhiiKholbolt)
      .findById(String(geree.khariltsagchId))
      .select({ songosonZardluud: 1 })
      .lean();
    return Array.isArray(kh?.songosonZardluud) ? kh.songosonZardluud.map(String) : null;
  } catch (err) {
    console.error("[zardalAngilal] харилцагчийн зардлын сонголт уншиж чадсангүй:", err.message);
    return null;
  }
}

/** Барилгын зардлын баримтуудаас (`_id`-тай) сонгосныг нь үлдээнэ. */
function songoltoorShuuye(zardalDocuud, songolt) {
  if (!Array.isArray(songolt)) return zardalDocuud || [];
  const set = new Set(songolt.map(String));
  return (zardalDocuud || []).filter((z) => set.has(String(z?._id)));
}

module.exports = {
  khariltsagchiinZardalSongolt,
  songoltoorShuuye,
  OR_SUUTS,
  GARAJ,
  AGUULAKH,
  tootTurulKhevshuulekh,
  zardalAngilal,
  zardluudShuuye,
  gereeniiTootTurul,
};
