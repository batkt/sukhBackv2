/**
 * Шилэн данс — оршин суугчдын төлбөрийн ил тод мэдээлэл.
 *
 * Зөвхөн төлбөрийн өгөгдөл (guilgeeAvlaguud) — банкны хуулга, гар бүртгэл
 * ашиглахгүй:
 *  - Дебет  = нэхэмжилсэн (dun > 0)
 *  - Төлсөн = төлөлт (dun < 0, хөнгөлөлт биш) — цуцалсан гэрээнийх ч орно
 *  - Кредит = төлсөн + хөнгөлөлт (dun < 0)
 *  - Төлөөгүй = үлдэгдэл (Σ dun) хугацааны эцэст
 *  - Хугацаа хэтэрсэн = KHETERSEN_KHONOG-оос хуучин төлөгдөөгүй нэхэмжлэл (FIFO)
 *
 * Замууд (routes/shilenDansRoute.js):
 *  - POST /shilenDans/tailan — вэб (ажилтан): бүрэн мэдээлэл (нэр, орц, хоног)
 *  - POST /shilenDans/app    — оршин суугчийн апп: хэтэрсэн айл зөвхөн тоот + дүн
 */
const asyncHandler = require("express-async-handler");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const { shilenDansAppKharuulakhEsekh } = require("../utils/baiguullagiinTokhirgoo");

/** Хугацаа хэтэрсэн гэж үзэх хоног (нэхэмжилсэн огнооноос). */
const KHETERSEN_KHONOG = 30;
const TZ = "Asia/Ulaanbaatar";
const KHONOG_MS = 86400000;

const ognooTsaggui = (utga) =>
  typeof utga === "string" && /^\d{4}-\d{2}-\d{2}$/.test(utga.trim());

function khugatsaaZadlakh(ekhlekhOgnoo, duusakhOgnoo) {
  const ekhlel = ekhlekhOgnoo ? new Date(ekhlekhOgnoo) : new Date();
  if (!ekhlekhOgnoo) ekhlel.setDate(1);
  if (!ekhlekhOgnoo || ognooTsaggui(ekhlekhOgnoo)) ekhlel.setHours(0, 0, 0, 0);
  const tugsgul = duusakhOgnoo ? new Date(duusakhOgnoo) : new Date();
  if (!duusakhOgnoo || ognooTsaggui(duusakhOgnoo)) {
    tugsgul.setHours(23, 59, 59, 999);
  }
  return { ekhlel, tugsgul };
}

const pad = (n) => String(n).padStart(2, "0");
const sarTulkhuur = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Хөнгөлөлтийн мөр мөн эсэх (aggregate илэрхийлэл). */
const KHUNGULULT_ESEKH = {
  $or: [{ $eq: ["$turul", "Хөнгөлөлт"] }, { $eq: ["$source", "khungulult"] }],
};

/** Хугацааны нийт: нэхэмжилсэн, төлсөн, хөнгөлөлт; хугацааны эцсийн төлөөгүй. */
async function niitAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const [khugatsaand, tuluugui] = await Promise.all([
    GuilgeeAvlaguud(kholbolt).aggregate([
      { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
      {
        $group: {
          _id: null,
          nekhemjilsen: { $sum: { $cond: [{ $gt: ["$dun", 0] }, "$dun", 0] } },
          tulsun: {
            $sum: {
              $cond: [
                { $and: [{ $lt: ["$dun", 0] }, { $not: KHUNGULULT_ESEKH }] },
                { $abs: "$dun" },
                0,
              ],
            },
          },
          khungulult: {
            $sum: {
              $cond: [
                { $and: [{ $lt: ["$dun", 0] }, KHUNGULULT_ESEKH] },
                { $abs: "$dun" },
                0,
              ],
            },
          },
        },
      },
    ]),
    GuilgeeAvlaguud(kholbolt).aggregate([
      { $match: { ...baseMatch, ognoo: { $lte: tugsgul } } },
      { $group: { _id: null, dun: { $sum: "$dun" } } },
    ]),
  ]);
  return {
    nekhemjilsen: khugatsaand[0]?.nekhemjilsen || 0,
    tulsun: khugatsaand[0]?.tulsun || 0,
    khungulult: khugatsaand[0]?.khungulult || 0,
    tuluugui: Math.max(0, tuluugui[0]?.dun || 0),
  };
}

/** Сар бүрийн нэхэмжилсэн/төлсөн (аппын график). */
async function saraarAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const r = await GuilgeeAvlaguud(kholbolt).aggregate([
    { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$ognoo", timezone: TZ } },
        nekhemjilsen: { $sum: { $cond: [{ $gt: ["$dun", 0] }, "$dun", 0] } },
        tulsun: {
          $sum: {
            $cond: [
              { $and: [{ $lt: ["$dun", 0] }, { $not: KHUNGULULT_ESEKH }] },
              { $abs: "$dun" },
              0,
            ],
          },
        },
      },
    },
  ]);
  return new Map(r.map((x) => [x._id, x]));
}

