const mongoose = require("mongoose");
const orshinSuugch = require("./orshinSuugch");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const medegdelSchema = new Schema(
  {
    id: String,
    parentId: { type: Schema.Types.ObjectId, ref: "medegdel", default: null }, // Thread root for chat replies
    baiguullagiinId: String,
    barilgiinId: String,
    ognoo: Date,
    title: String,
    gereeniiDugaar: String,
    message: String,
    orshinSuugchGereeniiDugaar: String,
    orshinSuugchId: String,
    orshinSuugchNer: String,
    orshinSuugchUtas: String,
    kharsanEsekh: Boolean,
    turul: String, // гомдол, санал, мэдэгдэл, хүсэлт, хариу, user_reply, etc.
    status: {
      type: String,
      enum: ["pending", "in_progress", "done", "cancelled", "rejected"],
      default: "pending"
    },
    tailbar: String, // Reply/notes from web admin
    repliedAt: Date, // When the reply was sent
    repliedBy: String, // Admin/employee ID who replied
    zurag: String, // Path to attached image (e.g. baiguullagiinId/chat-xxx.jpg)
    duu: String, // Voice message path (e.g. baiguullagiinId/chat-xxx.webm)
  },
  {
    timestamps: true,
  }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(medegdelSchema, "medegdel");

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("medegdel", medegdelSchema);
};
