const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * ЦЭВЭРЛЭГЭЭНИЙ ЗАХИАЛГА.
 *
 * Оршин суугч аппаас захиалга үүсгэнэ, ажилтан админ талаас нь хүлээж авч
 * гүйцэтгэгч хуваарилна. Захиалга нь тухайн байгууллагын баазад хадгалагдах
 * тул баазын холболт (`conn.kholbolt`) заавал шаардлагатай.
 *
 * Аппаас ирэх талбарууд: үйлчилгээний төрөл, утасны дугаар, нэмэлт мэдээлэл,
 * хүссэн огноо/цаг. Бусад талбарыг сервер өөрөө нөхнө.
 */

/** Одоогоор ганц төрөлтэй. Шинэ төрөл нэмэхэд энд бичнэ. */
const UILCHILGEENII_TURLUUD = ["Өрхийн цэвэрлэгээ"];

/**
 * Шинэ        - оршин суугч дөнгөж захиалсан, хэн ч хараахан хараагүй
 * Хуваарилсан - гүйцэтгэгч томилогдсон
 * Явагдаж буй - цэвэрлэгээ эхэлсэн
 * Дууссан     - гүйцэтгэл бүрэн
 * Цуцалсан    - оршин суугч эсвэл ажилтан цуцалсан
 */
const TULUVUUD = [
  "Шинэ",
  "Хуваарилсан",
  "Явагдаж буй",
  "Дууссан",
  "Цуцалсан",
];

const tseverlegeeSchema = new Schema(
  {
    baiguullagiinId: { type: String, required: true, index: true },
    barilgiinId: { type: String, index: true },
    /** Аль тоот захиалсан — жагсаалт дээр шууд харагдана */
    toot: String,

    orshinSuugchiinId: { type: String, index: true },
    orshinSuugchiinNer: String,

    uilchilgeeniiTurul: {
      type: String,
      enum: UILCHILGEENII_TURLUUD,
      default: "Өрхийн цэвэрлэгээ",
    },

    /** Холбоо барих дугаар. Оршин суугчийн профайлынхаас өөр байж болно. */
    utasniiDugaar: { type: String, required: true },

    /** Юу цэвэрлүүлэхийг чөлөөт бичвэрээр */
    nemelttMedeelel: String,

    /**
     * Хэзээ цэвэрлүүлэхийг хүсэж байгаа. Огноо, цаг хоёрыг нэг Date дээр
     * хадгална — салгаж хадгалбал цагийн бүсийн зөрүүд хоёр талбар зөрнө.
     */
    khusesenOgnoo: { type: Date, required: true, index: true },

    tuluv: {
      type: String,
      enum: TULUVUUD,
      default: "Шинэ",
      index: true,
    },

    /** Хуваарилагдсан гүйцэтгэгч */
    guitsetgegchiinId: String,
    guitsetgegchiinNer: String,

    /** Ажилтны тайлбар — оршин суугчид харагдахгүй дотоод тэмдэглэл */
    ajiltniiTailbar: String,

    ustgagdakhEsekh: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Админы үндсэн харагдац: байгууллагаараа шүүж, төлвөөр бүлэглэн, шинэ нь дээр.
tseverlegeeSchema.index({ baiguullagiinId: 1, tuluv: 1, khusesenOgnoo: -1 });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("tseverlegee", tseverlegeeSchema);
};

module.exports.UILCHILGEENII_TURLUUD = UILCHILGEENII_TURLUUD;
module.exports.TULUVUUD = TULUVUUD;
