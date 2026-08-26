const mongoose = require("mongoose");

mongoose.pluralize(null);

/**
 * Гэр бүлийн гишүүний урилга.
 *
 * Урилгыг ЗӨВХӨН энд хадгална — orshinSuugch бичлэг нь код баталгаажсаны
 * дараа шинээр үүснэ. Ингэснээр дуусаагүй урилга утасны дугаарыг эзэлж
 * (utas unique index) энгийн бүртгэлийг хааж орхихгүй.
 */
const gerBuliinUrilgaSchema = new mongoose.Schema(
  {
    undsenId: {
      type: String, // Урьсан үндсэн эзэмшигчийн orshinSuugch._id
      required: true,
      index: true,
    },
    undsenUtas: String, // Урьсан хүний утас (SMS-д харуулах)
    utas: {
      type: String, // Уригдсан гишүүний утас
      required: true,
      index: true,
    },
    ovog: String,
    ner: String,
    kholboo: String, // Эхнэр / Нөхөр / Хүү / Охин / Аав / Ээж ...
    erkh: {
      type: String,
      enum: ["Харах", "Харах + Төлөх"],
      default: "Харах + Төлөх",
    },
    baiguullagiinId: String,
    barilgiinId: String,
    tuluv: {
      type: String,
      enum: ["Хүлээгдэж буй", "Баталгаажсан", "Цуцалсан"],
      default: "Хүлээгдэж буй",
    },
    batalgaajsanOgnoo: Date,
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true },
);

gerBuliinUrilgaSchema.index({ utas: 1, tuluv: 1 });
gerBuliinUrilgaSchema.index({ undsenId: 1, tuluv: 1 });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("gerBuliinUrilga", gerBuliinUrilgaSchema);
};
