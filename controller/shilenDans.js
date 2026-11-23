/**
 * Шилэн данс — СӨХ-ийн тухайн хугацааны орлого, зарлага, авлага, дансны
 * үлдэгдлийг нэгтгэнэ.
 *
 *  - POST /shilenDans/tailan          — вэб (Санхүү → Шилэн данс), зөвхөн ажилтан
 *  - POST /shilenDans/zarlagaAngilal  — зарлагын мөрд ангилал онооно, зөвхөн ажилтан
 *  - POST /shilenDans/app             — оршин суугчийн апп; «Нэмэлт тохиргоо →
 *                                       Шилэн данс» асаалттай үед л хариулна
 *
 * Эх сурвалж:
 *  - bankniiGuilgee      — дансны хуулга: орлого/зарлага, үлдэгдэл, зарлагын ангилал
 *  - guilgeeAvlaguud     — нэхэмжилсэн / төлөгдсөн / хөнгөлөлт, авлага
 *                          (/tailan/tulbur-dugnelt-тэй ижил тэмдгийн дүрэм:
 *                           dun > 0 нэхэмжилсэн, dun < 0 төлсөн)
 *  - Uilchluulegch (+сарын архив), zogsoolGaraarOrlogo — зогсоолын орлого
 *
 * Төсөв одоогоор байхгүй (тусдаа model шаардлагатай).
 */
const asyncHandler = require("express-async-handler");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const ZogsoolGaraarOrlogo = require("../models/zogsoolGaraarOrlogo");
const {
  shilenDansAppKharuulakhEsekh,
  shilenDansAilKharuulakhEsekh,
} = require("../utils/baiguullagiinTokhirgoo");

/** Зарлагын ангилал. sukhWeb sankhuu/shilenDans/page.tsx-тэй ижил байх ёстой. */
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
const ANGILAAGUI = "Ангилаагүй";

/** Хугацаа хэтэрсэн гэж үзэх хоног (нэхэмжилсэн огнооноос). */
const KHETERSEN_KHONOG = 30;

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

/** Банк бүр огноог өөр талбарт хадгалдаг — dansKhuulga хуудастай ижил дараалал. */
const bankOgnoo = (r) =>
  r.postDate || r.tranDate || r.TxDt || r.tranPostedDate || r.createdAt || null;

/**
 * Тэмдэгтэй дүн (хасах = зарлага). Банк бүр өөрөөр тэмдэглэдэг: хасах дүн
 * (khan/tdb/bogd), drOrCr "Debit" (golomt), эсвэл outcome (trans).
 * sukhWeb dansKhuulga/page.tsx-ийн логиктой ижил.
 */
function bankDun(r) {
  const tuukhii =
    Number(r.amount ?? r.Amt ?? r.tranAmount ?? r.income ?? r.kholbosonDun ?? 0) || 0;
  const zarlagaEsekh =
    tuukhii < 0 ||
    r.drOrCr === "Debit" ||
    (Number(r.outcome) > 0 && !(Number(r.income) > 0));
  const dun =
    Math.abs(tuukhii) || (zarlagaEsekh ? Math.abs(Number(r.outcome) || 0) : 0);
  return zarlagaEsekh ? -dun : dun;
}

const tooOrNull = (v) =>
  v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v);

function angilalaarNiilberle(zarlaguud) {
  const map = {};
  for (const z of zarlaguud) {
    const k = z.angilal || ANGILAAGUI;
    map[k] = (map[k] || 0) + z.dun;
  }
  return Object.entries(map)
    .map(([angilal, dun]) => ({ angilal, dun }))
    .sort((a, b) => b.dun - a.dun);
}

/**
 * Дансны хуулгыг [ekhlel, tugsgul] мужаар уншиж данс тус бүр, сар тус бүрээр
 * нэгтгэнэ. `saraar` нь мөнгөн урсгалын графикт.
 */
