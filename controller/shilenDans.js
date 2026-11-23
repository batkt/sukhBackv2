/**
 * Шилэн данс — СӨХ-ийн дансны үлдэгдэл, орлого, зарлага, авлага.
 *
 * Банкны хуулга (CGW) АШИГЛАХГҮЙ — бүгд гараар:
 *  - Эхний үлдэгдэл: ажилтан барилга тус бүрд огноотой нь оруулна
 *    (shilenDansEkhniiUldegdel).
 *  - Орлого: оршин суугчдын ТӨЛСӨН мөнгө (guilgeeAvlaguud, dun < 0, хөнгөлөлтгүй).
 *  - Зарлага: ажилтан гараар бүртгэнэ (shilenDansZarlaga).
 *  - Үлдэгдэл(T) = эхний үлдэгдэл + орлого − зарлага, эхний үлдэгдлийн
 *    огнооноос T хүртэл.
 *  - Авлага: оршин суугчдын ТӨЛӨӨГҮЙ мөнгө.
 *
 * Замууд (routes/shilenDansRoute.js):
 *  - POST   /shilenDans/tailan             — вэб тайлан (ажилтан)
 *  - POST   /shilenDans/ekhniiUldegdel     — эхний үлдэгдэл анх оруулах (ажилтан)
 *  - PUT    /shilenDans/ekhniiUldegdel     — засах (шалтгаантай)
 *  - POST   /shilenDansZarlaga             — зарлага нэмэх (ажилтан)
 *  - PUT    /shilenDansZarlaga/:id         — засах (шалтгаантай)
 *  - DELETE /shilenDansZarlaga/:id         — устгах (шалтгаантай)
 *  - POST   /shilenDans/app                — оршин суугчийн апп
 */
const asyncHandler = require("express-async-handler");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const ZogsoolGaraarOrlogo = require("../models/zogsoolGaraarOrlogo");
const ShilenDansZarlaga = require("../models/shilenDansZarlaga");
const ShilenDansEkhniiUldegdel = require("../models/shilenDansEkhniiUldegdel");
const {
  shilenDansAppKharuulakhEsekh,
  shilenDansAilKharuulakhEsekh,
} = require("../utils/baiguullagiinTokhirgoo");

/** Зарлагын ангилал. sukhWeb sankhuu/shilenDans хуудас үүнийг серверээс авна. */
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

/** Хугацаа хэтэрсэн гэж үзэх хоног (нэхэмжилсэн огнооноос). */
const KHETERSEN_KHONOG = 30;
const TZ = "Asia/Ulaanbaatar";

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

