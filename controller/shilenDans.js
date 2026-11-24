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
 *  - Зардал = СӨХ-ийн бодит зарлага, ажилтан гараар бүртгэнэ (shilenDansZarlaga)
 *  - Хуримтлал = Төлсөн (орлого) − Зардал
 *
 * Замууд (routes/shilenDansRoute.js):
 *  - POST /shilenDans/tailan — вэб (ажилтан): бүрэн мэдээлэл (нэр, орц, хоног)
 *  - POST /shilenDans/app    — оршин суугчийн апп: хэтэрсэн айл зөвхөн тоот + дүн
 *  - POST   /shilenDansZarlaga      — зарлага нэмэх (ажилтан)
 *  - PUT    /shilenDansZarlaga/:id  — засах (шалтгаантай)
 *  - DELETE /shilenDansZarlaga/:id  — устгах (шалтгаантай)
 */
const asyncHandler = require("express-async-handler");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const ShilenDansZarlaga = require("../models/shilenDansZarlaga");
const { shilenDansAppKharuulakhEsekh } = require("../utils/baiguullagiinTokhirgoo");

/** Зарлагын ангилал. Вэб үүнийг серверээс авна. */
const ZARLAGIIN_ANGILAL = [
  "Цалин",
  "НДШ, татвар",
  "Цэвэрлэгээ",
  "Засвар үйлчилгээ",
  "Цахилгаан",
  "Ус",
  "Дулаан",
  "Лифт",
  "Харуул хамгаалалт",
  "Банкны шимтгэл",
  "Бусад",
];

/** Хуучин хувилбарын гар орлогын бичлэгийг алгасна. */
const ZARLAGA_MATCH = { turul: { $ne: "orlogo" } };

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

const toId = (id) => {
  try {
    const mongoose = require("mongoose");
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
};

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
                {
                  $and: [
                    { $or: [{ $lt: ["$dun", 0] }, { $gt: ["$tulsunDun", 0] }] },
                    { $not: KHUNGULULT_ESEKH },
                  ],
                },
                {
                  $cond: [
                    { $gt: ["$tulsunDun", 0] },
                    "$tulsunDun",
                    { $abs: "$dun" },
                  ],
                },
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

/** Хугацааны зарлагын жагсаалт. */
function zarlaguudAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  return ShilenDansZarlaga(kholbolt)
    .find({ ...baseMatch, ...ZARLAGA_MATCH, ognoo: { $gte: ekhlel, $lte: tugsgul } })
    .sort({ ognoo: -1, createdAt: -1 })
    .lean();
}

function angilalaarNiilberle(zarlaguud) {
  const map = {};
  for (const z of zarlaguud) {
    const k = z.angilal || "Бусад";
    map[k] = (map[k] || 0) + (Number(z.dun) || 0);
  }
  return Object.entries(map)
    .map(([angilal, dun]) => ({ angilal, dun }))
    .sort((a, b) => b.dun - a.dun);
}

const niilber = (j) => j.reduce((sum, z) => sum + (Number(z.dun) || 0), 0);

/** Сар бүрийн нэхэмжилсэн/төлсөн/зардал (аппын график). */
async function saraarAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const sarGroup = { $dateToString: { format: "%Y-%m", date: "$ognoo", timezone: TZ } };
  const zardal = await ShilenDansZarlaga(kholbolt).aggregate([
    { $match: { ...baseMatch, ...ZARLAGA_MATCH, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
    { $group: { _id: sarGroup, dun: { $sum: "$dun" } } },
  ]);
  const zardalMap = new Map(zardal.map((z) => [z._id, z.dun]));
  const r = await GuilgeeAvlaguud(kholbolt).aggregate([
    { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$ognoo", timezone: TZ } },
        nekhemjilsen: { $sum: { $cond: [{ $gt: ["$dun", 0] }, "$dun", 0] } },
        tulsun: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $or: [{ $lt: ["$dun", 0] }, { $gt: ["$tulsunDun", 0] }] },
                  { $not: KHUNGULULT_ESEKH },
                ],
              },
              {
                $cond: [
                  { $gt: ["$tulsunDun", 0] },
                  "$tulsunDun",
                  { $abs: "$dun" },
                ],
              },
              0,
            ],
          },
        },
      },
    },
  ]);
  const map = new Map(r.map((x) => [x._id, { ...x, zardal: zardalMap.get(x._id) || 0 }]));
  for (const [sar, dun] of zardalMap) {
    if (!map.has(sar)) map.set(sar, { nekhemjilsen: 0, tulsun: 0, zardal: dun });
  }
  return map;
}

