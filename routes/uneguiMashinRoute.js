    const express = require("express");
const router = express.Router();
const uneguiMashin = require("../models/uneguiMashin");

router.post("/uneguiMashinBurtgekh", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    const model = uneguiMashin(db.erunkhiiKholbolt);
    const mashiniiDugaar = req.body.mashiniiDugaar.trim();
    if (!mashiniiDugaar)
      return res.status(400).send("Mashin dugaar shaardlagatai.");

    const shineBurtgel = new model({
      ...req.body,
      mashiniiDugaar,
    });
    await shineBurtgel.save();
    res.send(shineBurtgel);
  } catch (error) {
    next(error);
  }
});

router.put("/uneguiMashin/:mashiniiDugaar", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    const model = uneguiMashin(db.erunkhiiKholbolt);
    const huuchinDugaar = req.params.mashiniiDugaar;

    const update = { ...req.body };
    if (update.mashiniiDugaar)
      update.mashiniiDugaar = update.mashiniiDugaar.trim();

    const zasagdsan = await model.findOneAndUpdate(
      { mashiniiDugaar: huuchinDugaar },
      update,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!zasagdsan)
      return res.status(404).send("Burtgel oldsongui. Zasakh bolomjgui.");

    res.send(zasagdsan);
  } catch (error) {
    next(error);
  }
});

router.delete("/uneguiMashin/:mashiniiDugaar", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    const model = uneguiMashin(db.erunkhiiKholbolt);
    const mashiniiDugaar = req.params.mashiniiDugaar;

    const ustgasan = await model.findOneAndDelete({
      mashiniiDugaar,
    });
    if (!ustgasan)
      return res.status(404).send("Burtgel oldsongui. Ustgakh bolomjgui.");

    res.send("Amjilttai ustgalaa.");
  } catch (error) {
    next(error);
  }
});

module.exports = router;
