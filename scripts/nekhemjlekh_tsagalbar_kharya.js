/**
 * Нэхэмжлэх үүсгэх ӨДРИЙН тохиргоог шалгана. ЗӨВХӨН УНШИНА — юу ч засахгүй.
 *
 *   node scripts/nekhemjlekh_tsagalbar_kharya.js <baaziinNer> [baaziinNer2 ...]
 *   node scripts/nekhemjlekh_tsagalbar_kharya.js timetower kharKhorumSukh
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
 *
 * ЮУГ ШАЛГАХ ВЭ:
 *
 *  1) ДАВХАР ТҮВШИН. `nekhemjlekhCron` нь хоёр түвшинтэй:
 *     байгууллагын (barilgiinId: null) ба барилгын. Cron нь ажиллахдаа
 *     БАЙГУУЛЛАГЫН тохиргоог олвол тухайн байгууллагын БҮХ гэрээг
 *     боловсруулдаг — барилга өөрийн тохиргоотой эсэхийг хардаггүй
 *     (index.js:522). Харин давхардлын шалгалт нь эсрэгээрээ БАРИЛГЫН
 *     тохиргоог эрхэмлэдэг (nekhemjlekhController.js:44).
 *     Хоёр тохиргооны ӨДӨР зөрвөл:
 *       • хуучин өдөр дээр нэхэмжлэх үүснэ,
 *       • шинэ өдөр дээр «аль хэдийн байна» гээд АЛГАСНА.
 *
 *  2) 28-ААС ХОЙШХИ ӨДӨР. Cron нь өдрийг ЯГ тэнцүүгээр хайдаг
 *     (index.js:438) бөгөөд хавчуулалт хийдэггүй. 29/30/31 гэж
 *     тохируулсан бол богино сард ОГТ ажиллахгүй.
 *
 *  3) ИДЭВХГҮЙ тохиргоо — `idevkhitei: false` бол хэзээ ч ажиллахгүй.
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

function ognooText(d) {
  if (!d) return "—";
  try {
    return new Date(d).toISOString().slice(0, 16).replace("T", " ");
  } catch (_e) {
    return String(d);
  }
}

async function baazShalgaya(conn, baaziinNer) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📦 Бааз: ${baaziinNer}`);
  console.log("=".repeat(70));

  const tsagalbaruud = await conn
    .collection("nekhemjlekhCron")
    .find({})
    .toArray();

  if (!tsagalbaruud.length) {
    console.log("⚠️  Нэг ч тохиргоо алга — автомат нэхэмжлэх ОГТ үүсэхгүй.");
    return;
  }

  console.log(`\n🗓  Тохиргоонууд (${tsagalbaruud.length}):`);
  for (const t of tsagalbaruud) {
    const turul = t.barilgiinId ? `барилга ${t.barilgiinId}` : "БАЙГУУЛЛАГА";
    const idevkh = t.idevkhitei === false ? "ИДЭВХГҮЙ" : "идэвхтэй";
    console.log(
      `   • ${String(t.nekhemjlekhUusgekhOgnoo).padStart(2)} өдөр | ${idevkh.padEnd(9)} | ${turul}` +
        ` | baiguullagiinId=${t.baiguullagiinId} | шинэчилсэн ${ognooText(t.shinechilsenOgnoo)}`,
    );
  }

  // ── 2) 28-аас хойшхи өдөр ──────────────────────────────────────────────
  const uturTei = tsagalbaruud.filter(
    (t) => Number(t.nekhemjlekhUusgekhOgnoo) > 28,
  );
  if (uturTei.length) {
    console.log(
      `\n❌ 28-аас ХОЙШХИ өдөр (${uturTei.length}) — богино сард ОГТ ажиллахгүй:`,
    );
    for (const t of uturTei) {
      console.log(
        `   • ${t.nekhemjlekhUusgekhOgnoo} өдөр | ${t.barilgiinId ? "барилга " + t.barilgiinId : "БАЙГУУЛЛАГА"}`,
      );
    }
  } else {
    console.log("\n✅ 28-аас хойшхи өдөр алга.");
  }

  // ── 3) Идэвхгүй ────────────────────────────────────────────────────────
  const idevkhgui = tsagalbaruud.filter((t) => t.idevkhitei === false);
  if (idevkhgui.length) {
    console.log(`\n⚠️  ИДЭВХГҮЙ тохиргоо: ${idevkhgui.length} ширхэг.`);
  }

  // ── 1) Давхар түвшин ───────────────────────────────────────────────────
  const baiguullaguud = [
    ...new Set(tsagalbaruud.map((t) => String(t.baiguullagiinId))),
  ];

  for (const bId of baiguullaguud) {
    const minii = tsagalbaruud.filter((t) => String(t.baiguullagiinId) === bId);
    const baiguullagiinKhemjee = minii.find((t) => !t.barilgiinId);
    const barilguud = minii.filter((t) => t.barilgiinId);

    if (!baiguullagiinKhemjee || !barilguud.length) continue;

    console.log(`\n🔎 Байгууллага ${bId}: давхар түвшин илэрлээ`);
    console.log(
      `   Байгууллагын өдөр: ${baiguullagiinKhemjee.nekhemjlekhUusgekhOgnoo}` +
        ` (${baiguullagiinKhemjee.idevkhitei === false ? "ИДЭВХГҮЙ" : "идэвхтэй"})`,
    );

    for (const b of barilguud) {
      const zuruu =
        Number(b.nekhemjlekhUusgekhOgnoo) !==
        Number(baiguullagiinKhemjee.nekhemjlekhUusgekhOgnoo);

      // Хэдэн айл өртөх вэ.
      const too = await conn.collection("geree").countDocuments({
        baiguullagiinId: bId,
        barilgiinId: b.barilgiinId,
        tuluv: "Идэвхтэй",
      });

      if (!zuruu) {
        console.log(
          `   ✅ Барилга ${b.barilgiinId}: өдөр ижил (${b.nekhemjlekhUusgekhOgnoo}) — асуудалгүй. Идэвхтэй гэрээ: ${too}`,
        );
        continue;
      }

      console.log(
        `   ❌ Барилга ${b.barilgiinId}: барилгын өдөр ${b.nekhemjlekhUusgekhOgnoo}, ` +
          `байгууллагынх ${baiguullagiinKhemjee.nekhemjlekhUusgekhOgnoo}`,
      );
      console.log(
        `      → ${baiguullagiinKhemjee.nekhemjlekhUusgekhOgnoo}-нд (ХУУЧИН өдөр) нэхэмжлэх үүснэ,` +
          ` ${b.nekhemjlekhUusgekhOgnoo}-нд АЛГАСНА. Өртөх идэвхтэй гэрээ: ${too}`,
      );
    }
  }

  // ── Аль ч тохиргоонд хамрагдаагүй барилга байна уу ────────────────────
  for (const bId of baiguullaguud) {
    const minii = tsagalbaruud.filter(
      (t) => String(t.baiguullagiinId) === bId && t.idevkhitei !== false,
    );
    if (minii.some((t) => !t.barilgiinId)) continue; // байгууллагынх бүгдийг хамарна

    const tokhirson = new Set(minii.map((t) => String(t.barilgiinId)));
    const bukhBarilga = await conn
      .collection("geree")
      .distinct("barilgiinId", { baiguullagiinId: bId, tuluv: "Идэвхтэй" });

    const khamragdaagui = bukhBarilga.filter(
      (b) => b && !tokhirson.has(String(b)),
    );
    if (!khamragdaagui.length) continue;

    console.log(
      `\n❌ Байгууллага ${bId}: ${khamragdaagui.length} барилга ЯМАР Ч идэвхтэй тохиргоонд хамрагдаагүй —`,
    );
    for (const b of khamragdaagui) {
      const too = await conn.collection("geree").countDocuments({
        baiguullagiinId: bId,
        barilgiinId: b,
        tuluv: "Идэвхтэй",
      });
      console.log(`   • барилга ${b} — идэвхтэй гэрээ ${too} (нэхэмжлэх ОГТ үүсэхгүй)`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const uriIndex = argv.indexOf("--uri");
  const uriBase = uriIndex > -1 ? argv[uriIndex + 1] : DEFAULT_URI;
  const baazuud = argv.filter(
    (a, i) => a !== "--uri" && i !== uriIndex + 1 && !a.startsWith("--"),
  );

  if (!baazuud.length) {
    console.error(
      "Хэрэглээ: node scripts/nekhemjlekh_tsagalbar_kharya.js <baaziinNer> [baaziinNer2 ...]",
    );
    process.exit(1);
  }

  for (const baaziinNer of baazuud) {
    let conn;
    try {
      conn = await mongoose
        .createConnection(uriBase.replace("{db}", baaziinNer))
        .asPromise();
      await baazShalgaya(conn, baaziinNer);
    } catch (aldaa) {
      console.error(`\n❌ ${baaziinNer}: ${aldaa.message}`);
    } finally {
      if (conn) await conn.close();
    }
  }

  console.log("\nДууслаа.");
}

main().catch((aldaa) => {
  console.error(aldaa);
  process.exit(1);
});
