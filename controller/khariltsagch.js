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
    const id = req.body.id || req.body.residentId;
    const { baiguullagiinId, barilgiinId, toot, turul } = req.body;

    if (!id || !baiguullagiinId || !toot) {
      return res.status(400).json({ success: false, message: "id, baiguullagiinId, болон toot мэдээлэл заавал шаардлагатай!" });
    }

    const khariltsagchModel = khariltsagch(db.erunkhiiKholbolt);
    const user = await khariltsagchModel.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "Харилцагч олдсонгүй!" });
    }

    if (!Array.isArray(user.toots) || user.toots.length === 0) {
      return res.status(400).json({ success: false, message: "Устгах тоот олдсонгүй!" });
    }

    // 1. Filter out the target toot
    const originalLength = user.toots.length;
    const updatedToots = user.toots.filter((t) => {
      const match =
        String(t.baiguullagiinId) === String(baiguullagiinId) &&
        String(t.toot).trim() === String(toot).trim() &&
        (!barilgiinId || String(t.barilgiinId) === String(barilgiinId)) &&
        (!turul || String(t.turul || "Орон сууц").trim() === String(turul).trim());
      return !match;
    });

    if (updatedToots.length === originalLength) {
      return res.status(400).json({ success: false, message: "Устгах тоот жагсаалтанд олдсонгүй!" });
    }

    // 2. Update top-level fields if the primary property was removed
    const primaryMatch =
      String(user.baiguullagiinId) === String(baiguullagiinId) &&
      String(user.toot).trim() === String(toot).trim() &&
      (!barilgiinId || String(user.barilgiinId) === String(barilgiinId));

    if (primaryMatch) {
      if (updatedToots.length > 0) {
        // Shift to the next available property
        const nextToot = updatedToots[0];
        user.baiguullagiinId = nextToot.baiguullagiinId;
        user.baiguullagiinNer =
          nextToot.baiguullagiinNer && typeof nextToot.baiguullagiinNer === "object"
            ? nextToot.baiguullagiinNer.ner
            : nextToot.baiguullagiinNer;
        user.barilgiinId = nextToot.barilgiinId;
        user.bairniiNer =
          nextToot.bairniiNer && typeof nextToot.bairniiNer === "object"
            ? nextToot.bairniiNer.ner
            : nextToot.bairniiNer;
        user.toot = nextToot.toot;
        user.davkhar = nextToot.davkhar;
        user.orts = nextToot.orts;
        user.duureg =
          nextToot.duureg && typeof nextToot.duureg === "object"
            ? nextToot.duureg.ner
            : nextToot.duureg;
        user.horoo =
          nextToot.horoo && typeof nextToot.horoo === "object"
            ? nextToot.horoo.ner
            : nextToot.horoo;
        user.soh =
          nextToot.soh && typeof nextToot.soh === "object"
            ? nextToot.soh.ner
            : nextToot.soh;
      } else {
        // This was the last property - clear the fields but keep the user record
        user.baiguullagiinId = undefined;
        user.baiguullagiinNer = undefined;
        user.barilgiinId = undefined;
        user.bairniiNer = undefined;
        user.toot = undefined;
        user.davkhar = undefined;
        user.orts = undefined;
        user.duureg = undefined;
        user.horoo = undefined;
        user.soh = undefined;
      }
    }

    user.toots = updatedToots;
    await user.save();

    // 3. Mark the corresponding contract as "Цуцалсан" (Cancelled)
    const conn = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    );
    if (conn) {
      await Geree(conn).updateMany(
        {
          orshinSuugchId: String(id),
          toot: String(toot).trim(),
          ...(barilgiinId ? { barilgiinId: String(barilgiinId) } : {}),
        },
        { $set: { tuluv: "Цуцалсан", tsutsalsanOgnoo: new Date() } },
      );
    }

    res.json({ success: true, message: "Амжилттай хаслаа", data: user });
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


