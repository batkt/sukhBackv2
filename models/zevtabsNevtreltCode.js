const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

 
const zevtabsNevtreltCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    ajiltniiId: { type: String, required: true },
    baiguullagiinId: { type: String, required: true },

    zevtabsAjiltniiId: String,
    zevtabsAjiltniiNer: String,
    ashiglasanOgnoo: Date,
    ustgakhOgnoo: { type: Date, required: true },
  },
  { timestamps: true },
);

zevtabsNevtreltCodeSchema.index({ ustgakhOgnoo: 1 }, { expireAfterSeconds: 0 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zevtabsNevtreltCode", zevtabsNevtreltCodeSchema);
};
