/**
 * `/v1/search_car` яагаад машиныг олохгүй байгааг АЛХАМ АЛХМААР шалгана.
 * ЗӨВХөН УНШИНА — юу ч засахгүй.
 *
 *   node scripts/khaigch_onoshloy.js <baaziinNer> <dugaar> <baiguullagiinId>
 *   node scripts/khaigch_onoshloy.js timetower 6179УНД 6a9786569a202a8f8f859f94
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
  const [, , baaziinNer, dugaar, baiguullagiinId] = process.argv;
  const uriBase = argValue("--uri") || DEFAULT_URI;

  if (!baaziinNer || !dugaar) {
    console.error(
      "Хэрэглээ: node scripts/khaigch_onoshloy.js <baaziinNer> <dugaar> [baiguullagiinId]",
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // ── 1. Бичлэг нь АМЬД цуглуулгад байна уу? ──────────────────────────
    const buh = await conn.db.listCollections().toArray();
    const amidNer =
      buh.map((c) => c.name).find((n) => /uilchluulegch/i.test(n) && !/\d{6}/.test(n));
    if (!amidNer) {
      console.log("❌ Амьд цуглуулга олдсонгүй.");
      return;
    }
    console.log(`\n🎯 Амьд цуглуулга: ${amidNer}`);

    const burtgeluud = await conn
      .collection(amidNer)
      .find({ mashiniiDugaar: dugaar })
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`\n1️⃣  "${dugaar}" дугаартай бичлэг: ${burtgeluud.length}`);
    for (const m of burtgeluud) {
      const t0 = m?.tuukh?.[0];
      console.log(
        `   _id=${m._id}  tuluv=${t0?.tuluv}  tulukhDun=${t0?.tulukhDun}  ` +
          `zurchil=${m.zurchil === undefined ? "БАЙХГҮЙ" : JSON.stringify(m.zurchil)}  ` +
          `zogsooliinId=${t0?.zogsooliinId} (${typeof t0?.zogsooliinId})  ` +
          `barilgiinId=${m.barilgiinId}  baiguullagiinId=${m.baiguullagiinId}  ` +
          `createdAt=${m.createdAt && new Date(m.createdAt).toISOString()}`,
      );
    }
    if (!burtgeluud.length) {
      console.log("   → Амьд цуглуулгад БАЙХГҮЙ. Цааш шалгах утгагүй.");
      return;
    }

    // ── 2. Зогсоолуудын жагсаалт (хайлт үүгээр гүйдэг) ──────────────────
    const parkingQuery = baiguullagiinId ? { baiguullagiinId } : {};
    const zogsooluud = await conn
      .collection("parkings")
      .find(parkingQuery)
      .toArray()
      .catch(() => []);

    // Цуглуулгын нэр таарахгүй байж болзошгүй тул хайж олно.
    let zogsoolNer = "parkings";
    if (!zogsooluud.length) {
      zogsoolNer =
        buh.map((c) => c.name).find((n) => /^parking/i.test(n)) || "parkings";
    }
    const jagsaalt = await conn
      .collection(zogsoolNer)
      .find(parkingQuery)
      .toArray();

    console.log(
      `\n2️⃣  Зогсоолын цуглуулга "${zogsoolNer}", шүүлт ${JSON.stringify(parkingQuery)} → ${jagsaalt.length} зогсоол`,
    );

    const khereg = burtgeluud[0]?.tuukh?.[0]?.zogsooliinId;
    const taarsan = jagsaalt.find((z) => String(z._id) === String(khereg));
    console.log(
      `   Машины зогсоол ${khereg} нь энэ жагсаалтад ${taarsan ? "БАЙНА ✅" : "БАЙХГҮЙ ❌"}`,
    );
    if (!taarsan) {
      const yamarch = await conn
        .collection(zogsoolNer)
        .findOne({ _id: new mongoose.Types.ObjectId(String(khereg)) })
        .catch(() => null);
      if (yamarch) {
        console.log(
          `   → Зогсоол өөрөө БАЙНА, гэхдээ: baiguullagiinId=${yamarch.baiguullagiinId} ` +
            `barilgiinId=${yamarch.barilgiinId} tokiNer=${yamarch.tokiNer === undefined ? "БАЙХГҮЙ" : yamarch.tokiNer}`,
        );
      } else {
        console.log("   → Тийм _id-тай зогсоол ОГТ олдсонгүй.");
      }
    }

    // ── 3. matchMashin-г ЯГ тэр хэлбэрээр нь ажиллуулна ─────────────────
    console.log("\n3️⃣  matchMashin шалгалт (зогсоол бүрээр):");
    let olson = 0;
    for (const z of jagsaalt) {
      const match = {
        mashiniiDugaar: dugaar,
        "tuukh.0.zogsooliinId": String(z._id),
        "tuukh.0.tuluv": 0,
        zurchil: { $exists: false },
      };
      const mur = await conn.collection(amidNer).findOne(match);
      if (mur) {
        olson += 1;
        console.log(`   ✅ ${z._id} (${z.ner || "-"}) → _id=${mur._id}`);
      }
    }
    if (!olson) {
      console.log("   ❌ Нэг ч зогсоолоор таарсангүй.");

      // Аль нөхцөл нь унагааж байгааг тусад нь шалгана.
      const t0 = burtgeluud[0]?.tuukh?.[0];
      const sorilt = [
        ["зөвхөн дугаар", { mashiniiDugaar: dugaar }],
        [
          "дугаар + zogsooliinId",
          { mashiniiDugaar: dugaar, "tuukh.0.zogsooliinId": String(t0?.zogsooliinId) },
        ],
        [
          "дугаар + tuluv:0",
          { mashiniiDugaar: dugaar, "tuukh.0.tuluv": 0 },
        ],
        [
          "дугаар + zurchil байхгүй",
          { mashiniiDugaar: dugaar, zurchil: { $exists: false } },
        ],
      ];
      console.log("\n   Нөхцөл тус бүрээр:");
      for (const [ner, q] of sorilt) {
        const too = await conn.collection(amidNer).countDocuments(q);
        console.log(`     ${too > 0 ? "✅" : "❌"} ${ner}: ${too}`);
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