/**
 * Айл (гэрээ) тус бүрийн хугацаа хэтэрсэн авлага. Төлөлт, хөнгөлөлтийг
 * хамгийн ХУУЧИН нэхэмжлэлээс эхэлж хасна (FIFO — /tailan/avlagiin-nasjilt-тай
 * ижил зарчим). Үлдсэн нэхэмжлэл KHETERSEN_KHONOG-оос хуучин бол хэтэрсэн.
 */
async function khetersenAvya(kholbolt, baseMatch, tugsgul) {
  const muruud = await GuilgeeAvlaguud(kholbolt)
    .find({ ...baseMatch, ognoo: { $lte: tugsgul } })
    .select("gereeniiId toot dun ognoo")
    .sort({ ognoo: 1 })
    .lean();

  const gereenuud = new Map();
  for (const m of muruud) {
    const id = String(m.gereeniiId || "");
    if (!id) continue;
    if (!gereenuud.has(id)) gereenuud.set(id, { toot: "", nekhemjlel: [], khasakh: 0 });
    const g = gereenuud.get(id);
    if (m.toot) g.toot = String(m.toot);
    const dun = Number(m.dun) || 0;
    if (dun > 0) g.nekhemjlel.push({ ognoo: new Date(m.ognoo), dun });
    else if (dun < 0) g.khasakh += -dun;
  }

  const odoo = tugsgul.getTime();
  const khetersenZaag = odoo - KHETERSEN_KHONOG * KHONOG_MS;
  let khetersen = 0;
  let boloogui = 0;
  const ailuud = new Map();

  for (const [gereeniiId, g] of gereenuud) {
    let khasakh = g.khasakh;
    let ailKhetersen = 0;
    let khamgiinKhuuchin = null;
    for (const n of g.nekhemjlel) {
      const tulugduugui = Math.max(0, n.dun - khasakh);
      khasakh = Math.max(0, khasakh - n.dun);
      if (tulugduugui <= 0) continue;
      if (!khamgiinKhuuchin) khamgiinKhuuchin = n.ognoo;
      if (n.ognoo.getTime() < khetersenZaag) ailKhetersen += tulugduugui;
      else boloogui += tulugduugui;
    }
    if (ailKhetersen > 0) {
      khetersen += ailKhetersen;
      ailuud.set(gereeniiId, {
        toot: g.toot,
        dun: ailKhetersen,
        khonog: Math.floor((odoo - khamgiinKhuuchin.getTime()) / KHONOG_MS),
      });
    }
  }

  return { khetersen, boloogui, ailuud };
}

const tootToo = (v) => {
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};
const tootoorEremblekh = (a, b) =>
  String(a.orts || "").localeCompare(String(b.orts || ""), "mn", { numeric: true }) ||
  tootToo(a.toot) - tootToo(b.toot) ||
  String(a.toot).localeCompare(String(b.toot), "mn", { numeric: true });

/**
 * Тоот (гэрээ) тус бүрийн тооцоо (вэб): эхний үлдэгдэл, Дебет, Кредит, эцсийн
 * үлдэгдэл, хугацаа хэтэрсэн дүн/хоног. Барилгын бүх идэвхтэй гэрээ орно;
 * цуцалсан гэрээ зөвхөн тооцоотой бол (тухайн сард төлсөн г.м.).
 */
