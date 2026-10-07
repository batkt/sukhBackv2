/**
 * Ашиглалтын зардлын «заалттай» тохиргоог УНТРААЖ, тогтмол төлбөр болгоно.
 *
 * ЯАГААД: `zaalt: true` зардлыг систем ТООЛУУРЫН ЗААЛТААР бодохыг оролддог
 * (`services/invoiceService.js` — isMeterCharge). Заалт оруулаагүй бол дүн нь
 * 0 гарч, сарын автомат нэхэмжлэхэд ОГТ ОРДОГГҮЙ. Тогтмол сарын төлбөр бол
 * `zaalt`-ыг унтрааж, дүнг нь `tariff`-д бичих хэрэгтэй.
 *
 * `Нийтийн эзэмшлийн цахилгаан`-ы 18,700₮ нь `suuriKhuraamj`-д хадгалагдсан
 * байсан — суурь хураамж нь зөвхөн ХЭРЭГЛЭЭ гарсан үед нэмэгддэг тул заалтгүй
 * бол хэзээ ч бодогдохгүй. Энэ скрипт түүнийг `tariff` руу зөөнө.
 *
 * Байгууллагын БҮХ барилгын ижил нэртэй зардлыг нэг дор засна.
 *
 * SMS ИЛГЭЭХГҮЙ.
 *
 * ХЭРЭГЛЭЭ (анхдагчаар ЗӨВХӨН ТУРШИНА):
 *
 *   node scripts/zaaltUntraakh.js --org 6a97d3afaf2ad1911035e063 \
 *     --zardal "Нийтийн эзэмшлийн цахилгаан=18700" \
 *     --zardal "Нийтийн эзэмшлийн дулаан=5000"
 *
 * Бодитоор бичихдээ `--apply`.
 */

const path = require("path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/local.env" });
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });
process.env.TZ = process.env.TZ || "Asia/Ulaanbaatar";
process.setMaxListeners(0);

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const Geree = require("../models/geree");

const argAvya = (ner) => {
  const i = process.argv.indexOf(`--${ner}`);
  return i === -1 ? null : process.argv[i + 1];
};
const argOlon = (ner) =>
  process.argv.reduce((ur, a, i) => (a === `--${ner}` ? [...ur, process.argv[i + 1]] : ur), []);

const ORG = argAvya("org");
const ZARDAL_ARG = argOlon("zardal");
const APPLY = process.argv.includes("--apply");

if (!ORG || ZARDAL_ARG.length === 0) {
  console.error(
    'Хэрэглээ: node scripts/zaaltUntraakh.js --org <id> --zardal "<нэр>=<тариф>" [--zardal ...] [--apply]',
  );
  process.exit(1);
}

const zoriltuud = ZARDAL_ARG.map((a) => {
  const i = a.lastIndexOf("=");
  if (i === -1) {
    console.error(`--zardal нь "<нэр>=<тариф>" хэлбэртэй: ${a}`);
    process.exit(1);
  }
  const dun = Number(a.slice(i + 1));
  if (!Number.isFinite(dun) || dun < 0) {
    console.error(`Тариф буруу: ${a}`);
    process.exit(1);
  }
  return { ner: a.slice(0, i).trim(), dun };
});

const mun = (n) => `${Number(n || 0).toLocaleString("mn-MN")}₮`;
const jishiye = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(APPLY ? "  БОДИТООР БИЧНЭ (--apply)" : "  ЗӨВХӨН ТУРШИЛТ — юу ч бичихгүй");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  байгууллага:", ORG);
  zoriltuud.forEach((z) => console.log(`  зорилт     : ${z.ner} → тогтмол ${mun(z.dun)}`));
  console.log("");

  const kholbolt = getKholboltByBaiguullagiinId(ORG);
  if (!kholbolt) throw new Error("Баазын холболт олдсонгүй: " + ORG);

  const ZardalModel = AshiglaltiinZardluud(kholbolt);
  const GereeModel = Geree(kholbolt);

  const bukh = await ZardalModel.find({ baiguullagiinId: String(ORG) }).lean();
  const olson = [];
  for (const z of zoriltuud) {
    const taarsan = bukh.filter((b) => jishiye(b.ner) === jishiye(z.ner));
    if (!taarsan.length) {
      console.log(`⚠ "${z.ner}" нэртэй зардал ОЛДСОНГҮЙ`);
      continue;
    }
    taarsan.forEach((b) => olson.push({ doc: b, dun: z.dun }));
  }

  if (!olson.length) throw new Error("Засах зардал олдсонгүй.");

  console.log("Засагдах зардлууд:");
  console.log("  барилга                      зардал                          одоо → болно");
  olson.forEach(({ doc, dun }) => {
    const odoo = `zaalt:${doc.zaalt ? "ТИЙМ" : "үгүй"} тариф:${doc.tariff || 0} суурь:${doc.suuriKhuraamj || 0}`;
    console.log(
      `  ${String(doc.barilgiinId || "(нийтийн)").padEnd(26)} ${String(doc.ner).trim().padEnd(30)} ${odoo}  →  zaalt:үгүй тариф:${dun} суурь:0`,
    );
  });

  // Хэдэн гэрээнд тусгагдах вэ
  const gereeToo = await GereeModel.countDocuments({ baiguullagiinId: String(ORG) });
  console.log(`\nГэрээ: ${gereeToo} — зардал бүр дээр шинэчлэгдэнэ (post-hook)`);

  if (!APPLY) {
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log("ТУРШИЛТ ДУУСЛАА — юу ч бичигдээгүй.  Гүйцэтгэхдээ `--apply` нэмнэ.");
    console.log("──────────────────────────────────────────────────────────────");
    return;
  }

  console.log("\n── Бичиж эхэллээ ──");
  for (const { doc, dun } of olson) {
    // `findOneAndUpdate`-ийн post-hook нь гэрээнүүдийн `zardluud`-ыг
    // шинэчилнэ — тиймээс дараа сарын нэхэмжлэх шууд зөв бодогдоно.
    await ZardalModel.findOneAndUpdate(
      { _id: doc._id },
      {
        $set: {
          zaalt: false,
          tariff: dun,
          dun: dun,
          suuriKhuraamj: 0,
          // Тогтмол төлбөр болсон тул «кВт» нэгж утгагүй.
          tariffUsgeer: "",
          zaaltTariff: 0,
          zaaltDefaultDun: 0,
          zaaltTariffTiers: [],
        },
      },
      { new: true },
    );
    console.log(`✅ ${String(doc.ner).trim()} — барилга ${doc.barilgiinId || "(нийтийн)"} → тогтмол ${mun(dun)}`);
  }

  console.log("\n── Дууслаа. SMS ИЛГЭЭГДСЭНГҮЙ. ──");
  console.log("Дараа сарын автомат нэхэмжлэх эдгээрийг тогтмол төлбөрөөр бодно.");
  console.log("Аль хэдийн үүссэн 9/10 сарын нэхэмжлэхийг засахын тулд");
  console.log("`nekhemjlekhZardalSync.js`-ийг ажиллуулна уу.");
}

(async () => {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(require("express")(), MONGODB_URI);
  for (let i = 0; i < 60; i++) {
    if (getKholboltByBaiguullagiinId(ORG)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    await main();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ АЛДАА:", err.message, "\n", err.stack);
    process.exit(1);
  }
})();
