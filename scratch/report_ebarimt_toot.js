// EbarimtShine бичлэгүүдийн дутуу ТООТ-ыг олж харуулна.
// Бие даасан скрипт — lib/tootResolver.js байхгүй сервер дээр ч ажиллана.
//
// Ашиглалт:
//   node scratch/report_ebarimt_toot.js               -> зөвхөн харуулна (dry run)
//   node scratch/report_ebarimt_toot.js --apply       -> баазад бичнэ
//   node scratch/report_ebarimt_toot.js --org=<id>    -> тухайн байгууллагаар шүүнэ
//   node scratch/report_ebarimt_toot.js --db=nairamdalSukh  -> тухайн баазаар шүүнэ
//   node scratch/report_ebarimt_toot.js --dump-unresolved   -> тоот олдоогүй баримтуудыг бүтнээр нь хэвлэнэ
require("dotenv").config({ path: __dirname + "/../tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");
const { db } = require("zevbackv2");

const APPLY = process.argv.includes("--apply");
const DUMP = process.argv.includes("--dump-unresolved");
const arg = (ner) =>
  (process.argv.find((a) => a.startsWith(`--${ner}=`)) || "").split("=")[1];
const orgArg = arg("org");
const dbArg = arg("db");

// ---------------------------------------------------------------- resolver
const tootBaikhEsekh = (utga) => {
  if (utga === undefined || utga === null) return false;
  const str = String(utga).trim();
  return str !== "" && str !== "-";
};

function tootAvya(barimt) {
  if (!barimt) return "";
  if (tootBaikhEsekh(barimt.toot)) return String(barimt.toot).trim();
  if (Array.isArray(barimt.toots)) {
    for (const t of barimt.toots) {
      const utga = typeof t === "string" || typeof t === "number" ? t : t?.toot;
      if (tootBaikhEsekh(utga)) return String(utga).trim();
    }
  }
  return "";
}

const objectIdMuu = (id) => !mongoose.Types.ObjectId.isValid(String(id || ""));

async function ebarimtiinTootNukhye(kholbolt, jagsaalt, tokhirgoo = {}) {
  const { khadgalakhEsekh = true } = tokhirgoo;
  const durslel = { shalgasan: 0, oldson: 0, khadgalsan: 0 };
  if (!kholbolt || !Array.isArray(jagsaalt) || jagsaalt.length === 0)
    return durslel;

  const Geree = require("../models/geree");
  const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
  const EbarimtShine = require("../models/ebarimtShine");

  const dutuu = jagsaalt.filter((e) => e && !tootBaikhEsekh(e.toot));
  durslel.shalgasan = dutuu.length;
  if (dutuu.length === 0) return durslel;

  // 1) Нэхэмжлэхээс
  const nekhemjlekhIds = [
    ...new Set(
      dutuu
        .map((e) => e.nekhemjlekhiinId && String(e.nekhemjlekhiinId))
        .filter((id) => id && !objectIdMuu(id))
    ),
  ];
  const nekhemjlekhMap = new Map();
  if (nekhemjlekhIds.length > 0) {
    const nn = await NekhemjlekhiinTuukh(kholbolt)
      .find({ _id: { $in: nekhemjlekhIds } })
      .select("toot toots gereeniiDugaar gereeniiId")
      .lean();
    for (const n of nn) nekhemjlekhMap.set(String(n._id), n);
  }

  // 2) Гэрээнээс (gereeniiId эсвэл gereeniiDugaar-аар)
  const gereeIds = [
    ...new Set(
      dutuu
        .map((e) => nekhemjlekhMap.get(String(e.nekhemjlekhiinId || ""))?.gereeniiId)
        .filter((id) => id && !objectIdMuu(id))
        .map(String)
    ),
  ];
  const gereeniiDugaaruud = [
    ...new Set(
      dutuu
        .map(
          (e) =>
            e.gereeniiDugaar ||
            nekhemjlekhMap.get(String(e.nekhemjlekhiinId || ""))?.gereeniiDugaar ||
            ""
        )
        .filter(Boolean)
    ),
  ];

  const gereeIdMap = new Map();
  const gereeDugaarMap = new Map();
  if (gereeIds.length > 0 || gereeniiDugaaruud.length > 0) {
    const shalguur = [];
    if (gereeIds.length) shalguur.push({ _id: { $in: gereeIds } });
    if (gereeniiDugaaruud.length)
      shalguur.push({ gereeniiDugaar: { $in: gereeniiDugaaruud } });
    const gg = await Geree(kholbolt)
      .find({ $or: shalguur })
      .select("toot gereeniiDugaar tuluv")
      .lean();
    for (const g of gg) {
      gereeIdMap.set(String(g._id), g);
      const umnukh = gereeDugaarMap.get(g.gereeniiDugaar);
      if (!umnukh || g.tuluv === "Идэвхтэй")
        gereeDugaarMap.set(g.gereeniiDugaar, g);
    }
  }

  const bulkOps = [];
  for (const barimt of dutuu) {
    const nekhemjlekh = nekhemjlekhMap.get(String(barimt.nekhemjlekhiinId || ""));
    const gereeniiDugaar =
      barimt.gereeniiDugaar || nekhemjlekh?.gereeniiDugaar || "";
    const toot =
      tootAvya(nekhemjlekh) ||
      tootAvya(gereeIdMap.get(String(nekhemjlekh?.gereeniiId || ""))) ||
      tootAvya(gereeDugaarMap.get(gereeniiDugaar)) ||
      "";
    if (!toot) continue;

    barimt.toot = toot;
    durslel.oldson += 1;
    if (khadgalakhEsekh && barimt._id)
      bulkOps.push({
        updateOne: { filter: { _id: barimt._id }, update: { $set: { toot } } },
      });
  }

  if (bulkOps.length > 0) {
    try {
      const kharyu = await EbarimtShine(kholbolt).bulkWrite(bulkOps, {
        ordered: false,
      });
      durslel.khadgalsan = kharyu?.modifiedCount || 0;
    } catch (err) {
      console.error("[TOOT RESOLVER] bulkWrite алдаа:", err.message);
    }
  }
  return durslel;
}

// ------------------------------------------------------------------- main
async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("MONGODB_URI тохируулаагүй байна");
  db.kholboltUusgey(null, MONGODB_URI);
  await new Promise((r) => setTimeout(r, 5000));

  const EbarimtShine = require("../models/ebarimtShine");

  const buhKholbolt = (db.kholboltuud || []).filter(
    (k) => k.baaziinNer !== "undsenBaaz" && !!k.baiguullagiinId
  );
  const kholboltuud = buhKholbolt.filter((k) => {
    if (orgArg && String(k.baiguullagiinId) !== orgArg) return false;
    if (dbArg && String(k.baaziinNer || "") !== dbArg) return false;
    return true;
  });

  console.log(
    `\nХолболт: ${kholboltuud.length}/${buhKholbolt.length} | Горим: ${
      APPLY ? "APPLY (баазад бичнэ)" : "DRY RUN (зөвхөн харуулна)"
    }\n`
  );

  let niitDutuu = 0,
    niitOldson = 0,
    niitKhadgalsan = 0;

  for (const kh of kholboltuud) {
    const baazNer = kh.baaziinNer || "?";
    let barimtuud;
    try {
      barimtuud = await EbarimtShine(kh)
        .find({
          $or: [
            { toot: { $in: [null, "", "-"] } },
            { toot: { $exists: false } },
          ],
        })
        .select(
          DUMP
            ? "-receipts -payments -qrData"
            : "_id toot date createdAt gereeniiDugaar nekhemjlekhiinId receiptId totalAmount"
        )
        .sort({ createdAt: -1 })
        .lean();
    } catch (e) {
      console.log(`(${baazNer}) уншиж чадсангүй: ${e.message}`);
      continue;
    }
    if (!barimtuud.length) continue;

    console.log(
      `=== ${baazNer} | org ${kh.baiguullagiinId} | тоотгүй баримт: ${barimtuud.length} ===`
    );
    const durslel = await ebarimtiinTootNukhye(kh, barimtuud, {
      khadgalakhEsekh: APPLY,
    });

    console.table(
      barimtuud.map((b, i) => ({
        "№": i + 1,
        Огноо: new Date(b.date || b.createdAt)
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
        Тоот: b.toot || "ОЛДСОНГҮЙ",
        "Гэрээний дугаар": b.gereeniiDugaar || "-",
        ДДТД: b.receiptId || "-",
        Дүн: Number(b.totalAmount || 0).toLocaleString("en-US"),
      }))
    );
    console.log(
      `-> Шалгасан: ${durslel.shalgasan}, Олсон: ${durslel.oldson}, Бичсэн: ${durslel.khadgalsan}\n`
    );

    if (DUMP) {
      const oldoogui = barimtuud.filter((b) => !b.toot);
      if (oldoogui.length) {
        console.log(
          `--- Тоот олдоогүй ${oldoogui.length} баримтын бүрэн мэдээлэл ---`
        );
        for (const b of oldoogui) console.dir(b, { depth: 4 });
        console.log("");
      }
    }

    niitDutuu += durslel.shalgasan;
    niitOldson += durslel.oldson;
    niitKhadgalsan += durslel.khadgalsan;
  }

  console.log(
    `НИЙТ: тоотгүй ${niitDutuu} | олсон ${niitOldson} | олдоогүй ${
      niitDutuu - niitOldson
    } | баазад бичсэн ${niitKhadgalsan}`
  );
  if (!APPLY && niitOldson > 0)
    console.log("\nБаазад бичих:  node scratch/report_ebarimt_toot.js --apply");
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
