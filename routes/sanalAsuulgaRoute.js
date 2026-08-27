/**
 * Санал асуулга — админ оршин суугчид руу асуумж явуулж, хариултыг цуглуулна.
 *
 * Ажилтны талын endpoint:
 *   POST   /sanalAsuulga                  - шинээр үүсгэх
 *   GET    /sanalAsuulga                  - жагсаалт
 *   GET    /sanalAsuulga/:id              - нэгийг авах
 *   PUT    /sanalAsuulga/:id              - засах / төлөв солих (илгээх, хаах)
 *   DELETE /sanalAsuulga/:id              - устгах
 *   GET    /sanalAsuulga/:id/khariultuud  - хэн юу хариулсан (нэр, тоотоор)
 *   GET    /sanalAsuulga/:id/dun          - нэгтгэсэн үр дүн
 *
 * Оршин суугчийн (апп) талын endpoint:
 *   GET  /orshinSuugchiinSanalAsuulga     - өөрт нь хамаарах идэвхтэй асуулгууд
 *   POST /sanalAsuulga/:id/khariulya      - хариулт илгээх
 */

const express = require("express");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");

const SanalAsuulga = require("../models/sanalAsuulga");
const SanalAsuulgiinKhariult = require("../models/sanalAsuulgiinKhariult");
const OrshinSuugch = require("../models/orshinSuugch");
const {
  orshinSuugchidSonorduulgaIlgeeye,
} = require("../controller/appNotification");
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

/** GET дээр query, бусад дээр body-оос уншина */
const utgaAvya = (req) => (req.method === "GET" ? req.query : req.body);

/* ─── Ажилтны тал ──────────────────────────────────────────────────────── */

router.post("/sanalAsuulga", tokenShalgakh, async (req, res, next) => {
  try {
    const {
      baiguullagiinId,
      barilguud,
      garchig,
      tailbar,
      asuultuud,
      ekhlekhOgnoo,
      duusakhOgnoo,
      tuluv,
      ajiltniiId,
      ajiltniiNer,
    } = req.body || {};

    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    if (!garchig || !String(garchig).trim())
      return res
        .status(400)
        .json({ success: false, message: "Гарчиг шаардлагатай" });

    if (!Array.isArray(asuultuud) || asuultuud.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "Дор хаяж нэг асуулт шаардлагатай" });

    // Сонголттой асуулт нь дор хаяж 2 хувилбартай байх ёстой
    for (const a of asuultuud) {
      if (!a?.asuult || !String(a.asuult).trim())
        return res
          .status(400)
          .json({ success: false, message: "Асуултын текст хоосон байна" });
      const songoltToi = a.turul !== "tekst";
      if (songoltToi && (!Array.isArray(a.songoltuud) || a.songoltuud.length < 2))
        return res.status(400).json({
          success: false,
          message: `"${a.asuult}" асуултад дор хаяж 2 хувилбар шаардлагатай`,
        });
    }

    const asuulga = await SanalAsuulga(kholbolt).create({
      baiguullagiinId: String(baiguullagiinId),
      barilguud: Array.isArray(barilguud) ? barilguud.map(String) : [],
      garchig: String(garchig).trim(),
      tailbar: tailbar ? String(tailbar).trim() : "",
      asuultuud,
      ekhlekhOgnoo: ekhlekhOgnoo ? new Date(ekhlekhOgnoo) : new Date(),
      duusakhOgnoo: duusakhOgnoo ? new Date(duusakhOgnoo) : undefined,
      tuluv: tuluv === "idevkhtei" ? "idevkhtei" : "noots",
      ajiltniiId,
      ajiltniiNer,
    });

    // Шууд идэвхжүүлсэн бол оршин суугчид мэдэгдэнэ
    if (asuulga.tuluv === "idevkhtei") sonorduulyaTry(req, kholbolt, asuulga);

    return res.status(201).json({ success: true, data: asuulga });
  } catch (err) {
    next(err);
  }
});

