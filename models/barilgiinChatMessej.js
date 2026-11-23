/**
 * Барилгын групп чатын мессеж. Байгууллагын өөрийн баазад хадгалагдана.
 * Одоогоор зөвхөн текст; засах/устгах endpoint байхгүй.
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
  },
  { timestamps: true },
);

barilgiinChatMessejSchema.index({ baiguullagiinId: 1, barilgiinId: 1, createdAt: -1 });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("barilgiinChatMessej", barilgiinChatMessejSchema);
};
