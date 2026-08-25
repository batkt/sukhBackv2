const express = require("express");
const router = express.Router();
const { db } = require("zevbackv2");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pubClient, subClient } = require("../utils/redisClient");
const KhaalgaNeeyeTuukh = require("../models/khaalgaNeeyeTuukh");
const Ajiltan = require("../models/ajiltan");
const OrshinSuugch = require("../models/orshinSuugch");
const ZochinZogsooliinTuukh = require("../models/zochinZogsooliinTuukh");
const {
  getKholboltByBaiguullagiinId,
} = require("../utils/dbConnection");

/**
 * ParkEase (Түрээсийн зогсоол) дээр бүртгэгдсэн зочдыг хаалганы түүхийн
 * мөр болгон хөрвүүлэх.
 *
 * ЯАГААД: "урьсан" мөрийг АмарСүхийн ӨӨРИЙН хаалга (parkingRoute → sdkData)
 * бичдэг. ParkEase дээр зогссон зочин АмарСүхийн sdkData-г огт дайрдаггүй
 * тул энэ хөрвүүлэлтгүйгээр тэд жагсаалтад ХЭЗЭЭ Ч гарахгүй.
 *
 * Хэзээ ч throw хийхгүй - ParkEase тал унасан ч хаалганы түүх гарна.
 */
async function parkEaseMuruudAvya({
  baiguullagiinId,
  barilgiinId,
  start,
  end,
  searchUtga,
}) {
  try {
    if (!baiguullagiinId) return [];

    const kholbolt =
      getKholboltByBaiguullagiinId(baiguullagiinId) || db.erunkhiiKholbolt;

    const query = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) query.barilgiinId = String(barilgiinId);

    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = new Date(`${start} 00:00:00`);
      if (end) query.createdAt.$lte = new Date(`${end} 23:59:59`);
    }

    // searchUtga-г ЭНД шүүхгүй. Хайлт нь нэр/утсаар ч явдаг ба тэдгээр нь
    // энэ коллекцид байхгүй (оршин суугчийн бүртгэлээс ирнэ) - Mongo дээр
    // шүүвэл утсаар хайхад зочны мөр огт олдохгүй. Оршин суугчийг
    // тодорхойлсны ДАРАА дуудагч тал санах ойд шүүнэ.

    const muruud = await ZochinZogsooliinTuukh(kholbolt)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(3000)
      .lean();

    if (!muruud.length) return [];

    // Оршин суугчийн нэр/утсыг нэг дор татна - мөр бүрээр асуувал удаана
    const suugchIdnuud = [
      ...new Set(muruud.map((m) => m.orshinSuugchId).filter(Boolean)),
    ];
    const suugchid = suugchIdnuud.length
      ? await OrshinSuugch(db.erunkhiiKholbolt)
          .find({ _id: { $in: suugchIdnuud } })
          .select("ner utas toot toots")
          .lean()
      : [];
    const suugchMap = new Map(suugchid.map((s) => [String(s._id), s]));

    return muruud.map((mur) => {
      const suugch = suugchMap.get(String(mur.orshinSuugchId || ""));
      const utas = Array.isArray(suugch?.utas) ? suugch.utas[0] : suugch?.utas;

      return {
        // Хаалганы түүхийн _id-тэй давхцахгүйн тулд угтвар нэмнэ
        _id: `parkease-${mur._id}`,
        ip: mur.orsonKhaalga || mur.garsanKhaalga || "",
        barilgiinId: mur.barilgiinId,
        baiguullagiinId: mur.baiguullagiinId,
        orshinSuugchiinId: mur.orshinSuugchId,
        orshinSuugchiinNer: suugch?.ner || "",
        toot: mur.toot || suugch?.toot || "",
        utas: utas || "",
        mashiniiDugaar: mur.mashiniiDugaar,
        turul: "урьсан",
        ekhSurvalj: "parkease",
        createdAt: mur.orsonTsag || mur.createdAt,
        updatedAt: mur.updatedAt,
        // Вэб дээр дэлгэрэнгүй харуулахад бэлэн
        parkease: {
          urilgiinId: mur.urilgiinId,
          orsonTsag: mur.orsonTsag,
          garsanTsag: mur.garsanTsag,
          orsonKhaalga: mur.orsonKhaalga,
          garsanKhaalga: mur.garsanKhaalga,
          niitKhugatsaa: mur.niitKhugatsaa,
          uneguiMinutAshiglasan: mur.uneguiMinutAshiglasan,
          uneguiMinutUldsen: mur.uneguiMinutUldsen,
          tulburiinTurul: mur.tulburiinTurul,
          tulukhDun: mur.tulukhDun,
          niitDun: mur.niitDun,
          nekhemjlekhId: mur.nekhemjlekhId,
          tuluv: mur.tuluv,
        },
      };
    });
  } catch (err) {
    console.error("[Gate] ParkEase мөр уншихад алдаа:", err.message);
    return [];
  }
}

