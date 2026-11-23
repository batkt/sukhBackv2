const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const { shilenDansTailan } = require("../controller/shilenDans");

// Санхүү → Шилэн данс: хугацааны орлого, зарлага, авлага, дансны үлдэгдэл
router.post("/shilenDans/tailan", tokenShalgakh, shilenDansTailan);

module.exports = router;
