const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Шилэн данс — СӨХ-ийн ГАРААР бүртгэсэн зарлага (цалин, цэвэрлэгээ г.м.).
 * Ангилал нь controller/shilenDans.js-ийн ZARLAGIIN_ANGILAL-аас.
 *
 * `turul` нь өмнөх хувилбарын үлдэц (гар орлого бүртгэдэг байсан): одоо зөвхөн
 * "zarlaga" бичигдэнэ; "orlogo" бичлэгийг тооцоололд оруулахгүй.
 */
const shilenDansZarlagaSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: { type: String, required: true },
    ognoo: { type: Date, required: true },
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
