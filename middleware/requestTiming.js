/**
 * Lightweight request timing middleware.
 * Logs any request that takes longer than SLOW_REQUEST_MS (default 1000ms) to complete.
 * Safe to leave on permanently - overhead is a single hrtime read per request.
 */
const { recordIssue } = require("../utils/aiOpsAnalyzer");

const SLOW_REQUEST_MS = parseInt(process.env.SLOW_REQUEST_MS || "1000", 10);

function requestTimingMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (ms >= SLOW_REQUEST_MS) {
      const tenant =
        req.body?.baiguullagiinId ||
        req.query?.baiguullagiinId ||
        req.params?.baiguullagiinId ||
        req.headers["x-org-only"] ||
        "-";
      console.warn(
        `🐌 [SLOW REQUEST] ${ms.toFixed(0)}ms ${req.method} ${req.originalUrl} status=${res.statusCode} org=${tenant}`,
      );
      recordIssue({
        kind: "slow_request",
        message: `${ms.toFixed(0)}ms ${req.method} ${req.originalUrl} status=${res.statusCode}`,
        meta: { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) },
      });
    }
  });

  next();
}

module.exports = { requestTimingMiddleware };
