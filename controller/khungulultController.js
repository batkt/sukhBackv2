/**
 * Хөнгөлөлт — turees-ийн `khungulultKhadgalya`-тай ижил зарчим.
 *
 *   - СУУРЬ нь гэрээний САРЫН ТӨЛБӨР (нэхэмжлэхийг бодох `calculateGereeCharges`
 *     — тогтмол зардал, зогсоол, агуулах, сүүлийн заалт). Нэхэмжлэх гараагүй
 *     сард ч хувиар хөнгөлж болно (turees: `sariinTurees`).
 *   - Хувиар: сарын төлбөр × % ; дүнгээр: сар бүрт тогтмол дүн. Олон сар
 *     сонгосон бол сар бүрт ижил дүн (× сарын тоо).
 *   - Нэг удаагийн хөнгөлөлт бүр `khungulultiinTuukh` бүртгэлтэй. Сар бүрийн
 *     хасалт нь `guilgeeAvlaguud`-д `khungulultiinTuukhId`-аар холбогдсон
 *     сөрөг мөр болж бичигдэнэ — устгах, засахдаа бүгдийг хамт өөрчилнө.
 *   - turees дүнг дэлгэцээс авч итгэдэг; энд сервер ӨӨРӨӨ бодно, дээд хувь
 *     ба эрхийг ч сервер шалгана. Дүнг бүхэл төгрөг рүү бөөрөнхийлнө.
 *   - Хуучин (бүртгэлгүй) хөнгөлөлтийн мөрүүдийг мөрөөр нь устгах боломж
 *     хэвээр.
 */

const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");

const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const KhungulultiinTuukh = require("../models/khungulultiinTuukh");
const {
  khungulultOruulakhErkhteiEsekh,
} = require("../utils/khungulultErkh");

const TSUTSLASAN = new Set(["цуцалсан", "tsutlsasan", "идэвхгүй"]);

/** `YYYY-MM` мөрийг тухайн сарын эхлэл/төгсгөл болгоно. */
function sariinKhyazgaar(sarMur) {
  const [jil, sar] = String(sarMur || "").split("-").map(Number);
  if (!jil || !sar) return null;
  return {
    ekhlel: new Date(jil, sar - 1, 1, 0, 0, 0, 0),
    tugsgul: new Date(jil, sar, 0, 23, 59, 59, 999),
  };
}

/** Эхлэх, дуусах сарын хооронд буй бүх `YYYY-MM`. */
function saruudiigZadlaya(ekhlekhSar, duusakhSar) {
  const a = sariinKhyazgaar(ekhlekhSar);
  const b = sariinKhyazgaar(duusakhSar || ekhlekhSar);
  if (!a || !b) return [];

  const saruud = [];
  const guilgee = new Date(a.ekhlel);
  while (guilgee <= b.ekhlel && saruud.length < 60) {
    saruud.push(
      `${guilgee.getFullYear()}-${String(guilgee.getMonth() + 1).padStart(2, "0")}`,
    );
    guilgee.setMonth(guilgee.getMonth() + 1);
  }
  return saruud;
}

const tokenAjiltan = (req) =>
  req.body?.nevtersenAjiltniiToken || req.nevtersenAjiltniiToken || {};

function kholboltOlya(baiguullagiinId) {
  const { db } = require("zevbackv2");
  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
  );
  if (!kholbolt) throw new aldaa("Холболт олдсонгүй");
  return kholbolt;
}

/** Барилга → байгууллагын дээд хувь. Тохируулаагүй бол null (хязгааргүй). */
async function deedKhuviOlya(baiguullagiinId, barilgiinId) {
  const { db } = require("zevbackv2");
  const Baiguullaga = require("../models/baiguullaga");
  const b = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId).lean();
  const barilga = b?.barilguud?.find((x) => String(x._id) === String(barilgiinId || ""));
  const utga = Number(
    barilga?.tokhirgoo?.deedKhungulultiinKhuvi ?? b?.tokhirgoo?.deedKhungulultiinKhuvi,
  );
  return Number.isFinite(utga) && utga > 0 ? utga : null;
}

/**
 * Гэрээний НЭГ САРЫН төлбөр — нэхэмжлэхтэй ижил функцээр. Эхний үлдэгдэл,
 * өмнө нь бичигдсэн (нэхэмжлээгүй) авлагыг оруулахгүй.
 */
/**
 * Зардал/гүйлгээний нэрээр өмчийн ангилал: гараж (зогсоол), агуулах, бусад нь
 * орон сууц. Гэрээ үүсгэхэд тоотын төрлөөр зардлыг ижил нэрээр шүүдэг
 * (orshinSuugch.js) тул нэг гэрээнд багтсан гараж/агуулахын төлбөр ялгарна.
 */
