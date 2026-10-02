/**
 * QPay-д ТӨЛӨГДСӨН боловч системд бүртгэгдээгүй төлбөрүүдийг олж нөхөх.
 *
 * ЯАГААД: callback-ийн баталгаажуулалт салбар (barilgiinId) дамжуулдаггүй
 * байсан тул олон салбартай байгууллагад QPay «undefined ID-тай салбар
 * олдсонгүй» гэж хариулж, төлсөн төлбөр бүртгэгдэлгүй үлдсэн.
 *
 * ХЭРХЭН: QuickQpayObject (tulsunEsekh != true) бүрийн төлвийг QPay-ээс
 * шалгана. PAID бол тухайн нэхэмжлэхийн ӨӨРИЙН callback URL-ыг дуудна —
 * callback дахин QPay-ээс баталгаажуулж, гүйлгээ бүртгэж, нэхэмжлэхийг
 * төлсөн болгож, И-баримт гаргана (энгийн төлбөртэй яг ижил зам). Callback нь
 * давхардлаас хамгаалагдсан тул дахин ажиллуулахад аюулгүй.
 *
 * ШААРДЛАГА: салбарын засвартай (utils/qpayShalgayAyulgui.js) серверийг
 * эхлээд deploy хийсэн байх — callback тэр серверт очно.
 *
 * Ажиллуулах (эхлээд зөвхөн жагсаалт):
 *   node scripts/qpayTulsunNokhokh.js                       # сүүлийн 14 хоног, бүх байгууллага
 *   node scripts/qpayTulsunNokhokh.js --khonog 30 --baiguullaga <id>
 *   node scripts/qpayTulsunNokhokh.js --apply                # бодитоор нөхөх
 */
// Сервертэй (index.js) ижил тохиргоо — хаанаас ажиллуулсан ч зөв олно
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../tokhirgoo/local.env") });
require("dotenv").config({ path: path.join(__dirname, "../tokhirgoo/tokhirgoo.env") });
const axios = require("axios");
const { db } = require("zevbackv2");

const arg = (ner, def) => {
  const i = process.argv.indexOf(`--${ner}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const APPLY = process.argv.includes("--apply");
const KHONOG = Number(arg("khonog", 14)) || 14;
const ZORILT = arg("baiguullaga", null);

const qpayInvoiceId = (b) => b.invoice_id || b.qpay?.invoice_id || null;
const callbackUrl = (b) => b.qpay?.callback_url || b.callback_url || null;

async function main() {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(null, MONGODB_URI);
  await new Promise((r) => setTimeout(r, 2000));

  const { QuickQpayObject } = require("quickqpaypackvSukh");
  const { qpayShalgayAyulgui } = require("../utils/qpayShalgayAyulgui");
  const ekhlel = new Date(Date.now() - KHONOG * 24 * 3600 * 1000);

  console.log(
    `${APPLY ? "НӨХӨХ" : "ЗӨВХӨН ЖАГСААЛТ (--apply нэмбэл нөхнө)"} · сүүлийн ${KHONOG} хоног` +
      (ZORILT ? ` · байгууллага ${ZORILT}` : ""),
  );

  const dun = { shalgasan: 0, tulugdsun: 0, nukhsun: 0, aldaa: 0 };
  for (const kholbolt of db.kholboltuud) {
    const baiguullagiinId = String(kholbolt.baiguullagiinId);
    if (ZORILT && baiguullagiinId !== ZORILT) continue;

    const bichleguud = await QuickQpayObject(kholbolt)
      .find({
        baiguullagiinId,
        tulsunEsekh: { $ne: true },
        $or: [{ ognoo: { $gte: ekhlel } }, { createdAt: { $gte: ekhlel } }],
      })
      .lean()
      .catch(() => []);
    if (bichleguud.length === 0) continue;
    console.log(`\n${baiguullagiinId}: төлөгдөөгүй ${bichleguud.length} QPay нэхэмжлэх`);

    for (const b of bichleguud) {
      const invId = qpayInvoiceId(b);
      const url = callbackUrl(b);
      if (!invId || !url) continue;
      dun.shalgasan++;

      let khariu;
      try {
        khariu = await qpayShalgayAyulgui(
          { invoice_id: invId, baiguullagiinId, barilgiinId: b.salbariinId },
          kholbolt,
        );
      } catch (err) {
        dun.aldaa++;
        console.log(`  ✗ ${invId}: QPay шалгаж чадсангүй — ${err.message}`);
        continue;
      }
      const tulbur = (khariu?.payments || []).filter(
        (p) => p?.payment_status === "PAID" || p?.status === "PAID",
      );
      const tuluv = String(khariu?.invoice_status || "").toUpperCase();
      if (!(tulbur.length > 0 || tuluv === "PAID" || tuluv === "CLOSED")) continue;

      dun.tulugdsun++;
      const tulsunDun = tulbur.reduce((s, p) => s + (Number(p?.payment_amount ?? p?.amount) || 0), 0);
      console.log(
        `  ● PAID ${invId} · ${tulsunDun || khariu?.paid_amount || "?"}₮ · ${b.ognoo || b.createdAt || ""} · ${url}`,
      );
      if (!APPLY) continue;

      try {
        // QPay-тэй ижил: callback URL-ыг дуудна (сервер өөрөө бүх ажлыг хийнэ)
        await axios.get(url, { timeout: 60000 });
        dun.nukhsun++;
        console.log("    ✓ бүртгэгдлээ (гүйлгээ, нэхэмжлэхийн төлөв, И-баримт)");
      } catch (err) {
        dun.aldaa++;
        console.log(`    ✗ callback алдаа: ${err.response?.status || ""} ${err.message}`);
      }
    }
  }

  console.log(
    `\nДүн: шалгасан ${dun.shalgasan} · QPay-д төлөгдсөн ${dun.tulugdsun}` +
      (APPLY ? ` · нөхсөн ${dun.nukhsun}` : "") +
      ` · алдаа ${dun.aldaa}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
