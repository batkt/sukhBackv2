/**
 * Барилгын групп чат — байгууллага доторх барилга бүрт НЭГ чат.
 *
 * Гишүүдийн жагсаалт ХАДГАЛАХГҮЙ: гишүүнчлэлийг хэрэглэгчийн
 * barilga/baiguullaga-аас хүсэлт бүрт тооцно (services/barilgiinChatService.js).
 * Чат нь анх хандах үед (lazy) upsert-ээр үүснэ. Байгууллагын өөрийн баазад.
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const barilgiinChatSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: { type: String, required: true },
    ner: String,
    suuliinMessej: {
      text: String,
      ilgeegchNer: String,
      ilgeegchTurul: String,
      ognoo: Date,
    },
  },
  { timestamps: true },
);

barilgiinChatSchema.index({ baiguullagiinId: 1, barilgiinId: 1 }, { unique: true });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("barilgiinChat", barilgiinChatSchema);
};
