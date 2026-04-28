const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const walletInvoiceSchema = new Schema(
  {
    // Phone number used as userId in Wallet API
    userId: { type: String, required: true },

    // Link to our resident if available
    orshinSuugchId: { type: String },

    // Wallet invoice identifier
    walletInvoiceId: { type: String, required: true },

    // Wallet billing context
    billingId: { type: String },
    billIds: [{ type: String }],

    // Human-readable info
    billingName: String,
    customerId: String,
    customerName: String,
    customerAddress: String,

    // Optional total amount (if available from Wallet API)
    totalAmount: Number,

    // Order number mapping
    zakhialgiinDugaar: { type: String },

    // Source marker
    source: {
      type: String,
      default: "WALLET_API",
    },
  },
  {
    timestamps: true,
  },
);

walletInvoiceSchema.index({ userId: 1, walletInvoiceId: 1 }, { unique: true });
walletInvoiceSchema.index({ zakhialgiinDugaar: 1 });
walletInvoiceSchema.index({ orshinSuugchId: 1 });

module.exports = function walletInvoice(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("walletInvoice", walletInvoiceSchema);
};