/**
 * Айл (гэрээ) тус бүрийн хугацаа хэтэрсэн авлага. Төлөлт, хөнгөлөлтийг
 * хамгийн ХУУЧИН нэхэмжлэлээс эхэлж хасна (FIFO — /tailan/avlagiin-nasjilt-тай
 * ижил зарчим). Үлдсэн нэхэмжлэл KHETERSEN_KHONOG-оос хуучин бол хэтэрсэн.
 */
async function khetersenAvya(kholbolt, baseMatch, tugsgul) {
  const muruud = await GuilgeeAvlaguud(kholbolt)
    .find({ ...baseMatch, ognoo: { $lte: tugsgul } })
    .select("gereeniiId toot dun tulsunDun ognoo")
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
    const tulsun = Number(m.tulsunDun) || 0;
    if (dun > 0) g.nekhemjlel.push({ ognoo: new Date(m.ognoo), dun });
    else if (dun < 0) g.khasakh += -dun;
    else if (tulsun > 0) g.khasakh += tulsun;
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
async function ailiinTootsooAvya(kholbolt, baseMatch, barilgiinId, ekhlel, tugsgul, khetersenMap) {
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
                {
                  $and: [
                    { $gte: ["$ognoo", ekhlel] },
                    { $or: [{ $lt: ["$dun", 0] }, { $gt: ["$tulsunDun", 0] }] },
                  ],
                },
                {
                  $cond: [
                    { $gt: ["$tulsunDun", 0] },
                    "$tulsunDun",
                    { $abs: "$dun" },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    ]),
    Geree(kholbolt, true)
      .find({ baiguullagiinId: String(kholbolt.baiguullagiinId), barilgiinId: String(barilgiinId) })
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
  const Geree = require("../models/geree");
  const mongoose = require("mongoose");
  const toId = (id) => {
    try {
      return new mongoose.Types.ObjectId(String(id));
    } catch {
      return null;
    }
  };

  const barilgiinIdObj = toId(barilgiinId);
  const allBarilgaIds = barilgiinIdObj ? [String(barilgiinId), barilgiinIdObj] : [String(barilgiinId)];

  const buildingGerees = await Geree(kholbolt, true)
    .find({
      baiguullagiinId: String(kholbolt.baiguullagiinId),
      barilgiinId: { $in: allBarilgaIds },
    })
    .select("_id toot burtgesenAjiltan orshinSuugchNer")
    .lean();
  const buildingGereeIdStrs = buildingGerees.map((g) => String(g._id));
  const buildingGereeObjIds = buildingGerees.map((g) => toId(g._id)).filter(Boolean);
  const allGereeIds = Array.from(new Set([...buildingGereeIdStrs, ...buildingGereeObjIds]));

  const gereeMap = new Map();
  buildingGerees.forEach((g) => {
    gereeMap.set(String(g._id), g);
  });

  const baseMatch = {
    baiguullagiinId: String(kholbolt.baiguullagiinId),
    $or: [
      { barilgiinId: { $in: allBarilgaIds } },
      { gereeniiId: { $in: allGereeIds } },
    ],
  };
  const zarlagaMatch = {
    baiguullagiinId: String(kholbolt.baiguullagiinId),
    barilgiinId: { $in: allBarilgaIds },
  };

  const [niit, khetersen, zarlaguud, orloguud] = await Promise.all([
    niitAvya(kholbolt, baseMatch, ekhlel, tugsgul),
    khetersenAvya(kholbolt, baseMatch, tugsgul),
    zarlaguudAvya(kholbolt, zarlagaMatch, ekhlel, tugsgul),
    GuilgeeAvlaguud(kholbolt)
      .find({
        baiguullagiinId: String(kholbolt.baiguullagiinId),
        $and: [
          {
            $or: [
              { barilgiinId: { $in: allBarilgaIds } },
              { gereeniiId: { $in: allGereeIds } },
            ],
          },
          {
            $or: [{ dun: { $lt: 0 } }, { tulsunDun: { $gt: 0 } }],
          },
        ],
        ognoo: { $gte: ekhlel, $lte: tugsgul },
        turul: { $ne: "Хөнгөлөлт" },
        source: { $ne: "khungulult" },
      })
      .select("ognoo dun tulsunDun tailbar toot toots turul zardliinNer nemeltTailbar createdAt guilgeeKhiisenAjiltniiNer gereeniiId bankniiGuilgeeId source")
      .sort({ ognoo: -1, createdAt: -1 })
      .lean(),
  ]);
  const zardal = niilber(zarlaguud);
  const ailuud = await ailiinTootsooAvya(kholbolt, baseMatch, barilgiinId, ekhlel, tugsgul, khetersen.ailuud);

  // Дутуу гэрээнүүдийг гүйцээн татах
  const extraGereeIds = Array.from(
    new Set(
      orloguud
        .map((o) => (o.gereeniiId ? String(o.gereeniiId) : null))
        .filter((id) => id && !gereeMap.has(id)),
    ),
  );
  if (extraGereeIds.length > 0) {
    const extraGerees = await Geree(kholbolt, true)
      .find({ _id: { $in: extraGereeIds } })
      .select("_id toot burtgesenAjiltan orshinSuugchNer")
      .lean();
    extraGerees.forEach((g) => gereeMap.set(String(g._id), g));
  }

  // Банкны гүйлгээнээс холбосон ажилтныг татах
  const BankniiGuilgee = require("../models/bankniiGuilgee");
  const bankniiGuilgeeIds = Array.from(
    new Set(
      orloguud
        .map((o) => (o.bankniiGuilgeeId ? String(o.bankniiGuilgeeId) : null))
        .filter(Boolean),
    ),
  );
  const bankGuilgeeMap = new Map();
  if (bankniiGuilgeeIds.length > 0) {
    const bGuilgeenuud = await BankniiGuilgee(kholbolt)
      .find({ _id: { $in: bankniiGuilgeeIds } })
      .select("_id kholbosonAjiltniiNer guilgeeUusgesenAjiltan toot")
      .lean();
    bGuilgeenuud.forEach((bg) => bankGuilgeeMap.set(String(bg._id), bg));
  }

  const tootOlyo = (o) => {
    if (o.toot && String(o.toot).trim() && String(o.toot).trim() !== "—") {
      return String(o.toot).trim();
    }
    if (Array.isArray(o.toots) && o.toots.length > 0 && o.toots[0]) {
      return String(o.toots[0]).trim();
    }
    const bg = o.bankniiGuilgeeId ? bankGuilgeeMap.get(String(o.bankniiGuilgeeId)) : null;
    if (bg?.toot && String(bg.toot).trim()) {
      return String(bg.toot).trim();
    }
    const g = o.gereeniiId ? gereeMap.get(String(o.gereeniiId)) : null;
    if (g?.toot && String(g.toot).trim()) {
      return String(g.toot).trim();
    }
    const texts = [o.tailbar, o.nemeltTailbar, o.turul, o.zardliinNer].filter(Boolean).join(" ");
    if (texts) {
      const m1 = texts.match(/\(?[Тт]оот[:\s\-]*([A-Za-z0-9А-Яа-я_\-]+)\)?/i);
      if (m1 && m1[1] && m1[1].toLowerCase() !== "төлөлт") return m1[1].trim();

      const m2 = texts.match(/([A-Za-z0-9А-Яа-я_\-]+)(?:-?р)?\s*тоот/i);
      if (m2 && m2[1] && m2[1].toLowerCase() !== "нэмэлт") return m2[1].trim();
    }
    return "";
  };

  const ajiltanOlyo = (o) => {
    if (o.guilgeeKhiisenAjiltniiNer && String(o.guilgeeKhiisenAjiltniiNer).trim() && String(o.guilgeeKhiisenAjiltniiNer).trim() !== "—") {
      return String(o.guilgeeKhiisenAjiltniiNer).trim();
    }
    const bg = o.bankniiGuilgeeId ? bankGuilgeeMap.get(String(o.bankniiGuilgeeId)) : null;
    if (bg?.kholbosonAjiltniiNer && String(bg.kholbosonAjiltniiNer).trim()) {
      return String(bg.kholbosonAjiltniiNer).trim();
    }
    if (bg?.guilgeeUusgesenAjiltan && String(bg.guilgeeUusgesenAjiltan).trim()) {
      return String(bg.guilgeeUusgesenAjiltan).trim();
    }
    const g = o.gereeniiId ? gereeMap.get(String(o.gereeniiId)) : null;
    if (g?.burtgesenAjiltan && String(g.burtgesenAjiltan).trim()) {
      return String(g.burtgesenAjiltan).trim();
    }
    const src = String(o.source || "").toLowerCase();
    const txt = [o.tailbar, o.nemeltTailbar, o.turul].filter(Boolean).join(" ").toLowerCase();
    if (src === "qpay" || txt.includes("qpay")) {
      return "QPay";
    }
    if (src === "bank" || o.bankniiGuilgeeId || txt.includes("банк") || txt.includes("данс")) {
      return "Банк тулгалт";
    }
    if (src === "gar") {
      return "Ажилтан";
    }
    if (src === "system" || src === "excel_import") {
      return "Систем";
    }
    return "Систем";
  };

  const formattedOrloguud = orloguud.map((o) => {
    const rawDun = Number(o.tulsunDun) > 0 ? Number(o.tulsunDun) : Math.abs(Number(o.dun) || 0);
    return {
      _id: String(o._id),
      ognoo: o.ognoo,
      dun: rawDun,
      toot: tootOlyo(o),
      tailbar: o.tailbar || o.zardliinNer || o.nemeltTailbar || o.turul || "Төлбөр",
      turul: o.turul || "Төлбөр",
      ajiltniiNer: ajiltanOlyo(o),
      createdAt: o.createdAt || o.ognoo,
    };
  });

  res.json({
    success: true,
    ekhlekhOgnoo: ekhlel,
    duusakhOgnoo: tugsgul,
    khetersenKhonog: KHETERSEN_KHONOG,
    ...niit,
    khetersen: khetersen.khetersen,
    khetersenAilToo: khetersen.ailuud.size,
    zardal,
    khurimtlal: niit.tulsun - zardal,
    zarlagiinAngilaluud: ZARLAGIIN_ANGILAL,
    zarlaguud,
    orloguud: formattedOrloguud,
    zarlagaAngilalaar: angilalaarNiilberle(zarlaguud),
    ailuud,
  });
});

