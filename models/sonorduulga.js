const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const sonorduulgaSchema = new Schema(
  {
    id: String,
    ognoo: Date,
    ajiltniiId: String,
    orshinSuugchiinGereeniiDugaar: String,
    orshinSuugchiinTalbainDugaar: String,
    orshinSuugchiinId: String,
    orshinSuugchiinNer: String,
    orshinSuugchiinUtas: String,
    orshinSuugchiinRegister: String,
    baiguullagiinId: String,
    khuleenAvagchiinId: String,
    zurgiinId: String,
    barilgiinId: String,
    turul: String,
    duudlagiinTurul: String,
    title: String,
    message: String,
    kharsanEsekh: Boolean,
    object: Schema.Types.Mixed,
    dakhijKharikhEsekh: Boolean,
    adminMedegdelId: String,
    tuluv: Number,
    tailbar: String,
    dakhijKharakhguiAjiltniiIdnuud: [String],
    zurag: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("sonorduulga", sonorduulgaSchema);
};
//module.exports = mongoose.model("sonorduulga", sonorduulgaSchema);
