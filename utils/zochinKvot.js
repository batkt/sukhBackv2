const moment = require("moment");

/**
 * Зочин урих квотын ашиглалтыг тооцно.
 *
 * Хоёр горимтой (`zochinTokhirgoo.zochinKvotGorim`):
 *
 *   • "davtamj" (эсвэл хоосон) — ХУУЧИН зан төлөв. Тухайн үеийн (өдөр,
 *     7 хоног, сар, жил) эхнээс хойш үүссэн урилгын тоо. Квот зөвхөн үе
 *     шинэчлэгдэхэд сэргэнэ.
 *
 *   • "zereg" — НЭГ ЗЭРЭГ. `zochinErkhiinToo` нь зэрэг идэвхтэй байж болох
 *     зочны машины дээд тоо. Идэвхтэй гэдэг нь:
 *       – `tuluv: 1` — машин зогсоол дотор (орсон, гараагүй);
 *       – `tuluv: 0` — хүлээлгэнд (ирээгүй), үүссэнээс хойш
 *         `KHULEELGIIN_KHUGATSAA_TSAG` цаг болоогүй.
 *     Машин гармагц (`tuluv: 2` — sukhParking-v1 sdkService, QPay гарах
 *     callback, түрээсийн webhook бүгд тавьдаг) квот буцаж нэмэгдэнэ.
 *
 * Хүлээлгийн урилгыг `zochinWaitingCleanupService` 12 цагийн дараа устгадаг
 * боловч cron нь 12 цаг тутам ажилладаг тул урилга 24 цаг хүртэл үлдэж
 * болно. Тиймээс энд 12 цагаас хуучин хүлээлгийг ТООЛОХГҮЙ — устгагдахыг
 * хүлээлгүйгээр квот чөлөөлөгдөнө.
 */

const ZEREG_GORIM = "zereg";
const KHULEELGIIN_KHUGATSAA_TSAG = 12;

function zeregGorimEsekh(gorim) {
  return String(gorim || "").trim().toLowerCase() === ZEREG_GORIM;
}

/** Давтамжийн горимд тоолж эхлэх огноо */
function uyeiinEkhlelOlyo(davtamjiinTurul, davtamjUtga) {
  if (davtamjiinTurul === "udruur") return moment().startOf("day").toDate();
  if (davtamjiinTurul === "7khonogoor") return moment().startOf("week").toDate();
  if (davtamjiinTurul === "saraar") {
    const candidate = moment().date(davtamjUtga || 1).startOf("day");
    if (moment().isBefore(candidate)) candidate.subtract(1, "month");
    return candidate.toDate();
  }
  if (davtamjiinTurul === "jileer") {
    const candidate = moment()
      .month((davtamjUtga || 1) - 1)
      .date(1)
      .startOf("day");
    if (moment().isBefore(candidate)) candidate.subtract(1, "year");
    return candidate.toDate();
  }
  return moment().startOf("month").toDate();
}

function ezniiShuult(ezniiId) {
  return [
    { ezenId: ezniiId },
    { ezemshigchiinId: ezniiId },
    { ezenId: String(ezniiId) },
    { ezemshigchiinId: String(ezniiId) },
  ];
}

/**
 * @param {object} p
 * @param {Function} p.Model  `EzenUrisanMashin(kholbolt)` загвар
 * @param {string} p.ezniiId  урьсан оршин суугч/харилцагчийн id
 * @param {string} [p.baiguullagiinId]
 * @param {string} [p.gorim]  "zereg" | "davtamj"
 * @param {string} [p.davtamjiinTurul]
 * @param {number} [p.davtamjUtga]
 * @returns {Promise<{gorim:string, usedCount:number, dotorToo:number, khuleelgendToo:number}>}
 */
async function kvotAshiglaltTootsoolyo({
  Model,
  ezniiId,
  baiguullagiinId,
  gorim,
  davtamjiinTurul,
  davtamjUtga,
}) {
  const suuri = { $or: ezniiShuult(ezniiId) };
  if (baiguullagiinId) suuri.baiguullagiinId = String(baiguullagiinId);

  if (zeregGorimEsekh(gorim)) {
    const khuleelgiinKhyazgaar = new Date(
      Date.now() - KHULEELGIIN_KHUGATSAA_TSAG * 60 * 60 * 1000,
    );
    const [dotorToo, khuleelgendToo] = await Promise.all([
      Model.countDocuments({ ...suuri, tuluv: 1 }),
      Model.countDocuments({
        ...suuri,
        tuluv: 0,
        createdAt: { $gte: khuleelgiinKhyazgaar },
      }),
    ]);
    return {
      gorim: ZEREG_GORIM,
      usedCount: dotorToo + khuleelgendToo,
      dotorToo,
      khuleelgendToo,
    };
  }

  const usedCount = await Model.countDocuments({
    ...suuri,
    createdAt: { $gte: uyeiinEkhlelOlyo(davtamjiinTurul, davtamjUtga) },
  });
  return { gorim: "davtamj", usedCount, dotorToo: 0, khuleelgendToo: 0 };
}

module.exports = {
  ZEREG_GORIM,
  KHULEELGIIN_KHUGATSAA_TSAG,
  zeregGorimEsekh,
  uyeiinEkhlelOlyo,
  kvotAshiglaltTootsoolyo,
};