const ANGILLUUD = ["Орон сууц", "Агуулах", "Зогсоол"];
function angilalTaniya(ner) {
  const n = String(ner || "").toLowerCase();
  if (n.includes("гараж") || n.includes("гараш") || n.includes("зогсоол")) return "Зогсоол";
  if (n.includes("агуулах")) return "Агуулах";
  return "Орон сууц";
}
const angilliinNer = (a) => (a === "Зогсоол" ? "Гараж" : a);

async function sariinDunBodyo(kholbolt, geree) {
  const { calculateGereeCharges } = require("../services/invoiceService");
  try {
    const { charges } = await calculateGereeCharges(kholbolt, geree, {
      billingDate: new Date(),
    });
    const zadargaa = (charges || [])
      .filter((c) => !c.isEkhniiUldegdel && !c.ledgerDeerBaigaa && Number(c.dun) > 0)
      .map((c) => ({ ner: c.ner, dun: Math.round(Number(c.dun) * 100) / 100 }));
    const sariinDun = zadargaa.reduce((s, c) => s + c.dun, 0);
    // Ангилал бүрийн сарын төлбөр (орон сууц / агуулах / гараж)
    const angilal = { "Орон сууц": 0, Агуулах: 0, Зогсоол: 0 };
    zadargaa.forEach((c) => {
      angilal[angilalTaniya(c.ner)] += c.dun;
    });
    Object.keys(angilal).forEach((k) => (angilal[k] = Math.round(angilal[k] * 100) / 100));
    return { sariinDun: Math.round(sariinDun * 100) / 100, zadargaa, angilal };
  } catch (err) {
    console.error("Хөнгөлөлтийн суурь бодоход алдаа:", geree?._id, err.message);
    return { sariinDun: 0, zadargaa: [], angilal: { "Орон сууц": 0, Агуулах: 0, Зогсоол: 0 } };
  }
}

/** Хязгаартай зэрэгцээ ажиллуулах */
async function zeregtseeAjiluulya(jagsaalt, too, fn) {
  const ur = new Array(jagsaalt.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(too, jagsaalt.length) }, async () => {
      while (i < jagsaalt.length) {
        const n = i++;
        ur[n] = await fn(jagsaalt[n]);
      }
    }),
  );
  return ur;
}

/** Нэг сарын хөнгөлөх дүн */
function sariinKhungulult(khungulukhTurul, utga, sariinDun) {
  if (khungulukhTurul === "khuvi")
    return Math.round(((Number(sariinDun) || 0) * utga) / 100);
  return Math.round(utga);
}

/**
 * Нэг гэрээнд сар бүрийн хөнгөлөлтийн мөрийг бичнэ. Тухайн сарын нэхэмжлэх
 * байвал түүний огноонд, үгүй бол сарын 1-нд суулгана.
 */