/** "YYYY-MM-DD" эсвэл ISO → өдрийн эхлэл. */
function udriinEkhlel(utga) {
  if (!utga) return null;
  const d = new Date(utga);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

const pad = (n) => String(n).padStart(2, "0");
const sarTulkhuur = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Хөнгөлөлт биш төлөлтийн мөр (dun < 0). */
const TULSUN_MATCH = {
  dun: { $lt: 0 },
  turul: { $ne: "Хөнгөлөлт" },
  source: { $ne: "khungulult" },
};

/** Хугацааны төлсөн мөнгө (орлого). */
async function tulsunNiilber(kholbolt, baseMatch, ekhlel, tugsgul) {
  const r = await GuilgeeAvlaguud(kholbolt).aggregate([
    { $match: { ...baseMatch, ...TULSUN_MATCH, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
    { $group: { _id: null, dun: { $sum: { $abs: "$dun" } } } },
  ]);
  return r[0]?.dun || 0;
}

/** Хугацааны гар зарлага. */
async function zarlagaNiilber(kholbolt, baseMatch, ekhlel, tugsgul) {
  const r = await ShilenDansZarlaga(kholbolt).aggregate([
    { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
    { $group: { _id: null, dun: { $sum: "$dun" } } },
  ]);
  return r[0]?.dun || 0;
}

/**
 * T агшин дахь дансны үлдэгдэл. Эхний үлдэгдэл оруулаагүй бол null.
 * T нь эхний үлдэгдлийн огнооноос өмнө бол мөн null (мэдэгдэхгүй), харин
 * яг өмнөх агшин бол эхний үлдэгдэл өөрөө.
 */
async function uldegdelAvya(kholbolt, baseMatch, ekhnii, T) {
  if (!ekhnii) return null;
  const ekhlel = new Date(ekhnii.ognoo);
  if (T < ekhlel) return T.getTime() === ekhlel.getTime() - 1 ? ekhnii.dun : null;
  const [orlogo, zarlaga] = await Promise.all([
    tulsunNiilber(kholbolt, baseMatch, ekhlel, T),
    zarlagaNiilber(kholbolt, baseMatch, ekhlel, T),
  ]);
  return ekhnii.dun + orlogo - zarlaga;
}

/** Сар бүрийн орлого/зарлага (мөнгөн урсгалын график). */
async function saraarAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const sarGroup = {
    $dateToString: { format: "%Y-%m", date: "$ognoo", timezone: TZ },
  };
  const [orlogo, zarlaga] = await Promise.all([
    GuilgeeAvlaguud(kholbolt).aggregate([
      { $match: { ...baseMatch, ...TULSUN_MATCH, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
      { $group: { _id: sarGroup, dun: { $sum: { $abs: "$dun" } } } },
    ]),
    ShilenDansZarlaga(kholbolt).aggregate([
      { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
      { $group: { _id: sarGroup, dun: { $sum: "$dun" } } },
    ]),
  ]);
  const map = new Map();
  for (const o of orlogo) map.set(o._id, { orlogo: o.dun, zarlaga: 0 });
  for (const z of zarlaga) {
    const m = map.get(z._id) || { orlogo: 0, zarlaga: 0 };
    m.zarlaga = z.dun;
    map.set(z._id, m);
  }
  return map;
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

/** Хугацааны эцсийн авлага (төлөөгүй мөнгө). */
async function avlagaAvya(kholbolt, baseMatch, tugsgul) {
  const r = await GuilgeeAvlaguud(kholbolt).aggregate([
    { $match: { ...baseMatch, ognoo: { $lte: tugsgul } } },
    { $group: { _id: null, dun: { $sum: "$dun" } } },
  ]);
  return Math.max(0, r[0]?.dun || 0);
}

/**
 * Айл (гэрээ) тус бүрийн авлагыг насжилттай нь бодно. Төлөлт, хөнгөлөлтийг
 * хамгийн ХУУЧИН нэхэмжлэлээс эхэлж хасна (FIFO — /tailan/avlagiin-nasjilt-тай
 * ижил зарчим). Үлдсэн нэхэмжлэл KHETERSEN_KHONOG-оос хуучин бол хэтэрсэн.
 */
async function ailiinAvlagaAvya(kholbolt, baseMatch, tugsgul) {
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
  const khetersenZaag = odoo - KHETERSEN_KHONOG * 86400000;
  let khetersen = 0;
  let boloogui = 0;
  const ailuud = [];

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
      ailuud.push({
        gereeniiId,
        toot: g.toot,
        dun: ailKhetersen,
        khonog: Math.floor((odoo - khamgiinKhuuchin.getTime()) / 86400000),
      });
    }
  }

  return {
    niit: khetersen + boloogui,
    khetersen,
    boloogui,
    khetersenAilToo: ailuud.length,
    ailuud: ailuud.sort((a, b) => b.khonog - a.khonog || b.dun - a.dun),
  };
}

async function zogsoolKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const { Uilchluulegch } = require("sukhParking-v1");

  // Дууссан бичлэгүүд Uilchluulegch{YYYYMM} архив руу зөөгддөг
  // (tailan.js:tailanZogsool-ийг үз) — хөрш сарын нөөцтэй уншина.
  const arkhivNeruud = [];
  for (
    let d = new Date(ekhlel.getFullYear(), ekhlel.getMonth() - 1, 1);
    d <= new Date(tugsgul.getFullYear(), tugsgul.getMonth() + 1, 1);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    arkhivNeruud.push(`Uilchluulegch${d.getFullYear()}${pad(d.getMonth() + 1)}`);
  }

  // Төлбөр хийгдэх үед сесс аль хэдийн үүссэн байх тул createdAt-аар
  // нэг сарын өмнөөс авч, төлбөрийн огноогоор шүүнэ.
  const ulMatch = {
    createdAt: {
      $gte: new Date(ekhlel.getFullYear(), ekhlel.getMonth() - 1, ekhlel.getDate()),
      $lte: tugsgul,
    },
  };
  if (baseMatch.barilgiinId) ulMatch.barilgiinId = baseMatch.barilgiinId;

  const jagsaaltuud = await Promise.all([
    Uilchluulegch(kholbolt, true).find(ulMatch).select("tuukh.tulbur").lean(),
    ...arkhivNeruud.map((ner) =>
      Uilchluulegch(kholbolt, true, ner)
        .find(ulMatch)
        .select("tuukh.tulbur")
        .lean()
        .catch(() => []),
    ),
  ]);

  const uzsen = new Set();
  const turlaar = {};
  let kamer = 0;
  for (const doc of jagsaaltuud.flat()) {
    const key = String(doc._id);
    if (uzsen.has(key)) continue;
    uzsen.add(key);
    for (const t of doc.tuukh || []) {
      for (const tl of t.tulbur || []) {
        const ognoo = tl?.ognoo ? new Date(tl.ognoo) : null;
        if (!ognoo || ognoo < ekhlel || ognoo > tugsgul) continue;
        const dun = Number(tl.dun) || 0;
        if (!dun) continue;
        const turul = tl.turul || "busad";
        turlaar[turul] = (turlaar[turul] || 0) + dun;
        kamer += dun;
      }
    }
  }

  const udurStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const garaar = await ZogsoolGaraarOrlogo(kholbolt).aggregate([
    {
      $match: {
        ...baseMatch,
        udur: { $gte: udurStr(ekhlel), $lte: udurStr(tugsgul) },
      },
    },
    { $group: { _id: { $ifNull: ["$khelber", "belen"] }, dun: { $sum: "$dun" } } },
  ]);
  let garaarNiit = 0;
  for (const g of garaar) {
    garaarNiit += g.dun || 0;
    turlaar[g._id] = (turlaar[g._id] || 0) + (g.dun || 0);
  }

  return {
    niit: kamer + garaarNiit,
    kamer,
    garaar: garaarNiit,
    turlaar: Object.entries(turlaar)
      .map(([turul, dun]) => ({ turul, dun }))
      .sort((a, b) => b.dun - a.dun),
  };
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

/** Ажилтны хүсэлтийн нийтлэг шалгалт: ажилтан мөн, холболт, барилга. */
async function ajiltniiKhuselt(req, res, { barilgaZaaval = true } = {}) {
  if (!(await ajiltanEsekh(req))) {
    aldaaKhariu(res, 403, "Энэ үйлдлийг хийх эрх байхгүй байна!");
    return null;
  }
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  if (!kholbolt) {
    aldaaKhariu(res, 404, "Холболтын мэдээлэл олдсонгүй");
    return null;
  }
  const barilgiinId = req.body.barilgiinId ? String(req.body.barilgiinId) : "";
  if (barilgaZaaval && !barilgiinId) {
    aldaaKhariu(res, 400, "Барилга сонгоно уу");
    return null;
  }
  const token = req.body.nevtersenAjiltniiToken || {};
  return {
    kholbolt,
    baiguullagiinId: String(kholbolt.baiguullagiinId),
    barilgiinId,
    ajiltan: { ajiltniiId: String(token.id || ""), ajiltniiNer: token.ner || "" },
  };
}

function zarlagaShalgakh(body) {
  const ognoo = udriinEkhlel(body.ognoo);
  const dun = Number(body.dun);
  const angilal = String(body.angilal || "");
  if (!ognoo) return { aldaa: "Огноо буруу байна" };
  if (!(dun > 0)) return { aldaa: "Дүн 0-ээс их байх ёстой" };
  if (!ZARLAGIIN_ANGILAL.includes(angilal)) return { aldaa: "Ангилал буруу байна" };
  return {
    utga: {
      ognoo,
      dun,
      angilal,
      tailbar: body.tailbar ? String(body.tailbar).slice(0, 500) : "",
    },
  };
}

exports.ZARLAGIIN_ANGILAL = ZARLAGIIN_ANGILAL;

exports.shilenDansTailan = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const { ekhlel, tugsgul } = khugatsaaZadlakh(req.body.ekhlekhOgnoo, req.body.duusakhOgnoo);
  if (isNaN(ekhlel.getTime()) || isNaN(tugsgul.getTime()) || ekhlel > tugsgul) {
    return aldaaKhariu(res, 400, "Огноо буруу байна");
  }
  const baseMatch = { baiguullagiinId: k.baiguullagiinId, barilgiinId: k.barilgiinId };

  const ekhnii = await ShilenDansEkhniiUldegdel(k.kholbolt).findOne(baseMatch).lean();

  const [ekhniiUldegdel, etssiinUldegdel, orlogo, zarlaguud, avlaga, zogsool] =
    await Promise.all([
      uldegdelAvya(k.kholbolt, baseMatch, ekhnii, new Date(ekhlel.getTime() - 1)),
      uldegdelAvya(k.kholbolt, baseMatch, ekhnii, tugsgul),
      tulsunNiilber(k.kholbolt, baseMatch, ekhlel, tugsgul),
      ShilenDansZarlaga(k.kholbolt)
        .find({ ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } })
        .sort({ ognoo: -1, createdAt: -1 })
        .lean(),
      avlagaAvya(k.kholbolt, baseMatch, tugsgul),
      zogsoolKhesegAvya(k.kholbolt, baseMatch, ekhlel, tugsgul).catch((err) => {
        console.error("shilenDans zogsool:", err.message);
        return null;
      }),
    ]);

  res.json({
    success: true,
    ekhlekhOgnoo: ekhlel,
    duusakhOgnoo: tugsgul,
    zarlagiinAngilaluud: ZARLAGIIN_ANGILAL,
    ekhniiUldegdelBichlel: ekhnii
      ? { ognoo: ekhnii.ognoo, dun: ekhnii.dun, ajiltniiNer: ekhnii.ajiltniiNer || "" }
      : null,
    ekhniiUldegdel,
    orlogo,
    zarlaga: zarlaguud.reduce((s, z) => s + (Number(z.dun) || 0), 0),
    etssiinUldegdel,
    avlaga,
    zarlaguud,
    zarlagaAngilalaar: angilalaarNiilberle(zarlaguud),
    zogsool,
  });
});

/** Эхний үлдэгдэл анх оруулах. Байгаа бол PUT-ээр (шалтгаантай) засна. */
exports.shilenDansEkhniiUldegdelNemekh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const ognoo = udriinEkhlel(req.body.ognoo);
  const dun = Number(req.body.dun);
  if (!ognoo || !Number.isFinite(dun)) return aldaaKhariu(res, 400, "Огноо, дүн буруу байна");
  const M = ShilenDansEkhniiUldegdel(k.kholbolt);
  const baseMatch = { baiguullagiinId: k.baiguullagiinId, barilgiinId: k.barilgiinId };
  if (await M.exists(baseMatch)) {
    return aldaaKhariu(
      res,
      409,
      "Эхний үлдэгдэл аль хэдийн оруулсан байна — засах товчоор өөрчилнө үү",
    );
  }
  const doc = await new M({ ...baseMatch, ognoo, dun, ...k.ajiltan }).save();
  res.json({ success: true, result: doc });
});

