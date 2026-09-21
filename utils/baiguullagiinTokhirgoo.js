/**
 * Байгууллага / барилгын `tokhirgoo`-ийг унших нэгдсэн туслахууд.
 *
 * Тохиргоо нь ХОЁР шатлалтай: байгууллагын хэмжээнд (`baiguullaga.tokhirgoo`)
 * ба барилга тус бүрд (`baiguullaga.barilguud[].tokhirgoo`). Барилга дээр
 * тохируулсан нь дээгүүрт, эс бөгөөс байгууллагынх хүчинтэй.
 *
 * ЧУХАЛ: нөхөлт нь ТАЛБАР ТУС БҮРД хийгдэнэ. Бүтэн обьектоор сонговол
 * барилга дээр өөр талбар тохируулсан төдийхнөөс болж байгууллагын хэмжээнд
 * тохируулсан утга чимээгүй үл хэрэгсэгдэнэ.
 */

/**
 * `tokhirgoo`-ийн нэг талбарыг барилга → байгууллагын дарааллаар уншина.
 *
 * @param {object} baiguullaga Байгууллагын документ
 * @param {string} [barilgiinId] Барилгын id (байхгүй бол зөвхөн байгууллага)
 * @param {string} talbar Талбарын нэр
 * @returns {any} олдсон утга, эс бөгөөс `undefined`
 */
function tokhirgooniiTalbar(baiguullaga, barilgiinId, talbar) {
  const barilga = baiguullaga?.barilguud?.find(
    (b) => String(b?._id) === String(barilgiinId),
  );

  const bairshluud = [barilga?.tokhirgoo, baiguullaga?.tokhirgoo];

  for (const bairshil of bairshluud) {
    const utga = bairshil?.[talbar];
    if (utga !== undefined && utga !== null && utga !== "") return utga;
  }

  return undefined;
}

/**
 * Гэр бүлийн гишүүн урих боломжтой эсэх.
 *
 * Вебийн «Нэмэлт тохиргоо → Гэр бүлийн гишүүн урих» чекээс тохируулна.
 *
 * Тохируулаагүй (`undefined`) бол ЗӨВШӨӨРНӨ: энэ боломж өмнө нь ямар ч
 * хязгаарлалтгүй ажиллаж байсан тул тохиргоо нэмсэн нь байгаа байгууллагуудын
 * функцыг чимээгүй унтраах ёсгүй.
 *
 * @param {object} baiguullaga
 * @param {string} [barilgiinId]
 * @returns {boolean}
 */
function gerBuliinGishuunZovshoorokhEsekh(baiguullaga, barilgiinId) {
  const utga = tokhirgooniiTalbar(
    baiguullaga,
    barilgiinId,
    "gerBuliinGishuunEsekh",
  );
  if (utga === undefined) return true;
  return utga !== false;
}

module.exports = {
  tokhirgooniiTalbar,
  gerBuliinGishuunZovshoorokhEsekh,
};
