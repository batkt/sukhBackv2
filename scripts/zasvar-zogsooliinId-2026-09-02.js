/**
 * Нэг удаагийн засвар: устгагдсан зогсоол дээр "гацсан" зогсоолын бүртгэлийг
 * шинэ зогсоол руу холбоно.
 *
 * АСУУДАЛ
 *   2026-09-02-нд зогсоолыг устгаад дахин нэмсэн. Дахин нэмэхэд MongoDB шинэ
 *   _id оноодог тул:
 *     хуучин зогсоол : 6a978d90d2d69c94c9e9a054  (02:53 - 03:28 хооронд орсон)
 *     шинэ зогсоол   : 6a97b1fed2d69c94c9e9cf37  (05:22-оос хойш орсон)
 *
 *   uilchluulegch бүртгэл устаагүй тул орсон машинуудын tuukh[].zogsooliinId
 *   ХУУЧИН _id дээр үлдсэн. Гарах үед sukhParking-v1 нь гарах камераар
 *   тодорхойлсон зогсоолын (ШИНЭ) _id-гаар хайдаг:
 *
 *     'tuukh.zogsooliinId': zogsool._id.toString()   // sdkService.ts:116
 *
 *   тул хуучин id-тай бүртгэл олдохгүй бөгөөд "Машин бүртгэгдээгүй байна."
 *   гэж буцаана. Машин жагсаалтад "Идэвхтэй" харагдсаар байна.
 *
 *   ЖИЧ: orsonKhaalga (192.168.1.110) хуучин, шинэ бүх бүртгэл дээр ижил тул
 *   орох камерын хайлт (sdkService.ts:199) ажилласаар байна — зөвхөн
 *   zogsooliinId л таарахгүй байгаа.
 *
 * ЮУ ЗАСДАГ
 *   Зөвхөн НЭЭЛТТЭЙ (garsanTsag байхгүй, tuluv !== -2) бүртгэлийн
 *   tuukh[].zogsooliinId-г хуучнаас шинэ рүү бичнэ. Хаагдсан бүртгэлд
 *   хүрэхгүй — тайлангийн түүх өөрчлөгдөх ёсгүй.
 *
 * ХЭРЭГЛЭЭ
 *   Шалгах (юу ч бичихгүй):
 *     node scripts/zasvar-zogsooliinId-2026-09-02.js
 *   Засах:
 *     node scripts/zasvar-zogsooliinId-2026-09-02.js --fix
 *   Өөр зогсоол дээр дахин тохиолдвол:
 *     node scripts/zasvar-zogsooliinId-2026-09-02.js --khuuchin=<id> --shine=<id>
 *   Байгууллагын холболтын бүртгэл (baaziinMedeelel) уншигдахгүй бол сан руу
 *   шууд холбох (энэ байгууллагын сан = timetower):
 *     node scripts/zasvar-zogsooliinId-2026-09-02.js --san=timetower
 *
 * ЖИЧ: MONGODB_URI нь 127.0.0.1 тул СЕРВЕР дээр ажиллуулна. Локал компьютераас
 * холбогдохгүй.
 *
 * ЖИЧ: Дараа нь зогсоолыг УСТГАЖ дахин нэмэхийн оронд байгаа зогсоолыг
 * шууд засвал _id хадгалагдаж, энэ асуудал давтагдахгүй.
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../tokhirgoo/tokhirgoo.env"),
});
const { db } = require("zevbackv2");

const BAIGUULLAGIIN_ID = "6a9786569a202a8f8f859f94";
const BARILGIIN_ID = "6a978709d2d69c94c9e97f29";

const KHUUCHIN_ANGI = "6a978d90d2d69c94c9e9a054";
const SHINE_ANGI = "6a97b1fed2d69c94c9e9cf37";

const mur = (x) => console.log(x);

/** --tsalgui=utga хэлбэрийн параметрийг уншина. */
function parametr(ner, undsen) {
  const tokhirokh = process.argv.find((a) => a.startsWith(`--${ner}=`));
  return tokhirokh ? tokhirokh.split("=")[1] : undsen;
}

