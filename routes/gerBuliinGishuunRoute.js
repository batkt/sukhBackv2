const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");

const {
  gishuunUrikh,
  gishuunDakhinIlgeeye,
  gishuunBatalgaajuulya,
  gishuudJagsaalt,
  gishuunErkhSoliyo,
  gishuunUstgakh,
  undsenEzemshigchiinMedeelel,
} = require("../controller/gerBuliinGishuun");

// --- Үндсэн эзэмшигчийн үйлдлүүд ---
router.post("/gerBuliinGishuunUrikh", tokenShalgakh, gishuunUrikh);
router.post(
  "/gerBuliinGishuunDakhinIlgeeye",
  tokenShalgakh,
  gishuunDakhinIlgeeye,
);
router.get("/gerBuliinGishuud", tokenShalgakh, gishuudJagsaalt);
router.put("/gerBuliinGishuunErkh", tokenShalgakh, gishuunErkhSoliyo);
router.post("/gerBuliinGishuunUstgakh", tokenShalgakh, gishuunUstgakh);

// --- Гишүүний үйлдлүүд ---
router.get(
  "/gerBuliinUndsenEzemshigch",
  tokenShalgakh,
  undsenEzemshigchiinMedeelel,
);

// --- Нээлттэй: уригдсан хүн кодоо баталгаажуулж нууц үгээ тохируулна ---
router.post("/gerBuliinGishuunBatalgaajuulya", gishuunBatalgaajuulya);

module.exports = router;
