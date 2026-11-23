const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  shilenDansTailan,
  shilenDansApp,
  shilenDansZarlagaNemekh,
  shilenDansZarlagaZasakh,
  shilenDansZarlagaUstgakh,
} = require("../controller/shilenDans");

// Санхүү → Шилэн данс (вэб, ажилтан): төлбөр + зарлага — бүрэн мэдээлэл
router.post("/shilenDans/tailan", tokenShalgakh, shilenDansTailan);
// СӨХ-ийн зарлага (гараар). PUT/DELETE нь middleware/shaltgaan.js-ээр шалтгаан шаардана
router.post("/shilenDansZarlaga", tokenShalgakh, shilenDansZarlagaNemekh);
router.put("/shilenDansZarlaga/:id", tokenShalgakh, shilenDansZarlagaZasakh);
router.delete("/shilenDansZarlaga/:id", tokenShalgakh, shilenDansZarlagaUstgakh);
// Оршин суугчийн апп — «Нэмэлт тохиргоо → Шилэн данс» асаалттай үед;
// хэтэрсэн айл зөвхөн тоот + дүн
router.post("/shilenDans/app", tokenShalgakh, shilenDansApp);

module.exports = router;
