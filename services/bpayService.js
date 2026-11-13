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
// "Төлсөн" гэхээс өмнө билл ДОР ХАЯЖ ийм хугацаа алга байх ёстой. Хоёр процесс (prod, dev нэг
// сан) зэрэг синк хийсэн ч, гараар дараалан дарсан ч нэг агшны алга болохыг төлсөн гэж үзэхгүй.
let ALGA_KHUGATSAA_MS = 4 * 60 * 1000;
// Синкийн санд суурилсан түгжээ (олон процесс) — энэ хугацааны дараа өөрөө чөлөөлөгдөнө.
const SYNC_TUGJEE_MS = 10 * 60 * 1000;

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

/**
 * Төрийн банк сарыг тэгээр дүүргэдэггүй ("2026-7"). Эрэмбэлэх/харуулахад "2026-07" болгоно.
 * Санд хадгалсан `sar`/`tulkhuur`-ыг ӨӨРЧЛӨХГҮЙ (өөрчилбөл бүх билл "алга болсон" болно).
 */
function sarTulkhuur(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : String(v || "");
}

function tootKhevshuulekh(v) {
  return String(v ?? "").trim().replace(/^0+(?=.)/, "");
}

const tsag = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ажлын сан (pool): нэг дуусмагц дараагийнхыг шууд эхлүүлнэ — bagtsaar шиг хамгийн
 * удаан нэгийг хүлээхгүй. Үр дүнг оролтын дарааллаар буцаана.
 */
async function zeregAjilluulakh(items, khemjee, fn) {
  const ur = new Array(items.length);
  let i = 0;
  const ajilchin = async () => {
    while (i < items.length) {
      const n = i++;
      ur[n] = await fn(items[n], n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(khemjee, items.length) }, ajilchin));
  return ur;
}

/**
 * Нэг утсанд хамаарах ажлыг дараалуулна (нэг оршин суугчийн BPay бүртгэлд зэрэг
 * бичихгүй — давхар хэрэглэгч/давхар billing үүсэхээс сэргийлнэ). Өөр утаснууд зэрэг явна.
 */
function utasniiDaraalalUusgekh() {
  const suul = new Map();
  return (utas, fn) => {
    const umnukh = suul.get(utas) || Promise.resolve();
    const daraa = umnukh.catch(() => {}).then(fn);
    suul.set(utas, daraa.catch(() => {}));
    return daraa;
  };
}

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
async function khayagKholbokh(kholbolt, baiguullagiinId, ajilTuluv = null) {
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
    /** gereeniiId → холбогдоогүй шалтгаан (холбогдоогүй тоотын жагсаалтад) */
    shaltgaan: {},
  };
  const temdeglekh = (g, text) => {
    tailan.shaltgaan[String(g._id)] = text;
  };

  // Тоотын төрлийг зэрэг шалгана (гэрээ бүрд санд хандаж магадгүй тул дараалан удаан байсан).
  const turluud = await zeregAjilluulakh(gereenuud, 10, (g) =>
    tootKhevshuulekh(g.toot) ? gereeniiTootTurul(g).catch(() => OR_SUUTS) : null,
  );
  const ajil = [];
  for (const [n, g] of gereenuud.entries()) {
    const toot = tootKhevshuulekh(g.toot);
    if (!toot) continue;
    if (turluud[n] !== OR_SUUTS) continue;
    tailan.niit++;
    if (holbogdson.has(String(g._id))) {
      tailan.algassan++;
      continue;
    }
    const bairId = bairMap.get(String(g.barilgiinId));
    if (!bairId) {
      tailan.bairgui.push(toot);
      temdeglekh(g, "Барилгад банкны хаяг тохируулаагүй");
      continue;
    }
    ajil.push({ g, toot, bairId, salgasanH: salgasanMap.get(String(g._id)) || null });
  }

  // Явц: вэб 3 секунд тутам /bpay/tuluv-аас уншина (дундын тайлан ч харагдана).
  if (ajilTuluv) {
    ajilTuluv.yavts = { niit: ajil.length, duussan: 0 };
    ajilTuluv.ur = tailan;
  }
  const bpayKhereglegchid = new Map(); // утас → бэлдэх Promise (зэрэг бүртгэхгүй)
  const utasaarDaraalakh = utasniiDaraalalUusgekh();
  await zeregAjilluulakh(ajil, 8, async ({ g, toot, bairId, salgasanH }) => {
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
        temdeglekh(g, "Оршин суугч, утас алга");
        return;
      }
      await utasaarDaraalakh(utas, async () => {

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
        temdeglekh(g, "Оршин суугч хаягаа салгасан");
        return;
      }

      if (!billingId) {
        // 2. BPay хэрэглэгч → хаягаар хайх → saveBilling (оршин суугчийн өөрийн бүртгэлд)
        if (!bpayKhereglegchid.has(utas)) bpayKhereglegchid.set(utas, bpayKhereglegchBelden(utas));
        await bpayKhereglegchid.get(utas);
        const list = (await walletApiService.getBillingByAddress(utas, bairId, toot)) || [];
        if (!list.length) {
          tailan.oldoogui.push(toot);
          temdeglekh(g, "Банкинд олдсонгүй");
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
            temdeglekh(g, `Банкинд ${list.length} хэрэглэгч — гараар сонгоно`);
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
          temdeglekh(g, "Банкинд олдсонгүй");
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
      });
    } catch (e) {
      tailan.aldaa.push({ toot, aldaa: e.response?.data?.responseMsg || e.message });
      temdeglekh(g, `Алдаа: ${e.response?.data?.responseMsg || e.message}`);
    } finally {
      if (ajilTuluv?.yavts) ajilTuluv.yavts.duussan++;
    }
  });
  return tailan;
}

