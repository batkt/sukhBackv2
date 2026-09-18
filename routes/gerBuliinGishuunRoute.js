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
  gishuunNemekh,
  gishuunZasakh,
  urilgaShalgaya,
} = require("../controller/gerBuliinGishuun");

// --- Үндсэн эзэмшигчийн үйлдлүүд ---
router.post("/gerBuliinGishuunUrikh", tokenShalgakh, gishuunUrikh);
// Админ талаас шууд нэмэх — `undsenId`-г биеэс нь авна (урилга үүсгэхгүй).
router.post("/gerBuliinGishuunNemekh", tokenShalgakh, gishuunNemekh);
router.post("/gerBuliinGishuunZasakh", tokenShalgakh, gishuunZasakh);
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

// --- Нээлттэй: уригдсан хүн кодоо шалгах ба баталгаажуулж нууц үгээ тохируулах ---
router.post("/gerBuliinUrilgaShalgaya", urilgaShalgaya);
router.post("/gerBuliinGishuunBatalgaajuulya", gishuunBatalgaajuulya);

module.exports = router;
