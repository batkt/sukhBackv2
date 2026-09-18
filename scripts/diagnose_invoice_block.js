/**
 * Яагаад "Тухайн сарын нэхэмжлэх аль хэдийн үүссэн байна" гэж хэлж байгааг
 * тайлбарлана. ЗӨВХӨН УНШИНА — юу ч засахгүй.
 *
 *   node scripts/diagnose_invoice_block.js <baaziinNer> <gereeniiId>
 *   node scripts/diagnose_invoice_block.js Futabaamarhom 6aacd0d5061b1322e4bf0d5c
 *
 * Нэмэлт:
 *   --uri "mongodb://..."   өөр холболт (анхдагч нь 127.0.0.1)
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const { calculateBillingCycleBounds } = require("../utils/dateUtils");

const DEFAULT_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--uri");
  const uriIndex = process.argv.indexOf("--uri");
  const uriBase = uriIndex > -1 ? process.argv[uriIndex + 1] : DEFAULT_URI;

  const [baaziinNer, gereeniiId] = args;
  if (!baaziinNer || !gereeniiId) {
    console.error("Хэрэглээ: node scripts/diagnose_invoice_block.js <baaziinNer> <gereeniiId>");
    process.exit(1);
  }

  const conn = await mongoose
    .createConnection(uriBase.replace("{db}", baaziinNer))
    .asPromise();

  try {
    const geree = await conn
      .collection("geree")
      .findOne({ _id: new mongoose.Types.ObjectId(gereeniiId) });

    if (!geree) {
      console.log(`❌ ${baaziinNer} баазаас ${gereeniiId} гэрээ олдсонгүй.`);
      return;
    }

    console.log(`\n📄 Гэрээ: ${geree.gereeniiDugaar} (Тоот ${geree.toot}) — tuluv: ${geree.tuluv}`);
    console.log(`   baiguullagiinId: ${geree.baiguullagiinId}, barilgiinId: ${geree.barilgiinId}`);
    console.log(`   ekhniiUldegdel: ${geree.ekhniiUldegdel}`);

    // Мөчлөгийн өдөр — invoiceService-ийн логиктой ижил.
    let cronDay = 1;
    const cron = await conn
      .collection("nekhemjlekhCron")
      .find({
        baiguullagiinId: geree.baiguullagiinId,
        $or: [{ barilgiinId: geree.barilgiinId }, { barilgiinId: null }],
      })
      .sort({ barilgiinId: -1 })
      .limit(1)
      .toArray();
    if (cron[0] && cron[0].nekhemjlekhUusgekhOgnoo) cronDay = cron[0].nekhemjlekhUusgekhOgnoo;

    const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, new Date());
    console.log(`\n🗓  Мөчлөг (cronDay=${cronDay}): ${startOfCycle.toISOString()} → ${endOfCycle.toISOString()}`);

    const niitMur = await conn
      .collection("guilgeeAvlaguud")
      .countDocuments({ gereeniiId: String(geree._id) });
    console.log(`📚 Гэрээний НИЙТ авлагын мөр: ${niitMur}`);

    const invoices = await conn
      .collection("nekhemjlekhiinTuukh")
      .find({ gereeniiId: String(geree._id) })
      .sort({ ognoo: -1 })
      .limit(6)
      .toArray();

    console.log(`\n🧾 Сүүлийн ${invoices.length} нэхэмжлэх:`);
    for (const inv of invoices) {
      const murToo = await conn
        .collection("guilgeeAvlaguud")
        .countDocuments({ nekhemjlekhId: String(inv._id) });
      const zardliinToo = Array.isArray(inv.medeelel && inv.medeelel.zardluud)
        ? inv.medeelel.zardluud.length
        : 0;
      const ognoo = inv.ognoo ? new Date(inv.ognoo) : null;
      const mochlogtEsekh = ognoo && ognoo >= startOfCycle && ognoo <= endOfCycle;

      console.log(
        [
          `   ${mochlogtEsekh ? "👉" : "  "} ${inv.nekhemjlekhiinDugaar || inv._id}`,
          `ognoo: ${ognoo ? ognoo.toISOString() : "-"}`,
          `tuluv: ${inv.tuluv}`,
          `niitTulbur: ${inv.niitTulbur}`,
          `авлагын мөр: ${murToo}`,
          `зардал: ${zardliinToo}`,
        ].join(" | "),
      );

      if (mochlogtEsekh) {
        if (inv.tuluv === "Төлсөн") {
          console.log(`      → Төлөгдсөн тул хаалт болохгүй, шинэ нэхэмжлэх үүснэ.`);
        } else if (murToo > 0 || zardliinToo > 0) {
          console.log(`      → ХААЖ БАЙГАА нь ЭНЭ. Бодит дүнтэй нэхэмжлэх — override шаардана.`);
        } else {
          console.log(`      → Хоосон баримт. Шинэ кодтой бол нөхөж дүүргэнэ (алдаа заахгүй).`);
        }
      }
    }
    console.log("");
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
