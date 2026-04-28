const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const msgTuukhSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    gereeniiId: String,
    mashiniiDugaar: String,
    turul: String,
    dugaar: [String],
    msg: String,
    msgIlgeekhKey: String,
    msgIlgeekhDugaar: String,
  },
  { timestamps: true }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("msgTuukh", msgTuukhSchema);
};
//module.exports = mongoose.model("msgTuukh", msgTuukh);
