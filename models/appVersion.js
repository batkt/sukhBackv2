const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const appVersionSchema = new Schema(
  {
    platform: {
      type: String, // 'android', 'ios'
      required: true,
      unique: true,
    },
    version: {
      type: String,
      required: true,
    },
    minVersion: {
      type: String,
      required: true,
    },
    isForceUpdate: {
      type: Boolean,
      default: false,
    },
    updateUrl: {
      type: String,
    },
    message: {
      type: String,
    },
  },
  { timestamps: true }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(appVersionSchema, "appVersion");

module.exports = function a(conn) {

  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("appVersion", appVersionSchema);
};
