/**
 * ЖИНХЭНЭ нэхэмжлэх бодох функцийг (`calculateGereeCharges`) бодит
 * гэрээн дээр ажиллуулж, зардал бүр нэхэмжлэхэд ОРСОН эсэхийг харуулна.
 *
 * ЗӨВХӨН УНШИНА — `calculateGereeCharges` нь юу ч бичдэггүй, зөвхөн тооцоолно.
 *
 *   node scripts/zardal_tuurvul_kharya.js <baiguullagiinId> [--too 3]
 *   node scripts/zardal_tuurvul_kharya.js 6a9786569a202a8f8f859f94 --too 2
 *
 * Нэмэлт:
 *   --barilga <id>   зөвхөн тэр барилгыг
 *   --too <N>        барилга тус бүрээс хэдэн гэрээ үзэх (анхдагч 3)
 *   --geree <id>     ЯГ нэг гэрээг нарийвчлан
 *
 * ЮУ ХАРУУЛАХ ВЭ:
 *
 *   Гэрээн дээрх зардал бүрийг жагсаана — `turul`, `bodokhArga`, `tariff`,
 *   `suuriKhuraamj`, `zaalt` утгуудтай нь. Дараа нь ЯГ ТЭР гэрээгээр
 *   бодогдсон `charges`-ыг хэвлээд, аль зардал нь нэхэмжлэхэд ОРООГҮЙГ
 *   «ОРСОНГҮЙ» гэж тэмдэглэнэ.
 *
 *   Эцэст нь БАРИЛГА тус бүрээр хураангуй гаргана — нэг барилгад орж,
 *   нөгөөд нь ордоггүй зардал ЯГ энд харагдана.
 */
const path = require("path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/local.env" });
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });
process.env.TZ = process.env.TZ || "Asia/Ulaanbaatar";
process.setMaxListeners(0);

const express = require("express");
const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const Geree = require("../models/geree");
const { calculateGereeCharges } = require("../services/invoiceService");

const argv = process.argv.slice(2);
function tug(ner) {
  const i = argv.indexOf(ner);
  return i > -1 ? argv[i + 1] : null;
}
// Тугийн УТГЫГ байгууллагын ID гэж андуурахгүй.
//
// Өмнө нь `argv.indexOf(t) === i - 1` гэж шалгадаг байв. Туг байхгүй бол
// `indexOf` нь -1 буцаадаг бөгөөд эхний аргумент дээр `i - 1` мөн -1 тул
// ҮРГЭЛЖ таарч, байгууллагын ID хаягдаж байлаа.
const TUGNUUD = ["--too", "--barilga", "--geree"];
const tugiinUtguud = new Set();
for (const t of TUGNUUD) {
  const i = argv.indexOf(t);
  if (i > -1) tugiinUtguud.add(i + 1);
}
const BAIGUULLAGIIN_ID = argv.find(
  (a, i) => !a.startsWith("--") && !tugiinUtguud.has(i),
);
const TOO = Number(tug("--too")) || 3;
const ZOVKHON_BARILGA = tug("--barilga");
const ZOVKHON_GEREE = tug("--geree");

const mungu = (n) => Number(n || 0).toLocaleString("mn-MN");
const tur = (v) => (v === undefined || v === null || v === "" ? "—" : String(v));

/** Гэрээний нэг зардлын мөрийг хүн уншихаар хэвлэнэ. */
function zardalMur(z) {
  return (
    `«${tur(z.ner)}»`.padEnd(22) +
    ` turul=${tur(z.turul).padEnd(9)}` +
    ` bodokhArga=${tur(z.bodokhArga).padEnd(9)}` +
    ` tariff=${String(tur(z.tariff)).padStart(7)}` +
    ` suuri=${String(tur(z.suuriKhuraamj)).padStart(7)}` +
    ` zaalt=${z.zaalt === true ? "ТИЙМ" : "үгүй"}` +
    ` zardliinTurul=${tur(z.zardliinTurul)}`
  );
}