async function ailiinTootsooAvya(kholbolt, baseMatch, ekhlel, tugsgul, khetersenMap) {
  const Geree = require("../models/geree");
  const [tootsoo, gereenuud] = await Promise.all([
    GuilgeeAvlaguud(kholbolt).aggregate([
      { $match: { ...baseMatch, ognoo: { $lte: tugsgul } } },
      {
        $group: {
          _id: "$gereeniiId",
          toot: { $last: "$toot" },
          ekhnii: { $sum: { $cond: [{ $lt: ["$ognoo", ekhlel] }, "$dun", 0] } },
          debet: {
            $sum: {
              $cond: [{ $and: [{ $gte: ["$ognoo", ekhlel] }, { $gt: ["$dun", 0] }] }, "$dun", 0],
            },
          },
          kredit: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$ognoo", ekhlel] }, { $lt: ["$dun", 0] }] },
                { $abs: "$dun" },
                0,
              ],
            },
          },
        },
      },
    ]),
    Geree(kholbolt, true)
      .find(baseMatch)
      .select("gereeniiDugaar toot orts davkhar ovog ner utas tuluv")
      .lean(),
  ]);

  const gereeMap = new Map(gereenuud.map((g) => [String(g._id), g]));
  const toots = new Map(tootsoo.map((t) => [String(t._id || ""), t]));
  const id_uud = new Set([
    ...gereenuud.filter((g) => g.tuluv !== "Цуцалсан").map((g) => String(g._id)),
    ...toots.keys(),
  ]);

  const urdun = [];
  for (const id of id_uud) {
    if (!id) continue;
    const g = gereeMap.get(id);
    const t = toots.get(id);
    const ekhnii = t?.ekhnii || 0;
    const debet = t?.debet || 0;
    const kredit = t?.kredit || 0;
    // Цуцалсан, ямар ч тооцоогүй гэрээг харуулахгүй
    if (g?.tuluv === "Цуцалсан" && !ekhnii && !debet && !kredit) continue;
    const kh = khetersenMap.get(id);
    urdun.push({
      gereeniiId: id,
      gereeniiDugaar: g?.gereeniiDugaar || "",
      toot: g?.toot || t?.toot || "",
      orts: g?.orts || "",
      davkhar: g?.davkhar || "",
      ner: [g?.ovog, g?.ner].filter(Boolean).join(" "),
      utas: Array.isArray(g?.utas) ? g.utas.filter(Boolean).join(", ") : "",
      tsutsalsan: g?.tuluv === "Цуцалсан",
      ekhnii,
      debet,
      kredit,
      etssiin: ekhnii + debet - kredit,
      khetersen: kh?.dun || 0,
      khonog: kh?.khonog || 0,
    });
  }
  return urdun.sort(tootoorEremblekh);
}

/** Токен нь байгууллагын ажилтных мөн эсэх (оршин суугчийн токенийг хаана). */
async function ajiltanEsekh(req) {
  const { db } = require("zevbackv2");
  const Ajiltan = require("../models/ajiltan");
  const token = req.body?.nevtersenAjiltniiToken;
  if (!token?.id || token.id === "zochin") return false;
  try {
    return !!(await Ajiltan(db.erunkhiiKholbolt).exists({ _id: token.id }));
  } catch (e) {
    return false;
  }
}

const aldaaKhariu = (res, kod, message) => res.status(kod).json({ success: false, message });

exports.shilenDansTailan = asyncHandler(async (req, res) => {
  if (!(await ajiltanEsekh(req))) {
    return aldaaKhariu(res, 403, "Энэ үйлдлийг хийх эрх байхгүй байна!");
  }
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  if (!kholbolt) return aldaaKhariu(res, 404, "Холболтын мэдээлэл олдсонгүй");
  const barilgiinId = req.body.barilgiinId ? String(req.body.barilgiinId) : "";
  if (!barilgiinId) return aldaaKhariu(res, 400, "Барилга сонгоно уу");

  const { ekhlel, tugsgul } = khugatsaaZadlakh(req.body.ekhlekhOgnoo, req.body.duusakhOgnoo);
  if (isNaN(ekhlel.getTime()) || isNaN(tugsgul.getTime()) || ekhlel > tugsgul) {
    return aldaaKhariu(res, 400, "Огноо буруу байна");
  }
  const baseMatch = { baiguullagiinId: String(kholbolt.baiguullagiinId), barilgiinId };

  const [niit, khetersen] = await Promise.all([
    niitAvya(kholbolt, baseMatch, ekhlel, tugsgul),
    khetersenAvya(kholbolt, baseMatch, tugsgul),
  ]);
  const ailuud = await ailiinTootsooAvya(kholbolt, baseMatch, ekhlel, tugsgul, khetersen.ailuud);

  res.json({
    success: true,
    ekhlekhOgnoo: ekhlel,
    duusakhOgnoo: tugsgul,
    khetersenKhonog: KHETERSEN_KHONOG,
    ...niit,
    khetersen: khetersen.khetersen,
    khetersenAilToo: khetersen.ailuud.size,
    ailuud,
  });
});

/**
 * Оршин суугчийн апп — «Шилэн данс».
 * body: { songosonBaiguullagiinId, barilgiinId, sar: "YYYY-MM" }
 * (tokenShalgakh нь body.baiguullagiinId-г токеноор дардаг тул өөр нэр.)
 * Хэтэрсэн айлын жагсаалт зөвхөн тоот + дүн (нэр, утас, хоног явуулахгүй).
 */
