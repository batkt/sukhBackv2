const express = require("express");
const router = express.Router();

/**
 * Remote Gate Open Route
 * When called, it emits a socket event to the local gate worker.
 * Path: GET /neeye/:ip
 */
router.get("/neeye/:ip", async (req, res) => {
  try {
    const { ip } = req.params;
    const barilgiinId = req.query.barilgiinId;

    if (!barilgiinId) {
      console.warn(`[Gate] neeye called for ${ip} but barilgiinId is missing`);
      return res.status(400).json({ aldaa: "barilgiinId missing" });
    }

    const io = req.app.get("socketio");
    if (!io) {
      return res.status(500).json({ aldaa: "Socket.io not initialized" });
    }

    console.log(`🚀 [Gate] Triggering remote open for Building: ${barilgiinId}, Camera: ${ip}`);

    // Emit to the specific building room
    io.to(`gate-room-${barilgiinId}`).emit("execute-open", { ip });

    res.json({ status: "Amjilttai", message: "Open command sent to local worker" });
  } catch (error) {
    console.error("[Gate] neeye error:", error);
    res.status(500).json({ aldaa: "Internal server error" });
  }
});

module.exports = router;
