/**
 * 2026-09 сарын нэхэмжлэхүүдэд дутуу байгаа «Баримт» (100₮)-ыг
 * guilgeeAvlaguud (ledger) болон nekhemjlekhiinTuukh.medeelel.zardluud-д нөхөн оруулах скрипт.
 *
 * Үндсэн горим: ХУУРАМЧ (dry-run).
 * Бодитоор бичихийн тулд: --tavikh залгана.
 *
 * Хэрэглээ:
 *   node scripts/timetower_barimt_nokhokh.js [baaziinNer] [--dun 100] [--tavikh]
 *
 * Жишээ:
 *   node scripts/timetower_barimt_nokhokh.js timetower
 *   node scripts/timetower_barimt_nokhokh.js timetower --tavikh
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

function ubSar(d) {
  if (!d) return "(огноогүй)";
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return "(огноогүй)";
  const x = new Date(t + UB_OFFSET_MS);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

function argAvya(argv, ner) {
  const i = argv.indexOf(ner);
  return i > -1 ? argv[i + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const uriBase = argAvya(argv, "--uri") || DEFAULT_URI;
  const tavikh = argv.includes("--tavikh");
  const defaultDun = Number(argAvya(argv, "--dun")) || 100;
  const sar = argAvya(argv, "--sar") || "2026-09";

  const tugiinUtguud = new Set();
  ["--uri", "--dun", "--sar"].forEach((t) => {
    const i = argv.indexOf(t);
    if (i > -1) tugiinUtguud.add(i + 1);
  });
  const baaziinNer =
    argv.find((a, i) => !a.startsWith("--") && !tugiinUtguud.has(i)) ||
    "timetower";

  console.log("=".repeat(80));
  console.log(`🛠  «БАРИМТ» ЗАРДАЛ НӨХӨН БИЧИХ СКРИПТ`);
  console.log(`   Өгөгдлийн сан : ${baaziinNer}`);
  console.log(`   Зорилтот сар  : ${sar}`);
  console.log(`   Баримтын дүн  : ${defaultDun}₮`);
  console.log(`   Горим         : ${tavikh ? "⚠️  БОДИТ БИЧИЛТ (--tavikh)" : "ХУУРАМЧ / ШАЛГАЛТ (юу ч өөрчлөхгүй)"}`);
  console.log("=".repeat(80));

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // 1. Тухайн сарын нэхэмжлэхүүд
    const allInvoices = await conn.collection("nekhemjlekhiinTuukh").find({}).toArray();
    const sarInvoices = allInvoices.filter((inv) => ubSar(inv.ognoo) === sar);
    console.log(`\n📌 ${sar} сарын нийт нэхэмжлэх: ${sarInvoices.length}`);

    // 2. Тухайн сарын нэхэмжлэхэд хамаарах «Баримт» авлагууд
    const invIds = sarInvoices.map((inv) => String(inv._id));
    const barimtRows = await conn
      .collection("guilgeeAvlaguud")
      .find({
        nekhemjlekhId: { $in: invIds },
        zardliinNer: new RegExp("^баримт$", "i"),
      })
      .toArray();

    const barimtNekhSet = new Set(barimtRows.map((r) => String(r.nekhemjlekhId)));
    console.log(`   guilgeeAvlaguud дээр «Баримт» бичигдсэн нэхэмжлэх: ${barimtNekhSet.size}`);

    // 3. Дутуу нэхэмжлэхүүдийг ялгах
    const dutuuInvoices = [];
    for (const inv of sarInvoices) {
      if (!barimtNekhSet.has(String(inv._id))) {
        dutuuInvoices.push(inv);
      }
    }

    console.log(`   🚨 «Баримт» ДУТУУ нэхэмжлэх: ${dutuuInvoices.length}`);
    console.log(`   Нэмэгдэх нийт дүн: ${(dutuuInvoices.length * defaultDun).toLocaleString()}₮\n`);

    if (dutuuInvoices.length === 0) {
      console.log("✅ Бүх нэхэмжлэхэд «Баримт» бүрэн байна. Хийх ажил алга.");
      return;
    }

    // Эхний 10 жишээ
    console.log("Жишээ тоотууд (эхний 10):");
    dutuuInvoices.slice(0, 10).forEach((inv, idx) => {
      console.log(`  [${idx + 1}] Тоот: ${String(inv.toot).padStart(4)} | Гэрээ: ${inv.gereeniiDugaar || inv.gereeniiId} | Нэхэмжлэх ID: ${inv._id}`);
    });

    if (!tavikh) {
      console.log("\n" + "=".repeat(80));
      console.log("ℹ️  Энэ бол хуурамч (dry-run) шалгалт байлаа. Бодитоор засахын тулд:");
      console.log(`    node scripts/timetower_barimt_nokhokh.js ${baaziinNer} --tavikh`);
      console.log("=".repeat(80));
      return;
    }

    // 4. Бодитоор бичих (--tavikh)
    console.log("\n🚀 Бодитоор бичиж байна...");
    let amjilt = 0;
    let aldaa = 0;

    for (let i = 0; i < dutuuInvoices.length; i++) {
      const inv = dutuuInvoices[i];
      try {
        const iId = String(inv._id);
        const gId = String(inv.gereeniiId || "");

        // А) guilgeeAvlaguud үүсгэх
        await conn.collection("guilgeeAvlaguud").insertOne({
          baiguullagiinId: inv.baiguullagiinId,
          baiguullagiinNer: inv.baiguullagiinNer || "Тайм тауэр СӨХ",
          barilgiinId: inv.barilgiinId,
          gereeniiId: gId,
          gereeniiDugaar: inv.gereeniiDugaar,
          orshinSuugchId: inv.orshinSuugchId,
          nekhemjlekhId: iId,
          toot: inv.toot,
          toots: inv.toots || [],
          ognoo: inv.ognoo || new Date(),
          dun: defaultDun,
          undsenDun: defaultDun,
          tulukhDun: defaultDun,
          tulukhAldangi: 0,
          tulsunDun: 0,
          tulsunAldangi: 0,
          turul: "Тогтмол",
          zardliinTurul: "Энгийн",
          zardliinNer: "Баримт",
          tailbar: "Баримт",
          source: "nekhemjlekh",
          nekhemjlekhDeerKharagdakh: true,
          nuatBodokhEsekh: true,
          ekhniiUldegdelEsekh: false,
          guilgeeKhiisenAjiltniiNer: "Систем",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Б) nekhemjlekhiinTuukh.medeelel.zardluud шинэчлэх ба niitTulbur нэмэх
        const medeelel = inv.medeelel || {};
        const zardluud = Array.isArray(medeelel.zardluud) ? medeelel.zardluud : [];
        const barimtZardal = {
          ner: "Баримт",
          dun: defaultDun,
          turul: "Тогтмол",
          zardliinTurul: "Энгийн",
          tariff: defaultDun,
          tulukhDun: defaultDun,
        };

        const hasInNekh = zardluud.some((z) => (z.ner || "").trim().toLowerCase() === "баримт");
        const updatedZardluud = hasInNekh ? zardluud : [...zardluud, barimtZardal];
        const newNiitTulbur = Number(inv.niitTulbur || 0) + (hasInNekh ? 0 : defaultDun);

        await conn.collection("nekhemjlekhiinTuukh").updateOne(
          { _id: inv._id },
          {
            $set: {
              "medeelel.zardluud": updatedZardluud,
              niitTulbur: newNiitTulbur,
              updatedAt: new Date(),
            },
          }
        );

        amjilt += 1;
        if ((i + 1) % 25 === 0 || i === dutuuInvoices.length - 1) {
          console.log(`  [${i + 1}/${dutuuInvoices.length}] Амжилттай: ${amjilt}, Алдаа: ${aldaa}`);
        }
      } catch (err) {
        aldaa += 1;
        console.error(`  ❌ Алдаа (Тоот: ${inv.toot}):`, err.message);
      }
    }

    console.log(`\n🎉 Дууслаа! Нийт ${amjilt} нэхэмжлэхэд «Баримт» (100₮) амжилттай нөхөгдлөө.`);
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error("❌ Алдаа:", err);
  process.exit(1);
});
