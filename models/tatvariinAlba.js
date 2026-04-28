const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const tatvariinAlbaSchema = new Schema(
  {
    ner: String,
    kod: String,
    ded: [
      {
        ner: String,
        kod: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);
module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("tatvariinAlba", tatvariinAlbaSchema);
};
