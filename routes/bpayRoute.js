/**
 * Төрийн банк (BPay) горимын endpoint-ууд.
 *
 * Ажилтан (sukhWeb):
 *   GET  /bpay/medeelel          — тохиргоо + холболтын тоо + ажлын төлөв
 *   POST /bpay/medeelel          — тохиргоо хадгалах (зөвхөн өөрийн талбарууд, $set)
 *   ("tokhirgoo" үгийг замд ХЭРЭГЛЭХГҮЙ — index.js-ийн bot шүүлтүүр хоосон 404 буцаадаг.)
 *   GET  /bpay/bairKhaikh?q=      — BPay-ийн байр хайх (хадгалсан хаягийн мод)
 *   POST /bpay/khayagKholbokh     — тоотуудыг СӨХ-ийн BPay бүртгэлд холбох (ар талд)
 *   POST /bpay/sync               — одоо синк хийх (ар талд)
 *   GET  /bpay/tuluv              — ажлын төлөв, сүүлийн үр дүн
 *   GET  /bpay/billuud            — BPay-ийн СӨХ-ийн биллүүд (тоот × сар)
 *
 * Оршин суугч (апп):
 *   GET  /bpay/zadargaa?customerId=  — BPay билл + Sukh задаргаа (лавлагаа)
 */
const express = require("express");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const Geree = require("../models/geree");
const BpayHolbolt = require("../models/bpayHolbolt");
const BpayBill = require("../models/bpayBill");
const bpay = require("../services/bpayService");

// Ажилтны токен `erkh`-тэй (models/ajiltan.js), оршин суугчийнх `erkh`-гүй (models/orshinSuugch.js).
function ajiltanEsekh(req) {
  const t = req.body?.nevtersenAjiltniiToken;
  return !!t && !!t.erkh && t.erkh !== "OrshinSuugch";
}

function ajiltanShaardana(req, res, next) {
  if (!ajiltanEsekh(req)) {
    return res.status(403).json({ success: false, message: "Зөвхөн ажилтан хандана." });
  }
  next();
}

function kholboltAvya(req) {
  return req.body?.tukhainBaaziinKholbolt || null;
}

router.get("/bpay/medeelel", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const orgId = bpay.khuseltiinBaiguullaga(req);
    bpay.tokhirgooSanakhTseverlekh(orgId);
    const t = await bpay.bpayTokhirgooAvya(orgId);
    if (!t) return res.status(404).json({ success: false, message: "Байгууллага олдсонгүй" });
    const kholbolt = kholboltAvya(req);
    let kholboltToo = 0;
    let billToo = 0;
    if (kholbolt) {
      kholboltToo = await BpayHolbolt(kholbolt).countDocuments({ baiguullagiinId: orgId });
      billToo = await BpayBill(kholbolt).countDocuments({ baiguullagiinId: orgId });
    }
    res.json({ success: true, tokhirgoo: t, kholboltToo, billToo, ajil: bpay.ajliinTuluvAvya(orgId) });
  } catch (e) {
    next(e);
  }
});

router.post("/bpay/medeelel", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const orgId = bpay.khuseltiinBaiguullaga(req);
    const { bpayAshiglakhEsekh, bpayEkhelsenOgnoo, barilguud } = req.body;
    const set = {};
    if (bpayEkhelsenOgnoo !== undefined) {
      set["tokhirgoo.bpayEkhelsenOgnoo"] = bpayEkhelsenOgnoo ? new Date(bpayEkhelsenOgnoo) : null;
    }
    if (bpayAshiglakhEsekh !== undefined) {
      set["tokhirgoo.bpayAshiglakhEsekh"] = bpayAshiglakhEsekh === true;
    }
    const B = Baiguullaga(db.erunkhiiKholbolt);
    if (Object.keys(set).length) await B.updateOne({ _id: orgId }, { $set: set });
    if (Array.isArray(barilguud)) {
      for (const b of barilguud) {
        if (!b?.barilgiinId) continue;
        await B.updateOne(
          { _id: orgId, "barilguud._id": b.barilgiinId },
          { $set: { "barilguud.$.tokhirgoo.bpayBairId": String(b.bpayBairId || "").trim() } },
        );
      }
    }
    bpay.tokhirgooSanakhTseverlekh(orgId);
    res.json({ success: true, tokhirgoo: await bpay.bpayTokhirgooAvya(orgId) });
  } catch (e) {
    next(e);
  }
});

router.get("/bpay/bairKhaikh", tokenShalgakh, ajiltanShaardana, (req, res) => {
  res.json({ success: true, jagsaalt: bpay.bairKhaikh(req.query.q) });
});

