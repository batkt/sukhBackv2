const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const Medegdel = require("../models/medegdel");
const { daraagiinTulukhOgnooZasya } = require("./tulbur");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");
const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const { parseOgnooKeepClock } = require("../utils/parseOgnooKeepClock");

exports.gereeniiGuilgeeKhadgalya = asyncHandler(async (req, res, next) => {
  try {
    console.log("📊 [GEREE SAVE] Starting gereeniiGuilgeeKhadgalya");
    const { db } = require("zevbackv2");

    // Handle both formats: { guilgee: {...} } OR flat { gereeniiId: ..., turul: ..., etc }
    var guilgee = req.body.guilgee || req.body;

    // Normalize amount fields based on turul type
    // avlaga = debt/invoice (uses tulukhDun - amount TO pay)
    // tulult/ashiglalt = payment (uses tulsunDun - amount PAID)
    const dun = Number(
      guilgee.dun || guilgee.tulukhDun || guilgee.tulsunDun || 0,
    );

    if (guilgee.turul === "avlaga") {
      // For avlaga: set tulukhDun, NOT tulsunDun
      guilgee.tulukhDun = dun;
      guilgee.tulsunDun = 0; // avlaga doesn't pay, it creates debt
    } else if (guilgee.turul === "tulult" || guilgee.turul === "ashiglalt") {
      // For payment types: set tulsunDun
      guilgee.tulsunDun = dun;
      guilgee.tulukhDun = 0;
    } else {
      // Default: treat as payment (tulult) when dun > 0 and no turul specified
      guilgee.tulsunDun = dun;
      if (!guilgee.turul && dun > 0) {
        guilgee.turul = "tulult";
      }
    }

    if (!guilgee.gereeniiId) {
      throw new Error("Гэрээний ID заавал бөглөх шаардлагатай!");
    }

    let baiguullagiinId = req.body.baiguullagiinId || guilgee.baiguullagiinId;

    if (!baiguullagiinId) {
      const allConnections = db.kholboltuud || [];
      let foundGeree = null;

      for (const conn of allConnections) {
        try {
          const tempGeree = await Geree(conn, true)
            .findById(guilgee.gereeniiId)
            .select("baiguullagiinId");
          if (tempGeree) {
            foundGeree = tempGeree;
            baiguullagiinId = tempGeree.baiguullagiinId;
            break;
          }
        } catch (err) {}
      }

      if (!baiguullagiinId) {
        throw new Error(
          "Байгууллагын ID олдсонгүй! Гэрээ олдсонгүй эсвэл байгууллагын ID-г body-д оруулна уу.",
        );
      }
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) =>
        String(kholbolt.baiguullagiinId) === String(baiguullagiinId),
    );

    if (!tukhainBaaziinKholbolt) {
      throw new Error("Холболтын мэдээлэл олдсонгүй!");
    }

    if (guilgee.guilgeeniiId) {
      var shalguur = await BankniiGuilgee(tukhainBaaziinKholbolt, true).findOne(
        {
          "guilgee.guilgeeniiId": guilgee.guilgeeniiId,
          kholbosonGereeniiId: guilgee.gereeniiId,
        },
      );
      if (shalguur)
        throw new Error("Тухайн гүйлгээ тухайн гэрээнд холбогдсон байна!");
    }

    if (
      (guilgee.turul == "barter" ||
        guilgee.turul == "avlaga" ||
        guilgee.turul == "tulult" ||
        guilgee.turul == "ashiglalt") &&
      !guilgee.tailbar
    ) {
      throw new Error("Тайлбар заавал оруулна уу?");
    }

    guilgee.guilgeeKhiisenOgnoo = new Date();
    const staffToken =
      req.body.nevtersenAjiltniiToken || req.nevtersenAjiltniiToken;
    if (staffToken?.ner || staffToken?.id) {
      if (staffToken.ner != null && String(staffToken.ner).trim() !== "") {
        guilgee.guilgeeKhiisenAjiltniiNer = staffToken.ner;
      }
      if (staffToken.id != null && String(staffToken.id).trim() !== "") {
        guilgee.guilgeeKhiisenAjiltniiId = String(staffToken.id);
      }
    }
    const missingAjiltanId =
      guilgee.guilgeeKhiisenAjiltniiId == null ||
      String(guilgee.guilgeeKhiisenAjiltniiId).trim() === "";
    const missingAjiltanNer =
      guilgee.guilgeeKhiisenAjiltniiNer == null ||
      String(guilgee.guilgeeKhiisenAjiltniiNer).trim() === "";
    if (missingAjiltanId) {
      if (req.body.createdBy != null && String(req.body.createdBy).trim() !== "") {
        guilgee.guilgeeKhiisenAjiltniiId = String(req.body.createdBy);
      } else if (
        req.body.burtgesenAjiltaniiId != null &&
        String(req.body.burtgesenAjiltaniiId).trim() !== ""
      ) {
        guilgee.guilgeeKhiisenAjiltniiId = String(req.body.burtgesenAjiltaniiId);
      } else if (
        req.body.burtgesenAjiltan != null &&
        String(req.body.burtgesenAjiltan).trim() !== ""
      ) {
        guilgee.guilgeeKhiisenAjiltniiId = String(req.body.burtgesenAjiltan);
      }
    }
    if (missingAjiltanNer) {
      const ner =
        req.body.burtgesenAjiltaniiNer ||
        req.body.createdByNer ||
        req.body.ajiltanNer ||
        (typeof req.body.guilgeeKhiisenAjiltniiNer === "string"
          ? req.body.guilgeeKhiisenAjiltniiNer
          : null);
      if (ner != null && String(ner).trim() !== "") {
        guilgee.guilgeeKhiisenAjiltniiNer = ner;
      }
    }

    let newAvlagaId = null;

    const GereeniiTulukhAvlagaModel = GereeniiTulukhAvlaga(
      tukhainBaaziinKholbolt,
    );
    const count = await GereeniiTulukhAvlagaModel.countDocuments({
      gereeniiId: guilgee.gereeniiId,
    });
    // Prepare the queued transaction
    const guilgeeForNekhemjlekh = {
      ...guilgee,
      _id: newAvlagaId || undefined, // Use existing record ID or let Mongoose generate one (avoiding manual-xxx string which causes CastError)
      avlagaGuilgeeIndex: count,
    };
    // "ashiglalt" is receivable-side like avlaga; keep amount in tulukhDun for invoice generation.
    if (guilgee?.turul === "ashiglalt") {
      const amt =
        Number(guilgee?.tulukhDun) ||
        Number(guilgee?.undsenDun) ||
        Number(guilgee?.dun) ||
        Number(guilgee?.tulsunDun) ||
        0;
      guilgeeForNekhemjlekh.tulukhDun = amt;
      guilgeeForNekhemjlekh.tulsunDun = 0;
    }

    // Push to guilgeenuudForNekhemjlekh for manual adjustments
    const updateData = {
      $push: { guilgeenuudForNekhemjlekh: guilgeeForNekhemjlekh },
    };

    await Geree(tukhainBaaziinKholbolt).findByIdAndUpdate(
      guilgee.gereeniiId,
      updateData,
      { new: false },
    );

    // Full recalculation from raw amounts using shared utility
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { recalcGlobalUldegdel } = require("../utils/recalcGlobalUldegdel");
    const NekhemjlekhiinTuukhRecalc = require("../models/nekhemjlekhiinTuukh");
    const GereeniiTulsunAvlagaRecalc = require("../models/gereeniiTulsunAvlaga");
    try {
      await recalcGlobalUldegdel({
        gereeId: guilgee.gereeniiId,
        baiguullagiinId,
        GereeModel: Geree(tukhainBaaziinKholbolt),
        NekhemjlekhiinTuukhModel: NekhemjlekhiinTuukhRecalc(
          tukhainBaaziinKholbolt,
        ),
        GereeniiTulukhAvlagaModel: GereeniiTulukhAvlagaModel,
        GereeniiTulsunAvlagaModel: GereeniiTulsunAvlagaRecalc(
          tukhainBaaziinKholbolt,
        ),
      });
    } catch (recalcErr) {
      console.error(
        "❌ [GEREE] Error in full recalculation:",
        recalcErr.message,
      );
    }

    const result = await Geree(tukhainBaaziinKholbolt).findById(
      guilgee.gereeniiId,
    );

    try {
      await daraagiinTulukhOgnooZasya(
        guilgee.gereeniiId,
        tukhainBaaziinKholbolt,
      );
    } catch (dateUpdateError) {
      console.error(
        "⚠️ [GEREE] Error updating next payment date:",
        dateUpdateError.message,
      );
    }

    try {
      if (guilgee.turul === "avlaga" && result && result.orshinSuugchId) {
        const MedegdelModel = Medegdel(tukhainBaaziinKholbolt);
        const medegdel = new MedegdelModel({
          orshinSuugchId: result.orshinSuugchId,
          baiguullagiinId: baiguullagiinId,
          barilgiinId: result.barilgiinId || "",
          title: "Шинэ авлага нэмэгдлээ",
          message: `Гэрээний дугаар: ${result.gereeniiDugaar || "N/A"}, Төлбөр: ${guilgee.tulukhDun || 0}₮`,
          kharsanEsekh: false,
          turul: "мэдэгдэл",
          ognoo: new Date(),
        });

        await medegdel.save();

        const io = req.app.get("socketio");
        if (io) {
          io.emit("orshinSuugch" + result.orshinSuugchId, medegdel);
        }
      }
    } catch (notificationError) {
      console.error(
        "Error sending notification for avlaga:",
        notificationError,
      );
    }

    if (guilgee.guilgeeniiId) {
      const result1 = await BankniiGuilgee(tukhainBaaziinKholbolt).updateOne(
        { _id: guilgee.guilgeeniiId },
        {
          $set: {
            kholbosonGereeniiId: guilgee.gereeniiId,
            kholbosonTalbainId: result.talbainDugaar,
          },
        },
      );
      res.send(result1);
    } else {
      res.send(result);
    }
  } catch (aldaa) {
    console.error("❌ [GEREE SAVE ERROR]", aldaa);
    next(aldaa);
  }
});
