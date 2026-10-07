/**
 * Тайм Тауэр (timetower)-ийн оршин суугчдын авлагын дэвтэр (guilgeeAvlaguud)-ийг
 * ашиглалтын 7 зардалтай харьцуулан нэхэмжлэх тус бүрээр шалгах скрипт.
 *
 * ЗӨВХӨН УНШИНА — баазад бичилт хийхгүй.
 *
 * Хэрэглээ:
 *   node scripts/timetower_guilgee_shalgakh.js [baaziinNer] [--saruud 2026-09,2026-10] [--delgerengui]
 *
 * Жишээ:
 *   node scripts/timetower_guilgee_shalgakh.js timetower
 *   node scripts/timetower_guilgee_shalgakh.js timetower --delgerengui
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

const tulkhuur = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function argAvya(argv, ner) {
  const i = argv.indexOf(ner);
  return i > -1 ? argv[i + 1] : null;
}

// 7 ҮНДСЭН ЗАРДАЛ
const ZARDAL_ALIASES = {
  "лифт": ["лифт", "lift"],
  "хог": ["хог", "hog"],
  "цэвэрлэгээ": ["цэвэрлэгээ", "tseverlegee"],
  "засвар үйлчилгээ": ["засвар үйлчилгээ", "засвар", "zasvar"],
  "харуул": ["харуул", "haruul"],
  "баримт": ["баримт", "barimt", "е-баримт", "ebarimt"],
  "цахилгаан": ["цахилгаан", "тог цахилгаан", "тог", "tsakhilgaan", "electricity"],
};

function matchStandardZardal(ner) {
  const n = tulkhuur(ner);
  for (const [std, aliases] of Object.entries(ZARDAL_ALIASES)) {
    if (aliases.some((a) => n === a || n.includes(a) || a.includes(n))) {
      return std;
    }
  }
  return n;
}

async function main() {
  const argv = process.argv.slice(2);
  const uriBase = argAvya(argv, "--uri") || DEFAULT_URI;
  const saruudArg = argAvya(argv, "--saruud") || "2026-09,2026-10";
  const targetSaruud = saruudArg.split(",").map((s) => s.trim()).filter(Boolean);
  const delgerengui = argv.includes("--delgerengui");

  const tugiinUtguud = new Set();
  ["--uri", "--saruud"].forEach((t) => {
    const i = argv.indexOf(t);
    if (i > -1) tugiinUtguud.add(i + 1);
  });
  const baaziinNer =
    argv.find((a, i) => !a.startsWith("--") && !tugiinUtguud.has(i)) ||
    "timetower";

  console.log("=".repeat(88));
  console.log(`🔎 TIMETOWER: guilgeeAvlaguud VS ashiglaltiinZardluud (7 ЗАРДАЛ ШАЛГАЛТ)`);
  console.log(`   Өгөгдлийн сан : ${baaziinNer}`);
  console.log(`   Шалгах сарууд : ${targetSaruud.join(", ")}`);
  console.log(`   Дэлгэрэнгүй   : ${delgerengui ? "ТИЙМ" : "ҮГҮЙ (--delgerengui залгаж бүгдийг харна)"}`);
  console.log("=".repeat(88));

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // 1. Ашиглалтын зардлуудын мастер жагсаалт
    const ashZardluud = await conn.collection("ashiglaltiinZardluud").find({}).toArray();
    console.log(`\n📌 1. ashiglaltiinZardluud (${ashZardluud.length} зардал бүртгэлтэй):`);
    for (const z of ashZardluud) {
      console.log(`   • «${z.ner}» | тариф: ${z.tariff ?? z.dun ?? "—"} | төрөл: ${z.turul || "—"} | заалт: ${z.zaalt ? "ТИЙМ" : "үгүй"}`);
    }

    // 2. Барилгууд
    const baiguullaga = await conn.collection("baiguullaga").findOne({});
    const barilgaMap = new Map();
    if (baiguullaga && Array.isArray(baiguullaga.barilguud)) {
      for (const b of baiguullaga.barilguud) {
        barilgaMap.set(String(b._id), b.ner || b.barilgiinNer || String(b._id));
      }
    }

    // 3. Сар бүрээр нэхэмжлэх ба түүний guilgeeAvlaguud-ийг шалгах
    for (const sar of targetSaruud) {
      console.log(`\n${"=".repeat(88)}`);
      console.log(`🗓  [${sar}] guilgeeAvlaguud ШИНЖИЛГЭЭ`);
      console.log("=".repeat(88));

      // Тухайн сарын нэхэмжлэхүүд
      const allInvoices = await conn
        .collection("nekhemjlekhiinTuukh")
        .find({})
        .project({
          _id: 1,
          gereeniiId: 1,
          gereeniiDugaar: 1,
          barilgiinId: 1,
          toot: 1,
          davkhar: 1,
          orts: 1,
          ognoo: 1,
          niitTulbur: 1,
          tuluv: 1,
        })
        .toArray();

      const sarInvoices = allInvoices.filter((inv) => ubSar(inv.ognoo) === sar);
      const invIdSet = new Set(sarInvoices.map((inv) => String(inv._id)));

      console.log(`   Нийт сарын нэхэмжлэх: ${sarInvoices.length}`);

      // Тухайн сарын нэхэмжлэхэд хамаарах guilgeeAvlaguud-ийг татах
      // Эхний үлдэгдэл БИШ, төлбөр БИШ (dun > 0)
      const guilgeeRows = await conn
        .collection("guilgeeAvlaguud")
        .find({
          nekhemjlekhId: { $in: [...invIdSet] },
          dun: { $gt: 0 },
          ekhniiUldegdelEsekh: { $ne: true },
          zardliinNer: { $ne: "Эхний үлдэгдэл" },
        })
        .project({
          _id: 1,
          nekhemjlekhId: 1,
          gereeniiId: 1,
          toot: 1,
          dun: 1,
          zardliinNer: 1,
          tailbar: 1,
          turul: 1,
        })
        .toArray();

      console.log(`   guilgeeAvlaguud эгнээ (зардал): ${guilgeeRows.length}`);

      // Нэхэмжлэх бүрээр авлагын мөрүүдийг бүлэглэх
      const invGuilgeeMap = new Map(); // invId -> [guilgee]
      for (const row of guilgeeRows) {
        const iId = String(row.nekhemjlekhId || "");
        if (!invGuilgeeMap.has(iId)) invGuilgeeMap.set(iId, []);
        invGuilgeeMap.get(iId).push(row);
      }

      // Барилгаар бүлэглэх
      const barilgaInvoices = new Map(); // barilgiinId -> [inv]
      for (const inv of sarInvoices) {
        const bId = String(inv.barilgiinId || "(барилгагүй)");
        if (!barilgaInvoices.has(bId)) barilgaInvoices.set(bId, []);
        barilgaInvoices.get(bId).push(inv);
      }

      for (const [bId, bInvs] of barilgaInvoices.entries()) {
        const bNer = barilgaMap.get(bId) || bId;
        console.log(`\n   🏢 [${sar}] БАРИЛГА: ${bNer} (Нийт нэхэмжлэх: ${bInvs.length})`);
        console.log("   " + "-".repeat(84));

        let count7 = 0;
        let count6 = 0;
        let countLess6 = 0;

        const missingStats = {
          "лифт": 0,
          "хог": 0,
          "цэвэрлэгээ": 0,
          "засвар үйлчилгээ": 0,
          "харуул": 0,
          "баримт": 0,
          "цахилгаан": 0,
        };

        const missingItemsList = [];

        for (const inv of bInvs) {
          const rows = invGuilgeeMap.get(String(inv._id)) || [];
          const distinctStdZardal = new Set();
          for (const r of rows) {
            const rawNer = r.zardliinNer || r.tailbar || "";
            const std = matchStandardZardal(rawNer);
            distinctStdZardal.add(std);
          }

          const missingZardal = [];
          for (const std of Object.keys(missingStats)) {
            if (distinctStdZardal.has(std)) {
              // Байгаа
            } else {
              missingZardal.push(std);
              missingStats[std] += 1;
            }
          }

          const count = distinctStdZardal.size;
          if (count >= 7) {
            count7 += 1;
          } else if (count === 6) {
            count6 += 1;
            missingItemsList.push({
              inv,
              count,
              missing: missingZardal,
              present: [...distinctStdZardal],
            });
          } else {
            countLess6 += 1;
            missingItemsList.push({
              inv,
              count,
              missing: missingZardal,
              present: [...distinctStdZardal],
            });
          }
        }

        console.log(`      📊 guilgeeAvlaguud эгнээний тоо:`);
        console.log(`         ✅ 7 зардал БҮРЭН:      ${count7} нэхэмжлэх (${((count7 / bInvs.length) * 100).toFixed(1)}%)`);
        console.log(`         ⚠️  6 зардалтай (1 дутуу): ${count6} нэхэмжлэх (${((count6 / bInvs.length) * 100).toFixed(1)}%)`);
        console.log(`         ❌ < 6 зардалтай:         ${countLess6} нэхэмжлэх (${((countLess6 / bInvs.length) * 100).toFixed(1)}%)`);

        console.log(`      📋 Зардал тус бүрийн дутуу тоо (guilgeeAvlaguud дээр байхгүй):`);
        for (const [zName, mCount] of Object.entries(missingStats)) {
          const isCritical =
            (sar === "2026-09" && zName === "баримт") ||
            (sar === "2026-10" && zName === "цахилгаан");
          const icon = mCount === 0 ? "✅" : isCritical ? "🚨" : "⚠️ ";
          console.log(`         ${icon} «${zName.padEnd(16)}»: ${mCount} айлд дутуу (${((mCount / bInvs.length) * 100).toFixed(1)}%)`);
        }

        // Жишээ тоотууд хэвлэх
        if (missingItemsList.length > 0) {
          const showCount = delgerengui ? missingItemsList.length : Math.min(missingItemsList.length, 6);
          console.log(`\n      ⚠️  Дутуу зардлуудын жишээ тоотууд (${showCount}/${missingItemsList.length}):`);
          for (let i = 0; i < showCount; i++) {
            const item = missingItemsList[i];
            console.log(
              `        [${i + 1}] Тоот: ${String(item.inv.toot).padStart(4)} | ` +
                `Давхар: ${String(item.inv.davkhar || "—").padStart(2)} | ` +
                `Байгаа: ${item.count}/7 | ` +
                `Дутуу: [${item.missing.join(", ")}]`
            );
          }
          if (!delgerengui && missingItemsList.length > 6) {
            console.log(`        ... цаана нь ${missingItemsList.length - 6} нэхэмжлэх байна.`);
          }
        }
      }
    }
  } finally {
    await conn.close();
  }

  console.log("\n✅ Шалгалт дууслаа.\n");
}

main().catch((err) => {
  console.error("❌ Алдаа:", err);
  process.exit(1);
});
