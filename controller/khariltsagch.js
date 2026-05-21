const asyncHandler = require("express-async-handler");
const khariltsagch = require("../models/khariltsagch");
const Geree = require("../models/geree");
const aldaa = require("../components/aldaa");
const { db } = require("zevbackv2");

// Delete khariltsagch
exports.khariltsagchUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const khariltsagchModel = khariltsagch(db.erunkhiiKholbolt);
    const deleted = await khariltsagchModel.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Олдсонгүй" });
    }
    res.json({ success: true, message: "Амжилттай устгагдлаа" });
  } catch (error) {
    next(error);
  }
});

// Remove specific toot from khariltsagch
exports.khariltsagchTootUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { id, baiguullagiinId, barilgiinId, toot } = req.body;
    const khariltsagchModel = khariltsagch(db.erunkhiiKholbolt);
    
    const user = await khariltsagchModel.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "Олдсонгүй" });
    }

    if (user.toots && user.toots.length > 0) {
      user.toots = user.toots.filter((t) => {
        return !(
          t.baiguullagiinId === baiguullagiinId &&
          t.barilgiinId === barilgiinId &&
          t.toot === toot
        );
      });
      await user.save();
    }
    
    res.json({ success: true, message: "Амжилттай хаслаа" });
  } catch (error) {
    next(error);
  }
});

exports.updateDavkharWithToot = async function (baiguullaga, barilgiinId, davkhar, toot, kholbolt) {};

exports.syncResidentContracts = async function (resident, baiguullaga, kholbolt, req) {};

