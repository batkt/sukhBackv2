/**
 * BI тайлан — бүх домэйны үзүүлэлтийг НЭГ хүсэлтээр серверт нэгтгэж буцаана.
 *
 *   GET /tailan/bi?baiguullagiinId=&barilgiinId=&ekhlekhOgnoo=&duusakhOgnoo=
 *
 * Яагаад нэг endpoint:
 *   Тайлан бүр өөрийн query, өөрийн тооцоолол бичдэг байсан тул ижил
 *   үзүүлэлт хэд хэдэн өөр тоо гаргадаг байв (үлдэгдэл 3 өөр аргаар
 *   бодогддог байсан). BI-д бүх тоо ЭНД, нэг эх сурвалжаас бодогдоно.
 *
 * Хүнд тооллыг Mongo aggregate дээр гүйцэтгэнэ - бүх бичлэгийг Node рүү
 * татахгүй.
 */

const express = require("express");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");
const { Uilchluulegch } = require("sukhParking-v1");

const Geree = require("../models/geree");
const OrshinSuugch = require("../models/orshinSuugch");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const Medegdel = require("../models/medegdel");
const SanalAsuulga = require("../models/sanalAsuulga");
const SanalAsuulgiinKhariult = require("../models/sanalAsuulgiinKhariult");
const KhaalgaNeeyeTuukh = require("../models/khaalgaNeeyeTuukh");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/** YYYY-MM хэлбэрийн сарын түлхүүр (орон нутгийн цагаар) */
const sariinTulkhuur = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Хугацааны хооронд байгаа бүх сарын түлхүүрийг дараалалтайгаар */
function saruudAvya(ekhlekh, duusakh) {
  const jagsaalt = [];
  const it = new Date(ekhlekh.getFullYear(), ekhlekh.getMonth(), 1);
  const duusakhSar = new Date(duusakh.getFullYear(), duusakh.getMonth(), 1);
  while (it <= duusakhSar) {
    jagsaalt.push(sariinTulkhuur(it));
    it.setMonth(it.getMonth() + 1);
  }
  return jagsaalt;
}

const bugtgel = (n) => Math.round((Number(n) || 0) * 100) / 100;

