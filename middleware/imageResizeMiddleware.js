const sharp = require("sharp");
const fs = require("fs");

// Phone photos routinely come in at 3000-4000px / several MB; nothing on
// web/chat UI displays originals at that size, so cap the longest side and
// re-encode in place to cut storage and download time.
const MAX_DIMENSION = 1920;
const RESIZABLE_MIMETYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function resizeImageFile(file) {
  if (!file || !RESIZABLE_MIMETYPES.has(file.mimetype)) return;
  try {
    const resized = await sharp(file.path)
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
    if (resized.length < file.size) {
      fs.writeFileSync(file.path, resized);
      file.size = resized.length;
    }
  } catch (err) {
    console.error(`Image resize failed for ${file.path}:`, err.message);
  }
}

// Resize req.file/req.files (multer disk storage) in place before the route
// handler reads file.size/saves DB records. Never blocks the upload on failure.
async function resizeUploadedImages(req, res, next) {
  const files = req.files && req.files.length ? req.files : req.file ? [req.file] : [];
  await Promise.all(files.map(resizeImageFile));
  next();
}

module.exports = { resizeUploadedImages };
