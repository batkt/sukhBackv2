const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const licenseSchema = new Schema(
  {
    baiguullagiinId: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },
    duusakhOgnoo: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(licenseSchema, "license");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("license", licenseSchema);
};
//module.exports = mongoose.model("license", licenseSchema);
