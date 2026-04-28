const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const walletPaymentSchema = new Schema(
  {
    // Хэрэглэгчийн утасны дугаар (Wallet API-ийн userId)
    userId: { type: String, required: true },

    // Орон нутгийн системийн оршин суугчийн ID (байвал)
    orshinSuugchId: { type: String },

    // Wallet системийн төлбөрийн ID
    paymentId: { type: String, required: true },

    // QPay төлбөрийн ID болон гүйлгээний мэдээллүүд
    qpayPaymentId: { type: String, required: true },
    trxDate: { type: Date },
    trxNo: { type: String },
    trxDescription: { type: String },
    amount: { type: Number },
    receiverBankCode: { type: String },
    receiverAccountNo: { type: String },
    receiverAccountName: { type: String },

    // Төлбөрийн төлөв
    status: {
      type: String,
      default: "PAID",
    },

    // Нэмэлт дата хадгалах зорилгоор бүтнээр нь хадгалах хүсэлт орж ирвэл
    rawQpayData: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

walletPaymentSchema.index({ paymentId: 1 }, { unique: true });
walletPaymentSchema.index({ userId: 1 });

module.exports = function walletPayment(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("walletPayment", walletPaymentSchema);
};
