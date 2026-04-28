const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const pdfFileSchema = new Schema(
  {
    ner: {
      type: String,
      required: true,
    },
    originalNer: {
      type: String,
      required: true,
    },
    pdfFile: {
      type: Buffer,
      required: true,
    },
    contentType: {
      type: String,
      default: "application/pdf",
    },
    hemjee: {
      type: Number, // File size in bytes
      required: true,
    },
    tailbar: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster searches
pdfFileSchema.index({ ner: 1 });
pdfFileSchema.index({ createdAt: -1 });

// Method to exclude pdfFile buffer when returning metadata
pdfFileSchema.methods.toJSON = function () {
  const obj = this.toObject();
  // Don't include the large buffer in JSON responses
  delete obj.pdfFile;
  return obj;
};

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("pdfFile", pdfFileSchema);
};