exports.shilenDansEkhniiUldegdelZasakh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const ognoo = udriinEkhlel(req.body.ognoo);
  const dun = Number(req.body.dun);
  if (!ognoo || !Number.isFinite(dun)) return aldaaKhariu(res, 400, "Огноо, дүн буруу байна");
  const doc = await ShilenDansEkhniiUldegdel(k.kholbolt).findOneAndUpdate(
    { baiguullagiinId: k.baiguullagiinId, barilgiinId: k.barilgiinId },
    { $set: { ognoo, dun, ...k.ajiltan } },
    { new: true },
  );
  if (!doc) return aldaaKhariu(res, 404, "Эхний үлдэгдэл олдсонгүй");
  res.json({ success: true, result: doc });
});

exports.shilenDansZarlagaNemekh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res);
  if (!k) return;
  const { aldaa, utga } = zarlagaShalgakh(req.body || {});
  if (aldaa) return aldaaKhariu(res, 400, aldaa);
  const M = ShilenDansZarlaga(k.kholbolt);
  const doc = await new M({
    baiguullagiinId: k.baiguullagiinId,
    barilgiinId: k.barilgiinId,
    ...utga,
    ...k.ajiltan,
  }).save();
  res.json({ success: true, result: doc });
});

exports.shilenDansZarlagaZasakh = asyncHandler(async (req, res) => {
  const k = await ajiltniiKhuselt(req, res, { barilgaZaaval: false });
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
  const k = await ajiltniiKhuselt(req, res, { barilgaZaaval: false });
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

  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === baiguullagiinId,
  );
  if (!kholbolt) return aldaaKhariu(res, 404, "Холболтын мэдээлэл олдсонгүй");

  // Сонгосон сар (анхдагч: энэ сар) ба мөнгөн урсгалын 6 сар
  const sarMatch = /^(\d{4})-(\d{2})$/.exec(String(req.body.sar || ""));
  const odoo = new Date();
  const jil = sarMatch ? Number(sarMatch[1]) : odoo.getFullYear();
  const sarIndex = sarMatch ? Number(sarMatch[2]) - 1 : odoo.getMonth();
  const sarEkhlel = new Date(jil, sarIndex, 1, 0, 0, 0, 0);
  const sarTugsgul = new Date(jil, sarIndex + 1, 0, 23, 59, 59, 999);
  const urgalEkhlel = new Date(jil, sarIndex - 5, 1, 0, 0, 0, 0);
  const tugsgul = sarTugsgul > odoo ? odoo : sarTugsgul;

  const baseMatch = { baiguullagiinId, barilgiinId };

  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId, orshinSuugchId: orshinSuugchiinId })
    .select("_id")
    .lean();
  const gereeniiIduud = gereenuud.map((g) => String(g._id));

  const ekhnii = await ShilenDansEkhniiUldegdel(kholbolt).findOne(baseMatch).lean();

  const [uldegdel, saraarMap, sariinZarlaguud, ailiinAvlaga, miniiUldegdel] =
    await Promise.all([
      uldegdelAvya(kholbolt, baseMatch, ekhnii, tugsgul),
      saraarAvya(kholbolt, baseMatch, urgalEkhlel, tugsgul),
      ShilenDansZarlaga(kholbolt)
        .find({ ...baseMatch, ognoo: { $gte: sarEkhlel, $lte: tugsgul } })
        .select("angilal dun")
        .lean(),
      ailiinAvlagaAvya(kholbolt, baseMatch, tugsgul),
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
    saraar.push({ sar: key, orlogo: s?.orlogo || 0, zarlaga: s?.zarlaga || 0 });
  }
  const songosonSar = saraar[saraar.length - 1];

  const ailKharuulakh = shilenDansAilKharuulakhEsekh(baiguullaga, barilgiinId);
  const barilga = (baiguullaga.barilguud || []).find((b) => String(b._id) === barilgiinId);

  res.json({
    success: true,
    sar: sarTulkhuur(sarEkhlel),
    baiguullagiinNer: baiguullaga.ner || "",
    barilgiinNer: barilga?.ner || "",
    dansniiUldegdel: uldegdel,
    orlogo: songosonSar.orlogo,
    zarlaga: songosonSar.zarlaga,
    sariinZuruu: songosonSar.orlogo - songosonSar.zarlaga,
    saraar,
    zarlagaAngilalaar: angilalaarNiilberle(sariinZarlaguud),
    ailiinAvlaga: {
      niit: ailiinAvlaga.niit,
      khetersen: ailiinAvlaga.khetersen,
      boloogui: ailiinAvlaga.boloogui,
      khetersenAilToo: ailiinAvlaga.khetersenAilToo,
      // Айл тус бүрийн жагсаалт зөвхөн удирдлага зөвшөөрсөн үед
      ailuud: ailKharuulakh
        ? ailiinAvlaga.ailuud.map((a) => ({ toot: a.toot, dun: a.dun, khonog: a.khonog }))
        : null,
    },
    miniiTulbur: Math.max(0, miniiUldegdel[0]?.dun || 0),
  });
});
