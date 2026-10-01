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
    /**
     * Гүйлгээний ХАРАГДАХ хэлбэр (Төлбөр / Бартер / Нэхэмжлэх ...).
     * Дэлгэц нь `khelber || "Төлбөр"` гэж уншдаг тул бартер мэтийн
     * мөнгөн бус төлөлтийг ялгаж харуулахад хэрэгтэй.
     */
    khelber: String,
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
        "zogsool",
        // Хөнгөлөлтийн цонхоос (khungulultController) — энэ утгагүйгээс
        // хадгалах бүр шалгалтад унаж «N гэрээнд алдаа гарлаа» гардаг байв.
        "khungulult",
      ],
      default: "geree",
    },
    guilgeeKhiisenAjiltniiNer: String,
    guilgeeKhiisenAjiltniiId: String,

    // Хөнгөлөлтийн нэмэлт мэдээлэл (turees-тэй ижил ойлголт).
    /** Хоногоор тооцсон хөнгөлөлт эсэх. */
    khonogTootsokhEsekh: Boolean,
    /** Хэдэн хоногийн хөнгөлөлт болохыг тэмдэглэнэ. */
    khungulultKhonog: Number,
    /** Хувиар тооцсон бол тухайн хувь. */
    khungulultKhuvi: Number,
    /** Хөнгөлөлтийн бүртгэл (`khungulultiinTuukh`) — нэг хөнгөлөлтийн мөрүүд */
    khungulultiinTuukhId: String,
    avlagaGuilgeeIndex: Number,
  },
  {
    timestamps: true,
  }
);

guilgeeAvlaguudSchema.pre("save", async function (next) {
  if (this.turul === "khungulult" || this.turul === "discount") {
    this.turul = "Хөнгөлөлт";
  }

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

/**
 * Хөнгөлөлтийн нэг мөрийг (гүйлгээний түүх, нэхэмжлэхээс) устгахад
 * хөнгөлөлтийн бүртгэлийг (khungulultiinTuukh) үлдсэн мөрүүдээр нь дахин
 * тооцно. Өмнө нь бүртгэл хэвээр үлдэж «Хөнгөлөлтийн түүх»-д харагдсаар байв.
 * deleteMany-д холбохгүй: хөнгөлөлтийн контроллер өөрөө бүртгэлээ шинэчилдэг.
 */
async function khungulultiinTuukhDakhinTootsoolokh(connection, tuukhId) {
  if (!tuukhId || !connection) return;
  try {
    const kholbolt = { kholbolt: connection };
    const Tuukh = require("./khungulultiinTuukh")(kholbolt);
    const Model = connection.model("guilgeeAvlaguud");
    const tuukh = await Tuukh.findById(tuukhId).lean();
    if (!tuukh) return;
    const uldsen = await Model.aggregate([
      { $match: { khungulultiinTuukhId: String(tuukhId) } },
      { $group: { _id: "$gereeniiId", dun: { $sum: "$dun" } } },
    ]);
    const dunByGeree = new Map(uldsen.map((r) => [String(r._id), Math.abs(Number(r.dun) || 0)]));
    const khamaatai = (tuukh.khamaataiGereenuud || [])
      .filter((k) => dunByGeree.has(String(k.gereeniiId)))
      .map((k) => ({ ...k, khungulsunDun: dunByGeree.get(String(k.gereeniiId)) }));
    if (khamaatai.length === 0) {
      await Tuukh.deleteOne({ _id: tuukh._id });
      return;
    }
    const sarToo = tuukh.ognoonuud?.length || 1;
    await Tuukh.updateOne(
      { _id: tuukh._id },
      {
        $set: {
          khamaataiGereenuud: khamaatai,
          khungulsunDun: khamaatai.reduce((s, k) => s + (Number(k.khungulsunDun) || 0), 0),
          tulukhDun: khamaatai.reduce((s, k) => s + (Number(k.sariinDun) || 0) * sarToo, 0),
        },
      },
    );
  } catch (err) {
    console.error("Хөнгөлөлтийн бүртгэл шинэчлэхэд алдаа:", err.message);
  }
}

guilgeeAvlaguudSchema.pre(["findOneAndDelete", "deleteOne"], { query: true, document: false }, async function () {
  try {
    const mur = await this.model.findOne(this.getQuery()).select("khungulultiinTuukhId").lean();
    this._khungulultiinTuukhId = mur?.khungulultiinTuukhId || null;
  } catch (_) {
    this._khungulultiinTuukhId = null;
  }
});
guilgeeAvlaguudSchema.post(["findOneAndDelete", "deleteOne"], { query: true, document: false }, async function () {
  if (this._khungulultiinTuukhId) {
    await khungulultiinTuukhDakhinTootsoolokh(this.model.db, this._khungulultiinTuukhId);
  }
});
guilgeeAvlaguudSchema.post("deleteOne", { document: true, query: false }, async function (doc) {
  const d = doc || this;
  if (d?.khungulultiinTuukhId) {
    await khungulultiinTuukhDakhinTootsoolokh(d.constructor?.db || d.$__?.db, d.khungulultiinTuukhId);
  }
});

// ── Бодит цагийн мэдэгдэл: гүйлгээ өөрчлөгдөхөд оршин суугчийн апп шинэчлэгдэнэ ──
function tulburMedegdeye(baiguullagiinId, gereeniiId) {
  try {
    require("../utils/realtimeTulbur").tulburShinechlegdlee(baiguullagiinId, gereeniiId);
  } catch (_) {}
}
function filterMedegdeye(query) {
  const f = (query && query.getFilter && query.getFilter()) || {};
  const baig = f.baiguullagiinId;
  const g = f.gereeniiId;
  if (!baig || !g || typeof baig === "object") return;
  const idnuud = typeof g === "object" ? (Array.isArray(g.$in) ? g.$in : []) : [g];
  idnuud.forEach((id) => tulburMedegdeye(baig, id));
}
guilgeeAvlaguudSchema.post("save", function (doc) {
  tulburMedegdeye(doc?.baiguullagiinId, doc?.gereeniiId);
});
guilgeeAvlaguudSchema.post("insertMany", function (docs) {
  (docs || []).forEach((d) => tulburMedegdeye(d?.baiguullagiinId, d?.gereeniiId));
});
guilgeeAvlaguudSchema.post(["findOneAndUpdate", "findOneAndDelete"], function (doc) {
  if (doc) tulburMedegdeye(doc.baiguullagiinId, doc.gereeniiId);
  else filterMedegdeye(this);
});
guilgeeAvlaguudSchema.post(
  ["updateOne", "updateMany", "deleteOne", "deleteMany"],
  { query: true, document: false },
  function () {
    filterMedegdeye(this);
  },
);
guilgeeAvlaguudSchema.post("deleteOne", { document: true, query: false }, function (doc) {
  const d = doc || this;
  tulburMedegdeye(d?.baiguullagiinId, d?.gereeniiId);
});

module.exports = function a(conn) {

  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("guilgeeAvlaguud", guilgeeAvlaguudSchema);
};

/** Хөнгөлөлтийн бүртгэлийг үлдсэн мөрүүдээр нь дахин тооцох (маршрутаас дуудна). */
module.exports.khungulultiinTuukhDakhinTootsoolokh = (kholbolt, tuukhId) =>
  khungulultiinTuukhDakhinTootsoolokh(kholbolt?.kholbolt, tuukhId);
