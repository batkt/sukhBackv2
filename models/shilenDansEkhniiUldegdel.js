const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Шилэн данс — барилга тус бүрийн ГАРААР оруулсан дансны эхний үлдэгдэл.
 * Барилгад нэг л бичлэг (upsert). Үлдэгдлийг `ognoo`-оос эхлэн тооцно:
 * үлдэгдэл = dun + төлсөн мөнгө − зарлага (ognoo-оос хойш).
 */
const shilenDansEkhniiUldegdelSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: { type: String, required: true },
    ognoo: { type: Date, required: true },
    dun: { type: Number, required: true },
    ajiltniiId: String,
    ajiltniiNer: String,
  },
  { timestamps: true },
);

shilenDansEkhniiUldegdelSchema.index(
  { baiguullagiinId: 1, barilgiinId: 1 },
  { unique: true },
);

const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(shilenDansEkhniiUldegdelSchema, "shilenDansEkhniiUldegdel");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("shilenDansEkhniiUldegdel", shilenDansEkhniiUldegdelSchema);
};
