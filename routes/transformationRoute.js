const express = require("express");
const router = express.Router();
const { tokenShalgakh, db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const Ajiltan = require("../models/ajiltan");
const Geree = require("../models/geree");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const EbarimtShine = require("../models/ebarimtShine");
const EbarimtStandard = require("../models/ebarimt");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const OrshinSuugch = require("../models/orshinSuugch");
const Mashin = require("../models/mashin");
const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
const QuickQpayObject = require("../models/qpayObject");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const UilchilgeeniiZardluud = require("../models/uilchilgeeniiZardluud");
const TootBurtgel = require("../models/tootBurtgel");
const MsgTuukh = require("../models/msgTuukh");
const NekhemjlekhCron = require("../models/cronSchedule");
const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");
const GereeniiZaalt = require("../models/gereeniiZaalt");
const GereeniiZagvar = require("../models/gereeniiZagvar");
const NekhemjlekhiinZagvar = require("../models/nekhemjlekhiinZagvar");
const Medegdel = require("../models/medegdel");
const Sonorduulga = require("../models/sonorduulga");
const UneguiMashin = require("../models/uneguiMashin");
const Zogsool = require("../models/zogsool");
const ZogsooliinIp = require("../models/zogsooliinIp");
const OrshinSuugchMashin = require("../models/orshinSuugchMashin");
const KassCameraKhaalt = require("../models/kassCameraKhaalt");

// Hardcoded authorized organization IDs
const AUTHORIZED_ORGS = [
  "698e7fd3b6dd386b6c56a808", // Admin Org 1
];

router.post("/transformation/transformBarilga", tokenShalgakh, async (req, res, next) => {
  try {
    const { oldBaiguullagiinId, newBaiguullagiinId, barilgiinId } = req.body;
    const requestorOrgId = req.body.baiguullagiinId; // From tokenShalgakh

    // Safety check: Only work if requestor is from an authorized org
    if (!AUTHORIZED_ORGS.includes(requestorOrgId)) {
      return res.status(403).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна! (Authorized org check failed)",
      });
    }

    if (!oldBaiguullagiinId || !newBaiguullagiinId || !barilgiinId) {
      return res.status(400).json({
        success: false,
        message: "oldBaiguullagiinId, newBaiguullagiinId, and barilgiinId are required",
      });
    }

    // 1. Fetch Organizations
    const oldBaiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(oldBaiguullagiinId);
    const newBaiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(newBaiguullagiinId);

    if (!oldBaiguullaga || !newBaiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Old or New organization not found",
      });
    }

    // 2. Move Building Config in Main DB
    const barilgaIndex = oldBaiguullaga.barilguud.findIndex(b => String(b._id) === String(barilgiinId));
    if (barilgaIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Building not found in old organization",
      });
    }

    const barilgaConfig = oldBaiguullaga.barilguud[barilgaIndex].toObject();
    oldBaiguullaga.barilguud.splice(barilgaIndex, 1);
    await oldBaiguullaga.save();

    newBaiguullaga.barilguud.push(barilgaConfig);
    await newBaiguullaga.save();

    const results = {
      buildingMoved: true
    };

    // 3. Update OrshinSuugch in Main DB (Crucial)
    // Residents are shared in erunkhiiKholbolt. We need to update:
    // a) Top-level fields (if it's their primary address)
    // b) Nested toots array elements matching the buildingId
    try {
      const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
      
      // Update top-level
      const mainResult = await OrshinSuugchModel.updateMany(
        { barilgiinId: barilgiinId },
        { 
          $set: { 
            baiguullagiinId: newBaiguullagiinId,
            baiguullagiinNer: newBaiguullaga.ner 
          } 
        }
      );

      // Update nested toots array
      const tootsResult = await OrshinSuugchModel.updateMany(
        { "toots.barilgiinId": barilgiinId },
        { 
          $set: { 
            "toots.$[elem].baiguullagiinId": newBaiguullagiinId,
            "toots.$[elem].baiguullagiinNer": newBaiguullaga.ner 
          } 
        },
        { arrayFilters: [{ "elem.barilgiinId": barilgiinId }] }
      );

      results.orshinSuugch = {
        topLevelModified: mainResult.modifiedCount,
        arrayElementsModified: tootsResult.modifiedCount
      };
    } catch (err) {
      results.orshinSuugch = "Error: " + err.message;
    }

    // 4. Update Ajiltan (Employees) in Main DB
    try {
      const AjiltanModel = Ajiltan(db.erunkhiiKholbolt);
      const ajiltanResult = await AjiltanModel.updateMany(
        { barilguud: barilgiinId },
        { 
          $set: { 
            baiguullagiinId: newBaiguullagiinId,
            baiguullagiinNer: newBaiguullaga.ner 
          } 
        }
      );
      results.ajiltan = ajiltanResult.modifiedCount;
    } catch (err) {
      results.ajiltan = "Error: " + err.message;
    }

    // 5. Update Tenant DB Records
    const oldKholbolt = db.kholboltuud.find(k => String(k.baiguullagiinId) === String(oldBaiguullagiinId));
    if (oldKholbolt) {
      const tenantModels = [
        { name: "geree", factory: Geree },
        { name: "bankniiGuilgee", factory: BankniiGuilgee },
        { name: "ebarimtShine", factory: EbarimtShine },
        { name: "ebarimt", factory: EbarimtStandard },
        { name: "nekhemjlekhiinTuukh", factory: nekhemjlekhiinTuukh },
        { name: "mashin", factory: Mashin },
        { name: "zaaltUnshlalt", factory: ZaaltUnshlalt },
        { name: "qpayObject", factory: QuickQpayObject },
        { name: "ashiglaltiinZardluud", factory: AshiglaltiinZardluud },
        { name: "uilchilgeeniiZardluud", factory: UilchilgeeniiZardluud },
        { name: "tootBurtgel", factory: TootBurtgel },
        { name: "msgTuukh", factory: MsgTuukh },
        { name: "nekhemjlekhCron", factory: NekhemjlekhCron },
        { name: "gereeniiTulsunAvlaga", factory: GereeniiTulsunAvlaga },
        { name: "gereeniiTulukhAvlaga", factory: GereeniiTulukhAvlaga },
        { name: "gereeniiZaalt", factory: GereeniiZaalt },
        { name: "gereeniiZagvar", factory: GereeniiZagvar },
        { name: "nekhemjlekhiinZagvar", factory: NekhemjlekhiinZagvar },
        { name: "medegdel", factory: Medegdel },
        { name: "sonorduulga", factory: Sonorduulga },
        { name: "uneguiMashin", factory: UneguiMashin },
        { name: "zogsool", factory: Zogsool },
        { name: "zogsooliinIp", factory: ZogsooliinIp },
        { name: "orshinSuugchMashin", factory: OrshinSuugchMashin },
        { name: "kassCameraKhaalt", factory: KassCameraKhaalt }
      ];

      const updatePayload = { 
        baiguullagiinId: newBaiguullagiinId,
        baiguullagiinNer: newBaiguullaga.ner 
      };

      for (const modelInfo of tenantModels) {
        try {
          const Model = modelInfo.factory(oldKholbolt);
          const result = await Model.updateMany(
            { barilgiinId: barilgiinId }, 
            { $set: updatePayload }
          );
          results[modelInfo.name] = result.modifiedCount;
        } catch (err) {
          results[modelInfo.name] = "Error: " + err.message;
        }
      }
    }

    res.json({
      success: true,
      message: "Building and its data transported successfully",
      details: results,
      barilgiinId: barilgiinId,
      oldBaiguullagiinId: oldBaiguullagiinId,
      newBaiguullagiinId: newBaiguullagiinId
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
