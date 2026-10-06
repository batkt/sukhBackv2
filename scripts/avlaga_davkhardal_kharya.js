/**
 * Нэг гэрээний тухайн сарын АВЛАГЫН мөрүүдийг гарал үүслээр нь харуулна.
 * ЗӨВХӨН УНШИНА.
 *
 * Яагаад: зогсоолын төлбөр ХОЁР өөр замаар үүсдэг —
 *   1) utils/zogsoolAvlaga.js  → tailbar "Зогсоол (тоот N)",  source "gar"
 *   2) services/invoiceService.js → ner "Зогсоолын төлбөр (тоот N)"
 * invoiceService нь давхардлыг шалгахдаа ЗӨВХӨН `source: ["gar","zogsool"]`
 * бөгөөд тухайн САРЫН дотор буй мөрүүдийг хардаг. Аль нэг нь таарахгүй бол
 * давхар бичигдэнэ. Энэ скрипт нь мөр бүрийн source/ognoo-г харуулж, аль
 * нөхцөл нь унасныг тодруулна.
 *
 *   node scripts/avlaga_davkhardal_kharya.js <baaziinNer> <gereeniiDugaar>
 *   node scripts/avlaga_davkhardal_kharya.js timetower ГД-52371281
 *
 * Нэмэлт:
 *   --sar 2026-10            өөр сар (анхдагч нь энэ сар)
 *   --uri "mongodb://..."    өөр холболт
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
  const [, , baaziinNer, gereeniiDugaar] = process.argv;
  const uriBase = argValue("--uri") || DEFAULT_URI;
  const sarText = argValue("--sar");

  if (!baaziinNer || !gereeniiDugaar) {
    console.error(
      "Хэрэглээ: node scripts/avlaga_davkhardal_kharya.js <baaziinNer> <gereeniiDugaar> [--sar 2026-10]",
    );
    process.exit(1);
  }

  const odoo = sarText ? new Date(`${sarText}-01T00:00:00Z`) : new Date();
  const sarEkh = new Date(Date.UTC(odoo.getUTCFullYear(), odoo.getUTCMonth(), 1));
  const sarTug = new Date(
    Date.UTC(odoo.getUTCFullYear(), odoo.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    const geree = await conn
      .collection("geree")
      .findOne({ gereeniiDugaar: gereeniiDugaar });

    if (!geree) {
      console.log(`⛔ "${gereeniiDugaar}" гэрээ олдсонгүй.`);
      return;
    }
    console.log(
      `\n🎯 Гэрээ ${geree.gereeniiDugaar}  _id=${geree._id}  тоот=${geree.toot}`,
    );
    console.log(
      `   Сарын хүрээ: ${sarEkh.toISOString()} → ${sarTug.toISOString()}`,
    );

    const murnuud = await conn
      .collection("guilgeeAvlaguud")
      .find({ gereeniiId: String(geree._id) })
      .sort({ ognoo: -1 })
      .limit(60)
      .toArray();

    console.log(`\n📋 Нийт ${murnuud.length} мөр (сүүлийн 60):\n`);
    for (const m of murnuud) {
      const ognoo = m.ognoo ? new Date(m.ognoo) : null;
      const sardBaigaa =
        ognoo && ognoo >= sarEkh && ognoo <= sarTug ? "САРД ✅" : "сараас гадна";
      console.log(
        `  ognoo=${ognoo ? ognoo.toISOString() : "-"}  ${sardBaigaa}\n` +
          `    dun=${m.dun}  tulukhDun=${m.tulukhDun}  turul=${m.turul}  zardliinTurul=${m.zardliinTurul}\n` +
          `    source=${m.source === undefined ? "⛔ БАЙХГҮЙ" : JSON.stringify(m.source)}  toot=${m.toot ?? "-"}\n` +
          `    zardliinNer=${JSON.stringify(m.zardliinNer ?? null)}\n` +
          `    tailbar=${JSON.stringify(m.tailbar ?? null)}\n` +
          `    ajiltan=${m.guilgeeKhiisenAjiltniiNer ?? "-"}  nekhemjlekhId=${m.nekhemjlekhId ?? "-"}\n` +
          `    createdAt=${m.createdAt ? new Date(m.createdAt).toISOString() : "-"}  _id=${m._id}\n`,
      );
    }

    // invoiceService-ийн давхардал шалгах query-г ЯГ давтана.
    const garaarMur = await conn
      .collection("guilgeeAvlaguud")
      .find({
        gereeniiId: String(geree._id),
        dun: { $gt: 0 },
        source: { $in: ["gar", "zogsool"] },
        ognoo: { $gte: sarEkh, $lte: sarTug },
      })
      .project({ tailbar: 1, zardliinNer: 1, toot: 1, source: 1 })
      .toArray();

    console.log(
      `\n🔍 invoiceService-ийн давхардал шалгах query → ${garaarMur.length} мөр олсон:`,
    );
    for (const a of garaarMur) {
      const tulkhuur = `${a.tailbar || ""} ${a.zardliinNer || ""} тоот ${a.toot || ""}`
        .toLowerCase()
        .trim();
      console.log(`   "${tulkhuur}"`);
      console.log(
        `     → "зогсоол" агуулсан: ${tulkhuur.includes("зогсоол")}, тоот таарах эсэх нь доорх мөрүүдээс хамаарна`,
      );
    }
    if (!garaarMur.length) {
      console.log(
        "   ⛔ ХООСОН — энэ нь яг ШАЛТГААН. invoiceService нь өмнөх мөрийг\n" +
          "      ОЛОХГҮЙ тул зогсоолын төлбөрийг ДАХИН нэмнэ.\n" +
          "      Дээрх жагсаалтаас аль нөхцөл (source эсвэл ognoo) унасныг хараарай.",
      );
    }
    // ── ЗОГСООЛ/ГАРАЖИЙН мөрүүд — гэрээгээр нь ШҮҮХГҮЙ ─────────────────
    //
    // Гаражийн төлбөр нь орон сууцныхаас ӨӨР гэрээн дээр бичигдсэн байж
    // болно (тоот 704 vs тоот 61). Иймд энд бүх гэрээгээр нь хайж,
    // мөр бүрийн gereeniiId-г харуулна.
    const zogsoolMur = await conn
      .collection("guilgeeAvlaguud")
      .find({
        ognoo: { $gte: sarEkh, $lte: sarTug },
        $or: [
          { tailbar: { $regex: "зогсоол|гараж|агуулах", $options: "i" } },
          { zardliinNer: { $regex: "зогсоол|гараж|агуулах", $options: "i" } },
        ],
      })
      .sort({ ognoo: -1 })
      .limit(40)
      .toArray();

    console.log(
      `
🅿️  Энэ сарын зогсоол/гаражийн мөрүүд (бүх гэрээгээр): ${zogsoolMur.length}
`,
    );
    for (const m of zogsoolMur) {
      console.log(
        `  dun=${m.dun}  toot=${m.toot ?? "-"}  source=${m.source === undefined ? "⛔ БАЙХГҮЙ" : JSON.stringify(m.source)}
` +
          `    gereeniiId=${m.gereeniiId}  ${String(m.gereeniiId) === String(geree._id) ? "← ЭНЭ гэрээнийх" : "← ӨӨР гэрээнийх"}
` +
          `    zardliinNer=${JSON.stringify(m.zardliinNer ?? null)}  zardliinTurul=${m.zardliinTurul}
` +
          `    tailbar=${JSON.stringify(m.tailbar ?? null)}  turul=${m.turul}
` +
          `    ajiltan=${m.guilgeeKhiisenAjiltniiNer ?? "-"}  nekhemjlekhId=${m.nekhemjlekhId ?? "-"}
` +
          `    ognoo=${m.ognoo && new Date(m.ognoo).toISOString()}  createdAt=${m.createdAt ? new Date(m.createdAt).toISOString() : "-"}
` +
          `    _id=${m._id}
`,
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
