/**
 * Гараж (зогсоол) / агуулахын нэхэмжлэх — үүсгэх ба төлөв.
 *
 * ЯАГААД: эзэмшигч холбоход авлага огт үүсдэггүй байсан ч вэб «Илгээсэн» гэж
 * таамаглан харуулдаг, нэхэмжилсэн дүн харагддаггүй, хэсэгчлэн төлсөн ч
 * «Төлсөн» болдоггүй байв. Энд:
 *   - zogsoolAvlagaUusgey: тухайн гаражийн сарын нэхэмжлэхийг (авлагын мөр +
 *     нэхэмжлэх) ЖИНХЭНЭЭР үүсгэнэ — сард нэг удаа.
 *   - zogsoolTuluvAvya: гараж бүрийн нэхэмжилсэн дүн, төлсөн, үлдэгдэл, төлөв.
 *     Хэсэгчилсэн төлөлтүүд нийлээд авлагыг хаавал «Төлөгдсөн».
 */

const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");

const ANGILAL_RE = {
  Зогсоол: /зогсоол|гараж|гараш/i,
  Агуулах: /агуулах/i,
};

function turulKhevshuulekh(turul) {
  return /агуулах/i.test(String(turul || "")) ? "Агуулах" : "Зогсоол";
}

/** Мөр нь тухайн ангиллын (гараж/агуулах) мөр мөн эсэх */
function angilliinMur(r, turul) {
  const re = ANGILAL_RE[turul];
  return re.test(`${r.zardliinNer || ""} ${r.tailbar || ""} ${r.zardliinTurul || ""}`);
}

/** Мөр аль гаражид (тоот) хамаарах — «тоот X» бичвэр эсвэл toot талбар */
function murniiToot(r) {
  const m = `${r.zardliinNer || ""} ${r.tailbar || ""}`.match(/тоот\s*([^\s),]+)/i);
  if (m) return String(m[1]).trim();
  return r.toot ? String(r.toot).trim() : "";
}

async function tolboriinDun(baiguullagiinId, barilgiinId, turul) {
  const { db } = require("zevbackv2");
  const b = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId).lean();
  const barilga = b?.barilguud?.find((x) => String(x._id) === String(barilgiinId || ""));
  const t = barilga?.tokhirgoo || {};
  if (turul === "Агуулах") {
    if (t.aguulakhTolborEnabled === false) return 0;
    return Number(t.aguulakhTolborUtga || b?.aguulakhUusgekhTulbur || 0);
  }
  if (t.garsiinTolborEnabled === false) return 0;
  return Number(t.garsiinTolborUtga || b?.zogsoolUusgekhTulbur || 0);
}

/** Гаражийн эзэмшигчийн гэрээ: өгөгдсөн → nemeltTootnuud-д багтсан → тоотоор */
async function gereeOlyo(kholbolt, { baiguullagiinId, barilgiinId, gereeniiId, orshinSuugchId, khariltsagchId, toot }) {
  const GereeModel = Geree(kholbolt);
  const idevkhtei = { tuluv: { $nin: ["Цуцалсан", "цуцалсан", "tsutlsasan", "идэвхгүй"] } };
  if (gereeniiId) {
    const g = await GereeModel.findById(String(gereeniiId)).lean().catch(() => null);
    if (g) return g;
  }
  const ezen = orshinSuugchId
    ? { orshinSuugchId: String(orshinSuugchId) }
    : khariltsagchId
      ? { khariltsagchId: String(khariltsagchId) }
      : null;
  if (ezen) {
    const base = { baiguullagiinId: String(baiguullagiinId), ...ezen, ...idevkhtei };
    if (barilgiinId) base.barilgiinId = String(barilgiinId);
    const nemelt = await GereeModel.findOne({ ...base, "nemeltTootnuud.toot": String(toot) }).lean();
    if (nemelt) return nemelt;
    const ali = await GereeModel.findOne(base).sort({ createdAt: -1 }).lean();
    if (ali) return ali;
  }
  return null;
}