// Tracks GET /neeye requests waiting on a real result from the local gate
// worker. Process-local, so (same as webrtc signaling in cameraRoute.js) a
// Redis pub/sub relay bridges PM2 cluster workers: whichever worker actually
// holds the gate worker's socket publishes the result, and every worker
// checks its own local map - only the one actually waiting resolves it.
const pendingGateCommands = new Map();
const GATE_RESULT_CHANNEL = "gate:execute-open-result";

function resolveGateCommandLocally({ commandId, success, error }) {
  const pending = pendingGateCommands.get(commandId);
  if (!pending) return; // Not ours (or already resolved) - normal in cluster mode.
  clearTimeout(pending.timeout);
  pendingGateCommands.delete(commandId);
  pending.resolve({ success, error });
}

let gateResultSubscribed = false;
function ensureGateResultSubscribed() {
  if (gateResultSubscribed) return;
  gateResultSubscribed = true;
  subClient
    .subscribe(GATE_RESULT_CHANNEL, (message) => {
      try {
        resolveGateCommandLocally(JSON.parse(message));
      } catch (err) {
        console.error("[Gate] Failed to parse execute-open-result pub/sub message:", err.message);
      }
    })
    .catch((err) => {
      gateResultSubscribed = false;
      console.error("[Gate] Redis subscribe failed - cross-worker gate acks disabled:", err.message);
    });
}
ensureGateResultSubscribed();

/**
 * Remote Gate Open Route
 * Sends "execute-open" to the local gate worker and waits for its real
 * success/failure result instead of assuming success. Logs land here on the
 * server (visible via `pm2 logs` / your log aggregator) so a failure is
 * diagnosable without needing access to the on-site PC.
 * Path: GET /neeye/:ip
 */
router.get("/neeye/:ip", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { ip } = req.params;
    const barilgiinId = req.query.barilgiinId;
    const mashiniiDugaar = req.query.mashiniiDugaar || "";
    const plateLog = mashiniiDugaar || "-";

    if (!barilgiinId) {
      console.warn(`[Gate] ⚠️ neeye called ip=${ip} plate=${plateLog} but barilgiinId is missing`);
      return res.status(400).json({ aldaa: "barilgiinId missing" });
    }

    const io = req.app.get("socketio");
    if (!io) {
      return res.status(500).json({ aldaa: "Socket.io not initialized" });
    }

    // 1. Decode JWT and resolve the resident (orshinSuugch) who opened the gate.
    //    Only resident-initiated opens are recorded as history, and a resident
    //    without permission is denied HERE, before any command is sent - not
    //    after, so a denied resident can never trigger the physical gate.
    //    Opens triggered by staff (ajiltan) or the system (no token / zochin)
    //    are NOT logged and skip the permission check below.
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

              if (orshinSuugch) {
                // Fetch organization settings to check if resident gate open is allowed
                const Baiguullaga = require("../models/baiguullaga");
                const org = await Baiguullaga(db.erunkhiiKholbolt)
                  .findById(orshinSuugch.baiguullagiinId)
                  .select("tokhirgoo barilguud")
                  .lean();

                let allowed = false;
                if (org) {
                  const targetBarilga = org.barilguud?.find(
                    (b) => String(b._id) === String(barilgiinId)
                  );
                  const bSetting = targetBarilga?.tokhirgoo?.orshinSuugchKhaalgaNeehEsekh;
                  const oSetting = org.tokhirgoo?.orshinSuugchKhaalgaNeehEsekh;

                  if (bSetting !== undefined && bSetting !== null) {
                    allowed = !!bSetting;
                  } else {
                    allowed = !!oSetting;
                  }
                }

                if (!allowed) {
                  console.warn(`[Gate] Gate open denied for resident ${orshinSuugch.ner} - permission disabled`);
                  return res.status(403).json({ aldaa: "Оршин суугч хаалга нээх эрхгүй байна" });
                }
              }
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

    // 2. Is a gate worker even connected for this building? Fail fast and
    //    say so plainly instead of pretending the command was sent.
    const roomName = `gate-room-${barilgiinId}`;
    const room = io.sockets.adapter.rooms.get(roomName);
    const roomSize = room ? room.size : 0;

    console.log(
      `[Gate] OPEN request ip=${ip} plate=${plateLog} barilgiinId=${barilgiinId} workers=${roomSize}`,
    );

    if (roomSize === 0) {
      console.warn(`[Gate] ⚠️ no gate worker connected for building ${barilgiinId} — command not sent`);
      return res.status(503).json({ aldaa: "Локал төхөөрөмж холбогдоогүй байна" });
    }

    // 3. Send the command and wait for the worker's real result. A worker
    //    that never replies (crashed, SDK hung) must not hang this request
    //    forever, hence the timeout.
    const commandId = uuidv4();
    const waitForResult = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingGateCommands.delete(commandId);
        resolve({ success: false, error: "timeout" });
      }, 8000);
      pendingGateCommands.set(commandId, { resolve, timeout });
    });

    io.to(roomName).emit("execute-open", { ip, plate: mashiniiDugaar, commandId });

    const result = await waitForResult;
    const latencyMs = Date.now() - startedAt;

    if (result.success) {
      console.log(`[Gate] ✅ opened ip=${ip} plate=${plateLog} latency=${latencyMs}ms`);
    } else {
      console.error(
        `[Gate] ❌ failed ip=${ip} plate=${plateLog} reason=${result.error || "unknown"} latency=${latencyMs}ms`,
      );
    }

    // 4. Save gate open log ONLY for residents (orshinSuugch).
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

    if (result.success) {
      return res.json({ status: "Amjilttai", message: "Gate opened" });
    }
    return res
      .status(502)
      .json({ aldaa: "Хаалга нээгдсэнгүй", reason: result.error || "unknown" });
  } catch (error) {
    console.error("[Gate] neeye error:", error);
    res.status(500).json({ aldaa: "Internal server error" });
  }
});

