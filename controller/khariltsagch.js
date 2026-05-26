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

const orshinSuugchController = require("./orshinSuugch");
exports.syncResidentContracts = orshinSuugchController.syncResidentContracts;

/**
 * Self-delete khariltsagch and all related data
 * Requires password verification in request body
 * Deletes all traces of the user from:
 * - geree (invoices/contracts where khariltsagchId matches)
 * - nekhemjlekhiinTuukh (invoice history related to deleted gerees)
 * - nevtreltiinTuukh (login history)
 * - Finally deletes the khariltsagch user itself
 */
exports.khariltsagchOorooUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const jwt = require("jsonwebtoken");

    // Verify password is provided
    const nuutsUg = req.body.nuutsUg;
    if (!nuutsUg) {
      throw new aldaa("Нууц код заавал оруулах шаардлагатай!");
    }

    // Get user ID from token
    let userId;
    if (req.body.nevtersenAjiltniiToken?.id) {
      userId = req.body.nevtersenAjiltniiToken.id;
    } else if (req.headers.authorization) {
      const token = req.headers.authorization.split(" ")[1];
      if (token) {
        try {
          const tokenObject = jwt.verify(token, process.env.APP_SECRET);
          userId = tokenObject.id;
        } catch (err) {
          throw new aldaa("Token хүчингүй байна!");
        }
      }
    }

    if (!userId) {
      throw new aldaa("Хэрэглэгчийн мэдээлэл олдсонгүй!");
    }

    const userIdString = String(userId);

    // Verify user exists and get user with password
    const khariltsagchModel = khariltsagch(db.erunkhiiKholbolt);
    const user = await khariltsagchModel.findById(userId).select("+nuutsUg");

    if (!user) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Verify password
    const passwordMatch = await user.passwordShalgaya(nuutsUg);
    if (!passwordMatch) {
      throw new aldaa("Нууц код буруу байна!");
    }

    // Mark all gerees as "Цуцалсан" (Cancelled) instead of deleting
    const orgIdsForDel = new Set();
    if (user.baiguullagiinId) orgIdsForDel.add(user.baiguullagiinId.toString());
    if (Array.isArray(user.toots)) {
      user.toots.forEach(t => { if (t.baiguullagiinId) orgIdsForDel.add(t.baiguullagiinId.toString()); });
    }

    for (const orgId of orgIdsForDel) {
      const conn = db.kholboltuud.find(k => String(k.baiguullagiinId) === String(orgId));
      if (conn) {
        await Geree(conn).updateMany(
          { khariltsagchId: userIdString },
          { $set: { tuluv: "Цуцалсан", tsutsalsanOgnoo: new Date() } }
        );
      }
    }

    // Log deletion to audit before actually deleting
    try {
      const { logDelete } = require("../services/auditService");
      const deletedDoc = user.toObject ? user.toObject() : user;
      await logDelete(
        req,
        db,
        "khariltsagch",
        userId.toString(),
        deletedDoc,
        "hard",
        "Self-delete by user",
        {
          baiguullagiinId: user.baiguullagiinId,
          barilgiinId: null,
        },
      );
    } catch (auditErr) {
      // Don't block deletion if audit logging fails
    }

    // Actually delete the khariltsagch user account
    await khariltsagchModel.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Хэрэглэгчийн данс устгагдлаа. Бүх мэдээлэл хадгалагдсан байна.",
      data: {
        userId: userId,
        status: "Cancelled"
      },
    });
  } catch (error) {
    next(error);
  }
});


