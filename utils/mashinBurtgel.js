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
 * @param {"OrshinSuugch"|"Khariltsagch"} [p.ezemshigchiinTurul] Эзэмшигч хэн
 *   бэ. Коллекц нь хоёуланг агуулдаг тул ялгаж бичнэ —
 *   `models/khariltsagchMashin.js` харна уу.
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
  ezemshigchiinTurul = "OrshinSuugch",
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
          ezemshigchiinTurul,
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
        baigaa.ezemshigchiinTurul = ezemshigchiinTurul;
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
            ezemshigchiinTurul,
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
          baigaa.ezemshigchiinTurul = ezemshigchiinTurul;
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

/**
 * Зочны тохиргооны нэг талбарыг барилга → байгууллагын дарааллаар, ТАЛБАР ТУС
 * БҮРД нөхөж уншина.
 *
 * `zochinTokhirgooOlya` нь бүтэн обьектыг сонгодог: барилга дээр
 * `zochinUrikhEsekh` тавигдсан бол байгууллагын тохиргоо БҮХЭЛДЭЭ хаягддаг.
 * Ингэснээр барилга дээр тохируулаагүй талбар (жишээ нь машины хязгаар)
 * байгууллагын хэмжээнд тохируулсан ч чимээгүй үл хэрэгсэгддэг байв.
 *
 * @param {object} baiguullaga
 * @param {string} barilgiinId
 * @param {string} talbar `zochinTokhirgoo`-ийн талбарын нэр
 */
function tokhirgooniiUtga(baiguullaga, barilgiinId, talbar) {
  const barilga = baiguullaga?.barilguud?.find(
    (b) => String(b._id) === String(barilgiinId),
  );

  // Хуучин бичлэгүүд дээр `zochinTokhirgoo` нь барилгын үндсэн дээр ч
  // хадгалагдсан байдаг тул хоёуланг нь шалгана.
  const bairshluud = [
    barilga?.tokhirgoo?.zochinTokhirgoo,
    barilga?.zochinTokhirgoo,
    baiguullaga?.tokhirgoo?.zochinTokhirgoo,
    baiguullaga?.zochinTokhirgoo,
  ];

  for (const bairshil of bairshluud) {
    const utga = bairshil?.[talbar];
    if (utga !== undefined && utga !== null && utga !== "") return utga;
  }

  return undefined;
}

/**
 * Нэг оршин суугч/харилцагч дээр бүртгэж болох машины ДЭЭД тоо.
 *
 * Вебийн «Нэмэлт тохиргоо → Машины бүртгэлийн хязгаар»-аас тохируулна.
 * Байгууллага/барилгын бүх оршин суугчид нэг ижил хамаарна.
 *
 * @returns {number} 0 бол тохируулаагүй — дуудагч тал өөрийн үндсэн утгыг
 *                   шийднэ (хязгаарлахгүй эсвэл 1).
 */
function mashiniiKhyazgaarOlya(baiguullaga, barilgiinId) {
  const utga = Number(
    tokhirgooniiUtga(baiguullaga, barilgiinId, "orshinSuugchMashiniiLimit"),
  );
  return Number.isFinite(utga) && utga > 0 ? Math.floor(utga) : 0;
}

/**
 * Эзэн дээр одоо бүртгэлтэй машины дугаарууд.
 *
 * Гурван цуглуулгад тархсан байдаг (төв OSM / баазын OSM / баазын mashin) тул
 * гуравнаас нэгтгэж, давхардлыг нь арилгаж буцаана. Хязгаарыг шалгах, аппд
 * бүх машиныг харуулах хоёуланд хэрэглэнэ.
 *
 * @returns {Promise<string[]>} давхардалгүй дугаарууд
 */
