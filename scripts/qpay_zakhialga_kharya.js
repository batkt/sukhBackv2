/**
 * QPay-н захиалгын бичлэгийг ХАРУУЛНА. ЗӨВХӨН УНШИНА.
 *
 * Callback нь `qpayTulburBatalgaajuulakh(bichleg.invoice_id || bichleg.qpay?.invoice_id)`
 * гэж дууддаг бөгөөд тэр утга нь ХООСОН бол QPay-гээс огт асуулгүйгээр
 * "төлөгдөөгүй" гэж буцаадаг. Иймд бичлэг дээр invoice_id байгаа эсэхийг
 * эндээс шалгана.
 *
 *   node scripts/qpay_zakhialga_kharya.js <baaziinNer> <zakhialgiinDugaar>
 *   node scripts/qpay_zakhialga_kharya.js timetower 6ac2f2b08cb902dbff013bef2000
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
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
  const [, , baaziinNer, zakhialgiinDugaar] = process.argv;
  const uriBase = argValue("--uri") || DEFAULT_URI;

  if (!baaziinNer || !zakhialgiinDugaar) {
    console.error(
      "Хэрэглээ: node scripts/qpay_zakhialga_kharya.js <baaziinNer> <zakhialgiinDugaar>",
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // Цуглуулгын нэрийг ТААХГҮЙ — уншина.
    const buh = await conn.db.listCollections().toArray();
    const nerees = buh
      .map((c) => c.name)
      .filter((n) => /qpay/i.test(n))
      .sort();

    console.log(`\n📚 QPay-тай холбоотой цуглуулгууд: ${nerees.join(", ") || "алга"}`);

    let olson = false;
    for (const ner of nerees) {
      const mur = await conn
        .collection(ner)
        .findOne({ zakhialgiinDugaar: zakhialgiinDugaar });
      if (!mur) continue;
      olson = true;

      console.log(`\n🎯 ${ner} дотор ОЛДЛОО:`);
      console.log(`   _id              = ${mur._id}`);
      console.log(`   zakhialgiinDugaar= ${mur.zakhialgiinDugaar}`);
      console.log(
        `   invoice_id       = ${mur.invoice_id === undefined ? "⛔ БАЙХГҮЙ" : mur.invoice_id}`,
      );
      console.log(
        `   qpay.invoice_id  = ${mur.qpay?.invoice_id === undefined ? "⛔ БАЙХГҮЙ" : mur.qpay.invoice_id}`,
      );
      console.log(`   tulsunEsekh      = ${mur.tulsunEsekh}`);
      console.log(`   dun              = ${mur.dun ?? mur.niitDun ?? "-"}`);
      console.log(`   turul            = ${mur.turul ?? "-"}`);
      console.log(`   createdAt        = ${mur.createdAt && new Date(mur.createdAt).toISOString()}`);

      const tulkhuuruud = Object.keys(mur);
      console.log(`   БҮХ талбар       = ${tulkhuuruud.join(", ")}`);

      if (!mur.invoice_id && !mur.qpay?.invoice_id) {
        console.log(
          "\n   ⛔ ШАЛТГААН ТОДОРХОЙ: invoice_id хадгалагдаагүй тул callback нь\n" +
            "      QPay-гээс асуулгүйгээр шууд \"төлөгдөөгүй\" гэж үздэг.",
        );
      } else {
        console.log(
          "\n   ✅ invoice_id байна — алдаа нь QPay-н хариунд байна.\n" +
            "      Дараагийн алхам: энэ invoice_id-гаар QPay-гээс төлөв нь юу\n" +
            "      гэж буцааж байгааг шалгах.",
        );
      }
    }

    if (!olson) {
      console.log(
        `\n⛔ "${zakhialgiinDugaar}" дугаартай захиалга ОЛДСОНГҮЙ.\n` +
          "   Callback нь бичлэг олдоогүй бол баталгаажуулалтыг АЛГАСААД\n" +
          "   цааш үргэлжилдэг тул анхааруулга өөр шалтгаантай.",
      );
      // Хамгийн сүүлийн хэдийг нь харуулж, дугаарын ХЭЛБЭРИЙГ нь харьцуулна.
      for (const ner of nerees) {
        const suuliinkh = await conn
          .collection(ner)
          .find({}, { projection: { zakhialgiinDugaar: 1, invoice_id: 1, tulsunEsekh: 1, createdAt: 1 } })
          .sort({ _id: -1 })
          .limit(5)
          .toArray();
        if (!suuliinkh.length) continue;
        console.log(`\n   ${ner} — сүүлийн 5:`);
        for (const m of suuliinkh) {
          console.log(
            `     ${m.zakhialgiinDugaar}  invoice_id=${m.invoice_id ?? "БАЙХГҮЙ"}  tulsun=${m.tulsunEsekh}`,
          );
        }
      }
    }
  } finally {
    await conn.close();
  }
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
