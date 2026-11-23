const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  shilenDansTailan,
  shilenDansEkhniiUldegdelNemekh,
  shilenDansEkhniiUldegdelZasakh,
  shilenDansGuilgeeNemekh,
  shilenDansGuilgeeZasakh,
  shilenDansGuilgeeUstgakh,
  shilenDansApp,
} = require("../controller/shilenDans");

// Санхүү → Шилэн данс (вэб, ажилтан). Банкны хуулга ашиглахгүй — бүгд гараар.
router.post("/shilenDans/tailan", tokenShalgakh, shilenDansTailan);
router.post("/shilenDans/ekhniiUldegdel", tokenShalgakh, shilenDansEkhniiUldegdelNemekh);
// PUT/DELETE нь middleware/shaltgaan.js-ээр шалтгаан шаардана
router.put("/shilenDans/ekhniiUldegdel", tokenShalgakh, shilenDansEkhniiUldegdelZasakh);
router.post("/shilenDansGuilgee", tokenShalgakh, shilenDansGuilgeeNemekh);
router.put("/shilenDansGuilgee/:id", tokenShalgakh, shilenDansGuilgeeZasakh);
router.delete("/shilenDansGuilgee/:id", tokenShalgakh, shilenDansGuilgeeUstgakh);
// Оршин суугчийн апп — «Нэмэлт тохиргоо → Шилэн данс» асаалттай үед
router.post("/shilenDans/app", tokenShalgakh, shilenDansApp);

module.exports = router;
