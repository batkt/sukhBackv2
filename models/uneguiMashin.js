const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const uneguiMashinSchema = new Schema(
  {
    mashiniiDugaar: {
      type: String,
      required: true,
      trim: true,
    },
    zogsool: [
      {
        baiguullagiinId: String,
        zogsooliinId: String,
        zogsooliinNer: String,
        barilgiinid: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Kholboltiin medeelel zaaval buglukh shaardlagatai!");
  return conn.kholbolt.model("uneguiMashin", uneguiMashinSchema);
};