/**
 * Тухайн гаражийн энэ сарын нэхэмжлэхийг үүсгэнэ (байвал дахин үүсгэхгүй).
 * @returns {Promise<{success:boolean, message?:string, alreadyExists?:boolean, dun?:number, nekhemjlekhId?:string, gereeniiId?:string}>}
 */
async function zogsoolAvlagaUusgey(kholbolt, data) {
  const turul = turulKhevshuulekh(data.turul);
  const toot = String(data.toot || "").trim();
  if (!toot) return { success: false, message: "Гараж/агуулахын дугаар хоосон байна" };

  const dun = await tolboriinDun(data.baiguullagiinId, data.barilgiinId, turul);
  if (!(dun > 0)) {
    return {
      success: false,
      message: `${turul === "Агуулах" ? "Агуулахын" : "Гаражийн"} төлбөрийн дүн тохируулагдаагүй байна (Тохиргоо → Нэмэлт тохиргоо).`,
    };
  }

  const geree = await gereeOlyo(kholbolt, { ...data, toot });
  if (!geree) return { success: false, message: "Эзэмшигчийн идэвхтэй гэрээ олдсонгүй" };

  const ognoo = data.ognoo ? new Date(data.ognoo) : new Date();
  const sarEkh = new Date(ognoo.getFullYear(), ognoo.getMonth(), 1);
  const sarTug = new Date(ognoo.getFullYear(), ognoo.getMonth() + 1, 0, 23, 59, 59, 999);

  // Энэ сард тухайн гаражид аль ч эх сурвалжаас (гар/сарын нэхэмжлэх) нэхэмжилсэн эсэх
  const GuilgeeModel = GuilgeeAvlaguud(kholbolt);
  const umnukhuud = await GuilgeeModel.find({
    gereeniiId: String(geree._id),
    dun: { $gt: 0 },
    ognoo: { $gte: sarEkh, $lte: sarTug },
  }).lean();
  const umnukh = umnukhuud.find((r) => angilliinMur(r, turul) && murniiToot(r) === toot);
  if (umnukh) {
    return {
      success: true,
      alreadyExists: true,
      dun: Number(umnukh.dun) || 0,
      nekhemjlekhId: umnukh.nekhemjlekhId || null,
      gereeniiId: String(geree._id),
      message: "Энэ сарын нэхэмжлэх аль хэдийн илгээгдсэн байна",
    };
  }

  const guilgeeService = require("../services/guilgeeService");
  const ner = turul === "Агуулах" ? "Агуулахын төлбөр" : "Зогсоолын төлбөр";
  const mur = await guilgeeService.recordCharge(kholbolt, {
    baiguullagiinId: String(data.baiguullagiinId),
    barilgiinId: String(data.barilgiinId || geree.barilgiinId || ""),
    gereeniiId: String(geree._id),
    gereeniiDugaar: geree.gereeniiDugaar || "",
    orshinSuugchId: geree.orshinSuugchId || data.orshinSuugchId || "",
    toot,
    turul: "Авлага",
    source: "gar",
    zardliinNer: `${ner} (тоот ${toot})`,
    zardliinTurul: turul,
    tailbar: `${turul} (тоот ${toot})`,
    dun,
    ognoo,
    guilgeeKhiisenAjiltniiNer: data.ajiltanNer || "Систем",
    guilgeeKhiisenAjiltniiId: data.ajiltanId || "",
  });

  return {
    success: true,
    dun,
    nekhemjlekhId: mur?.nekhemjlekhId || null,
    gereeniiId: String(geree._id),
    message: `${turul === "Агуулах" ? "Агуулахын" : "Гаражийн"} нэхэмжлэх илгээгдлээ`,
  };
}

