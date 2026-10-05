/**
 * Зочны тохиргоог ЭЗЭМШИГЧИЙН ТӨРЛӨӨР нь ялгаж авна.
 *
 * Яагаад: оршин суугч ба харилцагч хоёр өөр тооны зочин урих эрхтэй байх
 * шаардлага гарсан. Өмнө нь `zochinTokhirgoo` ганц багц байсан тул хоёул
 * ижил квоттой байв.
 *
 * Хадгалалт: харилцагчийнх нь `zochinTokhirgoo.khariltsagch` дотор сууна.
 * Тухайн талбарыг тохируулаагүй бол оршин суугчийн утгыг ӨВЛӨНӨ — ингэснээр
 * одоо ажиллаж байгаа байгууллагуудын зан төлөв огт өөрчлөгдөхгүй, зөвхөн
 * тусад нь тохируулсан үед л сална.
 */

/** Харилцагчид тусад нь тохируулж болох талбарууд */
const KHARILTSAGCHID_SALGAKH = [
  "zochinUrikhEsekh",
  "zochinErkhiinToo",
  "zochinTusBurUneguiMinut",
  "zochinNiitUneguiMinut",
  "zochinNekhemjlekhEsekh",
  "zochinTailbar",
  "davtamjiinTurul",
  "davtamjUtga",
];

/** `zochinTurul`/`ezemshigchiinTurul`-ээс харилцагч эсэхийг тогтооно */
function khariltsagchEsekh(turul) {
  const utga = String(turul || "").toLowerCase();
  return utga.includes("харилцагч") || utga.includes("khariltsagch");
}

/**
 * @param {object} zochinTokhirgoo байгууллага/барилгын `tokhirgoo.zochinTokhirgoo`
 * @param {string|boolean} turul "Харилцагч" | "Оршин суугч" | true/false
 * @returns {object} тухайн төрөлд үйлчлэх бүрэн тохиргоо
 */
function zochniiTokhirgooAvya(zochinTokhirgoo, turul) {
  const suuri = zochinTokhirgoo || {};
  const kharilts =
    typeof turul === "boolean" ? turul : khariltsagchEsekh(turul);
  if (!kharilts) return suuri;

  const nemelt = suuri.khariltsagch || {};
  const khariu = { ...(suuri.toObject ? suuri.toObject() : suuri) };
  delete khariu.khariltsagch;

  // Талбар ТУС БҮРЭЭР нөхнө. Бүтнээр нь солихгүй — харилцагч дээр зөвхөн
  // эрхийн тоогоо өөрчилсөн бол бусад нь оршин суугчийнхаараа үлдэнэ.
  for (const talbar of KHARILTSAGCHID_SALGAKH) {
    const utga = nemelt[talbar];
    if (utga !== undefined && utga !== null && utga !== "") {
      khariu[talbar] = utga;
    }
  }

  return khariu;
}

module.exports = {
  zochniiTokhirgooAvya,
  khariltsagchEsekh,
  KHARILTSAGCHID_SALGAKH,
};
