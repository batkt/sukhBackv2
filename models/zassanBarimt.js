const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const zassanBarimtSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    classType: String, // Type of the record (e.g. "User", "Contract")
    className: String, // Human-readable name
    classId: String, // Document _id
    classDugaar: String, // Identifier (e.g. Contract No)
    classOgnoo: Date, // Primary date associated with record
    ajiltniiId: String,
    ajiltniiNer: String,
    uurchlult: [
      {
        talbar: String, // Technical field name
        talbarNer: String, // Human-readable field name
        umnukhUtga: String, // Previous value
        shineUtga: String, // New value
        utganiiTurul: String, // Value type
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
zassanBarimtSchema.index({ classId: 1, classType: 1 });
zassanBarimtSchema.index({ baiguullagiinId: 1 });
zassanBarimtSchema.index({ createdAt: -1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zassanBarimt", zassanBarimtSchema);
};
