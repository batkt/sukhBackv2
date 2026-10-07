const express = require("express");
const router = express.Router();
const { gateWorkerToo } = require("../utils/gateRoom");

/**
 * Камерын урсгалыг ШААРДЛАГААР асаах/зогсоох дамжуулагч.
 *
 * ── Яагаад ──────────────────────────────────────────────────────────────
 * Барилга бүх камерыг 24 цаг VPS рүү дамжуулбал шугам дүүрдэг: хэмжилтээр
 * нэг обьектын 34 урсгал = 18 Mbps тасралтгүй, улмаар пакет дараалалд орж
 * саатал минутаар хуримтлагдаж байв. Гэтэл бодит үзэгч зэрэг 1-2 камер
 * хардаг.
 *
 * ── Гинж ────────────────────────────────────────────────────────────────
 *   хөтөч/апп WHEP хүсэлт
 *     → MediaMTX: зам дээр нийтлэгч алга
 *     → `runOnDemand` скрипт (VPS дотор)
 *     → ЭНЭ маршрут
 *     → socket `gate-room-{barilgiinId}` → барилгын worker
 *     → ffmpeg асна → MediaMTX уншигчид өгнө
 *
 * Уншигч дуусахад MediaMTX скриптийг таслах ба тэр нь `stop`-ыг илгээнэ.
 *
 * ── Эрх ─────────────────────────────────────────────────────────────────
 * MediaMTX нь ИЖИЛ серверт ажилладаг тул зөвхөн loopback-аас хүлээж авна.
 * Гаднаас хандвал хэн ч дурын барилгын урсгалыг асааж, шугам дүүргэх
 * боломжтой болно. nginx-ээр гаргахгүй — скрипт `127.0.0.1:8084` рүү шууд
 * хандана.
 */

/** Хүсэлт сервер дотроосоо ирсэн эсэх. */
function loopbackEsekh(req) {
  const raw =
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "";
  // Express нь IPv4-ийг IPv6 дүрст (`::ffff:127.0.0.1`) хэлбэрээр өгдөг.
  const ip = String(raw).replace("::ffff:", "");
  return ip === "127.0.0.1" || ip === "::1";
}

router.post("/camera/urgats/:tuluv", async (req, res) => {
  if (!loopbackEsekh(req)) {
    console.warn(`[Urgats] ⚠️ гаднаас хандалт хаагдлаа: ${req.ip}`);
    return res.status(403).json({ aldaa: "Зөвхөн дотоод хандалт" });
  }

  const tuluv = String(req.params.tuluv || "").toLowerCase();
  if (tuluv !== "start" && tuluv !== "stop") {
    return res.status(400).json({ aldaa: "tuluv нь start эсвэл stop байна" });
  }

  const zam = String(req.body?.path || req.body?.zam || "").trim();
  if (!zam) {
    return res.status(400).json({ aldaa: "path хоосон" });
  }

  // Зам нь `{barilgiinId}/{камер}` — эхний хэсэг нь барилга.
  const barilgiinId = zam.split("/")[0];
  if (!barilgiinId || barilgiinId === zam) {
    return res
      .status(400)
      .json({ aldaa: "path нь {barilgiinId}/{камер} хэлбэртэй байх ёстой" });
  }

  const io = req.app.get("socketio");
  if (!io) {
    return res.status(500).json({ aldaa: "Socket.io not initialized" });
  }

  const roomName = `gate-room-${barilgiinId}`;
  const roomSize = await gateWorkerToo(io, barilgiinId);

  if (roomSize === 0) {
    console.warn(
      `[Urgats] ⚠️ ${tuluv} ${zam} — тэр барилгын worker холбогдоогүй`,
    );
    return res
      .status(503)
      .json({ aldaa: "Локал төхөөрөмж холбогдоогүй байна", zam });
  }

  io.to(roomName).emit(`urgats-${tuluv}`, { path: zam });
  console.log(`[Urgats] ${tuluv} → ${zam} (workers: ${roomSize})`);

  return res.json({ status: "Amjilttai", tuluv, zam });
});

module.exports = router;
