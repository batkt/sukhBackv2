const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ashiglaltiinExcelSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    ognoo: Date,
    zardliinId: String,
    zardliinNer: String,
    gereeniiId: String,
    register: String,
    gereeniiDugaar: String,
    talbainId: String,
    talbainDugaar: String,
    umnukhZaalt: Number,
    suuliinZaalt: Number,
    guidliinKoep: Number,
    tariff: Number,
    zoruu: Number,
    niitDun: Number,
  },
  {
    timestamps: true,
  }
);

//module.exports = mongoose.model("ashiglaltiinExcel", ashiglaltiinExcelSchema);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("ashiglaltiinExcel", ashiglaltiinExcelSchema);
};
