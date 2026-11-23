const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Шилэн данс — ГАРААР бүртгэсэн гүйлгээ (орлого эсвэл зарлага, turul).
 * Цуглуулгын нэр «shilenDansZarlaga» хэвээр — анх зөвхөн зарлагад зориулсан.
 * Шилэн данс банкны хуулга (CGW) ашиглахгүй: дансны үлдэгдэл = эхний
 * үлдэгдэл + төлсөн мөнгө + гар орлого − гар зарлага.
 * Ангилал нь controller/shilenDans.js-ийн ORLOGIIN_ANGILAL / ZARLAGIIN_ANGILAL-аас.
 */
const shilenDansZarlagaSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: { type: String, required: true },
    ognoo: { type: Date, required: true },
    /** "orlogo" | "zarlaga". Хоосон (хуучин бичлэг) = зарлага. */
    turul: { type: String, enum: ["orlogo", "zarlaga"], default: "zarlaga" },
    dun: { type: Number, required: true, min: 0 },
    angilal: { type: String, required: true },
    tailbar: String,
    ajiltniiId: String,
    ajiltniiNer: String,
  },
  { timestamps: true },
);

shilenDansZarlagaSchema.index({ baiguullagiinId: 1, barilgiinId: 1, ognoo: -1 });

const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(shilenDansZarlagaSchema, "shilenDansZarlaga");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("shilenDansZarlaga", shilenDansZarlagaSchema);
};