/**
 * Гүйлгээний түүхийн жагсаалтад: холбогдсон гэрээ бүрийн Төрийн банкны үлдэгдэл ба төлөлтүүд.
 * { [gereeniiId]: { uldegdel, tulburuud: [{ ognoo, dun }] } } — горимгүй бол { bpay: false }.
 * Үлдэгдэл = төлөгдөөгүй биллүүдийн алдангитай дүн (Хуулгын «Төлөх»-тэй ижил).
 */
router.get("/bpay/dunguud", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    const orgId = bpay.khuseltiinBaiguullaga(req);
    if (!kholbolt) return res.status(400).json({ success: false, message: "Холболт олдсонгүй" });
    if (!(await bpay.bpayEsekh(orgId))) return res.json({ success: true, bpay: false, dunguud: {} });
    const holboltuud = await BpayHolbolt(kholbolt)
      .find({ baiguullagiinId: orgId, billingId: { $nin: [null, ""] }, salgasan: { $ne: true } })
      .select("gereeniiId")
      .lean();
    const dunguud = {};
    for (const h of holboltuud) dunguud[String(h.gereeniiId)] = { uldegdel: 0, tulburuud: [] };
    const billuud = await BpayBill(kholbolt)
      .find({ baiguullagiinId: orgId })
      .select("gereeniiId tuluv dun aldangitaiDun tulsunOgnoo tulsunDun suuldKharsan")
      .lean();
    for (const b of billuud) {
      const d = dunguud[String(b.gereeniiId)];
      if (!d) continue;
      if (b.tuluv === "Төлөгдсөн") {
        d.tulburuud.push({
          ognoo: b.tulsunOgnoo || b.suuldKharsan || null,
          dun: Number(b.tulsunDun ?? b.aldangitaiDun ?? b.dun) || 0,
        });
      } else {
        d.uldegdel += Number(b.aldangitaiDun || b.dun) || 0;
      }
    }
    res.json({ success: true, bpay: true, dunguud });
  } catch (e) {
    next(e);
  }
});

/** Холбогдоогүй орон сууцны тоотууд (бүх барилга), шалтгаантай. */
router.get("/bpay/kholbogdoogui", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    if (!kholbolt) return res.status(400).json({ success: false, message: "Холболт олдсонгүй" });
    const jagsaalt = await bpay.kholbogdooguiJagsaalt(kholbolt, bpay.khuseltiinBaiguullaga(req));
    res.json({ success: true, niit: jagsaalt.length, jagsaalt });
  } catch (e) {
    next(e);
  }
});

router.post("/bpay/khayagKholbokh", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    if (!kholbolt) return res.status(400).json({ success: false, message: "Холболт олдсонгүй" });
    res.json({ success: true, ...(await bpay.kholbokhAjilEkhluulekh(kholbolt, bpay.khuseltiinBaiguullaga(req))) });
  } catch (e) {
    next(e);
  }
});

/**
 * Нэг тоотыг гараар холбох — оршин суугч апп-аас холбодогтой ижил:
 *   GET  /bpay/garaarKhaikh?gereeniiId=&bairId=&doorNo=&utas=  → Төрийн банкны хэрэглэгчийн сонголтууд
 *   POST /bpay/garaarKholbokh { gereeniiId, customerId, bairId?, doorNo?, utas? } → холбоод шууд синк
 */
router.get("/bpay/garaarKhaikh", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    if (!kholbolt || !req.query.gereeniiId) {
      return res.status(400).json({ success: false, message: "gereeniiId шаардлагатай" });
    }
    const ur = await bpay.garaarKhaikh(kholbolt, bpay.khuseltiinBaiguullaga(req), {
      gereeniiId: String(req.query.gereeniiId),
      bairId: req.query.bairId ? String(req.query.bairId) : "",
      doorNo: req.query.doorNo ? String(req.query.doorNo) : "",
      utas: req.query.utas ? String(req.query.utas) : "",
    });
    res.json({ success: true, ...ur });
  } catch (e) {
    res.status(400).json({ success: false, message: e.response?.data?.responseMsg || e.message });
  }
});

router.post("/bpay/garaarKholbokh", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    if (!kholbolt || !req.body.gereeniiId) {
      return res.status(400).json({ success: false, message: "gereeniiId шаардлагатай" });
    }
    const ur = await bpay.garaarKholbokh(kholbolt, bpay.khuseltiinBaiguullaga(req), {
      gereeniiId: String(req.body.gereeniiId),
      customerId: req.body.customerId ? String(req.body.customerId) : "",
      bairId: req.body.bairId ? String(req.body.bairId) : "",
      doorNo: req.body.doorNo ? String(req.body.doorNo) : "",
      utas: req.body.utas ? String(req.body.utas) : "",
    });
    res.json({ success: true, ...ur });
  } catch (e) {
    res.status(400).json({ success: false, message: e.response?.data?.responseMsg || e.message });
  }
});