async function murnuudBichye(
  kholbolt,
  { geree, saruud, sariinDun, khuviinSuuri, tuukh, ajiltan, barilgiinId },
) {
  const GuilgeeModel = GuilgeeAvlaguud(kholbolt);
  const NekhemjlekhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);
  // Хувиар хөнгөлөхөд суурь нь ҮЛДЭГДЭЛ (дүнгээр хөнгөлөхтэй ижил — үлдэгдлээс
  // хасагдана). Хуучин бичлэгт khuviinSuuri байхгүй бол сарын төлбөрөөр.
  const khuviinSuuriDun =
    khuviinSuuri != null && Number.isFinite(Number(khuviinSuuri))
      ? Number(khuviinSuuri)
      : Number(sariinDun) || 0;
  // Дээд хязгаар: сарын төлбөр, тохируулаагүй бол үлдэгдэл.
  const suuri = Math.max(
    0,
    Math.round(Number(sariinDun) > 0 ? Number(sariinDun) : khuviinSuuriDun),
  );
  const dun = Math.min(
    sariinKhungulult(
      tuukh.khungulukhTurul,
      tuukh.khungulukhUtga,
      tuukh.khungulukhTurul === "khuvi" ? khuviinSuuriDun : sariinDun,
    ),
    suuri,
  );
  if (dun <= 0) return 0;
  const angilliinNerTag = tuukh.angilal ? `Хөнгөлөлт (${angilliinNer(tuukh.angilal)})` : null;

  let niit = 0;
  for (const sar of saruud) {
    const kh = sariinKhyazgaar(sar);
    if (!kh) continue;
    // Давхар хөнгөлөлтөөс сэргийлнэ: тухайн сард (ангилалд) өмнө нь өгсөн
    // хөнгөлөлтийг хасаад үлдсэн хэсгийг л хөнгөлнө. Нийт нь сарын төлбөрөөс
    // хэтрэхгүй (60% + 60% → 100%).
    const umnukh = await GuilgeeModel.aggregate([
      {
        $match: {
          gereeniiId: String(geree._id),
          // Хөнгөлөлтийн хэрэгслээр болон гүйлгээний цонхоор гараас оруулсан аль аль нь
          $or: [{ source: "khungulult" }, { turul: "Хөнгөлөлт" }, { zardliinTurul: "Хөнгөлөлт" }],
          dun: { $lt: 0 },
          ognoo: { $gte: kh.ekhlel, $lte: kh.tugsgul },
          khungulultiinTuukhId: { $ne: String(tuukh._id) },
          ...(angilliinNerTag ? { zardliinNer: angilliinNerTag } : {}),
        },
      },
      { $group: { _id: null, dun: { $sum: "$dun" } } },
    ]);
    const umnukhDun = Math.abs(Number(umnukh?.[0]?.dun) || 0);
    const sariinDunEnd = Math.min(dun, Math.max(0, suuri - umnukhDun));
    if (sariinDunEnd <= 0) continue;
    // Тухайн сарын нэхэмжлэх; мөчлөг сарын сүүлээс эхэлдэг бол (10-р сарын
    // нэхэмжлэх 09.29) өмнөх сарын сүүлийн 15 хоногт гарсан нэхэмжлэхийг авна.
    const nekhemjlekh =
      (await NekhemjlekhModel.findOne({
        gereeniiId: String(geree._id),
        ognoo: { $gte: kh.ekhlel, $lte: kh.tugsgul },
      })
        .sort({ ognoo: 1 })
        .select({ ognoo: 1 })
        .lean()) ||
      (await NekhemjlekhModel.findOne({
        gereeniiId: String(geree._id),
        ognoo: { $gte: new Date(kh.ekhlel.getTime() - 15 * 24 * 3600 * 1000), $lt: kh.ekhlel },
      })
        .sort({ ognoo: -1 })
        .select({ ognoo: 1 })
        .lean());

    await new GuilgeeModel({
      baiguullagiinId: String(tuukh.baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : geree.barilgiinId,
      gereeniiId: String(geree._id),
      gereeniiDugaar: geree.gereeniiDugaar || "",
      toot: geree.toot || "",
      turul: "Хөнгөлөлт",
      zardliinTurul: "Хөнгөлөлт",
      // Ангилалтай хөнгөлөлтийг нэрээр нь ялгана (ангиллын үлдэгдэлд тооцогдоно).
      ...(tuukh.angilal ? { zardliinNer: `Хөнгөлөлт (${angilliinNer(tuukh.angilal)})` } : {}),
      dun: -sariinDunEnd,
      ognoo: nekhemjlekh?.ognoo || kh.ekhlel,
      tailbar: String(tuukh.shaltgaan || "").trim(),
      ...(tuukh.khungulukhTurul === "khuvi"
        ? { khungulultKhuvi: Number(tuukh.khungulukhUtga) }
        : {}),
      khungulultiinTuukhId: String(tuukh._id),
      // Тухайн сарын нэхэмжлэхийг шууд бууруулна (syncInvoicesStatus)
      ...(nekhemjlekh?._id ? { nekhemjlekhId: String(nekhemjlekh._id) } : {}),
      source: "khungulult",
      guilgeeKhiisenAjiltniiNer: ajiltan.ner || "Систем",
      guilgeeKhiisenAjiltniiId: ajiltan.id || "",
    }).save();
    niit += sariinDunEnd;
  }
  return niit;
}

async function nekhemjlekhSyncKhiiye(kholbolt, gereeniiIdnuud) {
  try {
    const guilgeeService = require("../services/guilgeeService");
    for (const id of new Set(gereeniiIdnuud.filter(Boolean))) {
      await guilgeeService.syncInvoicesStatus(kholbolt, String(id));
    }
  } catch (err) {
    console.error("Хөнгөлөлтийн дараа sync амжилтгүй:", err.message);
  }
}

async function erkhShalgaya(req, res) {
  const ok = await khungulultOruulakhErkhteiEsekh(tokenAjiltan(req).id);
  if (!ok) {
    res
      .status(403)
      .json({
        success: false,
        message:
          "Танд хөнгөлөлт оруулах эрх байхгүй байна. Админаас «Хөнгөлөлт оруулах» эрх авна уу.",
      });
    return false;
  }
  return true;
}

/**
 * Гэрээ бүрийн бодит үлдэгдэл ба ангилал (Орон сууц / Агуулах / Зогсоол)
 * бүрийн үлдэгдэл — авлагын дэвтрээс. Хувиар хөнгөлөх суурь болно.
 */
