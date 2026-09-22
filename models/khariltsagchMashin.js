/**
 * Харилцагчийн машин.
 *
 * ── Яагаад ФИЗИК коллекц нь `orshinSuugchMashin` хэвээр байна ────────────
 * Харилцагчийн машиныг тусдаа коллекцид салгавал БҮТЭХГҮЙ: хаалга, зочин
 * урих эрх, квот, тайлан — БҮГД `orshinSuugchMashin`-ийг уншдаг (8 файл:
 * `routes/orshinSuugchRoute.js`, `routes/zochinUrikhRoute.js`,
 * `routes/transformationRoute.js`, `controller/orshinSuugch.js`,
 * `controller/excelImportController.js`, `controller/tailan.js`,
 * `utils/mashinBurtgel.js`, `models/baiguullaga.js`). Шинэ коллекц тэдэнд
 * үл харагдана — машин бүртгэгдсэн ч хаалга танихгүй болно.
 *
 * Мөн Excel-ээр орсон харилцагчийн машин нь АЛЬ ХЭДИЙН энэ коллекцид
 * хэвтэж байгаа (`mashinuudBurtgeye` нь `orshinSuugchiinId`-д харилцагчийн
 * id бичдэг). Салгавал Excel ↔ модал хоёр өөр газар бичиж, өгөгдөл
 * хуваагдана.
 *
 * ── Тэгвэл энэ файл юунд хэрэгтэй вэ ────────────────────────────────────
 * Кодын УНШИГДАХ байдалд. Харилцагчтай ажиллаж байгаа код
 * `require("../models/orshinSuugchMashin")` гэж бичих нь утгаараа буруу
 * харагддаг. Энэ alias нь ЯГ ижил физик коллекцийг зааж, гэхдээ дуудах
 * талд зөв нэрээр уншигдана:
 *
 *   const KhariltsagchMashin = require("../models/khariltsagchMashin");
 *   await KhariltsagchMashin(kholbolt).find({ ezemshigchiinTurul: "Khariltsagch" });
 *
 * Төрлийг `ezemshigchiinTurul` талбараар ялгана — иймд «харилцагчийн
 * машин» гэж query хийх, тоолох, тайлагнах боломжтой.
 *
 * ЧУХАЛ: mongoose-ийн `conn.model(ner, schema, collection)`-ийн ГУРАВ дахь
 * аргумент нь физик коллекцийн нэр. Түүнийг зааснаар шинэ коллекц
 * үүсэхгүй.
 */

const { schema } = require("./orshinSuugchMashin");

/** Физик коллекцийн нэр — НЭГ л коллекц. */
const KOLLEKTS = "orshinSuugchMashin";

/** Эзэмшигчийн төрлийн утга. */
const EZEMSHIGCH = {
  ORSHIN_SUUGCH: "OrshinSuugch",
  KHARILTSAGCH: "Khariltsagch",
};

module.exports = function khariltsagchMashin(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;

  // Нэг холболт дээр ижил нэрийн модель дахин зарлавал mongoose алдаа
  // гаргадаг тул аль хэдийн байгааг эргүүлж өгнө.
  if (conn.models.khariltsagchMashin) return conn.models.khariltsagchMashin;

  return conn.model("khariltsagchMashin", schema, KOLLEKTS);
};

module.exports.EZEMSHIGCH = EZEMSHIGCH;
module.exports.KOLLEKTS = KOLLEKTS;
