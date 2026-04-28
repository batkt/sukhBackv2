const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const bankniiGuilgeeSchema = new Schema(
  {
    // Common fields for all banks
    tranDate: Date,
    balance: Number,
    requestId: String,
    recNum: String,
    tranId: String,
    drOrCr: String,
    amount: Number,
    tranPostedDate: Date,
    description: String,
    tranCrnCode: String,
    exchRate: Number,
    accName: String,
    accNum: String,
    
    // Khan Bank specific fields
    record: String,
    TxDt: Date,
    Amt: Number,
    
    // Golomt Bank specific fields
    tranAmount: Number,
    
    // Bogd Bank specific fields
    recNum: String,
    
    // TDB Bank specific fields
    NtryRef: String,
    
    // Tengerin Bank specific fields
    jrno: String,
    income: Number,
    outcome: Number,
    
    // Posting fields
    postDate: Date,
    time: String,
    branch: String,
    teller: String,
    journal: String,
    code: String,
    debit: Number,
    correction: String,
    relatedAccount: String,
    refno: String,
    
    // Linking fields
    kholbosonGereeniiId: [String],
    kholbosonTalbainId: [String],
    dansniiDugaar: String,
    bank: String,
    baiguullagiinId: String,
    barilgiinId: String,
    indexTalbar: String,
    kholbosonDun: Number,
    ebarimtAvsanEsekh: Boolean,
    magadlaltaiGereenuud: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(bankniiGuilgeeSchema, "bankniiGuilgee");

module.exports = function a(conn, historical = false) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  const collectionName = historical ? "bankniiGuilgeeShine" : "bankniiGuilgee";
  return conn.model(collectionName, bankniiGuilgeeSchema);
};

