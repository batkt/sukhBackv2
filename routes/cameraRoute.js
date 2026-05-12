const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

// Global map to track pending WebRTC signaling requests
const pendingSignaling = new Map();

/**
 * WebRTC Signaling Route
 * Bridges the browser's SDP offer to the local PC worker via Socket.io
 */
router.post("/camera/stream/stream", async (req, res) => {
    const { rtsp, url, sdp64 } = req.body;
    const barilgiinId = req.body.barilgiinId || req.query.barilgiinId;
    const rtspUrl = rtsp || url;
    
    // We need barilgiinId to know which local PC to talk to
    if (!barilgiinId) {
        return res.status(400).json({ error: "barilgiinId is required for remote streaming" });
    }

    if (!rtspUrl || !sdp64) {
        return res.status(400).json({ error: "RTSP URL and SDP are required" });
    }

    const io = req.app.get("socketio");
    if (!io) {
        return res.status(500).json({ error: "Socket.io not initialized" });
    }

    // Generate a unique ID for this specific handshake
    const correlationId = uuidv4();
    const roomName = `gate-room-${barilgiinId}`;

    console.log(`[Camera] 📡 Relaying WebRTC offer for ${rtspUrl} to room: ${roomName}`);

    // Set up a promise to wait for the answer from the local worker
    const waitForAnswer = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingSignaling.delete(correlationId);
            reject(new Error("Timeout waiting for local worker response"));
        }, 15000); // 15 second timeout

        pendingSignaling.set(correlationId, { resolve, timeout });
    });

    // Send the offer to the local worker via Socket
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

/**
 * Socket listener for the local worker to send back the SDP answer
 * This is handled in index.js usually, but we need to resolve the promise here.
 */
router.handleWebRTCAnswer = (data) => {
    const { correlationId, sdpAnswer, error } = data;
    const pending = pendingSignaling.get(correlationId);
    
    if (pending) {
        clearTimeout(pending.timeout);
        pendingSignaling.delete(correlationId);
        
        if (error) {
            console.error(`[Camera] Local worker returned error: ${error}`);
            // Logic to reject the promise if needed
        } else {
            pending.resolve(sdpAnswer);
        }
    }
};

module.exports = router;
