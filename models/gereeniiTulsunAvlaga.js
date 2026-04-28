const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

// Энэ модель нь гэрээгээр ТӨЛСӨН (paid) авлагын мөрүүдийг хадгална.
// Гол санаа: нэг төлбөр (bankniit guilgee, wallet, бэлэн гэх мэт) олон
// gereeniiTulukhAvlaga мөрийг хааж чадна.
const gereeniiTulsunAvlagaSchema = new Schema(
  {
    // Relation fields
    baiguullagiinId: { type: String, required: true },
    baiguullagiinNer: String,
    barilgiinId: String,
    gereeniiId: { type: String, required: true },
    gereeniiDugaar: String,
    orshinSuugchId: String,
    nekhemjlekhId: String, // Аль нэхэмжлэхийг хааж буй төлбөр

    // Link to payment / transaction
    bankniiGuilgeeId: String,
    tulburGuilgeeId: String,
    dansniiDugaar: String,
    tulsunDans: String,

    // Paid amounts
    ognoo: { type: Date, required: true }, // Төлсөн огноо
    tulsunDun: { type: Number, default: 0 },
    tulsunAldangi: { type: Number, default: 0 },

    // Classification
    turul: String, // жишээ нь: "tulbur", "aldangi", "nuat" гэх мэт
    zardliinTurul: String,
    zardliinId: String,
    zardliinNer: String,

    // Descriptions
    tailbar: String,
    nemeltTailbar: String,

    // Book-keeping
    source: {
      type: String,
      enum: ["geree", "nekhemjlekh", "bank", "avlaga", "zardal", "wallet", "gar", "busad"],
      default: "bank",
    },
    guilgeeKhiisenAjiltniiNer: String,
    guilgeeKhiisenAjiltniiId: String,
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("gereeniiTulsunAvlaga", gereeniiTulsunAvlagaSchema);
};

