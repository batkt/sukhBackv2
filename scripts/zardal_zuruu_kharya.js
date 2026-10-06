/**
 * Гэрээний зардлууд (`geree.zardluud`) БАРИЛГЫН жагсаалттай таарч байгаа
 * эсэхийг шалгана. ЗӨВХӨН УНШИНА.
 *
 * ЯАГААД: нэхэмжлэх нь барилгын `ashiglaltiinZardluud` цуглуулгаас БИШ,
 * гэрээн дээрх ХУУЛБАР (`geree.zardluud`)-аас тооцдог. Барилга дээр зардал
 * нэмэх/засахад өмнө үүссэн гэрээнүүд ШИНЭЧЛЭГДДЭГГҮЙ тул:
 *   - шинэ зардал хуучин гэрээнд ОРОХГҮЙ  → «дутуу»
 *   - гэрээн дээр нэг нэр хоёр удаа байвал → «давхардсан»
 * Мөн гэрээг Гараж/Агуулах гэж ангилвал орон сууцны ЗАРДАЛ БҮР хасагддаг
 * (utils/zardalAngilal.js). Энэ скрипт гурвууланг нь шалгана.
 *
 *   node scripts/zardal_zuruu_kharya.js <baaziinNer> [gereeniiDugaar]
 *   node scripts/zardal_zuruu_kharya.js kharKhorumSukh ГД-52371281
 *   node scripts/zardal_zuruu_kharya.js kharKhorumSukh          # БҮХ гэрээ
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт
 *   --zovkhon-aldaatai      зөвхөн зөрүүтэйг нь харуулна
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

function argValue(ner) {
  const i = process.argv.indexOf(ner);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** utils/zardalAngilal.js-тай ИЖИЛ дүрэм. */
function tootTurulKhevshuulekh(turul) {
  const t = String(turul || "").toLowerCase();
  if (t.includes("гараж") || t.includes("гараш") || t.includes("зогсоол")) return "Гараж";
  if (t.includes("агуулах")) return "Агуулах";
  return "Орон сууц";
}
function zardalAngilal(z) {
  return tootTurulKhevshuulekh(`${z?.ner || ""} ${z?.zardliinTurul || ""}`);
}

async function main() {
  const [, , baaziinNer, gereeniiDugaar] = process.argv;
  const uriBase = argValue("--uri") || DEFAULT_URI;
  const zovkhonAldaatai = process.argv.includes("--zovkhon-aldaatai");

  if (!baaziinNer) {
    console.error(
      "Хэрэглээ: node scripts/zardal_zuruu_kharya.js <baaziinNer> [gereeniiDugaar] [--zovkhon-aldaatai]",
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // ── Барилга бүрийн ЖИШИГ жагсаалт ──────────────────────────────────
    const barilgiinZardal = new Map(); // barilgiinId → [{ner, tariff}]
    const bukhZardal = await conn
      .collection("ashiglaltiinZardluud")
      .find({})
      .toArray();
    for (const z of bukhZardal) {
      const tulkhuur = String(z.barilgiinId || "");
      if (!barilgiinZardal.has(tulkhuur)) barilgiinZardal.set(tulkhuur, []);
      barilgiinZardal.get(tulkhuur).push(z);
    }
    console.log(
      `\n📚 ashiglaltiinZardluud: ${bukhZardal.length} мөр, ${barilgiinZardal.size} барилга`,
    );

    const shuult = gereeniiDugaar ? { gereeniiDugaar } : {};
    const gereenuud = await conn
      .collection("geree")
      .find(shuult)
      .limit(gereeniiDugaar ? 5 : 500)
      .toArray();

    console.log(`🔎 Шалгах гэрээ: ${gereenuud.length}\n`);

    let aldaatai = 0;
    for (const g of gereenuud) {
      const jishig = barilgiinZardal.get(String(g.barilgiinId || "")) || [];
      const gereeniiKh = Array.isArray(g.zardluud) ? g.zardluud : [];

      const jishigNer = new Set(
        jishig.map((z) => String(z.ner || "").trim().toLowerCase()),
      );
      const gereeNer = gereeniiKh.map((z) =>
        String(z.ner || "").trim().toLowerCase(),
      );

      // 1) Давхардсан нэр
      const too = new Map();
      for (const n of gereeNer) too.set(n, (too.get(n) || 0) + 1);
      const davkhardsan = [...too.entries()].filter(([, c]) => c > 1);

      // 2) Барилгад байгаа ч гэрээнд БАЙХГҮЙ
      const dutuu = [...jishigNer].filter((n) => !too.has(n));

      // 3) Гэрээнд байгаа ч барилгад БАЙХГҮЙ (хуучирсан/гар нэмэлт)
      const iluu = [...too.keys()].filter((n) => !jishigNer.has(n));

      // 4) Ангиллын шүүлт — гэрээг Гараж/Агуулах гэж үзвэл хэд нь үлдэх вэ
      const tootTurul = tootTurulKhevshuulekh(g.tootTurul);
      const shuusen =
        tootTurul === "Орон сууц"
          ? gereeniiKh
          : gereeniiKh.filter((z) => zardalAngilal(z) === tootTurul);
      const khasagdakh = gereeniiKh.length - shuusen.length;

      const asuudaltai =
        davkhardsan.length > 0 || dutuu.length > 0 || khasagdakh > 0;
      if (zovkhonAldaatai && !asuudaltai) continue;
      if (asuudaltai) aldaatai += 1;

      console.log(
        `${asuudaltai ? "⚠️ " : "✅ "}${g.gereeniiDugaar || g._id}  тоот=${g.toot}  ` +
          `tootTurul=${g.tootTurul === undefined ? "(тодорхойгүй)" : g.tootTurul}  ` +
          `зардал=${gereeniiKh.length} / барилгад=${jishig.length}`,
      );
      if (davkhardsan.length) {
        console.log(
          `    ДАВХАРДСАН: ${davkhardsan.map(([n, c]) => `"${n}" ×${c}`).join(", ")}`,
        );
      }
      if (dutuu.length) {
        console.log(`    ДУТУУ (барилгад бий, гэрээнд алга): ${dutuu.join(", ")}`);
      }
      if (iluu.length) {
        console.log(`    ИЛҮҮ (гэрээнд бий, барилгад алга): ${iluu.join(", ")}`);
      }
      if (khasagdakh > 0) {
        console.log(
          `    ⛔ АНГИЛЛААР ХАСАГДАНА: ${khasagdakh} зардал — энэ гэрээг "${tootTurul}" гэж үзэж байна!`,
        );
      }
    }

    console.log(
      `\n— Шалгасан ${gereenuud.length} гэрээнээс ${aldaatai} нь зөрүүтэй.`,
    );
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
