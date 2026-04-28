const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ebarimtSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    guilgeeniiId: String,
    togloomiinId: String,
    zogsooliinId: String,
    tasalbariinGuilgeeniiId: String,
    tulultiinId: String,
    ustgasanOgnoo: Date,
    amount: String,
    vat: String,
    cashAmount: String,
    nonCashAmount: String,
    cityTax: String,
    districtCode: String,
    posNo: String,
    customerNo: String,
    billType: String,
    billIdSuffix: String,
    returnBillId: String,
    billId: String,
    reportMonth: String,
    date: String,
    dateOgnoo: Date,
    talbainDugaar: String,
    gereeniiDugaar: String,
    utas: String,
    mashiniiDugaar: String,
    stocks: [
      {
        code: String,
        name: String,
        measureUnit: String,
        qty: String,
        unitPrice: String,
        totalAmount: String,
        cityTax: String,
        vat: String,
        barCode: String,
      },
    ],
    bankTransactions: [
      {
        rrn: String,
        bankId: String,
        terminalId: String,
        approvalCode: String,
        amount: String,
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

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(ebarimtSchema, "ebarimt");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("ebarimt", ebarimtSchema);
};

//module.exports = mongoose.model("ebarimt", ebarimtSchema);
