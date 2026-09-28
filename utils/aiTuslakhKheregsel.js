/**
 * AI туслахын өгөгдөл унших хэрэгслүүд (tools).
 *
 * Бүгд ЗӨВХӨН УНШИНА. Хэрэгсэл бүр:
 *   - нэвтэрсэн ажилтны байгууллагаар (токеноос) хязгаарлагдана,
 *   - ажилтны хуудасны эрхийг (tsonkhniiErkhuud) шалгана — админ бүх эрхтэй,
 *   - ажилтанд оноосон барилгуудаар (ajiltan.barilguud) хязгаарлагдана.
 *     Оноосон барилга байхгүй бол байгууллагын бүх барилга (програмын одоогийн
 *     хандлагатай адил).
 * Утасны дугаар зэрэг хувийн мэдээллийг AI руу илгээхгүй.
 */
const { db } = require("zevbackv2");
const Ajiltan = require("../models/ajiltan");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

const MN_OFFSET = "+08:00";
const KHUNGULULT_TURLUUD = ["khungulult", "discount", "Хөнгөлөлт", "khariult"];

const toirog = (n) => Math.round(Number(n) || 0);
const regexEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "YYYY-MM-DD" → Монголын цагаар өдрийн эхлэл / төгсгөл. */
function udriinKhil(udur, tugsgul = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(udur || ""))) return null;
  const d = new Date(`${udur}T${tugsgul ? "23:59:59.999" : "00:00:00.000"}${MN_OFFSET}`);
  return isNaN(d.getTime()) ? null : d;
}
function unuudur() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// Хэрэгсэл бүрт шаардлагатай хуудасны эрх (аль нэг нь байхад хангалттай).
const ERKHUUD = {
  tulbur: ["/tulbur/guilgeeTuukh", "/tailan/avlagiin-nasjilt", "/tailan/orlogo-avlaga", "/geree", "/geree/geree", "/khynalt"],
  bvrtgel: ["/geree", "/geree/geree", "/geree/orshinSuugch", "/geree/tootBurtgel", "/tulbur/guilgeeTuukh"],
  statistik: ["/khynalt", "/geree", "/geree/geree", "/tailan/negtgel", "/tailan/bi"],
  zogsool: ["/zogsool/camera", "/zogsool/jagsaalt", "/tailan/zogsool", "/zogsool"],
};

function erkhtei(ajiltan, bulag) {
  if (String(ajiltan?.erkh || "").toLowerCase() === "admin") return true;
  const bii = new Set(Array.isArray(ajiltan?.tsonkhniiErkhuud) ? ajiltan.tsonkhniiErkhuud : []);
  return (ERKHUUD[bulag] || []).some((zam) => {
    const id = zam.slice(1).replace(/\//g, ".");
    return bii.has(zam) || bii.has(id);
  });
}

/**
 * Хүсэлтийн хамрах хүрээ: байгууллага, зөвшөөрөгдсөн барилгууд, ажилтан.
 * Нэг хүсэлтэд нэг удаа тооцоод хэрэгсэл бүрт дамжуулна.
 */
async function khamrakhKhureeBeldekh(req) {
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  const token = req.body.nevtersenAjiltniiToken || {};
  const ajiltniiId = token.id || token.sub;
  if (!kholbolt?.baiguullagiinId || !ajiltniiId) return null;
  const baiguullagiinId = String(kholbolt.baiguullagiinId);

  const [ajiltan, baiguullaga] = await Promise.all([
    Ajiltan(db.erunkhiiKholbolt).findById(ajiltniiId).select("erkh tsonkhniiErkhuud barilguud baiguullagiinId").lean(),
    Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId).select("barilguud._id barilguud.ner").lean(),
  ]);
  if (!ajiltan || String(ajiltan.baiguullagiinId) !== baiguullagiinId) return null;

  const buhBarilga = (baiguullaga?.barilguud || []).map((b) => ({ id: String(b._id), ner: b.ner || "" }));
  const admin = String(ajiltan.erkh || "").toLowerCase() === "admin";
  const onooson = new Set((ajiltan.barilguud || []).map(String));
  const barilguud = admin || onooson.size === 0 ? buhBarilga : buhBarilga.filter((b) => onooson.has(b.id));

  const songoson = barilguud.find((b) => b.id === String(req.body?.barilgiinId || "")) || null;
  return { kholbolt, baiguullagiinId, ajiltan, barilguud, songoson };
}

