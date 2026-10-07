/**
 * Авлагын дэвтэр (`guilgeeAvlaguud`) дээрх ӨНЧИН мөр, мөн БУРУУ САРЫН
 * нэхэмжлэхэд наалдсан мөрийг олно. ЗӨВХӨН УНШИНА — юу ч засахгүй.
 *
 *   node scripts/avlaga_orphan_kharya.js <baaziinNer>
 *   node scripts/avlaga_orphan_kharya.js timetower
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
 *   --jagsaalt 20           эхний N жишээг дэлгэрэнгүй хэвлэнэ
 *
 * ЮУГ ХАРАХ ВЭ:
 *
 *  1) ӨНЧИН мөр гэж юу вэ. Хоёр өөр утга бий:
 *       • `gereeniiId` байхгүй — ямар ч гэрээтэй холбогдоогүй (жинхэнэ өнчин).
 *       • `nekhemjlekhId` байхгүй — гэрээтэй холбогдсон ч ЯМАР Ч нэхэмжлэхэд
 *         хараахан ороогүй. Энэ нь хэвийн ч байж болно (шинэ зардал хүлээж
 *         байгаа), АЮУЛТАЙ ч байж болно — доорх 2-ыг үз.
 *
 *  2) ЯАГААД АЮУЛТАЙ ВЭ. `services/invoiceService.js` нь нэхэмжлэх үүсгэмэгц:
 *
 *       updateMany({ gereeniiId, nekhemjlekhId: { $exists: false }, dun: { $gt: 0 } },
 *                  { $set: { nekhemjlekhId: invoice._id } })
 *
 *     гэж ОГНООГ ҮЛ ХАРГАЛЗАН бүх холбогдоогүй мөрийг шинэ нэхэмжлэхэд
 *     наана. Иймд 9 сарын эхний үлдэгдэл 10 сарын нэхэмжлэхэд орж, тухайн
 *     сарын дүн хөөрөгддөг.
 *
 *  3) Иймээс мөрийн `ognoo` ба нэхэмжлэхийн `ognoo` ХОЁР ӨӨР САРД байвал
 *     сэжигтэй гэж тэмдэглэнэ.
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** UB хана-цагаар «YYYY-MM». */
function sariinTuluv(d) {
  if (!d) return null;
  const t = new Date(new Date(d).getTime() + UB_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

const ognooText = (d) =>
  d ? new Date(d).toISOString().slice(0, 19).replace("T", " ") : "—";

const mungu = (n) => Number(n || 0).toLocaleString("mn-MN");

function argAvya(argv, ner) {
  const i = argv.indexOf(ner);
  return i > -1 ? argv[i + 1] : null;
}

/** Бүлэглээд тоо/дүнг гаргана. */
function buleglie(muruud, tulkhuur) {
  const map = new Map();
  for (const m of muruud) {
    const k = tulkhuur(m) || "(хоосон)";
    const kh = map.get(k) || { too: 0, dun: 0 };
    kh.too += 1;
    kh.dun += Number(m.dun || 0);
    map.set(k, kh);
  }
  return [...map].sort((a, b) => b[1].dun - a[1].dun);
}

function khevlie(garchig, bulgluud) {
  console.log(`   ${garchig}`);
  for (const [k, v] of bulgluud) {
    console.log(`      ${String(k).padEnd(28)} ${String(v.too).padStart(6)} мөр   ${mungu(v.dun).padStart(14)}₮`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const uriBase = argAvya(argv, "--uri") || DEFAULT_URI;
  const jagsaaltToo = Number(argAvya(argv, "--jagsaalt")) || 10;

  const tugiinUtguud = new Set();
  ["--uri", "--jagsaalt"].forEach((t) => {
    const i = argv.indexOf(t);
    if (i > -1) tugiinUtguud.add(i + 1);
  });
  const baaziinNer = argv.find(
    (a, i) => !a.startsWith("--") && !tugiinUtguud.has(i),
  );

  if (!baaziinNer) {
    console.error("Хэрэглээ: node scripts/avlaga_orphan_kharya.js <baaziinNer>");
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    console.log(`\n📦 Бааз: ${baaziinNer}`);

    const muruud = await conn
      .collection("guilgeeAvlaguud")
      .find({})
      .project({
        dun: 1,
        ognoo: 1,
        gereeniiId: 1,
        gereeniiDugaar: 1,
        toot: 1,
        nekhemjlekhId: 1,
        zardliinNer: 1,
        source: 1,
        ekhniiUldegdelEsekh: 1,
        turul: 1,
        tailbar: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .toArray();

    console.log(`   Авлагын нийт мөр: ${muruud.length}`);

    // ── 1. Гэрээгүй мөр (жинхэнэ өнчин) ───────────────────────────────
    const gereegui = muruud.filter((m) => !m.gereeniiId);
    console.log(`\n${"=".repeat(70)}`);
    console.log(`1. ГЭРЭЭГҮЙ мөр (gereeniiId алга): ${gereegui.length}`);
    console.log("=".repeat(70));
    if (gereegui.length) {
      khevlie("Эх үүсвэрээр:", buleglie(gereegui, (m) => m.source));
      khevlie("Зардлын нэрээр:", buleglie(gereegui, (m) => m.zardliinNer));
    } else {
      console.log("   ✅ Байхгүй — бүх мөр гэрээтэй холбогдсон.");
    }

    // ── 2. Нэхэмжлэхгүй мөр ───────────────────────────────────────────
    const nekhemjlekhgui = muruud.filter((m) => !m.nekhemjlekhId);
    const dun = nekhemjlekhgui.reduce((s, m) => s + Number(m.dun || 0), 0);
    console.log(`\n${"=".repeat(70)}`);
    console.log(
      `2. НЭХЭМЖЛЭХГҮЙ мөр (nekhemjlekhId алга): ${nekhemjlekhgui.length} — нийт ${mungu(dun)}₮`,
    );
    console.log("=".repeat(70));
    console.log(
      "   ⚠️  Дараагийн нэхэмжлэх үүсэхэд ЭДГЭЭР нь ОГНООГ нь үл харгалзан",
    );
    console.log("      тэр нэхэмжлэхэд НААЛДАНА.");
    if (nekhemjlekhgui.length) {
      khevlie("Эх үүсвэрээр:", buleglie(nekhemjlekhgui, (m) => m.source));
      khevlie("Зардлын нэрээр:", buleglie(nekhemjlekhgui, (m) => m.zardliinNer));
      khevlie("Мөрийн сараар:", buleglie(nekhemjlekhgui, (m) => sariinTuluv(m.ognoo)));
    } else {
      console.log("   ✅ Байхгүй.");
    }

    // ── 3. БУРУУ САРЫН нэхэмжлэхэд наалдсан мөр ───────────────────────
    const nekhemjlekhuud = await conn
      .collection("nekhemjlekhiinTuukh")
      .find({})
      .project({ ognoo: 1, nekhemjlekhiinDugaar: 1 })
      .toArray();

    const nekhSar = new Map();
    const nekhDugaar = new Map();
    for (const n of nekhemjlekhuud) {
      nekhSar.set(String(n._id), sariinTuluv(n.ognoo));
      nekhDugaar.set(String(n._id), n.nekhemjlekhiinDugaar || "");
    }

    const zuruutei = [];
    for (const m of muruud) {
      if (!m.nekhemjlekhId) continue;
      const nSar = nekhSar.get(String(m.nekhemjlekhId));
      if (!nSar) continue; // нэхэмжлэх нь устсан — өөр асуудал
      const mSar = sariinTuluv(m.ognoo);
      if (mSar && mSar !== nSar) zuruutei.push({ ...m, mSar, nSar });
    }

    const zuruuDun = zuruutei.reduce((s, m) => s + Number(m.dun || 0), 0);
    console.log(`\n${"=".repeat(70)}`);
    console.log(
      `3. БУРУУ САРЫН нэхэмжлэхэд наалдсан мөр: ${zuruutei.length} — нийт ${mungu(zuruuDun)}₮`,
    );
    console.log("=".repeat(70));

    if (!zuruutei.length) {
      console.log("   ✅ Байхгүй.");
    } else {
      khevlie("Зардлын нэрээр:", buleglie(zuruutei, (m) => m.zardliinNer));
      khevlie("Эх үүсвэрээр:", buleglie(zuruutei, (m) => m.source));
      khevlie(
        "«мөрийн сар → нэхэмжлэхийн сар»:",
        buleglie(zuruutei, (m) => `${m.mSar} → ${m.nSar}`),
      );

      console.log(`\n   Эхний ${jagsaaltToo} жишээ:`);
      for (const m of zuruutei.slice(0, jagsaaltToo)) {
        console.log(
          `      ${m.gereeniiDugaar || "?"} тоот ${m.toot || "?"} | «${m.zardliinNer}» ${mungu(m.dun)}₮` +
            ` | мөр ${m.mSar} → нэхэмжлэх ${m.nSar} (${nekhDugaar.get(String(m.nekhemjlekhId)) || "?"})` +
            ` | source=${m.source}`,
        );
      }
    }

    // ── 4. Эхний үлдэгдэл тусгайлан ───────────────────────────────────
    const ekhnii = muruud.filter((m) => m.ekhniiUldegdelEsekh === true);
    const ekhniiZuruu = zuruutei.filter((m) => m.ekhniiUldegdelEsekh === true);
    console.log(`\n${"=".repeat(70)}`);
    console.log(
      `4. ЭХНИЙ ҮЛДЭГДЭЛ: нийт ${ekhnii.length} мөр, тэдгээрээс буруу сард наалдсан: ${ekhniiZuruu.length}`,
    );
    console.log("=".repeat(70));
    if (ekhniiZuruu.length) {
      const d = ekhniiZuruu.reduce((s, m) => s + Number(m.dun || 0), 0);
      console.log(`   ⚠️  Нийт ${mungu(d)}₮ нь буруу сарын нэхэмжлэхэд орсон.`);
    }
    // ── 5. НЭРГҮЙ мөр ─────────────────────────────────────────────────
    //
    // Хэвийн зардал бүр `zardliinNer`-тэй байдаг. Нэргүй мөр нь ямар
    // замаар үүссэн нь тодорхойгүй — ихэвчлэн сөрөг дүнтэй (хөнгөлөлт,
    // буцаалт) тул нэхэмжлэхийн дүнг ЧИМЭЭГҮЙ бууруулна.
    const nergui = muruud.filter((m) => !String(m.zardliinNer || "").trim());
    const nerguiDun = nergui.reduce((s, m) => s + Number(m.dun || 0), 0);
    console.log(`
${"=".repeat(70)}`);
    console.log(
      `5. НЭРГҮЙ мөр (zardliinNer хоосон): ${nergui.length} — нийт ${mungu(nerguiDun)}₮`,
    );
    console.log("=".repeat(70));
    for (const m of nergui) {
      const nSar = m.nekhemjlekhId
        ? nekhSar.get(String(m.nekhemjlekhId)) || "(нэхэмжлэх олдсонгүй)"
        : "— ХОЛБООГҮЙ —";
      console.log(
        `   ${m.gereeniiDugaar || "?"} тоот ${m.toot || "?"} | ${mungu(m.dun)}₮` +
          ` | мөр ${sariinTuluv(m.ognoo)} → нэхэмжлэх ${nSar}` +
          ` | source=${m.source || "—"} | turul=${m.turul || "—"}` +
          ` | tailbar="${m.tailbar || ""}"`,
      );
      console.log(
        `      _id=${m._id} geree=${m.gereeniiId} үүссэн ${ognooText(m.createdAt)} зассан ${ognooText(m.updatedAt)}`,
      );
    }

  } finally {
    await conn.close();
  }

  console.log("\nДууслаа (юу ч бичигдээгүй).");
}

main().catch((aldaa) => {
  console.error(aldaa);
  process.exit(1);
});
