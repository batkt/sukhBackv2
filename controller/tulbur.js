const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const Baiguullaga = require("../models/baiguullaga");
const lodash = require("lodash");

async function tooZasya(too) {
  var zassanToo = (await Math.round((too + Number.EPSILON) * 100)) / 100;
  return +zassanToo.toFixed(2);
}

function tooZasyaSync(too) {
  var zassanToo = Math.round((too + Number.EPSILON) * 100) / 100;
  return +zassanToo.toFixed(2);
}

async function daraagiinTulukhOgnooZasya(gereeniiId, tukhainBaaziinKholbolt) {
  var geree = await Geree(tukhainBaaziinKholbolt, true)
    .findById(gereeniiId)
    .select("avlaga");
  var jagsaalt = [];
  if (lodash.isArray(lodash.get(geree, "avlaga.guilgeenuud"))) {
    jagsaalt = lodash.get(geree, "avlaga.guilgeenuud");
  }
  jagsaalt = lodash.filter(jagsaalt, (a) => a.turul != "baritsaa");
  var niitTulsunDun = lodash.sumBy(jagsaalt, function (object) {
    if (object.ognoo < new Date()) return object.tulsunDun;
    else return 0;
  });
  var niitKhyamdral = lodash.sumBy(jagsaalt, function (object) {
    if (object.ognoo < new Date()) return object.khyamdral;
    else return 0;
  });
  niitTulsunDun = niitTulsunDun + niitKhyamdral;
  jagsaalt = lodash.filter(jagsaalt, (a) => a.tulukhDun != null);
  jagsaalt = lodash.orderBy(jagsaalt, ["ognoo"], ["asc"]);
  var tulukhOgnoo;
  if (jagsaalt && jagsaalt.length > 0) tulukhOgnoo = jagsaalt[0].ognoo;
  jagsaalt.forEach((element) => {
    if (niitTulsunDun >= 0) {
      tulukhOgnoo = element.ognoo;
      niitTulsunDun = niitTulsunDun - element.tulukhDun;
    }
  });
  Geree(tukhainBaaziinKholbolt)
    .findByIdAndUpdate(gereeniiId, {
      $set: { daraagiinTulukhOgnoo: tulukhOgnoo },
    })
    .then((result) => {})
    .catch((err) => {});
}

// Extract тоот number from description
// Handles: "147тоот", "134 тоот", "123toot", "605TOOT95393408", "ТООТ147"
// Fallback: "106 ХААНААС: 150000..." — leading digits before ХААНААС
// тоот is always ≤4 digits — phone numbers (8 digits) excluded automatically
function tootOlgokh(desc) {
  if (!desc) return null;
  // digits (1-4) BEFORE тоот keyword: "605TOOT..." → 605
  const before = desc.match(/(\d{1,4})\s*(?:тоот|toot|ТООТ|TOOT)/i);
  if (before) return before[1];
  // digits (1-4) AFTER тоот keyword: "ТООТ147"
  const after = desc.match(/(?:тоот|toot|ТООТ|TOOT)\s*(\d{1,4})(?!\d)/i);
  if (after) return after[1];
  // fallback: leading digits (1-4) before ХААНААС — "106 ХААНААС: ..."
  const khaanFallback = desc.match(/^(\d{1,4})\s+ХААНААС/i);
  if (khaanFallback) return khaanFallback[1];
  return null;
}

// Extract 8-digit Mongolian phone number (starts with 5-9)
// No word boundary needed — handles "TOOT95393408" correctly
function utasOlgokh(desc) {
  if (!desc) return null;
  const m = desc.match(/[5-9]\d{7}/);
  return m ? m[0] : null;
}

