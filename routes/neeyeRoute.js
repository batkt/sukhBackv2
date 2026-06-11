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
 * Gate Open History Stats Route
 * Path: GET /khaalgaNeeyeTuukh/stats
 */
router.get("/khaalgaNeeyeTuukh/stats", async (req, res, next) => {
  try {
    const { barilgiinId, baiguullagiinId, start, end } = req.query;

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

    const KhaalgaNeeyeTuukhModel = KhaalgaNeeyeTuukh(db.erunkhiiKholbolt);

    // 1. Overall counts
    const counts = await KhaalgaNeeyeTuukhModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$turul",
          count: { $sum: 1 }
        }
      }
    ]);

    let totalCount = 0;
    let urisanCount = 0;
    let neesenCount = 0;

    counts.forEach(c => {
      totalCount += c.count;
      if (c._id === "урьсан") {
        urisanCount = c.count;
      } else {
        neesenCount += c.count;
      }
    });

    // 2. Top residents
    const topResidents = await KhaalgaNeeyeTuukhModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            id: "$orshinSuugchiinId",
            ner: "$orshinSuugchiinNer",
            toot: "$toot",
            utas: "$utas"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // 3. Top gates/camera IPs
    const topGates = await KhaalgaNeeyeTuukhModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$ip",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // 4. Daily activity
    const dailyActivity = await KhaalgaNeeyeTuukhModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+08:00" }
          },
          count: { $sum: 1 },
          urisan: {
            $sum: { $cond: [{ $eq: ["$turul", "урьсан"] }, 1, 0] }
          },
          neesen: {
            $sum: { $cond: [{ $eq: ["$turul", "нээсэн"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 15 }
    ]);

    res.json({
      success: true,
      counts: {
        total: totalCount,
        urisan: urisanCount,
        neesen: neesenCount
      },
      topResidents: topResidents
        .filter(r => r._id && (r._id.id || r._id.ner))
        .map(r => ({
          id: r._id.id || "",
          ner: r._id.ner || "Тодорхойгүй",
          toot: r._id.toot || "-",
          utas: r._id.utas || "-",
          count: r.count
        })),
      topGates: topGates
        .filter(g => g._id)
        .map(g => ({
          ip: g._id,
          count: g.count
        })),
      dailyActivity: dailyActivity.map(d => ({
        date: d._id,
        count: d.count,
        urisan: d.urisan,
        neesen: d.neesen
      }))
    });
  } catch (error) {
    console.error("[Gate] khaalgaNeeyeTuukh/stats error:", error);
    next(error);
  }
});

/**
 * Gate Open History Route
 * Path: GET /khaalgaNeeyeTuukh
 */
router.get("/khaalgaNeeyeTuukh", async (req, res, next) => {
  try {
    const { barilgiinId, baiguullagiinId, start, end, searchUtga, turul } = req.query;
    const page = parseInt(req.query.khuudasniiDugaar) || 1;
    const limit = parseInt(req.query.khuudasniiKhemjee) || 10;

    const query = {};
    if (barilgiinId) query.barilgiinId = barilgiinId;
    if (baiguullagiinId) query.baiguullagiinId = baiguullagiinId;

    if (turul && turul !== "all") {
      if (turul === "нээсэн") {
        query.turul = { $ne: "урьсан" };
      } else {
        query.turul = turul;
      }
    }

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