/** Ажилтны хүсэлтийн нийтлэг шалгалт: ажилтан мөн, холболт. */
async function ajiltniiKhuselt(req, res) {
  if (!(await ajiltanEsekh(req))) {
    aldaaKhariu(res, 403, "Энэ үйлдлийг хийх эрх байхгүй байна!");
    return null;
  }
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  if (!kholbolt) {
    aldaaKhariu(res, 404, "Холболтын мэдээлэл олдсонгүй");
    return null;
  }
  const token = req.body.nevtersenAjiltniiToken || {};
  return {
    kholbolt,
    baiguullagiinId: String(kholbolt.baiguullagiinId),
    ajiltan: { ajiltniiId: String(token.id || ""), ajiltniiNer: token.ner || "" },
  };
}

/** "YYYY-MM-DD" эсвэл ISO → өдрийн эхлэл. */
function udriinEkhlel(utga) {
  if (!utga) return null;
  const d = new Date(utga);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function zarlagaShalgakh(body) {
  const ognoo = udriinEkhlel(body.ognoo);
  const dun = Math.round(Number(body.dun) * 100) / 100;
  const angilal = String(body.angilal || "");
  if (!ognoo) return { aldaa: "Огноо буруу байна" };
  if (!(dun > 0)) return { aldaa: "Дүн 0-ээс их байх ёстой" };
  if (!ZARLAGIIN_ANGILAL.includes(angilal)) return { aldaa: "Ангилал буруу байна" };
  return {
    utga: {
      turul: "zarlaga",
      ognoo,
      dun,
      angilal,
      tailbar: body.tailbar ? String(body.tailbar).slice(0, 500) : "",
    },
  };
}

exports.shilenDansZarlagaNemekh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const barilgiinId = req.body.barilgiinId ? String(req.body.barilgiinId) : "";
  if (!barilgiinId) return aldaaKhariu(res, 400, "Барилга сонгоно уу");
  const { aldaa, utga } = zarlagaShalgakh(req.body || {});
  if (aldaa) return aldaaKhariu(res, 400, aldaa);
  const M = ShilenDansZarlaga(k.kholbolt);
  const doc = await new M({
    baiguullagiinId: k.baiguullagiinId,
    barilgiinId,
    ...utga,
    ...k.ajiltan,
  }).save();
  res.json({ success: true, result: doc });
});

