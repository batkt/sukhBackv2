/**
 * Шилэн данс — СӨХ-ийн тухайн хугацааны орлого, зарлага, авлага, дансны
 * үлдэгдлийг нэг дор нэгтгэнэ (Санхүү → Шилэн данс хуудас).
 *
 * Эх сурвалж:
 *  - bankniiGuilgee      — дансны хуулга: орлого/зарлага, үлдэгдэл
 *  - guilgeeAvlaguud     — нэхэмжилсэн / төлөгдсөн / хөнгөлөлт, авлага
 *                          (/tailan/tulbur-dugnelt-тэй ижил тэмдгийн дүрэм:
 *                           dun > 0 нэхэмжилсэн, dun < 0 төлсөн)
 *  - Uilchluulegch (+сарын архив), zogsoolGaraarOrlogo — зогсоолын орлого
 *
 * Төсөв, зарлагын ангилал одоогоор байхгүй (тусдаа model шаардлагатай).
 */
const asyncHandler = require("express-async-handler");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const ZogsoolGaraarOrlogo = require("../models/zogsoolGaraarOrlogo");

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
      "postDate tranDate TxDt tranPostedDate createdAt amount Amt tranAmount income outcome kholbosonDun drOrCr balance dansniiDugaar bank description TxAddInf relatedAccount accName",
    )
    .lean();

  const dansMap = new Map();
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

    if (dun >= 0) {
      d.orlogo += dun;
      orlogo += dun;
    } else {
      d.zarlaga += -dun;
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
      });
    }
  }

  return {
    orlogo,
    zarlaga,
    dansuud: Array.from(dansMap.values()),
    zarlaguud: zarlaguud.sort((a, b) => b.ognoo - a.ognoo),
  };
}

async function avlagaKhesegAvya(kholbolt, baseMatch, ekhlel, tugsgul) {
  const isDisc = {
    $or: [{ $eq: ["$turul", "Хөнгөлөлт"] }, { $eq: ["$source", "khungulult"] }],
  };
  const nekhemjilsen = {
    $and: [{ $not: isDisc }, { $gt: ["$dun", 0] }],
  };
  const tulsun = { $and: [{ $not: isDisc }, { $lt: ["$dun", 0] }] };
  const GA = GuilgeeAvlaguud(kholbolt);

  const [zadargaa, khuraangui, ekhniiAvlaga, etssiinAvlaga] = await Promise.all([
    // Хугацаанд нэхэмжилсэн/төлсөн — зардлын нэрээр. Эхний үлдэгдэл бол
    // өмнөх хугацааны өр тул энэ хугацааны орлогод оруулахгүй.
    GA.aggregate([
      {
        $match: {
          ...baseMatch,
          ognoo: { $gte: ekhlel, $lte: tugsgul },
          ekhniiUldegdelEsekh: { $ne: true },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$zardliinNer", "Бусад"] },
          nekhemjilsen: { $sum: { $cond: [nekhemjilsen, "$dun", 0] } },
          tulsun: { $sum: { $cond: [tulsun, { $abs: "$dun" }, 0] } },
        },
      },
      { $sort: { nekhemjilsen: -1 } },
    ]),
    GA.aggregate([
      { $match: { ...baseMatch, ognoo: { $gte: ekhlel, $lte: tugsgul } } },
      {
        $group: {
          _id: null,
          nekhemjilsen: {
            $sum: {
              $cond: [
                { $and: [nekhemjilsen, { $ne: ["$ekhniiUldegdelEsekh", true] }] },
                "$dun",
                0,
              ],
            },
          },
          tulsun: { $sum: { $cond: [tulsun, { $abs: "$dun" }, 0] } },
          khungulult: { $sum: { $cond: [isDisc, { $abs: "$dun" }, 0] } },
        },
      },
    ]),
    GA.aggregate([
      { $match: { ...baseMatch, ognoo: { $lt: ekhlel } } },
      { $group: { _id: null, dun: { $sum: "$dun" } } },
    ]),
    GA.aggregate([
      { $match: { ...baseMatch, ognoo: { $lte: tugsgul } } },
      { $group: { _id: null, dun: { $sum: "$dun" } } },
    ]),
  ]);

  return {
    nekhemjilsen: khuraangui[0]?.nekhemjilsen || 0,
    tulsun: khuraangui[0]?.tulsun || 0,
    khungulult: khuraangui[0]?.khungulult || 0,
    ekhniiAvlaga: ekhniiAvlaga[0]?.dun || 0,
    etssiinAvlaga: etssiinAvlaga[0]?.dun || 0,
    zardalaar: zadargaa.map((z) => ({
      ner: z._id,
      nekhemjilsen: z.nekhemjilsen,
      tulsun: z.tulsun,
    })),
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
    arkhivNeruud.push(
      `Uilchluulegch${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
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

  const pad = (n) => String(n).padStart(2, "0");
  const udurStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const garaarMatch = {
    ...baseMatch,
    udur: { $gte: udurStr(ekhlel), $lte: udurStr(tugsgul) },
  };
  const garaar = await ZogsoolGaraarOrlogo(kholbolt).aggregate([
    { $match: garaarMatch },
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

exports.shilenDansTailan = asyncHandler(async (req, res) => {
  const source = req.method === "GET" ? req.query : req.body;
  // Холболтыг токеноос авна — body-н baiguullagiinId-д найдахгүй.
  const kholbolt = req.body.tukhainBaaziinKholbolt;
  if (!kholbolt) {
    return res
      .status(404)
      .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
  }
  const baiguullagiinId = String(kholbolt.baiguullagiinId);
  const { barilgiinId, ekhlekhOgnoo, duusakhOgnoo } = source || {};
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
    bank,
    avlaga,
    zogsool,
  });
});
