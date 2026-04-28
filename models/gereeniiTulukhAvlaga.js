const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

// Энэ модель нь гэрээнээс үүссэн ТӨЛӨХ авлагын мөрүүдийг хадгална.
// Эх сурвалж нь ихэнхдээ geree.avlaga.guilgeenuud болон/эсвэл nekhemjlekh байх боломжтой.
const gereeniiTulukhAvlagaSchema = new Schema(
  {
    // Relation fields
    baiguullagiinId: { type: String, required: true },
    baiguullagiinNer: String,
    barilgiinId: String,
    gereeniiId: { type: String, required: true }, // Source geree._id
    gereeniiDugaar: String,
    orshinSuugchId: String,
    nekhemjlekhId: String, // Хэрэв тодорхой нэхэмжлэхтэй холбогдож байвал

    // Core avlaga amounts (Төлөх тал)
    ognoo: { type: Date, required: true },
    undsenDun: { type: Number, default: 0 }, // Нийт үндсэн дүн
    tulukhDun: { type: Number, default: 0 }, // Одоогоор төлөх ёстой дүн
    tulukhAldangi: { type: Number, default: 0 },
    uldegdel: { type: Number, default: 0 }, // Үлдэгдэл (payment-уудын дараа)

    // Classification
    turul: String, // жишээ нь: "avlaga", "uilchilgee", "zardal"
    aldangiinTurul: String,
    zardliinTurul: String,
    zardliinId: String,
    zardliinNer: String,

    // Flags
    nekhemjlekhDeerKharagdakh: { type: Boolean, default: true },
    nuatBodokhEsekh: { type: Boolean, default: true },
    ekhniiUldegdelEsekh: { type: Boolean, default: false },

    // Descriptions
    tailbar: String,
    nemeltTailbar: String,

    // Book-keeping
    source: {
      type: String,
      enum: ["geree", "nekhemjlekh", "gar", "busad", "excel_import"],
      default: "geree",
    },
    guilgeeKhiisenAjiltniiNer: String,
    guilgeeKhiisenAjiltniiId: String,
    // Хэрвээ geree.avlaga.guilgeenuud-ээс хөрвүүлсэн бол тухайн индексийг хадгалж болно
    avlagaGuilgeeIndex: Number,
  },
  {
    timestamps: true,
  }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("gereeniiTulukhAvlaga", gereeniiTulukhAvlagaSchema);
};