router.get("/sanalAsuulga", tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, tuluv } = req.query || {};
    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    const shuult = {
      baiguullagiinId: String(baiguullagiinId),
      ustgagdakhEsekh: { $ne: true },
    };
    if (tuluv) shuult.tuluv = tuluv;
    if (barilgiinId)
      shuult.$or = [
        { barilguud: { $size: 0 } },
        { barilguud: String(barilgiinId) },
      ];

    const jagsaalt = await SanalAsuulga(kholbolt)
      .find(shuult)
      .sort({ createdAt: -1 })
      .lean();

    // Хариултын тоог хамт буцаана - жагсаалт дээр шууд харагдана
    const Khariult = SanalAsuulgiinKhariult(kholbolt);
    const toonuud = await Khariult.aggregate([
      { $match: { asuulgiinId: { $in: jagsaalt.map((a) => String(a._id)) } } },
      { $group: { _id: "$asuulgiinId", too: { $sum: 1 } } },
    ]);
    const tooMap = new Map(toonuud.map((t) => [String(t._id), t.too]));

    return res.json({
      success: true,
      data: jagsaalt.map((a) => ({
        ...a,
        khariultiinToo: tooMap.get(String(a._id)) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sanalAsuulga/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId } = req.query || {};
    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    const asuulga = await SanalAsuulga(kholbolt).findById(req.params.id).lean();
    if (!asuulga)
      return res
        .status(404)
        .json({ success: false, message: "Асуулга олдсонгүй" });

    return res.json({ success: true, data: asuulga });
  } catch (err) {
    next(err);
  }
});

router.put("/sanalAsuulga/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId, ...uurchlult } = req.body || {};
    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    const umnukh = await SanalAsuulga(kholbolt).findById(req.params.id).lean();
    if (!umnukh)
      return res
        .status(404)
        .json({ success: false, message: "Асуулга олдсонгүй" });

    // Хариулт ирсний дараа асуултыг өөрчилвөл цуглуулсан дата утгагүй болно
    if (uurchlult.asuultuud) {
      const irsen = await SanalAsuulgiinKhariult(kholbolt).countDocuments({
        asuulgiinId: String(umnukh._id),
      });
      if (irsen > 0)
        return res.status(409).json({
          success: false,
          message:
            "Хариулт ирсэн тул асуултыг өөрчлөх боломжгүй. Шинэ асуулга үүсгэнэ үү.",
        });
    }

    const shine = await SanalAsuulga(kholbolt).findByIdAndUpdate(
      req.params.id,
      { $set: uurchlult },
      { new: true },
    );

    // Ноорогоос идэвхтэй болсон мөчид л мэдэгдэнэ
    if (umnukh.tuluv !== "idevkhtei" && shine.tuluv === "idevkhtei")
      sonorduulyaTry(req, kholbolt, shine);

    return res.json({ success: true, data: shine });
  } catch (err) {
    next(err);
  }
});

router.delete("/sanalAsuulga/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId } = utgaAvya(req) || {};
    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    await SanalAsuulga(kholbolt).findByIdAndUpdate(req.params.id, {
      $set: { ustgagdakhEsekh: true },
    });
    return res.json({ success: true, message: "Amjilttai" });
  } catch (err) {
    next(err);
  }
});

/** Хэн юу хариулсан - нэр, тоотын хамт */
router.get(
  "/sanalAsuulga/:id/khariultuud",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId } = req.query || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      const jagsaalt = await SanalAsuulgiinKhariult(kholbolt)
        .find({ asuulgiinId: String(req.params.id) })
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ success: true, data: jagsaalt });
    } catch (err) {
      next(err);
    }
  },
);

/** Асуулт тус бүрийн нэгтгэсэн үр дүн */
router.get("/sanalAsuulga/:id/dun", tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId } = req.query || {};
    const kholbolt = kholboltAvya(res, baiguullagiinId);
    if (!kholbolt) return;

    const asuulga = await SanalAsuulga(kholbolt).findById(req.params.id).lean();
    if (!asuulga)
      return res
        .status(404)
        .json({ success: false, message: "Асуулга олдсонгүй" });

    const khariultuud = await SanalAsuulgiinKhariult(kholbolt)
      .find({ asuulgiinId: String(req.params.id) })
      .lean();

    const dun = (asuulga.asuultuud || []).map((a) => {
      const asuultiinId = String(a._id);
      const toolol = {};
      (a.songoltuud || []).forEach((s) => (toolol[s] = 0));
      const tekstuud = [];
      let khariulsanToo = 0;

      khariultuud.forEach((kh) => {
        const olson = (kh.khariultuud || []).find(
          (x) => String(x.asuultiinId) === asuultiinId,
        );
        if (!olson) return;
        const songogdson = olson.songogdson || [];
        const tekst = (olson.tekst || "").trim();
        if (songogdson.length === 0 && !tekst) return;
        khariulsanToo += 1;
        songogdson.forEach((s) => {
          toolol[s] = (toolol[s] || 0) + 1;
        });
        if (tekst)
          tekstuud.push({
            orshinSuugchNer: kh.orshinSuugchNer || "",
            toot: kh.toot || "",
            tekst,
          });
      });

      return {
        asuultiinId,
        asuult: a.asuult,
        turul: a.turul,
        khariulsanToo,
        toolol,
        tekstuud,
      };
    });

    return res.json({
      success: true,
      data: { niitKhariult: khariultuud.length, asuultuud: dun },
    });
  } catch (err) {
    next(err);
  }
});