async function main() {
  const zasyaMode = process.argv.includes("--fix");
  const khuuchinId = parametr("khuuchin", KHUUCHIN_ANGI);
  const shineId = parametr("shine", SHINE_ANGI);

  if (khuuchinId === shineId) {
    console.error("❌ Хуучин ба шинэ zogsooliinId ижил байна.");
    process.exit(1);
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI тохируулагдаагүй байна.");
    process.exit(1);
  }

  const sanNer = parametr("san", null);
  let kholbolt;

  if (sanNer) {
    // Шууд холболт: baaziinMedeelel бүртгэлийг тойрч, сангийн нэрээр холбоно.
    // Модел үүсгэгчид { kholbolt: <connection> } хэлбэрийг хүлээж авдаг тул
    // жинхэнэ схемүүдийг хэвээр ашиглаж байна.
    const mongoose = require("mongoose");
    mur(`🔌 Сан руу шууд холбогдож байна (${sanNer})...`);
    await mongoose.connect(MONGODB_URI);
    kholbolt = { kholbolt: mongoose.connection.useDb(sanNer) };
  } else {
    mur("🔌 Өгөгдлийн сан руу холбогдож байна...");
    await db.kholboltUusgey(null, MONGODB_URI);
    await new Promise((r) => setTimeout(r, 3000));

    kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === BAIGUULLAGIIN_ID,
    );
    if (!kholbolt) {
      console.error(
        `❌ Байгууллагын холболт олдсонгүй: ${BAIGUULLAGIIN_ID}\n` +
          `   Сангийн нэрээр шууд холбож үзнэ үү: --san=timetower`,
      );
      process.exit(1);
    }
  }

  const { Uilchluulegch, Parking } = require("sukhParking-v1");
  const U = Uilchluulegch(kholbolt);
  const P = Parking(kholbolt);

  // Шинэ зогсоол байхгүй бол хаашаа ч холбохгүй.
  const shineZogsool = await P.findById(shineId).lean();
  mur("");
  mur(`Хуучин zogsooliinId : ${khuuchinId}`);
  mur(
    `Шинэ zogsooliinId   : ${shineId}  ${
      shineZogsool
        ? `✅ байна (${shineZogsool.ner || "нэргүй"})`
        : "❌ ОЛДСОНГҮЙ — зогсоно"
    }`,
  );
  if (!shineZogsool) process.exit(1);

  // Зөвхөн нээлттэй бүртгэл.
  const shurguult = {
    baiguullagiinId: BAIGUULLAGIIN_ID,
    barilgiinId: BARILGIIN_ID,
    "tuukh.zogsooliinId": khuuchinId,
    "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: false },
    "tuukh.0.tuluv": { $ne: -2 },
  };

  const jagsaalt = await U.find(shurguult).lean();
  mur("");
  mur(`Гацсан нээлттэй бүртгэл: ${jagsaalt.length}`);
  mur("");

  for (const d of jagsaalt) {
    const t = (d.tuukh || [])[0] || {};
    const orsonTsag =
      t.tsagiinTuukh && t.tsagiinTuukh[0] && t.tsagiinTuukh[0].orsonTsag;
    mur(
      `  ${String(d.mashiniiDugaar).padEnd(10)} орсон ${
        orsonTsag ? new Date(orsonTsag).toISOString() : "?"
      }  камер ${t.orsonKhaalga || "?"}  _id ${d._id}`,
    );
  }

  // Хаагдсан бүртгэл хэд байгааг зөвхөн мэдээллийн төлөө харуулна.
  const khaagdsanToo = await U.countDocuments({
    baiguullagiinId: BAIGUULLAGIIN_ID,
    barilgiinId: BARILGIIN_ID,
    "tuukh.zogsooliinId": khuuchinId,
    "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
  });
  mur("");
  mur(
    `Хуучин id-тай ХААГДСАН бүртгэл: ${khaagdsanToo} (хүрэхгүй — түүх хөдлөхгүй)`,
  );

  if (!zasyaMode) {
    mur("");
    mur(
      `🔍 ШАЛГАХ режим — юу ч бичээгүй. Засахын тулд --fix нэмнэ уу (${jagsaalt.length} бичлэг).`,
    );
    mur("");
    process.exit(0);
  }

  if (jagsaalt.length === 0) {
    mur("");
    mur("✅ Засах бичлэг байхгүй.");
    process.exit(0);
  }

  // arrayFilters — зөвхөн хуучин id агуулсан tuukh элементийг сольно.
  const khariu = await U.updateMany(
    shurguult,
    { $set: { "tuukh.$[t].zogsooliinId": shineId } },
    { arrayFilters: [{ "t.zogsooliinId": khuuchinId }] },
  );

  mur("");
  mur(
    `✅ ЗАССАН — тохирсон ${khariu.matchedCount}, өөрчлөгдсөн ${khariu.modifiedCount}`,
  );

  const uldsen = await U.countDocuments(shurguult);
  mur(`Гацсан хэвээр: ${uldsen} (0 байх ёстой)`);
  mur("");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Алдаа:", e.message);
  process.exit(1);
});
