const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Хөнгөлөлтийн нэг удаагийн бүртгэл (turees-ийн `khungulultiinTuukh`-тэй
 * ижил зарчим). Сар бүрийн хасалт нь `guilgeeAvlaguud`-д
 * `khungulultiinTuukhId`-аар холбогдсон мөрүүд болж бичигдэнэ — устгах,
 * засахдаа бүгдийг нь хамт өөрчилнө.
 */
const khungulultiinTuukhSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,
    /** "YYYY-MM" */
    ekhlekhSar: String,
    duusakhSar: String,
    ognoonuud: [String],
    /** "khuvi" — хувиар, "dun" — сар бүрийн тогтмол дүнгээр */
    khungulukhTurul: { type: String, enum: ["khuvi", "dun"], default: "khuvi" },
    /** Хувь (khuvi) эсвэл сарын дүн (dun) */
    khungulukhUtga: Number,
    shaltgaan: String,
    /** Хөнгөлөлтгүй нийт дүн (сарын төлбөр × сар) */
    tulukhDun: Number,
    /** Нийт хөнгөлсөн дүн */
    khungulsunDun: Number,
    khamaataiGereenuud: [
      {
        _id: false,
        gereeniiId: String,
        gereeniiDugaar: String,
        ner: String,
        toot: String,
        orts: String,
        davkhar: String,
        /** Нэг сарын суурь дүн (гэрээний сарын төлбөр) */
        sariinDun: Number,
        /** Энэ гэрээнд нийт хөнгөлсөн дүн */
        khungulsunDun: Number,
      },
    ],
    ajiltniiId: String,
    ajiltniiNer: String,
    zassanAjiltniiNer: String,
    zassanOgnoo: Date,
  },
  { timestamps: true },
);

khungulultiinTuukhSchema.index({ baiguullagiinId: 1, barilgiinId: 1, createdAt: -1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("khungulultiinTuukh", khungulultiinTuukhSchema);
};
