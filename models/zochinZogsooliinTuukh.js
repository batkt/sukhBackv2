const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

/**
 * Түрээсийн зогсоолын системээс ирсэн зочны зогсоолын хөдөлгөөн.
 *
 * Зочин урих (ezenUrisanMashin) нь АмарСүх дээр үүсээд түрээсийн зогсоолын
 * системд бүртгэгддэг. Машин орох/гарах үед tureesBack webhook-оор мэдэгдэж,
 * бүх мэдээлэл энд хуримтлагдана - оршин суугч апп дээрээ, ажилтан вэб дээрээ
 * харах эх сурвалж нь энэ коллекци.
 */
const zochinZogsooliinTuukhSchema = new Schema(
  {
    /** АмарСүх талын урилга (ezenUrisanMashin._id) */
    urilgiinId: { type: String, required: true, index: true },
    /** Түрээс талын session (Uilchluulegch._id) - идемпотент түлхүүр */
    uilchluulegchId: { type: String, required: true },

    baiguullagiinId: { type: String, required: true },
    barilgiinId: String,
    orshinSuugchId: String,
    gereeniiId: String,
    toot: String,

    mashiniiDugaar: { type: String, required: true },

    /** Түрээс талын зогсоол ба хаалганууд */
    zogsooliinId: String,
    orsonKhaalga: String,
    garsanKhaalga: String,

    orsonTsag: Date,
    garsanTsag: Date,
    /** Минутаар */
    niitKhugatsaa: Number,

    uneguiMinutAshiglasan: Number,
    uneguiMinutUldsen: Number,

    /** Гарах үед бодогдсон төлөх дүн */
    tulukhDun: { type: Number, default: 0 },
    niitDun: { type: Number, default: 0 },

    /** "zochin" - зочин зогсоол дээр төлнө, "ezen" - эзний нэхэмжлэхэд */
    tulburiinTurul: {
      type: String,
      enum: ["zochin", "ezen"],
      default: "zochin",
    },

    /** Эзний нэхэмжлэхэд бичсэн авлагын бичилт (guilgeeAvlaguud._id) */
    guilgeeniiId: String,
    nekhemjlekhId: String,

    /** 1-зогсоол дээр, 2-гарсан */
    tuluv: { type: Number, default: 1 },
  },
  { timestamps: true }
);

/* ─── ИНДЕКС: НЭГ МӨР = НЭГ ЗОЧЛОЛТ ────────────────────────────────────────
 *
 * Өмнө нь `{baiguullagiinId, uilchluulegchId}` дээр UNIQUE индекс байв.
 * Гэтэл `uilchluulegchId` нь түрээс талын `Uilchluulegch._id` — тэр нь
 * МАШИН тутамд НЭГ бичлэг бөгөөд зочлолт бүрийг дотроо `tuukh[].tsagiinTuukh[]`
 * массивт хуримтлуулдаг. Өөрөөр хэлбэл ИЖИЛ машины бүх зочлолт ижил
 * `uilchluulegchId`-тай ирдэг.
 *
 * Үүний улмаас:
 *   • хоёр дахь зочлолт эхнийхийг нь ДАРЖ бичиж, түүх алга болдог;
 *   • орох үед `garsanTsag` цэвэрлэгддэггүй тул `dotor = !garsanTsag` нь
 *     худал болж, зогсоол дээр байгаа машин «гарсан» гэж харагддаг;
 *   • `guilgeeniiId` нь өмнөх зочлолтоос үлддэг тул ХОЁР ДАХЬ зочлолт
 *     хэзээ ч нэхэмжлэгддэггүй.
 *
 * Одоо зочлолт бүр ТУСДАА мөр болно. Unique индекс байхгүй — давхардлаас
 * `zochinZogsoolRoute`-ийн нээлттэй мөр хайх логик хамгаална (replay ирвэл
 * нээлттэй/ижил `orsonTsag`-тай мөрөө олж шинэчилнэ, шинээр үүсгэхгүй).
 *
 * ХУУЧИН UNIQUE ИНДЕКСИЙГ ГАРААР УСТГАНА:
 *   node scripts/zochinTuukhIndexZasvar.js --apply
 */
zochinZogsooliinTuukhSchema.index({
  baiguullagiinId: 1,
  uilchluulegchId: 1,
  orsonTsag: -1,
});
zochinZogsooliinTuukhSchema.index({ orshinSuugchId: 1, createdAt: -1 });
zochinZogsooliinTuukhSchema.index({ gereeniiId: 1, createdAt: -1 });

module.exports = function (conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  return conn.kholbolt.model(
    "zochinZogsooliinTuukh",
    zochinZogsooliinTuukhSchema
  );
};
