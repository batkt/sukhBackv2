const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const zogsooliinIpSchema = new Schema(
  {
    ip: [String],
    baiguullagiinId: String,
    barilgiinId: String,
  },
  { timestamps: true }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zogsooliinIp", zogsooliinIpSchema);
};
