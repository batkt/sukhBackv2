const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const backTuukhSchema = new Schema(
  {
    ajiltniiId: String,
    ajiltniiNer: String,
    ognoo: Date,
    khemjee: Number,
    baiguullagiinId: String,
    useragent: Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

//module.exports = mongoose.model("backTuukh", backTuukhSchema);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("backTuukh", backTuukhSchema);
};
