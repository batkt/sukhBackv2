/**
 * ӨРТЭЙ (төлөөгүй) зогсоолын бичлэгийг архиваас амьд цуглуулга руу буцаана.
 *
 * ЯАГААД: `archiveUilchluulegchKhonog` нь гарсан машины бичлэгийг бүгдийг нь
 * `Uilchluulegch{YYYY}{MM}` рүү зөөж, амьд цуглуулгаас устгадаг байв. Харин
 * өөрөө үйлчлэх хайлт (/v1/search_car) нь ЗӨВХӨН амьд цуглуулгаас хайдаг тул
 * архивлагдсан машин "Машины мэдээлэл олдсонгүй" болж, өрөө төлөх боломжгүй
 * болдог. Цаашид ийм зүйл гарахгүй (архивлалтыг зассан) ч ӨМНӨ НЬ архивлагдсан
 * бичлэгүүд гацсан хэвээр байна — тэднийг энэ скрипт буцаана.
 *
 * Хэрэглээ:
 *   node scripts/zogsool_arkhivaas_butsaaya.js <baaziinNer>              # ЗӨВХӨН ХАРУУЛНА
 *   node scripts/zogsool_arkhivaas_butsaaya.js <baaziinNer> --khiine     # үнэхээр зөөнө
 *
 *   node scripts/zogsool_arkhivaas_butsaaya.js timetower
 *   node scripts/zogsool_arkhivaas_butsaaya.js timetower --dugaar 6179УНД
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
 *   --dugaar <дугаар>       зөвхөн тухайн машиныг
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

async function main() {
  const khiine = process.argv.includes("--khiine");
  const dugaar = argValue("--dugaar");
  const uriBase = argValue("--uri") || DEFAULT_URI;

  const baaziinNer = process.argv[2];
  if (!baaziinNer || baaziinNer.startsWith("--")) {
    console.error(
      "Хэрэглээ: node scripts/zogsool_arkhivaas_butsaaya.js <baaziinNer> [--khiine] [--dugaar 1234УБА]",
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // Цуглуулгын ЖИНХЭНЭ нэрийг таахгүй — уншина. Mongoose загварын нэрээс
    // цуглуулгын нэр нь хэрхэн үүссэнийг энд баттай мэдэх боломжгүй.
    const buh = await conn.db.listCollections().toArray();
    const uilchluulegchiinUud = buh
      .map((c) => c.name)
      .filter((n) => /uilchluulegch/i.test(n))
      .sort();

    console.log(`\n📚 "${baaziinNer}" баазын холбогдох цуглуулгууд:`);
    for (const ner of uilchluulegchiinUud) {
      const too = await conn.collection(ner).countDocuments();
      console.log(`   ${ner}  (${too} бичлэг)`);
    }

    // Архив нь нэрэндээ он/сар агуулна (жишээ: Uilchluulegch202610).
    const arkhivuud = uilchluulegchiinUud.filter((n) => /\d{6}/.test(n));
    const amid = uilchluulegchiinUud.filter((n) => !/\d{6}/.test(n));

    if (!arkhivuud.length) {
      console.log("\n✅ Архивын цуглуулга алга — буцаах зүйл алга.");
      return;
    }
    if (amid.length !== 1) {
      console.log(
        `\n❌ Амьд цуглуулгыг тодорхойлж чадсангүй (олдсон: ${amid.join(", ") || "алга"}).`,
      );
      console.log("   Дээрх жагсаалтыг надад илгээвэл зөв нэрийг нь зааж өгнө.");
      return;
    }
    const amidNer = amid[0];
    console.log(`\n🎯 Амьд цуглуулга: ${amidNer}`);

    const shurguult = { "tuukh.0.tulukhDun": { $gt: 0 } };
    if (dugaar) shurguult.mashiniiDugaar = dugaar;

    let niitOlson = 0;
    let niitZuusun = 0;
    let niitDun = 0;

    for (const arkhiv of arkhivuud) {
      const urtei = await conn.collection(arkhiv).find(shurguult).toArray();
      if (!urtei.length) continue;

      console.log(`\n📦 ${arkhiv}: ${urtei.length} ӨРТЭЙ бичлэг`);
      for (const mur of urtei) {
        const dun = mur?.tuukh?.[0]?.tulukhDun;
        const garsan = mur?.tuukh?.[0]?.tsagiinTuukh?.[0]?.garsanTsag;
        niitDun += Number(dun) || 0;
        niitOlson += 1;
        console.log(
          `   ${mur.mashiniiDugaar}  ${dun}₮  гарсан=${garsan ? new Date(garsan).toISOString() : "-"}  турул=${mur.turul || "-"}  _id=${mur._id}`,
        );
      }

      if (!khiine) continue;

      for (const mur of urtei) {
        // Амьд цуглуулгад ижил _id байвал ДАВХАРДУУЛАХГҮЙ.
        const baigaa = await conn
          .collection(amidNer)
          .findOne({ _id: mur._id }, { projection: { _id: 1 } });

        if (!baigaa) {
          await conn.collection(amidNer).insertOne(mur);
        }
        // Амьд тал дээр бичигдсэнийг БАТАЛЖ байж архиваас устгана.
        const batalgaa = await conn
          .collection(amidNer)
          .findOne({ _id: mur._id }, { projection: { _id: 1 } });
        if (batalgaa) {
          await conn.collection(arkhiv).deleteOne({ _id: mur._id });
          niitZuusun += 1;
        } else {
          console.log(`   ⚠️  ${mur.mashiniiDugaar} буцаагдсангүй — архивт үлдээв.`);
        }
      }
    }

    console.log(
      `\n— Нийт ${niitOlson} өртэй бичлэг, ${niitDun.toLocaleString()}₮`,
    );
    if (khiine) {
      console.log(`— ${niitZuusun} бичлэгийг амьд цуглуулга руу буцаалаа.`);
    } else {
      console.log(
        "— ЗӨВХӨН ХАРУУЛЛАА. Үнэхээр зөөхийн тулд `--khiine` нэмж ажиллуулна уу.",
      );
    }
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
