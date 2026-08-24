// EbarimtShine бичлэгүүдийн дутуу ТООТ-ыг олж харуулна.
// Ашиглалт:
//   node scratch/report_ebarimt_toot.js               -> зөвхөн харуулна (dry run)
//   node scratch/report_ebarimt_toot.js --apply       -> баазад бичнэ
//   node scratch/report_ebarimt_toot.js --org=<id>    -> тухайн байгууллагаар шүүнэ
require("dotenv").config({ path: __dirname + "/../tokhirgoo/tokhirgoo.env" });
const { db } = require("zevbackv2");

const APPLY = process.argv.includes("--apply");
const orgArg = (process.argv.find((a) => a.startsWith("--org=")) || "").split("=")[1];

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("MONGODB_URI тохируулаагүй байна");
  db.kholboltUusgey(null, MONGODB_URI);
  await new Promise((r) => setTimeout(r, 4000));

  const EbarimtShine = require("../models/ebarimtShine");
  const { ebarimtiinTootNukhye } = require("../lib/tootResolver");

  const kholboltuud = (db.kholboltuud || []).filter(
    (k) => !orgArg || String(k.baiguullagiinId) === orgArg
  );
  console.log(`Холболт: ${kholboltuud.length} ширхэг | Горим: ${APPLY ? "APPLY (бичнэ)" : "DRY RUN"}\n`);

  let niitDutuu = 0, niitOldson = 0;

  for (const kh of kholboltuud) {
    let barimtuud;
    try {
      barimtuud = await EbarimtShine(kh)
        .find({ $or: [{ toot: { $in: [null, "", "-"] } }, { toot: { $exists: false } }] })
        .select("_id toot date createdAt gereeniiDugaar nekhemjlekhiinId receiptId totalAmount")
        .sort({ createdAt: -1 })
        .lean();
    } catch (e) {
      continue;
    }
    if (!barimtuud.length) continue;

    console.log(`=== Байгууллага ${kh.baiguullagiinId} — тоотгүй баримт: ${barimtuud.length} ===`);
    const durslel = await ebarimtiinTootNukhye(kh, barimtuud, { khadgalakhEsekh: APPLY });

    const mur = barimtuud.map((b, i) => ({
      "№": i + 1,
      Огноо: new Date(b.date || b.createdAt).toISOString().slice(0, 19).replace("T", " "),
      Тоот: b.toot || "ОЛДСОНГҮЙ",
      "Гэрээний дугаар": b.gereeniiDugaar || "-",
      ДДТД: b.receiptId || "-",
      Дүн: Number(b.totalAmount || 0).toLocaleString("mn-MN"),
    }));
    console.table(mur);
    console.log(
      `-> Шалгасан: ${durslel.shalgasan}, Олсон: ${durslel.oldson}, Баазад бичсэн: ${durslel.khadgalsan}\n`
    );
    niitDutuu += durslel.shalgasan;
    niitOldson += durslel.oldson;
  }

  console.log(`НИЙТ: тоотгүй ${niitDutuu}, олсон ${niitOldson}, олдоогүй ${niitDutuu - niitOldson}`);
  if (!APPLY && niitOldson > 0)
    console.log("\nБаазад бичихийн тулд: node scratch/report_ebarimt_toot.js --apply");
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
