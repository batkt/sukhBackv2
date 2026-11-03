const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const bankniiTulgaltDuremSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true, index: true },
    barilgiinId: { type: String, index: true },
    accNum: { type: String, index: true }, // Харьцсан дансны дугаар (e.g. MN740005005003959693)
    accName: { type: String }, // Дансны нэр / Төлөгч (e.g. ZUNDUI ODONTUYA)
    payerKey: { type: String, index: true }, // Цэвэрлэсэн хайлтын түлхүүр
    bairNer: { type: String }, // e.g. "217"
    toot: { type: String }, // e.g. "101"
    gereeId: { type: String, required: true },
    residentName: { type: String },
    confirmedCount: { type: Number, default: 1 },
    lastConfirmedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

bankniiTulgaltDuremSchema.index({ baiguullagiinId: 1, accNum: 1 });
bankniiTulgaltDuremSchema.index({ baiguullagiinId: 1, payerKey: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("bankniiTulgaltDurem", bankniiTulgaltDuremSchema);
};

