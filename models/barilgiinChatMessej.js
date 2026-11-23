/**
 * Барилгын групп чатын мессеж. Байгууллагын өөрийн баазад хадгалагдана.
 * Зөвхөн текст. Илгээгч өөрийн мессежээ засна; устгах боломжгүй.
 * `barilgiinId` нь чатын түлхүүр: барилгын чат бол барилгын id, байгууллагын
 * «Бүх байр» чат бол `buh_<baiguullagiinId>`.
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const barilgiinChatMessejSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: { type: String, required: true },
    chatId: String,
    ilgeegchId: { type: String, required: true },
    // "ajiltan" | "orshinSuugch"
    ilgeegchTurul: { type: String, required: true },
    ilgeegchNer: String,
    // Оршин суугчийн тоот (ажилтны хувьд албан тушаал) — зөвхөн харуулахад
    ilgeegchTailbar: String,
    text: { type: String, required: true },
    // Клиентийн үүсгэсэн id — давхар илгээлт, optimistic мөрийг тааруулахад
    clientId: String,
    // Хариулсан мессежийн хуулбар (эх мессеж засагдсан ч энд хэвээр)
    khariu: {
      messejId: String,
      ilgeegchNer: String,
      text: String,
    },
    zassanEsekh: { type: Boolean, default: false },
    zassanOgnoo: Date,
  },
  { timestamps: true },
);

barilgiinChatMessejSchema.index({ baiguullagiinId: 1, barilgiinId: 1, createdAt: -1 });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("barilgiinChatMessej", barilgiinChatMessejSchema);
};
