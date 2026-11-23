/**
 * Барилгын групп чат (ажилтан — вэб, оршин суугч — апп).
 *   GET  /barilgiinChat/minii                          миний чатууд (lazy үүсгэнэ)
 *   GET  /barilgiinChat/:barilgiinId/messejuud?umnukh=<messejId>&khemjee=30
 *   POST /barilgiinChat/:barilgiinId/messej             body: { text, clientId?, khariuId? }
 *   POST /barilgiinChat/:barilgiinId/messej/:messejId/zasakh   body: { text }  (зөвхөн өөрийн)
 *     Засвар POST-оор: middleware/shaltgaan.js PUT/PATCH-д ажилтнаас шалтгаан
 *     шаарддаг — өөрийн чатын мессеж засахад шалтгаан асуух нь утгагүй.
 *   POST /barilgiinChat/:barilgiinId/file                 multipart "file" — зураг/видео upload
 *   GET  /barilgiinChat/file/:baiguullagiinId/:chat/:ner  хавсралт татах
 *   GET  /barilgiinChat/:barilgiinId/media                 чатын дэлгэрэнгүй (зураг, видео)
 * «Бүх байр» чатын түлхүүр нь `buh_<baiguullagiinId>` (barilgiinId-ийн оронд).
 * Бодит цаг: socket "barilgiinChat:join" → room `chat:<barilgiinId>`,
 *            шинэ мессеж "barilgiinChat:messej", засвар "barilgiinChat:zasvar".
 * Гишүүнчлэл, хамгаалалт: services/barilgiinChatService.js
 */
const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const service = require("../services/barilgiinChatService");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { resizeUploadedImages } = require("../middleware/imageResizeMiddleware");

const aldaaKhariu = (res, e) => {
  const status = e.status || 500;
  if (status >= 500) console.error("[barilgiinChat]", e);
  return res.status(status).json({ success: false, message: e.message || "Алдаа гарлаа" });
};

/* ── Хавсралт upload ───────────────────────────────────────────────────
 * POST /barilgiinChat/:barilgiinId/file   multipart "file" (1 файл)
 *   → { khavsralt: { ner, turul, zam, khemjee } }
 * Дараа нь мессеж илгээхдээ body.khavsralt: [{ ner }] өгнө.
 * Гишүүнчлэлийг файлыг диск рүү бичихээс ӨМНӨ шалгана.
 * АНХААР: nginx-ийн client_max_body_size видеоны хязгаараас бага бол 413.
 */
const ZURAG_MAX = 20 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-m4v": ".m4v",
  "video/3gpp": ".3gp",
};

const VIDEO_MIME = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".3gp": "video/3gpp",
};

function extAvya(file) {
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (ext && service.failTurul(`x${ext}`)) return ext === ".jpeg" ? ".jpg" : ext;
  return MIME_EXT[String(file.mimetype || "").toLowerCase()] || "";
}

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = service.chatFailKhavtas(req.chatMedeelel.baiguullagiinId, req.chatMedeelel.barilgiinId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + extAvya(file)),
  }),
  limits: { fileSize: VIDEO_MAX, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = extAvya(file);
    const turul = ext ? service.failTurul(`x${ext}`) : null;
    const mime = String(file.mimetype || "").toLowerCase();
    // Зарим төхөөрөмж application/octet-stream гэж явуулдаг — өргөтгөлөөр нь шийднэ
    const mimeTaarsan =
      mime === "application/octet-stream" ||
      (turul === "zurag" && mime.startsWith("image/")) ||
      (turul === "video" && mime.startsWith("video/"));
    if (!turul || !mimeTaarsan) {
      const e = new Error("Зөвхөн зураг эсвэл видео илгээх боломжтой");
      e.status = 400;
      return cb(e);
    }
    cb(null, true);
  },
});

const gishuunMiddleware = async (req, res, next) => {
  try {
    const { chat } = await service.gishuunShalgakh(req.body.nevtersenAjiltniiToken, req.params.barilgiinId);
    req.chatMedeelel = chat;
    next();
  } catch (e) {
    aldaaKhariu(res, e);
  }
};

