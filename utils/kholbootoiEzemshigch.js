/**
 * Нэг хүн нэг утасны дугаараар ОРШИН СУУГЧ ба ХАРИЛЦАГЧ хоёр тусдаа
 * бүртгэлтэй байж болно (жишээ: А барилгад оршин суугч, Б барилгад
 * харилцагч). Нэвтрэхэд аль нэг нь л token авдаг тул нөгөө бүртгэлийн
 * тоот, гэрээ аппад харагддаггүй байв.
 *
 * Энэ туслах нь нэвтэрсэн бүртгэлтэй ИЖИЛ утастай нөгөө төрлийн бүртгэлийг
 * олж, түүний ID ба тоотуудыг буцаана.
 */
const OrshinSuugch = require("../models/orshinSuugch");
const Khariltsagch = require("../models/khariltsagch");

/**
 * @param erunkhiiKholbolt  нийтийн баазын холболт
 * @param user              нэвтэрсэн бүртгэл ({ _id, utas, undsenId, ... })
 * @param orshinSuugchEsekh нэвтэрсэн бүртгэл OrshinSuugch эсэх
 * @returns {Promise<null | { id: string, turul: string, toots: object[] }>}
 */
async function kholbootoiEzemshigchOlya(erunkhiiKholbolt, user, orshinSuugchEsekh) {
  // Гэр бүлийн гишүүн өөрийн биш, үндсэн эзэмшигчийн өгөгдлийг хардаг
  if (!user || user.undsenId) return null;
  const utas = String(user.utas || "").trim();
  if (!utas) return null;

  const Model = orshinSuugchEsekh ? Khariltsagch : OrshinSuugch;
  const nuguu = await Model(erunkhiiKholbolt)
    .findOne({ utas, _id: { $ne: user._id } })
    .lean();
  if (!nuguu || nuguu.undsenId) return null;

  let toots = Array.isArray(nuguu.toots) ? nuguu.toots : [];
  // Хуучин бүртгэл: toots хоосон, зөвхөн үндсэн талбартай
  if (toots.length === 0 && nuguu.barilgiinId) {
    toots = [
      {
        toot: nuguu.toot || "",
        baiguullagiinId: nuguu.baiguullagiinId,
        barilgiinId: nuguu.barilgiinId,
        bairniiNer: nuguu.bairniiNer || "",
        davkhar: nuguu.davkhar || "",
        source: "OWN_ORG",
      },
    ];
  }

  return {
    id: String(nuguu._id),
    turul: orshinSuugchEsekh ? "khariltsagch" : "orshinSuugch",
    toots,
  };
}

/** Тоотуудыг давхардалгүйгээр нэгтгэнэ (барилга + тоотоор). */
function tootuudNegtgeye(odoo, kholbootoi) {
  const jagsaalt = Array.isArray(odoo) ? [...odoo] : [];
  const tulkhuur = (t) => `${t?.barilgiinId || ""}|${t?.toot || ""}`;
  const baigaa = new Set(jagsaalt.map(tulkhuur));
  (kholbootoi?.toots || []).forEach((t) => {
    const k = tulkhuur(t);
    if (baigaa.has(k)) return;
    baigaa.add(k);
    jagsaalt.push({
      ...t,
      ezemshigchiinId: kholbootoi.id,
      ezemshigchiinTurul: kholbootoi.turul,
    });
  });
  return jagsaalt;
}

module.exports = { kholbootoiEzemshigchOlya, tootuudNegtgeye };
