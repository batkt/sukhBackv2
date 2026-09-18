/**
 * Цэвэрлэгээ — оршин суугч аппаас захиалга үүсгэж, ажилтан админаас удирдана.
 *
 * Оршин суугчийн (апп) талын endpoint:
 *   POST /tseverlegee                    - шинэ захиалга үүсгэх
 *   GET  /orshinSuugchiinTseverlegee     - өөрийн захиалгын түүх
 *   PUT  /tseverlegee/:id/tsutsalya      - өөрийн захиалгаа цуцлах
 *
 * Ажилтны талын endpoint:
 *   GET    /tseverlegee/toollogo         - төлөв бүрийн тоо (самбарт)
 *   GET    /tseverlegee                  - жагсаалт (шүүлттэй)
 *   GET    /tseverlegee/:id              - нэгийг авах
 *   PUT    /tseverlegee/:id              - төлөв солих / гүйцэтгэгч хуваарилах
 *   DELETE /tseverlegee/:id              - устгах (зөөлөн)
 *
 * Ажилтны талыг zevtabs админ ч дууддаг. Тэрээр `tokenAvya("sukh")`-аар мастер
 * токен аваад ирдэг тул нэмэлт нууц шаардлагагүй — ердийн `tokenShalgakh` л
 * хангалттай. Харин zevtabs нь sukh дээрх baiguullagiinId-г мэддэггүй, зөвхөн
 * байгууллагын РЕГИСТРийг мэддэг тул ажилтны талын endpoint нь хоёуланг
 * хүлээж авна (`baiguullagiinId` эсвэл `register`).
 */

const express = require("express");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");

const Tseverlegee = require("../models/tseverlegee");
const { TULUVUUD, UILCHILGEENII_TURLUUD } = require("../models/tseverlegee");
const Baiguullaga = require("../models/baiguullaga");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/** Холболт олоод буцаана, олдоогүй бол хариуг нь өөрөө илгээнэ */
function kholboltAvya(res, baiguullagiinId) {
  if (!baiguullagiinId) {
    res
      .status(400)
      .json({ success: false, message: "baiguullagiinId шаардлагатай" });
    return null;
  }
  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  if (!kholbolt) {
    res
      .status(404)
      .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    return null;
  }
  return kholbolt;
}

/**
 * Ажилтны талын хүсэлтээс баазын холболтыг олно.
 *
 * `baiguullagiinId` шууд ирвэл түүнийг, эс бөгөөс `register`-ээр эрэлхийлнэ —
 * zevtabs админ нь sukh дээрх id-г мэддэггүй. Олдоогүй тохиолдолд хариуг нь
 * өөрөө илгээгээд `null` буцаана.
 */
async function baiguullagaTodorkhoiloyo(req, res) {
  // DELETE нь заримдаа query-гээр, заримдаа body-гоор параметр авчирдаг тул
  // хоёуланг нь нэгтгэж үзнэ (body нь давуу).
  const utga = { ...(req.query || {}), ...(req.body || {}) };
  let baiguullagiinId = utga.baiguullagiinId;

  if (!baiguullagiinId && utga.register) {
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
      .findOne({ register: String(utga.register) })
      .lean();
    if (!baiguullaga) {
      res
        .status(404)
        .json({ success: false, message: "Байгууллага олдсонгүй" });
      return null;
    }
    baiguullagiinId = String(baiguullaga._id);
  }

  const kholbolt = kholboltAvya(res, baiguullagiinId);
  if (!kholbolt) return null;
  return { kholbolt, baiguullagiinId: String(baiguullagiinId) };
}

/** Огноог Date болгоно, буруу бол null */
function ognooBolgoyo(utga) {
  if (!utga) return null;
  const ognoo = new Date(utga);
  return Number.isNaN(ognoo.getTime()) ? null : ognoo;
}

/* ─── Оршин суугчийн тал ───────────────────────────────────────────────── */