/**
 * Барилгын гараж/агуулах бүрийн нэхэмжлэх, төлөлтийн төлөв.
 * Төлөлт: ангиллаар тэмдэглэсэн (zardliinNer/tailbar) төлөлтүүд тухайн гаражид,
 * тоотгүй ангиллын төлөлт гэрээний гаражуудад хуучнаас нь хуваарилагдана.
 * Гэрээний НИЙТ үлдэгдэл 0 бол (QPay/банкаар ангилалгүй төлсөн ч) бүх гараж төлөгдсөн.
 */
async function zogsoolTuluvAvya(kholbolt, { baiguullagiinId, barilgiinId, turul: turulRaw }) {
  const turul = turulKhevshuulekh(turulRaw);
  const query = { baiguullagiinId: String(baiguullagiinId) };
  if (barilgiinId) query.barilgiinId = String(barilgiinId);
  const murnuud = await GuilgeeAvlaguud(kholbolt)
    .find(query)
    .select({ gereeniiId: 1, dun: 1, zardliinNer: 1, tailbar: 1, zardliinTurul: 1, toot: 1, ognoo: 1, nekhemjlekhId: 1, source: 1 })
    .sort({ ognoo: 1 })
    .lean();

  const gereeniiUldegdel = {};
  const negjuud = new Map(); // `${gid}|${toot}` → state
  const tootgviTulult = {}; // gid → дүн (ангиллын, тоотгүй)

  for (const r of murnuud) {
    const gid = String(r.gereeniiId || "");
    if (!gid) continue;
    const dun = Number(r.dun) || 0;
    gereeniiUldegdel[gid] = (gereeniiUldegdel[gid] || 0) + dun;
    if (!angilliinMur(r, turul)) continue;
    const toot = murniiToot(r);
    if (dun > 0) {
      if (!toot) continue;
      const key = `${gid}|${toot}`;
      const n = negjuud.get(key) || { gereeniiId: gid, toot, nekhemjilsenDun: 0, tulsunDun: 0, suuliin: null };
      n.nekhemjilsenDun += dun;
      n.suuliin = { ognoo: r.ognoo, dun, nekhemjlekhId: r.nekhemjlekhId || null };
      negjuud.set(key, n);
    } else if (dun < 0) {
      if (toot && negjuud.has(`${gid}|${toot}`)) negjuud.get(`${gid}|${toot}`).tulsunDun += -dun;
      else tootgviTulult[gid] = (tootgviTulult[gid] || 0) + -dun;
    }
  }

  // Тоотгүй ангиллын төлөлтийг гэрээний гаражуудад хуваарилна
  for (const n of negjuud.values()) {
    const ul = tootgviTulult[n.gereeniiId] || 0;
    if (ul <= 0) continue;
    const dutuu = Math.max(0, n.nekhemjilsenDun - n.tulsunDun);
    const ok = Math.min(dutuu, ul);
    n.tulsunDun += ok;
    tootgviTulult[n.gereeniiId] = ul - ok;
  }

  const r2 = (v) => Math.round(v * 100) / 100;
  return Array.from(negjuud.values()).map((n) => {
    let uldegdel = Math.max(0, n.nekhemjilsenDun - n.tulsunDun);
    // Гэрээ бүхэлдээ төлөгдсөн бол гараж ч төлөгдсөн (ангилалгүй төлөлт орсон)
    if ((gereeniiUldegdel[n.gereeniiId] || 0) <= 0.5) uldegdel = 0;
    const tulsun = n.nekhemjilsenDun - uldegdel;
    return {
      gereeniiId: n.gereeniiId,
      toot: n.toot,
      nekhemjlekhIlgeesenEsekh: n.nekhemjilsenDun > 0,
      nekhemjilsenDun: r2(n.nekhemjilsenDun),
      tulsunDun: r2(tulsun),
      uldegdel: r2(uldegdel),
      suuliinNekhemjlekh: n.suuliin,
      tuluv: uldegdel <= 0.5 ? "Төлөгдсөн" : tulsun > 0.5 ? "Хэсэгчлэн төлсөн" : "Төлөөгүй",
    };
  });
}

module.exports = { zogsoolAvlagaUusgey, zogsoolTuluvAvya };
