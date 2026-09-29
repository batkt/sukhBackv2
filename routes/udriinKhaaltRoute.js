/**
 * Камер кассын өдрийн хаалт.
 *   GET  /udriinKhaalt?barilgiinId&udur        — тухайн өдрийн хаалт (байхгүй бол null)
 *   GET  /udriinKhaaltJagsaalt?barilgiinId      — сүүлийн хаалтууд
 *   POST /udriinKhaaltKhiiye                    — өдрийг хаах (давхар хаахыг хориглоно)
 *   GET  /zogsoolGaraarOrlogo?barilgiinId&udur  — гараар оруулсан орлогууд
 *   POST /zogsoolGaraarOrlogoKhiiye             — гараар орлого нэмэх (хаагдсан өдөрт хориглоно)
 *   DELETE /zogsoolGaraarOrlogo/:id             — устгах (хаагдсан өдөрт хориглоно)
 */
const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const UdriinKhaalt = require("../models/udriinKhaalt");
const ZogsoolGaraarOrlogo = require("../models/zogsoolGaraarOrlogo");

const tooAvya = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

router.get("/udriinKhaalt", tokenShalgakh, async (req, res, next) => {
  try {
    const kholbolt = req.body.tukhainBaaziinKholbolt;
    const { barilgiinId, udur } = req.query;
    if (!udur) return res.status(400).json({ message: "Өдөр заавал" });
    const khaalt = await UdriinKhaalt(kholbolt)
      .findOne({
        baiguullagiinId: String(kholbolt.baiguullagiinId),
        barilgiinId: barilgiinId ? String(barilgiinId) : { $in: [null, ""] },
        udur: String(udur),
      })
      .lean();
    res.json({ khaalt: khaalt || null });
  } catch (err) {
    next(err);
  }
});

router.get("/udriinKhaaltJagsaalt", tokenShalgakh, async (req, res, next) => {
  try {
    const kholbolt = req.body.tukhainBaaziinKholbolt;
    const query = { baiguullagiinId: String(kholbolt.baiguullagiinId) };
    if (req.query.barilgiinId) query.barilgiinId = String(req.query.barilgiinId);
    const jagsaalt = await UdriinKhaalt(kholbolt)
      .find(query)
      .sort({ udur: -1 })
      .limit(Math.min(Number(req.query.limit) || 31, 366))
      .lean();
    res.json({ jagsaalt });
  } catch (err) {
    next(err);
  }
});

router.post("/udriinKhaaltKhiiye", tokenShalgakh, async (req, res, next) => {
  try {
    const kholbolt = req.body.tukhainBaaziinKholbolt;
    const ajiltan = req.body.nevtersenAjiltniiToken || {};
    const { barilgiinId, udur, mashin = {}, dun = {}, khelber = [], tailbar } = req.body;
    if (!udur || !/^\d{4}-\d{2}-\d{2}$/.test(String(udur)))
      return res.status(400).json({ message: "Өдөр буруу байна" });

    const Model = UdriinKhaalt(kholbolt);
    const shuult = {
      baiguullagiinId: String(kholbolt.baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : "",
      udur: String(udur),
    };
    const baigaa = await Model.findOne(shuult).lean();
    if (baigaa) {
      return res.status(409).json({
        message: `${udur}-ны өдрийг ${baigaa.ajiltniiNer || "өөр ажилтан"} аль хэдийн хаасан байна`,
        khaalt: baigaa,
      });
    }

    const khaalt = await new Model({
      ...shuult,
      mashin: {
        niit: tooAvya(mashin.niit),
        garsan: tooAvya(mashin.garsan),
        dotor: tooAvya(mashin.dotor),
        unegui: tooAvya(mashin.unegui),
        turluud: (Array.isArray(mashin.turluud) ? mashin.turluud : []).map((t) => ({
          ner: String(t?.ner || ""),
          too: tooAvya(t?.too),
        })),
      },
      dun: {
        bodogdson: tooAvya(dun.bodogdson),
        khungulult: tooAvya(dun.khungulult),
        tulsun: tooAvya(dun.tulsun),
        tulugdugui: tooAvya(dun.tulugdugui),
        ebarimt: tooAvya(dun.ebarimt),
      },
      khelber: (Array.isArray(khelber) ? khelber : []).map((k) => ({
        ner: String(k?.ner || ""),
        too: tooAvya(k?.too),
        dun: tooAvya(k?.dun),
      })),
      tailbar: tailbar ? String(tailbar).slice(0, 500) : "",
      ajiltniiId: ajiltan.id ? String(ajiltan.id) : "",
      ajiltniiNer: ajiltan.ner || "",
    }).save();

    res.json({ success: true, khaalt });
  } catch (err) {
    next(err);
  }
});

/** Тухайн өдөр хаагдсан эсэх — гараар орлого нэмэх/устгахыг хориглоно. */
async function udurKhaagdsan(kholbolt, barilgiinId, udur) {
  return UdriinKhaalt(kholbolt)
    .findOne({
      baiguullagiinId: String(kholbolt.baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : "",
      udur: String(udur),
    })
    .lean();
}

router.get("/zogsoolGaraarOrlogo", tokenShalgakh, async (req, res, next) => {
  try {
    const kholbolt = req.body.tukhainBaaziinKholbolt;
    const { barilgiinId, udur, ekhlekh, duusakh } = req.query;
    const query = { baiguullagiinId: String(kholbolt.baiguullagiinId) };
    if (barilgiinId) query.barilgiinId = String(barilgiinId);
    if (udur) query.udur = String(udur);
    else if (ekhlekh || duusakh) {
      query.udur = {};
      if (ekhlekh) query.udur.$gte = String(ekhlekh).slice(0, 10);
      if (duusakh) query.udur.$lte = String(duusakh).slice(0, 10);
    }
    const jagsaalt = await ZogsoolGaraarOrlogo(kholbolt).find(query).sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ jagsaalt });
  } catch (err) {
    next(err);
  }
});

