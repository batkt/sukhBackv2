const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const gereeniiZagvarSchema = new Schema(
  {
    id: String,
    ner: String,
    tailbar: String,
    aguulga: String,
    turul: String,
    baiguullagiinId: String,
    baiguullagiinNer: String,
    barilgiinId: String,
    tolgoi: String,
    baruunTolgoi: String,
    zuunTolgoi: String,
    baruunKhul: String,
    zuunKhul: String,
    khul: String,
    dedKhesguud: Array,
    turGereeEsekh: Boolean,
  },
  {
    timestamps: true,
  }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(gereeniiZagvarSchema, "gereeniiZagvar");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("gereeniiZagvar", gereeniiZagvarSchema);
};

