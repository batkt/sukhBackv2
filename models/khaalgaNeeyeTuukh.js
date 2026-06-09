const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const schema = new Schema({
  ip: String,               // Camera IP that was opened
  barilgiinId: String,      // Building ID
  baiguullagiinId: String,  // Org ID
  ajiltniiId: String,       // Staff ID
  ajiltniiNer: String,      // Staff Name
  mashiniiDugaar: String,   // Car plate number
}, {
  timestamps: true
});

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("khaalgaNeeyeTuukh", schema);
};