router.post("/zogsoolGaraarOrlogoKhiiye", tokenShalgakh, async (req, res, next) => {
  try {
    const kholbolt = req.body.tukhainBaaziinKholbolt;
    const ajiltan = req.body.nevtersenAjiltniiToken || {};
    if (!ajiltan.id || ajiltan.id === "zochin") return res.status(403).json({ message: "Эрх хүрэхгүй байна" });
    const { barilgiinId, khelber, tailbar } = req.body;
    const udur = String(req.body.udur || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(udur)) return res.status(400).json({ message: "Өдөр буруу байна" });
    const dun = tooAvya(req.body.dun);
    const mashiniiDugaar = String(req.body.mashiniiDugaar || "").trim().toUpperCase();
    if (!mashiniiDugaar) return res.status(400).json({ message: "Машины дугаар заавал" });
    if (dun <= 0) return res.status(400).json({ message: "Орлогын дүн 0-ээс их байх ёстой" });
    const khaalt = await udurKhaagdsan(kholbolt, barilgiinId, udur);
    if (khaalt) {
      return res.status(409).json({
        message: `${udur}-ны өдрийг ${khaalt.ajiltniiNer || "ажилтан"} хаасан тул орлого нэмэх боломжгүй`,
      });
    }
    const orlogo = await new (ZogsoolGaraarOrlogo(kholbolt))({
      baiguullagiinId: String(kholbolt.baiguullagiinId),
      barilgiinId: barilgiinId ? String(barilgiinId) : "",
      udur,
      mashiniiDugaar,
      dun,
      khelber: String(khelber || "belen"),
      tailbar: tailbar ? String(tailbar).slice(0, 300) : "",
      ajiltniiId: String(ajiltan.id),
      ajiltniiNer: ajiltan.ner || "",
    }).save();
    res.json({ success: true, orlogo });
  } catch (err) {
    next(err);
  }
});

router.delete("/zogsoolGaraarOrlogo/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const kholbolt = req.body.tukhainBaaziinKholbolt;
    const Model = ZogsoolGaraarOrlogo(kholbolt);
    const orlogo = await Model.findOne({ _id: req.params.id, baiguullagiinId: String(kholbolt.baiguullagiinId) }).lean();
    if (!orlogo) return res.status(404).json({ message: "Орлого олдсонгүй" });
    if (await udurKhaagdsan(kholbolt, orlogo.barilgiinId, orlogo.udur)) {
      return res.status(409).json({ message: `${orlogo.udur}-ны өдөр хаагдсан тул устгах боломжгүй` });
    }
    await Model.deleteOne({ _id: orlogo._id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