router.get("/tailan/bi", tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, ekhlekhOgnoo, duusakhOgnoo } =
      req.query || {};

    if (!baiguullagiinId)
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId шаардлагатай" });

    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    if (!kholbolt)
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });

    // ── Хугацаа: заагаагүй бол сүүлийн 12 сар ──
    const duusakh = duusakhOgnoo ? new Date(duusakhOgnoo) : new Date();
    duusakh.setHours(23, 59, 59, 999);
    const ekhlekh = ekhlekhOgnoo
      ? new Date(ekhlekhOgnoo)
      : new Date(duusakh.getFullYear(), duusakh.getMonth() - 11, 1);
    ekhlekh.setHours(0, 0, 0, 0);

    const saruud = saruudAvya(ekhlekh, duusakh);
    const orgShuult = { baiguullagiinId: String(baiguullagiinId) };
    const barilgaShuult = barilgiinId
      ? { ...orgShuult, barilgiinId: String(barilgiinId) }
      : orgShuult;
    const khugatsaa = { $gte: ekhlekh, $lte: duusakh };

    // ── Бүх хэсгийг зэрэг гүйцэтгэнэ ──
    const [
      gereenuud,
      suugchdiinToo,
      guilgeeSaraar,
      guilgeeTurluur,
      avlagaGereegeer,
      zogsoolSessionuud,
      medegdelToo,
      asuulguud,
      asuulgiinKhariult,
      khaalgaNeelt,
    ] = await Promise.all([
      // 1. Гэрээ — төлөв, барилга, үүссэн сараар
      Geree(kholbolt)
        .find({ ...barilgaShuult, ustgagdakhEsekh: { $ne: true } })
        .select("tuluv barilgiinId createdAt toot orts")
        .lean(),

      // 2. Оршин суугчийн тоо
      OrshinSuugch(db.erunkhiiKholbolt).countDocuments(orgShuult),

      // 3. Нэхэмжилсэн / төлсөн — сараар
      GuilgeeAvlaguud(kholbolt).aggregate([
        { $match: { ...barilgaShuult, ognoo: khugatsaa } },
        {
          $group: {
            _id: { sar: { $dateToString: { format: "%Y-%m", date: "$ognoo" } } },
            nekhemjilsen: { $sum: { $cond: [{ $gt: ["$dun", 0] }, "$dun", 0] } },
            tulsun: {
              $sum: { $cond: [{ $lt: ["$dun", 0] }, { $abs: "$dun" }, 0] },
            },
          },
        },
      ]),

      // 4. Төлөлт — эх сурвалжаар (төлбөрийн хэрэгсэл)
      GuilgeeAvlaguud(kholbolt).aggregate([
        { $match: { ...barilgaShuult, ognoo: khugatsaa, dun: { $lt: 0 } } },
        {
          $group: {
            _id: { $ifNull: ["$source", "busad"] },
            dun: { $sum: { $abs: "$dun" } },
            too: { $sum: 1 },
          },
        },
        { $sort: { dun: -1 } },
      ]),

      // 5. Авлага — гэрээгээр. Үлдэгдэл нь ХУРИМТЛАГДСАН (эхнээс duusakh
      //    хүртэл) байх ёстой, эс тэгвээс өмнөх саруудын өр алга болно.
      GuilgeeAvlaguud(kholbolt).aggregate([
        { $match: { ...barilgaShuult, ognoo: { $lte: duusakh } } },
        {
          $group: {
            _id: "$gereeniiId",
            nekhemjilsen: { $sum: { $cond: [{ $gt: ["$dun", 0] }, "$dun", 0] } },
            tulsun: {
              $sum: { $cond: [{ $lt: ["$dun", 0] }, { $abs: "$dun" }, 0] },
            },
            khamgiinKhuuchin: {
              $min: { $cond: [{ $gt: ["$dun", 0] }, "$ognoo", null] },
            },
            gereeniiDugaar: { $first: "$gereeniiDugaar" },
            toot: { $first: "$toot" },
          },
        },
      ]),

      // 6. Зогсоол — session-ууд
      Uilchluulegch(kholbolt, true)
        .find({ ...barilgaShuult, createdAt: khugatsaa })
        .select("tuukh niitDun createdAt mashiniiDugaar")
        .lean()
        .catch(() => []),

      // 7. Мэдэгдэл / санал хүсэлт
      Medegdel(kholbolt)
        .aggregate([
          { $match: { ...orgShuult, createdAt: khugatsaa } },
          {
            $group: {
              _id: { $ifNull: ["$turul", "busad"] },
              too: { $sum: 1 },
              unshaagui: {
                $sum: { $cond: [{ $ne: ["$kharsanEsekh", true] }, 1, 0] },
              },
            },
          },
        ])
        .catch(() => []),

      // 8. Санал асуулга
      SanalAsuulga(kholbolt)
        .find({ ...orgShuult, ustgagdakhEsekh: { $ne: true } })
        .select("garchig tuluv asuultuud createdAt")
        .lean()
        .catch(() => []),

      SanalAsuulgiinKhariult(kholbolt)
        .aggregate([
          { $match: orgShuult },
          { $group: { _id: "$asuulgiinId", too: { $sum: 1 } } },
        ])
        .catch(() => []),

      // 9. Хаалга нээлт (камер)
      KhaalgaNeeyeTuukh(kholbolt)
        .aggregate([
          { $match: { ...barilgaShuult, createdAt: khugatsaa } },
          {
            $group: {
              _id: {
                sar: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              },
              too: { $sum: 1 },
            },
          },
        ])
        .catch(() => []),
    ]);

    /* ─── Гэрээ / оршин суугч ─────────────────────────────────────────── */
    const gereeTuluvuur = {};
    const gereeBarilgaar = {};
    const gereeSaraar = {};
    gereenuud.forEach((g) => {
      const t = g.tuluv || "Тодорхойгүй";
      gereeTuluvuur[t] = (gereeTuluvuur[t] || 0) + 1;
      const b = String(g.barilgiinId || "-");
      gereeBarilgaar[b] = (gereeBarilgaar[b] || 0) + 1;
      if (g.createdAt) {
        const s = sariinTulkhuur(new Date(g.createdAt));
        if (saruud.includes(s)) gereeSaraar[s] = (gereeSaraar[s] || 0) + 1;
      }
    });

    /* ─── Орлого сараар ──────────────────────────────────────────────── */
    const saraarMap = new Map(guilgeeSaraar.map((r) => [String(r._id.sar), r]));
    const orlogoSaraar = saruud.map((s) => {
      const r = saraarMap.get(s);
      return {
        sar: s,
        nekhemjilsen: bugtgel(r?.nekhemjilsen || 0),
        tulsun: bugtgel(r?.tulsun || 0),
      };
    });

    const niitNekhemjilsen = orlogoSaraar.reduce((s, r) => s + r.nekhemjilsen, 0);
    const niitTulsun = orlogoSaraar.reduce((s, r) => s + r.tulsun, 0);

    /* ─── Авлага ба насжилт ──────────────────────────────────────────── */
    const odoo = duusakh.getTime();
    const nasjilt = { p0_30: 0, p31_60: 0, p61_90: 0, p91_120: 0, p120plus: 0 };
    let niitUldegdel = 0;
    const uldegdeltei = [];

    avlagaGereegeer.forEach((r) => {
      const uld = bugtgel((r.nekhemjilsen || 0) - (r.tulsun || 0));
      if (uld <= 0.009) return;
      niitUldegdel += uld;
      uldegdeltei.push({
        gereeniiId: String(r._id || ""),
        gereeniiDugaar: r.gereeniiDugaar || "",
        toot: r.toot || "",
        uldegdel: uld,
      });
      // Хамгийн хуучин авлагын өдрөөр насжилтын хүрээг тодорхойлно
      const khuuchin = r.khamgiinKhuuchin
        ? new Date(r.khamgiinKhuuchin).getTime()
        : odoo;
      const khonog = Math.floor((odoo - khuuchin) / 86400000);
      if (khonog <= 30) nasjilt.p0_30 += uld;
      else if (khonog <= 60) nasjilt.p31_60 += uld;
      else if (khonog <= 90) nasjilt.p61_90 += uld;
      else if (khonog <= 120) nasjilt.p91_120 += uld;
      else nasjilt.p120plus += uld;
    });

    Object.keys(nasjilt).forEach((k) => (nasjilt[k] = bugtgel(nasjilt[k])));
    uldegdeltei.sort((a, b) => b.uldegdel - a.uldegdel);

    /* ─── Зогсоол ────────────────────────────────────────────────────── */
    const zogsoolSaraar = {};
    const zogsoolTurluur = {};
    let zogsoolOrlogo = 0;
    let zurchilteiToo = 0;

    zogsoolSessionuud.forEach((u) => {
      const mur = u.tuukh?.[0];
      if (u.createdAt) {
        const s = sariinTulkhuur(new Date(u.createdAt));
        if (saruud.includes(s)) zogsoolSaraar[s] = (zogsoolSaraar[s] || 0) + 1;
      }
      if (mur?.tuluv === -1 || mur?.tuluv === -2) zurchilteiToo += 1;
      (mur?.tulbur || []).forEach((t) => {
        const dun = Number(t?.dun) || 0;
        if (dun <= 0) return;
        zogsoolOrlogo += dun;
        const turul = t?.turul || "busad";
        zogsoolTurluur[turul] = bugtgel((zogsoolTurluur[turul] || 0) + dun);
      });
    });

    /* ─── Санал асуулга ──────────────────────────────────────────────── */
    const khariultMap = new Map(
      asuulgiinKhariult.map((r) => [String(r._id), r.too]),
    );
    const asuulgiinDun = asuulguud.map((a) => ({
      _id: String(a._id),
      garchig: a.garchig,
      tuluv: a.tuluv,
      asuultiinToo: (a.asuultuud || []).length,
      khariultiinToo: khariultMap.get(String(a._id)) || 0,
    }));

    /* ─── Мэдэгдэл ───────────────────────────────────────────────────── */
    const medegdelTurluur = medegdelToo.map((r) => ({
      turul: String(r._id || "busad"),
      too: r.too,
      unshaagui: r.unshaagui,
    }));

    /* ─── Хаалга ─────────────────────────────────────────────────────── */
    const khaalgaMap = new Map(khaalgaNeelt.map((r) => [String(r._id.sar), r.too]));

    return res.json({
      success: true,
      khugatsaa: {
        ekhlekh: ekhlekh.toISOString(),
        duusakh: duusakh.toISOString(),
        saruud,
      },
      kpi: {
        niitGeree: gereenuud.length,
        niitOrshinSuugch: suugchdiinToo,
        niitNekhemjilsen: bugtgel(niitNekhemjilsen),
        niitTulsun: bugtgel(niitTulsun),
        niitUldegdel: bugtgel(niitUldegdel),
        // Цуглуулгын хувь: төлсөн / нэхэмжилсэн
        tsugluulgiinKhuvi:
          niitNekhemjilsen > 0
            ? bugtgel((niitTulsun / niitNekhemjilsen) * 100)
            : 0,
        uldegdelteiGeree: uldegdeltei.length,
        zogsoolOrlogo: bugtgel(zogsoolOrlogo),
        zogsoolSession: zogsoolSessionuud.length,
        asuulgiinToo: asuulguud.length,
        khaalgaNeelt: khaalgaNeelt.reduce((s, r) => s + r.too, 0),
      },
      geree: {
        tuluvuur: gereeTuluvuur,
        barilgaar: gereeBarilgaar,
        saraar: saruud.map((s) => ({ sar: s, too: gereeSaraar[s] || 0 })),
      },
      orlogo: { saraar: orlogoSaraar },
      avlaga: {
        nasjilt,
        khamgiinIkhUldegdel: uldegdeltei.slice(0, 10),
      },
      tulburiinKhelber: guilgeeTurluur.map((r) => ({
        turul: String(r._id || "busad"),
        dun: bugtgel(r.dun),
        too: r.too,
      })),
      zogsool: {
        saraar: saruud.map((s) => ({ sar: s, too: zogsoolSaraar[s] || 0 })),
        turluur: zogsoolTurluur,
        zurchilteiToo,
      },
      sanalAsuulga: asuulgiinDun,
      medegdel: medegdelTurluur,
      khaalga: {
        saraar: saruud.map((s) => ({ sar: s, too: khaalgaMap.get(s) || 0 })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
