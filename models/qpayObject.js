const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const qpayObjectSchema = new Schema(
  {
    zakhialgiinDugaar: String,
    gereeniiId: String,
    baiguullagiinId: String,
    barilgiinId: String,
    salbariinId: String,
    account_number: String,
    tulsunEsekh: { type: Boolean, default: false },
    ognoo: { type: Date, default: Date.now },
    qpay: Schema.Types.Mixed,
    payment_id: String,
    invoice_id: String,
    legacy_id: String,
    amount: Number,
    currency: { type: String, default: "MNT" },
    status: { type: String, default: "pending" },
    callback_url: String,
    redirect_url: String,
    description: String,
    customer_info: Schema.Types.Mixed,
    payment_method: String,
    transaction_id: String,
    sukhNekhemjlekh: {
      nekhemjlekhiinId: { type: String, default: "" },
      gereeniiDugaar: { type: String, default: "" },
      utas: { type: String, default: "" },
      pay_amount: { type: String, default: "" },
    },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better performance
qpayObjectSchema.index({ zakhialgiinDugaar: 1, baiguullagiinId: 1 });
qpayObjectSchema.index({ invoice_id: 1 });
qpayObjectSchema.index({ tulsunEsekh: 1, ognoo: 1 });
qpayObjectSchema.index({ "sukhNekhemjlekh.nekhemjlekhiinId": 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("qpayObject", qpayObjectSchema);
};
