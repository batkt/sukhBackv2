const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const { shilenDansTailan, shilenDansApp } = require("../controller/shilenDans");

// Санхүү → Шилэн данс (вэб, ажилтан): оршин суугчдын төлбөр — бүрэн мэдээлэл
router.post("/shilenDans/tailan", tokenShalgakh, shilenDansTailan);
// Оршин суугчийн апп — «Нэмэлт тохиргоо → Шилэн данс» асаалттай үед;
// хэтэрсэн айл зөвхөн тоот + дүн
router.post("/shilenDans/app", tokenShalgakh, shilenDansApp);

module.exports = router;
