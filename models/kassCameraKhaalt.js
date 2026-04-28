const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const kassCameraKhaaltSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    nevtersenOgnoo: Date,
    khaaltOgnoo: Date,
    garsanCameraIp: String,
    ajiltaniiId: String,
    ajiltaniiNer: String,
    zogsooliinId: String,
    tulbur: [
      {
        ognoo: Date,
        turul: String,
        dun: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("kassCameraKhaalt", kassCameraKhaaltSchema);
};