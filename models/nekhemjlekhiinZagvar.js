const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const nekhemjlekhiinZagvarSchema = new Schema(
  {
    ner: String,
    tailbar: String,
    nekhemjlekh: String,
    turul: String,
    burtgesenAjiltan: String,
    baiguullagiinId: String,
    barilgiinId: String,
    khatuuZagvarEsekh: Boolean,
    khuudasniiKhemjee: String,
    chiglel: String,
  },
  { timestamps: true }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("nekhemjlekhiinZagvar", nekhemjlekhiinZagvarSchema);
};
//module.exports = mongoose.model(  "nekhemjlekhiinZagvar",  nekhemjlekhiinZagvarSchema);
