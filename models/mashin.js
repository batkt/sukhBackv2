const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const mashinSchema = new Schema(
  {
    id: String,
    baiguullagiinId: String,
    barilgiinId: String,
    turul: String,
    tuluv: String,
    nemeltTuluv: String,
    khungulultTurul: String,
    khungulult: String,
    tsagiinTurul: String,
    khungulukhKhugatsaa: Number,
    khungulujEkhlesenOgnoo: Date,
    uldegdelKhungulukhKhugatsaa: Number,
    dugaar: String,
    temdeglel: String,
    kharJagsaalt: Boolean,
    ezemshigchiinId: String,
    ezemshigchiinNer: String,
    ezemshigchiinRegister: String,
    ezemshigchiinUtas: String,
    ezemshigchiinTalbainDugaar: String,
    gereeniiDugaar: String,
    tuukh: mongoose.Schema.Types.Mixed,
    ekhlekhOgnoo: Date,
    duusakhOgnoo: Date,
    gereeniiId: String,
    orshinSuugchiinNer: String,
    cameraIP: String,
    // Guest/Resident Vehicle Settings
    zochinUrikhEsekh: Boolean,
    zochinTurul: String, // "Оршин суугч", "Зочин", etc
    zochinErkhiinToo: Number,
    zochinTusBurUneguiMinut: Number,
    zochinNiitUneguiMinut: Number,
    zochinTailbar: String,
    davtamjiinTurul: String,
    davtamjUtga: Number,
    dugaarUurchilsunOgnoo: Date,
    ezenToot: String,
    utas: String,
    orshinSuugchiinId: String, // Alias/Reference for ezemshigchiinId
    mashiniiDugaar: String, // Alias for dugaar for backward compatibility
  },
  {
    timestamps: true,
  }
);

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(mashinSchema, "mashin");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  if(conn.models.Mashin) return conn.models.Mashin;
  return conn.model("mashin", mashinSchema);
};
//module.exports = mongoose.model("mashin", mashinSchema);
