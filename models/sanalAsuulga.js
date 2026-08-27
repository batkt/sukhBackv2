const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Оршин суугчид руу явуулах САНАЛ АСУУЛГА.
 *
 * Нэг асуулгад хэд хэдэн асуулт багтана. Асуулт бүр дараах гурван төрлийн
 * аль нэг байна:
 *   songolt      - нэг хариулт сонгоно
 *   olonSongolt  - олон хариулт сонгож болно
 *   tekst        - чөлөөт бичвэр
 *
 * Хариултууд нь ТУСДАА цуглуулга (sanalAsuulgiinKhariult) дээр хадгалагдана.
 */
const asuultSchema = new Schema(
  {
    asuult: { type: String, required: true },
    turul: {
      type: String,
      enum: ["songolt", "olonSongolt", "tekst"],
      default: "songolt",
    },
    /** songolt / olonSongolt үед л хэрэглэгдэнэ */
    songoltuud: [String],
    /** Заавал хариулах эсэх */
    zaavalEsekh: { type: Boolean, default: true },
  },
  { _id: true },
);

const sanalAsuulgaSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true, index: true },
    /** Хоосон бол байгууллагын БҮХ барилгад хамаарна */
    barilguud: [String],

    garchig: { type: String, required: true },
    tailbar: String,

    asuultuud: { type: [asuultSchema], default: [] },

    ekhlekhOgnoo: Date,
    duusakhOgnoo: Date,

    /**
     * noots      - ноорог, оршин суугчид харагдахгүй
     * idevkhtei  - явагдаж байгаа
     * duussan    - хаагдсан, хариулт хүлээж авахгүй
     */
    tuluv: {
      type: String,
      enum: ["noots", "idevkhtei", "duussan"],
      default: "noots",
      index: true,
    },

    /** Үүсгэсэн ажилтан */
    ajiltniiId: String,
    ajiltniiNer: String,

    ustgagdakhEsekh: { type: Boolean, default: false },
  },
  { timestamps: true },
);

sanalAsuulgaSchema.index({ baiguullagiinId: 1, tuluv: 1, createdAt: -1 });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("sanalAsuulga", sanalAsuulgaSchema);
};
