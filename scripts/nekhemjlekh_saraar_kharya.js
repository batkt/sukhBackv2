/**
 * Сар бүрийн нэхэмжлэх ҮҮССЭН ҮҮ, дотор нь зардал БҮРЭН ОРСОН УУ гэдгийг
 * барилга тус бүрээр харуулна. ЗӨВХӨН УНШИНА — юу ч засахгүй.
 *
 *   node scripts/nekhemjlekh_saraar_kharya.js <baaziinNer> [--saruud 6]
 *   node scripts/nekhemjlekh_saraar_kharya.js timetower --saruud 4
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
 *
 * ЯАГААД ЭНЭ ВЭ:
 *
 *   `zardal_alga_bolson_kharya.js` нь ГЭРЭЭН дээрх зардлын мөр бүрэн бүтэн
 *   болохыг харууллаа. Тэгвэл «Баримт алга», «Тог цахилгаан яваагүй» гэдэг
 *   нь гэрээн дээр биш, НЭХЭМЖЛЭХ дээр болсон байна. Хоёр л боломж:
 *
 *     1. Тухайн сард нэхэмжлэх ОГТ үүсээгүй (cron тохиргоо байхгүй/таараагүй).
 *     2. Нэхэмжлэх үүссэн ч дотор нь тэр зардлын мөр ОРООГҮЙ.
 *
 *   Энэ хоёрыг ялгаж өгнө: сар бүр, барилга бүрээр
 *     • идэвхтэй гэрээний тоо,
 *     • нэхэмжлэх үүссэн гэрээний тоо,
 *     • зардлын нэр бүрээр хэдэн нэхэмжлэхэд орсон.
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/** UB хана-цагаар тухайн сарын эхлэл/төгсгөл. */
function sariinKhyazgaar(jil, sar0) {
  const ekhlel = new Date(Date.UTC(jil, sar0, 1, 0, 0, 0) - UB_OFFSET_MS);
  const tugsgel = new Date(Date.UTC(jil, sar0 + 1, 1, 0, 0, 0) - UB_OFFSET_MS);
  return { ekhlel, tugsgel };
}