async function uldegdelBodyo(kholbolt, { baiguullagiinId, barilgiinId, gereeniiIdnuud }) {
  const uldMatch = { baiguullagiinId: String(baiguullagiinId) };
  if (barilgiinId) uldMatch.barilgiinId = String(barilgiinId);
  if (Array.isArray(gereeniiIdnuud) && gereeniiIdnuud.length)
    uldMatch.gereeniiId = { $in: gereeniiIdnuud.map(String) };
  // Үлдэгдлийг гэрээ × гүйлгээний нэрээр задална — ангилал бүрийн үлдэгдэл.
  const uldMur = await GuilgeeAvlaguud(kholbolt).aggregate([
    { $match: uldMatch },
    {
      $group: {
        _id: {
          g: "$gereeniiId",
          n: { $ifNull: ["$zardliinNer", { $ifNull: ["$tailbar", ""] }] },
          eyreg: { $gt: ["$dun", 0] },
          khungulult: { $eq: ["$source", "khungulult"] },
        },
        dun: { $sum: "$dun" },
      },
    },
  ]);
  const uldegdel = {};
  const tootsoo = {}; // gid → { angilal: {cat: дүн}, ялгаагүй: дүн }
  uldMur.forEach(({ _id, dun }) => {
    const gid = _id?.g ? String(_id.g) : "";
    if (!gid) return;
    uldegdel[gid] = (uldegdel[gid] || 0) + dun;
    const t = (tootsoo[gid] ||= { angilal: { "Орон сууц": 0, Агуулах: 0, Зогсоол: 0 }, yalgaagui: 0 });
    // Нэртэй авлага/төлөлт болон ангилалтай хөнгөлөлт нь ангилалдаа шууд сууна;
    // нэргүй хуучин төлөлтийг доор ангиллын үлдэгдлийн хувиар хуваарилна.
    if (
      _id.eyreg ||
      (_id.khungulult && /\((гараж|агуулах|орон сууц)\)/i.test(_id.n)) ||
      /зогсоол|гараж|агуулах|орон сууц/i.test(String(_id.n || ""))
    ) {
      t.angilal[angilalTaniya(_id.n)] += dun;
    } else {
      t.yalgaagui += dun;
    }
  });
  const uldegdelAngilal = {};
  Object.entries(tootsoo).forEach(([gid, t]) => {
    const eyreg = ANGILLUUD.map((k) => Math.max(0, t.angilal[k]));
    const niit = eyreg.reduce((a, b) => a + b, 0);
    const ur = {};
    ANGILLUUD.forEach((k, i) => {
      const khuvi = niit > 0 ? eyreg[i] / niit : k === "Орон сууц" ? 1 : 0;
      ur[k] = Math.round((t.angilal[k] + t.yalgaagui * khuvi) * 100) / 100;
    });
    // Нэг ангилалд илүү төлсөн (сөрөг) дүнг бусад ангиллын өрөөс хасна —
    // эс бөгөөс «Орон сууц үлдэгдэл 282,500» гэх мэт нийт өр (137,500)-өөс
    // их дүн харагддаг байв. Ангиллын нийлбэр нь нийт үлдэгдэлтэй тэнцүү хэвээр.
    let iluu = ANGILLUUD.reduce((a, k) => a + (ur[k] < 0 ? -ur[k] : 0), 0);
    if (iluu > 0) {
      ANGILLUUD.forEach((k) => {
        if (ur[k] < 0) ur[k] = 0;
      });
      const eyregNiit = ANGILLUUD.reduce((a, k) => a + ur[k], 0);
      if (eyregNiit > 0) {
        const khasakh = Math.min(iluu, eyregNiit);
        ANGILLUUD.forEach((k) => {
          ur[k] = Math.round((ur[k] - (khasakh * ur[k]) / eyregNiit) * 100) / 100;
        });
        iluu -= khasakh;
      }
      // Бүх ангилал төлөгдөөд илүү үлдвэл — орон сууцанд илүү төлөлт (сөрөг) болгож үзүүлнэ
      if (iluu > 0) ur["Орон сууц"] = Math.round((ur["Орон сууц"] - iluu) * 100) / 100;
    }
    uldegdelAngilal[gid] = ur;
    uldegdel[gid] = Math.round(uldegdel[gid] * 100) / 100;
  });

  return { uldegdel, uldegdelAngilal };
}

/**
 * POST /khungulultSuuriAvya — гэрээ бүрийн сарын төлбөр ба бодит үлдэгдэл.
 * Body: baiguullagiinId, barilgiinId?, gereeniiIdnuud?
 * Хариу: { suuri: { [gereeniiId]: { sariinDun, zadargaa } },
 *          uldegdel: { [gereeniiId]: дүн } }
 */
exports.khungulultSuuriAvya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, gereeniiIdnuud } = req.body;
    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    const kholbolt = kholboltOlya(baiguullagiinId);

    const query = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) query.barilgiinId = String(barilgiinId);
    if (Array.isArray(gereeniiIdnuud) && gereeniiIdnuud.length)
      query._id = { $in: gereeniiIdnuud };
    const gereenuud = (await Geree(kholbolt).find(query).lean()).filter(
      (g) => !TSUTSLASAN.has(String(g.tuluv || "").trim().toLowerCase()),
    );

    const ur = await zeregtseeAjiluulya(gereenuud, 8, (g) => sariinDunBodyo(kholbolt, g));
    const suuri = {};
    gereenuud.forEach((g, i) => {
      suuri[String(g._id)] = ur[i];
    });

    const { uldegdel, uldegdelAngilal } = await uldegdelBodyo(kholbolt, {
      baiguullagiinId,
      barilgiinId,
    });

    res.json({ suuri, uldegdel, uldegdelAngilal });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /khungulultKhadgalya
 * Body: baiguullagiinId, barilgiinId, ekhlekhSar, duusakhSar,
 *       khungulukhTurul ("khuvi" | "dun"), khungulukhUtga, shaltgaan,
 *       gereenuud: [{ gereeniiId }]
 */
