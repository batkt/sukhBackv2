/**
 * Авлагын дэвтэрт бичигдсэн «гүйлгээ хийсэн ажилтны нэр»-ийг засна.
 *
 * `nekhemjlekhZardalSync.js` эхний хувилбартаа нэмсэн мөрүүддээ
 * «Систем (зардлын синк)» гэж тэмдэглэдэг байв. Ердийн нэхэмжлэх үүсгэлт нь
 * зүгээр «Систем» гэж бичдэг тул синкээр нэмэгдсэн мөр Хуулга дээр
 * ялгарч харагддаг. Энэ скрипт тэдгээрийг жигдэлнэ.
 *
 * `guilgeeKhiisenAjiltniiId` нь тухайн мөрийн ӨӨРИЙН `orshinSuugchId`-аар
 * нөхөгдөнө — `invoiceService` ч яг адил бичдэг.
 *
 * ЗӨВХӨН ЭДГЭЭР ХОЁР ТАЛБАРЫГ хөндөнө. Дүн, огноо, холбоос бүгд хэвээр.
 *
 * ХЭРЭГЛЭЭ (анхдагчаар ЗӨВХӨН ТУРШИНА):
 *
 *   node scripts/guilgeeNerZasvar.js --org 6a97d3afaf2ad1911035e063
 *
 * Бодитоор бичихдээ `--apply`. Өөр нэр засах бол:
 *   --khuuchin "<хуучин нэр>" --shine "<шинэ нэр>"
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
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

const argAvya = (ner) => {
  const i = process.argv.indexOf(`--${ner}`);
  return i === -1 ? null : process.argv[i + 1];
};

const ORG = argAvya("org");
const KHUUCHIN = argAvya("khuuchin") || "Систем (зардлын синк)";
const SHINE = argAvya("shine") || "Систем";
const APPLY = process.argv.includes("--apply");

if (!ORG) {
  console.error(
    'Хэрэглээ: node scripts/guilgeeNerZasvar.js --org <id> [--khuuchin "<нэр>"] [--shine "<нэр>"] [--apply]',
  );
  process.exit(1);
}

const mun = (n) => `${Number(n || 0).toLocaleString("mn-MN")}₮`;

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(APPLY ? "  БОДИТООР БИЧНЭ (--apply)" : "  ЗӨВХӨН ТУРШИЛТ — юу ч бичихгүй");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  байгууллага:", ORG);
  console.log(`  "${KHUUCHIN}"  →  "${SHINE}"`);
  console.log("");

  const kholbolt = getKholboltByBaiguullagiinId(ORG);
  if (!kholbolt) throw new Error("Баазын холболт олдсонгүй: " + ORG);
  const LedgerModel = GuilgeeAvlaguud(kholbolt);

  const mur = await LedgerModel.find({
    baiguullagiinId: String(ORG),
    guilgeeKhiisenAjiltniiNer: KHUUCHIN,
  })
    .select({ zardliinNer: 1, tailbar: 1, dun: 1, orshinSuugchId: 1, guilgeeKhiisenAjiltniiId: 1, ognoo: 1 })
    .lean();

  if (!mur.length) {
    console.log(`"${KHUUCHIN}" нэртэй мөр олдсонгүй — засах зүйл алга.`);
    return;
  }

  const bulgeg = new Map();
  mur.forEach((m) => {
    const n = String(m.zardliinNer || m.tailbar || "(нэргүй)").trim();
    const b = bulgeg.get(n) || { too: 0, dun: 0 };
    b.too++;
    b.dun += m.dun || 0;
    bulgeg.set(n, b);
  });

  console.log(`Олдсон мөр: ${mur.length}`);
  [...bulgeg.entries()]
    .sort((a, b) => b[1].too - a[1].too)
    .forEach(([n, b]) => console.log(`   • ${n.padEnd(36)} ${String(b.too).padStart(4)} мөр  ${mun(b.dun).padStart(14)}`));

  const idGui = mur.filter((m) => !m.guilgeeKhiisenAjiltniiId).length;
  console.log(`\n  нэр засагдана            : ${mur.length} мөр`);
  console.log(`  ажилтны id нөхөгдөнө     : ${idGui} мөр (одоо хоосон)`);

  if (!APPLY) {
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log("ТУРШИЛТ ДУУСЛАА — юу ч бичигдээгүй.  Гүйцэтгэхдээ `--apply` нэмнэ.");
    console.log("──────────────────────────────────────────────────────────────");
    return;
  }

  console.log("\n── Бичиж эхэллээ ──");
  await LedgerModel.bulkWrite(
    mur.map((m) => ({
      updateOne: {
        filter: { _id: m._id },
        update: {
          $set: {
            guilgeeKhiisenAjiltniiNer: SHINE,
            guilgeeKhiisenAjiltniiId: m.guilgeeKhiisenAjiltniiId || m.orshinSuugchId || "",
          },
        },
      },
    })),
    { ordered: false },
  );
  console.log(`✅ ${mur.length} мөрийн ажилтны нэрийг "${SHINE}" болгов`);

  const uldsen = await LedgerModel.countDocuments({
    baiguullagiinId: String(ORG),
    guilgeeKhiisenAjiltniiNer: KHUUCHIN,
  });
  console.log(uldsen === 0 ? "✅ Шалгалт: үлдсэн мөр алга" : `⚠ Шалгалт: ${uldsen} мөр үлдлээ`);
  console.log("\n── Дууслаа. Дүн, огноо, холбоос хөндөгдөөгүй. ──");
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
