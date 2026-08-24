// Тоот сэргээх туслах.
//
// EbarimtShine бичлэгт `toot` талбар хоосон үлддэг байсан (nekhemjlekheesEbarimtShineUusgye
// нь toot-ыг огт оноодоггүй байсан) тул хуучин баримтууд дээр жагсаалтад "-" харагдана.
// Энэ модуль нь дутуу тоотыг нэхэмжлэх (nekhemjlekhiinId) эсвэл гэрээ (gereeniiDugaar)-ээс
// хайж олоод буцаана, мөн сонголтоор баазад буцааж бичиж (self-heal) өгнө.

const mongoose = require("mongoose");
const Geree = require("../models/geree");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const EbarimtShine = require("../models/ebarimtShine");

const tootBaikhEsekh = (utga) => {
  if (utga === undefined || utga === null) return false;
  const str = String(utga).trim();
  return str !== "" && str !== "-";
};

// Баримт/нэхэмжлэхээс тоотыг гаргаж авах (toot, эсвэл toots массивын эхний утга)
function tootAvya(barimt) {
  if (!barimt) return "";
  if (tootBaikhEsekh(barimt.toot)) return String(barimt.toot).trim();
  if (Array.isArray(barimt.toots)) {
    for (const t of barimt.toots) {
      const utga = typeof t === "string" || typeof t === "number" ? t : t?.toot;
      if (tootBaikhEsekh(utga)) return String(utga).trim();
    }
  }
  return "";
}

const objectIdMuu = (id) => !mongoose.Types.ObjectId.isValid(String(id || ""));

/**
 * EbarimtShine бичлэгүүдийн дутуу тоотыг нөхөж бөглөнө.
 *
 * @param {object} kholbolt tukhainBaaziinKholbolt
 * @param {Array} jagsaalt EbarimtShine баримтууд (mongoose doc эсвэл lean object)
 * @param {object} tokhirgoo
 * @param {boolean} tokhirgoo.khadgalakhEsekh Олдсон тоотыг баазад буцааж бичих эсэх (default: true)
 * @returns {Promise<{shalgasan: number, oldson: number, khadgalsan: number}>}
 */
async function ebarimtiinTootNukhye(kholbolt, jagsaalt, tokhirgoo = {}) {
  const { khadgalakhEsekh = true } = tokhirgoo;
  const durslel = { shalgasan: 0, oldson: 0, khadgalsan: 0 };

  if (!kholbolt || !Array.isArray(jagsaalt) || jagsaalt.length === 0)
    return durslel;

  const dutuu = jagsaalt.filter((e) => e && !tootBaikhEsekh(e.toot));
  durslel.shalgasan = dutuu.length;
  if (dutuu.length === 0) return durslel;

  // 1) Нэхэмжлэхээс хайх
  const nekhemjlekhIds = [
    ...new Set(
      dutuu
        .map((e) => e.nekhemjlekhiinId && String(e.nekhemjlekhiinId))
        .filter((id) => id && !objectIdMuu(id))
    ),
  ];

  const nekhemjlekhMap = new Map();
  if (nekhemjlekhIds.length > 0) {
    const nekhemjlekhuud = await NekhemjlekhiinTuukh(kholbolt)
      .find({ _id: { $in: nekhemjlekhIds } })
      .select("toot toots gereeniiDugaar gereeniiId")
      .lean();
    for (const n of nekhemjlekhuud) nekhemjlekhMap.set(String(n._id), n);
  }

  // 2) Гэрээний дугаараар хайх (нэхэмжлэх дээр ч тоот байхгүй тохиолдолд)
  const gereeniiDugaaruud = [
    ...new Set(
      dutuu
        .map((e) => {
          const nekhemjlekh = nekhemjlekhMap.get(String(e.nekhemjlekhiinId || ""));
          return e.gereeniiDugaar || nekhemjlekh?.gereeniiDugaar || "";
        })
        .filter((d) => !!d)
    ),
  ];

  const gereeMap = new Map();
  if (gereeniiDugaaruud.length > 0) {
    const gereenuud = await Geree(kholbolt)
      .find({ gereeniiDugaar: { $in: gereeniiDugaaruud } })
      .select("toot gereeniiDugaar tuluv")
      .lean();
    for (const g of gereenuud) {
      const odooKhadgalsan = gereeMap.get(g.gereeniiDugaar);
      // Идэвхтэй гэрээг эрхэмлэнэ
      if (!odooKhadgalsan || g.tuluv === "Идэвхтэй")
        gereeMap.set(g.gereeniiDugaar, g);
    }
  }

  const bulkOps = [];
  for (const barimt of dutuu) {
    const nekhemjlekh = nekhemjlekhMap.get(String(barimt.nekhemjlekhiinId || ""));
    const gereeniiDugaar = barimt.gereeniiDugaar || nekhemjlekh?.gereeniiDugaar || "";
    const toot =
      tootAvya(nekhemjlekh) || tootAvya(gereeMap.get(gereeniiDugaar)) || "";

    if (!toot) continue;

    barimt.toot = toot;
    durslel.oldson += 1;

    if (khadgalakhEsekh && barimt._id) {
      bulkOps.push({
        updateOne: {
          filter: { _id: barimt._id },
          update: { $set: { toot } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    try {
      const kharyu = await EbarimtShine(kholbolt).bulkWrite(bulkOps, {
        ordered: false,
      });
      durslel.khadgalsan = kharyu?.modifiedCount || 0;
    } catch (err) {
      // Бичихэд алдаа гарвал жагсаалт буцаахад нөлөөлөхгүй
      console.error("[TOOT RESOLVER] bulkWrite алдаа:", err.message);
    }
  }

  return durslel;
}

module.exports = { ebarimtiinTootNukhye, tootAvya, tootBaikhEsekh };