router.post("/tseverlegee", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      barilgiinId,
      toot,
      orshinSuugchiinId,
      orshinSuugchiinNer,
      uilchilgeeniiTurul,
      utasniiDugaar,
      nemelttMedeelel,
      khusesenOgnoo,
    } = req.body || {};

    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    if (!utasniiDugaar || !String(utasniiDugaar).trim())
      return res
        .status(400)
        .json({ success: false, message: "Утасны дугаар шаардлагатай" });

    const ognoo = ognooBolgoyo(khusesenOgnoo);
    if (!ognoo)
      return res
        .status(400)
        .json({ success: false, message: "Хүссэн огноо, цаг шаардлагатай" });

    // Өнгөрсөн цаг рүү захиалах нь утгагүй. Цагийн бүсийн бага зэргийн зөрүүг
    // тэвчихийн тулд 5 минутын хүлцэл үлдээв.
    if (ognoo.getTime() < Date.now() - 5 * 60 * 1000)
      return res.status(400).json({
        success: false,
        message: "Өнгөрсөн цаг дээр захиалга үүсгэх боломжгүй",
      });

    const turul = UILCHILGEENII_TURLUUD.includes(uilchilgeeniiTurul)
      ? uilchilgeeniiTurul
      : "Өрхийн цэвэрлэгээ";

    const zakhialga = await Tseverlegee(kholbolt).create({
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : undefined,
      toot: toot ? String(toot) : undefined,
      orshinSuugchiinId: orshinSuugchiinId
        ? String(orshinSuugchiinId)
        : undefined,
      orshinSuugchiinNer,
      uilchilgeeniiTurul: turul,
      utasniiDugaar: String(utasniiDugaar).trim(),
      nemelttMedeelel: nemelttMedeelel
        ? String(nemelttMedeelel).trim()
        : undefined,
      khusesenOgnoo: ognoo,
      tuluv: "Шинэ",
    });

    return res.status(201).json({ success: true, data: zakhialga });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/orshinSuugchiinTseverlegee",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId, orshinSuugchiinId } = req.query || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      if (!orshinSuugchiinId)
        return res.status(400).json({
          success: false,
          message: "orshinSuugchiinId шаардлагатай",
        });

      const jagsaalt = await Tseverlegee(kholbolt)
        .find({
          baiguullagiinId: String(baiguullagiinId),
          orshinSuugchiinId: String(orshinSuugchiinId),
          ustgagdakhEsekh: { $ne: true },
        })
        .sort({ khusesenOgnoo: -1 })
        .lean();

      return res.json({ success: true, data: jagsaalt });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/tseverlegee/:id/tsutsalya",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId, orshinSuugchiinId } = req.body || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      const zakhialga = await Tseverlegee(kholbolt).findById(req.params.id);
      if (!zakhialga || zakhialga.ustgagdakhEsekh)
        return res
          .status(404)
          .json({ success: false, message: "Захиалга олдсонгүй" });

      // Зөвхөн өөрийнхөө захиалгыг цуцална.
      if (String(zakhialga.orshinSuugchiinId) !== String(orshinSuugchiinId))
        return res
          .status(403)
          .json({ success: false, message: "Энэ захиалга таных биш байна" });

      if (["Дууссан", "Цуцалсан"].includes(zakhialga.tuluv))
        return res.status(400).json({
          success: false,
          message: `"${zakhialga.tuluv}" захиалгыг цуцлах боломжгүй`,
        });

      zakhialga.tuluv = "Цуцалсан";
      await zakhialga.save();

      return res.json({ success: true, data: zakhialga });
    } catch (err) {
      next(err);
    }
  },
);

/* ─── Ажилтны тал ──────────────────────────────────────────────────────── */

// `/:id`-аас ӨМНӨ бичигдэх ёстой, эс бөгөөс "toollogo" нь id гэж уншигдана.
router.get(
  "/tseverlegee/toollogo",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { barilgiinId } = req.query || {};
      const oldson = await baiguullagaTodorkhoiloyo(req, res);
      if (!oldson) return;
      const { kholbolt, baiguullagiinId } = oldson;

      const shuult = {
        baiguullagiinId,
        ustgagdakhEsekh: { $ne: true },
      };
      if (barilgiinId) shuult.barilgiinId = String(barilgiinId);

      const bulgeluud = await Tseverlegee(kholbolt).aggregate([
        { $match: shuult },
        { $group: { _id: "$tuluv", too: { $sum: 1 } } },
      ]);

      // Бүх төлвийг 0-ээр эхлүүлнэ — фронт дээр байхгүй түлхүүр шалгахгүй.
      const toollogo = TULUVUUD.reduce((dun, tuluv) => {
        dun[tuluv] = 0;
        return dun;
      }, {});
      bulgeluud.forEach((b) => {
        if (b._id in toollogo) toollogo[b._id] = b.too;
      });
      toollogo.niit = bulgeluud.reduce((d, b) => d + b.too, 0);

      return res.json({ success: true, data: toollogo });
    } catch (err) {
      next(err);
    }
  },
);

