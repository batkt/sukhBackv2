const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const schema = new Schema(
  {
    ip: String, // Camera IP that was opened
    barilgiinId: String, // Building ID
    baiguullagiinId: String, // Org ID
    orshinSuugchiinId: String, // Resident ID
    orshinSuugchiinNer: String, // Resident Name
    toot: String, // Resident apartment / door number
    utas: String, // Resident phone number
    mashiniiDugaar: String, // Car plate number
    turul: { type: String, enum: ["нээсэн", "урьсан"], default: "нээсэн" },
    ezenNer: String,   // for урьсан: name of the resident who invited
    ezenToot: String,  // for урьсан: toot of the inviting resident
  },
  {
    timestamps: true,
  },
);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("khaalgaNeeyeTuukh", schema);
};