/** AI-ийн өгсөн барилгын нэрийг зөвшөөрөгдсөн барилгуудаас олно. */
function barilgaShiidekh(kh, barilgaNer) {
  const ner = String(barilgaNer || "").trim().toLowerCase();
  if (ner && ner !== "бүгд" && ner !== "all") {
    const olson = kh.barilguud.filter((b) => b.ner.toLowerCase().includes(ner));
    if (!olson.length) return { aldaa: `«${barilgaNer}» нэртэй (эрхтэй) барилга олдсонгүй.` };
    return { idnuud: olson.map((b) => b.id), nernuud: olson.map((b) => b.ner) };
  }
  if (!ner && kh.songoson) return { idnuud: [kh.songoson.id], nernuud: [kh.songoson.ner] };
  return { idnuud: kh.barilguud.map((b) => b.id), nernuud: ["Бүх барилга"] };
}

const barilgiinNer = (kh, id) => kh.barilguud.find((b) => b.id === String(id))?.ner || "";
const neriinKhelber = (g) => [g.ovog ? `${String(g.ovog).charAt(0)}.` : "", g.ner || ""].join(" ").trim();

/** Гэрээ тус бүрийн үлдэгдэл = Σ guilgeeAvlaguud.dun (эерэг — авлага, сөрөг — төлөлт). */
async function uldegdluud(kh, gereeniiIdnuud) {
  if (!gereeniiIdnuud.length) return new Map();
  const rows = await GuilgeeAvlaguud(kh.kholbolt).aggregate([
    { $match: { baiguullagiinId: kh.baiguullagiinId, gereeniiId: { $in: gereeniiIdnuud.map(String) } } },
    { $group: { _id: "$gereeniiId", uldegdel: { $sum: "$dun" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), toirog(r.uldegdel)]));
}

const TODORKHOILOLT = [
  {
    name: "uldegdeltei_jagsaalt",
    description:
      "Үлдэгдэл (өр, авлага)-тай идэвхтэй гэрээнүүдийг их өртэйгөөс нь эрэмбэлж жагсаана. Мөн нийт авлагатай гэрээний тоо, нийт авлагын дүнг өгнө. 'Хэн хамгийн их өртэй', 'X-ээс их өртэй айлууд' гэх мэт асуултад.",
    parameters: {
      type: "object",
      properties: {
        barilga: { type: "string", description: "Барилгын нэр. Хоосон бол хэрэглэгчийн сонгосон барилга. 'бүгд' бол бүх барилга." },
        dooddDun: { type: "number", description: "Энэ дүнгээс их үлдэгдэлтэйг л харуулна (₮). Анхдагч 0." },
        too: { type: "number", description: "Хэдэн мөр харуулах (1-20). Анхдагч 10." },
      },
    },
  },
  {
    name: "toot_khaikh",
    description:
      "Тоот, эсвэл оршин суугчийн нэрээр гэрээ хайж үлдэгдэл, төрөл, орц, давхар, сүүлийн нэхэмжлэхийн төлөвийг өгнө. 'X тоотын үлдэгдэл', 'Бат гэдэг хүн хэдэн төгрөгийн өртэй' гэх мэт.",
    parameters: {
      type: "object",
      properties: {
        toot: { type: "string", description: "Тоот / дугаар, жишээ '45'." },
        ner: { type: "string", description: "Оршин суугчийн нэр эсвэл овгийн хэсэг." },
        barilga: { type: "string", description: "Барилгын нэр (сонголтоор)." },
      },
    },
  },
  {
    name: "yerunkhii_statistik",
    description:
      "Идэвхтэй/цуцалсан гэрээний тоо (төрлөөр), нийт авлага, өртэй гэрээний тоо, илүү төлөлттэй гэрээний тоо.",
    parameters: {
      type: "object",
      properties: { barilga: { type: "string", description: "Барилгын нэр (сонголтоор)." } },
    },
  },
  {
    name: "nekhemjlekh_statistik",
    description:
      "Сонгосон сарын нэхэмжлэхүүдийн тоо ба дүнг төлөвөөр (Төлсөн / Төлөөгүй / Хугацаа хэтэрсэн) гаргана.",
    parameters: {
      type: "object",
      properties: {
        sar: { type: "string", description: "Сар 'YYYY-MM' хэлбэрээр. Хоосон бол энэ сар." },
        barilga: { type: "string", description: "Барилгын нэр (сонголтоор)." },
      },
    },
  },
  {
    name: "zogsool_orlogo",
    description:
      "Зогсоолын (камер касс) орлогыг хугацаагаар, төлбөрийн хэлбэрээр (бэлэн, карт, QPay г.м.) гаргана. Хөнгөлөлтийг орлогод тооцохгүй.",
    parameters: {
      type: "object",
      properties: {
        ekhlekh: { type: "string", description: "Эхлэх өдөр 'YYYY-MM-DD'. Хоосон бол өнөөдөр." },
        duusakh: { type: "string", description: "Дуусах өдөр 'YYYY-MM-DD'. Хоосон бол эхлэх өдөртэй ижил." },
        barilga: { type: "string", description: "Барилгын нэр (сонголтоор)." },
      },
    },
  },
];

const BULAG = {
  uldegdeltei_jagsaalt: "tulbur",
  toot_khaikh: "bvrtgel",
  yerunkhii_statistik: "statistik",
  nekhemjlekh_statistik: "tulbur",
  zogsool_orlogo: "zogsool",
};

const GUITSETGEGCH = {
  async uldegdeltei_jagsaalt(kh, args) {
    const b = barilgaShiidekh(kh, args.barilga);
    if (b.aldaa) return { aldaa: b.aldaa };
    const doodDun = Math.max(0, Number(args.dooddDun) || 0);
    const too = Math.min(20, Math.max(1, Math.round(Number(args.too) || 10)));

    const idevkhtei = await Geree(kh.kholbolt, true)
      .find({ baiguullagiinId: kh.baiguullagiinId, barilgiinId: { $in: b.idnuud }, tuluv: "Идэвхтэй" })
      .select("_id")
      .lean();
    const idevkhteiIdnuud = idevkhtei.map((g) => String(g._id));
    if (!idevkhteiIdnuud.length) return { barilga: b.nernuud, jagsaalt: [], niitAvlagatai: 0, niitAvlaga: 0 };

    const [facet] = await GuilgeeAvlaguud(kh.kholbolt).aggregate([
      { $match: { baiguullagiinId: kh.baiguullagiinId, gereeniiId: { $in: idevkhteiIdnuud } } },
      { $group: { _id: "$gereeniiId", uldegdel: { $sum: "$dun" } } },
      { $match: { uldegdel: { $gt: 0.5 } } },
      {
        $facet: {
          niit: [{ $group: { _id: null, too: { $sum: 1 }, dun: { $sum: "$uldegdel" } } }],
          deed: [{ $match: { uldegdel: { $gt: doodDun } } }, { $sort: { uldegdel: -1 } }, { $limit: too }],
          dooshTooluur: [{ $match: { uldegdel: { $gt: doodDun } } }, { $count: "too" }],
        },
      },
    ]);
    const deed = facet?.deed || [];
    const gereenuud = await Geree(kh.kholbolt, true)
      .find({ _id: { $in: deed.map((r) => r._id) } })
      .select("ovog ner toot orts davkhar turul barilgiinId")
      .lean();
    const gMap = new Map(gereenuud.map((g) => [String(g._id), g]));
    return {
      barilga: b.nernuud,
      niitAvlagatai: facet?.niit?.[0]?.too || 0,
      niitAvlaga: toirog(facet?.niit?.[0]?.dun),
      shuusenToo: facet?.dooshTooluur?.[0]?.too || 0,
      jagsaalt: deed.map((r) => {
        const g = gMap.get(String(r._id)) || {};
        return {
          ner: neriinKhelber(g),
          toot: g.toot || "",
          orts: g.orts || "",
          turul: g.turul || "",
          barilga: barilgiinNer(kh, g.barilgiinId),
          uldegdel: toirog(r.uldegdel),
        };
      }),
    };
  },

  async toot_khaikh(kh, args) {
    const toot = String(args.toot || "").trim();
    const ner = String(args.ner || "").trim();
    if (!toot && !ner) return { aldaa: "Тоот эсвэл нэр хэрэгтэй." };
    const b = barilgaShiidekh(kh, args.barilga);
    if (b.aldaa) return { aldaa: b.aldaa };

    const shuult = { baiguullagiinId: kh.baiguullagiinId, barilgiinId: { $in: b.idnuud } };
    const nukhtsul = [];
    if (toot) nukhtsul.push({ $or: [{ toot }, { "nemeltTootnuud.toot": toot }] });
    if (ner) {
      const re = new RegExp(regexEscape(ner.slice(0, 40)), "i");
      nukhtsul.push({ $or: [{ ner: re }, { ovog: re }] });
    }
    const gereenuud = await Geree(kh.kholbolt, true)
      .find({ ...shuult, $and: nukhtsul })
      .select("ovog ner toot orts davkhar turul tuluv barilgiinId gereeniiDugaar")
      .sort({ tuluv: 1 })
      .limit(10)
      .lean();
    if (!gereenuud.length) return { barilga: b.nernuud, jagsaalt: [], tailbar: "Тохирох гэрээ олдсонгүй." };

    const idnuud = gereenuud.map((g) => String(g._id));
    const [uld, suuliinNekh] = await Promise.all([
      uldegdluud(kh, idnuud),
      NekhemjlekhiinTuukh(kh.kholbolt).aggregate([
        { $match: { baiguullagiinId: kh.baiguullagiinId, gereeniiId: { $in: idnuud } } },
        { $sort: { ognoo: -1 } },
        { $group: { _id: "$gereeniiId", ognoo: { $first: "$ognoo" }, tuluv: { $first: "$tuluv" }, dun: { $first: "$niitTulbur" } } },
      ]),
    ]);
    const nMap = new Map(suuliinNekh.map((n) => [String(n._id), n]));
    return {
      barilga: b.nernuud,
      jagsaalt: gereenuud.map((g) => {
        const n = nMap.get(String(g._id));
        return {
          ner: neriinKhelber(g),
          toot: g.toot || "",
          orts: g.orts || "",
          davkhar: g.davkhar || "",
          turul: g.turul || "",
          gereeniiTuluv: g.tuluv || "",
          barilga: barilgiinNer(kh, g.barilgiinId),
          uldegdel: uld.get(String(g._id)) ?? 0,
          suuliinNekhemjlekh: n
            ? { ognoo: new Date(n.ognoo).toISOString().slice(0, 10), tuluv: n.tuluv, dun: toirog(n.dun) }
            : null,
        };
      }),
    };
  },

  async yerunkhii_statistik(kh, args) {
    const b = barilgaShiidekh(kh, args.barilga);
    if (b.aldaa) return { aldaa: b.aldaa };
    const match = { baiguullagiinId: kh.baiguullagiinId, barilgiinId: { $in: b.idnuud } };
    const [turluur, idevkhtei] = await Promise.all([
      Geree(kh.kholbolt, true).aggregate([
        { $match: match },
        { $group: { _id: { tuluv: "$tuluv", turul: "$turul" }, too: { $sum: 1 } } },
      ]),
      Geree(kh.kholbolt, true).find({ ...match, tuluv: "Идэвхтэй" }).select("_id").lean(),
    ]);
    const idevkhteiIdnuud = idevkhtei.map((g) => String(g._id));
    const [uld] = idevkhteiIdnuud.length
      ? await GuilgeeAvlaguud(kh.kholbolt).aggregate([
          { $match: { baiguullagiinId: kh.baiguullagiinId, gereeniiId: { $in: idevkhteiIdnuud } } },
          { $group: { _id: "$gereeniiId", u: { $sum: "$dun" } } },
          {
            $group: {
              _id: null,
              avlaga: { $sum: { $cond: [{ $gt: ["$u", 0.5] }, "$u", 0] } },
              urtei: { $sum: { $cond: [{ $gt: ["$u", 0.5] }, 1, 0] } },
              iluu: { $sum: { $cond: [{ $lt: ["$u", -0.5] }, 1, 0] } },
              iluuDun: { $sum: { $cond: [{ $lt: ["$u", -0.5] }, "$u", 0] } },
            },
          },
        ])
      : [];
    const gereeniiToo = {};
    turluur.forEach((r) => {
      const tuluv = r._id.tuluv || "Тодорхойгүй";
      gereeniiToo[tuluv] = gereeniiToo[tuluv] || { niit: 0, turluur: {} };
      gereeniiToo[tuluv].niit += r.too;
      gereeniiToo[tuluv].turluur[r._id.turul || "Бусад"] = r.too;
    });
    return {
      barilga: b.nernuud,
      gereeniiToo,
      niitAvlaga: toirog(uld?.avlaga),
      urteiGereeniiToo: uld?.urtei || 0,
      iluuTulultteiToo: uld?.iluu || 0,
      iluuTulultiinDun: toirog(Math.abs(uld?.iluuDun || 0)),
    };
  },

  async nekhemjlekh_statistik(kh, args) {
    const b = barilgaShiidekh(kh, args.barilga);
    if (b.aldaa) return { aldaa: b.aldaa };
    const sar = /^\d{4}-\d{2}$/.test(String(args.sar || "")) ? args.sar : unuudur().slice(0, 7);
    const [on, s] = sar.split("-").map(Number);
    const ekhlel = new Date(`${sar}-01T00:00:00.000${MN_OFFSET}`);
    const daraa = new Date(`${s === 12 ? on + 1 : on}-${String(s === 12 ? 1 : s + 1).padStart(2, "0")}-01T00:00:00.000${MN_OFFSET}`);
    const rows = await NekhemjlekhiinTuukh(kh.kholbolt).aggregate([
      { $match: { baiguullagiinId: kh.baiguullagiinId, barilgiinId: { $in: b.idnuud }, ognoo: { $gte: ekhlel, $lt: daraa } } },
      { $group: { _id: "$tuluv", too: { $sum: 1 }, dun: { $sum: "$niitTulbur" } } },
    ]);
    const tuluvuur = {};
    rows.forEach((r) => (tuluvuur[r._id || "Тодорхойгүй"] = { too: r.too, dun: toirog(r.dun) }));
    return {
      barilga: b.nernuud,
      sar,
      tuluvuur,
      niitToo: rows.reduce((a, r) => a + r.too, 0),
      niitDun: toirog(rows.reduce((a, r) => a + (r.dun || 0), 0)),
    };
  },

  async zogsool_orlogo(kh, args) {
    const b = barilgaShiidekh(kh, args.barilga);
    if (b.aldaa) return { aldaa: b.aldaa };
    const ekhlekhUdur = args.ekhlekh || unuudur();
    const duusakhUdur = args.duusakh || ekhlekhUdur;
    const ekhlel = udriinKhil(ekhlekhUdur);
    const tugsgul = udriinKhil(duusakhUdur, true);
    if (!ekhlel || !tugsgul || tugsgul < ekhlel) return { aldaa: "Огноо буруу. 'YYYY-MM-DD' хэлбэрээр өгнө үү." };
    if (tugsgul - ekhlel > 62 * 86400000) return { aldaa: "Хугацаа 62 хоногоос урт байж болохгүй." };

    const { Uilchluulegch } = require("sukhParking-v1");
    // Дууссан сессүүд өдөр бүр сарын архив руу шилждэг тул тухайн сарын архивыг ч уншина.
    const sarnuud = new Set();
    for (let d = new Date(ekhlel); d <= tugsgul; d = new Date(d.getTime() + 86400000)) {
      sarnuud.add(new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 7).replace("-", ""));
    }
    const modeluud = [Uilchluulegch(kh.kholbolt, true)];
    sarnuud.forEach((ym) => {
      try {
        modeluud.push(Uilchluulegch(kh.kholbolt, true, `Uilchluulegch${ym}`));
      } catch {
        /* архив байхгүй бол алгасна */
      }
    });

    const pipeline = [
      { $match: { baiguullagiinId: kh.baiguullagiinId, barilgiinId: { $in: b.idnuud } } },
      { $unwind: "$tuukh" },
      { $unwind: "$tuukh.tulbur" },
      {
        $match: {
          "tuukh.tulbur.ognoo": { $gte: ekhlel, $lte: tugsgul },
          "tuukh.tulbur.dun": { $gt: 0 },
          "tuukh.tulbur.turul": { $nin: KHUNGULULT_TURLUUD },
        },
      },
      { $group: { _id: "$tuukh.tulbur.turul", dun: { $sum: "$tuukh.tulbur.dun" }, too: { $sum: 1 } } },
    ];
    const khelber = {};
    for (const M of modeluud) {
      try {
        const rows = await M.aggregate(pipeline);
        rows.forEach((r) => {
          const k = r._id || "Бусад";
          khelber[k] = khelber[k] || { dun: 0, too: 0 };
          khelber[k].dun += r.dun;
          khelber[k].too += r.too;
        });
      } catch {
        /* архивын коллекц байхгүй байж болно */
      }
    }
    Object.values(khelber).forEach((v) => (v.dun = toirog(v.dun)));
    return {
      barilga: b.nernuud,
      ekhlekh: ekhlekhUdur,
      duusakh: duusakhUdur,
      tulburiinKhelber: khelber,
      niitOrlogo: toirog(Object.values(khelber).reduce((a, v) => a + v.dun, 0)),
      guilgeeniiToo: Object.values(khelber).reduce((a, v) => a + v.too, 0),
    };
  },
};