router.post("/bpay/sync", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    if (!kholbolt) return res.status(400).json({ success: false, message: "Холболт олдсонгүй" });
    const orgId = bpay.khuseltiinBaiguullaga(req);
    if (!(await bpay.bpayEsekh(orgId))) {
      return res.status(400).json({ success: false, message: "Төрийн банк горим асаагүй байна." });
    }
    // albadakh=true: олон билл нэг дор алга болсон анхааруулгыг ажилтан шалгаад зөвшөөрөв.
    res.json({ success: true, ...(await bpay.syncAjilEkhluulekh(kholbolt, orgId, { albadakh: req.body.albadakh === true })) });
  } catch (e) {
    next(e);
  }
});

router.get("/bpay/tuluv", tokenShalgakh, ajiltanShaardana, (req, res) => {
  res.json({ success: true, ajil: bpay.ajliinTuluvAvya(bpay.khuseltiinBaiguullaga(req)) });
});

router.get("/bpay/billuud", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    if (!kholbolt) return res.status(400).json({ success: false, message: "Холболт олдсонгүй" });
    const orgId = bpay.khuseltiinBaiguullaga(req);
    const filter = { baiguullagiinId: orgId };
    if (req.query.barilgiinId) filter.barilgiinId = String(req.query.barilgiinId);
    if (req.query.tuluv) filter.tuluv = String(req.query.tuluv);
    const billuud = await BpayBill(kholbolt)
      .find(filter)
      .select("-tuukh")
      .sort({ toot: 1, sar: 1 })
      .lean();
    const holboltuud = await BpayHolbolt(kholbolt)
      .find({ baiguullagiinId: orgId, ...(req.query.barilgiinId ? { barilgiinId: String(req.query.barilgiinId) } : {}) })
      .select("gereeniiId gereeniiDugaar toot barilgiinId customerCode customerName suuldSync suuldAldaa salgasan salgasanOgnoo")
      .lean();
    res.json({ success: true, billuud, holboltuud });
  } catch (e) {
    next(e);
  }
});

/**
 * Ажилтны Хуулга (Гүйлгээний түүх → Хуулга): нэг гэрээний BPay-ийн сар бүрийн билл,
 * төлөв, төлсөн огноо + сар бүрийн ашиглалтын зардлын задаргаа (гараж, агуулах орно).
 * Төрийн банк горимгүй байгууллагад { bpay: false } буцна.
 */
router.get("/bpay/khuulga", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    const orgId = bpay.khuseltiinBaiguullaga(req);
    const gereeniiId = String(req.query.gereeniiId || "");
    if (!kholbolt || !gereeniiId) return res.status(400).json({ success: false, message: "gereeniiId шаардлагатай" });
    if (!(await bpay.bpayEsekh(orgId))) return res.json({ success: true, bpay: false });
    const geree = await Geree(kholbolt).findById(gereeniiId).select("baiguullagiinId").lean();
    if (!geree || String(geree.baiguullagiinId) !== orgId) {
      return res.status(404).json({ success: false, message: "Гэрээ олдсонгүй" });
    }
    const h = await BpayHolbolt(kholbolt)
      .findOne({ baiguullagiinId: orgId, gereeniiId })
      .select("customerCode customerName suuldSync suuldAldaa salgasan")
      .lean();
    // Бүх сарын билл (сар нь "2026-07" хэлбэрт), задаргаа сүүлийн 24 сард.
    const ur = await bpay.zadargaaAvya(kholbolt, gereeniiId, { saruudToo: 24 });
    res.json({ success: true, bpay: true, holbolt: h || null, ...ur });
  } catch (e) {
    next(e);
  }
});

router.get("/bpay/billiinTuukh/:id", tokenShalgakh, ajiltanShaardana, async (req, res, next) => {
  try {
    const kholbolt = kholboltAvya(req);
    const doc = await BpayBill(kholbolt)
      .findOne({ _id: req.params.id, baiguullagiinId: bpay.khuseltiinBaiguullaga(req) })
      .lean();
    if (!doc) return res.status(404).json({ success: false, message: "Олдсонгүй" });
    res.json({ success: true, bill: doc });
  } catch (e) {
    next(e);
  }
});

/**
 * Оршин суугчийн өөрийн СӨХ-ийн төлбөрийн холболт(ууд) — апп "Нэхэмжлэх" дэлгэцэд
 * ердийн төлбөрийн дэлгэрэнгүйг (BPay-ээс) харуулахад ашиглана. Зөвхөн оршин
 * суугчийн ӨӨРИЙН BPay бүртгэлд байгаа холболт (syncUtas = түүний утас) буцна.
 */