async function bankKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const range = { $gte: ekhlel, $lte: tugsgul };
  const muruud = await BankniiGuilgee(kholbolt, true)
    .find({
      ...baseMatch,
      $or: [
        { postDate: range },
        { tranDate: range },
        { TxDt: range },
        { tranPostedDate: range },
        {
          createdAt: range,
          postDate: null,
          tranDate: null,
          TxDt: null,
          tranPostedDate: null,
        },
      ],
    })
    .select(
      "postDate tranDate TxDt tranPostedDate createdAt amount Amt tranAmount income outcome kholbosonDun drOrCr balance dansniiDugaar bank description TxAddInf relatedAccount accName zarlagiinAngilal",
    )
    .lean();

  const dansMap = new Map();
  const saraarMap = new Map();
  const zarlaguud = [];
  let orlogo = 0;
  let zarlaga = 0;

  const mur = muruud
    .map((r) => ({ r, ognoo: new Date(bankOgnoo(r)), dun: bankDun(r) }))
    .filter((m) => !isNaN(m.ognoo.getTime()) && m.ognoo >= ekhlel && m.ognoo <= tugsgul)
    .sort((a, b) => a.ognoo - b.ognoo);

  for (const { r, ognoo, dun } of mur) {
    const key = String(r.dansniiDugaar || "—");
    if (!dansMap.has(key)) {
      dansMap.set(key, {
        dansniiDugaar: key,
        bank: r.bank || "",
        orlogo: 0,
        zarlaga: 0,
        ekhniiUldegdel: null,
        etssiinUldegdel: null,
        guilgeeniiToo: 0,
      });
    }
    const d = dansMap.get(key);
    d.guilgeeniiToo += 1;
    const uldegdel = tooOrNull(r.balance);
    // Эхний үлдэгдэл = анхны гүйлгээний дараах үлдэгдэл − тухайн гүйлгээ
    if (d.ekhniiUldegdel === null && uldegdel !== null) {
      d.ekhniiUldegdel = uldegdel - dun;
    }
    if (uldegdel !== null) d.etssiinUldegdel = uldegdel;

    const sar = sarTulkhuur(ognoo);
    if (!saraarMap.has(sar)) saraarMap.set(sar, { sar, orlogo: 0, zarlaga: 0 });
    const s = saraarMap.get(sar);

    if (dun >= 0) {
      d.orlogo += dun;
      s.orlogo += dun;
      orlogo += dun;
    } else {
      d.zarlaga += -dun;
      s.zarlaga += -dun;
      zarlaga += -dun;
      zarlaguud.push({
        _id: r._id,
        ognoo,
        dun: -dun,
        dansniiDugaar: key,
        bank: r.bank || "",
        utga: r.description || r.TxAddInf || "",
        kharitsakhDans: r.relatedAccount || "",
        kharitsakhNer: r.accName || "",
        angilal: r.zarlagiinAngilal || "",
      });
    }
  }

  const dansuud = Array.from(dansMap.values());
  const medeeltei = dansuud.filter((d) => d.ekhniiUldegdel !== null);

  return {
    orlogo,
    zarlaga,
    ekhniiUldegdel: medeeltei.length
      ? medeeltei.reduce((s, d) => s + d.ekhniiUldegdel, 0)
      : null,
    etssiinUldegdel: medeeltei.length
      ? medeeltei.reduce((s, d) => s + (d.etssiinUldegdel || 0), 0)
      : null,
    dansuud,
    saraar: Array.from(saraarMap.values()),
    zarlaguud: zarlaguud.sort((a, b) => b.ognoo - a.ognoo),
    zarlagaAngilalaar: angilalaarNiilberle(zarlaguud),
  };
}

/**
 * Оршин суугчдын төлбөр: төлсөн мөнгө = орлого (хугацаанд), төлөөгүй мөнгө =
 * авлага (хугацааны эцэст). Зардлаар задлахгүй — төлөлтийн мөр зардлын нэргүй
 * ирдэг тул задаргаа нь «төлсөн 0» гэж буруу харагддаг.
 * Тэмдгийн дүрэм /tailan/tulbur-dugnelt-тэй ижил (dun < 0 = төлсөн).
 */
