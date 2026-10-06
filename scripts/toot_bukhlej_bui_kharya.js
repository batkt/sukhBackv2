/**
 * «Энэ тоот дээр оршин суугч аль хэдийн бүртгэгдсэн байна» гэж ХЭН
 * блоклож байгааг олно. ЗӨВХӨН УНШИНА.
 *
 * models/orshinSuugch.js доторх pre-save шалгуурыг ЯГ давтана. Тэр шалгуур нь:
 *   1) баримтын ДЭЭД талын toot/davkhar/orts/barilgiinId таарвал;
 *   2) баримтын ДЭЭД талын barilgiinId таарч, `toots` дотор ижил тоот байвал
 *      — тэр toots мөр нь ӨӨР барилгынх байсан ч;
 *   3) `toots` дотор тоот БА барилга хоёулаа таарвал.
 * Мөн `turul`-ээр (гараж/агуулах) шүүдэггүй, цуцлагдсан/идэвхгүйг ялгадаггүй.
 *
 *   node scripts/toot_bukhlej_bui_kharya.js <toot> <barilgiinId> [davkhar] [orts]
 *   node scripts/toot_bukhlej_bui_kharya.js 905 6a979ad8d2d69c94c9e9bfac 9 1
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь төв баазын 127.0.0.1)
 *   --db <ner>              өөр баазын нэр (анхдагч amarSukh — төв бааз)
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
  const UTGATAI = new Set(["--uri", "--db"]);
  const bairlaltai = [];
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      if (UTGATAI.has(a)) i += 1;
      continue;
    }
    bairlaltai.push(a);
  }
  const [toot, barilgiinId, davkhar, orts] = bairlaltai;
  const uriBase = argValue("--uri") || DEFAULT_URI;
  const baaz = argValue("--db") || "amarSukh";

  if (!toot || !barilgiinId) {
    console.error(
      "Хэрэглээ: node scripts/toot_bukhlej_bui_kharya.js <toot> <barilgiinId> [davkhar] [orts]",
    );
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaz))
    .asPromise();

  try {
    const suuri = { toot: String(toot) };
    if (davkhar) suuri.davkhar = String(davkhar);
    if (orts) suuri.orts = String(orts);

    const nukhtsluud = [
      {
        ner: "1) ДЭЭД талын toot таарсан",
        q: { ...suuri, barilgiinId: String(barilgiinId) },
      },
      {
        ner: "2) ДЭЭД талын barilgiinId + toots дотор тоот (барилга ҮЛ ХАМААРАН)",
        q: {
          barilgiinId: String(barilgiinId),
          toots: { $elemMatch: { ...suuri } },
        },
      },
      {
        ner: "3) toots дотор тоот БА барилга таарсан",
        q: {
          toots: { $elemMatch: { ...suuri, barilgiinId: String(barilgiinId) } },
        },
      },
    ];

    console.log(
      `\n🔎 Тоот "${toot}" | барилга ${barilgiinId}` +
        `${davkhar ? ` | давхар ${davkhar}` : ""}${orts ? ` | орц ${orts}` : ""}` +
        `\n   Бааз: ${baaz}\n`,
    );

    let niitOlson = 0;
    for (const { ner, q } of nukhtsluud) {
      const olson = await conn
        .collection("orshinSuugch")
        .find(q)
        .limit(10)
        .toArray();

      console.log(`${olson.length ? "⛔" : "✅"} ${ner}: ${olson.length}`);
      for (const os of olson) {
        niitOlson += 1;
        const taarakhToots = (os.toots || []).filter(
          (t) => String(t?.toot || "").trim() === String(toot),
        );
        console.log(
          `     _id=${os._id}  нэр="${[os.ovog, os.ner].filter(Boolean).join(" ") || "-"}"  ` +
            `утас=${os.utas || "-"}\n` +
            `       дээд: toot=${os.toot ?? "-"} davkhar=${os.davkhar ?? "-"} ` +
            `orts=${os.orts ?? "-"} barilgiinId=${os.barilgiinId ?? "-"}`,
        );
        for (const t of taarakhToots) {
          console.log(
            `       toots[]: toot=${t.toot} turul=${t.turul ?? "-"} ` +
              `barilgiinId=${t.barilgiinId ?? "⛔ БАЙХГҮЙ"} ` +
              `davkhar=${t.davkhar ?? "-"} orts=${t.orts ?? "-"}` +
              `${String(t.barilgiinId || "") !== String(barilgiinId) ? "  ← ӨӨР БАРИЛГЫНХ" : ""}` +
              `${/гараж|гараш|зогсоол|агуулах/i.test(String(t.turul || "")) ? "  ← ГАРАЖ/АГУУЛАХ" : ""}`,
          );
        }
      }
    }

    if (!niitOlson) {
      console.log(
        "\n✅ Нэг ч нөхцөл таарсангүй — энэ тоот ЧӨЛӨӨТЭЙ.\n" +
          "   Алдаа өөр газраас (өөр барилга/давхар/орц утгатай) гарч байна.\n" +
          "   Excel-ийн Орц/Давхар баганыг шалгана уу.",
      );
    } else {
      console.log(
        "\n— Дээрх бичлэгүүд блоклож байна. «← ӨӨР БАРИЛГЫНХ» эсвэл\n" +
          "  «← ГАРАЖ/АГУУЛАХ» гэсэн тэмдэглэгээтэй мөр байвал энэ нь ХУУРАМЧ\n" +
          "  блоклолт — шалгуур нь барилга/төрлөөр ялгадаггүйн улмаас.",
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
