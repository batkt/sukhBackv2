const express = require("express");
const router = express.Router();
const { db } = require("zevbackv2");
const jwt = require("jsonwebtoken");
const KhaalgaNeeyeTuukh = require("../models/khaalgaNeeyeTuukh");
const Ajiltan = require("../models/ajiltan");
const OrshinSuugch = require("../models/orshinSuugch");

/**
 * Remote Gate Open Route
 * When called, it emits a socket event to the local gate worker and logs the action.
 * Path: GET /neeye/:ip
 */
router.get("/neeye/:ip", async (req, res) => {
  try {
    const { ip } = req.params;
    const barilgiinId = req.query.barilgiinId;
    const mashiniiDugaar = req.query.mashiniiDugaar || "";

    if (!barilgiinId) {
      console.warn(`[Gate] neeye called for ${ip} but barilgiinId is missing`);
      return res.status(400).json({ aldaa: "barilgiinId missing" });
    }

    const io = req.app.get("socketio");
    if (!io) {
      return res.status(500).json({ aldaa: "Socket.io not initialized" });
    }

    console.log(
      `🚀 [Gate] Triggering remote open for Building: ${barilgiinId}, Camera: ${ip}`,
    );

    // Emit to the specific building room
    io.to(`gate-room-${barilgiinId}`).emit("execute-open", { ip });

    // 1. Decode JWT and resolve the resident (orshinSuugch) who opened the gate.
    //    Only resident-initiated opens are recorded as history.
    //    Opens triggered by staff (ajiltan) or the system (no token / zochin)
    //    are NOT logged.
    let orshinSuugch = null;

    if (req.headers.authorization) {
      const token = req.headers.authorization.split(" ")[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.APP_SECRET);
          if (decoded && decoded.id && decoded.id !== "zochin") {
            // If the token belongs to a staff member, skip logging entirely.
            const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
              .findById(decoded.id)
              .select("_id")
              .lean();

            if (!ajiltan) {
              // Not staff -> try resident
              orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
                .findById(decoded.id)
                .select("ner utas toot toots baiguullagiinId")
                .lean();
            }
          }
        } catch (jwtErr) {
          console.warn(
            "[Gate] JWT verification failed in neeyeRoute:",
            jwtErr.message,
          );
        }
      }
    }

    // 2. Save gate open log ONLY for residents (orshinSuugch).
    if (orshinSuugch) {
      try {
        // Resolve the toot for this building if a toots array is present.
        let toot = orshinSuugch.toot || "";
        if (Array.isArray(orshinSuugch.toots) && orshinSuugch.toots.length) {
          const matched =
            orshinSuugch.toots.find((t) => t?.barilgiinId === barilgiinId) ||
            orshinSuugch.toots[0];
          toot = matched?.toot || toot;
        }

        const KhaalgaNeeyeTuukhModel = KhaalgaNeeyeTuukh(db.erunkhiiKholbolt);
        const log = new KhaalgaNeeyeTuukhModel({
          ip,
          barilgiinId,
          baiguullagiinId: orshinSuugch.baiguullagiinId || "",
          orshinSuugchiinId: orshinSuugch._id?.toString(),
          orshinSuugchiinNer: orshinSuugch.ner || "",
          toot,
          utas: orshinSuugch.utas || "",
          mashiniiDugaar,
          turul: "нээсэн",
        });
        await log.save();
        console.log(
          `[Gate] Log saved: Resident: ${orshinSuugch.ner}, Toot: ${toot}, Plate: ${mashiniiDugaar}, IP: ${ip}`,
        );
      } catch (dbErr) {
        console.error("[Gate] Failed to save open gate log:", dbErr);
      }
    }

    res.json({
      status: "Amjilttai",
      message: "Open command sent to local worker",
    });
  } catch (error) {
    console.error("[Gate] neeye error:", error);
    res.status(500).json({ aldaa: "Internal server error" });
  }
});

/**
 * Gate Open History Route
 * Path: GET /khaalgaNeeyeTuukh
 */
router.get("/khaalgaNeeyeTuukh", async (req, res, next) => {
  try {
    const { barilgiinId, baiguullagiinId, start, end, searchUtga } = req.query;
    const page = parseInt(req.query.khuudasniiDugaar) || 1;
    const limit = parseInt(req.query.khuudasniiKhemjee) || 10;

    const query = {};
    if (barilgiinId) query.barilgiinId = barilgiinId;
    if (baiguullagiinId) query.baiguullagiinId = baiguullagiinId;

    if (start || end) {
      query.createdAt = {};
      if (start) {
        query.createdAt.$gte = new Date(`${start} 00:00:00`);
      }
      if (end) {
        query.createdAt.$lte = new Date(`${end} 23:59:59`);
      }
    }

    if (searchUtga) {
      query.$or = [
        { mashiniiDugaar: { $regex: searchUtga, $options: "i" } },
        { orshinSuugchiinNer: { $regex: searchUtga, $options: "i" } },
        { toot: { $regex: searchUtga, $options: "i" } },
        { utas: { $regex: searchUtga, $options: "i" } },
        { ip: { $regex: searchUtga, $options: "i" } },
      ];
    }

    const KhaalgaNeeyeTuukhModel = KhaalgaNeeyeTuukh(db.erunkhiiKholbolt);

    const list = await KhaalgaNeeyeTuukhModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await KhaalgaNeeyeTuukhModel.countDocuments(query);

    res.json({
      success: true,
      jagsaalt: list,
      data: list,
      niitMur: total,
      total,
    });
  } catch (error) {
    console.error("[Gate] khaalgaNeeyeTuukh error:", error);
    next(error);
  }
});

module.exports = router;
