/**
 * Гэрээнээс зардал (Баримт, Тог цахилгаан г.м.) ЯАГААД алга болсныг
 * мөрдөнө. ЗӨВХӨН УНШИНА — юу ч засахгүй.
 *
 *   node scripts/zardal_alga_bolson_kharya.js <baaziinNer> [--ner "Баримт"]
 *   node scripts/zardal_alga_bolson_kharya.js timetower
 *   node scripts/zardal_alga_bolson_kharya.js timetower --ner "Тог цахилгаан"
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
 *   --sar 9                 тухайн сарын устгалыг онцолно (анхдагч: бүгд)
 *
 * СЭЖИГТЭЙ ЗАМ (utils/gereeniiZardalTseverlegee.js):
 *
 *   Ашиглалтын зардлыг УСТГАХАД тэр нэртэй мөрийг бүх гэрээнээс хасдаг
 *   (models/ashiglaltiinZardluud.js дахь post-delete hook).
 *
 *   ХОЁР ӨРГӨН ДҮРЭМ:
 *     1. `zardalAdilUu` нь ЗӨВХӨН НЭРЭЭР тааруулдаг. `turul` нь аль нэг
 *        талдаа хоосон бол «таарсан» гэж үзнэ. Тариф, барилга огт хардаггүй.
 *     2. `gereeniiShuult` нь устгагдсан зардал дээр `barilgiinId` БАЙХГҮЙ
 *        бол шүүлт нь зөвхөн `{baiguullagiinId}` болно — өөрөөр хэлбэл
 *        БАЙГУУЛЛАГЫН БҮХ ГЭРЭЭ.
 *
 *   Үр дүн: нэг барилгын «Баримт»-ыг устгахад БҮХ барилгын «Баримт» мөр
 *   гэрээнээс арилж, дараа сарын нэхэмжлэхэд ОРОХГҮЙ.
 *
 * Энэ скрипт юу хэлэх вэ:
 *   A. Одоогийн ашиглалтын зардлууд (нэр, төрөл, барилга, тариф).
 *   B. УСТГАСАН ашиглалтын зардлууд — хэн, хэзээ, ямар нэртэй (ustgakhTuukh).
 *   C. Нэр бүрээр: хэдэн идэвхтэй гэрээнд тэр мөр БАЙГАА / БАЙХГҮЙ,
 *      барилгаар задалсан. Нэг барилгад 0 байвал яг тэр арилсан гэсэн үг.
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

const ognooText = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toISOString().slice(0, 16).replace("T", " ");
  } catch (_e) {
    return String(d);
  }
};

function argAvya(argv, ner) {
  const i = argv.indexOf(ner);
  return i > -1 ? argv[i + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const uriBase = argAvya(argv, "--uri") || DEFAULT_URI;
  const shuultNer = argAvya(argv, "--ner");
  const sar = argAvya(argv, "--sar");

  // Тугийн УТГЫГ баазын нэр гэж андуурахгүй.
  const tugiinUtguud = new Set();
  ["--uri", "--ner", "--sar"].forEach((t) => {
    const i = argv.indexOf(t);
    if (i > -1) tugiinUtguud.add(i + 1);
  });
  const baaziinNer = argv.find(
    (a, i) => !a.startsWith("--") && !tugiinUtguud.has(i),
  );

  if (!baaziinNer) {
    console.error(
      'Хэрэглээ: node scripts/zardal_alga_bolson_kharya.js <baaziinNer> [--ner "Баримт"]',
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    console.log(`\n📦 Бааз: ${baaziinNer}`);

    // ── A. Одоогийн зардлууд ──────────────────────────────────────────
    const zardluud = await conn
      .collection("ashiglaltiinZardluud")
      .find({})
      .toArray();

    console.log(`\n${"=".repeat(70)}`);
    console.log(`A. ОДООГИЙН ашиглалтын зардал (${zardluud.length})`);
    console.log("=".repeat(70));
    for (const z of zardluud) {
      if (shuultNer && String(z.ner || "").trim() !== shuultNer) continue;
      console.log(
        `   • «${z.ner}» | turul=${z.turul || "—"} | tariff=${z.tariff ?? "—"}` +
          ` | barilgiinId=${z.barilgiinId || "БАЙХГҮЙ (бүх барилга!)"}`,
      );
    }

    // ── B. Устгасан зардлууд ──────────────────────────────────────────
    const ustgakhShuult = { modelName: "ashiglaltiinZardluud" };
    const ustsan = await conn
      .collection("ustgakhTuukh")
      .find(ustgakhShuult)
      .sort({ ognoo: -1 })
      .limit(200)
      .toArray();

    console.log(`\n${"=".repeat(70)}`);
    console.log(`B. УСТГАСАН ашиглалтын зардал (${ustsan.length})`);
    console.log("=".repeat(70));
    if (!ustsan.length) {
      console.log(
        "   Бүртгэл алга. АНХААР: аудит нь зөвхөн НЭВТЭРСЭН ажилтны хүсэлтийг",
      );
      console.log(
        "   бүртгэдэг — скрипт/cron-оор устгасан бол энд ХАРАГДАХГҮЙ.",
      );
    }
    for (const u of ustsan) {
      const d = u.deletedData || {};
      const sarTaarav =
        !sar || new Date(u.ognoo).getMonth() + 1 === Number(sar);
      const temdeg = sarTaarav ? "🔴" : "  ";
      if (shuultNer && String(d.ner || "").trim() !== shuultNer) continue;
      console.log(
        `   ${temdeg} ${ognooText(u.ognoo)} | «${d.ner || u.classNer || "?"}»` +
          ` | barilgiinId=${d.barilgiinId || "БАЙХГҮЙ (бүх барилгад нөлөөлсөн!)"}` +
          ` | устгасан: ${u.ajiltniiNer || u.ajiltniiNevtrekhNer || "?"}`,
      );
    }

    // ── C. Гэрээн дэх хамрагдалт ──────────────────────────────────────
    const neruud = new Set();
    if (shuultNer) neruud.add(shuultNer);
    else {
      zardluud.forEach((z) => z.ner && neruud.add(String(z.ner).trim()));
      ustsan.forEach((u) => {
        const n = u.deletedData?.ner;
        if (n) neruud.add(String(n).trim());
      });
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log("C. ИДЭВХТЭЙ ГЭРЭЭН дэх хамрагдалт (барилгаар)");
    console.log("=".repeat(70));

    const barilguud = await conn
      .collection("geree")
      .distinct("barilgiinId", { tuluv: "Идэвхтэй" });

    for (const ner of [...neruud].sort()) {
      console.log(`\n   ── «${ner}» ──`);
      for (const b of barilguud) {
        const niit = await conn
          .collection("geree")
          .countDocuments({ tuluv: "Идэвхтэй", barilgiinId: b });
        const tei = await conn.collection("geree").countDocuments({
          tuluv: "Идэвхтэй",
          barilgiinId: b,
          "zardluud.ner": ner,
        });
        const temdeg = tei === 0 ? "❌" : tei < niit ? "⚠️ " : "✅";
        console.log(
          `      ${temdeg} барилга ${b || "(хоосон)"}: ${tei}/${niit} гэрээнд байна`,
        );
      }
    }

    console.log(
      "\nТайлбар: ❌ = тэр барилгын БҮХ гэрээнээс арилсан (нэхэмжлэхэд орохгүй).",
    );
    console.log(
      "         ⚠️  = зарим гэрээнд л байна (хэсэгчлэн арилсан эсвэл хэсэгчлэн нэмсэн).",
    );
  } finally {
    await conn.close();
  }

  console.log("\nДууслаа.");
}

main().catch((aldaa) => {
  console.error(aldaa);
  process.exit(1);
});
