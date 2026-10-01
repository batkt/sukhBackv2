const mongoose = require("mongoose");

const batalgaajuulkhCodeSchema = new mongoose.Schema(
  {
    utas: {
      type: String,
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: [
        "password_reset",
        "registration",
        "login",
        "signup",
        "gishuun_urikh", // Гэр бүлийн гишүүн урих
      ],
      default: "password_reset",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    khereglesenEsekh: {
      type: Boolean,
      default: false,
    },
    khereglesenOgnoo: {
      type: Date,
      default: null,
    },
    oroldlogo: {
      type: Number,
      default: 0,
    },
    niitOroldokhErkh: {
      type: Number,
      default: 3,
    },
  },
  {
    timestamps: true,
  }
);

batalgaajuulkhCodeSchema.index({ utas: 1, purpose: 1, khereglesenEsekh: 1 });
batalgaajuulkhCodeSchema.index({ expiresAt: 1 });

batalgaajuulkhCodeSchema.statics.batalgaajuulkhCodeUusgeye = async function (
  utas,
  purpose = "password_reset",
  expirationMinutes = 10
) {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  // IMPORTANT: When creating a new code, mark all previous unused codes for the same phone and purpose as used
  // This ensures only the latest code is valid
  await this.updateMany(
    {
      utas,
      purpose,
      khereglesenEsekh: false,
      expiresAt: { $gt: new Date() }, // Only mark non-expired codes
    },
    {
      $set: {
        khereglesenEsekh: true,
        khereglesenOgnoo: new Date(),
      },
    }
  );

  const result = await this.create({
    utas,
    code,
    purpose,
    expiresAt,
  });

  return result;
};

batalgaajuulkhCodeSchema.statics.createVerificationCode =
  batalgaajuulkhCodeSchema.statics.batalgaajuulkhCodeUusgeye;

batalgaajuulkhCodeSchema.statics.verifyCode = async function (
  utas,
  code,
  purpose = "password_reset"
) {
  // Find the most recent code that matches (sort by createdAt descending)
  // This ensures we use the latest code if multiple codes exist for the same phone
  const verificationCode = await this.findOne({
    utas,
    code,
    purpose,
    khereglesenEsekh: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!verificationCode) {
    await this.buruuOroldlogoBurtgeye(utas, purpose);
    return { success: false, message: "Хүчингүй код байна!" };
  }

  if (verificationCode.oroldlogo >= verificationCode.niitOroldokhErkh) {
    return { success: false, message: "Хэт их оролдлого хийгдсэн байна!" };
  }

  verificationCode.khereglesenEsekh = true;
  verificationCode.khereglesenOgnoo = new Date();
  await verificationCode.save();

  return { success: true, message: "Амжилттай баталгаажлаа" };
};

/**
 * Буруу код оруулсан оролдлогыг тухайн утас/зорилгын ИДЭВХТЭЙ (сүүлийн) код
 * дээр бүртгэнэ. Хязгаар хэтэрвэл кодыг хүчингүй болгоно — 4 оронтой кодыг
 * 10 минутын дотор таах (brute force) боломжгүй болгоно.
 */
batalgaajuulkhCodeSchema.statics.buruuOroldlogoBurtgeye = async function (
  utas,
  purpose = "password_reset"
) {
  const idevkhtei = await this.findOne({
    utas,
    purpose,
    khereglesenEsekh: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (!idevkhtei) return null;
  idevkhtei.oroldlogo = (idevkhtei.oroldlogo || 0) + 1;
  if (idevkhtei.oroldlogo >= (idevkhtei.niitOroldokhErkh || 3)) {
    idevkhtei.khereglesenEsekh = true;
    idevkhtei.khereglesenOgnoo = new Date();
  }
  await idevkhtei.save();
  return {
    uldsen: Math.max(0, (idevkhtei.niitOroldokhErkh || 3) - idevkhtei.oroldlogo),
  };
};

batalgaajuulkhCodeSchema.statics.incrementAttempts = async function (
  utas,
  code,
  purpose = "password_reset"
) {
  const verificationCode = await this.findOne({
    utas,
    code,
    purpose,
    khereglesenEsekh: false,
  });

  if (verificationCode) {
    verificationCode.oroldlogo += 1;
    await verificationCode.save();
  }
};

batalgaajuulkhCodeSchema.statics.cleanupExpired = async function () {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
  });
  return result.deletedCount;
};

module.exports = function (conn) {
  if (!conn) {
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  }
  conn = conn.kholbolt;
  return conn.model("batalgaajuulahCode", batalgaajuulkhCodeSchema);
};