exports.shilenDansZarlagaZasakh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const { aldaa, utga } = zarlagaShalgakh(req.body || {});
  if (aldaa) return aldaaKhariu(res, 400, aldaa);
  const doc = await ShilenDansZarlaga(k.kholbolt).findOneAndUpdate(
    { _id: req.params.id, baiguullagiinId: k.baiguullagiinId },
    { $set: { ...utga, ...k.ajiltan } },
    { new: true },
  );
  if (!doc) return aldaaKhariu(res, 404, "Зарлага олдсонгүй");
  res.json({ success: true, result: doc });
});

exports.shilenDansZarlagaUstgakh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const doc = await ShilenDansZarlaga(k.kholbolt).findOneAndDelete({
    _id: req.params.id,
    baiguullagiinId: k.baiguullagiinId,
  });
  if (!doc) return aldaaKhariu(res, 404, "Зарлага олдсонгүй");
  res.json({ success: true });
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

  const barilgiinIdObj = toId(barilgiinId);
  const allBarilgaIds = barilgiinIdObj ? [String(barilgiinId), barilgiinIdObj] : [String(barilgiinId)];

  const buildingGerees = await Geree(kholbolt, true)
    .find({
      baiguullagiinId: String(kholbolt.baiguullagiinId),
      barilgiinId: { $in: allBarilgaIds },
    })
    .select("_id")
    .lean();
  const buildingGereeIdStrs = buildingGerees.map((g) => String(g._id));
  const buildingGereeObjIds = buildingGerees.map((g) => toId(g._id)).filter(Boolean);
  const allGereeIds = Array.from(new Set([...buildingGereeIdStrs, ...buildingGereeObjIds]));

  const baseMatch = {
    baiguullagiinId: String(kholbolt.baiguullagiinId),
    $or: [
      { barilgiinId: { $in: allBarilgaIds } },
      { gereeniiId: { $in: allGereeIds } },
    ],
  };
  const zarlagaMatch = {
    baiguullagiinId: String(kholbolt.baiguullagiinId),
    barilgiinId: { $in: allBarilgaIds },
  };

  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId, orshinSuugchId: orshinSuugchiinId })
    .select("_id")
    .lean();
  const gereeniiIduud = gereenuud.map((g) => String(g._id));

  const [niit, saraarMap, khetersen, miniiUldegdel, sariinZarlaguud] = await Promise.all([
    niitAvya(kholbolt, baseMatch, sarEkhlel, tugsgul),
    saraarAvya(kholbolt, baseMatch, grafikEkhlel, tugsgul),
    khetersenAvya(kholbolt, baseMatch, tugsgul),
    gereeniiIduud.length
      ? GuilgeeAvlaguud(kholbolt).aggregate([
          { $match: { baiguullagiinId, gereeniiId: { $in: gereeniiIduud } } },
          { $group: { _id: null, dun: { $sum: "$dun" } } },
        ])
      : Promise.resolve([]),
    zarlaguudAvya(kholbolt, zarlagaMatch, sarEkhlel, tugsgul),
  ]);
  const zardal = niilber(sariinZarlaguud);

  const saraar = [];
  for (let i = 5; i >= 0; i--) {
    const key = sarTulkhuur(new Date(jil, sarIndex - i, 1));
    const s = saraarMap.get(key);
    saraar.push({
      sar: key,
      nekhemjilsen: s?.nekhemjilsen || 0,
      tulsun: s?.tulsun || 0,
      zardal: s?.zardal || 0,
    });
  }

  const barilga = (baiguullaga.barilguud || []).find((b) => String(b._id) === barilgiinId);

  res.json({
    success: true,
    sar: sarTulkhuur(sarEkhlel),
    baiguullagiinNer: baiguullaga.ner || "",
    barilgiinNer: barilga?.ner || "",
    nekhemjilsen: niit.nekhemjilsen,
    // Энэ сарын орлого = төлсөн мөнгө; зардал = гар зарлага; хуримтлал = зөрүү
    tulsun: niit.tulsun,
    zardal,
    khurimtlal: niit.tulsun - zardal,
    zarlagaAngilalaar: angilalaarNiilberle(sariinZarlaguud),
    zarlaguud: sariinZarlaguud.map((z) => ({
      _id: String(z._id),
      ognoo: z.ognoo ? new Date(z.ognoo).toISOString().slice(0, 10) : "",
      dun: Number(z.dun) || 0,
      angilal: z.angilal || "Бусад",
      tailbar: z.tailbar || "",
      ajiltniiNer: z.ajiltniiNer || "",
    })),
    tuluugui: niit.tuluugui,
    saraar,
    ailiinAvlaga: {
      niit: niit.tuluugui,
      khetersen: khetersen.khetersen,
      boloogui: Math.max(0, niit.tuluugui - khetersen.khetersen),
      khetersenAilToo: khetersen.ailuud.size,
      // Тоот + дүн + хэтэрсэн хоног
      ailuud: Array.from(khetersen.ailuud.values())
        .map((a) => ({ toot: a.toot, dun: a.dun, khonog: a.khonog || 0 }))
        .sort(tootoorEremblekh),
    },
    miniiTulbur: Math.max(0, miniiUldegdel[0]?.dun || 0),
  });
});
