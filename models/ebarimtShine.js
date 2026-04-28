const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ebarimtSchema = new Schema(
  {
    id: String,
    baiguullagiinId: String,
    barilgiinId: String,
    guilgeeniiId: String,
    tulultiinId: String,
    nekhemjlekhiinId: String, // Invoice ID
    qrData: String, // QR Code value from e-Barimt response
    lottery: String, // Lottery number
    receiptId: String, // Receipt ID (33-digit from e-Barimt)
    ustgasanOgnoo: Date,
    talbainDugaar: String,
    gereeniiDugaar: String,
    utas: String,
    mashiniiDugaar: String,
    togloomNer: String,
    togloomUtas: [String],

    totalAmount: Number, //Багц баримтын гүйлгээний нийт дүн , Бүх төрлийн татвар шингэсэн дүн
    totalVAT: Number, //Багц баримтын НӨАТ-н нийт дүн
    totalCityTax: Number, //Багц баримтын НХАТ-н нийт дүн
    districtCode: String, // 4 оронтой бүхэл тоо Баримт хэвлэсэн орон нутгийн код
    merchantTin: String, //11 эсвэл 14 оронтой бүхэл тоо Багц баримт олгогчийн ТТД
    branchNo: String, // дотоод салбарын дугаар 3 оронтой
    posNo: String,
    customerTin: String, //Худалдан авагчийн ТТД
    customerNo: String, //Худалдан авагч иргэний ebarimt-н бүртгэлийн дугаар
    type: String, //B2C_RECEIPT ,B2B_RECEIPT, B2C_INVOICE,B2B_INVOICE
    inactiveId: String, //Засварлах баримтын ДДТД
    invoiceId: String, //Тухайн төлбөрийн баримтын харгалзах нэхэмжлэхийн ДДТД
    reportMonth: String, //Баримт харьяалагдах тайлант сар
    date: String,
    dateOgnoo: Date,
    receipts: [
      {
        totalAmount: Number, //Дэд төлбөрийн баримтын гүйлгээний нийт дүн Бүх төрлийн татвар шингэсэн дүн
        totalVAT: Number, //Дэд төлбөрийн баримтын НӨАТ-н нийт дүн
        totalCityTax: Number, //Дэд төлбөрийн баримтын НХАТ-н нийт дүн
        taxType: String, //VAT_ABLE, VAT_FREE,VAT_ZERO,NO_VAT
        bankAccountNo: String, //Нэхэмжлэхийн банкны дансны дугаар
        merchantTin: String, //11 эсвэл 14 оронтой бүхэл тоо Багц баримт олгогчийн ТТД
        items: [
          {
            name: String,
            barCode: String,
            barCodeType: String, //UNDEFINED,GS1,ISBN
            classificationCode: String, //“Бүтээгдэхүүн, үйлчилгээний нэгдсэн ангилал”-ын код
            taxProductCode: String, //taxType талбарын утга нь VAT_FREE, VAT_ZERO үед татварын харгалзах 3оронтой тоон кодыг оруулна.
            measureUnit: String,
            qty: String,
            unitPrice: String,
            totalVat: String,
            totalCityTax: String,
            totalAmount: String,
          },
        ],
      },
    ],
    payments: [
      {
        code: String, // CASH,PAYMENT_CARD
        exchangeCode: String,
        paidAmount: String,
        status: String, //PAID,PAY,REVERSED,ERROR
      },
    ],
  },
  {
    timestamps: true,
  }
);
ebarimtSchema.pre("save", async function () {
  this.dateOgnoo = new Date(this.date);
});

ebarimtSchema.pre("updateOne", async function () {
  this._update.dateOgnoo = new Date(this._update.date);
});

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("ebarimtShine", ebarimtSchema);
};

//module.exports = mongoose.model("ebarimt", ebarimtSchema);