async function gereeShalgaya(kholbolt, geree, khuraangui) {
  const barilga = String(geree.barilgiinId || "(хоосон)");
  console.log(`\n${"─".repeat(78)}`);
  console.log(
    `📄 ${geree.gereeniiDugaar || geree._id} | тоот ${tur(geree.toot)} | давхар ${tur(geree.davkhar)}`,
  );
  console.log(
    `   барилга ${barilga} | tuluv=${tur(geree.tuluv)} | tootTurul=${tur(geree.tootTurul)}` +
      ` | khonogoorBodokh=${geree.khonogoorBodokhEsekh === true} | suuliinZaalt=${tur(geree.suuliinZaalt)} umnukhZaalt=${tur(geree.umnukhZaalt)}`,
  );

  const zardluud = geree.zardluud || [];
  console.log(`\n   ГЭРЭЭН ДЭЭРХ ЗАРДАЛ (${zardluud.length}):`);
  for (const z of zardluud) console.log(`      ${zardalMur(z)}`);

  let urDun;
  try {
    urDun = await calculateGereeCharges(kholbolt, geree, {
      billingDate: new Date(),
      isFirstInvoice: false,
    });
  } catch (aldaa) {
    console.log(`   ❌ calculateGereeCharges УНАВ: ${aldaa.message}`);
    return;
  }

  const { charges, total } = urDun;
  console.log(`\n   БОДОГДСОН ЗАРДАЛ (${charges.length}) — нийт ${mungu(total)}₮:`);
  for (const c of charges) {
    console.log(
      `      «${tur(c.ner)}`.padEnd(26) +
        `» ${String(mungu(c.dun)).padStart(10)}₮` +
        ` turul=${tur(c.turul)} zardliinTurul=${tur(c.zardliinTurul)}` +
        (c.isZaalt ? " [ЗААЛТААР]" : "") +
        (c.ledgerDeerBaigaa ? " [авлагад байсан]" : ""),
    );
  }

  // Гэрээнд байгаа атлаа бодогдоогүй зардлыг олно.
  const garsanNer = new Set(
    charges.map((c) => String(c.ner || "").trim().toLowerCase()),
  );
  const orookhgui = zardluud.filter(
    (z) => !garsanNer.has(String(z.ner || "").trim().toLowerCase()),
  );

  if (orookhgui.length) {
    console.log(`\n   ❌ НЭХЭМЖЛЭХЭД ОРСОНГҮЙ (${orookhgui.length}):`);
    for (const z of orookhgui) {
      console.log(`      ${zardalMur(z)}`);
    }
  } else {
    console.log("\n   ✅ Гэрээн дээрх бүх зардал нэхэмжлэхэд оров.");
  }

  // Барилгын хураангуйд бүртгэнэ.
  if (!khuraangui.has(barilga)) khuraangui.set(barilga, new Map());
  const b = khuraangui.get(barilga);
  for (const z of zardluud) {
    const ner = String(z.ner || "").trim();
    if (!b.has(ner)) b.set(ner, { orson: 0, orsongui: 0 });
    const t = b.get(ner);
    if (garsanNer.has(ner.toLowerCase())) t.orson += 1;
    else t.orsongui += 1;
  }
}

async function main() {
  if (!BAIGUULLAGIIN_ID) {
    console.error(
      "Хэрэглээ: node scripts/zardal_tuurvul_kharya.js <baiguullagiinId> [--too 3]",
    );
    process.exit(1);
  }

  console.log("=== ЗАРДАЛ БОДОЛТЫН ТУУРВИЛ (зөвхөн уншина) ===");
  console.log(`  baiguullagiinId: ${BAIGUULLAGIIN_ID}`);

  // Аппын холболтыг яг `zardal_shalgakh.js`-тай ижилээр босгоно —
  // `calculateGereeCharges` нь дотроо `db.erunkhiiKholbolt`-ыг шаарддаг.
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
    console.error("❌ Байгууллагын холболт олдсонгүй.");
    process.exit(1);
  }
  console.log(
    "Өгөгдлийн сан:",
    kholbolt.kholbolt?.db?.databaseName ?? "(тодорхойгүй)",
  );

  const GereeModel = Geree(kholbolt);
  const khuraangui = new Map();

  if (ZOVKHON_GEREE) {
    const mongoose = require("mongoose");
    const geree = await GereeModel.collection.findOne({
      _id: new mongoose.Types.ObjectId(ZOVKHON_GEREE),
    });
    if (!geree) {
      console.error("❌ Гэрээ олдсонгүй.");
      process.exit(1);
    }
    await gereeShalgaya(kholbolt, geree, khuraangui);
  } else {
    const barilguud = ZOVKHON_BARILGA
      ? [ZOVKHON_BARILGA]
      : await GereeModel.collection.distinct("barilgiinId", {
          tuluv: "Идэвхтэй",
        });

    for (const b of barilguud) {
      const gereenuud = await GereeModel.collection
        .find({ tuluv: "Идэвхтэй", barilgiinId: b, "zardluud.0": { $exists: true } })
        .limit(TOO)
        .toArray();

      console.log(`\n${"=".repeat(78)}`);
      console.log(`🏢 БАРИЛГА ${b} — шалгах гэрээ: ${gereenuud.length}`);
      console.log("=".repeat(78));

      for (const g of gereenuud) {
        await gereeShalgaya(kholbolt, g, khuraangui);
      }
    }
  }

  // ── Барилгаар хураангуй ────────────────────────────────────────────
  console.log(`\n${"=".repeat(78)}`);
  console.log("ХУРААНГУЙ — зардал бүр барилга тус бүрд нэхэмжлэхэд орсон эсэх");
  console.log("=".repeat(78));
  for (const [b, neruud] of khuraangui) {
    console.log(`\n🏢 ${b}`);
    for (const [ner, t] of [...neruud].sort()) {
      const temdeg = t.orsongui === 0 ? "✅" : t.orson === 0 ? "❌" : "⚠️ ";
      console.log(
        `   ${temdeg} «${ner}»`.padEnd(32) +
          ` оров ${String(t.orson).padStart(3)} | ОРСОНГҮЙ ${String(t.orsongui).padStart(3)}`,
      );
    }
  }

  console.log("\n=== Дууслаа (юу ч бичигдээгүй) ===");
  process.exit(0);
}

main().catch((aldaa) => {
  console.error(aldaa);
  process.exit(1);
});