// ---------------------------------------------------------------------------
// Ажилтан нэг тоотыг гараар холбох — оршин суугч апп-аас холбодогтой ижил урсгал
// (хаягаар хайх → хэрэглэгч сонгох → saveBilling), оршин суугчийн утсаар.
// ---------------------------------------------------------------------------
/** Гэрээ, оршин суугч, анхдагч утас/байр/тоот */
async function garaarKholbokhSuuri(kholbolt, baiguullagiinId, gereeniiId) {
  const orgId = String(baiguullagiinId);
  const t = await bpayTokhirgooAvya(orgId);
  if (!t) throw new Error("Байгууллага олдсонгүй");
  if (!t.idevkhtei) throw new Error("Эхлээд Төрийн банк горимыг асаана уу.");
  const g = await Geree(kholbolt)
    .findById(gereeniiId)
    .select("_id baiguullagiinId gereeniiDugaar toot barilgiinId orshinSuugchId utas ovog ner")
    .lean();
  if (!g || String(g.baiguullagiinId) !== orgId) throw new Error("Гэрээ олдсонгүй");

  const mongoose = require("mongoose");
  const residents = require("../models/orshinSuugch")(db.erunkhiiKholbolt).collection;
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
  const barilga = t.barilguud.find((b) => b.barilgiinId === String(g.barilgiinId));
  return {
    t,
    g,
    residents,
    resident,
    utas: utasKhevshuulekh(resident?.utas) || gereeUtas,
    bairId: barilga?.bpayBairId || "",
    toot: tootKhevshuulekh(g.toot),
  };
}

/**
 * Хаягаар Төрийн банкны хэрэглэгч хайна (сонголт харуулах). Утас/байр/тоотыг
 * ажилтан сольж болно — анхдагч нь гэрээний оршин суугч, барилгын банкны хаяг.
 */
