const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const blogSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    title: { type: String },
    content: { type: String },
    images: [
      {
        path: String,
        metadata: Schema.Types.Mixed,
      },
    ],
    reactions: [
      {
        emoji: String,
        count: { type: Number, default: 0 },
        users: [{ type: Schema.Types.ObjectId, ref: "orshinSuugch" }],
      },
    ],
    ognoo: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Add audit hooks for tracking changes if needed
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(blogSchema, "blog");

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("blog", blogSchema);
};