router.get("/bpay/miniiBilling", tokenShalgakh, async (req, res, next) => {
  try {
    const token = req.body?.nevtersenAjiltniiToken;
    const residentId = String(token?.undsenId || token?.id || "");
    if (!residentId) return res.status(401).json({ success: false, message: "Нэвтрэх шаардлагатай" });
    const resident = await OrshinSuugch(db.erunkhiiKholbolt).findById(residentId).select("utas").lean();
    if (!resident) return res.json({ success: true, jagsaalt: [] });
    const utas = bpay.utasKhevshuulekh(resident.utas);

    const orgs = await Baiguullaga(db.erunkhiiKholbolt)
      .find({ "tokhirgoo.bpayAshiglakhEsekh": true })
      .select("_id")
      .lean();
    const jagsaalt = [];
    for (const org of orgs) {
      const orgId = String(org._id);
      const kholbolt = (db.kholboltuud || []).find((k) => String(k.baiguullagiinId) === orgId);
      if (!kholbolt) continue;
      const gereenuud = await Geree(kholbolt).find({ orshinSuugchId: residentId }).select("_id").lean();
      const gereeIdnuud = gereenuud.map((g) => String(g._id));
      const holboltuud = await BpayHolbolt(kholbolt)
        .find({
          baiguullagiinId: orgId,
          salgasan: { $ne: true },
          billingId: { $nin: ["", null] },
          $or: [{ residentId }, { gereeniiId: { $in: gereeIdnuud } }],
        })
        .lean();
      for (const h of holboltuud) {
        if (utas && h.syncUtas !== utas) continue; // зөвхөн өөрийн бүртгэл дэх холболт
        jagsaalt.push({
          baiguullagiinId: orgId,
          barilgiinId: h.barilgiinId,
          gereeniiId: h.gereeniiId,
          toot: h.toot,
          billingId: h.billingId,
          customerId: h.customerId,
          customerCode: h.customerCode,
          customerName: h.customerName,
          customerAddress: h.customerAddress,
        });
      }
    }
    res.json({ success: true, jagsaalt });
  } catch (e) {
    next(e);
  }
});

/**
 * Оршин суугчийн задаргааны лавлагаа. customerId-аар холболтыг BPay горимтой
 * байгууллагуудаас хайж, тухайн оршин суугчийнх эсэхийг шалгана.
 */
router.get("/bpay/zadargaa", tokenShalgakh, async (req, res, next) => {
  try {
    const token = req.body?.nevtersenAjiltniiToken;
    const residentId = String(token?.undsenId || token?.id || "");
    const customerId = String(req.query.customerId || "");
    const gereeniiIdQ = String(req.query.gereeniiId || "");
    if (!residentId || (!customerId && !gereeniiIdQ)) {
      return res.status(400).json({ success: false, message: "customerId эсвэл gereeniiId шаардлагатай" });
    }
    const resident = await OrshinSuugch(db.erunkhiiKholbolt).findById(residentId).lean();
    if (!resident) return res.status(404).json({ success: false, message: "Оршин суугч олдсонгүй" });

    const orgs = await Baiguullaga(db.erunkhiiKholbolt)
      .find({ "tokhirgoo.bpayAshiglakhEsekh": true })
      .select("_id")
      .lean();
    for (const org of orgs) {
      const orgId = String(org._id);
      const kholbolt = (db.kholboltuud || []).find((k) => String(k.baiguullagiinId) === orgId);
      if (!kholbolt) continue;
      const h = await BpayHolbolt(kholbolt)
        .findOne(customerId ? { baiguullagiinId: orgId, customerId } : { baiguullagiinId: orgId, gereeniiId: gereeniiIdQ })
        .lean();
      if (!h) continue;

      // Эзэмшил: гэрээ нь түүнийх, эсвэл BPay хаяг нь түүний toots-д байна.
      const geree = await Geree(kholbolt).findById(h.gereeniiId).select("orshinSuugchId").lean();
      const toots = Array.isArray(resident.toots) ? resident.toots : [];
      const ezen =
        String(geree?.orshinSuugchId || "") === residentId ||
        toots.some((t) => String(t.walletCustomerId || "") === String(h.customerId) || String(t.gereeniiId || "") === String(h.gereeniiId));
      if (!ezen) return res.status(403).json({ success: false, message: "Энэ хаяг танд хамааралгүй." });

      const ur = await bpay.zadargaaAvya(kholbolt, h.gereeniiId);
      return res.json({ success: true, lavlagaa: true, ...ur });
    }
    res.json({ success: true, lavlagaa: true, saruud: [], oldsongui: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