async function avlagaKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const isDisc = {
    $or: [{ $eq: ["$turul", "Хөнгөлөлт"] }, { $eq: ["$source", "khungulult"] }],
  };
  const GA = GuilgeeAvlaguud(kholbolt);
  const [tulsun, etssiinAvlaga] = await Promise.all([
    GA.aggregate([
      { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul }, dun: { $lt: 0 } } },
      {
        $group: {
          _id: null,
          dun: { $sum: { $cond: [isDisc, 0, { $abs: "$dun" }] } },
        },
      },
    ]),
    GA.aggregate([
      { $match: { ...baseMatch, ognoo: { $lte: tugsgul } } },
      { $group: { _id: null, dun: { $sum: "$dun" } } },
    ]),
  ]);
  return {
    tulsun: tulsun[0]?.dun || 0,
    etssiinAvlaga: Math.max(0, etssiinAvlaga[0]?.dun || 0),
  };
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

exports.ZARLAGIIN_ANGILAL = ZARLAGIIN_ANGILAL;

exports.shilenDansTailan = asyncHandler(async (req, res) => {
  if (!(await ajiltanEsekh(req))) {
    return res.status(403).json({ success: false, message: "Энэ үйлдлийг хийх эрх байхгүй байна!" });
  }
  // Холболтыг токеноос авна — body-н baiguullagiinId-д найдахгүй.
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  if (!kholbolt) {
    return res
      .status(404)
      .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
  }
  const baiguullagiinId = String(kholbolt.baiguullagiinId);
  const { barilgiinId, ekhlekhOgnoo, duusakhOgnoo } = req.body || {};
  const { ekhlel, tugsgul } = khugatsaaZadlakh(ekhlekhOgnoo, duusakhOgnoo);
  if (isNaN(ekhlel.getTime()) || isNaN(tugsgul.getTime()) || ekhlel > tugsgul) {
    return res.status(400).json({ success: false, message: "Огноо буруу байна" });
  }

  const baseMatch = { baiguullagiinId };
  if (barilgiinId) baseMatch.barilgiinId = String(barilgiinId);

  const [bank, avlaga, zogsool] = await Promise.all([
    bankKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul),
    avlagaKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul),
    zogsoolKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul).catch((err) => {
      console.error("shilenDans zogsool:", err.message);
      return null;
    }),
  ]);

  res.json({
    success: true,
    ekhlekhOgnoo: ekhlel,
    duusakhOgnoo: tugsgul,
    zarlagiinAngilaluud: ZARLAGIIN_ANGILAL,
    bank,
    avlaga,
    zogsool,
  });
});

exports.shilenDansZarlagaAngilal = asyncHandler(async (req, res) => {
  if (!(await ajiltanEsekh(req))) {
    return res.status(403).json({ success: false, message: "Энэ үйлдлийг хийх эрх байхгүй байна!" });
  }
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  if (!kholbolt) {
    return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
  }
  const { id, angilal } = req.body || {};
  const shine = angilal ? String(angilal) : "";
  if (!id || (shine && !ZARLAGIIN_ANGILAL.includes(shine))) {
    return res.status(400).json({ success: false, message: "Ангилал буруу байна" });
  }
  const urdun = await BankniiGuilgee(kholbolt).updateOne(
    { _id: id, baiguullagiinId: String(kholbolt.baiguullagiinId) },
    shine
      ? {
          $set: {
            zarlagiinAngilal: shine,
            zarlagiinAngilalOnoosonAjiltniiNer: req.body.nevtersenAjiltniiToken?.ner || "",
          },
        }
      : { $unset: { zarlagiinAngilal: 1, zarlagiinAngilalOnoosonAjiltniiNer: 1 } },
  );
  if (!urdun.matchedCount) {
    return res.status(404).json({ success: false, message: "Гүйлгээ олдсонгүй" });
  }
  res.json({ success: true });
});

