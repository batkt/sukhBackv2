const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ipTuukhSchema = new Schema(
  {
    ip: String,
    bairshilUls: String,
    bairshilKhot: String,
    ognoo: Date,
    medeelel: Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("ipTuukh", ipTuukhSchema);
};
//module.exports = mongoose.model("ipTuukh", ipTuukhSchema);
