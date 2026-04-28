const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const accountNumberSchema = new Schema(
  {
    baiguullagiinId: String,
    account_number: String,
  },
  {
    timestamps: true,
  }
);

// Add index for better performance
accountNumberSchema.index({ baiguullagiinId: 1 });
accountNumberSchema.index({ account_number: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("accountNumber", accountNumberSchema);
};
