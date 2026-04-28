const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const easyRegisterUserSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,

    // Consumer (Mongolian citizen) fields
    regNo: String, // Регистрийн дугаар
    loginName: String, // E-barimt login name (8-digit customer code)
    givenName: String, // Нэр
    familyName: String, // Овог
    email: String, // Цахим шуудан

    // Foreigner fields
    passportNo: String, // Гадаад паспортын дугаар
    fNumber: String, // F регистрийн дугаар
    country: String, // Улсын нэр
    refund: String, // Буцаан олголт авах эсэх

    // Common fields
    phoneNum: String, // Утасны дугаар
    turul: {
      type: String,
      enum: ["consumer", "foreigner"],
      default: "consumer",
    }, // Иргэн эсвэл гадаад

    // Associated contract info (optional)
    gereeniiId: String,
    gereeniiDugaar: String,
    talbainDugaar: String,
    orshinSuugchiinId: String,

    // Meta
    ustgasan: { type: Boolean, default: false },
    ustgasanOgnoo: Date,
    burtgesenAjiltniiId: String,
    burtgesenAjiltniiNer: String,
  },
  {
    timestamps: true,
  }
);

// Index for quick lookups
easyRegisterUserSchema.index({ baiguullagiinId: 1, loginName: 1 });
easyRegisterUserSchema.index({ baiguullagiinId: 1, regNo: 1 });
easyRegisterUserSchema.index({ baiguullagiinId: 1, passportNo: 1 });
easyRegisterUserSchema.index({ baiguullagiinId: 1, phoneNum: 1 });
easyRegisterUserSchema.index({ baiguullagiinId: 1, orshinSuugchiinId: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("easyRegisterUser", easyRegisterUserSchema);
};
