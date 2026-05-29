const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

// Global map to track pending WebRTC signaling requests
const pendingSignaling = new Map();

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

    const room = io.sockets.adapter.rooms.get(roomName);
    console.log(`[Camera] 📡 Relaying WebRTC offer (ID: ${correlationId}) to room: ${roomName} | sockets in room: ${room ? room.size : 0}`);

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
        sdp64
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
    const { correlationId, sdpAnswer, error } = data;
    const pending = pendingSignaling.get(correlationId);

    if (pending) {
        clearTimeout(pending.timeout);
        pendingSignaling.delete(correlationId);

        if (error) {
            // Logic to handle error if needed
        } else {
            pending.resolve(sdpAnswer);
        }
    }
};

module.exports = router;
