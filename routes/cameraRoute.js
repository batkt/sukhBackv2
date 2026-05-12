const express = require("express");
const router = express.Router();
const axios = require("axios");

/**
 * Camera Stream Proxy Route
 * Handles WebRTC/RTSP streaming requests from R2WPlayer
 * 
 * Path: POST /camera/stream/stream
 */
router.post("/camera/stream/stream", async (req, res) => {
  try {
    const { rtsp, url, sdp64 } = req.body;
    const rtspUrl = rtsp || url;

    if (!rtspUrl) {
      console.error("[Camera] Missing RTSP URL in request body:", req.body);
      return res.status(400).json({ error: "RTSP URL is required" });
    }

    // Forward to streaming proxy (e.g., go2rtc or similar)
    const streamingProxyUrl = process.env.STREAMING_PROXY_URL || "http://127.0.0.1:8083/stream";

    console.log(`[Camera] Forwarding request for ${rtspUrl} to ${streamingProxyUrl}`);

    try {
      // Forward the request to the streaming proxy
      const response = await axios({
        method: "post",
        url: streamingProxyUrl,
        data: {
          url: rtspUrl,
          sdp64: sdp64
        },
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 10000 // 10 second timeout
      });

      // Forward the response back to the client with correct headers
      res.set(response.headers);
      return res.status(response.status).send(response.data);
    } catch (proxyError) {

      console.error("[Camera] Proxy error:", proxyError.message);
      
      if (proxyError.response) {
        return res.status(proxyError.response.status).send(proxyError.response.data);
      }
      
      return res.status(502).json({ 
        error: "Streaming proxy unreachable", 
        message: proxyError.message 
      });
    }
  } catch (error) {
    console.error("[Camera] Route error:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// Also handle the base path just in case
router.post("/camera/stream", async (req, res) => {
  // Re-use the same logic or redirect
  req.url = "/camera/stream/stream";
  router.handle(req, res);
});

module.exports = router;