async function garaarKhaikh(kholbolt, baiguullagiinId, { gereeniiId, bairId, doorNo, utas } = {}) {
  const s = await garaarKholbokhSuuri(kholbolt, baiguullagiinId, gereeniiId);
  const u = utasKhevshuulekh(utas) || s.utas;
  const b = String(bairId || s.bairId || "");
  const d = tootKhevshuulekh(doorNo) || s.toot;
  const suuri = {
    utas: u,
    bairId: b,
    doorNo: d,
    ner: [s.resident?.ovog, s.resident?.ner].filter(Boolean).join(" ") || [s.g.ovog, s.g.ner].filter(Boolean).join(" "),
    barilguud: s.t.barilguud.filter((x) => x.bpayBairId).map((x) => ({ ner: x.ner, bpayBairId: x.bpayBairId })),
  };
  // Одоогийн холболт (засах үед сонголтыг урьдчилан тэмдэглэнэ)
  const odoogiin = await BpayHolbolt(kholbolt)
    .findOne({ baiguullagiinId: String(baiguullagiinId), gereeniiId: String(s.g._id) })
    .select("customerId customerCode customerName syncUtas salgasan")
    .lean();
  suuri.odoogiin =
    odoogiin && !odoogiin.salgasan
      ? {
          customerId: String(odoogiin.customerId || ""),
          customerCode: String(odoogiin.customerCode || ""),
          customerName: odoogiin.customerName || "",
          syncUtas: odoogiin.syncUtas || "",
        }
      : null;
  if (!u) return { ...suuri, songoltuud: [], aldaa: "Оршин суугчийн утас алга — утсаа оруулна уу" };
  if (!b || !d) return { ...suuri, songoltuud: [], aldaa: "Банкны байр, тоотоо сонгоно уу" };
  await bpayKhereglegchBelden(u);
  const list = (await walletApiService.getBillingByAddress(u, b, d)) || [];
  return {
    ...suuri,
    songoltuud: list.map((x) => ({
      customerId: String(x.customerId || ""),
      customerCode: String(x.customerCode || ""),
      customerName: x.customerName || "",
      customerAddress: x.customerAddress || "",
    })),
  };
}

/**
 * Сонгосон хэрэглэгчийг оршин суугчийн Төрийн банкны бүртгэлд холбоно (апп-ийн
 * «хаяг нэмэх»-тэй ижил), апп-д харагдуулна, синкийн холболт үүсгээд тэр тоотыг
 * ШУУД синк хийнэ. Оршин суугч өмнө нь салгасан байсан ч ажилтан шийдсэн тул холбоно.
 */
