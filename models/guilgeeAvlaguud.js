const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const guilgeeAvlaguudSchema = new Schema(
  {
    // dun: positive for charges (receivables), negative for payments
    dun: { type: Number, default: 0 },


    // Relation fields (shared)
    baiguullagiinId: { type: String, required: true },
    baiguullagiinNer: String,
    barilgiinId: String,
    gereeniiId: { type: String, required: true },
    gereeniiDugaar: String,
    orshinSuugchId: String,
    nekhemjlekhId: String,
    toot: String,
    toots: Array,

    // Date
    ognoo: { type: Date, required: true },

    // Tulukh (receivable) fields
    undsenDun: { type: Number, default: 0 },
    tulukhDun: { type: Number, default: 0 },
    tulukhAldangi: { type: Number, default: 0 },

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

guilgeeAvlaguudSchema.pre("save", function (next) {
  if (typeof this.dun === "number" && this.dun !== 0) {
    if (this.dun > 0) {
      this.undsenDun = this.dun;
      this.tulukhDun = this.dun;
      this.tulsunDun = 0;
      this.tulsunAldangi = 0;
    } else {
      this.tulsunDun = Math.abs(this.dun);
      this.undsenDun = 0;
      this.tulukhDun = 0;
      this.tulukhAldangi = 0;
    }
  }

  next();
});


module.exports = function a(conn) {

  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("guilgeeAvlaguud", guilgeeAvlaguudSchema);
};
