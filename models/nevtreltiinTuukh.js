const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const nevtreltiinTuukhSchema = new Schema(
  {
    ajiltniiId: String,
    ajiltniiNer: String,
    ognoo: Date,
    bairshilUls: String,
    bairshilKhot: String,
    uildliinSystem: String,
    ip: String,
    browser: String,
    baiguullagiinId: String,
    baiguullagiinRegister: String,
    barilgiinId: String,
    useragent: Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("nevtreltiinTuukh", nevtreltiinTuukhSchema);
};
//module.exports = mongoose.model("nevtreltiinTuukh", nevtreltiinTuukhSchema);
