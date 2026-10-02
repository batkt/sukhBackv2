/**
 * QPay төлөлтийн БҮРТГЭСЭН дүнг бодит ТӨЛСӨН дүнтэй тулгаж засах.
 *
 * ЯАГААД: олон нэхэмжлэхийг нэг QPay-ээр төлөхөд callback нэхэмжлэх БҮРД
 * өөрийн нийт дүнг төлсөн гэж бүртгэдэг байв (100₮ төлсөн ч 135,000₮ орсон).
 * Callback засагдсан; энэ скрипт өмнө нь буруу бүртгэгдсэнийг олж засна.
 *
 * QPay QR нь тогтмол дүнтэй тул төлсөн дүн = QuickQpayObject-ийн дүн. Тухайн
 * QR-ээр бүртгэгдсэн ledger мөрүүдийн нийлбэр түүнээс их бол мөрүүдийг
 * нэхэмжлэхийн огноогоор (хуучнаас нь) дахин хуваарилж, нэхэмжлэхүүдийг
 * дахин бодно. И-баримтыг ӨӨРЧЛӨХГҮЙ — буруу дүнгээр гарсан баримтуудыг
 * жагсааж харуулна (татварын системээс гараар буцаах шаардлагатай).
 *
 *   node scripts/qpayDunShalgakh.js                 # сүүлийн 30 хоног, зөвхөн жагсаалт
 *   node scripts/qpayDunShalgakh.js --khonog 60
 *   node scripts/qpayDunShalgakh.js --apply         # засна
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
const KHONOG = Number(arg("khonog", 30)) || 30;
const ZORILT = arg("baiguullaga", null);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

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
  const Guilgee = require("../models/guilgeeAvlaguud");
  const Nekhemjlekh = require("../models/nekhemjlekhiinTuukh");
  const EbarimtShine = require("../models/ebarimtShine");
  const { syncInvoicesStatus } = require("../services/guilgeeService");
  const ekhlel = new Date(Date.now() - KHONOG * 24 * 3600 * 1000);

  console.log(`${APPLY ? "ЗАСАХ" : "ЗӨВХӨН ЖАГСААЛТ (--apply нэмбэл засна)"} · сүүлийн ${KHONOG} хоног`);
  let oldson = 0;
  let zassan = 0;

  for (const kholbolt of db.kholboltuud) {
    const baiguullagiinId = String(kholbolt.baiguullagiinId);
    if (ZORILT && baiguullagiinId !== ZORILT) continue;

    const bichleguud = await QuickQpayObject(kholbolt)
      .find({
        baiguullagiinId,
        tulsunEsekh: true,
        $or: [{ ognoo: { $gte: ekhlel } }, { createdAt: { $gte: ekhlel } }],
      })
      .lean()
      .catch(() => []);

    for (const b of bichleguud) {
      const idnuud = nekhemjlekhIdnuud(b.qpay?.callback_url || b.callback_url || "");
      const qrDun = r2(b.amount || b.qpay?.amount || b.sukhNekhemjlekh?.pay_amount || 0);
      if (idnuud.length === 0 || !(qrDun > 0)) continue;
      const qrOgnoo = new Date(b.ognoo || b.createdAt || 0);

      // Энэ QR-ийн дараа QPay callback-аар бүртгэгдсэн төлөлтийн мөрүүд
      const murnuud = await Guilgee(kholbolt)
        .find({
          nekhemjlekhId: { $in: idnuud },
          dun: { $lt: 0 },
          source: "nekhemjlekh",
          tailbar: /QPay/i,
          createdAt: { $gte: qrOgnoo },
        })
        .lean();
      if (murnuud.length === 0) continue;

      const burtgesen = r2(murnuud.reduce((s, m) => s + Math.abs(Number(m.dun) || 0), 0));
      if (burtgesen <= qrDun + 0.5) continue;

      oldson++;
      console.log(
        `\n  ● ${baiguullagiinId} · QPay ${b.invoice_id || b.qpay?.invoice_id} · төлсөн ${qrDun}₮, бүртгэсэн ${burtgesen}₮`,
      );

      // Нэхэмжлэхийн огноогоор хуучнаас нь хуваарилна
      const invs = await Nekhemjlekh(kholbolt)
        .find({ _id: { $in: murnuud.map((m) => m.nekhemjlekhId) } })
        .select({ ognoo: 1 })
        .lean();
      const invOgnoo = new Map(invs.map((i) => [String(i._id), new Date(i.ognoo || 0).getTime()]));
      const erembelsen = [...murnuud].sort(
        (x, y) => (invOgnoo.get(String(x.nekhemjlekhId)) || 0) - (invOgnoo.get(String(y.nekhemjlekhId)) || 0),
      );
      let uldsen = qrDun;
      const shine = erembelsen.map((m) => {
        const umnukh = Math.abs(Number(m.dun) || 0);
        const avakh = r2(Math.min(umnukh, uldsen));
        uldsen = r2(uldsen - avakh);
        return { m, umnukh, avakh };
      });
      shine.forEach(({ m, umnukh, avakh }) =>
        console.log(`      нэхэмжлэх ${m.nekhemjlekhId}: ${umnukh}₮ → ${avakh}₮${avakh === 0 ? " (устгана)" : ""}`),
      );

      const barimtuud = await EbarimtShine(kholbolt)
        .find({ nekhemjlekhiinId: { $in: idnuud }, createdAt: { $gte: qrOgnoo } })
        .select({ receiptId: 1, totalAmount: 1, nekhemjlekhiinId: 1, createdAt: 1 })
        .lean()
        .catch(() => []);
      barimtuud.forEach((e) =>
        console.log(
          `      ⚠ И-баримт ${e.receiptId || e._id} · ${e.totalAmount}₮ · нэхэмжлэх ${e.nekhemjlekhiinId} — дүн буруу бол татварын системээс буцаана`,
        ),
      );

      if (!APPLY) continue;
      for (const { m, avakh } of shine) {
        if (avakh <= 0) {
          await Guilgee(kholbolt).deleteOne({ _id: m._id });
        } else {
          await Guilgee(kholbolt).updateOne({ _id: m._id }, { $set: { dun: -avakh, tulsunDun: avakh } });
        }
      }
      const gereenuud = [...new Set(murnuud.map((m) => String(m.gereeniiId || "")).filter(Boolean))];
      for (const gid of gereenuud) await syncInvoicesStatus(kholbolt, gid);
      zassan++;
    }
  }

  console.log(`\nДүн: буруу ${oldson} төлөлт` + (APPLY ? ` · зассан ${zassan}` : ""));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
