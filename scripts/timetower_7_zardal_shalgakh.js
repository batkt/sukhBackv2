/**
 * Timetower 9 ба 10-р сарын нэхэмжлэх, авлагын дэвтэр (guilgeeAvlaguud) болон
 * ашиглалтын зардлууд (ashiglaltiinZardluud)-ыг 7 зардлын бүрэн бүтэн байдлаар
 * барилга тус бүрээр харьцуулан шалгах оношилгооны скрипт.
 *
 * ЗӨВХӨН УНШИНА — баазад ямар ч өөрчлөлт хийхгүй.
 *
 * Хэрэглээ:
 *   node scripts/timetower_7_zardal_shalgakh.js [baaziinNer] [--saruud 2026-09,2026-10] [--delgerengui]
 *
 * Жишээ:
 *   node scripts/timetower_7_zardal_shalgakh.js timetower
 *   node scripts/timetower_7_zardal_shalgakh.js timetower --delgerengui
 *   node scripts/timetower_7_zardal_shalgakh.js timetower --saruud 2026-09,2026-10
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
  console.log(`🔎 TIMETOWER ЗАРДЛЫН ОНОШИЛГОО (9 ба 10-р сар, 7 зардал харьцуулалт)`);
  console.log(`   Өгөгдлийн сан : ${baaziinNer}`);
  console.log(`   Шалгах сарууд : ${targetSaruud.join(", ")}`);
  console.log(`   Дэлгэрэнгүй   : ${delgerengui ? "ТИЙМ (бүх тоот хэвлэгдэнэ)" : "ҮГҮЙ (дээж тоотууд хэвлэгдэнэ, бүгдийг харах: --delgerengui)"}`);
  console.log("=".repeat(88));

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // 1. АШИГЛАЛТЫН ЗАРДЛУУДЫН МАСТЕР ЖАГСААЛТ (ashiglaltiinZardluud)
    // ═════════════════════════════════════════════════════════════════════════
    const ashZardluud = await conn
      .collection("ashiglaltiinZardluud")
      .find({})
      .toArray();

    console.log(`\n📌 1. СИСТЕМИЙН АШИГЛАЛТЫН ЗАРДЛУУД (ashiglaltiinZardluud: ${ashZardluud.length})`);
    console.log("-".repeat(88));
    if (ashZardluud.length === 0) {
      console.log("⚠️  ashiglaltiinZardluud цуглуулга хоосон байна!");
    } else {
      console.log(
        "   " +
          "Нэр".padEnd(25) +
          "Төрөл".padEnd(16) +
          "Тариф/Дүн".padEnd(14) +
          "Заалт".padEnd(8) +
          "Барилгын ID"
      );
      console.log("   " + "-".repeat(82));
      for (const z of ashZardluud) {
        console.log(
          "   " +
            `«${z.ner}»`.padEnd(25) +
            String(z.turul || "—").padEnd(16) +
            String(z.tariff ?? z.dun ?? "—").padEnd(14) +
            (z.zaalt ? "ТИЙМ" : "—").padEnd(8) +
            String(z.barilgiinId || "Бүх барилга")
        );
      }
    }

    // Мастер зардлын нэрсийг ялгаж авна
    const masterZardalNers = [
      ...new Set(
        ashZardluud
          .map((z) => String(z.ner || "").trim())
          .filter(Boolean)
      ),
    ];
    console.log(`\n   => Үндсэн зардлын жагсаалт (${masterZardalNers.length}): [${masterZardalNers.join(", ")}]`);

    // ═════════════════════════════════════════════════════════════════════════
    // 2. БАЙГУУЛЛАГА БА БАРИЛГУУДЫН МЭДЭЭЛЭЛ
    // ═════════════════════════════════════════════════════════════════════════
    const baiguullaga = await conn.collection("baiguullaga").findOne({});
    const barilgaMap = new Map(); // id -> ner
    if (baiguullaga && Array.isArray(baiguullaga.barilguud)) {
      for (const b of baiguullaga.barilguud) {
        barilgaMap.set(String(b._id), b.ner || b.barilgiinNer || String(b._id));
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. ИДЭВХТЭЙ ГЭРЭЭНҮҮД БА ГЭРЭЭН ДЭЭРХ ЗАРДЛЫН ТОХИРГОО
    // ═════════════════════════════════════════════════════════════════════════
    const gereenuud = await conn
      .collection("geree")
      .find({ tuluv: "Идэвхтэй" })
      .project({
        _id: 1,
        gereeniiDugaar: 1,
        toot: 1,
        davkhar: 1,
        orts: 1,
        bairNer: 1,
        barilgiinId: 1,
        orshinSuugchId: 1,
        zardluud: 1,
        suuliinZaalt: 1,
        umnukhZaalt: 1,
      })
      .toArray();

    const barilgiinGereeMap = new Map(); // barilgiinId -> [geree]
    for (const g of gereenuud) {
      const bId = String(g.barilgiinId || "(барилгагүй)");
      if (!barilgiinGereeMap.has(bId)) barilgiinGereeMap.set(bId, []);
      barilgiinGereeMap.get(bId).push(g);
    }

    console.log(`\n📌 2. ИДЭВХТЭЙ ГЭРЭЭНИЙ МЭДЭЭЛЭЛ (Нийт: ${gereenuud.length}, Барилга: ${barilgiinGereeMap.size})`);
    console.log("-".repeat(88));
    for (const [bId, bGereenuud] of barilgiinGereeMap.entries()) {
      const bNer = barilgaMap.get(bId) || bGereenuud[0]?.bairNer || bId;
      console.log(`   🏢 Барилга: ${bNer} (ID: ${bId}) -> ${bGereenuud.length} идэвхтэй гэрээ`);

      // Гэрээн дээрх zardluud дотор зардал бүрэн байгаа эсэх
      const zardalCountsInGeree = {};
      masterZardalNers.forEach((ner) => (zardalCountsInGeree[ner] = 0));
      let geree7Complete = 0;

      for (const g of bGereenuud) {
        const gZardluud = g.zardluud || [];
        const gNers = new Set(gZardluud.map((z) => tulkhuur(z.ner)));
        let matchCount = 0;
        masterZardalNers.forEach((mNer) => {
          if (gNers.has(tulkhuur(mNer))) {
            zardalCountsInGeree[mNer] += 1;
            matchCount += 1;
          }
        });
        if (matchCount === masterZardalNers.length) {
          geree7Complete += 1;
        }
      }

      console.log(`      Гэрээний тохиргоо (geree.zardluud):`);
      console.log(`      • ${geree7Complete}/${bGereenuud.length} гэрээ бүх ${masterZardalNers.length} зардлыг агуулж байна.`);
      masterZardalNers.forEach((mNer) => {
        const count = zardalCountsInGeree[mNer];
        const status =
          count === bGereenuud.length
            ? "✅"
            : count === 0
            ? "❌ (ОГТ АЛГА!)"
            : `⚠️  (${bGereenuud.length - count} дутуу)`;
        console.log(`        - «${mNer}»: ${count}/${bGereenuud.length} гэрээнд тохируулагдсан ${status}`);
      });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. ТООЛУУРЫН ЗААЛТЫН ТҮҮХ (zaaltUnshlalt)
    // ═════════════════════════════════════════════════════════════════════════
    console.log(`\n📌 3. ТООЛУУРЫН ЗААЛТЫН ШАЛГАЛТ (zaaltUnshlalt)`);
    console.log("-".repeat(88));
    const zaaltCountsByMonth = {};
    for (const sar of targetSaruud) {
      zaaltCountsByMonth[sar] = 0;
    }
    const allZaalt = await conn
      .collection("zaaltUnshlalt")
      .find({})
      .project({ unshlaltiinOgnoo: 1, importOgnoo: 1, zaaltDun: 1, zoruu: 1 })
      .toArray();

    for (const z of allZaalt) {
      const s = ubSar(z.unshlaltiinOgnoo || z.importOgnoo);
      if (zaaltCountsByMonth[s] !== undefined) {
        zaaltCountsByMonth[s] += 1;
      }
    }
    for (const sar of targetSaruud) {
      const count = zaaltCountsByMonth[sar] || 0;
      const icon = count > 0 ? "✅" : "🚨 (0 БАЙНА — ЦАХИЛГААНЫ ЗААЛТ ОРООГҮЙ ТУЛ ДҮН БОДОГДООГҮЙ!)";
      console.log(`   ${sar} сарын заалтын тоо (zaaltUnshlalt): ${count} ${icon}`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. САР БҮРИЙН НЭХЭМЖЛЭХ БА LEDGER (guilgeeAvlaguud) ХАРЬЦУУЛАЛТ
    // ═════════════════════════════════════════════════════════════════════════
    for (const sar of targetSaruud) {
      console.log(`\n${"=".repeat(88)}`);
      console.log(`🗓  САРЫН ОНОШИЛГОО: ${sar}`);
      console.log("=".repeat(88));

      // 1) Тухайн сарын нэхэмжлэхүүдийг татах
      const nekhAll = await conn
        .collection("nekhemjlekhiinTuukh")
        .find({})
        .project({
          _id: 1,
          gereeniiId: 1,
          ognoo: 1,
          nekhemjlekhiinDugaar: 1,
          niitTulbur: 1,
          tuluv: 1,
          "medeelel.zardluud": 1,
        })
        .toArray();

      const sarNekhMap = new Map(); // gereeniiId -> [nekhemjlekh]
      const sarNekhIds = new Set();
      for (const n of nekhAll) {
        if (ubSar(n.ognoo) === sar) {
          const gid = String(n.gereeniiId || "");
          if (!sarNekhMap.has(gid)) sarNekhMap.set(gid, []);
          sarNekhMap.get(gid).push(n);
          sarNekhIds.add(String(n._id));
        }
      }

      // 2) Тухайн сарын авлагын дэвтэр (guilgeeAvlaguud) татах
      const guilgeeAll = await conn
        .collection("guilgeeAvlaguud")
        .find({
          dun: { $gt: 0 },
        })
        .project({
          _id: 1,
          gereeniiId: 1,
          nekhemjlekhId: 1,
          ognoo: 1,
          zardliinNer: 1,
          tailbar: 1,
          dun: 1,
          toot: 1,
          barilgiinId: 1,
        })
        .toArray();

      const mergedGuilgee = new Map(); // id -> doc
      guilgeeAll.forEach((g) => {
        const isSarDate = ubSar(g.ognoo) === sar;
        const isSarNekh = g.nekhemjlekhId && sarNekhIds.has(String(g.nekhemjlekhId));
        if (isSarDate || isSarNekh) {
          mergedGuilgee.set(String(g._id), g);
        }
      });

      // Гэрээ тус бүрээр авлагын мөрүүдийг бүлэглэх
      const gereeGuilgeeMap = new Map(); // gereeniiId -> [guilgee]
      for (const g of mergedGuilgee.values()) {
        const gid = String(g.gereeniiId || "");
        if (!gereeGuilgeeMap.has(gid)) gereeGuilgeeMap.set(gid, []);
        gereeGuilgeeMap.get(gid).push(g);
      }

      console.log(`   Нийт үүссэн нэхэмжлэх: ${sarNekhIds.size}`);
      console.log(`   Нийт авлагын бичилт (guilgeeAvlaguud): ${mergedGuilgee.size}`);

      // Барилга тус бүрээр шинжилгээ
      for (const [bId, bGereenuud] of barilgiinGereeMap.entries()) {
        const bNer = barilgaMap.get(bId) || bGereenuud[0]?.bairNer || bId;
        console.log(`\n   🏢 [${sar}] БАРИЛГА: ${bNer} (Нийт ${bGereenuud.length} идэвхтэй гэрээ)`);
        console.log("   " + "-".repeat(84));

        let totalBilledContracts = 0;
        let complete7Contracts = 0;
        let incompleteContracts = 0;
        const missingExpenseStats = {};
        masterZardalNers.forEach((m) => (missingExpenseStats[m] = 0));

        const defectiveToots = [];

        for (const g of bGereenuud) {
          const gid = String(g._id);
          const invList = sarNekhMap.get(gid) || [];
          const ledgerList = gereeGuilgeeMap.get(gid) || [];

          if (invList.length === 0 && ledgerList.length === 0) {
            // Энэ айлд энэ сард огт нэхэмжлэх үүсээгүй
            defectiveToots.push({
              toot: g.toot,
              davkhar: g.davkhar,
              orts: g.orts,
              gereeniiDugaar: g.gereeniiDugaar,
              status: "Нэхэмжлэх үүсээгүй",
              ledgerCount: 0,
              missing: masterZardalNers,
              present: [],
            });
            incompleteContracts += 1;
            masterZardalNers.forEach((m) => (missingExpenseStats[m] += 1));
            continue;
          }

          totalBilledContracts += 1;

          // Ledger дээрх зардлын нэрсийг нэгтгэнэ
          const ledgerZardalNames = new Set();
          for (const item of ledgerList) {
            const rawNer = item.zardliinNer || item.tailbar || "";
            ledgerZardalNames.add(tulkhuur(rawNer));
          }

          // Нэхэмжлэхийн medeelel.zardluud доторхыг бас нэмж харна
          for (const inv of invList) {
            const zArray = inv.medeelel?.zardluud || [];
            for (const z of zArray) {
              ledgerZardalNames.add(tulkhuur(z.ner || ""));
            }
          }

          // Энэ айлд мастер зардлаас аль нь дутуу байгааг шалгах
          const missingInLedger = [];
          const presentInLedger = [];

          for (const mNer of masterZardalNers) {
            const key = tulkhuur(mNer);
            const hasLedger = [...ledgerZardalNames].some(
              (n) => n === key || n.includes(key) || key.includes(n)
            );
            if (hasLedger) {
              presentInLedger.push(mNer);
            } else {
              missingInLedger.push(mNer);
              missingExpenseStats[mNer] += 1;
            }
          }

          if (missingInLedger.length === 0) {
            complete7Contracts += 1;
          } else {
            incompleteContracts += 1;
            defectiveToots.push({
              toot: g.toot,
              davkhar: g.davkhar,
              orts: g.orts,
              gereeniiDugaar: g.gereeniiDugaar,
              status: `${presentInLedger.length}/${masterZardalNers.length} зардалтай`,
              ledgerCount: presentInLedger.length,
              missing: missingInLedger,
              present: presentInLedger,
            });
          }
        }

        console.log(`      📊 Нэхэмжлэгдсэн: ${totalBilledContracts}/${bGereenuud.length}`);
        console.log(`      ✅ Бүрэн 7 зардалтай (complete): ${complete7Contracts}`);
        console.log(`      ❌ Зардал ДУТУУ (incomplete):   ${incompleteContracts}`);

        console.log(`      📋 Зардал тус бүрийн дутагдлын тоо:`);
        for (const mNer of masterZardalNers) {
          const missed = missingExpenseStats[mNer];
          const isTargetDefect =
            (sar === "2026-09" && tulkhuur(mNer).includes("баримт")) ||
            (sar === "2026-10" &&
              (tulkhuur(mNer).includes("цахилгаан") ||
                tulkhuur(mNer).includes("тог")));
          const icon = missed === 0 ? "✅" : isTargetDefect ? "🚨" : "⚠️ ";
          console.log(
            `        ${icon} «${mNer}»: ${missed} айлд дутуу ` +
              (missed > 0
                ? `(${(
                    (missed / (bGereenuud.length || 1)) *
                    100
                  ).toFixed(1)}%)`
                : "")
          );
        }

        // Хэрэв дутуу айлууд байвал жишээ болон дэлгэрэнгүй хэвлэх
        if (defectiveToots.length > 0) {
          const displayCount = delgerengui ? defectiveToots.length : Math.min(defectiveToots.length, 6);
          console.log(`\n      ⚠️  Дутуу айлуудын жагсаалт (${displayCount}/${defectiveToots.length}):`);
          for (let i = 0; i < displayCount; i++) {
            const dt = defectiveToots[i];
            console.log(
              `        [${i + 1}] Тоот: ${String(dt.toot).padStart(4)} | ` +
                `Давхар: ${String(dt.davkhar || "—").padStart(2)} | ` +
                `Гэрээ: ${dt.gereeniiDugaar} | ` +
                `Байгаа: ${dt.ledgerCount}/${masterZardalNers.length} | ` +
                `Дутуу: [${dt.missing.join(", ")}]`
            );
          }
          if (!delgerengui && defectiveToots.length > 6) {
            console.log(`        ... цаана нь ${defectiveToots.length - 6} айл байна. Бүгдийг харах: --delgerengui`);
          }
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. ШАЛТГААН БА ШИЙДВЭРЛЭХ АЛХМУУД
    // ═════════════════════════════════════════════════════════════════════════
    console.log(`\n${"=".repeat(88)}`);
    console.log(`🔎 ОНОШИЛГООНЫ ДҮГНЭЛТ БА ЗАСВАРЫН АЛХМУУД`);
    console.log("=".repeat(88));
    console.log(`
1. 9-р сарын «Баримт» дутагдсан шалтгаан ба засвар:
   - Шаардлагатай бол «Баримт»-ыг нөхөх тушаал (dry-run):
     node scripts/zardal_nemekh.js 6a9786569a202a8f8f859f94 Баримт 2026-09
   - Бичихдээ:
     node scripts/zardal_nemekh.js 6a9786569a202a8f8f859f94 Баримт 2026-09 --tavikh

2. 10-р сарын «Цахилгаан» дутагдсан шалтгаан ба засвар:
   - Цахилгаан нь тоолуур заалтаар (zaalt: true) бодогддог. Хэрэв 10-р сарын
     заалт zaaltUnshlalt цуглуулгад ороогүй бол дүн 0 болж, нэхэмжлэх болон
     guilgeeAvlaguud-д Цахилгааны мөр нэмэгддэггүй.
   - Заалтыг Excel-ээр оруулсны дараа, эсвэл суурь тариф/тооцооллоор нөхөх боломжтой.
`);

  } finally {
    await conn.close();
  }

  console.log("✅ Оношилгоо амжилттай дууслаа.\n");
}

main().catch((err) => {
  console.error("❌ Алдаа гарлаа:", err);
  process.exit(1);
});
