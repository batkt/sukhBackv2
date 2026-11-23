const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  shilenDansTailan,
  shilenDansZarlagaAngilal,
  shilenDansApp,
} = require("../controller/shilenDans");

// Санхүү → Шилэн данс (вэб, ажилтан): хугацааны орлого, зарлага, авлага, үлдэгдэл
router.post("/shilenDans/tailan", tokenShalgakh, shilenDansTailan);
// Зарлагын мөрд ангилал онооно (вэб, ажилтан)
router.post("/shilenDans/zarlagaAngilal", tokenShalgakh, shilenDansZarlagaAngilal);
// Оршин суугчийн апп — «Нэмэлт тохиргоо → Шилэн данс» асаалттай үед
router.post("/shilenDans/app", tokenShalgakh, shilenDansApp);

module.exports = router;