/**
 * Оршин суугчийн апп — «Шилэн данс» таб.
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
    return res.status(401).json({ success: false, message: "Нэвтрэх шаардлагатай" });
  }

  const orshinSuugchiinId = String(token.undsenId || token.id);
  const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
    .findById(orshinSuugchiinId)
    .select("baiguullagiinId barilgiinId toots")
    .lean();
  if (!orshinSuugch) {
    return res.status(404).json({ success: false, message: "Хэрэглэгч олдсонгүй" });
  }

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
    return res.status(403).json({ success: false, message: "Энэ байрны мэдээлэл харах эрх байхгүй" });
  }

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
    .findById(baiguullagiinId)
    .select("ner tokhirgoo barilguud._id barilguud.ner barilguud.tokhirgoo")
    .lean();
  if (!baiguullaga || !shilenDansAppKharuulakhEsekh(baiguullaga, barilgiinId)) {
    return res.status(403).json({ success: false, message: "Шилэн данс нээгдээгүй байна", khaalttai: true });
  }

  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === baiguullagiinId,
  );
  if (!kholbolt) {
    return res.status(404).json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
  }

  // Сонгосон сар (анхдагч: энэ сар) ба мөнгөн урсгалын 6 сар
  const sarMatch = /^(\d{4})-(\d{2})$/.exec(String(req.body.sar || ""));
  const odoo = new Date();
  const jil = sarMatch ? Number(sarMatch[1]) : odoo.getFullYear();
  const sarIndex = sarMatch ? Number(sarMatch[2]) - 1 : odoo.getMonth();
  const sarEkhlel = new Date(jil, sarIndex, 1, 0, 0, 0, 0);
  const sarTugsgul = new Date(jil, sarIndex + 1, 0, 23, 59, 59, 999);
  const urgalEkhlel = new Date(jil, sarIndex - 5, 1, 0, 0, 0, 0);
  // Ирээдүйн сар сонговол өнөөдрөөр хязгаарлана
  const tugsgul = sarTugsgul > odoo ? odoo : sarTugsgul;

  const baseMatch = { baiguullagiinId, barilgiinId };

  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId, orshinSuugchId: orshinSuugchiinId })
    .select("_id")
    .lean();
  const gereeniiIduud = gereenuud.map((g) => String(g._id));

  const [bank, avlaga, ailiinAvlaga, miniiUldegdel] = await Promise.all([
    bankKhesegAvya(kholbolt, baseMatch, urgalEkhlel, tugsgul),
    avlagaKhesegAvya(kholbolt, baseMatch, sarEkhlel, tugsgul),
    ailiinAvlagaAvya(kholbolt, baseMatch, tugsgul),
    gereeniiIduud.length
      ? GuilgeeAvlaguud(kholbolt).aggregate([
          { $match: { baiguullagiinId, gereeniiId: { $in: gereeniiIduud } } },
          { $group: { _id: null, dun: { $sum: "$dun" } } },
        ])
      : Promise.resolve([]),
  ]);

  const sar = sarTulkhuur(sarEkhlel);
  const saraar = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(jil, sarIndex - i, 1);
    const k = sarTulkhuur(d);
    const s = bank.saraar.find((x) => x.sar === k);
    saraar.push({ sar: k, orlogo: s?.orlogo || 0, zarlaga: s?.zarlaga || 0 });
  }
  const songosonSar = saraar[saraar.length - 1];
  const sariinZarlaguud = bank.zarlaguud.filter((z) => z.ognoo >= sarEkhlel);

  const ailKharuulakh = shilenDansAilKharuulakhEsekh(baiguullaga, barilgiinId);
  const barilga = (baiguullaga.barilguud || []).find(
    (b) => String(b._id) === barilgiinId,
  );

  res.json({
    success: true,
    sar,
    baiguullagiinNer: baiguullaga.ner || "",
    barilgiinNer: barilga?.ner || "",
    dansniiUldegdel: bank.etssiinUldegdel,
    orlogo: songosonSar.orlogo,
    zarlaga: songosonSar.zarlaga,
    sariinZuruu: songosonSar.orlogo - songosonSar.zarlaga,
    saraar,
    zarlagaAngilalaar: angilalaarNiilberle(sariinZarlaguud),
    // Төлсөн мөнгө = орлого, төлөөгүй мөнгө = авлага
    tulsunOrlogo: avlaga.tulsun,
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
