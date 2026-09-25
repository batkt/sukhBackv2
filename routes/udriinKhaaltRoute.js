/**
 * Камер кассын өдрийн хаалт.
 *   GET  /udriinKhaalt?barilgiinId&udur        — тухайн өдрийн хаалт (байхгүй бол null)
 *   GET  /udriinKhaaltJagsaalt?barilgiinId      — сүүлийн хаалтууд
 *   POST /udriinKhaaltKhiiye                    — өдрийг хаах (давхар хаахыг хориглоно)
 */
const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const UdriinKhaalt = require("../models/udriinKhaalt");

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

module.exports = router;
