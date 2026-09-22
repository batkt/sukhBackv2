/**
 * Хэтэвчний (Wallet) тайлан — zevtabs админы «Amarhome» цэсэнд зориулсан
 * ГАНЦ уншдаг endpoint.
 *
 *   GET /walletTailan
 *
 * Юуг хардаг вэ:
 *
 *   1. ХЭТЭВЧНИЙ хэрэглэгч (`toots[].source === "WALLET_API"`) — өөрөөр хэлбэл
 *      bpay/хэтэвчээр орж ирсэн хүмүүс. Байгууллага өөрөө excel-ээр оруулсан
 *      `OWN_ORG` оршин суугчид энд ОГТ тоологдохгүй.
 *
 *   2. ЖИНХЭНЭ төлөгдсөн гүйлгээ — байгууллага бүрийн баазын
 *      `QuickQpayObject` дотор `source: "WALLET_QPAY"`, `tulsunEsekh: true`
 *      болсон мөрүүд. Энэ бол мөнгө нь бодитоор орсон бичлэг; нэхэмжлэх
 *      үүссэн ч төлөгдөөгүй мөр энд гарахгүй.
 *
 * Яагаад олон бааз руу ханддаг вэ:
 *
 *   Хэтэвчний хэрэглэгч, нэхэмжлэх нь НЭГДСЭН баазад (`db.erunkhiiKholbolt`)
 *   хадгалагддаг ч төлбөрийн баримт нь байгууллага тус бүрийн ТУСДАА баазад
 *   ордог. Тиймээс нэг query-гээр бүгдийг авах боломжгүй — бааз бүрээс нь
 *   татаад энд нийлүүлж, эрэмбэлж, хуудаслана.
 *
 * Хандалт:
 *
 *   - Сервисийн түлхүүртэй (`x-wallet-tailan-token`) бол БҮХ байгууллагыг
 *     хардаг. udirdlagaBack энэ замаар дамжина.
 *   - zevtabs-ийн мастер ажилтан ч бүгдийг хардаг.
 *   - Ердийн ажилтны токеноор ирвэл зөвхөн ӨӨРИЙН байгууллагаа хардаг.
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");
const { QuickQpayObject } = require("quickqpaypackvSukh");

const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const Ajiltan = require("../models/ajiltan");
const WalletInvoice = require("../models/walletInvoice");
const WalletPayment = require("../models/walletPayment");
const { ZEVTABS_MASTER_NER } = require("../controller/ajiltan");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/** Хэтэвчээр үүссэн QPay баримтыг ялгах тэмдэг (walletQpayController тавьдаг). */
const WALLET_QPAY_SOURCE = "WALLET_QPAY";

/** Хэтэвчээр бүртгэгдсэн хаягийн эх сурвалж. */
const WALLET_TOOT_SOURCE = "WALLET_API";

/**
 * Нэг баазаас татах мөрийн дээд хязгаар.
 *
 * Хязгааргүй бол хэдэн жилийн гүйлгээг санах ойд нийлүүлэх болно. Таслагдсан
 * тохиолдолд хариунд `tasarsanEsekh: true` гэж хэлнэ — админ огнооны шүүлтээ
 * нарийсгаж бүрэн дүр зургийг харна.
 */
const NEG_BAAZIIN_DEED = 5000;

/** Хэдэн баазыг зэрэг уншихыг хязгаарлана — баазад огцом ачаалал өгөхгүй. */
const ZEREGTSEE = 8;

