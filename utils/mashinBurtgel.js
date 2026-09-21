/**
 * Машины дугаарын бүртгэлийн нэгдсэн логик.
 *
 * Нэг машин ГУРВАН цэгт бүртгэгдэх шаардлагатай — аль нэг нь дутвал
 * хаалга/камер машиныг танихаа болих эсвэл зочин урих эрх алга болдог:
 *
 *   1. Төв баазын `orshinSuugchMashin` — зочин урих эрх, квот (аппын тал).
 *   2. Байгууллагын баазын `orshinSuugchMashin` — тухайн байрны зочны тохиргоо.
 *   3. Байгууллагын баазын `mashin` — хаалга/камерын танилт (`dugaar`).
 *
 * Өмнө нь энэ гурвалсан бичилт зөвхөн оршин суугчийн Excel импортын дотор
 * inline байсан тул харилцагчийн импорт, эсвэл дараагийн ямар ч урсгал үүнийг
 * дахин хуулахаас өөр аргагүй болдог байв. Тиймээс нэг эх сурвалж болгов.
 */

/** Excel/гараас ирсэн дугаарыг нэг хэлбэрт оруулна: "1234 УБА" → "1234УБА". */
function mashiniiDugaarTseverle(dugaar) {
  return String(dugaar ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Дугаар биш, зүгээр "хоосон" гэсэн утга агуулсан бичлэгүүд. */
const KHOOSON_UTGANUUD = new Set(["", "БҮРТГЭЛГҮЙ", "-", "ҮГҮЙ"]);

/**
 * Нэг нүдэнд бичсэн олон дугаарыг салгана.
 * "1234УБА, 5678УНА" / "1234УБА; 5678УНА" / шинэ мөрөөр аль нь ч болно.
 *
 * @param {any} raw Excel-ийн нүдний утга
 * @returns {string[]} давхардалгүй, цэвэрлэсэн дугаарууд
 */
function dugaaruudSalgaya(raw) {
  const jagsaalt = String(raw ?? "")
    .split(/[,;|/\n\r]+/)
    .map(mashiniiDugaarTseverle)
    .filter((d) => !KHOOSON_UTGANUUD.has(d));
  return Array.from(new Set(jagsaalt));
}

/**
 * Зочны үндсэн тохиргоог барилга → байгууллагын дарааллаар олно.
 * Барилга дээр `zochinUrikhEsekh` тодорхойлогдсон бол барилгынх нь дээгүүрт.
 */
function zochinTokhirgooOlya(baiguullaga, barilgiinId) {
  const barilga = baiguullaga?.barilguud?.find(
    (b) => String(b._id) === String(barilgiinId),
  );
  const barilgiinTokhirgoo = barilga?.tokhirgoo?.zochinTokhirgoo;
  const baiguullagiinTokhirgoo = baiguullaga?.tokhirgoo?.zochinTokhirgoo;

  return barilgiinTokhirgoo &&
    barilgiinTokhirgoo.zochinUrikhEsekh !== undefined
    ? barilgiinTokhirgoo
    : baiguullagiinTokhirgoo;
}

/**
 * Машины дугааруудыг эзэмшигч дээр бүртгэнэ (байгаа бол эзэмшигчийг сольж
 * шинэчилнэ, байхгүй бол шинээр үүсгэнэ). Аль нэг цэг дээр алдаа гарсан ч
 * бусад цэгийн бүртгэл үргэлжилнэ — машин хагас бүртгэгдсэн байх нь машин
 * бүртгэгдээгүйгээс дээр.
 *
 * @param {object} p
 * @param {object} p.erunkhiiKholbolt Төв баазын холболт (`db.erunkhiiKholbolt`)
 * @param {object} [p.tukhainBaaziinKholbolt] Байгууллагын баазын холболт
 * @param {object} p.baiguullaga Байгууллагын документ (зочны тохиргоо уншина)
 * @param {object} p.ezemshigch Эзэмшигч (оршин суугч/харилцагч) документ
 * @param {string[]|string} p.dugaaruud Дугаарын массив эсвэл Excel-ийн нүд
 * @param {string} [p.barilgiinId]
 * @param {string} [p.toot] Эзний тоот (зогсоолын дугаар ч байж болно)
 * @param {string} [p.utas]
 * @param {string} [p.zochinTurul]
 * @returns {Promise<{shine: string[], shinechilsen: string[], aldaa: string[]}>}
 */
async function mashinuudBurtgeye({
  erunkhiiKholbolt,
  tukhainBaaziinKholbolt,
  baiguullaga,
  ezemshigch,
  dugaaruud,
  barilgiinId,
  toot,
  utas,
  zochinTurul = "Оршин суугч",
}) {
  const khariu = { shine: [], shinechilsen: [], aldaa: [] };

  const jagsaalt = Array.isArray(dugaaruud)
    ? Array.from(
        new Set(
          dugaaruud
            .map(mashiniiDugaarTseverle)
            .filter((d) => !KHOOSON_UTGANUUD.has(d)),
        ),
      )
    : dugaaruudSalgaya(dugaaruud);

  if (jagsaalt.length === 0 || !ezemshigch?._id) return khariu;

  const OrshinSuugchMashin = require("../models/orshinSuugchMashin");
  const Mashin = require("../models/mashin");

  const baiguullagiinId = String(baiguullaga._id);
  const ezemshigchiinId = String(ezemshigch._id);
  const tokhirgoo = zochinTokhirgooOlya(baiguullaga, barilgiinId);
  const ezenToot = toot || ezemshigch.toot || "";
  const ezniiUtas = Array.isArray(ezemshigch.utas)
    ? ezemshigch.utas[0] || ""
    : ezemshigch.utas || "";
  const kholbogdokhUtas = utas || ezniiUtas;

  /** Зочны тохиргооны талбаруудыг нэг дор бэлдэнэ. */
  const zochinTalbaruud = () => ({
    zochinUrikhEsekh: tokhirgoo?.zochinUrikhEsekh !== false,
    zochinTurul,
    zochinErkhiinToo: tokhirgoo?.zochinErkhiinToo || 0,
    zochinTusBurUneguiMinut: tokhirgoo?.zochinTusBurUneguiMinut || 0,
    zochinNiitUneguiMinut: tokhirgoo?.zochinNiitUneguiMinut || 0,
    zochinTailbar: tokhirgoo?.zochinTailbar || "",
    davtamjiinTurul: tokhirgoo?.davtamjiinTurul || "saraar",
    davtamjUtga: tokhirgoo?.davtamjUtga,
  });

  for (const dugaar of jagsaalt) {
    let shineEsekh = false;

    // 1. Төв баазын orshinSuugchMashin
    try {
      const TuvOSM = OrshinSuugchMashin(erunkhiiKholbolt);
      const baigaa = await TuvOSM.findOne({
        baiguullagiinId,
        mashiniiDugaar: dugaar,
      });

      if (!baigaa) {
        await TuvOSM.create({
          orshinSuugchiinId: ezemshigchiinId,
          baiguullagiinId,
          barilgiinId,
          mashiniiDugaar: dugaar,
          ezenToot,
          utas: kholbogdokhUtas,
          ...zochinTalbaruud(),
        });
        shineEsekh = true;
      } else if (
        !baigaa.orshinSuugchiinId ||
        baigaa.orshinSuugchiinId !== ezemshigchiinId
      ) {
        baigaa.orshinSuugchiinId = ezemshigchiinId;
        baigaa.ezenToot = ezenToot || baigaa.ezenToot;
        baigaa.barilgiinId = barilgiinId || baigaa.barilgiinId;
        await baigaa.save();
      }
    } catch (aldaa) {
      khariu.aldaa.push(`${dugaar}: ${aldaa.message}`);
    }

    if (tukhainBaaziinKholbolt) {
      // 2. Байгууллагын баазын orshinSuugchMashin
      try {
        const BaaziinOSM = OrshinSuugchMashin(tukhainBaaziinKholbolt);
        const baigaa = await BaaziinOSM.findOne({
          baiguullagiinId,
          mashiniiDugaar: dugaar,
        });

        if (!baigaa) {
          await BaaziinOSM.create({
            orshinSuugchiinId: ezemshigchiinId,
            baiguullagiinId,
            barilgiinId,
            mashiniiDugaar: dugaar,
            ezenToot,
            utas: kholbogdokhUtas,
            ...zochinTalbaruud(),
          });
        } else if (
          !baigaa.orshinSuugchiinId ||
          baigaa.orshinSuugchiinId !== ezemshigchiinId
        ) {
          baigaa.orshinSuugchiinId = ezemshigchiinId;
          baigaa.ezenToot = ezenToot || baigaa.ezenToot;
          baigaa.barilgiinId = barilgiinId || baigaa.barilgiinId;
          await baigaa.save();
        }
      } catch (aldaa) {
        khariu.aldaa.push(`${dugaar}: ${aldaa.message}`);
      }

      // 3. Байгууллагын баазын mashin (хаалга/камер)
      try {
        const MashinModel = Mashin(tukhainBaaziinKholbolt);
        const baigaa = await MashinModel.findOne({
          baiguullagiinId,
          dugaar,
        });

        if (!baigaa) {
          await MashinModel.create({
            baiguullagiinId,
            barilgiinId,
            dugaar,
            mashiniiDugaar: dugaar,
            ezemshigchiinId,
            orshinSuugchiinId: ezemshigchiinId,
            ezemshigchiinNer: ezemshigch.ner || "",
            ezemshigchiinUtas: kholbogdokhUtas,
            ezenToot,
            turul: zochinTurul,
            tuluv: "Идэвхтэй",
            ...zochinTalbaruud(),
          });
          shineEsekh = true;
        } else if (
          !baigaa.ezemshigchiinId ||
          baigaa.ezemshigchiinId !== ezemshigchiinId
        ) {
          baigaa.ezemshigchiinId = ezemshigchiinId;
          baigaa.orshinSuugchiinId = ezemshigchiinId;
          baigaa.ezenToot = ezenToot || baigaa.ezenToot;
          baigaa.barilgiinId = barilgiinId || baigaa.barilgiinId;
          await baigaa.save();
        }
      } catch (aldaa) {
        khariu.aldaa.push(`${dugaar}: ${aldaa.message}`);
      }
    }

    if (shineEsekh) khariu.shine.push(dugaar);
    else khariu.shinechilsen.push(dugaar);
  }

  return khariu;
}

module.exports = {
  mashiniiDugaarTseverle,
  dugaaruudSalgaya,
  zochinTokhirgooOlya,
  mashinuudBurtgeye,
};
