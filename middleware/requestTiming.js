/**
 * Lightweight request timing middleware.
 * Logs any request that takes longer than SLOW_REQUEST_MS (default 1000ms) to complete.
 * Safe to leave on permanently - overhead is a single hrtime read per request.
 */
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
    }
  });

  next();
}

module.exports = { requestTimingMiddleware };
