const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const zogsoolSchema = new Schema(
  {
    id: {
      type: String,
      unique: true,
    },
    car_number: String,
    check_in_time: Date,
    check_out_time: Date,
    khugatsaa: Number,
    turul: String,
    tulbur: Number,
    mashin: Schema.Types.Mixed,
    baiguullagiinId: String,
    barilgiinId: String,
  },
  {
    timestamps: true,
  }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(zogsoolSchema, "zogsool");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zogsool", zogsoolSchema);
};
