/**
 * Нэхэмжлэхүүд дээр тодорхой ЗАРДАЛ (жишээ нь «Баримт») байгаа эсэхийг шалгана.
 *
 * ЗӨВХӨН УНШИНА — ямар ч бичилт хийхгүй. Засвар хийхээс өмнө хэмжээг нь
 * мэдэхэд зориулагдсан.
 *
 * Ажиллуулах:
 *   node scripts/zardal_shalgakh.js <baiguullagiinId> [зардлын нэр]
 *
 * Жишээ:
 *   node scripts/zardal_shalgakh.js 6a9786569a202a8f8f859f94 Баримт
 *
 * Гаралт:
 *   • сар тутмын задаргаа — хэдэн нэхэмжлэхэд тэр зардал дутуу байна
 *   • төлбөрийн нөлөө (дутуу зардлын нийлбэр)
 *   • төлсөн / төлөөгүй задаргаа — ТӨЛСӨН нэхэмжлэхэд зардал нэмбэл
 *     дутуу төлөлт үүснэ, тиймээс тусад нь тоолно
 *   • ledger (`guilgeeAvlaguud`) дээр тэр мөр байгаа эсэх
 */

const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/local.env" });
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });
process.env.TZ = process.env.TZ || "Asia/Ulaanbaatar";
process.setMaxListeners(0);

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

const BAIGUULLAGIIN_ID = process.argv[2];
const ZARDLIIN_NER = process.argv[3] || "Баримт";

if (!BAIGUULLAGIIN_ID) {
  console.error("Хэрэглээ: node scripts/zardal_shalgakh.js <baiguullagiinId> [зардлын нэр]");
  process.exit(1);
}

/** Нэрийг жижиг үсэг, зайгүй болгож харьцуулна — бичилтийн зөрүүг тэвчинэ. */
const tulkhuur = (s) => String(s || "").trim().toLowerCase();

