const express = require("express");
const router = express.Router();
const axios = require("axios");

// Keep the global map and handleWebRTCAnswer function to prevent any import errors in index.js
const pendingSignaling = new Map();
router.handleWebRTCAnswer = (data) => {
    // Left empty for backwards compatibility in index.js
};

// Common handler for camera streaming proxy
async function handleCameraProxy(req, res) {
    try {
        const { rtsp, url, sdp64 } = req.body;
        const { barilgiinId } = req.params;
        const rtspUrl = rtsp || url;

        if (!rtspUrl) {
            return res.status(400).json({ error: "RTSP URL is required in request body" });
        }

        // Validate RTSP format
        if (!rtspUrl.startsWith("rtsp://")) {
            return res.status(400).json({ error: "RTSP URL must start with rtsp://" });
        }

        // Target local RTSPtoWebRTC Go server on the same machine
        const streamingProxyUrl = process.env.STREAMING_PROXY_URL || "http://127.0.0.1:8083/stream";

        console.log(`[Camera Proxy Backend] Forwarding to local Go server: ${streamingProxyUrl} for RTSP: ${rtspUrl}`);

        // Try form-encoded first (recommended for Go RTSPtoWebRTC)
        const formData = new URLSearchParams();
        formData.append("url", rtspUrl);
        formData.append("rtsp", rtspUrl);
        if (sdp64) {
            formData.append("sdp64", sdp64);
            formData.append("data", sdp64); // Go server expects SDP offer in 'data' field
        }

        let proxyResponse;
        try {
            proxyResponse = await axios.post(streamingProxyUrl, formData.toString(), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout: 8000,
            });
        } catch (formError) {
            console.log("[Camera Proxy Backend] Form-encoded failed, trying JSON format...");
            
            // Fallback to JSON
            const jsonBody = {
                url: rtspUrl,
                rtsp: rtspUrl,
            };
            if (sdp64) {
                jsonBody.sdp64 = sdp64;
                jsonBody.data = sdp64;
            }

            proxyResponse = await axios.post(streamingProxyUrl, jsonBody, {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 8000,
            });
        }

        const responseData = proxyResponse.data;

        // If Go server returned JSON response
        if (typeof responseData === "object" && responseData !== null) {
            if (responseData.sdp64) {
                return res.status(200).json({ sdp64: responseData.sdp64 });
            }
            if (responseData.sdp) {
                const encodedSdp = typeof responseData.sdp === "string"
                    ? (responseData.sdp.includes("v=0") ? Buffer.from(responseData.sdp).toString("base64") : responseData.sdp)
                    : responseData.sdp;
                return res.status(200).json({ sdp64: encodedSdp });
            }
            if (responseData.data || responseData.answer) {
                const sdpData = responseData.data || responseData.answer;
                const encodedSdp = typeof sdpData === "string"
                    ? (sdpData.includes("v=0") ? Buffer.from(sdpData).toString("base64") : sdpData)
                    : sdpData;
                return res.status(200).json({ sdp64: encodedSdp });
            }
            return res.status(200).json(responseData);
        }

        // If Go server returned plain text (raw SDP answer)
        if (typeof responseData === "string") {
            if (responseData.includes("v=0") || responseData.includes("m=video")) {
                return res.status(200).json({
                    sdp64: Buffer.from(responseData).toString("base64")
                });
            }
            
            // Check if it looks like base64
            if (responseData.length > 50 && !responseData.includes(" ")) {
                return res.status(200).json({ sdp64: responseData.trim() });
            }
        }

        return res.status(200).send(responseData);

    } catch (error) {
        console.error("[Camera Proxy Backend] ❌ Signaling failed:", error.message);
        
        let status = 503;
        let errorMessage = "Хяналтын Go сервертэй холбогдож чадсангүй.";
        
        if (error.response) {
            status = error.response.status;
            errorMessage = error.response.data || `Go server returned status ${status}`;
        }
        
        return res.status(status).json({
            error: "Streaming proxy connection failed",
            message: errorMessage,
            details: error.message
        });
    }
}

// Register both path endpoints for maximum compatibility
router.post("/camera/stream/:barilgiinId/stream", handleCameraProxy);
router.post("/camera/stream/:barilgiinId/answer", handleCameraProxy);

module.exports = router;