router.get("/tseverlegee", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      barilgiinId,
      tuluv,
      search,
      ekhlekhOgnoo,
      duusakhOgnoo,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 50,
    } = req.query || {};

    const oldson = await baiguullagaTodorkhoiloyo(req, res);
    if (!oldson) return;
    const { kholbolt, baiguullagiinId } = oldson;

    const shuult = {
      baiguullagiinId,
      ustgagdakhEsekh: { $ne: true },
    };
    if (barilgiinId) shuult.barilgiinId = String(barilgiinId);
    if (tuluv) shuult.tuluv = tuluv;

    const ekhlekh = ognooBolgoyo(ekhlekhOgnoo);
    const duusakh = ognooBolgoyo(duusakhOgnoo);
    if (ekhlekh || duusakh) {
      shuult.khusesenOgnoo = {};
      if (ekhlekh) shuult.khusesenOgnoo.$gte = ekhlekh;
      if (duusakh) shuult.khusesenOgnoo.$lte = duusakh;
    }

    if (search && String(search).trim()) {
      // Хэрэглэгчийн бичсэн текстийг regex болгохын өмнө тусгай тэмдэгтийг нь
      // мулт болгоно — эс бөгөөс "(" гэх мэт нь query-г унагана.
      const tseverkhen = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(tseverkhen, "i");
      shuult.$or = [
        { orshinSuugchiinNer: rx },
        { utasniiDugaar: rx },
        { toot: rx },
        { nemelttMedeelel: rx },
      ];
    }

    const khuudas = Math.max(1, Number(khuudasniiDugaar) || 1);
    const khemjee = Math.min(200, Math.max(1, Number(khuudasniiKhemjee) || 50));

    const Model = Tseverlegee(kholbolt);
    const [jagsaalt, niitMur] = await Promise.all([
      Model.find(shuult)
        .sort({ khusesenOgnoo: -1 })
        .skip((khuudas - 1) * khemjee)
        .limit(khemjee)
        .lean(),
      Model.countDocuments(shuult),
    ]);

    return res.json({
      success: true,
      data: {
        jagsaalt,
        khuudasniiDugaar: khuudas,
        khuudasniiKhemjee: khemjee,
        niitMur,
        niitKhuudas: Math.ceil(niitMur / khemjee),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/tseverlegee/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const oldson = await baiguullagaTodorkhoiloyo(req, res);
    if (!oldson) return;
    const { kholbolt } = oldson;

    const zakhialga = await Tseverlegee(kholbolt).findById(req.params.id).lean();
    if (!zakhialga || zakhialga.ustgagdakhEsekh)
      return res
        .status(404)
        .json({ success: false, message: "Захиалга олдсонгүй" });

    return res.json({ success: true, data: zakhialga });
  } catch (err) {
    next(err);
  }
});

router.put("/tseverlegee/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      tuluv,
      guitsetgegchiinId,
      guitsetgegchiinNer,
      ajiltniiTailbar,
      khusesenOgnoo,
    } = req.body || {};

    const oldson = await baiguullagaTodorkhoiloyo(req, res);
    if (!oldson) return;
    const { kholbolt } = oldson;

    const uurchlult = {};

    if (tuluv !== undefined) {
      if (!TULUVUUD.includes(tuluv))
        return res
          .status(400)
          .json({ success: false, message: `"${tuluv}" төлөв байхгүй` });
      uurchlult.tuluv = tuluv;
    }

    if (guitsetgegchiinId !== undefined)
      uurchlult.guitsetgegchiinId = guitsetgegchiinId || undefined;
    if (guitsetgegchiinNer !== undefined)
      uurchlult.guitsetgegchiinNer = guitsetgegchiinNer || undefined;
    if (ajiltniiTailbar !== undefined)
      uurchlult.ajiltniiTailbar = ajiltniiTailbar || undefined;

    if (khusesenOgnoo !== undefined) {
      const ognoo = ognooBolgoyo(khusesenOgnoo);
      if (!ognoo)
        return res
          .status(400)
          .json({ success: false, message: "Огноо буруу байна" });
      uurchlult.khusesenOgnoo = ognoo;
    }

    if (!Object.keys(uurchlult).length)
      return res
        .status(400)
        .json({ success: false, message: "Өөрчлөх утга алга" });

    const zakhialga = await Tseverlegee(kholbolt).findOneAndUpdate(
      { _id: req.params.id, ustgagdakhEsekh: { $ne: true } },
      { $set: uurchlult },
      { new: true, runValidators: true },
    );

    if (!zakhialga)
      return res
        .status(404)
        .json({ success: false, message: "Захиалга олдсонгүй" });

    return res.json({ success: true, data: zakhialga });
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/tseverlegee/:id",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const oldson = await baiguullagaTodorkhoiloyo(req, res);
      if (!oldson) return;
      const { kholbolt } = oldson;

      // Зөөлөн устгал — тайлан, түүхэнд мөр нь үлдэнэ.
      const zakhialga = await Tseverlegee(kholbolt).findByIdAndUpdate(
        req.params.id,
        { $set: { ustgagdakhEsekh: true } },
        { new: true },
      );

      if (!zakhialga)
        return res
          .status(404)
          .json({ success: false, message: "Захиалга олдсонгүй" });

      return res.json({ success: true, data: { _id: zakhialga._id } });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
