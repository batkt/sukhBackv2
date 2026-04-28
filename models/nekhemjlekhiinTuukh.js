const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const nekhemjlekhiinTuukhSchema = new Schema(
  {
    baiguullagiinNer: String,
    baiguullagiinUtas: String,
    baiguullagiinKhayag: String,
    baiguullagiinId: String,
    barilgiinId: String,
    ovog: String,
    ner: String,
    register: String,
    utas: [String],
    khayag: String,
    gereeniiOgnoo: Date,
    turul: String,
    gereeniiId: String,
    gereeniiDugaar: String,
    davkhar: String,
    daraagiinTulukhOgnoo: Date,
    dansniiDugaar: String,
    gereeniiZagvariinId: String,
    tulukhUdur: [String],
    ognoo: Date,
    mailKhayagTo: String,
    maililgeesenAjiltniiNer: String,
    maililgeesenAjiltniiId: String,
    nekhemjlekhiinZagvarId: String,
    medeelel: mongoose.Schema.Types.Mixed,
    nekhemjlekh: String,
    zagvariinNer: String,
    content: String,
    nekhemjlekhiinDans: String,
    nekhemjlekhiinDansniiNer: String,
    nekhemjlekhiinBank: String,
    nekhemjlekhiinIbanDugaar: String,
    nekhemjlekhiinOgnoo: Date,
    nekhemjlekhiinDugaar: String, // Unique invoice number
    dugaalaltDugaar: Number,
    niitTulbur: Number,
    tuluv: {
      type: String,
      enum: ["Төлөөгүй", "Төлсөн", "Хугацаа хэтэрсэн"],
      default: "Төлөөгүй",
    },
    qpayPaymentId: String,
    qpayInvoiceId: String,
    qpayUrl: String,
    tulukhOgnoo: Date,
    tulsunOgnoo: Date,
    orts: String, // Web only field
    tsahilgaanNekhemjlekh: Number, // Electricity invoice amount (calculated from zaalt readings)
    tailbar: String,
  },
  {
    timestamps: true,
  },
);

// tuluv management remains based on payment status, but uldegdel is moved to GuilgeeAvlaguud
nekhemjlekhiinTuukhSchema.pre("save", function (next) {
  next();
});

nekhemjlekhiinTuukhSchema.post("find", async function (docs) {
  if (!docs || docs.length === 0) return;

  try {
    const { db } = require("zevbackv2");
    const AshiglaltiinZardluud = require("./ashiglaltiinZardluud");

    // Get unique tailbar values and baiguullagiinId from docs
    const tailbarMap = new Map();
    docs.forEach((doc) => {
      if (doc.tailbar && doc.baiguullagiinId) {
        const key = `${doc.baiguullagiinId}|${doc.tailbar}`;
        if (!tailbarMap.has(key)) {
          tailbarMap.set(key, {
            baiguullagiinId: doc.baiguullagiinId,
            tailbar: doc.tailbar,
            barilgiinId: doc.barilgiinId,
          });
        }
      }
    });

    for (const [key, { baiguullagiinId, tailbar, barilgiinId }] of tailbarMap) {
      const kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
      );

      if (kholbolt) {
        const query = {
          baiguullagiinId: String(baiguullagiinId),
          tailbar: tailbar,
        };

        if (barilgiinId) {
          query.barilgiinId = String(barilgiinId);
        }

        const zardluud = await AshiglaltiinZardluud(kholbolt)
          .find(query)
          .lean();

        // Attach zardluud to matching docs
        docs.forEach((doc) => {
          if (
            doc.tailbar === tailbar &&
            String(doc.baiguullagiinId) === String(baiguullagiinId) &&
            (!barilgiinId || String(doc.barilgiinId) === String(barilgiinId))
          ) {
            doc.zardal = zardluud;
          }
        });
      }
    }
  } catch (error) {
    console.error("Error populating zardal in nekhemjlekhiinTuukh:", error);
  }
});

nekhemjlekhiinTuukhSchema.post("findOne", async function (doc) {
  if (!doc || !doc.tailbar || !doc.baiguullagiinId) return;

  try {
    const { db } = require("zevbackv2");
    const AshiglaltiinZardluud = require("./ashiglaltiinZardluud");

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(doc.baiguullagiinId),
    );

    if (kholbolt) {
      const query = {
        baiguullagiinId: String(doc.baiguullagiinId),
        tailbar: doc.tailbar,
      };

      if (doc.barilgiinId) {
        query.barilgiinId = String(doc.barilgiinId);
      }

      const zardluud = await AshiglaltiinZardluud(kholbolt).find(query).lean();

      doc.zardal = zardluud;
    }
  } catch (error) {
    console.error("Error populating zardal in nekhemjlekhiinTuukh:", error);
  }
});
const { runDeleteSideEffects } = require("../services/invoiceDeletionService");

const handleBalanceOnDelete = async function (doc) {
  await runDeleteSideEffects(doc);
};

nekhemjlekhiinTuukhSchema.pre(
  "deleteOne",
  { document: true, query: true },
  async function () {
    if (this instanceof mongoose.Document) {
      await handleBalanceOnDelete(this);
    } else {
      const doc = await this.model.findOne(this.getQuery());
      await handleBalanceOnDelete(doc);
    }
  },
);

nekhemjlekhiinTuukhSchema.pre("findOneAndDelete", async function () {
  const doc = await this.model.findOne(this.getQuery());
  await handleBalanceOnDelete(doc);
});

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("nekhemjlekhiinTuukh", nekhemjlekhiinTuukhSchema);
};
