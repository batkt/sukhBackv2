const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;
mongoose.pluralize(null);

const orshinSuugchMashinSchema = new Schema(
    {
    orshinSuugchiinId: String,
    baiguullagiinId: String,
    barilgiinId: String,
    zochinUrikhEsekh: Boolean,
    zochinTurul: String,
    davtamjiinTurul: String,
    mashiniiDugaar: String,
    dugaarUurchilsunOgnoo: Date,
    ezenToot: String,
    zochinTailbar: String,
    zochinErkhiinToo: Number,
    zochinTusBurUneguiMinut: Number,
    zochinNiitUneguiMinut: Number,
    davtamjUtga: Number,
    utas: String
    },
    {timestamps: true}
)

module.exports = function a(conn) {
if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("orshinSuugchMashin", orshinSuugchMashinSchema);
};