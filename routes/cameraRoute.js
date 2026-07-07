const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { pubClient, subClient } = require("../utils/redisClient");

// Global map to track pending WebRTC signaling requests.
// This is process-local, so in PM2 cluster mode the worker that receives the
// HTTP POST (and is awaiting the answer here) is often NOT the same worker
// holding the gate-worker's physical socket connection (whichever worker
// receives the "webrtc-answer" socket event). The Redis pub/sub relay below
// bridges that gap: every worker publishes answers it observes, and every
// worker checks its own local pendingSignaling map when a message arrives -
// only the worker that's actually waiting on that correlationId will find a
// match and resolve it.
const pendingSignaling = new Map();
const WEBRTC_ANSWER_CHANNEL = "camera:webrtc-answer";

function resolvePendingLocally({ correlationId, sdpAnswer, error }) {
  const pending = pendingSignaling.get(correlationId);
  if (!pending) return; // Not ours (or already resolved) - normal in cluster mode.

  clearTimeout(pending.timeout);
  pendingSignaling.delete(correlationId);
  if (!error) pending.resolve(sdpAnswer);
}

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  subClient
    .subscribe(WEBRTC_ANSWER_CHANNEL, (message) => {
      try {
        resolvePendingLocally(JSON.parse(message));
      } catch (err) {
        console.error("[Camera] Failed to parse webrtc-answer pub/sub message:", err.message);
      }
    })
    .catch((err) => {
      subscribed = false;
      console.error(
        "[Camera] Redis subscribe failed - cross-worker signaling disabled, only same-process answers will work:",
        err.message,
      );
    });
}
ensureSubscribed();

/**
 * WebRTC Signaling Route
 * Bridges the browser's SDP offer to the local PC worker via Socket.io
 * Now uses a path parameter for barilgiinId to avoid query string issues.
 */
router.post("/camera/stream/:barilgiinId/stream", async (req, res) => {
  const { rtsp, url, sdp64: sdp64Body, data: dataField } = req.body;
  const { barilgiinId } = req.params;
  const rtspUrl = rtsp || url;
  const sdp64 = sdp64Body || dataField;

  if (!barilgiinId) {
    return res.status(400).json({ error: "barilgiinId is required" });
  }

  if (!rtspUrl || !sdp64) {
    return res.status(400).json({ error: "RTSP URL and SDP are required" });
  }

  const io = req.app.get("socketio");
  if (!io) {
    return res.status(500).json({ error: "Socket.io not initialized" });
  }

  const correlationId = uuidv4();
  const roomName = `gate-room-${barilgiinId}`;

  // With the Socket.IO Redis adapter attached, `adapter.rooms` reflects room
  // membership across every cluster worker, not just this process - so this
  // check is accurate even when the actual gate-worker socket lives elsewhere.
  const room = io.sockets.adapter.rooms.get(roomName);
  const roomSize = room ? room.size : 0;
  console.log(
    `[Camera] 📡 Relaying WebRTC offer (ID: ${correlationId}) to room: ${roomName} | sockets in room: ${roomSize}`,
  );

  // Fail fast instead of waiting the full 15s when nobody's listening - this is
  // the common case for an offline/disconnected gate worker.
  if (roomSize === 0) {
    console.warn(`[Camera] ⚠️ No gate worker connected for building ${barilgiinId} - failing fast`);
    return res.status(503).json({ error: "Local gate worker is not connected" });
  }

  const waitForAnswer = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingSignaling.delete(correlationId);
      reject(new Error("Timeout waiting for local worker response"));
    }, 15000);

    pendingSignaling.set(correlationId, { resolve, timeout });
  });

  io.to(roomName).emit("webrtc-offer", {
    correlationId,
    rtspUrl,
    sdp64,
  });

  try {
    const sdpAnswer = await waitForAnswer;
    return res.status(200).send(sdpAnswer);
  } catch (error) {
    console.error(`[Camera] ❌ Signaling failed: ${error.message}`);
    return res.status(504).json({ error: error.message });
  }
});

router.handleWebRTCAnswer = (data) => {
  // Resolve immediately if the waiting request happens to be on this same
  // process (cheap, and the only path that works if Redis is unavailable),
  // and always publish so the worker that's actually waiting (if it's a
  // different one) can pick it up too.
  resolvePendingLocally(data);
  pubClient.publish(WEBRTC_ANSWER_CHANNEL, JSON.stringify(data)).catch((err) => {
    console.error("[Camera] Redis publish failed for webrtc-answer:", err.message);
  });
};

module.exports = router;
