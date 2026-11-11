/**
 * Төрийн банк (BPay) горим.
 *
 * Асаалттай байгууллагад (`baiguullaga.tokhirgoo.bpayAshiglakhEsekh`) СӨХ-ийн
 * төлбөрийг ЗӨВХӨН BPay нэхнэ. Энэ сервис:
 *   - тохиргоог уншина (`bpayTokhirgooAvya`, `bpayEsekh`);
 *   - тоот бүрийн хаягийг СӨХ-ийн BPay бүртгэлд холбоно (`khayagKholbokh`);
 *   - BPay-ийн СӨХ-ийн биллийг `bpayBill`-д синк хийнэ (`syncKhiikh`);
 *   - оршин суугчид задаргааны лавлагаа тооцно (`zadargaaAvya`).
 *
 * BPay-ийн билл (GET /billing/bills/:id → data.newBills[]):
 *   billtypeGeneral "HOUSE_OWNER_ASSOCIATION" = СӨХ-ийн төлбөр (нэхэмжлэгчийн
 *   нэрийг тохируулах шаардлагагүй). billAmount = алдангигүй,
 *   billTotalAmount = алдангитай, billLateFee = алданги, billPeriod = "2026-7".
 */
const { db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const BpayHolbolt = require("../models/bpayHolbolt");
const BpayBill = require("../models/bpayBill");
const walletApiService = require("./walletApiService");

const SOKH_TURUL = "HOUSE_OWNER_ASSOCIATION";
const IDEVKHGUI_GEREE = ["Цуцалсан", "Дууссан", "Устгасан"];
const ALGA_BOSGO = 2; // дараалан хэдэн синкэд алга бол "төлсөн"
const ALGA_KHUVI = 0.2; // нэг синкээр төлөгдөөгүйн 20%-иас олон алга бол зогсоно
const ALGA_DOOD = 5;

// ---------------------------------------------------------------------------
// Тохиргоо
// ---------------------------------------------------------------------------
const tokhirgooSanakh = new Map(); // baiguullagiinId -> { t, v }
const SANAKH_MS = 60 * 1000;

async function bpayTokhirgooAvya(baiguullagiinId) {
  const id = String(baiguullagiinId || "");
  if (!id) return null;
  const umnukh = tokhirgooSanakh.get(id);
  if (umnukh && Date.now() - umnukh.t < SANAKH_MS) return umnukh.v;
  let v = null;
  try {
    const org = await Baiguullaga(db.erunkhiiKholbolt)
      .findById(id)
      .select("ner tokhirgoo.bpayAshiglakhEsekh tokhirgoo.bpayEkhelsenOgnoo barilguud._id barilguud.ner barilguud.tokhirgoo.bpayBairId")
      .lean();
    if (org) {
      v = {
        baiguullagiinId: id,
        ner: org.ner || "",
        idevkhtei: org.tokhirgoo?.bpayAshiglakhEsekh === true,
        ekhelsenOgnoo: org.tokhirgoo?.bpayEkhelsenOgnoo || null,
        barilguud: (org.barilguud || []).map((b) => ({
          barilgiinId: String(b._id),
          ner: b.ner || "",
          bpayBairId: b.tokhirgoo?.bpayBairId || "",
        })),
      };
    }
  } catch (e) {
    console.error("[BPAY] тохиргоо уншихад алдаа:", e.message);
  }
  tokhirgooSanakh.set(id, { t: Date.now(), v });
  return v;
}

function tokhirgooSanakhTseverlekh(baiguullagiinId) {
  if (baiguullagiinId) tokhirgooSanakh.delete(String(baiguullagiinId));
  else tokhirgooSanakh.clear();
}

/** Байгууллага Төрийн банк (BPay) горимд байгаа эсэх. */
async function bpayEsekh(baiguullagiinId) {
  const t = await bpayTokhirgooAvya(baiguullagiinId);
  return !!t?.idevkhtei;
}

/** Хүсэлтийн токеноос байгууллагыг олно (tokenShalgakh-ийн дараа). */
function khuseltiinBaiguullaga(req) {
  return String(
    req.body?.tukhainBaaziinKholbolt?.baiguullagiinId ||
      req.body?.nevtersenAjiltniiToken?.baiguullagiinId ||
      req.body?.baiguullagiinId ||
      req.query?.baiguullagiinId ||
      "",
  );
}

/**
 * Хүсэлт оршин суугчийн токентой эсэх. Ажилтны токен `erkh`-тэй; токенгүй бол false
 * (тэр үед юуг ч нуухгүй — зөвхөн баталгаатай оршин суугчид үйлчилнэ).
 */
function orshinSuugchEsekh(req) {
  const t = req.body?.nevtersenAjiltniiToken;
  return !!t && (!t.erkh || t.erkh === "OrshinSuugch");
}

/** Өгсөн байгууллагуудаас Төрийн банк горимтойг нь Set болгоно (60с кэштэй). */
async function bpayBaiguullaguudOlokh(idnuud) {
  const gants = [...new Set(idnuud.filter(Boolean).map(String))];
  const ur = await Promise.all(gants.map((id) => bpayEsekh(id).catch(() => false)));
  return new Set(gants.filter((_, i) => ur[i]));
}

/**
 * Хуучин апп-д Sukh-ийн нэхэмжлэх/үлдэгдэл харагдахаас сэргийлнэ (Төрийн банк горимд
 * төлбөрийг зөвхөн банк нэхэмжилнэ). Оршин суугчийн хүсэлтийн хариунаас Төрийн банк
 * горимтой байгууллагын `jagsaalt` мөрүүдийг хасна. Ажилтанд огт нөлөөлөхгүй.
 * crud-ийн ӨМНӨ тавина; токеныг crud-ийн tokenShalgakh задлах тул шийдвэрийг
 * хариу илгээх агшинд гаргана.
 */
function orshinSuugchidSukhNekhemjlekhNuukh(req, res, next) {
  const ekhSend = res.send.bind(res);
  res.send = (body) => {
    res.send = ekhSend;
    if (!orshinSuugchEsekh(req) || !body || typeof body !== "object" || !Array.isArray(body.jagsaalt)) {
      return ekhSend(body);
    }
    bpayBaiguullaguudOlokh(body.jagsaalt.map((m) => m?.baiguullagiinId))
      .then((bpaySet) => {
        if (!bpaySet.size) return ekhSend(body);
        const uldsen = body.jagsaalt.filter((m) => !bpaySet.has(String(m?.baiguullagiinId)));
        const khassan = body.jagsaalt.length - uldsen.length;
        const gars = { ...body, jagsaalt: uldsen };
        if (typeof body.niitMur === "number") gars.niitMur = Math.max(0, body.niitMur - khassan);
        return ekhSend(gars);
      })
      .catch(() => ekhSend(body));
    return res;
  };
  next();
}

/**
 * Middleware: BPay горимд Sukh-ийн журнал/нэхэмжлэлд гараар бичихийг хаана.
 * tokenShalgakh-ийн ДАРАА, multer-ийн ӨМНӨ тавина.
 */
async function bpayKhoriglokh(req, res, next) {
  try {
    if (await bpayEsekh(khuseltiinBaiguullaga(req))) {
      return res.status(409).json({
        success: false,
        code: "BPAY_GORIM",
        message:
          "Төлбөрийг Төрийн банкаар тооцдог тул энэ үйлдэл хийх боломжгүй.",
      });
    }
  } catch (_) {
    // Тохиргоо уншигдахгүй бол хуучин зан төлөвөөр үргэлжилнэ.
  }
  next();
}

// ---------------------------------------------------------------------------
// Туслах
// ---------------------------------------------------------------------------
function utasKhevshuulekh(v) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : "";
}

