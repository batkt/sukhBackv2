const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;
mongoose.pluralize(null);

const orshinSuugchMashinSchema = new Schema(
  {
    /**
     * Эзэмшигчийн id — оршин суугч ЭСВЭЛ харилцагчийн `_id`.
     *
     * Коллекцийн нэр `orshinSuugchMashin` боловч бодитоор ЭЗЭМШИГЧИЙН
     * машиныг агуулдаг: Excel-ээр орсон харилцагчийн машин ч энд хэвтдэг
     * (`utils/mashinBurtgel.js`). Хаалга, зочин урих, квот — 8 файл энэ
     * коллекцийг уншдаг тул харилцагчийг тусад нь салгавал тэдэнд үл
     * харагдана. Иймд НЭГ коллекц хэвээр, төрлийг доорх талбараар ялгана.
     */
    orshinSuugchiinId: String,
    /**
     * `"OrshinSuugch"` | `"Khariltsagch"` — эзэмшигч хэн бэ.
     *
     * Хоосон бол хуучин бичлэг: оршин суугч гэж үзнэ.
     */
    ezemshigchiinTurul: String,
    baiguullagiinId: String,
    barilgiinId: String,
    zochinUrikhEsekh: Boolean,
    zochinTurul: String,
    davtamjiinTurul: String,
    mashiniiDugaar: String,
    dugaarUurchilsunOgnoo: Date,
    ezenToot: String,
    zochinTailbar: String,
    zochinErkhiinToo: Number,
    zochinTusBurUneguiMinut: Number,
    zochinNiitUneguiMinut: Number,
    davtamjUtga: Number,
    utas: String
  },
  { timestamps: true }
)

orshinSuugchMashinSchema.index({ baiguullagiinId: 1, barilgiinId: 1, orshinSuugchiinId: 1 });
orshinSuugchMashinSchema.index({ mashiniiDugaar: 1 });

orshinSuugchMashinSchema.index({ ezemshigchiinTurul: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("orshinSuugchMashin", orshinSuugchMashinSchema);
};

/** `khariltsagchMashin` alias нь ижил схемийг хэрэглэнэ. */
module.exports.schema = orshinSuugchMashinSchema;