router.handleExecuteOpenResult = (data) => {
  // Resolve immediately if the waiting request is on this same process, and
  // always publish so the worker actually waiting (if it's a different PM2
  // process) can pick it up too.
  resolveGateCommandLocally(data);
  pubClient.publish(GATE_RESULT_CHANNEL, JSON.stringify(data)).catch((err) => {
    console.error("[Gate] Redis publish failed for execute-open-result:", err.message);
  });
};

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

    // Хүснэгтэд ParkEase мөрүүд гарч байгаа тул тоололтод ч оруулна -
    // эс тэгвэл "Нийт хандалт" мөрийн тоотой таарахгүй
    const parkEaseMuruud = await parkEaseMuruudAvya({
      baiguullagiinId,
      barilgiinId,
      start,
      end,
    });
    totalCount += parkEaseMuruud.length;
    urisanCount += parkEaseMuruud.length;

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
      if (turul === "urisan") {
        query.turul = "урьсан";
      } else if (turul === "neesen") {
        query.turul = { $ne: "урьсан" };
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

    // ParkEase дээр зогссон зочид өөр коллекцид байдаг тул хоёуланг нийлүүлж
    // огноогоор эрэмбэлээд ДАРАА нь хуудаслана. Мongo дээр skip/limit тавьвал
    // хоёр эх сурвалжийн мөрүүд хоорондоо холилдохгүй.
    const parkEaseKhereg = !turul || turul === "all" || turul === "urisan";
    const [buhList, parkEaseMuruud] = await Promise.all([
      KhaalgaNeeyeTuukhModel.find(query)
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean(),
      parkEaseKhereg
        ? parkEaseMuruudAvya({
            baiguullagiinId,
            barilgiinId,
            start,
            end,
            searchUtga,
          })
        : Promise.resolve([]),
    ]);

    // searchUtga нь нэр/утсаар ч хайдаг - ParkEase мөрийн нэр/утас нь
    // оршин суугчийн бүртгэлээс ирдэг тул энд дахин шүүнэ
    const shuusenParkEase = searchUtga
      ? parkEaseMuruud.filter((m) =>
          [m.mashiniiDugaar, m.orshinSuugchiinNer, m.toot, m.utas, m.ip]
            .filter(Boolean)
            .some((utga) =>
              String(utga).toLowerCase().includes(String(searchUtga).toLowerCase()),
            ),
        )
      : parkEaseMuruud;

    const niiluulsen = [...buhList, ...shuusenParkEase].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    const total = niiluulsen.length;
    const list = niiluulsen.slice((page - 1) * limit, page * limit);

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
