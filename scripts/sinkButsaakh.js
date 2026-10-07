/**
 * `nekhemjlekhZardalSync.js` ТӨЛБӨРИЙН БАРИМТАД буруугаар нэмсэн зардлын
 * мөрүүдийг устгана.
 *
 * ЮУ БОЛСОН БЭ:
 *
 *   Төлөлт бүртгэхэд түүнийг барих ЖИЖИГ нэхэмжлэх үүсдэг — зардлын мөргүй,
 *   зөвхөн төлөлтийг агуулсан баримт. Синк скрипт сонгосон сарын БҮХ
 *   нэхэмжлэхийг үзээд ийм баримтыг «бүх зардал нь дутуу» гэж үзэж, 11
 *   зардлыг бүтнээр нь нэмчихсэн. Үр дүнд нь айл бүр нэг сар ИЛҮҮ
 *   нэхэмжлэгдсэн.
 *
 * ЯАЖ ТАНИХ ВЭ:
 *
 *   Жинхэнэ сарын нэхэмжлэх дээр зардлын мөрүүд нь нэхэмжлэх үүсэх үед нь
 *   бичигдсэн байдаг. Хуурамчаар дүүргэгдсэн баримт дээр БҮХ зардлын мөр
 *   синк ажилласан агшинд үүссэн байна. Тиймээс «нэг ч мөр нь синкээс ӨМНӨ
 *   үүсээгүй» нэхэмжлэхийг л цэвэрлэнэ.
 *
 * ХЭРЭГЛЭЭ (анхдагчаар ЗӨВХӨН ТУРШИНА):
 *
 *   node scripts/sinkButsaakh.js --org 6a97d3afaf2ad1911035e063 \
 *     --tsag "2026-10-07T15:40:00"
 *
 * `--tsag` нь синк ажиллахаас ЯГ ӨМНӨХ агшин (орон нутгийн цаг). Үүнээс
 * хойш үүссэн мөрийг синкийнх гэж үзнэ. Бодитоор устгахдаа `--apply`.
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
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const guilgeeService = require("../services/guilgeeService");

const argAvya = (ner) => {
  const i = process.argv.indexOf(`--${ner}`);
  return i === -1 ? null : process.argv[i + 1];
};

const argOlon = (ner) =>
  process.argv.reduce((ur, a, i) => (a === `--${ner}` ? [...ur, process.argv[i + 1]] : ur), []);

const ORG = argAvya("org");
const TSAG_ARG = argAvya("tsag");
/**
 * Буцаалтаас АЛГАСАХ нэхэмжлэх (дугаар эсвэл _id), давтаж өгч болно.
 *
 * Зардлын мөргүй байсан бүх нэхэмжлэх нь төлбөрийн баримт БИШ: тухайн айлын
 * сарын нэхэмжлэх үүсэх үедээ дутуу боловсорч, хоосон үлдсэн байж болно.
 * Тийм нэхэмжлэхийг буцаавал тэр айл тухайн сард ОГТ нэхэмжлэгдээгүй үлдэнэ.
 */
const ALAGSAKH = argOlon("alagsakh").map((s) => String(s).trim());
/**
 * ЗӨВХӨН эдгээр нэхэмжлэхийг буцаана (давтаж өгч болно).
 *
 * Нэхэмжлэхийн дугаар (`НЭХ-...`), гэрээний дугаар (`ГД-...`) эсвэл `_id`-аар
 * тааруулна. Өгөөгүй бол илэрсэн БҮГДИЙГ буцаана. Хэсэгчлэн, болгоомжтой
 * хийхэд зориулав — нэг хоёрыг нь буцааж шалгаад, дараа нь үлдсэнийг.
 */
const ZOVKHON = argOlon("zovkhon").map((s) => String(s).trim());
const APPLY = process.argv.includes("--apply");

if (!ORG || !TSAG_ARG) {
  console.error(
    'Хэрэглээ: node scripts/sinkButsaakh.js --org <id> --tsag "2026-10-07T15:40:00" [--apply]',
  );
  process.exit(1);
}
const TSAG = new Date(TSAG_ARG);
if (Number.isNaN(TSAG.getTime())) {
  console.error("Цаг буруу:", TSAG_ARG);
  process.exit(1);
}

