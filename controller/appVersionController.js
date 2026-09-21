const asyncHandler = require("express-async-handler");
const AppVersion = require("../models/appVersion");
const {
  sonorduulgaKhuleelguiTaraaya,
} = require("../utils/sonorduulga");

exports.getVersion = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { platform } = req.query;

    if (!platform) {
      return res.status(400).json({
        success: false,
        message: "Платформ заавал шаардлагатай! (android эсвэл ios)",
      });
    }

    const versionInfo = await AppVersion(db.erunkhiiKholbolt).findOne({
      platform: platform.toLowerCase(),
    });

    if (!versionInfo) {
      return res.status(404).json({
        success: false,
        message: "Тухайн платформд тохирох хувилбарын мэдээлэл олдсонгүй!",
      });
    }

    res.status(200).json({
      success: true,
      data: versionInfo,
    });
  } catch (error) {
    next(error);
  }
});

exports.upsertVersion = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { platform, version, minVersion, isForceUpdate, updateUrl, message } =
      req.body;

    if (!platform || !version || !minVersion) {
      return res.status(400).json({
        success: false,
        message: "Платформ, хувилбар, доод хувилбар заавал шаардлагатай!",
      });
    }

    // Хувилбар ҮНЭХЭЭР өөрчлөгдсөн эсэхийг мэдэхийн тулд хуучныг уншина.
    // Мессеж/URL зэргийг засах бүрд бүх хэрэглэгч рүү push явуулах нь
    // спам болно — зөвхөн шинэ хувилбар зарлагдсан үед мэдэгдэнэ.
    const khuuchin = await AppVersion(db.erunkhiiKholbolt)
      .findOne({ platform: platform.toLowerCase() })
      .lean();

    const versionInfo = await AppVersion(db.erunkhiiKholbolt).findOneAndUpdate(
      { platform: platform.toLowerCase() },
      {
        version,
        minVersion,
        isForceUpdate,
        updateUrl,
        message,
      },
      { upsert: true, new: true }
    );

    const shineKhuvilbarEsekh =
      !khuuchin || String(khuuchin.version) !== String(version);

    if (shineKhuvilbarEsekh) {
      // Аппын хувилбар нь платформын хэмжээнд зарлагддаг тул
      // `baiguullagiinId` дамжуулахгүй — БҮХ хэрэглэгч рүү явна.
      sonorduulgaKhuleelguiTaraaya({
        erunkhiiKholbolt: db.erunkhiiKholbolt,
        title: "Аппын шинэчлэлт",
        body:
          message ||
          `Шинэ хувилбар (${version}) гарлаа. Аппаа шинэчилнэ үү.`,
        turul: "app_update",
        dataNemelt: {
          platform: String(platform).toLowerCase(),
          version: String(version),
          isForceUpdate: String(!!isForceUpdate),
          ...(updateUrl ? { updateUrl: String(updateUrl) } : {}),
        },
        io: req.app.get("socketio"),
        socketEvent: "appVersionShine",
        socketData: { platform: String(platform).toLowerCase(), version },
      });
    }

    res.status(200).json({
      success: true,
      data: versionInfo,
      sonorduulsanEsekh: shineKhuvilbarEsekh,
    });
  } catch (error) {
    next(error);
  }
});