router.post(
  "/barilgiinChat/:barilgiinId/file",
  tokenShalgakh,
  gishuunMiddleware,
  (req, res, next) =>
    chatUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") err.status = 413;
      if (err.code === "LIMIT_FILE_SIZE") err.message = "Файл хэт том байна (видео 100MB хүртэл)";
      if (err instanceof multer.MulterError && !err.status) err.status = 400;
      aldaaKhariu(res, err);
    }),
  resizeUploadedImages,
  (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Файл илгээгээгүй байна" });
    const turul = service.failTurul(file.filename);
    if (turul === "zurag" && file.size > ZURAG_MAX) {
      fs.unlink(file.path, () => {});
      return res.status(413).json({ success: false, message: "Зураг хэт том байна (20MB хүртэл)" });
    }
    const chat = req.chatMedeelel;
    res.json({
      success: true,
      khavsralt: {
        ner: file.filename,
        turul,
        zam: `barilgiinChat/file/${chat.baiguullagiinId}/${chat.barilgiinId}/${file.filename}`,
        khemjee: file.size,
      },
    });
  },
);

/** Хавсралт serve — нэр нь 128 бит санамсаргүй (capability URL), Range дэмжинэ */
router.get("/barilgiinChat/file/:baiguullagiinId/:chatTulkhuur/:ner", (req, res) => {
  try {
    const { baiguullagiinId, chatTulkhuur, ner } = req.params;
    if (!service.FAIL_NER.test(ner) || !service.failTurul(ner)) return res.status(404).end();
    const dir = service.chatFailKhavtas(baiguullagiinId, chatTulkhuur);
    const failZam = path.join(dir, ner);
    if (!fs.existsSync(failZam)) return res.status(404).end();
    // Глобал middleware no-store тавьдаг — файл өөрчлөгддөггүй тул кэшлэнэ
    res.set("Cache-Control", "private, max-age=604800, immutable");
    res.removeHeader("Pragma");
    res.removeHeader("Expires");
    res.set("X-Content-Type-Options", "nosniff");
    // send багц .mp4-ийг application/mp4 гэдэг — зарим <video> тоглуулахгүй
    const videoMime = VIDEO_MIME[path.extname(ner).toLowerCase()];
    if (videoMime) res.type(videoMime);
    res.sendFile(failZam, { cacheControl: false });
  } catch (_) {
    res.status(404).end();
  }
});

/** Чатын дэлгэрэнгүй — илгээгдсэн зураг, видео */
router.get("/barilgiinChat/:barilgiinId/media", tokenShalgakh, async (req, res) => {
  try {
    const ur = await service.media(req.body.nevtersenAjiltniiToken, req.params.barilgiinId, {
      umnukh: req.query.umnukh,
      khemjee: req.query.khemjee,
    });
    res.json({ success: true, ...ur });
  } catch (e) {
    aldaaKhariu(res, e);
  }
});

router.get("/barilgiinChat/minii", tokenShalgakh, async (req, res) => {
  try {
    const ur = await service.miniiChatuud(req.body.nevtersenAjiltniiToken);
    res.json({ success: true, ...ur });
  } catch (e) {
    aldaaKhariu(res, e);
  }
});

router.get("/barilgiinChat/:barilgiinId/messejuud", tokenShalgakh, async (req, res) => {
  try {
    const ur = await service.messejuud(req.body.nevtersenAjiltniiToken, req.params.barilgiinId, {
      umnukh: req.query.umnukh,
      khemjee: req.query.khemjee,
    });
    res.json({ success: true, ...ur });
  } catch (e) {
    aldaaKhariu(res, e);
  }
});

router.post("/barilgiinChat/:barilgiinId/messej", tokenShalgakh, async (req, res) => {
  try {
    const messej = await service.messejIlgeekh(req.body.nevtersenAjiltniiToken, req.params.barilgiinId, {
      text: req.body.text,
      clientId: req.body.clientId,
      khariuId: req.body.khariuId,
      khavsralt: req.body.khavsralt,
    });
    res.json({ success: true, messej });
  } catch (e) {
    aldaaKhariu(res, e);
  }
});

router.post("/barilgiinChat/:barilgiinId/messej/:messejId/zasakh", tokenShalgakh, async (req, res) => {
  try {
    const messej = await service.messejZasakh(
      req.body.nevtersenAjiltniiToken,
      req.params.barilgiinId,
      req.params.messejId,
      { text: req.body.text },
    );
    res.json({ success: true, messej });
  } catch (e) {
    aldaaKhariu(res, e);
  }
});

module.exports = router;