/* ─── СЕРВИСИЙН ТОКЕН ──────────────────────────────────────────────────────
 *
 * Цэвэрлэгээнийхтэй яг ижил зарчим: хугацаагүй, зөвхөн сервер хооронд явдаг,
 * хөтөч рүү хэзээ ч гардаггүй түлхүүр. Утгыг эх кодонд бичихгүй — зөвхөн
 * орчны хувьсагчаар өгнө.
 *
 * `WALLET_TAILAN_SERVICE_TOKEN` тохируулаагүй бол цэвэрлэгээнийхийг нөөцөөр
 * авна. Ингэснээр орчны тохиргоо хийлгүйгээр ажиллана, гэхдээ тэр түлхүүрийн
 * эрх нь өргөжинө — тусад нь салгах нь ЗӨВ. Хоёулаа хоосон бол сервисийн зам
 * хаалттай үлдэж, ердийн ажилтны токен руу шилжинэ (хаалттай суурь).
 *
 * ДУУДАХ ҮЕД нь уншина, модуль ачаалах үед биш — `dotenv.config()`-ийн
 * дараалал өөрчлөгдвөл чимээгүй хоосон болохоос сэргийлэв.
 */
const servisTulkhuurAvya = () =>
  process.env.WALLET_TAILAN_SERVICE_TOKEN ||
  process.env.TSEVERLEGEE_SERVICE_TOKEN ||
  "";

