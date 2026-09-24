/**
 * Зочин машинд төлбөр бодогдохгүй байгааг оношлох — ЗӨВХӨН УНШИНА.
 *
 * Ашиглах:
 *   cd scratch && node zochin_tulbur_shalgakh.js <baiguullagiinId> <машины дугаар>
 *
 * Хэвлэх зүйл:
 *   1. `mashin` дээр тухайн дугаар ямар төрлөөр (zochinTurul) бүртгэгдсэн —
 *      «Оршин суугч» гэж бүртгэгдсэн бол зогсоолын систем түүнийг оршин
 *      суугчийн машин гэж таньж төлбөр бодохгүй байх магадлалтай.
 *   2. `ezenUrisanMashin` урилгууд — tusBurUneguiMinut / ашигласан минут.
 *   3. Сүүлийн 5 `uilchluulegch` (зогсоолын session) — niitDun, tuukh.
 *   4. `zochinZogsooliinTuukh` (түрээсийн зогсоолоос ирсэн webhook).
 */
require("dotenv").config({ path: "../tokhirgoo/tokhirgoo.env" });
const { db } = require("zevbackv2");

async function main() {
  const [orgId, dugaarArg] = process.argv.slice(2);
  if (!orgId || !dugaarArg) {
    console.error("Ашиглах: node zochin_tulbur_shalgakh.js <baiguullagiinId> <дугаар>");
    process.exit(1);
  }
  const dugaar = String(dugaarArg).trim().toUpperCase();
  const dugaarRe = new RegExp(`^${dugaar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

  db.kholboltUusgey(null, process.env.MONGODB_URI);
  await new Promise((r) => setTimeout(r, 3000));

  const kh = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(orgId));
  if (!kh) {
    console.error(`Байгууллагын холболт олдсонгүй: ${orgId}`);
    process.exit(1);
  }

  const Mashin = require("../models/mashin");
  const { Uilchluulegch, EzenUrisanMashin } = require("sukhParking-v1");
  const ZochinZogsooliinTuukh = require("../models/zochinZogsooliinTuukh");

  const ms = await Mashin(kh)
    .find({ $or: [{ dugaar: dugaarRe }, { mashiniiDugaar: dugaarRe }] })
    .lean();
  console.log(`\n=== 1. mashin (${ms.length}) ===`);
  ms.forEach((m) =>
    console.log({
      _id: String(m._id),
      zochinTurul: m.zochinTurul,
      turul: m.turul,
      ezemshigchiinId: m.ezemshigchiinId,
      ezemshigchiinNer: m.ezemshigchiinNer,
      ezenToot: m.ezenToot,
      zochinTusBurUneguiMinut: m.zochinTusBurUneguiMinut,
      zochinNiitUneguiMinut: m.zochinNiitUneguiMinut,
      updatedAt: m.updatedAt,
    }),
  );

  const ez = await EzenUrisanMashin(kh).find({ urisanMashiniiDugaar: dugaarRe }).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`\n=== 2. ezenUrisanMashin (сүүлийн ${ez.length}) ===`);
  ez.forEach((e) =>
    console.log({
      _id: String(e._id),
      ezemshigchiinId: e.ezemshigchiinId,
      tuluv: e.tuluv,
      davtamjiinTurul: e.davtamjiinTurul,
      tusBurUneguiMinut: e.tusBurUneguiMinut,
      tusBurAshiglasanUneguiMinut: e.tusBurAshiglasanUneguiMinut,
      tusBurAshiglasanUneguiMinutNiit: e.tusBurAshiglasanUneguiMinutNiit,
      createdAt: e.createdAt,
    }),
  );

  const us = await Uilchluulegch(kh, true).find({ mashiniiDugaar: dugaarRe }).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`\n=== 3. uilchluulegch (сүүлийн ${us.length}) ===`);
  us.forEach((u) =>
    console.log(
      JSON.stringify(
        {
          _id: String(u._id),
          turul: u.turul,
          zochinTurul: u.zochinTurul,
          niitDun: u.niitDun,
          khungulult: u.khungulult,
          tuukh: (u.tuukh || []).slice(0, 3).map((t) => ({
            tuluv: t.tuluv,
            tulukhDun: t.tulukhDun,
            niitKhugatsaa: t.niitKhugatsaa,
            tsagiinTuukh: t.tsagiinTuukh,
            tulbur: t.tulbur,
          })),
          createdAt: u.createdAt,
        },
        null,
        1,
      ),
    ),
  );

  const zt = await ZochinZogsooliinTuukh(kh).find({ mashiniiDugaar: dugaarRe }).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`\n=== 4. zochinZogsooliinTuukh (сүүлийн ${zt.length}) ===`);
  zt.forEach((z) =>
    console.log({
      tuluv: z.tuluv,
      tulburiinTurul: z.tulburiinTurul,
      orsonTsag: z.orsonTsag,
      garsanTsag: z.garsanTsag,
      niitKhugatsaa: z.niitKhugatsaa,
      uneguiMinutAshiglasan: z.uneguiMinutAshiglasan,
      uneguiMinutUldsen: z.uneguiMinutUldsen,
      tulukhDun: z.tulukhDun,
      niitDun: z.niitDun,
    }),
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