const tulultTaniya = asyncHandler(async (req, res, next) => {
  try {
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const Geree = require("../models/geree");
    const guilgeeService = require("../services/guilgeeService");
    const { Dans } = require("zevbackv2");

    var dansnuud = await Dans(tukhainBaaziinKholbolt).find({
      corporateAshiglakhEsekh: true,
      oirkhonTatakhEsekh: { $exists: false },
      baiguullagiinId: req.body.baiguullagiinId,
    }).lean();

    console.log(`🚀 [ТУЛАЛТ] эхэлж байна — baiguullagiinId=${req.body.baiguullagiinId}`);
    var tulultBolsonToo = 0;

    if (dansnuud?.length > 0) {
      for (const dans of dansnuud) {
        // barilgiinId may not be set on older/CGW records — only filter if present
        var match = {
          dansniiDugaar: dans.dugaar,
          baiguullagiinId: dans.baiguullagiinId,
          bank: dans.bank,
          $or: [
            { kholbosonTalbainId: { $size: 0 } },
            { kholbosonTalbainId: { $exists: false } },
          ],
        };
        if (dans.barilgiinId) match.barilgiinId = dans.barilgiinId;
        var guilgeenuud = await BankniiGuilgee(tukhainBaaziinKholbolt, false).find(match).lean();
        console.log(`🔍 [ТУЛАЛТ] ${dans.bank} ${dans.dugaar}: ${guilgeenuud.length} боловсруулах гүйлгээ`);
        const GuilgeeAvlaguudModel = require("../models/guilgeeAvlaguud");

        for (const guilgee of guilgeenuud) {
          try {
            const desc = guilgee.description || guilgee.TxAddInf || guilgee.tranDesc || guilgee.txnDesc || "";
            const toot = tootOlgokh(desc);
            console.log(`  📄 id=${guilgee._id} desc="${desc.slice(0, 60)}" → тоот=${toot}`);
            if (!toot) continue;

            // Amount: must be positive incoming payment
            let dun = 0;
            if (guilgee.bank === "khanbank") dun = guilgee.amount;
            else if (guilgee.bank === "golomt") {
              if (guilgee.drOrCr === "Debit") continue;
              dun = guilgee.tranAmount;
            }
            else if (guilgee.bank === "tdb") dun = guilgee.Amt;
            else if (guilgee.bank === "bogd") dun = guilgee.amount;
            else if (guilgee.bank === "trans") dun = guilgee.income > 0 ? guilgee.income : 0;
            console.log(`     💰 dun=${dun}`);
            if (!dun || dun <= 0) continue;

            // Prevent duplicate first (cheap check before heavy DB queries)
            const existing = await GuilgeeAvlaguudModel(tukhainBaaziinKholbolt)
              .findOne({ bankniiGuilgeeId: String(guilgee._id), baiguullagiinId: dans.baiguullagiinId })
              .lean().catch(() => null);
            if (existing) {
              console.log(`     ⚠️ Давхардсан — аль хэдийн бүртгэсэн: ${existing._id}`);
              await BankniiGuilgee(tukhainBaaziinKholbolt).findByIdAndUpdate(guilgee._id,
                { $addToSet: { kholbosonTalbainId: String(existing.gereeniiId) } }
              );
              continue;
            }

            // Find active contracts matching тоот (exclude terminated)
            const tootStr = String(Number(toot));
            var gereeMatch = {
              baiguullagiinId: dans.baiguullagiinId,
              $or: [{ toot: toot }, { toot: tootStr }],
              tuluv: { $nin: ["Цуцалсан", "Дууссан"] },
            };
            if (dans.barilgiinId) gereeMatch.barilgiinId = dans.barilgiinId;
            var gereenuud = await Geree(tukhainBaaziinKholbolt, false).find(gereeMatch).lean();
            console.log(`     🏠 тоот=${toot} query=${JSON.stringify(gereeMatch)} → ${gereenuud.length} гэрээ`);

            // Narrow by phone if multiple contracts match
            const utas = utasOlgokh(desc);
            if (utas && gereenuud.length > 1) {
              const byUtas = gereenuud.filter(g =>
                Array.isArray(g.utas) ? g.utas.some(u => String(u) === utas) : String(g.utas) === utas
              );
              if (byUtas.length > 0) gereenuud = byUtas;
            }

            if (gereenuud.length === 0) {
              console.log(`     ⚠️  тоот=${toot} — гэрээ олдсонгүй`);
              continue;
            }
            if (gereenuud.length > 1) {
              // tiebreaker: pick the most recently updated active contract
              gereenuud.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
              console.log(`     ℹ️  тоот=${toot} — ${gereenuud.length} гэрээ, хамгийн сүүлд идэвхтэй гэрээг авлаа: ${gereenuud[0].gereeniiDugaar}`);
              console.log(`        гэрээнүүд: ${gereenuud.map(g => `${g.gereeniiDugaar}(utas:${(g.utas||[]).join(',')})`).join(' | ')}`);
            }

            const geree = gereenuud[0];

            await guilgeeService.recordPayment(tukhainBaaziinKholbolt, {
              baiguullagiinId: String(dans.baiguullagiinId),
              barilgiinId: String(geree.barilgiinId || dans.barilgiinId || ""),
              gereeniiId: String(geree._id),
              gereeniiDugaar: geree.gereeniiDugaar || "",
              orshinSuugchId: geree.orshinSuugchId || "",
              toot: toot,
              ognoo: guilgee.postDate || guilgee.tranDate || guilgee.TxDt || guilgee.txnDate || new Date(),
              dun: -Math.abs(dun),
              tailbar: `Дансны шилжүүлэг ${toot} тоот`,
              source: "bank",
              bankniiGuilgeeId: String(guilgee._id),
              dansniiDugaar: dans.dugaar,
            });

            await BankniiGuilgee(tukhainBaaziinKholbolt).findByIdAndUpdate(guilgee._id, {
              $addToSet: { kholbosonTalbainId: String(geree._id) },
            });

            tulultBolsonToo++;
            console.log(`✅ [ТУЛАЛТ] тоот=${toot} geree=${geree.gereeniiDugaar} dun=${dun}`);
          } catch (guilgeeAldaa) {
            console.error(`❌ [ТУЛАЛТ] guilgee=${guilgee._id} алдаа:`, guilgeeAldaa?.message);
            // continue to next transaction
          }
        }
      }
    }
    console.log(`🏁 [ТУЛАЛТ] дууслаа — нийт тулалт: ${tulultBolsonToo}`);
    res.status(200).json({ message: "Тулалт амжилттай", tulultBolsonToo });
  } catch (err) {
    next(err);
  }
});

module.exports.daraagiinTulukhOgnooZasya = daraagiinTulukhOgnooZasya;
module.exports.tooZasya = tooZasya;
module.exports.tooZasyaSync = tooZasyaSync;
module.exports.tulultTaniya = tulultTaniya;
