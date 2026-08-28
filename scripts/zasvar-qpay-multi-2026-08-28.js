/**
 * Нэг удаагийн засвар: олон нэхэмжлэхийн QPay төлөлтөөс дутуу үлдсэн
 * нэхэмжлэхийг жинхэнэ callback-аар дахин боловсруулна.
 *
 * АСУУДАЛ
 *   2026-08-28-нд гэрээ ГД-71820453 дээр 4 болон 5-р сарын нэхэмжлэхийг
 *   НЭГ QPay төлөлтөөр (200,512.58₮) төлсөн. Гэвч давхардлын шалгалтын
 *   түлхүүр (bankniiGuilgeeId) хоёуланд нь ижил qpayInvoiceId дээр буусан
 *   тул 2 дахь (5-р сарын) нэхэмжлэх "аль хэдийн бүртгэгдсэн" гэж
 *   алгасагдаж, 88,175₮ огт бүртгэгдээгүй үлдсэн.
 *
 *   Кодын алдааг routes/qpayRoute.js дотор зассан. Энэ скрипт нь ЗӨВХӨН
 *   аль хэдийн болчихсон тэр нэг гүйлгээг нөхөж бүртгэнэ.
 *
 * ЯАГААД CALLBACK-ЫГ ДАХИН ДУУДДАГ ВЭ
 *   Гараар ledger мөр нэмэх нь хангалтгүй - нэхэмжлэхийн төлөв, банкны
 *   гүйлгээ, e-баримт бүгд callback дотор үүсдэг. Тиймээс QuickQpayObject-ийн
 *   түгжээг тайлж, жинхэнэ handler-ыг дахин ажиллуулна.
 *
 *   1-р нэхэмжлэх нь tuluv === "Төлсөн" тул handler-ийн ЭХНИЙ хамгаалалтад
 *   баригдаж алгасагдана - давхар төлөлт, давхар e-баримт үүсэхгүй. Скрипт
 *   үүнийг ажиллахаас ӨМНӨ шалгаж, зөрвөл зогсоно.
 *
 * ХЭРЭГЛЭЭ
 *   Шалгах (юу ч бичихгүй):
 *     node scripts/zasvar-qpay-multi-2026-08-28.js
 *   Түгжээ тайлах (дараа нь callback-ыг curl-ээр дуудна):
 *     node scripts/zasvar-qpay-multi-2026-08-28.js --fix
 *   Дүнг шалгах:
 *     node scripts/zasvar-qpay-multi-2026-08-28.js --shalgakh
 *
 * ЖИЧ: Backend дээр qpayRoute.js-ийн засвар ОРСОН байх ёстой. Эс бөгөөс
 * дахин ажиллуулахад мөн л ижил түлхүүр дээр буугаад алгасагдана.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../tokhirgoo/tokhirgoo.env"),
});
const { db } = require("zevbackv2");

const BAIGUULLAGIIN_ID = "697c70e81e782d8110d3b064";
const NEKHEMJLEKH_1 = "69e997b999e8cc8abafaa936"; // 4-р сар, төлөгдсөн
const NEKHEMJLEKH_2 = "6a0c97507fa9351029bc42df"; // 5-р сар, ДУТУУ
const QPAY_INVOICE_ID = "359929c2-14fe-48ac-95d4-07bf0307f185";

const mur = (x) => console.log(x);

async function main() {
  const fixMode = process.argv.includes("--fix");
  const shalgakhMode = process.argv.includes("--shalgakh");

  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  mur("🔌 Өгөгдлийн сан руу холбогдож байна...");
  await db.kholboltUusgey(null, MONGODB_URI);
  await new Promise((r) => setTimeout(r, 3000));

  const kholbolt = db.kholboltuud.find(
    (a) => String(a.baiguullagiinId) === BAIGUULLAGIIN_ID,
  );
  if (!kholbolt) {
    console.error("❌ Байгууллагын холболт олдсонгүй:", BAIGUULLAGIIN_ID);
    process.exit(1);
  }

  const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
  const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
  const { QuickQpayObject } = require("quickqpaypackvSukh");

  const Nekh = nekhemjlekhiinTuukh(kholbolt);
  const Ledger = GuilgeeAvlaguud(kholbolt);
  const Qpay = QuickQpayObject(kholbolt);

  const [nekh1, nekh2, qpayObj] = await Promise.all([
    Nekh.findById(NEKHEMJLEKH_1).lean(),
    Nekh.findById(NEKHEMJLEKH_2).lean(),
    Qpay.findOne({ invoice_id: QPAY_INVOICE_ID }).lean(),
  ]);

  mur("\n─── ОДООГИЙН ТӨЛӨВ ───────────────────────────────");
  mur(
    `4-р сар  ${NEKHEMJLEKH_1}\n` +
      `   төлөв: ${nekh1?.tuluv ?? "ОЛДСОНГҮЙ"}   нийт: ${nekh1?.niitTulbur}   төлсөн: ${nekh1?.tulsunDun}`,
  );
  mur(
    `5-р сар  ${NEKHEMJLEKH_2}\n` +
      `   төлөв: ${nekh2?.tuluv ?? "ОЛДСОНГҮЙ"}   нийт: ${nekh2?.niitTulbur}   төлсөн: ${nekh2?.tulsunDun}`,
  );
  mur(
    `QPay     ${QPAY_INVOICE_ID}\n` +
      `   төлсөн эсэх: ${qpayObj?.tulsunEsekh}   дүн: ${qpayObj?.qpay?.amount}`,
  );

  const tululduud = await Ledger.find({
    baiguullagiinId: BAIGUULLAGIIN_ID,
    turul: "төлөлт",
    nekhemjlekhId: { $in: [NEKHEMJLEKH_1, NEKHEMJLEKH_2] },
  })
    .select("nekhemjlekhId dun bankniiGuilgeeId ognoo")
    .lean();

  mur("\n─── LEDGER ДЭЭРХ ТӨЛӨЛТҮҮД ───────────────────────");
  if (!tululduud.length) mur("   (байхгүй)");
  tululduud.forEach((t) =>
    mur(
      `   ${t.nekhemjlekhId === NEKHEMJLEKH_1 ? "4-р сар" : "5-р сар"}  ` +
        `${t.dun}  түлхүүр: ${t.bankniiGuilgeeId}`,
    ),
  );

  const nekh2Tulult = tululduud.find((t) => t.nekhemjlekhId === NEKHEMJLEKH_2);

  if (shalgakhMode) {
    mur("\n─── ҮР ДҮН ───────────────────────────────────────");
    if (nekh2Tulult && nekh2?.tuluv === "Төлсөн") {
      mur("✅ Засвар амжилттай. 5-р сарын нэхэмжлэх төлөгдсөн.");
    } else {
      mur("⚠️  5-р сар хараахан төлөгдөөгүй байна.");
    }
    process.exit(0);
  }

  /* ─── Аюулгүйн шалгалтууд ─────────────────────────────────────────── */

  const aldaanuud = [];
  if (!nekh1) aldaanuud.push("4-р сарын нэхэмжлэх олдсонгүй");
  if (!nekh2) aldaanuud.push("5-р сарын нэхэмжлэх олдсонгүй");
  if (!qpayObj) aldaanuud.push("QPay бичлэг олдсонгүй");

  // ХАМГИЙН ЧУХАЛ: 4-р сар "Төлсөн" биш бол handler түүнийг алгасахгүй тул
  // давхар төлөлт, давхар e-баримт үүснэ.
  if (nekh1 && nekh1.tuluv !== "Төлсөн")
    aldaanuud.push(
      `4-р сарын нэхэмжлэхийн төлөв "${nekh1.tuluv}" байна. "Төлсөн" биш бол ` +
        "callback дахин ажиллахад давхар төлөлт үүснэ — ЗОГСЛОО.",
    );

  if (nekh2 && nekh2.tuluv === "Төлсөн")
    aldaanuud.push("5-р сарын нэхэмжлэх аль хэдийн төлөгдсөн — засах юу ч алга");

  if (nekh2Tulult)
    aldaanuud.push(
      `5-р сарын төлөлт ledger дээр аль хэдийн байна (${nekh2Tulult.dun}₮) — засах юу ч алга`,
    );

  if (aldaanuud.length) {
    mur("\n─── ЗОГСЛОО ──────────────────────────────────────");
    aldaanuud.forEach((a) => mur("   ❌ " + a));
    process.exit(1);
  }

  const undsenServer = process.env.UNDSEN_SERVER || "https://amarhome.mn";
  const callbackUrl =
    `${undsenServer}/api/qpayNekhemjlekhMultipleCallback/` +
    `${BAIGUULLAGIIN_ID}/${NEKHEMJLEKH_1},${NEKHEMJLEKH_2}`;

  mur("\n─── ХИЙХ ҮЙЛДЭЛ ──────────────────────────────────");
  mur(`   1. QuickQpayObject.tulsunEsekh → false (түгжээ тайлах)`);
  mur(`   2. Callback дуудах:\n      ${callbackUrl}`);
  mur(`   3. 4-р сар нь "Төлсөн" тул алгасагдана`);
  mur(`   4. 5-р сар (${nekh2.niitTulbur}₮) бүртгэгдэнэ:`);
  mur(`         ledger төлөлт + нэхэмжлэхийн төлөв + банкны гүйлгээ + e-баримт`);

  if (!fixMode) {
    mur("\n⚠️  ТУРШИЛТЫН ГОРИМ — юу ч өөрчлөгдөөгүй.");
    mur("   Гүйцэтгэхийн тулд: node scripts/zasvar-qpay-multi-2026-08-28.js --fix");
    process.exit(0);
  }

  mur("\n🔓 Түгжээг тайлж байна...");
  await Qpay.updateOne(
    { invoice_id: QPAY_INVOICE_ID },
    { $set: { tulsunEsekh: false } },
  );
  mur("   ✅ tulsunEsekh → false");

  mur("\n📡 Callback дуудаж байна...");
  try {
    const khariu = await fetch(callbackUrl, { method: "POST" });
    mur(`   ✅ HTTP ${khariu.status}`);
  } catch (e) {
    mur(`   ❌ Дуудалт амжилтгүй: ${e.message}`);
    mur("   Түгжээг буцаан хаана...");
    await Qpay.updateOne(
      { invoice_id: QPAY_INVOICE_ID },
      { $set: { tulsunEsekh: true } },
    );
    process.exit(1);
  }

  mur("\n⏳ Боловсруулалт дуусахыг хүлээж байна (5 сек)...");
  await new Promise((r) => setTimeout(r, 5000));

  mur("\n─── ДҮН ──────────────────────────────────────────");
  const [nekh2Shine, qpayShine] = await Promise.all([
    Nekh.findById(NEKHEMJLEKH_2).lean(),
    Qpay.findOne({ invoice_id: QPAY_INVOICE_ID }).lean(),
  ]);
  const tululdShine = await Ledger.find({
    baiguullagiinId: BAIGUULLAGIIN_ID,
    turul: "төлөлт",
    nekhemjlekhId: { $in: [NEKHEMJLEKH_1, NEKHEMJLEKH_2] },
  })
    .select("nekhemjlekhId dun bankniiGuilgeeId")
    .lean();

  tululdShine.forEach((t) =>
    mur(
      `   ${t.nekhemjlekhId === NEKHEMJLEKH_1 ? "4-р сар" : "5-р сар"}  ` +
        `${t.dun}  түлхүүр: ${t.bankniiGuilgeeId}`,
    ),
  );
  mur(`   5-р сарын төлөв: ${nekh2Shine?.tuluv}`);
  mur(`   QPay tulsunEsekh: ${qpayShine?.tulsunEsekh}`);

  // Handler өөрөө tulsunEsekh-ийг буцааж true болгодог. Ямар нэг шалтгаанаар
  // болоогүй бол энд хаана - түгжээгүй үлдвэл дараагийн callback давхар
  // боловсруулж мэднэ.
  if (!qpayShine?.tulsunEsekh) {
    mur("\n⚠️  tulsunEsekh false хэвээр — гараар хаалаа.");
    await Qpay.updateOne(
      { invoice_id: QPAY_INVOICE_ID },
      { $set: { tulsunEsekh: true } },
    );
  }

  const amjilttai =
    tululdShine.some((t) => t.nekhemjlekhId === NEKHEMJLEKH_2) &&
    tululdShine.filter((t) => t.nekhemjlekhId === NEKHEMJLEKH_1).length === 1;

  mur(
    amjilttai
      ? "\n✅ Амжилттай. 4-р сар давхардаагүй, 5-р сар бүртгэгдлээ."
      : "\n❌ Хүлээгдсэн үр дүн гарсангүй. pm2 log-оос [QPAY MULTI CALLBACK] мөрүүдийг үзнэ үү.",
  );

  process.exit(amjilttai ? 0 : 1);
}

main().catch((e) => {
  console.error("❌ Алдаа:", e);
  process.exit(1);
});
