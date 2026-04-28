const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  blogIlgeeye,
  blogAvya,
  blogZasah,
  blogReaction,
  blogUstgakh,
} = require("../controller/blog");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getMedegdelPublicRoot } = require("../config/medegdelPaths");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const { baiguullagiinId } = req.body;
    const root = getMedegdelPublicRoot();
    const dir = baiguullagiinId ? path.join(root, baiguullagiinId) : root;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "blog-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/blog", tokenShalgakh, upload.array("images", 10), blogIlgeeye);
router.get("/blog", tokenShalgakh, blogAvya);
router.put("/blog/:id", tokenShalgakh, upload.array("images", 10), blogZasah);
router.post("/blog/:id/reaction", tokenShalgakh, blogReaction);
router.delete("/blog/:id", tokenShalgakh, blogUstgakh);

module.exports = router;
