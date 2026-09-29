const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Камер кассын ГАРААР оруулсан орлого — камерт бүртгэгдээгүй машины дугаар ба
 * мөнгөн дүнг шууд бүртгэнэ (ж: 1234УБА — 5,000₮ бэлэн). Өдрийн хаалт ба
 * орлогын тайланд нэмэгдэн тооцогдоно. Хаагдсан өдөрт нэмэхгүй.
 */
const zogsoolGaraarOrlogoSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,
    /** "YYYY-MM-DD" */
    udur: { type: String, required: true },
    mashiniiDugaar: { type: String, required: true },
    dun: { type: Number, required: true },
    /** Төлбөрийн хэлбэр: "belen", "khaan", "qpay" г.м. */
    khelber: { type: String, default: "belen" },
    tailbar: String,
    ajiltniiId: String,
    ajiltniiNer: String,
  },
  { timestamps: true },
);

zogsoolGaraarOrlogoSchema.index({ baiguullagiinId: 1, barilgiinId: 1, udur: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zogsoolGaraarOrlogo", zogsoolGaraarOrlogoSchema);
};
