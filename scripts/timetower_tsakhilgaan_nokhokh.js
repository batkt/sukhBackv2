/**
 * 2026-10 сарын нэхэмжлэхүүдэд дутуу байгаа «Тог цахилгаан» зардлыг
 * гэрээний тогтмол дүн (geree.zardluud) болон ашиглалтын зардлаас уншиж,
 * guilgeeAvlaguud болон nekhemjlekhiinTuukh-д нөхөн оруулах скрипт.
 *
 * Үндсэн горим: ХУУРАМЧ (dry-run).
 * Бодитоор бичихийн тулд: --tavikh залгана.
 *
 * Хэрэглээ:
 *   node scripts/timetower_tsakhilgaan_nokhokh.js [baaziinNer] [--tavikh]
 *   node scripts/timetower_tsakhilgaan_nokhokh.js timetower --dun 8000 [--tavikh]
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
  const forceDun = argAvya(argv, "--dun") ? Number(argAvya(argv, "--dun")) : null;
  const sar = argAvya(argv, "--sar") || "2026-10";

  const tugiinUtguud = new Set();
  ["--uri", "--dun", "--sar"].forEach((t) => {
    const i = argv.indexOf(t);
    if (i > -1) tugiinUtguud.add(i + 1);
  });
  const baaziinNer =
    argv.find((a, i) => !a.startsWith("--") && !tugiinUtguud.has(i)) ||
    "timetower";

  console.log("=".repeat(85));
  console.log(`🛠  «ТОГ ЦАХИЛГААН» ЗАРДАЛ НӨХӨН БИЧИХ СКРИПТ (10-р сар)`);
  console.log(`   Өгөгдлийн сан : ${baaziinNer}`);
  console.log(`   Зорилтот сар  : ${sar}`);
  console.log(`   Тогтмол дүн   : ${forceDun !== null ? `${forceDun}₮ (хүчээр заасан)` : "Гэрээний / Өмнөх сарын дүнгээс"}`);
  console.log(`   Горим         : ${tavikh ? "⚠️  БОДИТ БИЧИЛТ (--tavikh)" : "ХУУРАМЧ / ШАЛГАЛТ (юу ч өөрчлөхгүй)"}`);
  console.log("=".repeat(85));

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // 1. 2026-10 сарын нэхэмжлэхүүд
    const allInvoices = await conn.collection("nekhemjlekhiinTuukh").find({}).toArray();
    const sarInvoices = allInvoices.filter((inv) => ubSar(inv.ognoo) === sar);
    console.log(`\n📌 ${sar} сарын нийт нэхэмжлэх: ${sarInvoices.length}`);

    // 2. Тухайн сарын нэхэмжлэхэд хамаарах «Цахилгаан» авлагууд
    const invIds = sarInvoices.map((inv) => String(inv._id));
    const tsakhilgaanRows = await conn
      .collection("guilgeeAvlaguud")
      .find({
        nekhemjlekhId: { $in: invIds },
        zardliinNer: new RegExp("цахилгаан|тог", "i"),
      })
      .toArray();

    const tsakhilgaanNekhSet = new Set(tsakhilgaanRows.map((r) => String(r.nekhemjlekhId)));
    console.log(`   guilgeeAvlaguud дээр «Цахилгаан» бичигдсэн нэхэмжлэх: ${tsakhilgaanNekhSet.size}`);

    // 3. 2026-09 сарын «Цахилгаан» дүнгүүдийг гэрээгээр индекслэх (лавлагаа болгон ашиглах)
    const prevRows = await conn
      .collection("guilgeeAvlaguud")
      .find({
        zardliinNer: new RegExp("цахилгаан|тог", "i"),
        ognoo: { $gte: new Date("2026-09-01"), $lt: new Date("2026-10-01") },
      })
      .project({ gereeniiId: 1, dun: 1 })
      .toArray();
    const prevDunMap = new Map();
    for (const pr of prevRows) {
      if (pr.gereeniiId && pr.dun > 0) {
        prevDunMap.set(String(pr.gereeniiId), pr.dun);
      }
    }

    // 4. Идэвхтэй гэрээнүүдийн zardluud-ийг татах
    const gereenuud = await conn
      .collection("geree")
      .find({ tuluv: "Идэвхтэй" })
      .project({ _id: 1, zardluud: 1, toot: 1, barilgiinId: 1 })
      .toArray();
    const gereeMap = new Map();
    for (const g of gereenuud) {
      gereeMap.set(String(g._id), g);
    }

    // 5. Дутуу нэхэмжлэхүүдийг ялгах ба дүнг тооцоолох
    const dutuuInvoices = [];
    let niitNemegdekhDun = 0;

    for (const inv of sarInvoices) {
      if (tsakhilgaanNekhSet.has(String(inv._id))) {
        continue;
      }

      const g = gereeMap.get(String(inv.gereeniiId || ""));
      let bodogdsonDun = 0;

      if (forceDun !== null && forceDun > 0) {
        bodogdsonDun = forceDun;
      } else {
        // Гэрээнээс «Тог цахилгаан» зардлыг хайх
        const z = (g?.zardluud || []).find((x) =>
          /цахилгаан|тог/i.test(x.ner || "")
        );
        const gDun = Number(z?.dun || z?.tariff || z?.tulukhDun || z?.togtmolUtga || 0);

        if (gDun > 0) {
          bodogdsonDun = gDun;
        } else if (prevDunMap.has(String(inv.gereeniiId))) {
          // 9-р сарын дүн
          bodogdsonDun = prevDunMap.get(String(inv.gereeniiId));
        } else {
          // Анхдагч дүн (байхгүй бол 8000₮ жишиг)
          bodogdsonDun = 8000;
        }
      }

      dutuuInvoices.push({
        inv,
        dun: bodogdsonDun,
      });
      niitNemegdekhDun += bodogdsonDun;
    }

    console.log(`   🚨 «Тог цахилгаан» ДУТУУ нэхэмжлэх: ${dutuuInvoices.length}`);
    console.log(`   Нэмэгдэх нийт дүн: ${niitNemegdekhDun.toLocaleString()}₮\n`);

    if (dutuuInvoices.length === 0) {
      console.log("✅ Бүх нэхэмжлэхэд «Тог цахилгаан» бүрэн байна. Хийх ажил алга.");
      return;
    }

    console.log("Жишээ тоотууд ба бодогдсон дүнгүүд (эхний 10):");
    dutuuInvoices.slice(0, 10).forEach((item, idx) => {
      console.log(
        `  [${idx + 1}] Тоот: ${String(item.inv.toot).padStart(4)} | ` +
          `Гэрээ: ${item.inv.gereeniiDugaar || item.inv.gereeniiId} | ` +
          `Дүн: ${item.dun.toLocaleString()}₮`
      );
    });

    if (!tavikh) {
      console.log("\n" + "=".repeat(85));
      console.log("ℹ️  Энэ бол хуурамч (dry-run) шалгалт байлаа. Бодитоор засахын тулд:");
      console.log(`    node scripts/timetower_tsakhilgaan_nokhokh.js ${baaziinNer} --tavikh`);
      console.log("=".repeat(85));
      return;
    }

    // 6. Бодитоор бичих (--tavikh)
    console.log("\n🚀 Бодитоор бичиж байна...");
    let amjilt = 0;
    let aldaa = 0;

    for (let i = 0; i < dutuuInvoices.length; i++) {
      const item = dutuuInvoices[i];
      const inv = item.inv;
      const dun = item.dun;

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
          dun: dun,
          undsenDun: dun,
          tulukhDun: dun,
          tulukhAldangi: 0,
          tulsunDun: 0,
          tulsunAldangi: 0,
          turul: "Тогтмол",
          zardliinTurul: "Эрчим хүч",
          zardliinNer: "Тог цахилгаан",
          tailbar: "Тог цахилгаан",
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
        const tsakhilgaanZardal = {
          ner: "Тог цахилгаан",
          dun: dun,
          turul: "Тогтмол",
          zardliinTurul: "Эрчим хүч",
          tariff: dun,
          tulukhDun: dun,
        };

        const hasInNekh = zardluud.some((z) =>
          /цахилгаан|тог/i.test(z.ner || "")
        );
        const updatedZardluud = hasInNekh ? zardluud : [...zardluud, tsakhilgaanZardal];
        const newNiitTulbur = Number(inv.niitTulbur || 0) + (hasInNekh ? 0 : dun);

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

    console.log(`\n🎉 Дууслаа! Нийт ${amjilt} нэхэмжлэхэд «Тог цахилгаан» амжилттай нөхөгдлөө.`);
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error("❌ Алдаа:", err);
  process.exit(1);
});