/**
 * Эзний машины БИЧЛЭГҮҮДийг гурван цуглуулгаас нэгтгэж буцаана.
 *
 * Яагаад нэгтгэх шаардлагатай вэ: бүртгэлийн урсгалууд гурван цэгт бичдэг
 * ч бүгд төгс синк болдоггүй. Жишээ нь аппын `/zochinHadgalya` нь `mashin`
 * дээр машин тус бүрээр бичлэг үүсгэдэг боловч `orshinSuugchMashin` дээр
 * зөвхөн НЭГ бичлэг дардаг байсан. Тиймээс аль нэг цуглуулгаас уншсан
 * дэлгэц машиныг дутуу харуулна. Энд гуравнаас нэгтгэж, давхардлыг
 * дугаараар арилгана.
 *
 * @returns {Promise<object[]>} `{_id, mashiniiDugaar, ezenToot, ...}` хэлбэрээр
 */
async function ezniiMashiniiBichleguudOlya({
  erunkhiiKholbolt,
  tukhainBaaziinKholbolt,
  baiguullagiinId,
  ezemshigchiinId,
}) {
  if (!ezemshigchiinId) return [];

  const OrshinSuugchMashin = require("../models/orshinSuugchMashin");
  const Mashin = require("../models/mashin");

  const ezenStr = String(ezemshigchiinId);
  const orgShaardlaga = baiguullagiinId
    ? { baiguullagiinId: String(baiguullagiinId) }
    : {};

  /** Дугаараар давхардуулахгүй цуглуулна — эхэлж олдсоныг үлдээнэ. */
  const bichleguud = new Map();

  const nemye = (jagsaalt, bairshil) => {
    (jagsaalt || []).forEach((d) => {
      const dugaar = mashiniiDugaarTseverle(d?.mashiniiDugaar || d?.dugaar);
      if (KHOOSON_UTGANUUD.has(dugaar) || bichleguud.has(dugaar)) return;

      bichleguud.set(dugaar, {
        _id: d?._id,
        mashiniiDugaar: dugaar,
        dugaar,
        ezenToot: d?.ezenToot || "",
        utas: d?.utas || d?.ezemshigchiinUtas || "",
        orshinSuugchiinId: d?.orshinSuugchiinId || d?.ezemshigchiinId || ezenStr,
        baiguullagiinId: d?.baiguullagiinId || null,
        barilgiinId: d?.barilgiinId || null,
        zochinTurul: d?.zochinTurul || d?.turul || "Оршин суугч",
        zochinUrikhEsekh: d?.zochinUrikhEsekh,
        dugaarUurchilsunOgnoo: d?.dugaarUurchilsunOgnoo || null,
        createdAt: d?.createdAt || null,
        eh: bairshil,
      });
    });
  };

  for (const kholbolt of [tukhainBaaziinKholbolt, erunkhiiKholbolt]) {
    if (!kholbolt) continue;
    try {
      nemye(
        await OrshinSuugchMashin(kholbolt)
          .find({ ...orgShaardlaga, orshinSuugchiinId: ezenStr })
          .lean(),
        "orshinSuugchMashin",
      );
    } catch (aldaa) {
      // Холболт дээр цуглуулга байхгүй байж болно — нөгөөгөөр үргэлжилнэ.
    }
  }

  if (tukhainBaaziinKholbolt) {
    try {
      nemye(
        await Mashin(tukhainBaaziinKholbolt)
          .find({
            ...orgShaardlaga,
            $or: [
              { orshinSuugchiinId: ezenStr },
              { ezemshigchiinId: ezenStr },
            ],
          })
          .lean(),
        "mashin",
      );
    } catch (aldaa) {
      // дээрхтэй ижил
    }
  }

  return Array.from(bichleguud.values());
}

/**
 * Эзний машины дугаарууд (давхардалгүй).
 * `ezniiMashiniiBichleguudOlya`-аас гаралтай — хоёр нь зөрөхгүй.
 *
 * @returns {Promise<string[]>}
 */
async function ezniiMashinuudOlya(tokhirgoo) {
  const bichleguud = await ezniiMashiniiBichleguudOlya(tokhirgoo);
  return bichleguud.map((b) => b.mashiniiDugaar);
}

module.exports = {
  mashiniiDugaarTseverle,
  dugaaruudSalgaya,
  zochinTokhirgooOlya,
  tokhirgooniiUtga,
  mashiniiKhyazgaarOlya,
  ezniiMashinuudOlya,
  ezniiMashiniiBichleguudOlya,
  mashinuudBurtgeye,
};