const mun = (n) => `${Number(n || 0).toLocaleString("mn-MN")}₮`;

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(APPLY ? "  БОДИТООР УСТГАНА (--apply)" : "  ЗӨВХӨН ТУРШИЛТ — юу ч устгахгүй");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  байгууллага:", ORG);
  console.log("  синкийн цаг:", TSAG.toLocaleString("mn-MN"), "— үүнээс хойшхи мөрийг синкийнх гэж үзнэ");
  console.log("");

  const kholbolt = getKholboltByBaiguullagiinId(ORG);
  if (!kholbolt) throw new Error("Баазын холболт олдсонгүй: " + ORG);
  const LedgerModel = GuilgeeAvlaguud(kholbolt);
  const NekhModel = NekhemjlekhiinTuukh(kholbolt);

  // Синкийн дараа үүссэн ЗАРДЛЫН мөрүүд
  const sinkiinMur = await LedgerModel.find({
    baiguullagiinId: String(ORG),
    createdAt: { $gte: TSAG },
    dun: { $gt: 0 },
    ekhniiUldegdelEsekh: { $ne: true },
  })
    .select({ nekhemjlekhId: 1, gereeniiId: 1, zardliinNer: 1, tailbar: 1, dun: 1, ognoo: 1 })
    .lean();

  if (!sinkiinMur.length) {
    console.log("Синкийн нэмсэн мөр олдсонгүй — буцаах зүйл алга.");
    return;
  }
  console.log(`Синк нэмсэн нийт мөр: ${sinkiinMur.length}  (${mun(sinkiinMur.reduce((s, m) => s + m.dun, 0))})`);

  // Нэхэмжлэх бүрийн БҮХ зардлын мөрийг (огноо харгалзахгүй) авна
  const nekhIduud = [...new Set(sinkiinMur.map((m) => String(m.nekhemjlekhId)).filter(Boolean))];
  const bukhMur = await LedgerModel.find({
    nekhemjlekhId: { $in: nekhIduud },
    dun: { $gt: 0 },
    ekhniiUldegdelEsekh: { $ne: true },
  })
    .select({ nekhemjlekhId: 1, createdAt: 1, dun: 1 })
    .lean();

  const byNekh = new Map();
  bukhMur.forEach((m) => {
    const k = String(m.nekhemjlekhId);
    if (!byNekh.has(k)) byNekh.set(k, []);
    byNekh.get(k).push(m);
  });

  // Нэг ч мөр нь синкээс ӨМНӨ үүсээгүй нэхэмжлэх = хуурамчаар дүүргэгдсэн
  const khuurmagNekh = nekhIduud.filter((id) =>
    (byNekh.get(id) || []).every((m) => new Date(m.createdAt) >= TSAG),
  );

  const nekhMedeeleBukh = await NekhModel.find({ _id: { $in: khuurmagNekh } })
    .select({
      nekhemjlekhiinDugaar: 1, ognoo: 1, gereeniiId: 1, gereeniiDugaar: 1,
      toot: 1, niitTulbur: 1, tuluv: 1,
    })
    .lean();

  /** Нэхэмжлэхийг дугаар / гэрээний дугаар / _id-ийн алиар ч нэрлэж болно. */
  const nerlesenUu = (n, jagsaalt) =>
    jagsaalt.includes(String(n._id)) ||
    jagsaalt.includes(String(n.nekhemjlekhiinDugaar || "")) ||
    jagsaalt.includes(String(n.gereeniiDugaar || ""));

  // `--zovkhon` өгсөн бол бусдыг нь бүгдийг алгасна.
  const alagssan = nekhMedeeleBukh.filter((n) =>
    ZOVKHON.length ? !nerlesenUu(n, ZOVKHON) : nerlesenUu(n, ALAGSAKH),
  );
  const alagssanId = new Set(alagssan.map((n) => String(n._id)));
  const nekhMedeelel = nekhMedeeleBukh.filter((n) => !alagssanId.has(String(n._id)));
  const butsaakhNekh = khuurmagNekh.filter((id) => !alagssanId.has(id));

  if (ZOVKHON.length) {
    // Нэрлэсэн зүйл нэг нь ч таараагүй бол бичих гэж оролдохоос өмнө зогсооно.
    const taarsan = nekhMedeeleBukh.filter((n) => nerlesenUu(n, ZOVKHON));
    const taaraagui = ZOVKHON.filter(
      (z) => !nekhMedeeleBukh.some((n) => nerlesenUu(n, [z])),
    );
    if (taaraagui.length)
      throw new Error(
        "--zovkhon-д нэрлэсэн эдгээр нь илэрсэн жагсаалтад алга: " + taaraagui.join(", "),
      );
    console.log(`\nЗӨВХӨН эдгээрийг буцаана (--zovkhon): ${taarsan.length}`);
  }
  if (alagssan.length) {
    console.log(`\nАлгасав: ${alagssan.length} нэхэмжлэх — хөндөхгүй, нэмэгдсэн зардал нь ҮЛДЭНЭ`);
    alagssan.forEach((n) =>
      console.log(
        `   ∅ ${String(n.nekhemjlekhiinDugaar || n._id).padEnd(22)} ${new Date(n.ognoo).toISOString().slice(0, 10)}` +
          `  тоот ${String(n.toot || "—").padEnd(6)} ${n.gereeniiDugaar || ""}`,
      ),
    );
  }

  const ustgakhMur = sinkiinMur.filter((m) => butsaakhNekh.includes(String(m.nekhemjlekhId)));
  const ustgakhDun = ustgakhMur.reduce((s, m) => s + m.dun, 0);

  console.log(`\nБуцаагдах нэхэмжлэх: ${nekhMedeelel.length}`);
  nekhMedeelel
    .sort((a, b) => new Date(a.ognoo) - new Date(b.ognoo))
    .forEach((n) => {
      const mur = ustgakhMur.filter((m) => String(m.nekhemjlekhId) === String(n._id));
      console.log(
        `   • ${String(n.nekhemjlekhiinDugaar || n._id).padEnd(22)} ${new Date(n.ognoo).toISOString().slice(0, 10)}` +
          `  тоот ${String(n.toot || "—").padEnd(6)} ${String(n.gereeniiDugaar || "—").padEnd(14)}` +
          `${String(mur.length).padStart(3)} мөр  ${mun(mur.reduce((s, m) => s + m.dun, 0)).padStart(14)}  [${n.tuluv}]`,
      );
    });

  console.log(`\n  УСТГАХ: ${ustgakhMur.length} мөр  (−${mun(ustgakhDun)})`);
  console.log(
    `  ҮЛДЭЭХ: ${sinkiinMur.length - ustgakhMur.length} мөр — жинхэнэ нэхэмжлэхэд зөв нэмэгдсэн ` +
      `(${mun(sinkiinMur.reduce((s, m) => s + m.dun, 0) - ustgakhDun)})`,
  );

  if (!APPLY) {
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log("ТУРШИЛТ ДУУСЛАА — юу ч устгаагүй.  Гүйцэтгэхдээ `--apply` нэмнэ.");
    console.log("──────────────────────────────────────────────────────────────");
    return;
  }

  console.log("\n── Устгаж эхэллээ ──");
  const r = await LedgerModel.deleteMany({ _id: { $in: ustgakhMur.map((m) => m._id) } });
  console.log(`✅ ${r.deletedCount} мөр устгав`);

  // Нэхэмжлэхийн толгой, задаргааг нөхөж тохируулна
  for (const nekhId of butsaakhNekh) {
    const mur = await LedgerModel.find({ nekhemjlekhId: nekhId, dun: { $gt: 0 } })
      .select({ zardliinNer: 1, tailbar: 1, dun: 1, zardliinTurul: 1, turul: 1 })
      .lean();
    await NekhModel.updateOne(
      { _id: nekhId },
      {
        $set: {
          niitTulbur: mur.reduce((s, m) => s + (m.dun || 0), 0),
          "medeelel.zardluud": mur.map((m) => ({
            ner: m.zardliinNer || m.tailbar,
            dun: m.dun,
            turul: m.turul,
            zardliinTurul: m.zardliinTurul,
          })),
        },
      },
    );
  }
  console.log(`✅ ${butsaakhNekh.length} нэхэмжлэхийн дүнг сэргээв`);

  const gereenuud = [...new Set(ustgakhMur.map((m) => String(m.gereeniiId)).filter(Boolean))];
  for (const gid of gereenuud) await guilgeeService.syncInvoicesStatus(kholbolt, gid);
  console.log(`✅ ${gereenuud.length} гэрээний үлдэгдлийг дахин бодов`);

  console.log("\n── Дууслаа. SMS ИЛГЭЭГДСЭНГҮЙ. ──");
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
