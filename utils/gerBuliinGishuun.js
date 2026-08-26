/**
 * Гэр бүлийн гишүүн (sub-account) — хуваалцсан туслах функцууд.
 *
 * Гишүүн бүр өөрийн утас, нууц үг, session-тэй тусдаа orshinSuugch бичлэг
 * боловч тоот, гэрээ, нэхэмжлэх, төлбөрөө үндсэн эзэмшигчийнхээс уншина.
 * Тиймээс "би хэн бэ" (өөрийн _id) болон "хэний өгөгдлийг харах вэ"
 * (undsenId) хоёрыг тусад нь ялгаж үзнэ.
 */

const MAX_GISHUUN = Number(process.env.MAX_GER_BULIIN_GISHUUN || 5);

const GISHUUNII_KHOLBOO = [
  "Эхнэр",
  "Нөхөр",
  "Хүү",
  "Охин",
  "Аав",
  "Ээж",
  "Ах",
  "Эгч",
  "Дүү",
  "Бусад",
];

/** Тухайн бичлэг гэр бүлийн гишүүн үү? */
function gishuunEsekh(doc) {
  return !!(doc && doc.undsenId);
}

/**
 * Токеноос "өгөгдлийн эзэн"-ий id-г буцаана.
 * Гишүүн бол үндсэн эзэмшигчийн id, эс бөгөөс өөрийн id.
 */
function ugugdliinEzniiId(token) {
  if (!token) return null;
  return token.undsenId || token.id || null;
}

/** Гишүүнд төлөх эрх бий эсэх */
function tulukhErkhtaiEsekh(token) {
  if (!token || !token.undsenId) return true; // Үндсэн эзэмшигч / ажилтан
  return (token.gishuuniiErkh || "Харах + Төлөх") !== "Харах";
}

/**
 * Гишүүний бичлэг дээр үндсэн эзэмшигчийн хаяг/байгууллагын мэдээллийг
 * тусгана. Токен нь baiguullagiinId-аар бааз сонгодог тул энэ заавал
 * үндсэн эзэмшигчийнхтэй ижил байх ёстой.
 */
function undsenEesKhayagAvya(gishuun, undsen) {
  if (!gishuun || !undsen) return gishuun;

  gishuun.baiguullagiinId = undsen.baiguullagiinId;
  gishuun.baiguullagiinNer = undsen.baiguullagiinNer;
  gishuun.barilgiinId = undsen.barilgiinId;
  gishuun.toot = undsen.toot;
  gishuun.davkhar = undsen.davkhar;
  gishuun.orts = undsen.orts;
  gishuun.duureg = undsen.duureg;
  gishuun.horoo = undsen.horoo;
  gishuun.soh = undsen.soh;
  gishuun.bairniiNer = undsen.bairniiNer;

  return gishuun;
}

/**
 * Апп руу буцаах JSON. Гишүүний хувьд үндсэн эзэмшигчийн тоот, үлдэгдэл,
 * wallet мэдээллийг нэмж өгснөөр апп ямар ч өөрчлөлтгүйгээр ижил дэлгэц
 * үзүүлнэ.
 */
function gishuuniiKhariuBelgeye(gishuunJson, undsen) {
  if (!gishuunJson || !undsen) return gishuunJson;

  const undsenJson = undsen.toJSON ? undsen.toJSON() : undsen;

  // Нэвтрэхэд баримт бичгийг "+nuutsUg"-тэй уншдаг тул хариунаас хасна
  delete gishuunJson.nuutsUg;

  gishuunJson.gishuunEsekh = true;
  gishuunJson.undsenId = String(undsen._id);
  gishuunJson.ugugdliinEzniiId = String(undsen._id);
  gishuunJson.undsenEzemshigch = {
    _id: String(undsen._id),
    ovog: undsenJson.ovog || "",
    ner: undsenJson.ner || "",
    utas: undsenJson.utas || "",
  };

  // Хаяг / тоотууд бүхэлдээ үндсэн эзэмшигчийнх
  gishuunJson.toots = undsenJson.toots || [];
  gishuunJson.toot = undsenJson.toot;
  gishuunJson.davkhar = undsenJson.davkhar;
  gishuunJson.orts = undsenJson.orts;
  gishuunJson.duureg = undsenJson.duureg;
  gishuunJson.horoo = undsenJson.horoo;
  gishuunJson.soh = undsenJson.soh;
  gishuunJson.bairniiNer = undsenJson.bairniiNer;
  gishuunJson.baiguullagiinId = undsenJson.baiguullagiinId;
  gishuunJson.baiguullagiinNer = undsenJson.baiguullagiinNer;
  gishuunJson.barilgiinId = undsenJson.barilgiinId;

  // Тооцооны талбарууд
  gishuunJson.ekhniiUldegdel = undsenJson.ekhniiUldegdel;
  gishuunJson.baritsaaniiUldegdel = undsenJson.baritsaaniiUldegdel;
  gishuunJson.tsahilgaaniiZaalt = undsenJson.tsahilgaaniiZaalt;
  gishuunJson.billNicknames = undsenJson.billNicknames || [];

  return gishuunJson;
}

module.exports = {
  MAX_GISHUUN,
  GISHUUNII_KHOLBOO,
  gishuunEsekh,
  ugugdliinEzniiId,
  tulukhErkhtaiEsekh,
  undsenEesKhayagAvya,
  gishuuniiKhariuBelgeye,
};