function argAvya(argv, ner) {
  const i = argv.indexOf(ner);
  return i > -1 ? argv[i + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const uriBase = argAvya(argv, "--uri") || DEFAULT_URI;
  const saruudToo = Number(argAvya(argv, "--saruud")) || 6;
  // Шалгах зардлын нэрс. Өгөөгүй бол ГЭРЭЭН дээрх бүх нэрийг авна —
  // ингэснээр «байх ЁСТОЙ атлаа нэхэмжлэхэд алга» тохиолдол илэрнэ.
  const nerText = argAvya(argv, "--ner");
  const shalgakhNeruud = nerText
    ? nerText.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const jisheeKharuulya = argv.includes("--jishee");

  const tugiinUtguud = new Set();
  ["--uri", "--saruud", "--ner"].forEach((t) => {
    const i = argv.indexOf(t);
    if (i > -1) tugiinUtguud.add(i + 1);
  });
  const baaziinNer = argv.find(
    (a, i) => !a.startsWith("--") && !tugiinUtguud.has(i),
  );

  if (!baaziinNer) {
    console.error(
      "Хэрэглээ: node scripts/nekhemjlekh_saraar_kharya.js <baaziinNer> [--saruud 6]",
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    console.log(`\n📦 Бааз: ${baaziinNer}`);

    // Гэрээ → барилга зураглал (идэвхтэй гэрээ).
    const gereenuud = await conn
      .collection("geree")
      .find({ tuluv: "Идэвхтэй" })
      .project({ _id: 1, barilgiinId: 1, gereeniiDugaar: 1, toot: 1 })
      .toArray();

    const gereeniiBarilga = new Map();
    const barilgiinGeree = new Map();
    for (const g of gereenuud) {
      const b = String(g.barilgiinId || "(хоосон)");
      gereeniiBarilga.set(String(g._id), b);
      if (!barilgiinGeree.has(b)) barilgiinGeree.set(b, []);
      barilgiinGeree.get(b).push(g);
    }

    console.log(
      `   Идэвхтэй гэрээ: ${gereenuud.length}, барилга: ${barilgiinGeree.size}`,
    );

    // ГЭРЭЭН дээр ямар зардал байх ёстойг цуглуулна.
    let neruud = shalgakhNeruud;
    if (!neruud) {
      const gereeniiNeruud = await conn
        .collection("geree")
        .distinct("zardluud.ner", { tuluv: "Идэвхтэй" });
      neruud = gereeniiNeruud
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .sort();
    }
    console.log(`   Шалгах зардлын нэр: ${neruud.join(", ") || "(алга)"}`);

    // Нэг нэхэмжлэхийн БҮТЦИЙГ харуулна — талбарын зам таарч байгаа эсэхийг
    // нүдээр батлахгүйгээр тоонуудыг тайлбарлаж болохгүй.
    if (jisheeKharuulya) {
      const jishee = await conn
        .collection("nekhemjlekhiinTuukh")
        .findOne({}, { sort: { ognoo: -1 } });
      console.log("");
      console.log("── ЖИШЭЭ нэхэмжлэх (бүтэц шалгах) ──");
      console.log(JSON.stringify(jishee, null, 2).slice(0, 4000));
      console.log("── жишээ дуусав ──");
    }

    const odoo = new Date();
    for (let i = saruudToo - 1; i >= 0; i--) {
      const ekhniiUdur = new Date(
        Date.UTC(odoo.getUTCFullYear(), odoo.getUTCMonth() - i, 1),
      );
      const jil = ekhniiUdur.getUTCFullYear();
      const sar0 = ekhniiUdur.getUTCMonth();
      const { ekhlel, tugsgel } = sariinKhyazgaar(jil, sar0);

      const nekhemjlekhuud = await conn
        .collection("nekhemjlekhiinTuukh")
        .find({ ognoo: { $gte: ekhlel, $lt: tugsgel } })
        .project({ gereeniiId: 1, "medeelel.zardluud": 1, ognoo: 1 })
        .toArray();

      console.log(`\n${"=".repeat(70)}`);
      console.log(
        `🗓  ${jil}-${String(sar0 + 1).padStart(2, "0")} — нийт нэхэмжлэх: ${nekhemjlekhuud.length}`,
      );
      console.log("=".repeat(70));

      // Барилгаар бүлэглэнэ.
      const barilgaBar = new Map();
      for (const n of nekhemjlekhuud) {
        const b = gereeniiBarilga.get(String(n.gereeniiId)) || "(тодорхойгүй)";
        if (!barilgaBar.has(b)) barilgaBar.set(b, []);
        barilgaBar.get(b).push(n);
      }

      for (const [b, gereenuudNi] of barilgiinGeree) {
        const minii = barilgaBar.get(b) || [];
        const niitGeree = gereenuudNi.length;

        if (!minii.length) {
          console.log(
            `\n   ❌ барилга ${b}: ${niitGeree} идэвхтэй гэрээ, нэхэмжлэх 0 — ЭНЭ САРД ОГТ ҮҮСЭЭГҮЙ`,
          );
          continue;
        }

        // Зардлын нэр бүрээр хэдэн нэхэмжлэхэд орсныг тоолно.
        const neriinToo = new Map();
        for (const n of minii) {
          const neruud = new Set(
            (n.medeelel?.zardluud || [])
              .map((z) => String(z?.ner || "").trim())
              .filter(Boolean),
          );
          neruud.forEach((ner) =>
            neriinToo.set(ner, (neriinToo.get(ner) || 0) + 1),
          );
        }

        const temdeg = minii.length < niitGeree ? "⚠️ " : "✅";
        console.log(
          `\n   ${temdeg} барилга ${b}: нэхэмжлэх ${minii.length}/${niitGeree} гэрээнд`,
        );

        // ЗААВАЛ бүх нэрийг хэвлэнэ — 0 байсан ч. Өмнө нь олдсон нэрсийг
        // л хэвлэдэг байсан тул «0 нэхэмжлэхэд байна» гэдэг нь «ийм зардал
        // байхгүй» гэдгээс ялгагдахгүй, бүрэн алга болсныг НУУДАГ байв.
        for (const ner of neruud) {
          const too = neriinToo.get(ner) || 0;
          const t = too === 0 ? "❌" : too < minii.length ? "⚠️ " : "✅";
          console.log(`      ${t} «${ner}»: ${too}/${minii.length}`);
        }

        // Хүлээгээгүй нэрс (нэхэмжлэхэд байгаа ч гэрээнд алга).
        for (const [ner, too] of [...neriinToo].sort()) {
          if (neruud.includes(ner)) continue;
          console.log(`      ·  «${ner}» (гэрээнд байхгүй нэр): ${too}/${minii.length}`);
        }
      }
    }
  } finally {
    await conn.close();
  }

  console.log("\nДууслаа.");
  console.log("Тайлбар: ❌ = тэр сард тэр барилгад нэхэмжлэх ОГТ үүсээгүй.");
  console.log(
    "         ⚠️  = зарим гэрээнд/зарим нэхэмжлэхэд дутуу — тоог нь хар.",
  );
}

main().catch((aldaa) => {
  console.error(aldaa);
  process.exit(1);
});
