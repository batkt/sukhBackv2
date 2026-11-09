const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Тоот ↔ BPay-ийн холболт (Төрийн банк горим).
 *
 * Тоот бүрийн хаягийг ТЭР ТООТЫН ОРШИН СУУГЧИЙН ӨӨРИЙН BPay бүртгэлд (утас) холбож,
 * тэр холболтоор биллийг нь татдаг. Нэг тоотод нэг мөр.
 */
const bpayHolboltSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,
    gereeniiId: String,
    gereeniiDugaar: String,
    toot: String,
    bpayBairId: String,
    customerId: String, // BPay-ийн UUID
    customerCode: String, // BPay-ийн хэрэглэгчийн код (2003260...)
    customerName: String,
    customerAddress: String,
    billingId: String, // оршин суугчийн BPay бүртгэл дээрх холболт
    syncUtas: String, // оршин суугчийн утас (BPay walletUserId)
    residentId: String, // orshinSuugch._id
    /** Бид saveBilling-ээр үүсгэсэн эсэх (false = бүртгэлд аль хэдийн байсан). */
    bidUusgesen: { type: Boolean, default: false },
    suuldSync: Date,
    suuldAldaa: String,
    /**
     * Оршин суугч BPay апп-аасаа хаягаа САЛГАСАН (бүртгэлд нь энэ billingId байхгүй, бусад нь байгаа).
     * Синк хийхгүй, "Холбох" дахин НЭМЭХГҮЙ — оршин суугч өөрөө дахин холбосон бол л түүнийг авна.
     */
    salgasan: { type: Boolean, default: false },
    salgasanOgnoo: Date,
  },
  { timestamps: true },
);

bpayHolboltSchema.index({ baiguullagiinId: 1, gereeniiId: 1 }, { unique: true, sparse: true });
bpayHolboltSchema.index({ baiguullagiinId: 1, customerId: 1 });

module.exports = function bpayHolbolt(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("bpayHolbolt", bpayHolboltSchema);
};
