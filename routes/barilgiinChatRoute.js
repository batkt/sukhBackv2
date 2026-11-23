/**
 * Барилгын групп чат (ажилтан — вэб, оршин суугч — апп).
 *   GET  /barilgiinChat/minii                          миний чатууд (lazy үүсгэнэ)
 *   GET  /barilgiinChat/:barilgiinId/messejuud?umnukh=<messejId>&khemjee=30
 *   POST /barilgiinChat/:barilgiinId/messej             body: { text, clientId?, khariuId? }
 *   POST /barilgiinChat/:barilgiinId/messej/:messejId/zasakh   body: { text }  (зөвхөн өөрийн)
 *     Засвар POST-оор: middleware/shaltgaan.js PUT/PATCH-д ажилтнаас шалтгаан
 *     шаарддаг — өөрийн чатын мессеж засахад шалтгаан асуух нь утгагүй.
 * «Бүх байр» чатын түлхүүр нь `buh_<baiguullagiinId>` (barilgiinId-ийн оронд).
 * Бодит цаг: socket "barilgiinChat:join" → room `chat:<barilgiinId>`,
 *            шинэ мессеж "barilgiinChat:messej", засвар "barilgiinChat:zasvar".
 * Гишүүнчлэл, хамгаалалт: services/barilgiinChatService.js
 */
const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const service = require("../services/barilgiinChatService");

const aldaaKhariu = (res, e) => {
  const status = e.status || 500;
  if (status >= 500) console.error("[barilgiinChat]", e);
  return res.status(status).json({ success: false, message: e.message || "Алдаа гарлаа" });
};

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
