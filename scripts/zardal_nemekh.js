/**
 * Дутуу зардлыг нэхэмжлэхүүдэд НЭМНЭ (жишээ нь «Баримт»).
 *
 * ── Үндсэн горим нь ХУУРАМЧ (dry-run) ───────────────────────────────────
 * Юу өөрчлөхөө хэвлээд зогсоно. Бичихийн тулд `--tavikh` туг заавал.
 *
 *   node scripts/zardal_nemekh.js <baiguullagiinId> <зардал> <сарууд>
 *   node scripts/zardal_nemekh.js <baiguullagiinId> <зардал> <сарууд> --tavikh
 *
 * Жишээ:
 *   node scripts/zardal_nemekh.js 6a9786569a202a8f8f859f94 Баримт 2026-09,2026-10
 *
 * ── Хоёр ангиллыг ӨӨР ӨӨРӨӨР засна ──────────────────────────────────────
 * Нэхэмжлэхийн `medeelel.zardluud` нь АГШНЫ ХУУЛБАР, харин үлдэгдэл нь
 * ledger (`guilgeeAvlaguud`) -ээс бодогддог.
 *
 *   ledger дээр БИЙ   → мөнгө аль хэдийн тооцогдсон. Зөвхөн хуулбарыг
 *                       нөхнө. Ledger-т ДАХИН бичвэл хоёр дахин төлүүлнэ.
 *   ledger дээр АЛГА  → `recordCharge`-аар бичнэ. Тэр нь дотроо
 *                       `syncInvoicesStatus` дуудаж `niitTulbur` ба
 *                       `tuluv`-ыг ledger-ээс дахин бодно — иймээс дүнг
 *                       энэ script ГАРААР хөндөхгүй.
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
const guilgeeService = require("../services/guilgeeService");

const argv = process.argv.slice(2);
const TAVIKH = argv.includes("--tavikh");
const [BAIGUULLAGIIN_ID, ZARDLIIN_NER, SARUUD_TEKST] = argv.filter((a) => !a.startsWith("--"));

if (!BAIGUULLAGIIN_ID || !ZARDLIIN_NER || !SARUUD_TEKST) {
  console.error("Хэрэглээ: node scripts/zardal_nemekh.js <baiguullagiinId> <зардал> <2026-09,2026-10> [--tavikh]");
  process.exit(1);
}

const SARUUD = new Set(SARUUD_TEKST.split(",").map((s) => s.trim()).filter(Boolean));

const tulkhuur = (s) => String(s || "").trim().toLowerCase();

/** УБ-ийн цагаар `YYYY-MM`. */
function ubSar(d) {
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return "";
  const x = new Date(t + 8 * 60 * 60 * 1000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ekhniiUldegdelKhaanaa(nekh) {
  const z = nekh?.medeelel?.zardluud;
  if (!Array.isArray(z) || z.length === 0) return false;
  return z.every((x) => x?.isEkhniiUldegdel === true);
}

async function main() {
  console.log("=== ДУТУУ ЗАРДАЛ НЭМЭХ ===");
  console.log("  baiguullagiinId:", BAIGUULLAGIIN_ID);
  console.log("  зардал         :", ZARDLIIN_NER);
  console.log("  сарууд         :", [...SARUUD].join(", "));
  console.log("  горим          :", TAVIKH ? "⚠️  БИЧНЭ (--tavikh)" : "хуурамч (юу ч бичихгүй)");
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
    console.error("❌ Холболт олдсонгүй");
    process.exit(1);
  }
  console.log("Өгөгдлийн сан:", kholbolt.kholbolt?.db?.databaseName ?? "(тодорхойгүй)");
  console.log("");

  const NekhModel = NekhemjlekhiinTuukh(kholbolt);

  // ── Гэрээнүүд ────────────────────────────────────────────────────────
  const gereenuud = await Geree(kholbolt)
    .find({ baiguullagiinId: BAIGUULLAGIIN_ID })
    .lean();

  const gereeMap = new Map();
  for (const g of gereenuud) {
    const z = (g.zardluud || []).find((x) => tulkhuur(x.ner) === tulkhuur(ZARDLIIN_NER));
    if (z) gereeMap.set(String(g._id), { geree: g, zardal: z });
  }
  console.log(`«${ZARDLIIN_NER}»-тай гэрээ: ${gereeMap.size} / ${gereenuud.length}`);

  // ── Ledger дээр аль нэхэмжлэхэд бичигдсэн ────────────────────────────
  const ledgerMuruud = await GuilgeeAvlaguud(kholbolt)
    .find({
      baiguullagiinId: BAIGUULLAGIIN_ID,
      zardliinNer: new RegExp(`^${ZARDLIIN_NER}$`, "i"),
    })
    .select({ nekhemjlekhId: 1 })
    .lean();
  const ledgerTei = new Set(ledgerMuruud.map((m) => String(m.nekhemjlekhId || "")).filter(Boolean));
  console.log(`Ledger дээрх «${ZARDLIIN_NER}» мөр: ${ledgerMuruud.length}`);
  console.log("");

  // ── Нэхэмжлэхүүд ─────────────────────────────────────────────────────
  const nekhemjlekhuud = await NekhModel.find({ baiguullagiinId: BAIGUULLAGIIN_ID }).lean();

  const khiikh = [];
  let algasav = 0;
  for (const n of nekhemjlekhuud) {
    if (!SARUUD.has(ubSar(n.ognoo))) continue;
    if (ekhniiUldegdelKhaanaa(n)) continue;

    const g = gereeMap.get(String(n.gereeniiId));
    if (!g) continue;

    // Нэхэмжлэхийн хуулбарт аль хэдийн бий — алгасна.
    const zardluud = Array.isArray(n.medeelel?.zardluud) ? n.medeelel.zardluud : [];
    if (zardluud.some((z) => tulkhuur(z.ner) === tulkhuur(ZARDLIIN_NER))) continue;

    // Ledger дээр бий — ӨР НЬ АЛЬ ХЭДИЙН тооцогдсон, алгасна.
    //
    // Эдгээр нь «хэрэглэгч Баримттай» бүлэг. Дахин бичвэл хоёр дахин
    // төлүүлнэ, хуулбарыг нь нөхөх нь ч дүнг өөрчлөхгүй тул хөндөхгүй.
    if (ledgerTei.has(String(n._id))) {
      algasav += 1;
      continue;
    }

    khiikh.push({ nekh: n, geree: g.geree, zardal: g.zardal });
  }

  const nemekhDun = khiikh.reduce(
    (s, x) => s + Number(x.zardal.dun || x.zardal.tariff || 0),
    0,
  );

  console.log(`Ledger дээр аль хэдийн байсан (алгасав): ${algasav}`);
  console.log(`Засах нэхэмжлэх: ${khiikh.length}`);
  console.log(`  нэмэгдэх дүн : ${nemekhDun.toLocaleString("en-US")}`);
  console.log("");

  if (!TAVIKH) {
    console.log("Эхний 10 жишээ:");
    for (const x of khiikh.slice(0, 10)) {
      console.log(
        `  ${x.nekh.nekhemjlekhiinDugaar || x.nekh._id}  ${ubSar(x.nekh.ognoo)}  ` +
          `${Number(x.zardal.dun || x.zardal.tariff || 0)}₮  ${x.nekh.tuluv || ""}`,
      );
    }
    console.log("");
    console.log("=== ХУУРАМЧ ГОРИМ — юу ч бичигдээгүй ===");
    console.log("Бичихийн тулд: --tavikh");
    process.exit(0);
  }

  // ── Бичих ────────────────────────────────────────────────────────────
  let amjilt = 0;
  let aldaa = 0;

  for (let i = 0; i < khiikh.length; i += 1) {
    const x = khiikh[i];
    const dun = Number(x.zardal.dun || x.zardal.tariff || 0);
    try {
      {
        // Ledger-т бичнэ. `recordCharge` нь дотроо `syncInvoicesStatus`
        // дуудаж `niitTulbur` ба `tuluv`-ыг дахин бодно.
        //
        // SMS, мэдэгдэл АСАХГҮЙ — `guilgeeService` дотор тийм код байхгүй,
        // нэхэмжлэхийн SMS нь зөвхөн cron-ийн замаас явдаг.
        await guilgeeService.recordCharge(kholbolt, {
          ...x.geree,
          _id: undefined,
          gereeniiId: String(x.geree._id),
          ...(x.zardal.toot ? { toot: x.zardal.toot } : {}),
          nekhemjlekhId: String(x.nekh._id),
          dun,
          zardliinNer: x.zardal.ner,
          tailbar: x.zardal.tailbar || x.zardal.ner,
          zardliinTurul: x.zardal.zardliinTurul,
          turul: x.zardal.turul || x.geree.turul || "avlaga",
          ognoo: x.nekh.ognoo,
          source: "nekhemjlekh",
          ekhniiUldegdelEsekh: false,
          guilgeeKhiisenAjiltniiNer: "Систем",
          guilgeeKhiisenAjiltniiId: x.geree.orshinSuugchId,
        });
      }

      // Нэхэмжлэхийн хуулбарыг нөхнө.
      await NekhModel.updateOne(
        { _id: x.nekh._id },
        {
          $push: {
            "medeelel.zardluud": {
              ner: x.zardal.ner,
              dun,
              turul: x.zardal.turul || "Тогтмол",
              zardliinTurul: x.zardal.zardliinTurul || "Энгийн",
              tariff: Number(x.zardal.tariff || 0),
              tulukhDun: dun,
            },
          },
        },
      );

      amjilt += 1;
      if ((i + 1) % 25 === 0 || i === khiikh.length - 1) {
        console.log(`  [${i + 1}/${khiikh.length}] амжилт=${amjilt} алдаа=${aldaa}`);
      }
    } catch (e) {
      aldaa += 1;
      console.error(`  ❌ ${x.nekh.nekhemjlekhiinDugaar || x.nekh._id}: ${e.message}`);
    }
  }

  console.log("");
  console.log(`=== Дууслаа — амжилт ${amjilt}, алдаа ${aldaa} ===`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
