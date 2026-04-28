const asyncHandler = require("express-async-handler");
const AppVersion = require("../models/appVersion");

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

    res.status(200).json({
      success: true,
      data: versionInfo,
    });
  } catch (error) {
    next(error);
  }
});