exports.khungulultKhadgalya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, gereenuud, ekhlekhSar, duusakhSar, shaltgaan } =
      req.body;
    // Орон сууц / Агуулах / Зогсоол (гараж) — зөвхөн тухайн ангиллын төлбөрөөс хөнгөлнө.
    const angilal = ANGILLUUD.includes(req.body.angilal) ? req.body.angilal : null;
    const khungulukhTurul = req.body.khungulukhTurul === "dun" ? "dun" : "khuvi";
    const khungulukhUtga = Number(req.body.khungulukhUtga);

    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    if (!Array.isArray(gereenuud) || gereenuud.length === 0)
      throw new aldaa("Хөнгөлөлт өгөх оршин суугчаа хүснэгтээс сонгоно уу");
    if (!shaltgaan || !String(shaltgaan).trim())
      throw new aldaa("Хөнгөлөлт олгох шалтгаанаа бичнэ үү — түүх дээр харагдана");
    if (!ekhlekhSar) throw new aldaa("Хөнгөлөх сараа «Огноо» талбараас сонгоно уу");
    if (!Number.isFinite(khungulukhUtga) || khungulukhUtga <= 0)
      throw new aldaa(
        khungulukhTurul === "khuvi"
          ? "Хөнгөлөх хувиа 0-ээс их тоогоор оруулна уу (жишээ нь 10)"
          : "Сар бүр хөнгөлөх дүнгээ 0-ээс их тоогоор оруулна уу",
      );
    if (!(await erkhShalgaya(req, res))) return;

    if (khungulukhTurul === "khuvi") {
      const deed = (await deedKhuviOlya(baiguullagiinId, barilgiinId)) ?? 100;
      if (khungulukhUtga > deed)
        throw new aldaa(
          `Хөнгөлөх хувь ${khungulukhUtga}% байна. Тохиргоогоор хамгийн ихдээ ${deed}% хөнгөлөх боломжтой.`,
        );
    }

    const saruud = saruudiigZadlaya(ekhlekhSar, duusakhSar);
    if (saruud.length === 0)
      throw new aldaa("Хөнгөлөх сарын хугацаа буруу байна. Эхлэх, дуусах сараа дахин сонгоно уу.");

    const kholbolt = kholboltOlya(baiguullagiinId);
    const ajiltan = tokenAjiltan(req);
    const Tuukh = KhungulultiinTuukh(kholbolt);

    const tuukh = await new Tuukh({
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : "",
      ekhlekhSar: saruud[0],
      duusakhSar: saruud[saruud.length - 1],
      ognoonuud: saruud,
      khungulukhTurul,
      khungulukhUtga,
      ...(angilal ? { angilal } : {}),
      shaltgaan: String(shaltgaan).trim(),
      tulukhDun: 0,
      khungulsunDun: 0,
      khamaataiGereenuud: [],
      ajiltniiId: ajiltan.id || "",
      ajiltniiNer: ajiltan.ner || "Систем",
    }).save();

    const results = {
      success: [],
      alggasanGereenuud: [],
      failed: [],
      total: gereenuud.length,
    };
    const khamaatai = [];
    let niitTulukh = 0;
    let niitKhungulsun = 0;

    const GereeModel = Geree(kholbolt);
    // Нэг гэрээ хоёр удаа ирвэл хөнгөлөлт давхар бичигдэх байсан — давхардлыг арилгана.
    const davkhardalgui = Array.from(
      new Set(gereenuud.map((g) => String(g?.gereeniiId || "").trim()).filter(Boolean)),
    );
    results.total = davkhardalgui.length;
    const { uldegdel: boditUldegdel, uldegdelAngilal: boditUldegdelAngilal } =
      khungulukhTurul === "khuvi"
        ? await uldegdelBodyo(kholbolt, {
            baiguullagiinId,
            barilgiinId,
            gereeniiIdnuud: davkhardalgui,
          })
        : { uldegdel: {}, uldegdelAngilal: {} };
    for (const gereeniiId of davkhardalgui) {
      try {
        const geree = gereeniiId ? await GereeModel.findById(gereeniiId).lean() : null;
        if (!geree) {
          results.failed.push({ gereeniiId, error: "Оршин суугчийн гэрээ олдсонгүй (устсан эсвэл цуцлагдсан)" });
          continue;
        }
        const suuriBodolt = await sariinDunBodyo(kholbolt, geree);
        const sariinDun = angilal ? suuriBodolt.angilal?.[angilal] || 0 : suuriBodolt.sariinDun;
        const alggasakh = (shaltgaanNer) =>
          results.alggasanGereenuud.push({
            gereeniiId,
            gereeniiDugaar: geree.gereeniiDugaar || "",
            toot: geree.toot || "",
            shaltgaan: shaltgaanNer,
          });
        // Хувиар: тухайн ангиллын (эсвэл нийт) бодит үлдэгдлээс бодно.
        const khuviinSuuri =
          khungulukhTurul === "khuvi"
            ? Math.max(
                0,
                Number(
                  boditUldegdelAngilal[gereeniiId]?.[angilal || "Орон сууц"] ??
                    boditUldegdel[gereeniiId] ??
                    0,
                ) || 0,
              )
            : null;
        if (khungulukhTurul === "khuvi" && khuviinSuuri <= 0) {
          alggasakh("Үлдэгдэлгүй (төлөх дүн 0₮) тул хувиар хөнгөлөх суурь алга");
          continue;
        }
        if (khungulukhTurul !== "khuvi" && sariinDun <= 0) {
          alggasakh(
            angilal
              ? `${angilliinNer(angilal)}-ын сарын төлбөр алга (хувиар хөнгөлөх суурь 0₮)`
              : "Гэрээнд сарын төлбөр тохируулаагүй (хувиар хөнгөлөх суурь 0₮)",
          );
          continue;
        }
        const dun = await murnuudBichye(kholbolt, {
          geree,
          saruud,
          sariinDun,
          khuviinSuuri,
          tuukh,
          ajiltan,
          barilgiinId,
        });
        if (dun <= 0) {
          alggasakh(
            "Бодогдсон хөнгөлөлт 0₮ — энэ сард аль хэдийн бүрэн хөнгөлөгдсөн, эсвэл хувь хэт бага",
          );
          continue;
        }
        khamaatai.push({
          gereeniiId,
          gereeniiDugaar: geree.gereeniiDugaar || "",
          ner: `${geree.ovog || ""} ${geree.ner || ""}`.trim(),
          toot: geree.toot || "",
          orts: geree.orts || "",
          davkhar: geree.davkhar || "",
          sariinDun,
          ...(khuviinSuuri != null ? { khuviinSuuri } : {}),
          khungulsunDun: dun,
        });
        niitTulukh += sariinDun * saruud.length;
        niitKhungulsun += dun;
        await barimtUldeeye(kholbolt, geree, dun, shaltgaan, {
          ajiltanNer: ajiltan.ner,
          ajiltanId: ajiltan.id,
        });
        results.success.push({
          gereeniiId,
          gereeniiDugaar: geree.gereeniiDugaar || "",
          toot: geree.toot || "",
          dun,
          bichlegiinToo: saruud.length,
        });
      } catch (error) {
        results.failed.push({ gereeniiId, error: error.message || "Алдаа гарлаа" });
      }
    }

    if (khamaatai.length === 0) {
      await Tuukh.deleteOne({ _id: tuukh._id });
    } else {
      await Tuukh.updateOne(
        { _id: tuukh._id },
        {
          $set: {
            khamaataiGereenuud: khamaatai,
            tulukhDun: niitTulukh,
            khungulsunDun: niitKhungulsun,
          },
        },
      );
      await nekhemjlekhSyncKhiiye(
        kholbolt,
        khamaatai.map((k) => k.gereeniiId),
      );
    }

    res.status(200).json({
      success: true,
      message:
        `${results.success.length} гэрээнд хөнгөлөлт бүртгэгдлээ` +
        (results.alggasanGereenuud.length
          ? `, ${results.alggasanGereenuud.length} гэрээ алгасагдав`
          : "") +
        (results.failed.length ? `, ${results.failed.length} алдаатай` : ""),
      tuukhId: khamaatai.length ? String(tuukh._id) : null,
      results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET|POST /khungulultiinTuukhJagsaalt — хөнгөлөлтийн бүртгэлүүд.
 * baiguullagiinId, barilgiinId?, ekhlekh?, duusakh? (YYYY-MM-DD, бүртгэсэн огноо)
 */
exports.khungulultiinTuukhJagsaalt = asyncHandler(async (req, res, next) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const { baiguullagiinId, barilgiinId, ekhlekh, duusakh } = src;
    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    const kholbolt = kholboltOlya(baiguullagiinId);
    const query = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) query.barilgiinId = String(barilgiinId);
    if (ekhlekh || duusakh) {
      query.createdAt = {};
      if (ekhlekh) query.createdAt.$gte = new Date(`${ekhlekh}T00:00:00`);
      if (duusakh) query.createdAt.$lte = new Date(`${duusakh}T23:59:59.999`);
    }
    const jagsaalt = await KhungulultiinTuukh(kholbolt)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    res.json({ jagsaalt });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /khungulultZasvarlaya — хувь/дүнг өөрчилнө (turees
 * `khungulultZasvarlaya`). Гэрээ бүрийн мөрийг шинэ дүнгээр дахин бичнэ.
 * Body: baiguullagiinId, id, khungulukhUtga, tailbar (засах шалтгаан, заавал)
 */
exports.khungulultZasvarlaya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, id, tailbar } = req.body;
    const khungulukhUtga = Number(req.body.khungulukhUtga);
    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    if (!id) throw new aldaa("Засах хөнгөлөлтөө жагсаалтаас сонгоно уу");
    if (!tailbar || !String(tailbar).trim())
      throw new aldaa("Яагаад засаж байгаа шалтгаанаа бичнэ үү");
    if (!Number.isFinite(khungulukhUtga) || khungulukhUtga <= 0)
      throw new aldaa("Шинэ хувь эсвэл дүнг 0-ээс их тоогоор оруулна уу");
    if (!(await erkhShalgaya(req, res))) return;

    const kholbolt = kholboltOlya(baiguullagiinId);
    const Tuukh = KhungulultiinTuukh(kholbolt);
    const tuukh = await Tuukh.findById(id).lean();
    if (!tuukh)
      throw new aldaa("Хөнгөлөлт олдсонгүй — устгагдсан байж магадгүй. Жагсаалтаа шинэчилнэ үү.");

    if (tuukh.khungulukhTurul === "khuvi") {
      const deed = (await deedKhuviOlya(baiguullagiinId, tuukh.barilgiinId)) ?? 100;
      if (khungulukhUtga > deed)
        throw new aldaa(
          `Шинэ хувь ${khungulukhUtga}% байна. Тохиргоогоор хамгийн ихдээ ${deed}% хөнгөлөх боломжтой.`,
        );
    }

    const ajiltan = tokenAjiltan(req);
    const shineTuukh = { ...tuukh, khungulukhUtga };
    const saruud = tuukh.ognoonuud?.length
      ? tuukh.ognoonuud
      : saruudiigZadlaya(tuukh.ekhlekhSar, tuukh.duusakhSar);
    const GereeModel = Geree(kholbolt);
    const GuilgeeModel = GuilgeeAvlaguud(kholbolt);
    const khamaatai = [];
    let niitKhungulsun = 0;

    for (const k of tuukh.khamaataiGereenuud || []) {
      await GuilgeeModel.deleteMany({
        khungulultiinTuukhId: String(tuukh._id),
        gereeniiId: String(k.gereeniiId),
      });
      const geree = await GereeModel.findById(k.gereeniiId).lean();
      if (!geree) continue;
      const dun = await murnuudBichye(kholbolt, {
        geree,
        saruud,
        sariinDun: k.sariinDun,
        khuviinSuuri: k.khuviinSuuri,
        tuukh: shineTuukh,
        ajiltan,
        barilgiinId: tuukh.barilgiinId,
      });
      khamaatai.push({ ...k, khungulsunDun: dun });
      niitKhungulsun += dun;
      await barimtUldeeye(kholbolt, geree, dun, `Зассан: ${String(tailbar).trim()}`, {
        ajiltanNer: ajiltan.ner,
        ajiltanId: ajiltan.id,
      });
    }

    await Tuukh.updateOne(
      { _id: tuukh._id },
      {
        $set: {
          khungulukhUtga,
          khamaataiGereenuud: khamaatai,
          khungulsunDun: niitKhungulsun,
          zassanAjiltniiNer: ajiltan.ner || "",
          zassanOgnoo: new Date(),
        },
      },
    );
    await nekhemjlekhSyncKhiiye(
      kholbolt,
      khamaatai.map((k) => k.gereeniiId),
    );

    res.json({ success: true, message: "Хөнгөлөлт засагдлаа", khungulsunDun: niitKhungulsun });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /khungulultUstgaya
 *   { baiguullagiinId, tuukhId, gereeniiId?, tailbar } — бүртгэлтэй хөнгөлөлт:
 *       gereeniiId өгвөл зөвхөн тэр гэрээнийх, үгүй бол бүхэлд нь устгана.
 *   { baiguullagiinId, id, tailbar } — хуучин (бүртгэлгүй) нэг мөр.
 */
exports.khungulultUstgaya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, id, tuukhId, gereeniiId, tailbar } = req.body;
    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    if (!id && !tuukhId) throw new aldaa("Устгах хөнгөлөлтөө жагсаалтаас сонгоно уу");
    if (!tailbar || !String(tailbar).trim())
      throw new aldaa("Яагаад устгаж байгаа шалтгаанаа бичнэ үү");
    if (!(await erkhShalgaya(req, res))) return;

    const kholbolt = kholboltOlya(baiguullagiinId);
    const GuilgeeModel = GuilgeeAvlaguud(kholbolt);

    // Бүртгэлтэй хөнгөлөлтийн нэг мөр ирвэл (хуучин жагсаалтаас) — тэр
    // гэрээний БҮХ сарын мөрийг бүртгэлтэй нь хамт устгана. Эс бөгөөс нэг
    // сар л устаж, бусад нь гүйлгээний түүхэд үлдэж «устсангүй» мэт болдог.
    let tuukhiinId = tuukhId;
    let gereeniiIdShuult = gereeniiId;
    if (!tuukhiinId && id) {
      const mur = await GuilgeeModel.findById(id).lean().catch(() => null);
      if (mur?.khungulultiinTuukhId) {
        tuukhiinId = mur.khungulultiinTuukhId;
        gereeniiIdShuult = mur.gereeniiId;
      }
    }

    if (tuukhiinId) {
      const Tuukh = KhungulultiinTuukh(kholbolt);
      const tuukh = await Tuukh.findById(tuukhiinId).lean();
      if (!tuukh)
        throw new aldaa("Хөнгөлөлтийн бүртгэл олдсонгүй. Жагсаалтаа шинэчлээд дахин оролдоно уу.");
      const shuult = { khungulultiinTuukhId: String(tuukh._id) };
      if (gereeniiIdShuult) shuult.gereeniiId = String(gereeniiIdShuult);
      const ur = await GuilgeeModel.deleteMany(shuult);
      const gereeniiId = gereeniiIdShuult;

      const uldsen = gereeniiId
        ? (tuukh.khamaataiGereenuud || []).filter(
            (k) => String(k.gereeniiId) !== String(gereeniiId),
          )
        : [];
      if (uldsen.length === 0) {
        await Tuukh.deleteOne({ _id: tuukh._id });
      } else {
        const sarToo = tuukh.ognoonuud?.length || 1;
        await Tuukh.updateOne(
          { _id: tuukh._id },
          {
            $set: {
              khamaataiGereenuud: uldsen,
              khungulsunDun: uldsen.reduce((s, k) => s + (Number(k.khungulsunDun) || 0), 0),
              tulukhDun: uldsen.reduce((s, k) => s + (Number(k.sariinDun) || 0) * sarToo, 0),
            },
          },
        );
      }
      const nuluulsun = gereeniiId
        ? [String(gereeniiId)]
        : (tuukh.khamaataiGereenuud || []).map((k) => String(k.gereeniiId));
      await nekhemjlekhSyncKhiiye(kholbolt, nuluulsun);
      return res.json({
        success: true,
        ustgasanToo: ur?.deletedCount ?? 0,
        message: `Хөнгөлөлт устгагдлаа (${ur?.deletedCount ?? 0} сарын хасалт буцаагдлаа)`,
      });
    }

    // Хуучин (бүртгэлгүй) нэг мөр
    const khungulult = await GuilgeeModel.findById(id).lean().catch(() => null);
    if (!khungulult)
      throw new aldaa("Хөнгөлөлт олдсонгүй — аль хэдийн устгагдсан байж магадгүй. Жагсаалтаа шинэчилнэ үү.");
    if (String(khungulult.turul) !== "Хөнгөлөлт")
      throw new aldaa("Энэ бичлэг хөнгөлөлт биш тул устгах боломжгүй");
    const ur = await GuilgeeModel.deleteOne({ _id: id });
    if (!ur?.deletedCount) throw new aldaa("Хөнгөлөлт устгагдсангүй. Дахин оролдоно уу.");
    await nekhemjlekhSyncKhiiye(kholbolt, [khungulult.gereeniiId]);
    res.status(200).json({ success: true, message: "Хөнгөлөлт устгагдлаа" });
  } catch (error) {
    next(error);
  }
});

/** Аудитын бичлэг — хэн, хэзээ, хэдийн хөнгөлөлт өгсөн. */
async function barimtUldeeye(kholbolt, geree, dun, shaltgaan, ajiltan) {
  try {
    const ZassanBarimt = require("../models/zassanBarimt");
    await new (ZassanBarimt(kholbolt))({
      baiguullagiinId: geree.baiguullagiinId,
      barilgiinId: geree.barilgiinId,
      classId: String(geree._id),
      classDugaar: geree.gereeniiDugaar,
      classType: "Khungulult",
      className: "Хөнгөлөлт",
      uurchlult: [
        {
          talbar: "khungulult",
          talbarNer: "Хөнгөлөлт",
          umnukhUtga: "",
          shineUtga: `${dun}₮ ${shaltgaan || ""}`.trim(),
          utganiiTurul: "string",
        },
      ],
      ajiltniiId: ajiltan.ajiltanId,
      ajiltniiNer: ajiltan.ajiltanNer,
      shaltgaan: shaltgaan,
    }).save();
  } catch (err) {
    // Аудит бичигдээгүй нь хөнгөлөлтийг буцаах шалтгаан биш.
    console.error("Хөнгөлөлтийн аудит бичихэд алдаа:", err.message);
  }
}