/** Хэрэгслийг эрх шалгаж ажиллуулна. Алдааг AI-д ойлгомжтой объект болгож буцаана. */
async function kheregselAjilluulakh(kh, ner, args) {
  const fn = GUITSETGEGCH[ner];
  if (!fn) return { aldaa: `Үл мэдэгдэх хэрэгсэл: ${ner}` };
  if (!erkhtei(kh.ajiltan, BULAG[ner])) {
    return { aldaa: "Энэ ажилтанд энэ мэдээллийг харах эрх байхгүй. Хэрэглэгчид эрхгүй гэдгийг эелдгээр хэл." };
  }
  if (!kh.barilguud.length) return { aldaa: "Ажилтанд харах барилга оноогдоогүй байна." };
  try {
    return await fn(kh, args && typeof args === "object" ? args : {});
  } catch (err) {
    console.error(`AI хэрэгсэл ${ner} алдаа:`, err.message);
    return { aldaa: "Мэдээлэл уншихад алдаа гарлаа." };
  }
}

/** System prompt-д нэмэх хүрээний тайлбар. */
function khureeniiTailbar(kh) {
  const nernuud = kh.barilguud.map((b) => b.ner).filter(Boolean);
  const erkhuud = Object.keys(ERKHUUD).filter((k) => erkhtei(kh.ajiltan, k));
  return [
    `Өнөөдөр: ${unuudur()} (Монголын цаг).`,
    `Ажилтны харах эрхтэй барилгууд: ${nernuud.join(", ") || "байхгүй"}.`,
    kh.songoson ? `Одоо сонгосон барилга: ${kh.songoson.ner}.` : "Тодорхой барилга сонгоогүй.",
    `Ажилтны өгөгдлийн эрх: ${erkhuud.length ? erkhuud.join(", ") : "байхгүй"}.`,
  ].join("\n");
}

module.exports = { TODORKHOILOLT, khamrakhKhureeBeldekh, kheregselAjilluulakh, khureeniiTailbar };
