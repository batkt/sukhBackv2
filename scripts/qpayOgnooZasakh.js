/**
 * QPay төлөлтийн огноог ИРГЭН ТӨЛСӨН огноо болгож засах.
 *
 * ЯАГААД: callback төлбөрийг боловсруулсан мөчийн огноогоор бүртгэдэг байв.
 * qpayTulsunNokhokh.js-ээр хоцорч нөхсөн төлбөрүүд (жишээ нь 10.01-нд
 * төлсөн) скрипт ажилласан огноогоор (10.02) орсон. Одоо callback QPay-ийн
 * payment_date-ийг ашигладаг болсон; энэ скрипт өмнө нь бичигдсэнийг засна.
 *
 * Хамрах хүрээ: сүүлийн --tsag (анхдагч 72) цагт ҮҮСГЭСЭН QPay төлөлтийн
 * мөрүүд (guilgeeAvlaguud, dun < 0) бөгөөд огноо нь QPay-ийн огнооноос
 * 1 цагаас илүү зөрсөн. Нэхэмжлэхийн tulsunOgnoo-г мөн засна.
 * И-баримтын огноог өөрчлөхгүй (татварын системд илгээгдсэн).
 *
 *   node scripts/qpayOgnooZasakh.js              # зөвхөн жагсаалт
 *   node scripts/qpayOgnooZasakh.js --apply      # засна
 *   node scripts/qpayOgnooZasakh.js --tsag 120 --khonog 30
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../tokhirgoo/local.env") });
require("dotenv").config({ path: path.join(__dirname, "../tokhirgoo/tokhirgoo.env") });
const { db } = require("zevbackv2");

const arg = (ner, def) => {
  const i = process.argv.indexOf(`--${ner}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const APPLY = process.argv.includes("--apply");
const TSAG = Number(arg("tsag", 72)) || 72;
const KHONOG = Number(arg("khonog", 30)) || 30;
const ZORILT = arg("baiguullaga", null);
const TSAG_MS = 3600 * 1000;

/** Callback URL-ын сүүлийн хэсэг — нэг эсвэл таслалаар тусгаарласан нэхэмжлэхийн ID */
function nekhemjlekhIdnuud(url) {
  try {
    const kheseg = new URL(url).pathname.split("/").filter(Boolean);
    const i = kheseg.findIndex((k) => /qpayNekhemjlekh(Multiple)?Callback/i.test(k));
    if (i < 0) return [];
    return String(kheseg[i + 2] || "")
      .split(",")
      .map((x) => x.trim())
      .filter((x) => /^[a-f0-9]{24}$/i.test(x));
  } catch (_) {
    return [];
  }
}

async function main() {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(null, MONGODB_URI);
  await new Promise((r) => setTimeout(r, 2000));

  const { QuickQpayObject } = require("quickqpaypackvSukh");
  const { qpayShalgayAyulgui, qpayTulsunOgnoo } = require("../utils/qpayShalgayAyulgui");
  const Guilgee = require("../models/guilgeeAvlaguud");
  const Nekhemjlekh = require("../models/nekhemjlekhiinTuukh");
  const uusgesenKhoino = new Date(Date.now() - TSAG * TSAG_MS);
  const qpayKhoino = new Date(Date.now() - KHONOG * 24 * TSAG_MS);

  console.log(`${APPLY ? "ЗАСАХ" : "ЗӨВХӨН ЖАГСААЛТ (--apply нэмбэл засна)"} · сүүлийн ${TSAG} цагт бүртгэгдсэн`);
  let zassan = 0;
  let oldson = 0;

  for (const kholbolt of db.kholboltuud) {
    const baiguullagiinId = String(kholbolt.baiguullagiinId);
    if (ZORILT && baiguullagiinId !== ZORILT) continue;

    const bichleguud = await QuickQpayObject(kholbolt)
      .find({
        baiguullagiinId,
        tulsunEsekh: true,
        $or: [{ ognoo: { $gte: qpayKhoino } }, { createdAt: { $gte: qpayKhoino } }],
      })
      .lean()
      .catch(() => []);

    for (const b of bichleguud) {
      const invId = b.invoice_id || b.qpay?.invoice_id;
      const idnuud = nekhemjlekhIdnuud(b.qpay?.callback_url || b.callback_url || "");
      if (!invId || idnuud.length === 0) continue;

      // Энэ нэхэмжлэхүүдэд сүүлд бүртгэгдсэн QPay төлөлт байгаа эсэх
      const murnuud = await Guilgee(kholbolt)
        .find({
          nekhemjlekhId: { $in: idnuud },
          dun: { $lt: 0 },
          createdAt: { $gte: uusgesenKhoino },
          $or: [{ turul: "төлөлт" }, { turul: "tulult" }],
        })
        .lean();
      if (murnuud.length === 0) continue;

      let khariu;
      try {
        khariu = await qpayShalgayAyulgui(
          { invoice_id: invId, baiguullagiinId, barilgiinId: b.salbariinId },
          kholbolt,
        );
      } catch (err) {
        console.log(`  ✗ ${invId}: QPay шалгаж чадсангүй — ${err.message}`);
        continue;
      }
      const tulsun = qpayTulsunOgnoo(khariu);
      const zuruutei = murnuud.filter(
        (m) => Math.abs(new Date(m.ognoo).getTime() - tulsun.getTime()) > TSAG_MS,
      );
      if (zuruutei.length === 0) continue;

      oldson += zuruutei.length;
      zuruutei.forEach((m) =>
        console.log(
          `  ● ${baiguullagiinId} · нэхэмжлэх ${m.nekhemjlekhId} · ${Math.abs(m.dun)}₮ · ` +
            `${new Date(m.ognoo).toISOString()} → ${tulsun.toISOString()}`,
        ),
      );
      if (!APPLY) continue;

      await Guilgee(kholbolt).updateMany(
        { _id: { $in: zuruutei.map((m) => m._id) } },
        { $set: { ognoo: tulsun } },
      );
      await Nekhemjlekh(kholbolt).updateMany(
        { _id: { $in: idnuud }, tuluv: "Төлсөн" },
        { $set: { tulsunOgnoo: tulsun } },
      );
      zassan += zuruutei.length;
    }
  }

  console.log(`\nДүн: зөрүүтэй ${oldson} мөр` + (APPLY ? ` · зассан ${zassan}` : ""));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