function too(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function tootKhevshuulekh(v) {
  return String(v ?? "").trim().replace(/^0+(?=.)/, "");
}

const tsag = (ms) => new Promise((r) => setTimeout(r, ms));

async function bagtsaar(items, khemjee, fn) {
  for (let i = 0; i < items.length; i += khemjee) {
    await Promise.all(items.slice(i, i + khemjee).map(fn));
  }
}

/**
 * BPay-ийн /billing/bills хариуг задлана. Зөвхөн СӨХ-ийн (HOUSE_OWNER_ASSOCIATION)
 * биллүүд буцна; төлбөрүүд (манай холболтоор хийгдсэн) тусдаа.
 */
function billuudZadlakh(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  let header = null;
  let billuud = list;
  if (list.length === 1 && list[0] && typeof list[0] === "object" && !list[0].billId) {
    header = list[0];
    // Оршин суугчийн нуусан билл (removeBill) hiddenNewBills руу шилждэг — ТӨЛӨГДӨӨГҮЙ хэвээр.
    // Үүнийг уншихгүй бол нуусан билл "алга болсон = төлсөн" болж хувирна.
    const ileer = Array.isArray(header.newBills) ? header.newBills : [];
    const nuusan = Array.isArray(header.hiddenNewBills) ? header.hiddenNewBills : [];
    billuud = [...ileer, ...nuusan.map((b) => ({ ...b, __nuusan: true }))];
  }
  const sokh = [];
  for (const b of billuud) {
    if (!b || typeof b !== "object") continue;
    if (String(b.billtypeGeneral || "").toUpperCase() !== SOKH_TURUL) continue;
    const a1 = too(b.billAmount);
    const a2 = too(b.billTotalAmount);
    const aldangi = too(b.billLateFee);
    const dun = a1 && a2 ? Math.min(a1, a2) : a1 || a2;
    sokh.push({
      billId: String(b.billId || ""),
      billNo: String(b.billNo || ""),
      sar: String(b.billPeriod || ""),
      billerName: String(b.billerName || ""),
      billtype: String(b.billtype || ""),
      dun,
      aldangi,
      aldangitaiDun: a1 && a2 ? Math.max(a1, a2) : dun + aldangi,
      nuusan: b.__nuusan === true,
    });
  }
  const tulburuud = Array.isArray(header?.payments) ? header.payments : [];
  return { sokh, tulburuud, billingId: header ? String(header.billingId || "") : "" };
}

/** Манай холболтоор хийгдсэн төлбөрөөс billId → {ognoo, dun} */
function tulburiinBillMap(tulburuud) {
  const m = new Map();
  for (const p of tulburuud) {
    const status = String(p.paymentStatus || "").toUpperCase();
    // Зөвхөн тодорхой ТӨЛӨГДСӨН төлбөр нотолгоо болно (хоосон/хүлээгдэж буй төлөв биш).
    if (!["PAID", "SUCCESS", "COMPLETED"].includes(status)) continue;
    const ognoo = p.paymentStatusDate ? new Date(p.paymentStatusDate) : null;
    for (const b of Array.isArray(p.bills) ? p.bills : []) {
      const id = typeof b === "string" ? b : b?.billId || b?.id;
      if (id) m.set(String(id), { ognoo, dun: too(b?.billAmount ?? b?.amount ?? p.paymentAmount) });
    }
  }
  return m;
}

async function bpayKhereglegchBelden(utas) {
  const info = await walletApiService.getUserInfo(utas).catch(() => null);
  if (info) return;
  try {
    await walletApiService.registerUser(utas, `${utas}@sukh.mn`);
  } catch (e) {
    if (!(await walletApiService.getUserInfo(utas).catch(() => null))) {
      throw new Error(`Төрийн банкны бүртгэл (${utas}) үүсгэж чадсангүй: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Ажиллаж буй төлөв (санах ойд) — нэг байгууллагад нэг л ажил зэрэг
// ---------------------------------------------------------------------------
const ajilTuluv = new Map(); // `${baiguullagiinId}:${turul}` -> {...}

function ajilEkhluulekh(baiguullagiinId, turul) {
  const k = `${baiguullagiinId}:${turul}`;
  const umnukh = ajilTuluv.get(k);
  if (umnukh && umnukh.ajillajBaina) return null;
  const t = { turul, ajillajBaina: true, ekhelsen: new Date(), duussan: null, ur: null, aldaa: null };
  ajilTuluv.set(k, t);
  return t;
}

function ajliinTuluvAvya(baiguullagiinId) {
  const ur = {};
  for (const turul of ["kholbokh", "sync"]) {
    ur[turul] = ajilTuluv.get(`${baiguullagiinId}:${turul}`) || null;
  }
  return ur;
}

// ---------------------------------------------------------------------------
// Хаяг холбох — ОРШИН СУУГЧ БҮРИЙН ӨӨРИЙН УТСААР
// ---------------------------------------------------------------------------
// Аппын нэгдсэн сан (controller/negdsenSan.js) — тэнд бүртгэлтэй хэрэглэгчийн toot-д бичихгүй.
const CENTRALIZED_ORG_ID = "698e7fd3b6dd386b6c56a808";

/**
 * Идэвхтэй орон сууцны гэрээ бүрийн хаягийг ТЭР ТООТЫН ОРШИН СУУГЧИЙН ӨӨРИЙН
 * BPay бүртгэлд (утас = walletUserId) холбоно:
 *   1. оршин суугч аль хэдийн холбосон бол (WALLET_API toot) түүнийг ашиглана;
 *   2. үгүй бол утсаар нь BPay хэрэглэгч бүртгээд, хаягаар хайж, saveBilling;
 *   3. оршин суугчийн toots-д WALLET_API бичлэг (аппын бүтэцтэй ижил, атомик) нэмнэ —
 *      апп BPay биллийг шууд харуулна;
 *   4. bpayHolbolt-д тэр утсыг (syncUtas) хадгална — синк түүгээр татна.
 * Оршин суугчгүй/утасгүй, BPay-д олдоогүй, олон хэрэглэгчтэй тоотыг тайланд буцаана.
 */
async function khayagKholbokh(kholbolt, baiguullagiinId) {
  const t = await bpayTokhirgooAvya(baiguullagiinId);
  if (!t) throw new Error("Байгууллага олдсонгүй");
  // Холбосон билл оршин суугчийн апп-д ШУУД харагдана. Горим асаагүй бол апп Sukh-ийн
  // нэхэмжлэхийг ч төлөх дүнд нэмж давхар харуулна — тиймээс зөвхөн горим асаалттай үед.
  if (!t.idevkhtei) throw new Error("Эхлээд Төрийн банк горимыг асаана уу (асаагүй үед холбовол апп давхар дүн харуулна).");
  const bairMap = new Map(t.barilguud.filter((b) => b.bpayBairId).map((b) => [b.barilgiinId, b.bpayBairId]));
  if (!bairMap.size) throw new Error("Аль ч барилгад Төрийн банкны хаяг тохируулаагүй байна");

  const mongoose = require("mongoose");
  const OrshinSuugch = require("../models/orshinSuugch");
  const residents = OrshinSuugch(db.erunkhiiKholbolt).collection;
  const { gereeniiTootTurul, OR_SUUTS } = require("../utils/zardalAngilal");
  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId: String(baiguullagiinId), tuluv: { $nin: IDEVKHGUI_GEREE } })
    .select("_id gereeniiDugaar toot barilgiinId tootTurul turul orshinSuugchId utas")
    .lean();
  const holboltuud = await BpayHolbolt(kholbolt).find({ baiguullagiinId: String(baiguullagiinId) }).lean();
  // Сүүлийн синк алдаатай (оршин суугч хаягаа устгасан, утсаа сольсон г.м.) тоотыг дахин холбоно.
  // Холбогдсон тоотыг дахин холбохгүй (түр алдаа синкээр өөрөө засагдана).
  const holbogdson = new Set(
    holboltuud.filter((h) => h.billingId && h.syncUtas && !h.salgasan).map((h) => String(h.gereeniiId)),
  );
  // Оршин суугч өөрөө салгасан тоот — BPay-д ДАХИН НЭМЭХГҮЙ.
  const salgasanMap = new Map(holboltuud.filter((h) => h.salgasan).map((h) => [String(h.gereeniiId), h]));

  const tailan = {
    niit: 0,
    shine: 0,
    umnukh: 0,
    algassan: 0,
    oldoogui: [],
    olonKhereglegch: [],
    bairgui: [],
    utasgui: [],
    salgasan: [],
    aldaa: [],
  };

  const ajil = [];
  for (const g of gereenuud) {
    const toot = tootKhevshuulekh(g.toot);
    if (!toot) continue;
    if ((await gereeniiTootTurul(g)) !== OR_SUUTS) continue;
    tailan.niit++;
    if (holbogdson.has(String(g._id))) {
      tailan.algassan++;
      continue;
    }
    const bairId = bairMap.get(String(g.barilgiinId));
    if (!bairId) {
      tailan.bairgui.push(toot);
      continue;
    }
    ajil.push({ g, toot, bairId, salgasanH: salgasanMap.get(String(g._id)) || null });
  }

  const bpayKhereglegchid = new Set(); // энэ ажилд бэлдсэн утаснууд
  await bagtsaar(ajil, 4, async ({ g, toot, bairId, salgasanH }) => {
    try {
      // 0. Оршин суугч ба түүний утас (апп BPay-ээс энэ утсаар хайдаг)
      let resident = null;
      if (g.orshinSuugchId && mongoose.Types.ObjectId.isValid(String(g.orshinSuugchId))) {
        resident = await residents.findOne({ _id: new mongoose.Types.ObjectId(String(g.orshinSuugchId)) });
      }
      const gereeUtas = utasKhevshuulekh(Array.isArray(g.utas) ? g.utas[0] : g.utas);
      if (!resident && gereeUtas) {
        resident = await residents.findOne({
          $or: [{ utas: gereeUtas }, { utas: `+976${gereeUtas}` }, { nevtrekhNer: gereeUtas }],
        });
      }
      const utas = utasKhevshuulekh(resident?.utas) || gereeUtas;
      if (!utas) {
        tailan.utasgui.push(toot);
        return;
      }

      // 1. Оршин суугч өөрөө аль хэдийн холбосон уу
      const toots = Array.isArray(resident?.toots) ? resident.toots : [];
      const umnukhToot = toots.find(
        (x) =>
          x?.source === "WALLET_API" &&
          x.billingId &&
          x.walletCustomerId &&
          String(x.walletBairId || "") === bairId &&
          tootKhevshuulekh(x.walletDoorNo) === toot,
      );

      let customerId = umnukhToot ? String(umnukhToot.walletCustomerId) : "";
      let customerCode = umnukhToot ? String(umnukhToot.walletCustomerCode || "") : "";
      let customerName = "";
      let customerAddress = umnukhToot?.bairniiNer || "";
      let billingId = umnukhToot ? String(umnukhToot.billingId) : "";
      let bidUusgesen = false;

      // Оршин суугч өөрөө салгасан бол BPay-д ДАХИН НЭМЭХГҮЙ. Зөвхөн өөрөө дахин холбосон
      // (шинэ billingId-тай WALLET_API toot) бол түүнийг авна — BPay-д юу ч бичихгүй.
      if (salgasanH && (!umnukhToot || String(umnukhToot.billingId) === String(salgasanH.billingId))) {
        tailan.salgasan.push(toot);
        return;
      }

      if (!billingId) {
        // 2. BPay хэрэглэгч → хаягаар хайх → saveBilling (оршин суугчийн өөрийн бүртгэлд)
        if (!bpayKhereglegchid.has(utas)) {
          await bpayKhereglegchBelden(utas);
          bpayKhereglegchid.add(utas);
        }
        const list = (await walletApiService.getBillingByAddress(utas, bairId, toot)) || [];
        if (!list.length) {
          tailan.oldoogui.push(toot);
          return;
        }
        let c = list[0];
        if (list.length > 1) {
          const taarsan = list.filter((x) =>
            new RegExp(`(^|\\D)${toot}\\s*$`).test(String(x.customerAddress || "").trim()),
          );
          if (taarsan.length !== 1) {
            tailan.olonKhereglegch.push({
              toot,
              songoltuud: list.map((x) => ({ customerCode: x.customerCode, customerName: x.customerName })),
            });
            return;
          }
          c = taarsan[0];
        }
        customerId = String(c.customerId || "");
        customerCode = String(c.customerCode || "");
        customerName = c.customerName || "";
        customerAddress = c.customerAddress || "";
        if (!customerId) {
          tailan.oldoogui.push(toot);
          return;
        }
        if (walletApiService.clearBillingListCache) walletApiService.clearBillingListCache(utas);
        const umnukhList = (await walletApiService.getBillingList(utas)) || [];
        const umnukh = umnukhList.find((b) => String(b.customerId || "") === customerId);
        if (umnukh?.billingId) {
          billingId = String(umnukh.billingId);
          tailan.umnukh++;
        } else {
          const saved = await walletApiService.saveBilling(utas, { customerId });
          billingId = String(saved?.billingId || saved?.id || "");
          if (!billingId) throw new Error("saveBilling billingId буцаасангүй");
          bidUusgesen = true;
          tailan.shine++;
        }

        // 3. Оршин суугчийн апп-д харагдуулах (аппын "havakh" урсгалтай ижил бүтэц, атомик)
        if (
          resident &&
          utasKhevshuulekh(resident.utas) === utas &&
          resident.baiguullagiinId &&
          String(resident.baiguullagiinId) !== CENTRALIZED_ORG_ID
        ) {
          const fields = {
            toot,
            source: "WALLET_API",
            bairniiNer: customerAddress,
            ovog: resident.ovog || "",
            ner: resident.ner || "",
            walletBairId: bairId,
            walletDoorNo: toot,
            walletUserId: utas,
            walletCustomerId: customerId,
            walletCustomerCode: customerCode,
            billingId,
          };
          const sameEntry = {
            source: "WALLET_API",
            $or: [{ walletCustomerId: customerId }, ...(customerCode ? [{ walletCustomerCode: customerCode }] : [])],
          };
          const upd = await residents.updateOne(
            { _id: resident._id, toots: { $elemMatch: sameEntry } },
            { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`toots.$.${k}`, v])) },
          );
          if (!upd.matchedCount) {
            await residents.updateOne(
              { _id: resident._id, toots: { $not: { $elemMatch: sameEntry } } },
              {
                $push: {
                  toots: { _id: new mongoose.Types.ObjectId(), turul: "Орон сууц", ...fields, createdAt: new Date() },
                },
              },
            );
          }
          await residents.updateOne(
            { _id: resident._id, $or: [{ walletUserId: { $exists: false } }, { walletUserId: null }, { walletUserId: "" }] },
            { $set: { walletUserId: utas } },
          );
        }
      } else {
        tailan.umnukh++;
      }

      // 4. Синкийн холболт — оршин суугчийн утсаар
      await BpayHolbolt(kholbolt).updateOne(
        { baiguullagiinId: String(baiguullagiinId), gereeniiId: String(g._id) },
        {
          $set: {
            barilgiinId: String(g.barilgiinId || ""),
            gereeniiDugaar: g.gereeniiDugaar || "",
            toot,
            bpayBairId: bairId,
            customerId,
            customerCode,
            customerName,
            customerAddress,
            billingId,
            syncUtas: utas,
            residentId: resident?._id ? String(resident._id) : "",
            salgasan: false,
            suuldAldaa: "",
          },
          $setOnInsert: { bidUusgesen },
        },
        { upsert: true },
      );
    } catch (e) {
      tailan.aldaa.push({ toot, aldaa: e.response?.data?.responseMsg || e.message });
    }
  });
  return tailan;
}

// ---------------------------------------------------------------------------
// Синк
// ---------------------------------------------------------------------------
/**
 * Тоот бүрийн СӨХ-ийн биллийг тэр тоотын оршин суугчийн BPay бүртгэлээс татаж `bpayBill`-д тусгана.
 *
 *  - шинэ `customerCode|сар` → Төлөгдөөгүй;
 *  - ALGA_BOSGO удаа дараалан алга → Төлөгдсөн (огноо = анх алга болсон, дүн = сүүлд харсан
 *    алдангитай дүн; манай холболтоор төлсөн бол BPay-ийн яг огноо, дүн);
 *  - төлөгдсөн нь дахин гарвал (ижил эсвэл өөр billId) → буцаад Төлөгдөөгүй, түүхэнд бичнэ;
 *  - хүсэлт амжилтгүй тоотыг хөндөхгүй; нэг удаад төлөгдөөгүйн ALGA_KHUVI-аас олон
 *    алга болбол юу ч "төлсөн" болгохгүй (BPay алдааны хамгаалалт).
 */
// Нэг байгууллагад нэг л синк зэрэг (тоотын шуурхай синк ба цагийн синк давхцахгүй).
const syncTugjsun = new Set();

async function syncKhiikh(kholbolt, baiguullagiinId, opts = {}) {
  const k = String(baiguullagiinId);
  if (syncTugjsun.has(k)) return { zavgui: true };
  syncTugjsun.add(k);
  try {
    return await syncKhiikhDotood(kholbolt, baiguullagiinId, opts);
  } finally {
    syncTugjsun.delete(k);
  }
}

async function syncKhiikhDotood(kholbolt, baiguullagiinId, { albadakh = false, holboltIdnuud = null } = {}) {
  const t = await bpayTokhirgooAvya(baiguullagiinId);
  if (!t?.idevkhtei) return { algassan: true };
  const orgId = String(baiguullagiinId);
  const Bill = BpayBill(kholbolt);
  // Холболт бүрийг тэр тоотын оршин суугчийн өөрийн утсаар (syncUtas) татна.
  const holboltuud = (await BpayHolbolt(kholbolt).find({ baiguullagiinId: orgId, billingId: { $ne: "" } }).lean())
    .filter((h) => h.syncUtas && !h.salgasan)
    .filter((h) => !holboltIdnuud || holboltIdnuud.includes(String(h._id)));
  const odoo = new Date();
  const tailan = { holbolt: holboltuud.length, amjilttai: 0, aldaatai: 0, shineBill: 0, dakhinGarsan: 0, tulsun: 0, khuleegdej: 0, zogsoson: false, sanuulga: "" };

  // 1. Татна (алдаатайг тэмдэглэнэ)
  const tatsan = []; // { h, sokh, tulburMap }
  await bagtsaar(holboltuud, 5, async (h) => {
    try {
      const raw = await walletApiService.getBillingBills(h.syncUtas, h.billingId);
      const { sokh, tulburuud, billingId } = billuudZadlakh(raw);
      // Хариу ЭНЭ холболтынх биш (оршин суугч хаягаа устгасан, хоосон/өөр хариу) бол
      // биллүүд "алга болсон" гэж үзэж болохгүй — алдаа гэж тэмдэглээд хөндөхгүй.
      if (billingId !== String(h.billingId)) {
        throw new Error("Төрийн банкны холболт олдсонгүй (оршин суугч хаягаа устгасан байж магадгүй)");
      }
      tatsan.push({ h, sokh, tulburMap: tulburiinBillMap(tulburuud) });
      tailan.amjilttai++;
      await BpayHolbolt(kholbolt).updateOne({ _id: h._id }, { $set: { suuldSync: odoo, suuldAldaa: "" } });
    } catch (e) {
      tailan.aldaatai++;
      await BpayHolbolt(kholbolt)
        .updateOne({ _id: h._id }, { $set: { suuldAldaa: e.response?.data?.responseMsg || e.message } })
        .catch(() => null);
    }
  });

  // 2. Харагдсан биллүүдийг тусгана
  const algaNer = []; // { doc, tulburMap }
  for (const { h, sokh, tulburMap } of tatsan) {
    const code = h.customerCode || h.customerId;
    const sardaa = new Map();
    for (const b of sokh) sardaa.set(b.sar, (sardaa.get(b.sar) || 0) + 1);
    const kharsan = new Set();
    for (const b of sokh) {
      const davkhar = sardaa.get(b.sar) > 1;
      const tulkhuur = davkhar ? `${code}|${b.sar}|${b.billId}` : `${code}|${b.sar}`;
      kharsan.add(tulkhuur);
      const suuri = {
        barilgiinId: h.barilgiinId,
        gereeniiId: h.gereeniiId,
        gereeniiDugaar: h.gereeniiDugaar,
        toot: h.toot,
        customerId: h.customerId,
        customerCode: h.customerCode,
        billingId: h.billingId,
        sar: b.sar,
        billNo: b.billNo,
        billerName: b.billerName,
        billtype: b.billtype,
        dun: b.dun,
        aldangi: b.aldangi,
        aldangitaiDun: b.aldangitaiDun,
        davkharEsekh: davkhar,
        nuusan: b.nuusan === true,
        suuldKharsan: odoo,
        algaToo: 0,
        algaEkhelsen: null,
      };
      const doc = await Bill.findOne({ baiguullagiinId: orgId, tulkhuur });
      if (!doc) {
        try {
          await Bill.create({
          ...suuri,
          baiguullagiinId: orgId,
          tulkhuur,
          billId: b.billId,
          tuluv: "Төлөгдөөгүй",
          anhKharsan: odoo,
          tuukh: [{ ognoo: odoo, uildel: "Шинэ билл", delgerengui: `${b.sar} · ${b.dun}₮` }],
          });
        } catch (e) {
          // Давхар түлхүүр (өөр синк зэрэг үүсгэсэн) — дараагийн синк шинэчилнэ.
          if (e && e.code === 11000) continue;
          throw e;
        }
        tailan.shineBill++;
        continue;
      }
      const tuukh = [];
      const set = { ...suuri };
      if (doc.tuluv === "Төлөгдсөн") {
        set.tuluv = "Төлөгдөөгүй";
        set.tulsunOgnoo = null;
        set.tulsunDun = null;
        set.tulburiinEkhSurvalj = "";
        set.tailbar = "";
        tuukh.push({ ognoo: odoo, uildel: "Дахин гарсан", delgerengui: `Төлсөн бичлэг цуцлагдлаа (billId ${b.billId})` });
        tailan.dakhinGarsan++;
      }
      if (doc.billId && doc.billId !== b.billId) {
        tuukh.push({ ognoo: odoo, uildel: "billId солигдсон", delgerengui: `${doc.billId} → ${b.billId}` });
      }
      if (Math.abs((doc.dun || 0) - b.dun) >= 1) {
        tuukh.push({ ognoo: odoo, uildel: "СӨХ дүнг зассан", delgerengui: `${doc.dun} → ${b.dun}` });
      }
      set.billId = b.billId;
      await Bill.updateOne({ _id: doc._id }, { $set: set, ...(tuukh.length ? { $push: { tuukh: { $each: tuukh } } } : {}) });
    }

    // Энэ холболтын өмнө нь төлөгдөөгүй байсан ч одоо харагдаагүй биллүүд
    const umnukhuud = await Bill.find({
      baiguullagiinId: orgId,
      gereeniiId: h.gereeniiId,
      customerId: h.customerId,
      tuluv: "Төлөгдөөгүй",
    }).lean();
    for (const doc of umnukhuud) {
      if (!kharsan.has(doc.tulkhuur)) algaNer.push({ doc, tulburMap, h });
    }
  }

  // 3. Алга болсныг шийднэ (хамгаалалттай)
  const niitTulugduugui = await Bill.countDocuments({ baiguullagiinId: orgId, tuluv: "Төлөгдөөгүй" });
  // BPay-ийн төлбөрийн нотолгоотой билл — шууд "төлсөн" (хүлээх, хамгаалалтад тоолох шаардлагагүй).
  const notolgoo = ({ doc, tulburMap }) => (doc.billId ? tulburMap.get(String(doc.billId)) : null);
  const tulukhNer = algaNer.filter((x) => !notolgoo(x) && (x.doc.algaToo || 0) + 1 >= ALGA_BOSGO);
  const khyazgaar = Math.max(ALGA_DOOD, Math.ceil(niitTulugduugui * ALGA_KHUVI));
  // albadakh: ажилтан анхааруулгыг шалгаад гараар зөвшөөрсөн (олон айл зэрэг төлсөн гэх мэт).
  if (tulukhNer.length > khyazgaar && !albadakh) {
    tailan.zogsoson = true;
    tailan.sanuulga = `${tulukhNer.length} билл нэг дор алга болсон (хязгаар ${khyazgaar}) — "төлсөн" гэж тэмдэглээгүй. Төрийн банкны алдаа байж магадгүй.`;
    console.warn(`⚠️ [BPAY SYNC] ${orgId}: ${tailan.sanuulga}`);
    return tailan;
  }
  // "Төлсөн" гэхийн өмнө тухайн холболт оршин суугчийн бүртгэлд БАЙСААР байгааг шалгана.
  // true = байна (билл үнэхээр newBills/hiddenNewBills-ээс гарсан), false = салгасан,
  // null = тодорхойгүй (алдаа, хоосон жагсаалт) → юу ч "төлсөн" болгохгүй.
  const batalgaa = new Map();
  const kholboltBaigaa = async (h) => {
    const k = String(h._id);
    if (batalgaa.has(k)) return batalgaa.get(k);
    let ur = null;
    try {
      if (walletApiService.clearBillingListCache) walletApiService.clearBillingListCache(h.syncUtas);
      const list = (await walletApiService.getBillingList(h.syncUtas)) || [];
      if (list.some((b) => String(b.billingId) === String(h.billingId))) ur = true;
      else if (list.length > 0) ur = false;
    } catch (_) {
      ur = null;
    }
    batalgaa.set(k, ur);
    return ur;
  };
  for (const x of algaNer) {
    const { doc, tulburMap, h } = x;
    const algaToo = (doc.algaToo || 0) + 1;
    const nottoi = !!notolgoo(x);
    if (!nottoi && algaToo < ALGA_BOSGO) {
      await Bill.updateOne({ _id: doc._id }, { $set: { algaToo, algaEkhelsen: doc.algaEkhelsen || odoo } });
      tailan.khuleegdej++;
      continue;
    }
    // Нотолгоо нь ЭНЭ холболтын хариунаас ирсэн тул холболт байгаа нь батлагдсан.
    const baigaa = nottoi ? true : await kholboltBaigaa(h);
    if (baigaa !== true) {
      // Баталгаагүй — төлөгдөөгүй хэвээр үлдээнэ.
      await Bill.updateOne({ _id: doc._id }, { $set: { algaToo, algaEkhelsen: doc.algaEkhelsen || odoo } });
      tailan.batalgaajaagui = (tailan.batalgaajaagui || 0) + 1;
      if (baigaa === false && !h.salgasan) {
        h.salgasan = true;
        await BpayHolbolt(kholbolt).updateOne(
          { _id: h._id },
          { $set: { salgasan: true, salgasanOgnoo: odoo, suuldAldaa: "Оршин суугч Төрийн банкнаас хаягаа салгасан" } },
        );
        tailan.salgasan = (tailan.salgasan || 0) + 1;
      }
      continue;
    }
    const manai = doc.billId ? tulburMap.get(String(doc.billId)) : null;
    const ognoo = manai?.ognoo || doc.algaEkhelsen || odoo;
    const dun = manai?.dun || doc.aldangitaiDun || doc.dun;
    await Bill.updateOne(
      { _id: doc._id, tuluv: "Төлөгдөөгүй" },
      {
        $set: {
          tuluv: "Төлөгдсөн",
          algaToo,
          tulsunOgnoo: ognoo,
          tulsunDun: dun,
          tulburiinEkhSurvalj: manai ? "Төрийн банк (манай холболт)" : "Илрүүлсэн",
          tailbar: "Төрийн банк",
        },
        $push: { tuukh: { ognoo: odoo, uildel: "Төлөгдсөн", delgerengui: manai ? "Төрийн банкны төлбөр" : "Төрийн банкнаас алга болсон" } },
      },
    );
    tailan.tulsun++;
  }
  return tailan;
}

/**
 * Төлбөр хийгдсэний дараа тухайн тоотыг ШУУД синк хийнэ (манай апп-аар төлсөн үед
 * walletQpay callback-аас дуудагдана). BPay төлбөрийг боловсруулж амжихаар 5 секунд,
 * 60 секундын дараа хоёр удаа шалгана. Алдаа гарсан ч төлбөрийн урсгалд нөлөөлөхгүй.
 */
function tulburiinDaraaSync({ billingId, customerId } = {}) {
  if (!billingId && !customerId) return;
  const ajillulakh = async () => {
    try {
      const orgs = await Baiguullaga(db.erunkhiiKholbolt)
        .find({ "tokhirgoo.bpayAshiglakhEsekh": true })
        .select("_id")
        .lean();
      for (const org of orgs) {
        const orgId = String(org._id);
        const kholbolt = (db.kholboltuud || []).find((k) => String(k.baiguullagiinId) === orgId);
        if (!kholbolt) continue;
        const holboltuud = await BpayHolbolt(kholbolt).find({ baiguullagiinId: orgId }).lean();
        const h = holboltuud.find(
          (x) =>
            (billingId && String(x.billingId) === String(billingId)) ||
            (customerId && String(x.customerId) === String(customerId)),
        );
        if (!h) continue;
        await syncKhiikh(kholbolt, orgId, { holboltIdnuud: [String(h._id)] });
        return;
      }
    } catch (e) {
      console.error("[BPAY] төлбөрийн дараах синк:", e.message);
    }
  };
  setTimeout(ajillulakh, 5000);
  setTimeout(ajillulakh, 60000);
}

/** Бүх BPay горимтой байгууллагыг синк хийнэ (cron). */
let cronAjillajBaina = false;
async function bukhSyncKhiikh() {
  if (cronAjillajBaina) return;
  cronAjillajBaina = true;
  try {
    const orgs = await Baiguullaga(db.erunkhiiKholbolt)
      .find({ "tokhirgoo.bpayAshiglakhEsekh": true })
      .select("_id ner")
      .lean();
    for (const org of orgs) {
      const id = String(org._id);
      const kholbolt = (db.kholboltuud || []).find((k) => String(k.baiguullagiinId) === id);
      if (!kholbolt) continue;
      await syncAjilEkhluulekh(kholbolt, id, { khuleekh: true });
      await tsag(500);
    }
  } catch (e) {
    console.error("[BPAY SYNC] cron алдаа:", e.message);
  } finally {
    cronAjillajBaina = false;
  }
}

/** Синкийг ажлын төлөвтэй нь ажиллуулна. khuleekh=false бол ар талд. */
async function syncAjilEkhluulekh(kholbolt, baiguullagiinId, { khuleekh = false, albadakh = false } = {}) {
  const ajil = ajilEkhluulekh(String(baiguullagiinId), "sync");
  if (!ajil) return { ajillajBaina: true };
  const p = syncKhiikh(kholbolt, baiguullagiinId, { albadakh })
    .then((ur) => {
      ajil.ur = ur;
    })
    .catch((e) => {
      ajil.aldaa = e.message;
      console.error(`[BPAY SYNC] ${baiguullagiinId}:`, e.message);
    })
    .finally(() => {
      ajil.ajillajBaina = false;
      ajil.duussan = new Date();
    });
  if (khuleekh) await p;
  return { ekhelsen: true };
}

async function kholbokhAjilEkhluulekh(kholbolt, baiguullagiinId) {
  const ajil = ajilEkhluulekh(String(baiguullagiinId), "kholbokh");
  if (!ajil) return { ajillajBaina: true };
  khayagKholbokh(kholbolt, baiguullagiinId)
    .then((ur) => {
      ajil.ur = ur;
    })
    .catch((e) => {
      ajil.aldaa = e.message;
    })
    .finally(() => {
      ajil.ajillajBaina = false;
      ajil.duussan = new Date();
    });
  return { ekhelsen: true };
}

// ---------------------------------------------------------------------------
// Задаргааны лавлагаа
// ---------------------------------------------------------------------------
/**
 * Нэг гэрээний BPay биллүүд + сар бүрийн Sukh задаргаа (лавлагаа, төлөх товчгүй).
 * Задаргааны нийлбэр BPay-ийн дүнтэй таарвал `taarsan: true`.
 */
async function zadargaaAvya(kholbolt, gereeniiId, { saruudToo = 12 } = {}) {
  const geree = await Geree(kholbolt).findById(gereeniiId);
  if (!geree) return null;
  const billuud = await BpayBill(kholbolt)
    .find({ baiguullagiinId: String(geree.baiguullagiinId), gereeniiId: String(gereeniiId) })
    .sort({ sar: -1 })
    .lean();
  const { calculateGereeCharges } = require("./invoiceService");
  const sar = [];
  for (const b of billuud.slice(0, saruudToo)) {
    const [on, m] = String(b.sar || "").split("-").map(Number);
    let zadargaa = [];
    if (on && m) {
      try {
        const { charges } = await calculateGereeCharges(kholbolt, geree, { billingDate: new Date(on, m - 1, 15) });
        zadargaa = (charges || [])
          .filter((c) => !c.isEkhniiUldegdel && !c.ledgerDeerBaigaa && Number(c.dun) > 0)
          .map((c) => ({
            ner: c.ner,
            dun: Math.round(Number(c.dun) * 100) / 100,
            // "Зогсоол" = гараж, "Агуулах" = агуулах (invoiceService) — хуулгад ялгаж харуулна.
            turul: c.zardliinTurul || "",
          }));
      } catch (e) {
        zadargaa = [];
      }
    }
    const niit = zadargaa.reduce((s, c) => s + c.dun, 0);
    sar.push({
      sar: b.sar,
      tuluv: b.tuluv,
      dun: b.dun,
      aldangi: b.aldangi,
      aldangitaiDun: b.aldangitaiDun,
      tulsunOgnoo: b.tulsunOgnoo || null,
      zadargaa,
      zadargaaNiit: Math.round(niit * 100) / 100,
      taarsan: zadargaa.length > 0 && Math.abs(niit - b.dun) < 1,
    });
  }
  return {
    gereeniiId: String(gereeniiId),
    gereeniiDugaar: geree.gereeniiDugaar,
    toot: geree.toot,
    tulukh: billuud.filter((b) => b.tuluv === "Төлөгдөөгүй").reduce((s, b) => s + (b.aldangitaiDun || b.dun || 0), 0),
    saruud: sar,
  };
}

// ---------------------------------------------------------------------------
// BPay хаяг хайх (хадгалсан хаягийн модноос)
// ---------------------------------------------------------------------------
let khayagiinMod = null;
function bairKhaikh(q, khyazgaar = 20) {
  if (!khayagiinMod) {
    try {
      const path = require("path");
      khayagiinMod = require(path.join(__dirname, "..", "scripts", "data", "bpay_address_tree.json")).bairs || [];
    } catch (_) {
      khayagiinMod = [];
    }
  }
  const ugs = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!ugs.length) return [];
  return khayagiinMod
    .filter((b) => {
      const text = `${b.district} ${b.khoroo} ${b.bairName}`.toLowerCase();
      return ugs.every((u) => new RegExp(`(^|[^\\dа-яөүё])${u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text));
    })
    .slice(0, khyazgaar)
    .map((b) => ({ bairId: b.bairId, ner: b.bairName, duureg: b.district, khoroo: b.khoroo }));
}

module.exports = {
  SOKH_TURUL,
  bpayTokhirgooAvya,
  tokhirgooSanakhTseverlekh,
  bpayEsekh,
  bpayKhoriglokh,
  khuseltiinBaiguullaga,
  orshinSuugchEsekh,
  bpayBaiguullaguudOlokh,
  orshinSuugchidSukhNekhemjlekhNuukh,
  billuudZadlakh,
  khayagKholbokh,
  syncKhiikh,
  bukhSyncKhiikh,
  tulburiinDaraaSync,
  syncAjilEkhluulekh,
  kholbokhAjilEkhluulekh,
  ajliinTuluvAvya,
  zadargaaAvya,
  bairKhaikh,
  utasKhevshuulekh,
};
