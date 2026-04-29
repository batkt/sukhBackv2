const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const gereeSchema = new Schema(
  {
    id: String,
    gereeniiDugaar: String,
    gereeniiOgnoo: Date,
    turul: String,
    tuluv: {
      type: String,
      enum: ["Идэвхтэй", "Цуцалсан"],
      default: "Идэвхтэй",
    },
    ovog: String,
    ner: String,
    suhNer: String,
    suhRegister: String,
    suhUtas: [String],
    suhMail: String,
    suhGariinUseg: String,
    suhTamga: String,
    register: String,
    aimag: String,
    utas: [String],
    mail: String,
    baingiinKhayag: String,
    khugatsaa: Number,
    ekhlekhOgnoo: Date,
    duusakhOgnoo: Date,
    tulukhOgnoo: Date,
    tsutsalsanOgnoo: Date,
    nekhemjlekhiinOgnoo: Date,
    suhTulbur: String,
    suhTulburUsgeer: String,
    suhKhugatsaa: Number,
    ashiglaltiinZardal: Number,
    ashiglaltiinZardalUsgeer: String,
    bairNer: String,
    sukhBairshil: String,
    duureg: String,
    horoo: Schema.Types.Mixed,
    sohNer: String,
    toot: String,
    davkhar: String,
    burtgesenAjiltan: String,
    orshinSuugchId: String,
    baiguullagiinId: String,
    baiguullagiinNer: String,
    barilgiinId: String,
    temdeglel: String,
    tailbar: String, // Additional description/notes field
    orts: String, // Web only field
    umnukhZaalt: Number, // Previous reading (Өмнө)
    suuliinZaalt: Number, // Current total reading (Нийт одоо)
    zaaltTog: Number, // Day reading (Өдөр)
    zaaltUs: Number, // Night reading (Шөнө)
    ekhniiUldegdel: Number, // Opening balance (Эхний үлдэгдэл)
    zardluud: [
      {
        ner: String,
        turul: String,
        tariff: Number,
        tariffUsgeer: String,
        zardliinTurul: String,
        barilgiinId: String, // Барилгын ID - аль барилгаас ирсэн zardal болохыг тодорхойлох
        tulukhDun: Number, // Менежментийн зардал
        dun: Number, //dung n zuwxun munguur tootsoj awax togtmol ued buglunu
        bodokhArga: String, //togtmol tomyotoi baidag arguud
        tseverUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
        bokhirUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
        usKhalaasniiDun: Number, // xaluun us ued xatuu bodno
        tsakhilgaanUrjver: Number, //tsakhilgaanii coefficent
        tsakhilgaanChadal: Number,
        tsakhilgaanDemjikh: Number,
        tailbar: String,
        suuriKhuraamj: String,
        nuatNemekhEsekh: Boolean,
        ognoonuud: [Date],
      },
    ],
    segmentuud: [
      {
        ner: String,
        utga: String,
      },
    ],
    gereeniiTuukhuud: {
      type: [Schema.Types.Mixed],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(gereeSchema, "geree");

module.exports = function a(conn, read = false) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = read && !!conn.kholboltRead ? conn.kholboltRead : conn.kholbolt;
  return conn.model("geree", gereeSchema);
};