/* ─── Оршин суугчийн (апп) тал ─────────────────────────────────────────── */

/** Тухайн оршин суугчид харагдах идэвхтэй асуулгууд + хариулсан эсэх */
router.get(
  "/orshinSuugchiinSanalAsuulga",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId, barilgiinId, orshinSuugchId } = req.query || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      if (!orshinSuugchId)
        return res
          .status(400)
          .json({ success: false, message: "orshinSuugchId шаардлагатай" });

      const odoo = new Date();
      const shuult = {
        baiguullagiinId: String(baiguullagiinId),
        tuluv: "idevkhtei",
        ustgagdakhEsekh: { $ne: true },
        $and: [
          {
            $or: [
              { ekhlekhOgnoo: { $exists: false } },
              { ekhlekhOgnoo: null },
              { ekhlekhOgnoo: { $lte: odoo } },
            ],
          },
          {
            $or: [
              { duusakhOgnoo: { $exists: false } },
              { duusakhOgnoo: null },
              { duusakhOgnoo: { $gte: odoo } },
            ],
          },
        ],
      };
      if (barilgiinId)
        shuult.$and.push({
          $or: [
            { barilguud: { $size: 0 } },
            { barilguud: String(barilgiinId) },
          ],
        });

      const jagsaalt = await SanalAsuulga(kholbolt)
        .find(shuult)
        .sort({ createdAt: -1 })
        .lean();

      const minii = await SanalAsuulgiinKhariult(kholbolt)
        .find({
          orshinSuugchId: String(orshinSuugchId),
          asuulgiinId: { $in: jagsaalt.map((a) => String(a._id)) },
        })
        .select("asuulgiinId")
        .lean();
      const khariulsan = new Set(minii.map((m) => String(m.asuulgiinId)));

      return res.json({
        success: true,
        data: jagsaalt.map((a) => ({
          ...a,
          khariulsanEsekh: khariulsan.has(String(a._id)),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Оршин суугч хариултаа илгээнэ */
router.post(
  "/sanalAsuulga/:id/khariulya",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { baiguullagiinId, barilgiinId, orshinSuugchId, khariultuud } =
        req.body || {};
      const kholbolt = kholboltAvya(res, baiguullagiinId);
      if (!kholbolt) return;

      if (!orshinSuugchId)
        return res
          .status(400)
          .json({ success: false, message: "orshinSuugchId шаардлагатай" });

      const asuulga = await SanalAsuulga(kholbolt)
        .findById(req.params.id)
        .lean();
      if (!asuulga || asuulga.ustgagdakhEsekh)
        return res
          .status(404)
          .json({ success: false, message: "Асуулга олдсонгүй" });
      if (asuulga.tuluv !== "idevkhtei")
        return res
          .status(409)
          .json({ success: false, message: "Асуулга хаагдсан байна" });
      if (asuulga.duusakhOgnoo && new Date(asuulga.duusakhOgnoo) < new Date())
        return res
          .status(409)
          .json({ success: false, message: "Асуулгын хугацаа дууссан байна" });

      // Заавал хариулах асуултууд бөглөгдсөн эсэх
      const irsen = new Map(
        (Array.isArray(khariultuud) ? khariultuud : []).map((k) => [
          String(k.asuultiinId),
          k,
        ]),
      );
      for (const a of asuulga.asuultuud || []) {
        if (!a.zaavalEsekh) continue;
        const k = irsen.get(String(a._id));
        const utgatai =
          k &&
          ((Array.isArray(k.songogdson) && k.songogdson.length > 0) ||
            (k.tekst && String(k.tekst).trim()));
        if (!utgatai)
          return res.status(400).json({
            success: false,
            message: `"${a.asuult}" асуултад хариулна уу`,
          });
      }

      const suugch = await OrshinSuugch(db.erunkhiiKholbolt)
        .findById(orshinSuugchId)
        .lean()
        .catch(() => null);

      const bichlegBolgokh = (asuulga.asuultuud || [])
        .map((a) => {
          const k = irsen.get(String(a._id));
          if (!k) return null;
          return {
            asuultiinId: String(a._id),
            asuult: a.asuult,
            songogdson: Array.isArray(k.songogdson)
              ? k.songogdson.map(String)
              : [],
            tekst: k.tekst ? String(k.tekst).trim() : "",
          };
        })
        .filter(Boolean);

      const utas = Array.isArray(suugch?.utas)
        ? suugch.utas[0] || ""
        : suugch?.utas || "";
      const toot =
        Array.isArray(suugch?.toots) && suugch.toots.length > 0
          ? suugch.toots.map((t) => t?.toot || t).join(", ")
          : suugch?.toot || "";

      try {
        const khadgalsan = await SanalAsuulgiinKhariult(kholbolt).create({
          asuulgiinId: String(asuulga._id),
          baiguullagiinId: String(baiguullagiinId),
          barilgiinId: barilgiinId ? String(barilgiinId) : undefined,
          orshinSuugchId: String(orshinSuugchId),
          orshinSuugchNer: [suugch?.ovog || "", suugch?.ner || ""]
            .join(" ")
            .trim(),
          toot,
          utas,
          khariultuud: bichlegBolgokh,
        });

        const io = req.app.get("socketio");
        if (io)
          io.emit("baiguullagiin" + baiguullagiinId, {
            type: "sanalAsuulgiinKhariult",
            data: { asuulgiinId: String(asuulga._id) },
          });

        return res.status(201).json({ success: true, data: khadgalsan });
      } catch (davkhardal) {
        // unique index — нэг оршин суугч дахин хариулах гэсэн
        if (davkhardal?.code === 11000)
          return res.status(409).json({
            success: false,
            message: "Та энэ асуулгад аль хэдийн хариулсан байна",
          });
        throw davkhardal;
      }
    } catch (err) {
      next(err);
    }
  },
);

/* ─── Туслах ───────────────────────────────────────────────────────────── */

/**
 * Асуулга идэвхжихэд оршин суугчид push мэдэгдэнэ.
 * Хэзээ ч throw хийхгүй - мэдэгдэл амжилтгүй болсон ч асуулга үүссэн хэвээр.
 */
function sonorduulyaTry(req, kholbolt, asuulga) {
  (async () => {
    try {
      const shuult = { baiguullagiinId: String(asuulga.baiguullagiinId) };
      if (Array.isArray(asuulga.barilguud) && asuulga.barilguud.length > 0)
        shuult.barilgiinId = { $in: asuulga.barilguud.map(String) };

      const suugchid = await OrshinSuugch(db.erunkhiiKholbolt)
        .find(shuult)
        .select("firebaseToken")
        .lean();

      const tokenuud = suugchid
        .map((s) => s.firebaseToken)
        .filter((t) => !!t);

      for (const t of tokenuud) {
        await orshinSuugchidSonorduulgaIlgeeye(t, {
          title: "Санал асуулга",
          body: asuulga.garchig,
          type: "sanal_asuulga",
          data: { id: String(asuulga._id) },
        }).catch(() => {});
      }

      const io = req.app.get("socketio");
      if (io)
        io.emit("baiguullagiin" + asuulga.baiguullagiinId, {
          type: "sanalAsuulgaShine",
          data: { id: String(asuulga._id), garchig: asuulga.garchig },
        });

      console.log(
        `✅ [SANAL ASUULGA] "${asuulga.garchig}" - ${tokenuud.length} оршин суугчид мэдэгдэв`,
      );
    } catch (err) {
      console.error("⚠️ [SANAL ASUULGA] Сонордуулга алдаа:", err.message);
    }
  })();
}

module.exports = router;