async function garaarKholbokh(kholbolt, baiguullagiinId, { gereeniiId, customerId, bairId, doorNo, utas } = {}) {
  const s = await garaarKholbokhSuuri(kholbolt, baiguullagiinId, gereeniiId);
  const orgId = String(baiguullagiinId);
  const u = utasKhevshuulekh(utas) || s.utas;
  const b = String(bairId || s.bairId || "");
  const d = tootKhevshuulekh(doorNo) || s.toot;
  if (!customerId) throw new Error("Хэрэглэгчээ сонгоно уу");
  if (!u) throw new Error("Оршин суугчийн утас алга");
  if (!b || !d) throw new Error("Банкны байр, тоот шаардлагатай");

  await bpayKhereglegchBelden(u);
  // Сонголтыг дахин баталгаажуулна (хуучирсан/буруу customerId-г холбохгүй)
  const list = (await walletApiService.getBillingByAddress(u, b, d)) || [];
  const c = list.find((x) => String(x.customerId || "") === String(customerId));
  if (!c) throw new Error("Сонгосон хэрэглэгч энэ хаягт олдсонгүй — дахин хайна уу");

  // Оршин суугчийн бүртгэлд аль хэдийн байвал түүнийг, үгүй бол шинээр
  if (walletApiService.clearBillingListCache) walletApiService.clearBillingListCache(u);
  const umnukh = ((await walletApiService.getBillingList(u)) || []).find(
    (x) => String(x.customerId || "") === String(customerId),
  );
  let billingId = umnukh?.billingId ? String(umnukh.billingId) : "";
  let bidUusgesen = false;
  if (!billingId) {
    const saved = await walletApiService.saveBilling(u, { customerId: String(customerId) });
    billingId = String(saved?.billingId || saved?.id || "");
    if (!billingId) throw new Error("Төрийн банк billingId буцаасангүй");
    bidUusgesen = true;
  }

  // Оршин суугчийн апп-д харагдуулах (khayagKholbokh-ийн 3-р алхамтай ижил)
  const resident = s.resident;
  if (
    resident &&
    utasKhevshuulekh(resident.utas) === u &&
    resident.baiguullagiinId &&
    String(resident.baiguullagiinId) !== CENTRALIZED_ORG_ID
  ) {
    const mongoose = require("mongoose");
    const fields = {
      toot: d,
      source: "WALLET_API",
      bairniiNer: c.customerAddress || "",
      ovog: resident.ovog || "",
      ner: resident.ner || "",
      walletBairId: b,
      walletDoorNo: d,
      walletUserId: u,
      walletCustomerId: String(customerId),
      walletCustomerCode: String(c.customerCode || ""),
      billingId,
    };
    const sameEntry = {
      source: "WALLET_API",
      $or: [{ walletCustomerId: String(customerId) }, ...(c.customerCode ? [{ walletCustomerCode: String(c.customerCode) }] : [])],
    };
    const upd = await s.residents.updateOne(
      { _id: resident._id, toots: { $elemMatch: sameEntry } },
      { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`toots.$.${k}`, v])) },
    );
    if (!upd.matchedCount) {
      await s.residents.updateOne(
        { _id: resident._id, toots: { $not: { $elemMatch: sameEntry } } },
        { $push: { toots: { _id: new mongoose.Types.ObjectId(), turul: "Орон сууц", ...fields, createdAt: new Date() } } },
      );
    }
    await s.residents.updateOne(
      { _id: resident._id, $or: [{ walletUserId: { $exists: false } }, { walletUserId: null }, { walletUserId: "" }] },
      { $set: { walletUserId: u } },
    );
  }

  // Өөр хэрэглэгч рүү сольж байвал хуучин хэрэглэгчийн ТӨЛӨГДӨӨГҮЙ биллийг энэ
  // гэрээнээс салгана — эс бөгөөс хуулгын «төлөх дүн»-д үлдэнэ (синк зөвхөн одоогийн
  // хэрэглэгчээр шинэчилдэг). Устгахгүй: буцааж холбовол синк дахин энэ гэрээнд холбоно.
  const umnukhH = await BpayHolbolt(kholbolt)
    .findOne({ baiguullagiinId: orgId, gereeniiId: String(s.g._id) })
    .select("customerId customerCode")
    .lean();
  let salgasanBill = 0;
  if (umnukhH?.customerId && String(umnukhH.customerId) !== String(customerId)) {
    const r = await BpayBill(kholbolt).updateMany(
      { baiguullagiinId: orgId, gereeniiId: String(s.g._id), customerId: String(umnukhH.customerId), tuluv: "Төлөгдөөгүй" },
      {
        $set: { gereeniiId: "" },
        $push: {
          tuukh: {
            ognoo: new Date(),
            uildel: "Холболт солигдсон",
            delgerengui: `${umnukhH.customerCode || umnukhH.customerId} → ${c.customerCode || customerId} (гэрээнээс салгав)`,
          },
        },
      },
    );
    salgasanBill = r?.modifiedCount || 0;
  }

  await BpayHolbolt(kholbolt).updateOne(
    { baiguullagiinId: orgId, gereeniiId: String(s.g._id) },
    {
      $set: {
        barilgiinId: String(s.g.barilgiinId || ""),
        gereeniiDugaar: s.g.gereeniiDugaar || "",
        toot: d,
        bpayBairId: b,
        customerId: String(customerId),
        customerCode: String(c.customerCode || ""),
        customerName: c.customerName || "",
        customerAddress: c.customerAddress || "",
        billingId,
        syncUtas: u,
        residentId: resident?._id ? String(resident._id) : "",
        salgasan: false,
        suuldAldaa: "",
      },
      $setOnInsert: { bidUusgesen },
    },
    { upsert: true },
  );

  // Тэр тоотыг шууд синк — хуулга тэр даруй бүрдэнэ
  const h = await BpayHolbolt(kholbolt).findOne({ baiguullagiinId: orgId, gereeniiId: String(s.g._id) }).select("_id").lean();
  let sync = null;
  try {
    sync = h ? await syncKhiikh(kholbolt, orgId, { holboltIdnuud: [String(h._id)] }) : null;
  } catch (e) {
    sync = { aldaa: e.message };
  }
  return { billingId, customerCode: String(c.customerCode || ""), shineBilling: bidUusgesen, salgasanBill, sync };
}

