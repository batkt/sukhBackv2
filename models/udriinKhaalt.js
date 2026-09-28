const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Камер кассын өдрийн хаалт — тухайн өдрийн машин ба орлогын нэгтгэл.
 * Дүнг дэлгэц автоматаар бодож илгээнэ; кассчин гараар бөглөхгүй.
 * Нэг барилгад нэг өдөр нэг л хаалт.
 */
const udriinKhaaltSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,
    /** "YYYY-MM-DD" */
    udur: { type: String, required: true },
    mashin: {
      niit: Number,
      garsan: Number,
      dotor: Number,
      unegui: Number,
      turluud: [{ ner: String, too: Number }],
    },
    dun: {
      bodogdson: Number,
      khungulult: Number,
      tulsun: Number,
      tulugdugui: Number,
      ebarimt: Number,
    },
    khelber: [{ ner: String, too: Number, dun: Number }],
    tailbar: String,
    ajiltniiId: String,
    ajiltniiNer: String,
  },
  { timestamps: true },
);

udriinKhaaltSchema.index({ baiguullagiinId: 1, barilgiinId: 1, udur: 1 }, { unique: true });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("udriinKhaalt", udriinKhaaltSchema);
};
