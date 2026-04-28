const express = require("express");
const router = express.Router();
const { crud, UstsanBarimt, tokenShalgakh } = require("zevbackv2");
const nekhemjlekhCron = require("../models/cronSchedule.js");

router.post("/", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    const baiguullagiinId = req.body.baiguullagiinId;
    const barilgiinId = req.body.barilgiinId || null; // Optional: if provided, schedule is per building
    const { nekhemjlekhUusgekhOgnoo, idevkhitei = true } = req.body;

    if (!baiguullagiinId || !nekhemjlekhUusgekhOgnoo) {
      return res.status(400).json({
        success: false,
        message: "Байгууллагын ID болон сарын өдөр заавал бөглөх шаардлагатай!",
      });
    }

    const Baiguullaga = require("../models/baiguullaga");
    let baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId
    );

    if (!baiguullaga) {
      baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findOne({
        _id: baiguullagiinId,
      });

      if (!baiguullaga) {
        return res.status(404).json({
          success: false,
          message: "Байгууллагын мэдээлэл олдсонгүй!",
        });
      }
    }

    // If barilgiinId is provided, validate it exists in baiguullaga
    if (barilgiinId) {
      const targetBarilga = baiguullaga.barilguud?.find(
        (b) => String(b._id) === String(barilgiinId)
      );
      if (!targetBarilga) {
        return res.status(404).json({
          success: false,
          message: "Барилгын мэдээлэл олдсонгүй!",
        });
      }
    }

    let tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).json({
        success: false,
        message: `Байгууллагын холболт олдсонгүй! Олдсон холболтууд: ${db.kholboltuud
          .map((k) => k.baiguullagiinId)
          .join(", ")}`,
      });
    }

    // Query by both baiguullagiinId and barilgiinId (barilgiinId can be null for org-level)
    const query = { baiguullagiinId };
    if (barilgiinId) {
      query.barilgiinId = barilgiinId;
    } else {
      query.barilgiinId = null; // Explicitly set to null for organization-level
    }

    const cronSchedule = await nekhemjlekhCron(
      tukhainBaaziinKholbolt
    ).findOneAndUpdate(
      query,
      {
        baiguullagiinId,
        barilgiinId: barilgiinId || null,
        nekhemjlekhUusgekhOgnoo,
        idevkhitei,
        shinechilsenOgnoo: new Date(),
      },
      { upsert: true, new: true }
    );

    const scheduleType = barilgiinId ? "барилга" : "байгууллага";
    res.json({
      success: true,
      message: `Амжилттай тохируулагдлаа! Нэхэмжлэх ${nekhemjlekhUusgekhOgnoo} сарын ${nekhemjlekhUusgekhOgnoo} өдөр үүсгэгдэнэ (${scheduleType} түвшинд).`,
      data: cronSchedule,
    });
  } catch (error) {
    console.error("Cron schedule creation error:", error);
    next(error);
  }
});

// GET endpoint with query parameters - must be before /:baiguullagiinId route
router.get("/", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId } = req.query;

    // If neither parameter is provided, return error
    if (!baiguullagiinId && !barilgiinId) {
      return res.status(400).json({
        success: false,
        message: "Байгууллагын ID эсвэл барилгын ID заавал оруулах шаардлагатай!",
      });
    }

    let finalBaiguullagiinId = baiguullagiinId;
    let finalBarilgiinId = barilgiinId || null;

    // If only barilgiinId is provided, find baiguullagiinId from building
    if (!finalBaiguullagiinId && finalBarilgiinId) {
      const Baiguullaga = require("../models/baiguullaga");
      
      // Search through all organizations to find the building
      let foundBaiguullaga = null;
      for (const kholbolt of db.kholboltuud) {
        try {
          // Each kholbolt is associated with a baiguullagiinId, check that organization
          const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            kholbolt.baiguullagiinId
          ).lean();
          
          if (baiguullaga && baiguullaga.barilguud && Array.isArray(baiguullaga.barilguud)) {
            const hasBarilga = baiguullaga.barilguud.some(
              (b) => String(b._id) === String(finalBarilgiinId)
            );
            if (hasBarilga) {
              foundBaiguullaga = baiguullaga;
              finalBaiguullagiinId = foundBaiguullaga._id.toString();
              break;
            }
          }
        } catch (err) {
          console.error(`Error searching in kholbolt ${kholbolt.baiguullagiinId}:`, err.message);
          continue;
        }
      }

      if (!foundBaiguullaga) {
        return res.status(404).json({
          success: false,
          message: "Барилгын мэдээлэл олдсонгүй!",
        });
      }
    }

    if (!finalBaiguullagiinId) {
      return res.status(400).json({
        success: false,
        message: "Байгууллагын ID олдсонгүй!",
      });
    }

    let tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(finalBaiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).json({
        success: false,
        message: `Байгууллагын холболт олдсонгүй!`,
      });
    }

    // Build query: if barilgiinId provided, get that specific schedule, otherwise get all
    const query = { baiguullagiinId: finalBaiguullagiinId };
    if (finalBarilgiinId) {
      query.barilgiinId = finalBarilgiinId;
    }

    const schedules = await nekhemjlekhCron(tukhainBaaziinKholbolt).find(query);
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error("Cron schedule fetch error:", error);
    next(error);
  }
});

// GET endpoint with baiguullagiinId as URL parameter (backward compatibility)
router.get("/:baiguullagiinId", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId } = req.params;
    const { barilgiinId } = req.query; // Optional: filter by building

    let tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).json({
        success: false,
        message: `Байгууллагын холболт олдсонгүй!`,
      });
    }

    // Build query: if barilgiinId provided, get that specific schedule, otherwise get all
    const query = { baiguullagiinId };
    if (barilgiinId) {
      query.barilgiinId = barilgiinId;
    }

    const schedules = await nekhemjlekhCron(tukhainBaaziinKholbolt).find(query);
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error("Cron schedule fetch error:", error);
    next(error);
  }
});

module.exports = router;
