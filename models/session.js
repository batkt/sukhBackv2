const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const sessionSchema = new Schema(
  {
    sessionToken: {
      type: String,
      required: true,
      unique: true,
    },
    ajiltanId: {
      type: String,
      required: true,
      index: true,
    },
    baiguullagiinId: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
      platform: String,
      browser: String,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 43200 });
sessionSchema.index({ ajiltanId: 1, isActive: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("session", sessionSchema);
};