/** УБ-ийн цагаар `YYYY-MM` — тайланг сараар бүлэглэхэд. */
function ubSar(d) {
  if (!d) return "(огноогүй)";
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return "(огноогүй)";
  const x = new Date(t + 8 * 60 * 60 * 1000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Эхний үлдэгдлийн импорт — сарын нэхэмжлэх биш тул тоонд оруулахгүй. */
function ekhniiUldegdelKhaanaa(nekh) {
  const z = nekh?.medeelel?.zardluud;
  if (!Array.isArray(z) || z.length === 0) return false;
  return z.every((x) => x?.isEkhniiUldegdel === true);
}

async function main() {
  console.log("=== ЗАРДЛЫН ШАЛГАЛТ (зөвхөн уншина) ===");
  console.log("  baiguullagiinId:", BAIGUULLAGIIN_ID);
  console.log("  зардлын нэр    :", ZARDLIIN_NER);
  console.log("");

  const app = express();
  db.kholboltUusgey(
    app,
    process.env.MONGODB_URI ||
      "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin",
  );

  console.log("Холболт хүлээж байна (4с)...");
  await new Promise((r) => setTimeout(r, 4000));

  const kholbolt = getKholboltByBaiguullagiinId(BAIGUULLAGIIN_ID);
  if (!kholbolt) {
    console.error("❌ Тэр байгууллагын холболт олдсонгүй");
    process.exit(1);
  }
  console.log("Өгөгдлийн сан:", kholbolt.kholbolt?.db?.databaseName ?? "(тодорхойгүй)");
  console.log("");

  // ── 1. Гэрээнүүд дээр тэр зардал байгаа эсэх ─────────────────────────
  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId: BAIGUULLAGIIN_ID })
    .select({ gereeniiDugaar: 1, zardluud: 1, tuluv: 1 })
    .lean();

  const gereeMap = new Map();
  let gereeTeiZardal = 0;
  for (const g of gereenuud) {
    const oldson = (g.zardluud || []).find((z) => tulkhuur(z.ner) === tulkhuur(ZARDLIIN_NER));
    if (oldson) gereeTeiZardal += 1;
    gereeMap.set(String(g._id), {
      dugaar: g.gereeniiDugaar,
      baina: !!oldson,
      tarif: Number(oldson?.dun || oldson?.tariff || 0),
    });
  }

  console.log(`Гэрээ: ${gereenuud.length}, тэдгээрээс «${ZARDLIIN_NER}»-тай: ${gereeTeiZardal}`);
  console.log("");

  // ── 2. Нэхэмжлэхүүдийг шалгах ────────────────────────────────────────
  const nekhemjlekhuud = await NekhemjlekhiinTuukh(kholbolt)
    .find({ baiguullagiinId: BAIGUULLAGIIN_ID })
    .select({ gereeniiId: 1, ognoo: 1, niitTulbur: 1, tuluv: 1, medeelel: 1, nekhemjlekhiinDugaar: 1 })
    .lean();

  // Ledger дээр тэр зардал АЛЬ нэхэмжлэхэд бичигдсэнийг индекслэнэ.
  //
  // ЧУХАЛ: нэхэмжлэхийн `medeelel.zardluud` нь зөвхөн АГШНЫ ХУУЛБАР, харин
  // үлдэгдэл нь ledger-ээс бодогддог. Ledger дээр аль хэдийн бичигдсэн
  // зардлыг дахин нэмбэл оршин суугч ХОЁР ДАХИН төлнө.
  const ledgerMuruud = await GuilgeeAvlaguud(kholbolt)
    .find({
      baiguullagiinId: BAIGUULLAGIIN_ID,
      zardliinNer: new RegExp(`^${ZARDLIIN_NER}$`, "i"),
    })
    .select({ nekhemjlekhId: 1, gereeniiId: 1 })
    .lean();

  const ledgerNekhemjlekhuud = new Set(
    ledgerMuruud.map((m) => String(m.nekhemjlekhId || "")).filter(Boolean),
  );

  const saruud = new Map();
  let niitDutuu = 0;
  let zevkhunKhuulbarDutuu = 0;
  let buremUgui = 0;
  let niitDun = 0;
  let tulsunDutuu = 0;
  let ekhniiUldegdelAlgasav = 0;
  let gereegui = 0;

  for (const n of nekhemjlekhuud) {
    if (ekhniiUldegdelKhaanaa(n)) {
      ekhniiUldegdelAlgasav += 1;
      continue;
    }

    const g = gereeMap.get(String(n.gereeniiId));
    if (!g) {
      gereegui += 1;
      continue;
    }
    // Гэрээнд тэр зардал байхгүй бол нэхэмжлэхэд ч байх ёсгүй.
    if (!g.baina) continue;

    const zardluud = Array.isArray(n.medeelel?.zardluud) ? n.medeelel.zardluud : [];
    const baina = zardluud.some((z) => tulkhuur(z.ner) === tulkhuur(ZARDLIIN_NER));
    if (baina) continue;

    // Ledger дээр бий юу? Байвал мөнгө аль хэдийн тооцогдсон — зөвхөн
    // нэхэмжлэхийн хуулбар дутуу, дүн өөрчлөх ШААРДЛАГАГҮЙ.
    const ledgerTeiEsekh = ledgerNekhemjlekhuud.has(String(n._id));

    const sar = ubSar(n.ognoo);
    if (!saruud.has(sar)) {
      saruud.set(sar, { too: 0, dun: 0, tulsun: 0, khuulbar: 0 });
    }
    const mur = saruud.get(sar);
    mur.too += 1;
    if (ledgerTeiEsekh) {
      mur.khuulbar += 1;
      zevkhunKhuulbarDutuu += 1;
    } else {
      mur.dun += g.tarif;
      buremUgui += 1;
      niitDun += g.tarif;
    }
    if (String(n.tuluv || "").includes("Төлсөн")) {
      mur.tulsun += 1;
      tulsunDutuu += 1;
    }

    niitDutuu += 1;
  }

  // ── 3. Тайлан ────────────────────────────────────────────────────────
  console.log(`Нэхэмжлэх нийт: ${nekhemjlekhuud.length}`);
  console.log(`  эхний үлдэгдлийн импорт (алгассан): ${ekhniiUldegdelAlgasav}`);
  console.log(`  гэрээ нь олдоогүй (алгассан)      : ${gereegui}`);
  console.log("");
  console.log(`«${ZARDLIIN_NER}» ДУТУУ нэхэмжлэх: ${niitDutuu}`);
  console.log("");

  if (saruud.size > 0) {
    console.log("  сар       дутуу   ledger-тэй   огт алга   нэмэх дүн   төлсөн");
    console.log("  --------  ------  -----------  ---------  ----------  ------");
    for (const sar of [...saruud.keys()].sort()) {
      const m = saruud.get(sar);
      const ogtAlga = m.too - m.khuulbar;
      console.log(
        `  ${sar.padEnd(8)}  ${String(m.too).padStart(6)}  ${String(m.khuulbar).padStart(11)}  ` +
          `${String(ogtAlga).padStart(9)}  ${m.dun.toLocaleString("en-US").padStart(10)}  ${String(m.tulsun).padStart(6)}`,
      );
    }
    console.log("  --------  ------  -----------  ---------  ----------  ------");
    console.log(
      `  НИЙТ      ${String(niitDutuu).padStart(6)}  ${String(zevkhunKhuulbarDutuu).padStart(11)}  ` +
        `${String(buremUgui).padStart(9)}  ${niitDun.toLocaleString("en-US").padStart(10)}  ${String(tulsunDutuu).padStart(6)}`,
    );
    console.log("");
    console.log("  ledger-тэй = мөнгө аль хэдийн тооцогдсон, зөвхөн нэхэмжлэхийн");
    console.log("               хуулбар дутуу. Дүн нэмэх ШААРДЛАГАГҮЙ.");
    console.log("  огт алга   = ledger дээр ч байхгүй. Зардал ба дүн хоёуланг нэмнэ.");
  }

  // ── 4. Ledger дээр тэр мөр байгаа эсэх ───────────────────────────────
  const ledgerToo = await GuilgeeAvlaguud(kholbolt).countDocuments({
    baiguullagiinId: BAIGUULLAGIIN_ID,
    zardliinNer: new RegExp(`^${ZARDLIIN_NER}$`, "i"),
  });
  console.log("");
  console.log(`Ledger (guilgeeAvlaguud) дээрх «${ZARDLIIN_NER}» мөр: ${ledgerToo}`);

  if (tulsunDutuu > 0) {
    console.log("");
    console.log(`⚠️  ${tulsunDutuu} нэхэмжлэх нь ТӨЛСӨН төлөвтэй. Тэдэнд зардал нэмбэл`);
    console.log("    дутуу төлөлт үүснэ — тэднийг засах эсэхийг тусад нь шийдэх хэрэгтэй.");
  }

  console.log("");
  console.log("=== Дууслаа (юу ч бичигдээгүй) ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