/**
 * Гараар (апп, оршин суугч өөрөө г.м.) холбосон тоотыг синкийн холболтод нэмнэ.
 *
 * `bpayHolbolt`-ийг зөвхөн «Тоот холбох» (`khayagKholbokh`) үүсгэдэг тул оршин
 * суугчийн `toots`-д бүрэн WALLET_API бичлэг (billingId, walletCustomerId, walletBairId,
 * walletDoorNo) байсан ч синк тэр тоотыг татдаггүй, хуулга хоосон харагддаг байв.
 *
 * Энд ЗӨВХӨН манай санд бичнэ — Төрийн банк руу юу ч илгээхгүй. Тааруулалт нь
 * `khayagKholbokh`-ийн 1-р алхамтай ижил (барилгын bpayBairId + хаалганы дугаар).
 *
 * Хөндөх тоот:
 *   - холболтгүй;
 *   - холболт нь алдаатай (`suuldAldaa`) эсвэл салгасан бөгөөд оршин суугч ӨӨР
 *     billingId-аар дахин холбосон (хуучин, ажиллахгүй холболтыг шинээр солино).
 * Буцаах: шинээр холбосон тоотын тоо.
 */
async function walletTootoosHolboltNokhokh(kholbolt, baiguullagiinId) {
  const orgId = String(baiguullagiinId);
  const t = await bpayTokhirgooAvya(orgId);
  if (!t?.idevkhtei) return 0;
  const bairMap = new Map(t.barilguud.filter((b) => b.bpayBairId).map((b) => [b.barilgiinId, String(b.bpayBairId)]));
  if (!bairMap.size) return 0;

  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId: orgId, tuluv: { $nin: IDEVKHGUI_GEREE } })
    .select("_id gereeniiDugaar toot barilgiinId tootTurul turul orshinSuugchId utas")
    .lean();
  const holboltMap = new Map(
    (await BpayHolbolt(kholbolt).find({ baiguullagiinId: orgId }).lean()).map((h) => [String(h.gereeniiId), h]),
  );

  // Холбох шаардлагатай байж болох гэрээнүүд
  const kholbokhGereenuud = gereenuud.filter((g) => {
    if (!tootKhevshuulekh(g.toot) || !bairMap.has(String(g.barilgiinId))) return false;
    const h = holboltMap.get(String(g._id));
    return !h || !h.billingId || !h.syncUtas || h.salgasan || !!h.suuldAldaa;
  });
  if (!kholbokhGereenuud.length) return 0;

  // Оршин суугчид — гэрээний orshinSuugchId, эсвэл гэрээний утсаар
  const mongoose = require("mongoose");
  const residents = require("../models/orshinSuugch")(db.erunkhiiKholbolt).collection;
  const idnuud = kholbokhGereenuud
    .map((g) => String(g.orshinSuugchId || ""))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const utasnuud = kholbokhGereenuud
    .map((g) => utasKhevshuulekh(Array.isArray(g.utas) ? g.utas[0] : g.utas))
    .filter(Boolean);
  const khunuud = await residents
    .find(
      { $or: [{ _id: { $in: idnuud } }, { utas: { $in: utasnuud } }] },
      { projection: { _id: 1, utas: 1, ner: 1, ovog: 1, toots: 1 } },
    )
    .toArray();
  const idgaar = new Map(khunuud.map((r) => [String(r._id), r]));
  const utasaar = new Map(khunuud.filter((r) => r.utas).map((r) => [utasKhevshuulekh(r.utas), r]));

  const { gereeniiTootTurul, OR_SUUTS } = require("../utils/zardalAngilal");
  let shine = 0;
  for (const g of kholbokhGereenuud) {
    const toot = tootKhevshuulekh(g.toot);
    const bairId = bairMap.get(String(g.barilgiinId));
    const resident =
      idgaar.get(String(g.orshinSuugchId || "")) ||
      utasaar.get(utasKhevshuulekh(Array.isArray(g.utas) ? g.utas[0] : g.utas));
    if (!resident) continue;
    const x = (Array.isArray(resident.toots) ? resident.toots : []).find(
      (tt) =>
        tt?.source === "WALLET_API" &&
        tt.billingId &&
        tt.walletCustomerId &&
        String(tt.walletBairId || "") === bairId &&
        tootKhevshuulekh(tt.walletDoorNo) === toot,
    );
    if (!x) continue;

    const h = holboltMap.get(String(g._id));
    // Алдаатай/салгасан холболтыг зөвхөн ӨӨР (шинэ) billingId-аар солино — ижил бол
    // тэр нь л ажиллахгүй байгаа холболт тул дахин бичих нь утгагүй.
    if (h && (h.salgasan || h.suuldAldaa) && String(h.billingId) === String(x.billingId)) continue;

    const utas = utasKhevshuulekh(x.walletUserId) || utasKhevshuulekh(resident.utas);
    if (!utas) continue;
    // Зөвхөн орон сууц (гараж/агуулахын гэрээг алгасна) — «Тоот холбох»-той ижил
    const turul = await gereeniiTootTurul(g).catch(() => OR_SUUTS);
    if (turul !== OR_SUUTS) continue;

    await BpayHolbolt(kholbolt).updateOne(
      { baiguullagiinId: orgId, gereeniiId: String(g._id) },
      {
        $set: {
          barilgiinId: String(g.barilgiinId || ""),
          gereeniiDugaar: g.gereeniiDugaar || "",
          toot,
          bpayBairId: bairId,
          customerId: String(x.walletCustomerId),
          customerCode: String(x.walletCustomerCode || ""),
          customerName: [resident.ovog, resident.ner].filter(Boolean).join(" "),
          customerAddress: x.bairniiNer || "",
          billingId: String(x.billingId),
          syncUtas: utas,
          residentId: String(resident._id),
          salgasan: false,
          suuldAldaa: "",
        },
        $setOnInsert: { bidUusgesen: false },
      },
      { upsert: true },
    );
    shine++;
  }
  if (shine) console.log(`[BPAY SYNC] ${orgId}: гараар холбосон ${shine} тоотыг синкийн холболтод нэмлээ`);
  return shine;
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

