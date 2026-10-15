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

const TULBURIIN_SMS_KHAASAN = [
  "69f3f56a2899d5fdc24251d1",
  "6a4b3d1c124040b3dad66792",
  "6a9786569a202a8f8f859f94",
];

/**
 * Баталгаажуулах код, нууц үг сэргээх код зэрэг аюулгүй байдал, нэвтрэлтэй
 * холбоотой мессеж мөн эсэхийг шалгана.
 * Энэ төрлийн мессежийг хэзээ ч хаахгүй.
 *
 * @param {object|string} message Эсвэл мессежийн текст
 * @returns {boolean}
 */
function isVerifySms(message) {
  if (!message) return false;
  if (typeof message === "string") {
    const l = message.toLowerCase();
    return (
      l.includes("нууц үг") ||
      l.includes("batalgaajuulax") ||
      l.includes("batalgaajuulakh") ||
      l.includes("баталгаажуулах") ||
      l.includes("sergeex code") ||
      l.includes("sergeekh code") ||
      l.includes("verification")
    );
  }
  const id = String(message.gereeniiId || "").toLowerCase();
  if (id === "password_reset" || id === "login_verification" || id === "verify") {
    return true;
  }
  const txt = String(message.text || message.msg || "").toLowerCase();
  return (
    txt.includes("нууц үг") ||
    txt.includes("batalgaajuulax") ||
    txt.includes("batalgaajuulakh") ||
    txt.includes("баталгаажуулах") ||
    txt.includes("sergeex code") ||
    txt.includes("sergeekh code") ||
    txt.includes("verification")
  );
}

/**
 * Төлбөртэй холбоотой мессеж (нэхэмжлэх үүссэн, төлбөр төлөгдсөн,
 * төлбөрийн сануулга гэх мэт)-ийг илгээх зөвшөөрөлтэй эсэх.
 *
 * Тохиргоо (`messejYavuulakhEsekh`):
 * - undefined / true: Хэвийн илгээнэ.
 * - false: Төлбөрийн мессеж илгээхийг блоклоно.
 *
 * Баталгаажуулах / нэвтрэх мессежүүдэд ЭНЭ ХААЛТ ҮЙЛЧЛЭХГҮЙ.
 *
 * @param {object|string} baiguullagaIdOrDoc Байгууллагын ID эсвэл документ
 * @param {string} [barilgiinId] Барилгын ID
 * @returns {Promise<boolean>}
 */
async function tulburiinSmsZovshoorokhEsekh(baiguullagaIdOrDoc, barilgiinId) {
  try {
    const id =
      typeof baiguullagaIdOrDoc === "object" && baiguullagaIdOrDoc !== null
        ? baiguullagaIdOrDoc._id || baiguullagaIdOrDoc.id
        : baiguullagaIdOrDoc;

    if (id && TULBURIIN_SMS_KHAASAN.includes(String(id))) {
      return false;
    }

    let doc =
      typeof baiguullagaIdOrDoc === "object" && baiguullagaIdOrDoc !== null
        ? baiguullagaIdOrDoc
        : null;

    if (!doc && id) {
      try {
        const { db } = require("zevbackv2");
        const Baiguullaga = require("../models/baiguullaga");
        if (db?.erunkhiiKholbolt) {
          doc = await Baiguullaga(db.erunkhiiKholbolt).findById(id).lean();
        }
      } catch (dbErr) {
        // DB load failure fallback
      }
    }

    if (!doc) return true;

    const utga = tokhirgooniiTalbar(doc, barilgiinId, "messejYavuulakhEsekh");
    if (utga === undefined || utga === null) return true;
    return utga !== false && utga !== "false";
  } catch (err) {
    console.error("⚠️ [tulburiinSmsZovshoorokhEsekh] error:", err.message);
    return true;
  }
}

module.exports = {
  tokhirgooniiTalbar,
  gerBuliinGishuunZovshoorokhEsekh,
  isVerifySms,
  tulburiinSmsZovshoorokhEsekh,
  TULBURIIN_SMS_KHAASAN,
};
