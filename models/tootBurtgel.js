const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const tootBurtgelSchema = new Schema(
  {
    id: String,
    baiguullagiinId: String,
    baiguullagiinNer: String,
    barilgiinId: String,
    kharagdakhDugaar: String,
    zaalt: String,
    khamragdsanGereenuud: Array,
    khamaarakhKheseg: String,
    ashilgakhEsekh: String,
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("tootBurtgel", tootBurtgelSchema);
};