exports.shilenDansApp = asyncHandler(async (req, res) => {
  const { db } = require("zevbackv2");
  const Baiguullaga = require("../models/baiguullaga");
  const OrshinSuugch = require("../models/orshinSuugch");
  const Geree = require("../models/geree");

  const token = req.body?.nevtersenAjiltniiToken;
  if (!token?.id || token.id === "zochin") {
    return aldaaKhariu(res, 401, "Нэвтрэх шаардлагатай");
  }

  const orshinSuugchiinId = String(token.undsenId || token.id);
  const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
    .findById(orshinSuugchiinId)
    .select("baiguullagiinId barilgiinId toots")
    .lean();
  if (!orshinSuugch) return aldaaKhariu(res, 404, "Хэрэглэгч олдсонгүй");

  const baiguullagiinId = String(
    req.body.songosonBaiguullagiinId || orshinSuugch.baiguullagiinId || "",
  );
  const barilgiinId = String(req.body.barilgiinId || orshinSuugch.barilgiinId || "");
  const kharyaalagdakh =
    (String(orshinSuugch.baiguullagiinId) === baiguullagiinId &&
      (!orshinSuugch.barilgiinId || String(orshinSuugch.barilgiinId) === barilgiinId)) ||
    (orshinSuugch.toots || []).some(
      (t) =>
        String(t.baiguullagiinId) === baiguullagiinId &&
        String(t.barilgiinId) === barilgiinId,
    );
  if (!baiguullagiinId || !barilgiinId || !kharyaalagdakh) {
    return aldaaKhariu(res, 403, "Энэ байрны мэдээлэл харах эрх байхгүй");
  }

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
    .findById(baiguullagiinId)
    .select("ner tokhirgoo barilguud._id barilguud.ner barilguud.tokhirgoo")
    .lean();
  if (!baiguullaga || !shilenDansAppKharuulakhEsekh(baiguullaga, barilgiinId)) {
    return res
      .status(403)
      .json({ success: false, message: "Шилэн данс нээгдээгүй байна", khaalttai: true });
  }

  const kholbolt = db.kholboltuud.find((k) => String(k.baiguullagiinId) === baiguullagiinId);
  if (!kholbolt) return aldaaKhariu(res, 404, "Холболтын мэдээлэл олдсонгүй");

  // Сонгосон сар (анхдагч: энэ сар) ба 6 сарын график
  const sarMatch = /^(\d{4})-(\d{2})$/.exec(String(req.body.sar || ""));
  const odoo = new Date();
  const jil = sarMatch ? Number(sarMatch[1]) : odoo.getFullYear();
  const sarIndex = sarMatch ? Number(sarMatch[2]) - 1 : odoo.getMonth();
  const sarEkhlel = new Date(jil, sarIndex, 1, 0, 0, 0, 0);
  const sarTugsgul = new Date(jil, sarIndex + 1, 0, 23, 59, 59, 999);
  const grafikEkhlel = new Date(jil, sarIndex - 5, 1, 0, 0, 0, 0);
  const tugsgul = sarTugsgul > odoo ? odoo : sarTugsgul;

  const baseMatch = { baiguullagiinId, barilgiinId };

  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId, orshinSuugchId: orshinSuugchiinId })
    .select("_id")
    .lean();
  const gereeniiIduud = gereenuud.map((g) => String(g._id));

  const [niit, saraarMap, khetersen, miniiUldegdel] = await Promise.all([
    niitAvya(kholbolt, baseMatch, sarEkhlel, tugsgul),
    saraarAvya(kholbolt, baseMatch, grafikEkhlel, tugsgul),
    khetersenAvya(kholbolt, baseMatch, tugsgul),
    gereeniiIduud.length
      ? GuilgeeAvlaguud(kholbolt).aggregate([
          { $match: { baiguullagiinId, gereeniiId: { $in: gereeniiIduud } } },
          { $group: { _id: null, dun: { $sum: "$dun" } } },
        ])
      : Promise.resolve([]),
  ]);

  const saraar = [];
  for (let i = 5; i >= 0; i--) {
    const key = sarTulkhuur(new Date(jil, sarIndex - i, 1));
    const s = saraarMap.get(key);
    saraar.push({ sar: key, nekhemjilsen: s?.nekhemjilsen || 0, tulsun: s?.tulsun || 0 });
  }

  const barilga = (baiguullaga.barilguud || []).find((b) => String(b._id) === barilgiinId);

  res.json({
    success: true,
    sar: sarTulkhuur(sarEkhlel),
    baiguullagiinNer: baiguullaga.ner || "",
    barilgiinNer: barilga?.ner || "",
    nekhemjilsen: niit.nekhemjilsen,
    tulsun: niit.tulsun,
    tuluugui: niit.tuluugui,
    saraar,
    ailiinAvlaga: {
      niit: niit.tuluugui,
      khetersen: khetersen.khetersen,
      boloogui: Math.max(0, niit.tuluugui - khetersen.khetersen),
      khetersenAilToo: khetersen.ailuud.size,
      // Зөвхөн тоот + дүн
      ailuud: Array.from(khetersen.ailuud.values())
        .map((a) => ({ toot: a.toot, dun: a.dun }))
        .sort(tootoorEremblekh),
    },
    miniiTulbur: Math.max(0, miniiUldegdel[0]?.dun || 0),
  });
});