/**
 * Санд суурилсан түгжээ: prod, dev хоёр процесс нэг санд зэрэг синк хийхгүй.
 * Буцаах: null = өөр процесс синк хийж байна; эс бөгөөс чөлөөлөх функц.
 * Сан ашиглах боломжгүй бол (тест г.м.) зөвхөн процессын түгжээ үйлчилнэ.
 */
async function dbTugjeeAvakh(kholbolt, orgId) {
  const col = kholbolt?.kholbolt?.collection ? kholbolt.kholbolt.collection("bpaySyncTugjee") : null;
  if (!col) return async () => {};
  const odoo = new Date();
  const ezen = `${process.pid}-${odoo.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await col.findOneAndUpdate(
      { _id: orgId, $or: [{ duusakh: { $lt: odoo } }, { duusakh: { $exists: false } }] },
      { $set: { duusakh: new Date(odoo.getTime() + SYNC_TUGJEE_MS), ezen, pid: process.pid } },
      { upsert: true },
    );
  } catch (e) {
    if (e && e.code === 11000) return null; // өөр процесс эзэмшиж байна
    console.error("[BPAY SYNC] түгжээ авахад алдаа:", e.message);
    return async () => {};
  }
  return async () => {
    await col.updateOne({ _id: orgId, ezen }, { $set: { duusakh: new Date(0) } }).catch(() => null);
  };
}

async function syncKhiikh(kholbolt, baiguullagiinId, opts = {}) {
  const k = String(baiguullagiinId);
  if (syncTugjsun.has(k)) return { zavgui: true };
  syncTugjsun.add(k);
  let chuluulukh = null;
  try {
    chuluulukh = await dbTugjeeAvakh(kholbolt, k);
    if (!chuluulukh) return { zavgui: true };
    return await syncKhiikhDotood(kholbolt, baiguullagiinId, opts);
  } finally {
    syncTugjsun.delete(k);
    if (chuluulukh) await chuluulukh();
  }
}

async function syncKhiikhDotood(kholbolt, baiguullagiinId, { albadakh = false, holboltIdnuud = null } = {}) {
  const t = await bpayTokhirgooAvya(baiguullagiinId);
  if (!t?.idevkhtei) return { algassan: true };
  const orgId = String(baiguullagiinId);
  const Bill = BpayBill(kholbolt);
  // Бүтэн синкийн өмнө гараар холбосон тоотуудыг холболтод нэмнэ (зөвхөн манай сан).
  // Алдаа гарсан ч синк үргэлжилнэ.
  let garaarNemsen = 0;
  if (!holboltIdnuud) {
    garaarNemsen = await walletTootoosHolboltNokhokh(kholbolt, orgId).catch((e) => {
      console.error(`[BPAY SYNC] ${orgId}: гараар холбосныг нэмэхэд алдаа:`, e.message);
      return 0;
    });
  }
  // Холболт бүрийг тэр тоотын оршин суугчийн өөрийн утсаар (syncUtas) татна.
  const holboltuud = (await BpayHolbolt(kholbolt).find({ baiguullagiinId: orgId, billingId: { $ne: "" } }).lean())
    .filter((h) => h.syncUtas && !h.salgasan)
    .filter((h) => !holboltIdnuud || holboltIdnuud.includes(String(h._id)));
  const odoo = new Date();
  const tailan = { holbolt: holboltuud.length, garaarNemsen, amjilttai: 0, aldaatai: 0, shineBill: 0, dakhinGarsan: 0, tulsun: 0, khuleegdej: 0, zogsoson: false, sanuulga: "" };

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
      let doc = await Bill.findOne({ baiguullagiinId: orgId, tulkhuur });
      if (!doc && b.billId) {
        // Тухайн сард билл нэмэгдсэн/хасагдсанаар түлхүүр ("код|сар" ↔ "код|сар|billId")
        // солигдсон бол хуучин бичлэгийг billId-аар олж түлхүүрийг шилжүүлнэ — эс тэгвээс
        // хуучин нь "алга болсон = төлсөн" болж, ижил билл давхар үүснэ.
        const umnukhDoc = await Bill.findOne({
          baiguullagiinId: orgId,
          customerId: h.customerId,
          sar: b.sar,
          billId: b.billId,
        });
        if (umnukhDoc) {
          await Bill.updateOne({ _id: umnukhDoc._id }, { $set: { tulkhuur } });
          doc = { ...umnukhDoc, tulkhuur };
        }
      }
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
  // Хангалттай удаа БА хангалттай удаан алга байсан эсэх (нотолгоогүй үед).
  const khangalttaiAlga = ({ doc }) =>
    (doc.algaToo || 0) + 1 >= ALGA_BOSGO &&
    !!doc.algaEkhelsen &&
    odoo.getTime() - new Date(doc.algaEkhelsen).getTime() >= ALGA_KHUGATSAA_MS;
  const tulukhNer = algaNer.filter((x) => !notolgoo(x) && khangalttaiAlga(x));
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
    if (!nottoi && !khangalttaiAlga(x)) {
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

/**
 * Холбогдоогүй орон сууцны тоотууд (бүх барилга) — шалтгаантай.
 * Шалтгаан: сүүлийн «Тоот холбох»-ын үр дүн (санах ойд) → холболтын сүүлийн алдаа → «Холбож үзээгүй».
 */
async function kholbogdooguiJagsaalt(kholbolt, baiguullagiinId, { bugd = false } = {}) {
  const orgId = String(baiguullagiinId);
  const t = await bpayTokhirgooAvya(orgId);
  if (!t) throw new Error("Байгууллага олдсонгүй");
  const barilgaMap = new Map(t.barilguud.map((b) => [b.barilgiinId, b]));
  const { gereeniiTootTurul, OR_SUUTS } = require("../utils/zardalAngilal");
  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId: orgId, tuluv: { $nin: IDEVKHGUI_GEREE } })
    .select("_id gereeniiDugaar toot barilgiinId tootTurul turul orshinSuugchId khariltsagchId ovog ner utas")
    .lean();
  const turluud = await zeregAjilluulakh(gereenuud, 10, (g) =>
    tootKhevshuulekh(g.toot) ? gereeniiTootTurul(g).catch(() => OR_SUUTS) : null,
  );
  const holboltuud = await BpayHolbolt(kholbolt).find({ baiguullagiinId: orgId }).lean();
  const holboltMap = new Map(holboltuud.map((h) => [String(h.gereeniiId), h]));
  const suuliinUr = ajilTuluv.get(`${orgId}:kholbokh`)?.ur?.shaltgaan || {};

  const jagsaalt = [];
  for (const [n, g] of gereenuud.entries()) {
    const toot = tootKhevshuulekh(g.toot);
    if (!toot || turluud[n] !== OR_SUUTS) continue;
    const h = holboltMap.get(String(g._id));
    const kholbogdson = !!(h && h.billingId && h.syncUtas && !h.salgasan);
    if (kholbogdson && !bugd) continue; // холбогдсон (bugd=true үед бүгдийг буцаана)
    const barilga = barilgaMap.get(String(g.barilgiinId));
    let shaltgaan;
    if (kholbogdson) shaltgaan = h.suuldAldaa ? `Холбогдсон · синк алдаа: ${h.suuldAldaa}` : "Холбогдсон";
    else if (h?.salgasan) shaltgaan = "Оршин суугч хаягаа салгасан";
    else if (!barilga?.bpayBairId) shaltgaan = "Барилгад банкны хаяг тохируулаагүй";
    else shaltgaan = suuliinUr[String(g._id)] || h?.suuldAldaa || "Холбож үзээгүй";
    jagsaalt.push({
      gereeniiId: String(g._id),
      barilga: barilga?.ner || "",
      toot,
      gereeniiDugaar: g.gereeniiDugaar || "",
      ner: [g.ovog, g.ner].filter(Boolean).join(" "),
      utas: Array.isArray(g.utas) ? g.utas.filter(Boolean).join(", ") : String(g.utas || ""),
      shaltgaan,
      kholbogdson,
      customerCode: kholbogdson ? h.customerCode || "" : "",
      customerName: kholbogdson ? h.customerName || "" : "",
      syncUtas: kholbogdson ? h.syncUtas || "" : "",
      suuldSync: kholbogdson ? h.suuldSync || null : null,
    });
  }
  jagsaalt.sort(
    (a, b) =>
      a.barilga.localeCompare(b.barilga) ||
      (parseInt(a.toot, 10) || 0) - (parseInt(b.toot, 10) || 0) ||
      a.toot.localeCompare(b.toot),
  );
  return jagsaalt;
}

async function kholbokhAjilEkhluulekh(kholbolt, baiguullagiinId) {
  const ajil = ajilEkhluulekh(String(baiguullagiinId), "kholbokh");
  if (!ajil) return { ajillajBaina: true };
  khayagKholbokh(kholbolt, baiguullagiinId, ajil)
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
  // Сар нь "2026-7" хэлбэртэй тул санд текстээр эрэмбэлбэл буруу — энд дүүргэсэн түлхүүрээр.
  const billuud = (
    await BpayBill(kholbolt)
      .find({ baiguullagiinId: String(geree.baiguullagiinId), gereeniiId: String(gereeniiId) })
      .lean()
  ).sort(
    (a, b) =>
      sarTulkhuur(b.sar).localeCompare(sarTulkhuur(a.sar)) || String(a.billId || "").localeCompare(String(b.billId || "")),
  );
  const { calculateGereeCharges } = require("./invoiceService");
  const sar = [];
  // Бүх сарын билл буцна (нийт дүн жагсаалтын үлдэгдэлтэй таарна); задаргааг сүүлийн saruudToo сард л тооцно.
  for (const [i, b] of billuud.entries()) {
    const [on, m] = String(b.sar || "").split("-").map(Number);
    let zadargaa = [];
    if (i < saruudToo && on && m) {
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
      id: String(b._id || ""),
      sar: sarTulkhuur(b.sar),
      tuluv: b.tuluv,
      dun: b.dun,
      aldangi: b.aldangi,
      aldangitaiDun: b.aldangitaiDun,
      tulsunOgnoo: b.tulsunOgnoo || null,
      tulsunDun: b.tulsunDun ?? null,
      tulburiinEkhSurvalj: b.tulburiinEkhSurvalj || "",
      nuusan: !!b.nuusan,
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
  kholbogdooguiJagsaalt,
  syncKhiikh,
  walletTootoosHolboltNokhokh,
  garaarKhaikh,
  garaarKholbokh,
  bukhSyncKhiikh,
  tulburiinDaraaSync,
  syncAjilEkhluulekh,
  kholbokhAjilEkhluulekh,
  ajliinTuluvAvya,
  zadargaaAvya,
  sarTulkhuur,
  /** Зөвхөн тестэд: алга болсон хугацааны босго */
  _algaKhugatsaaTokhiruulakh: (ms) => {
    ALGA_KHUGATSAA_MS = ms;
  },
  bairKhaikh,
  utasKhevshuulekh,
};
