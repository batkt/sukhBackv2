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

    // go2rtc WebRTC API format: POST /api/webrtc?src={RTSP_URL}
    // Note: go2rtc default port is 1984, but we'll stick to 8083 if that's your config
    const streamingProxyUrl = process.env.STREAMING_PROXY_URL || "http://127.0.0.1:1984/api/webrtc";
    const targetUrl = `${streamingProxyUrl}?src=${encodeURIComponent(rtspUrl)}`;

    console.log(`[Camera] Requesting WebRTC stream from go2rtc: ${targetUrl}`);

    try {
      // go2rtc expects the SDP (base64) as a raw text body
      const response = await axios({
        method: "post",
        url: targetUrl,
        data: sdp64,
        headers: {
          "Content-Type": "text/plain"
        },
        timeout: 10000
      });

      // go2rtc returns the SDP Answer as raw text
      return res.status(200).send(response.data);
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
