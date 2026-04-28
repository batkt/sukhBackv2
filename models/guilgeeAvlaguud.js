const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const guilgeeAvlaguudSchema = new Schema(
  {
    // chiglel: "tulukh" (төлөх/receivable) or "tulsun" (төлсөн/payment)
    chiglel: {
      type: String,
      enum: ["tulukh", "tulsun"],
      required: true,
    },

    // Relation fields (shared)
    baiguullagiinId: { type: String, required: true },
    baiguullagiinNer: String,
    barilgiinId: String,
    gereeniiId: { type: String, required: true },
    gereeniiDugaar: String,
    orshinSuugchId: String,
    nekhemjlekhId: String,

    // Date
    ognoo: { type: Date, required: true },

    // Tulukh (receivable) fields
    undsenDun: { type: Number, default: 0 },
    tulukhDun: { type: Number, default: 0 },
    tulukhAldangi: { type: Number, default: 0 },
    uldegdel: { type: Number, default: 0 },

    // Tulsun (payment) fields
    tulsunDun: { type: Number, default: 0 },
    tulsunAldangi: { type: Number, default: 0 },
    bankniiGuilgeeId: String,
    tulburGuilgeeId: String,
    dansniiDugaar: String,
    tulsunDans: String,

    // Classification (shared)
    turul: String,
    aldangiinTurul: String,
    zardliinTurul: String,
    zardliinId: String,
    zardliinNer: String,

    // Flags (tulukh-specific, but safe to keep on all)
    nekhemjlekhDeerKharagdakh: { type: Boolean, default: true },
    nuatBodokhEsekh: { type: Boolean, default: true },
    ekhniiUldegdelEsekh: { type: Boolean, default: false },

    // Descriptions (shared)
    tailbar: String,
    nemeltTailbar: String,

    // Book-keeping (shared)
    source: {
      type: String,
      enum: [
        "geree",
        "nekhemjlekh",
        "bank",
        "avlaga",
        "zardal",
        "wallet",
        "gar",
        "busad",
        "excel_import",
      ],
      default: "geree",
    },
    guilgeeKhiisenAjiltniiNer: String,
    guilgeeKhiisenAjiltniiId: String,
    avlagaGuilgeeIndex: Number,
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("guilgeeAvlaguud", guilgeeAvlaguudSchema);
};
