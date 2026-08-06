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

guilgeeAvlaguudSchema.pre("save", async function (next) {
  // If dun is provided, ensure it syncs to undsenDun/tulukhDun for receivables (positive)
  // or tulsunDun for payments (negative)
  if (typeof this.dun === "number" && this.dun !== 0) {
    if (this.dun > 0) {
      if (!this.undsenDun || this.undsenDun === 0) this.undsenDun = this.dun;
      if (!this.tulukhDun || this.tulukhDun === 0) this.tulukhDun = this.dun;
      this.tulsunDun = 0;
      this.tulsunAldangi = 0;
    } else {
      this.tulsunDun = Math.abs(this.dun);
      this.undsenDun = 0;
      this.tulukhDun = 0;
      this.tulukhAldangi = 0;
    }
  } else if (this.turul === "avlaga" && (this.undsenDun > 0 || this.tulukhDun > 0 || this.undsenUne > 0)) {
    
    if (!this.dun || this.dun === 0) {
       this.dun = this.undsenDun || this.tulukhDun || this.undsenUne;
    }
    // Ensure both are set
    if (!this.undsenDun || this.undsenDun === 0) this.undsenDun = this.tulukhDun || this.undsenUne || this.dun;
    if (!this.tulukhDun || this.tulukhDun === 0) this.tulukhDun = this.undsenDun || this.undsenUne || this.dun;
  }

  // Automatically ensure invoice association for manual charges
  if (this.isNew && this.dun > 0 && !this.nekhemjlekhId && this.gereeniiId && this.baiguullagiinId) {
    try {
      const { db } = require("zevbackv2");
      const kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(this.baiguullagiinId)
      );
      if (kholbolt) {
        const activeInv = await invoiceService.ensureActiveInvoice(
          kholbolt,
          this.gereeniiId,
          { billingDate: this.ognoo ? new Date(this.ognoo) : new Date() }
        );
        if (activeInv) {
          this.nekhemjlekhId = activeInv._id.toString();
          console.log(`✅ [LEDGER PRE-SAVE] Associated manual charge with invoice: ${this.nekhemjlekhId}`);
        }
      }
    } catch (err) {
      console.error("❌ [LEDGER PRE-SAVE] ensureActiveInvoice failed:", err.message);
    }
  }

  next();
});


guilgeeAvlaguudSchema.index({ baiguullagiinId: 1, gereeniiId: 1, ognoo: -1 });
guilgeeAvlaguudSchema.index({ baiguullagiinId: 1, barilgiinId: 1, ognoo: -1 });
guilgeeAvlaguudSchema.index({ nekhemjlekhId: 1 });
guilgeeAvlaguudSchema.index({ baiguullagiinId: 1, dun: 1, ognoo: -1 });
// Some callers (e.g. GET /geree's ledger-balance aggregate) $match purely on
// gereeniiId without baiguullagiinId - the compound index above can't be used
// efficiently for that shape, so this covers it directly.
guilgeeAvlaguudSchema.index({ gereeniiId: 1 });

module.exports = function a(conn) {

  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("guilgeeAvlaguud", guilgeeAvlaguudSchema);
};
