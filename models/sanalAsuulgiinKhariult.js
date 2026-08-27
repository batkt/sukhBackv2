const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Санал асуулгын нэг оршин суугчийн хариулт.
 *
 * Ажилтан ХЭН юу сонгосныг харах шаардлагатай тул оршин суугчийн нэр, тоотыг
 * хариулт дээр нь хамт хадгална (хожим оршин суугч устсан ч үр дүн уншигдана).
 */
const khariultSchema = new Schema(
  {
    /** sanalAsuulga.asuultuud[]._id */
    asuultiinId: { type: String, required: true },
    asuult: String,
    /** songolt / olonSongolt үед сонгосон хувилбарууд */
    songogdson: [String],
    /** tekst төрлийн хариулт */
    tekst: String,
  },
  { _id: false },
);

const sanalAsuulgiinKhariultSchema = new Schema(
  {
    asuulgiinId: { type: String, required: true, index: true },
    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,

    orshinSuugchId: { type: String, required: true },
    orshinSuugchNer: String,
    toot: String,
    utas: String,

    khariultuud: { type: [khariultSchema], default: [] },
  },
  { timestamps: true },
);

// Нэг оршин суугч нэг асуулгад ЗӨВХӨН НЭГ УДАА хариулна
sanalAsuulgiinKhariultSchema.index(
  { asuulgiinId: 1, orshinSuugchId: 1 },
  { unique: true },
);

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("sanalAsuulgiinKhariult", sanalAsuulgiinKhariultSchema);
};
