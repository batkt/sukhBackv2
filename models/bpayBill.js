const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * BPay-ийн СӨХ-ийн билл (Төрийн банк горим).
 *
 * BPay API зөвхөн ТӨЛӨГДӨӨГҮЙ биллийг буцаадаг тул төлбөрийг "билл алга болсноор"
 * илрүүлнэ. Түлхүүр нь billId биш, `customerCode|сар` — СӨХ тоот бүрт сард нэг
 * билл гаргадаг тул дахин гаргасан (шинэ billId-тай) биллийг ч танина.
 *
 * Энэ хүснэгт журнал (`guilgeeAvlaguud`)-аас ТУСДАА: нэхэмжлэх, алданги, И-баримт,
 * хөнгөлөлт үүнээс уншдаггүй тул BPay-ийн өгөгдөл дахин нэхэгдэхгүй.
 */
const TULUV = ["Төлөгдөөгүй", "Төлөгдсөн"];

const bpayBillSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,
    gereeniiId: String,
    gereeniiDugaar: String,
    toot: String,
    customerId: String,
    customerCode: String,
    billingId: String,

    tulkhuur: { type: String, required: true }, // customerCode|сар (давхар билл бол |billId нэмэгдэнэ)
    sar: String, // BPay-ийн billPeriod, жишээ нь "2026-7"
    billId: String,
    billNo: String,
    billerName: String,
    billtype: String,

    dun: { type: Number, default: 0 }, // алдангигүй (billAmount)
    aldangi: { type: Number, default: 0 }, // сүүлд харсан (billLateFee)
    aldangitaiDun: { type: Number, default: 0 }, // сүүлд харсан (billTotalAmount)

    tuluv: { type: String, enum: TULUV, default: "Төлөгдөөгүй" },
    tulsunOgnoo: Date,
    tulsunDun: Number,
    /** "BPay (манай холболт)" = яг огноо, дүн; "Илрүүлсэн" = алга болсон өдөр, сүүлд харсан дүн. */
    tulburiinEkhSurvalj: String,
    tailbar: String,

    davkharEsekh: { type: Boolean, default: false }, // нэг сард хоёр билл — ажилтан шалгана
    nuusan: { type: Boolean, default: false }, // оршин суугч апп-даа нуусан (hiddenNewBills) — төлөгдөөгүй хэвээр
    anhKharsan: Date,
    suuldKharsan: Date,
    algaToo: { type: Number, default: 0 }, // дараалан харагдаагүй синкийн тоо
    algaEkhelsen: Date,

    tuukh: [
      {
        _id: false,
        ognoo: Date,
        uildel: String,
        delgerengui: String,
      },
    ],
  },
  { timestamps: true },
);

bpayBillSchema.index({ baiguullagiinId: 1, tulkhuur: 1 }, { unique: true });
bpayBillSchema.index({ baiguullagiinId: 1, gereeniiId: 1, sar: 1 });
bpayBillSchema.index({ baiguullagiinId: 1, tuluv: 1 });

module.exports = function bpayBill(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model("bpayBill", bpayBillSchema);
};
module.exports.TULUV = TULUV;