/** Тэнцүү хугацаанд харьцуулна — `===` нь түлхүүрийг таах зай үлдээдэг. */
function tulkhuurTaaravUu(irsen, khadgalsan) {
  if (!irsen || !khadgalsan) return false;
  const a = Buffer.from(String(irsen));
  const b = Buffer.from(String(khadgalsan));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const servisMuUu = (req) =>
  tulkhuurTaaravUu(req.headers["x-wallet-tailan-token"], servisTulkhuurAvya());

/**
 * Сервисийн түлхүүртэй бол `tokenShalgakh`-г алгасана — тэр нь
 * `baiguullagiinId`-г токеноос дарж бичдэг тул бусад байгууллага харагдахгүй
 * болгоно.
 */
function walletTailanKhandalt(req, res, next) {
  if (servisMuUu(req)) {
    if (!req.body) req.body = {};
    return next();
  }
  return tokenShalgakh(req, res, next);
}

/** Дуудсан ажилтан zevtabs-ийн мастер мөн эсэх. */
async function masterMuUu(req) {
  const nevtersen = req.body?.nevtersenAjiltniiToken;
  if (!nevtersen?.id) return false;
  const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
    .findById(nevtersen.id)
    .lean()
    .catch(() => null);
  return ajiltan?.nevtrekhNer === ZEVTABS_MASTER_NER;
}

/** Огноог Date болгоно, буруу бол null. */
function ognooBolgoyo(utga) {
  if (!utga) return null;
  const ognoo = new Date(utga);
  return Number.isNaN(ognoo.getTime()) ? null : ognoo;
}

/** Хэрэглэгчийн бичсэн текстийг regex-д аюулгүй болгоно. */
const regexTsevershuuley = (utga) =>
  String(utga)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Багцлан зэрэг дуудна.
 *
 * Бүх баазыг нэг дор уншвал холболтын цөөрөм дүүрэх тул хэсэгчлэн явуулна.
 */
async function bagtsalanDuudya(jagsaalt, ajil) {
  const urDun = [];
  for (let i = 0; i < jagsaalt.length; i += ZEREGTSEE) {
    const bagts = jagsaalt.slice(i, i + ZEREGTSEE);
    urDun.push(...(await Promise.all(bagts.map(ajil))));
  }
  return urDun;
}

/**
 * Хамрах баазуудыг тодорхойлно.
 *
 * `undsenBaaz` (нэгдсэн бааз) нь байгууллагынх биш тул хасна — түүнд
 * `baiguullagiinId` байхгүй.
 */
function baazuudAvya(baiguullagiinId) {
  if (baiguullagiinId) {
    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    return kholbolt ? [kholbolt] : [];
  }
  return (db.kholboltuud || []).filter((k) => !!k.baiguullagiinId);
}

/** Нэг бааз унасан ч бусдынх нь харагдах ёстой — алдааг залгиж null буцаана. */
async function aldaaTeswerteiDuudya(kholbolt, duudlaga) {
  try {
    return await duudlaga();
  } catch (error) {
    console.error("[walletTailan] бааз алгасав:", {
      baaz: kholbolt?.baaziinNer,
      baiguullagiinId: String(kholbolt?.baiguullagiinId || ""),
      message: error?.message,
    });
    return null;
  }
}

/* ─── ҮНДСЭН ЗАМ ───────────────────────────────────────────────────────── */

router.get("/walletTailan", walletTailanKhandalt, async (req, res, next) => {
  try {
    const {
      ekhlekhOgnoo,
      duusakhOgnoo,
      search,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 50,
    } = req.query || {};

    /* ── 1. Хэнийг харах эрхтэй вэ ── */

    const bukhiigKharakhErkhtei = servisMuUu(req) || (await masterMuUu(req));

    // tokenShalgakh нь ердийн ажилтны `req.body.baiguullagiinId`-г токеноос
    // дарж бичдэг тул энэ нь эрхгүй хүний хувьд цорын ганц эх сурвалж.
    let shuuhBaiguullagiinId = bukhiigKharakhErkhtei
      ? req.query?.baiguullagiinId || null
      : req.body?.baiguullagiinId || null;

    if (!bukhiigKharakhErkhtei && !shuuhBaiguullagiinId)
      return res.status(403).json({
        success: false,
        message: "Бүх байгууллагын хэтэвчний тайлан харах эрх байхгүй байна",
      });

    if (shuuhBaiguullagiinId)
      shuuhBaiguullagiinId = String(shuuhBaiguullagiinId);

    const baazuud = baazuudAvya(shuuhBaiguullagiinId);
    if (shuuhBaiguullagiinId && !baazuud.length)
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });

    /* ── 2. Байгууллагын нэрсийг нэгдсэн баазаас нэг удаа авна ── */

    const baiguullaguud = await Baiguullaga(db.erunkhiiKholbolt)
      .find(shuuhBaiguullagiinId ? { _id: shuuhBaiguullagiinId } : {})
      .select("ner register")
      .lean()
      .catch(() => []);

    const baiguullagiinNer = new Map(
      baiguullaguud.map((b) => [String(b._id), b.ner || ""]),
    );

    /* ── 3. Бааз бүрээс ЖИНХЭНЭ төлөгдсөн хэтэвчний баримтыг татна ── */

    const ekhlekh = ognooBolgoyo(ekhlekhOgnoo);
    const duusakh = ognooBolgoyo(duusakhOgnoo);

    const barimtiinShuult = {
      source: WALLET_QPAY_SOURCE,
      tulsunEsekh: true,
    };
    if (ekhlekh || duusakh) {
      barimtiinShuult.ognoo = {};
      if (ekhlekh) barimtiinShuult.ognoo.$gte = ekhlekh;
      if (duusakh) barimtiinShuult.ognoo.$lte = duusakh;
    }

    let tasarsanEsekh = false;

    const baazuudiinKhariu = await bagtsalanDuudya(baazuud, (kholbolt) =>
      aldaaTeswerteiDuudya(kholbolt, async () => {
        const barimtuud = await QuickQpayObject(kholbolt)
          .find(barimtiinShuult)
          .select(
            "baiguullagiinId barilgiinId zakhialgiinDugaar ognoo payment_id legacy_id invoice_id walletPaymentId walletInvoiceId gereeniiId qpay.amount qpay.description",
          )
          .sort({ ognoo: -1 })
          // Таслагдсаныг мэдэхийн тулд нэгээр илүү татна.
          .limit(NEG_BAAZIIN_DEED + 1)
          .lean();

        if (barimtuud.length > NEG_BAAZIIN_DEED) {
          tasarsanEsekh = true;
          barimtuud.length = NEG_BAAZIIN_DEED;
        }

        const orgId = String(kholbolt.baiguullagiinId || "");
        return barimtuud.map((m) => ({
          ...m,
          // Баримт дээрх утга дутуу байж болох тул баазынхаа id-г түшинэ.
          baiguullagiinId: String(m.baiguullagiinId || orgId),
        }));
      }),
    );

    const barimtuud = baazuudiinKhariu.filter(Boolean).flat();

    /* ── 4. Нэгдсэн баазаас нэхэмжлэх, төлбөрийн дэлгэрэнгүйг нөхнө ── */

    const walletPaymentIds = Array.from(
      new Set(barimtuud.map((b) => b.walletPaymentId).filter(Boolean)),
    );
    const walletInvoiceIds = Array.from(
      new Set(barimtuud.map((b) => b.walletInvoiceId).filter(Boolean)),
    );

    const [nekhemjlekhuud, tulburiinDelgerengui] = await Promise.all([
      walletPaymentIds.length || walletInvoiceIds.length
        ? WalletInvoice(db.erunkhiiKholbolt)
            .find({
              $or: [
                { walletPaymentId: { $in: walletPaymentIds } },
                { walletInvoiceId: { $in: walletInvoiceIds } },
              ],
            })
            .lean()
            .catch(() => [])
        : [],
      walletPaymentIds.length
        ? WalletPayment(db.erunkhiiKholbolt)
            .find({ paymentId: { $in: walletPaymentIds } })
            .select(
              "paymentId userId orshinSuugchId qpayPaymentId trxDate trxNo trxDescription amount receiverBankCode receiverAccountNo receiverAccountName status",
            )
            .lean()
            .catch(() => [])
        : [],
    ]);

    const nekhemjlekhByPaymentId = new Map();
    const nekhemjlekhByInvoiceId = new Map();
    nekhemjlekhuud.forEach((n) => {
      if (n.walletPaymentId && !nekhemjlekhByPaymentId.has(n.walletPaymentId))
        nekhemjlekhByPaymentId.set(n.walletPaymentId, n);
      if (n.walletInvoiceId && !nekhemjlekhByInvoiceId.has(n.walletInvoiceId))
        nekhemjlekhByInvoiceId.set(n.walletInvoiceId, n);
    });

    const tulburByPaymentId = new Map(
      tulburiinDelgerengui.map((t) => [t.paymentId, t]),
    );

    /* ── 5. Оршин суугчийн нэр, утсыг нэг багц query-гээр нөхнө ── */

    const orshinSuugchiinIduud = Array.from(
      new Set(
        [
          ...nekhemjlekhuud.map((n) => n.orshinSuugchId),
          ...tulburiinDelgerengui.map((t) => t.orshinSuugchId),
        ].filter(Boolean),
      ),
    );

    const orshinSuugchid = orshinSuugchiinIduud.length
      ? await OrshinSuugch(db.erunkhiiKholbolt)
          .find({ _id: { $in: orshinSuugchiinIduud } })
          .select("ner ovog utas toots.toot toots.walletDoorNo toots.source")
          .lean()
          .catch(() => [])
      : [];

    const orshinSuugchMap = new Map(
      orshinSuugchid.map((o) => [String(o._id), o]),
    );

    /* ── 6. Мөр бүрийг нэг хэлбэрт оруулна ── */

    const murnuud = barimtuud.map((b) => {
      const nekhemjlekh =
        (b.walletPaymentId && nekhemjlekhByPaymentId.get(b.walletPaymentId)) ||
        (b.walletInvoiceId && nekhemjlekhByInvoiceId.get(b.walletInvoiceId)) ||
        null;
      const tulbur =
        (b.walletPaymentId && tulburByPaymentId.get(b.walletPaymentId)) || null;

      const orshinSuugchId =
        tulbur?.orshinSuugchId || nekhemjlekh?.orshinSuugchId || "";
      const orshinSuugch = orshinSuugchId
        ? orshinSuugchMap.get(String(orshinSuugchId))
        : null;

      const walletToot = (orshinSuugch?.toots || []).find(
        (t) => t?.source === WALLET_TOOT_SOURCE,
      );

      const baiguullagiinIdStr = String(b.baiguullagiinId || "");

      return {
        _id: String(b._id),
        baiguullagiinId: baiguullagiinIdStr,
        baiguullagiinNer: baiguullagiinNer.get(baiguullagiinIdStr) || "",
        barilgiinId: b.barilgiinId || "",

        // Хэтэвчний талын танигчид
        walletPaymentId: b.walletPaymentId || "",
        walletInvoiceId: b.walletInvoiceId || "",
        billingId: nekhemjlekh?.billingId || "",
        zakhialgiinDugaar:
          b.zakhialgiinDugaar || nekhemjlekh?.zakhialgiinDugaar || "",

        // Хэрэглэгч
        userId: tulbur?.userId || nekhemjlekh?.userId || "",
        orshinSuugchId: orshinSuugchId ? String(orshinSuugchId) : "",
        orshinSuugchiinNer:
          `${orshinSuugch?.ovog || ""} ${orshinSuugch?.ner || ""}`.trim() ||
          nekhemjlekh?.customerName ||
          "",
        utas: orshinSuugch?.utas || nekhemjlekh?.userId || "",
        toot: walletToot?.toot || walletToot?.walletDoorNo || "",
        khayag: nekhemjlekh?.customerAddress || "",
        billingName: nekhemjlekh?.billingName || "",

        // Мөнгө. QPay-ийн дүн нь бодитоор татагдсан дүн тул түүнийг түрүүлнэ.
        dun: Number(
          b.qpay?.amount ?? tulbur?.amount ?? nekhemjlekh?.totalAmount ?? 0,
        ),
        tailbar: b.qpay?.description || tulbur?.trxDescription || "",

        // QPay баримт
        qpayPaymentId: tulbur?.qpayPaymentId || b.payment_id || "",
        trxNo: tulbur?.trxNo || b.legacy_id || "",
        invoiceId: b.invoice_id || "",
        khuleenAvsanBank: tulbur?.receiverBankCode || "",
        khuleenAvsanDans: tulbur?.receiverAccountNo || "",
        khuleenAvsanDansniiNer: tulbur?.receiverAccountName || "",

        tulsunOgnoo: tulbur?.trxDate || b.ognoo || null,
        ognoo: b.ognoo || null,
        tuluv: tulbur?.status || "PAID",
        tulsunEsekh: true,
      };
    });

    /* ── 7. Хайлт ── */

    let shuusenMurnuud = murnuud;
    if (search && String(search).trim()) {
      const rx = new RegExp(regexTsevershuuley(search), "i");
      shuusenMurnuud = murnuud.filter((m) =>
        [
          m.orshinSuugchiinNer,
          m.userId,
          m.utas,
          m.toot,
          m.zakhialgiinDugaar,
          m.walletPaymentId,
          m.qpayPaymentId,
          m.trxNo,
          m.baiguullagiinNer,
          m.khayag,
        ].some((utga) => utga && rx.test(String(utga))),
      );
    }

    shuusenMurnuud.sort(
      (a, b) =>
        new Date(b.tulsunOgnoo || b.ognoo || 0) -
        new Date(a.tulsunOgnoo || a.ognoo || 0),
    );

    /* ── 8. Хэтэвчний хэрэглэгчийн тоо (OWN_ORG-ийг оруулахгүй) ── */

    const khereglegchiinShuult = {
      "toots.source": WALLET_TOOT_SOURCE,
      // Гэр бүлийн гишүүн нь үндсэн эзэмшигчийн хаягийг л уншдаг тул давхар
      // тоологдохгүйн тулд хасна.
      undsenId: { $in: [null, ""] },
    };

    const khereglegchBulgeluud = await OrshinSuugch(db.erunkhiiKholbolt)
      .aggregate([
        { $match: khereglegchiinShuult },
        { $unwind: "$toots" },
        {
          $match: {
            "toots.source": WALLET_TOOT_SOURCE,
            ...(shuuhBaiguullagiinId
              ? { "toots.baiguullagiinId": shuuhBaiguullagiinId }
              : {}),
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$toots.baiguullagiinId", ""] },
            khereglegchid: { $addToSet: "$_id" },
            tootniiToo: { $sum: 1 },
          },
        },
      ])
      .catch(() => []);

    // Нэг хэрэглэгч олон байгууллагад тоотой байж болно — нийт тоог бүлгүүдийн
    // нийлбэрээр бус, ДАВХАРДАЛГҮЙГЭЭР тоолно.
    const niitKhereglegch = shuuhBaiguullagiinId
      ? await OrshinSuugch(db.erunkhiiKholbolt)
          .countDocuments({
            ...khereglegchiinShuult,
            toots: {
              $elemMatch: {
                source: WALLET_TOOT_SOURCE,
                baiguullagiinId: shuuhBaiguullagiinId,
              },
            },
          })
          .catch(() => 0)
      : await OrshinSuugch(db.erunkhiiKholbolt)
          .countDocuments(khereglegchiinShuult)
          .catch(() => 0);

    /* ── 9. Байгууллагаар задалсан нэгтгэл ── */

    const baiguullagaar = new Map();
    const baiguullagiinMur = (id) => {
      const tulkhuur = String(id || "");
      if (!baiguullagaar.has(tulkhuur))
        baiguullagaar.set(tulkhuur, {
          baiguullagiinId: tulkhuur,
          baiguullagiinNer: baiguullagiinNer.get(tulkhuur) || "",
          khereglegch: 0,
          tootniiToo: 0,
          tulsunGuilgee: 0,
          tulsunDun: 0,
          tulsunKhereglegch: 0,
        });
      return baiguullagaar.get(tulkhuur);
    };

    khereglegchBulgeluud.forEach((b) => {
      const mur = baiguullagiinMur(b._id);
      mur.khereglegch = (b.khereglegchid || []).length;
      mur.tootniiToo = b.tootniiToo || 0;
    });

    const baiguullagiinKhereglegchid = new Map();
    shuusenMurnuud.forEach((m) => {
      const mur = baiguullagiinMur(m.baiguullagiinId);
      mur.tulsunGuilgee += 1;
      mur.tulsunDun += m.dun || 0;

      const tulkhuur = String(m.baiguullagiinId || "");
      if (!baiguullagiinKhereglegchid.has(tulkhuur))
        baiguullagiinKhereglegchid.set(tulkhuur, new Set());
      const khereglegch = m.orshinSuugchId || m.userId;
      if (khereglegch) baiguullagiinKhereglegchid.get(tulkhuur).add(khereglegch);
    });
    baiguullagiinKhereglegchid.forEach((olonlog, tulkhuur) => {
      baiguullagiinMur(tulkhuur).tulsunKhereglegch = olonlog.size;
    });

    const baiguullagiinJagsaalt = Array.from(baiguullagaar.values()).sort(
      (a, b) => b.tulsunDun - a.tulsunDun,
    );

    /* ── 10. Хуудаслалт ── */

    const khuudas = Math.max(1, Number(khuudasniiDugaar) || 1);
    const khemjee = Math.min(500, Math.max(1, Number(khuudasniiKhemjee) || 50));
    const ekhlel = (khuudas - 1) * khemjee;

    const niitDun = shuusenMurnuud.reduce((d, m) => d + (m.dun || 0), 0);
    const tulsunKhereglegchid = new Set(
      shuusenMurnuud.map((m) => m.orshinSuugchId || m.userId).filter(Boolean),
    );

    return res.status(200).json({
      success: true,
      data: {
        khuraangui: {
          niitKhereglegch,
          niitToot: khereglegchBulgeluud.reduce(
            (d, b) => d + (b.tootniiToo || 0),
            0,
          ),
          tulsunKhereglegch: tulsunKhereglegchid.size,
          tulsunGuilgee: shuusenMurnuud.length,
          tulsunDun: niitDun,
          baiguullagiinToo: baiguullagiinJagsaalt.filter(
            (b) => b.tulsunGuilgee > 0,
          ).length,
          // Аль нэг баазын мөр таслагдсан бол дүн бүрэн биш гэдгийг хэлнэ.
          tasarsanEsekh,
        },
        baiguullagaar: baiguullagiinJagsaalt,
        tulburuud: {
          jagsaalt: shuusenMurnuud.slice(ekhlel, ekhlel + khemjee),
          khuudasniiDugaar: khuudas,
          khuudasniiKhemjee: khemjee,
          niitMur: shuusenMurnuud.length,
          niitKhuudas: Math.ceil(shuusenMurnuud.length / khemjee),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
