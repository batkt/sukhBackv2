const express = require("express");
const moment = require("moment");
const {
  Mashin: ParkingMashin,
  Parking,
  Uilchluulegch,
  zogsooliinDunAvya,
  sdkData,
  EzenUrisanMashin
} = require("sukhParking-v1");
const OrshinSuugch = require("../models/orshinSuugch");
const Geree = require("../models/geree");
const router = express.Router();
const { tokenShalgakh, crud, UstsanBarimt, db } = require("zevbackv2");

crud(router, "ezenUrisanMashin", EzenUrisanMashin, UstsanBarimt);

// Session validation for multiple device login prevention
const orshinSuugchSessionShalgaya = async (req, res, next) => {
  const token = req.body.nevtersenAjiltniiToken;
  if (token && token.erkh === "OrshinSuugch" && token.sessionId) {
    try {
      const OrshinSuugchModel = require("../models/orshinSuugch")(require("zevbackv2").db.erunkhiiKholbolt);
      const user = await OrshinSuugchModel.findById(token.id).select("currentSessionId");
      if (user && user.currentSessionId && user.currentSessionId !== token.sessionId) {
        return res.status(401).json({
          success: false,
          message: "Та өөр төхөөрөмж дээр нэвтэрсэн байна",
          code: "SESSION_EXPIRED"
        });
      }
    } catch (err) {
      console.error("Session check error (zochinUrikh):", err);
    }
  }
  next();
};

router.use(orshinSuugchSessionShalgaya);

// Харилцагчийн мэдээллийг шинээр хадгалах буюу засварлах функц
async function orshinSuugchKhadgalya(
  orshinSuugchMedeelel,
  utas,
  tukhainBaaziinKholbolt,
  baiguullagiinId,
  barilgiinId
) {
  const phoneString = Array.isArray(utas) ? utas[0] : String(utas || "").trim();
  if (!orshinSuugchMedeelel) return null;

  const orshinSuugchId = orshinSuugchMedeelel._id;
  if (orshinSuugchId) {
    const existingOrshinSuugch = await OrshinSuugch(
      db.erunkhiiKholbolt
    ).findById(orshinSuugchId);
    if (existingOrshinSuugch) {
      const updateFields = {};
      Object.keys(orshinSuugchMedeelel).forEach((key) => {
        if (key !== "_id" && key !== "createdAt" && key !== "__v") {
          const newValue = orshinSuugchMedeelel[key];
          const oldValue = existingOrshinSuugch[key];
          if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
            updateFields[key] = newValue;
          }
        }
      });
      if (Object.keys(updateFields).length > 0) {
        updateFields.updatedAt = new Date();
        return await OrshinSuugch(db.erunkhiiKholbolt).findByIdAndUpdate(
          orshinSuugchId,
          { $set: updateFields },
          { new: true }
        );
      }
      return existingOrshinSuugch;
    } else {
      throw new Error(`ID: ${orshinSuugchId} харилцагч олдсонгүй`);
    }
  } else {
    // ID байхгүй бол утасны дугаар + барилгаар хайна
    const { _id, ...orshinSuugchData } = orshinSuugchMedeelel;
    const query = { utas: phoneString };
    if (barilgiinId) {
      query.$or = [
        { barilgiinId: String(barilgiinId) },
        { "toots.barilgiinId": String(barilgiinId) }
      ];
    }
    
    const existingByUtas = await OrshinSuugch(db.erunkhiiKholbolt).findOne(query);
    if (existingByUtas) {
      console.log(`ℹ️ [ZOCHIN_URI] User exists with phone ${phoneString}, using existing record.`);
      return existingByUtas;
    }
    // Prevent duplicate: one toot (optionally + davkhar + orts) can have only one resident per building
    const toot = orshinSuugchData.toot ? String(orshinSuugchData.toot).trim() : "";
    const davkhar = orshinSuugchData.davkhar ? String(orshinSuugchData.davkhar).trim() : "";
    const orts = orshinSuugchData.orts ? String(orshinSuugchData.orts).trim() : "";
    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    if (toot && barilgiinId) {
      const baseMatch = { toot, barilgiinId: String(barilgiinId) };
      const baseTootMatch = { toot, barilgiinId: String(barilgiinId) };
      if (davkhar) {
        baseMatch.davkhar = davkhar;
        baseTootMatch.davkhar = davkhar;
      }
      if (orts) {
        baseMatch.orts = orts;
        baseTootMatch.orts = orts;
      }
      const existingToot = await OrshinSuugchModel.findOne({
        $or: [
          baseMatch,
          { toots: { $elemMatch: baseTootMatch } },
        ],
      });
      if (existingToot) {
        throw new Error("Энэ тоот дээр оршин суугч аль хэдийн бүртгэгдсэн байна.");
      }
    }
    const newOrshinSuugch = new OrshinSuugchModel({
      ...orshinSuugchData,
      baiguullagiinId: baiguullagiinId ? String(baiguullagiinId) : undefined,
      barilgiinId: barilgiinId ? String(barilgiinId) : undefined,
      utas: orshinSuugchData.utas || phoneString,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return await newOrshinSuugch.save();
  }
}

// Машины мэдээллийг шинээр хадгалах буюу засварлах функц
async function mashinHadgalya(mashinMedeelel, tukhainBaaziinKholbolt) {
  if (!mashinMedeelel) return null;
  try {
    const mashinId = mashinMedeelel._id;
    if (mashinId) {
      // ID байгаа бол засварлах - зөвхөн өөрчлөгдсөн талбарууд л шинэчлэгдэнэ
      const existingMashin = await ParkingMashin(tukhainBaaziinKholbolt).findById(
        mashinId
      );
      if (existingMashin) {
        const updateFields = {};
        Object.keys(mashinMedeelel).forEach((key) => {
          if (key !== "_id" && key !== "createdAt" && key !== "__v") {
            const newValue = mashinMedeelel[key];
            const oldValue = existingMashin[key];
            if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
              updateFields[key] = newValue;
            }
          }
        });
        if (Object.keys(updateFields).length > 0) { 
          updateFields.updatedAt = new Date();
          return await ParkingMashin(tukhainBaaziinKholbolt).findByIdAndUpdate(
            mashinId,
            { $set: updateFields },
            { new: true }
          );
        }
        return existingMashin;
      } else {
        throw new Error(`ID: ${mashinId} машин олдсонгүй`);
      }
    } else {
      // ID байхгүй бол шинээр хадгална (save ашиглана)
      const { _id, ...mashinData } = mashinMedeelel;
      // Давхцах эсэхийг шалгана
      const existingMashin = await ParkingMashin(tukhainBaaziinKholbolt).findOne({
        dugaar: mashinData.dugaar,
        barilgiinId: mashinData.barilgiinId,
        baiguullagiinId: mashinData.baiguullagiinId,
      });
      if (existingMashin) {
        throw new Error("Энэ дугаартай машин аль хэдийн бүртгэгдсэн байна");
      }
      const MashinModel = ParkingMashin(tukhainBaaziinKholbolt);
      const newMashin = new MashinModel({
        ...mashinData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return await newMashin.save();
    }
  } catch (error) {}
}

/**
 * GET Guest Settings for the current resident
 */
router.get("/zochinSettings", tokenShalgakh, async (req, res, next) => {
  try {
    const Mashin = require("../models/mashin");
    const residentId = req.body.nevtersenAjiltniiToken?.id;
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const Baiguullaga = require("../models/baiguullaga");

    if (!residentId) return res.status(401).send("Нэвтрэх шаардлагатай");

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    let settings = await Mashin(tukhainBaaziinKholbolt).findOne({
      $or: [
        { ezemshigchiinId: residentId },
        { orshinSuugchiinId: residentId },
        { ezemshigchiinId: String(residentId) },
        { orshinSuugchiinId: String(residentId) }
      ],
      zochinTurul: "Оршин суугч"
    });

    // Fallback to building settings if resident specific record doesn't exist or is empty
    let barilgiinId = req.query.barilgiinId || req.body.barilgiinId;
    let baiguullagiinId = req.query.baiguullagiinId || req.body.baiguullagiinId;

    // Auto-discover IDs from ANY source if missing
    if (!baiguullagiinId || !barilgiinId) {
      const OrshinSuugch = require("../models/orshinSuugch");
      // Use findById as it's most reliable for ObjectId tokens
      const resObj = await OrshinSuugch(db.erunkhiiKholbolt).findById(residentId) || 
                     await OrshinSuugch(db.erunkhiiKholbolt).findOne({
                        $or: [{ _id: residentId }, { id: String(residentId) }]
                     });
      
      if (resObj) {
        // IDs are stored inside the 'toots' array in this system
        if (resObj.toots && resObj.toots.length > 0) {
           const primaryToot = resObj.toots[0]; // Use first address as default
           baiguullagiinId = primaryToot.baiguullagiinId;
           barilgiinId = primaryToot.barilgiinId;
        } else {
           baiguullagiinId = resObj.baiguullagiinId;
           barilgiinId = resObj.barilgiinId;
        }
      }
    }

    let buildingSettings = null;
    if (baiguullagiinId && barilgiinId) {
       const baiguullagaRecord = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId);
       const targetBarilga = baiguullagaRecord?.barilguud?.find(
         (b) => String(b._id) === String(barilgiinId)
       );
       buildingSettings = targetBarilga?.zochinTokhirgoo || targetBarilga?.tokhirgoo?.zochinTokhirgoo;
    }

    // Merge: Resident settings take priority for custom needs, but Building settings can provide defaults
    if (settings || buildingSettings) {
      const mergedRes = (settings ? settings.toObject() : { ...buildingSettings, isFallback: true });

      // If both exist, we can take the BEST of both (e.g. max quota)
      if (settings && buildingSettings) {
        mergedRes.zochinErkhiinToo = Math.max(settings.zochinErkhiinToo || 0, buildingSettings.zochinErkhiinToo || 0);
        mergedRes.zochinTusBurUneguiMinut = Math.max(settings.zochinTusBurUneguiMinut || 0, buildingSettings.zochinTusBurUneguiMinut || 0);
        mergedRes.zochinUrikhEsekh = settings.zochinUrikhEsekh || buildingSettings.zochinUrikhEsekh;
      }

      return res.send(mergedRes);
    }

    res.send({});
  } catch (error) {
    next(error);
  }
});

/**
 * GET Quota Status for the current resident
 */
router.get("/zochinQuotaStatus", tokenShalgakh, async (req, res, next) => {
  try {
    const Mashin = require("../models/mashin");
    // const EzenUrisanMashin = require("../models/ezenUrisanMashin"); // Using sdk version instead
    const residentId = req.body.nevtersenAjiltniiToken?.id;
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const baiguullagiinId = req.query.baiguullagiinId || req.body.baiguullagiinId;
    const barilgiinId = req.query.barilgiinId || req.body.barilgiinId;

    if (!residentId) return res.status(401).send("Нэвтрэх шаардлагатай");

    console.log(`🔍 [QUOTA] Looking for resident settings. User: ${residentId}, Org: ${baiguullagiinId}, Bldg: ${barilgiinId}`);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const query = {
      $or: [
        { ezemshigchiinId: String(residentId) },
        { orshinSuugchiinId: String(residentId) }
      ],
      zochinTurul: "Оршин суугч"
    };

    // Filter by organization and building if provided
    if (baiguullagiinId) {
      query.baiguullagiinId = String(baiguullagiinId);
    }
    if (barilgiinId) {
      query.barilgiinId = String(barilgiinId);
    }

    let masterSetting = await Mashin(tukhainBaaziinKholbolt).findOne(query);

    // Initial Fallback: Resident search only
    if (!masterSetting) {
      console.log("🔍 [QUOTA] Master setting not found with filters, trying resident-only search...");
      masterSetting = await Mashin(tukhainBaaziinKholbolt).findOne({
        $or: [
          { ezemshigchiinId: residentId },
          { orshinSuugchiinId: residentId }
        ],
        zochinTurul: "Оршин суугч"
      });
    }

    // Secondary Fallback: Building settings (using Baiguullaga model)
    const Baiguullaga = require("../models/baiguullaga");
    const { db } = require("zevbackv2");
    let buildingSettings = null;
    
    // 1. Resolve IDs from profile if they failed initially
    if (!baiguullagiinId || !barilgiinId) {
      const OrshinSuugch = require("../models/orshinSuugch");
      // CRITICAL: Look in the Tenant DB (tukhainBaaziinKholbolt), not the Master DB
      const rObj = await OrshinSuugch(req.body.tukhainBaaziinKholbolt).findById(residentId) ||
                   await OrshinSuugch(req.body.tukhainBaaziinKholbolt).findOne({
                      $or: [{ _id: residentId }, { id: String(residentId) }]
                   });

      if (rObj && rObj.toots && rObj.toots.length > 0) {
        baiguullagiinId = baiguullagiinId || rObj.toots[0].baiguullagiinId;
        barilgiinId = barilgiinId || rObj.toots[0].barilgiinId;
      }
    }

    if (baiguullagiinId) {
       const baiguullagaRecord = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId);
       
       // Brute-force building lookup
       let targetBarilga = null;
       if (barilgiinId) {
           targetBarilga = baiguullagaRecord?.barilguud?.id(barilgiinId) || 
                          baiguullagaRecord?.barilguud?.find(b => String(b._id) === String(barilgiinId));
       }
       
       // Deep fallback: If building ID is still missing or not found, try the first building of the org
       if (!targetBarilga && baiguullagaRecord?.barilguud?.length > 0) {
           targetBarilga = baiguullagaRecord.barilguud[0];
       }

       buildingSettings = targetBarilga?.zochinTokhirgoo || targetBarilga?.tokhirgoo?.zochinTokhirgoo;
    }

    if (!masterSetting && !buildingSettings) {
      return res.send({ total: 0, used: 0, remaining: 0, success: false });
    }

    // Merge logic: Final Effective Config
    const effectiveTotal = Math.max(
      masterSetting?.zochinErkhiinToo || 0,
      buildingSettings?.zochinErkhiinToo || 0
    );
    const effectiveType = masterSetting?.davtamjiinTurul || buildingSettings?.davtamjiinTurul || "saraar";
    const effectiveValue = masterSetting?.davtamjUtga || buildingSettings?.davtamjUtga || 1;
    const effectiveMinutes = Math.max(
      masterSetting?.zochinTusBurUneguiMinut || 0,
      buildingSettings?.zochinTusBurUneguiMinut || 0
    );
    const hasRight = (masterSetting?.zochinUrikhEsekh || buildingSettings?.zochinUrikhEsekh) === true;


    let startOfPeriod;

    if (effectiveType === "udruur") {
      startOfPeriod = moment().startOf("day").toDate();
    } 
    else if (effectiveType === "7khonogoor") {
      startOfPeriod = moment().startOf("week").toDate(); 
    }
    else if (effectiveType === "saraar") {
      let candidate = moment().date(effectiveValue || 1).startOf('day');
      if (moment().isBefore(candidate)) {
        candidate.subtract(1, 'month');
      }
      startOfPeriod = candidate.toDate();
    }
    else if (effectiveType === "jileer") {
      const targetMonth = (effectiveValue || 1) - 1; 
      let candidate = moment().month(targetMonth).date(1).startOf('day');
      if (moment().isBefore(candidate)) {
        candidate.subtract(1, 'year');
      }
      startOfPeriod = candidate.toDate();
    } 
    else {
      startOfPeriod = moment().startOf("month").toDate();
    }

    const EzenUrisanMashinModel = require("sukhParking-v1").EzenUrisanMashin;
    // tukhainBaaziinKholbolt is already defined above at line 276

    // EXTREMELY ROBUST usedCount lookup
    const usedMatchQuery = {
      $or: [
        { ezenId: residentId },
        { ezemshigchiinId: residentId },
        { ezenId: String(residentId) },
        { ezemshigchiinId: String(residentId) }
      ],
      createdAt: { $gte: startOfPeriod }
    };

    if (baiguullagiinId) {
       usedMatchQuery.baiguullagiinId = String(baiguullagiinId);
    }

    const usedCount = await EzenUrisanMashinModel(tukhainBaaziinKholbolt).countDocuments(usedMatchQuery);

    res.send({
      total: effectiveTotal,
      used: Math.min(usedCount, effectiveTotal),
      remaining: Math.max(0, effectiveTotal - usedCount),
      period: effectiveType,
      freeMinutesPerGuest: effectiveMinutes,
      hasRight: hasRight,
      zochinUrikhEsekh: hasRight,
      success: true
    });
  } catch (error) {
    next(error);
  }
});

// Үндсэн route функц
router.post("/zochinHadgalya", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    let {
      mashiniiDugaar,
      baiguullagiinId,
      barilgiinId,
      ezemshigchiinUtas,
      ezemshigchiinId,
      tukhainBaaziinKholbolt,
      orshinSuugchMedeelel,
      khariltsagchMedeelel,
      orshinSuugchTurul,
      mashinMedeelel,
    } = req.body;

    // Fix: Map khariltsagchMedeelel to orshinSuugchMedeelel if implicit
    if (!orshinSuugchMedeelel && khariltsagchMedeelel) {
      orshinSuugchMedeelel = khariltsagchMedeelel;
    }

    // Sanitize ezemshigchiinUtas to be a string
    const phoneString = Array.isArray(ezemshigchiinUtas) ? ezemshigchiinUtas[0] : String(ezemshigchiinUtas).trim();

    // Map root-level fields to orshinSuugchMedeelel if missing (Support various App payloads)
    if (orshinSuugchMedeelel) {
      if (!orshinSuugchMedeelel.ner && req.body.ezemshigchiinNer) {
        orshinSuugchMedeelel.ner = req.body.ezemshigchiinNer;
      }
      if (!orshinSuugchMedeelel.utas) {
        orshinSuugchMedeelel.utas = phoneString;
      }
      if (!orshinSuugchMedeelel.register && req.body.ezemshigchiinRegister) {
        orshinSuugchMedeelel.register = req.body.ezemshigchiinRegister;
      }
    }

    let inviterSettings = null;
    const inviterId = req.body.nevtersenAjiltniiToken?.id;
    const requesterRole = req.body.nevtersenAjiltniiToken?.erkh;

    // Fetch inviter's master settings (Primary resident car info)
    let existingPrimary = null;
    if (inviterId) {
        const Mashin = require("../models/mashin");
        
        const settingsQuery = {
            ezemshigchiinId: inviterId,
            zochinTurul: "Оршин суугч"
        };
        if (baiguullagiinId) {
            settingsQuery.baiguullagiinId = String(baiguullagiinId);
        }

        existingPrimary = await Mashin(tukhainBaaziinKholbolt).findOne(settingsQuery);
    }

    // Determine if this is the Resident's own car or a Guest invitation
    const isResidentCar = orshinSuugchMedeelel?.zochinTurul === "Оршин суугч" || 
                         (existingPrimary && existingPrimary.dugaar === mashiniiDugaar);

    // 1. PLATE CHANGE RESTRICTION: Resident primary car
    if (inviterId && isResidentCar) {
        if (existingPrimary && existingPrimary.mashiniiDugaar !== mashiniiDugaar) {
            // App side restriction
            if (requesterRole === "OrshinSuugch") {
                const oneMonthAgo = moment().subtract(1, 'month');
                if (existingPrimary.dugaarUurchilsunOgnoo && moment(existingPrimary.dugaarUurchilsunOgnoo).isAfter(oneMonthAgo)) {
                    return res.status(403).json({ success: false, message: "Машины дугаарыг сард нэг удаа өөрчлөх боломжтой" });
                }
                // Mark update time for resident-side change
                if (orshinSuugchMedeelel) orshinSuugchMedeelel.dugaarUurchilsunOgnoo = new Date();
            }
        }
    }

    // 2. QUOTA CHECK: If we are inviting a guest car
    if (inviterId && !isResidentCar) {
        inviterSettings = existingPrimary; // Use the settings we already fetched

        if (inviterSettings) {
            if (!inviterSettings.zochinUrikhEsekh) {
                return res.status(403).json({ success: false, message: "Танд зочин урих эрх байхгүй байна" });
            }

            let startOfPeriod;
            if (inviterSettings.davtamjiinTurul === "udruur") {
                startOfPeriod = moment().startOf("day").toDate();
            } else if (inviterSettings.davtamjiinTurul === "7khonogoor") {
                startOfPeriod = moment().startOf("week").toDate();
            } else if (inviterSettings.davtamjiinTurul === "saraar") {
                const targetDay = inviterSettings.davtamjUtga || 1; 
                let candidate = moment().date(targetDay).startOf('day');
                if (moment().isBefore(candidate)) candidate.subtract(1, 'month');
                startOfPeriod = candidate.toDate();
            } else if (inviterSettings.davtamjiinTurul === "jileer") {
                const targetMonth = (inviterSettings.davtamjUtga || 1) - 1;
                let candidate = moment().month(targetMonth).date(1).startOf('day');
                if (moment().isBefore(candidate)) candidate.subtract(1, 'year');
                startOfPeriod = candidate.toDate();
            } else {
                startOfPeriod = moment().startOf("month").toDate();
            }
            const usedCount = await EzenUrisanMashin(tukhainBaaziinKholbolt).countDocuments({
                ezenId: inviterId,
                createdAt: { $gte: startOfPeriod }
            });

            if (usedCount >= (inviterSettings.zochinErkhiinToo || 0)) {
                // If every guest has free minutes (e.g. 30min free), allow invitation even if quota is exhausted
                if (!(inviterSettings.zochinTusBurUneguiMinut > 0)) {
                    return res.status(403).json({ success: false, message: "Таны зочин урих лимит дууссан байна" });
                }
            }

            // AFFECT MINUTE: Inherit free minutes from inviter to guest car
            if (inviterSettings.zochinTusBurUneguiMinut) {
                orshinSuugchMedeelel.zochinTusBurUneguiMinut = inviterSettings.zochinTusBurUneguiMinut;
            }
        }
    }

    let orshinSuugchResult = null;
    let mashinResult = null;
    let orshinSuugchMashinResult = null;

    // Харилцагчийн мэдээллийг хадгална/засварлана
    if (orshinSuugchMedeelel) {
      try {
        const residentData = { ...orshinSuugchMedeelel };
        delete residentData.zochinUrikhEsekh;
        delete residentData.zochinTurul;
        delete residentData.davtamjiinTurul;
        delete residentData.mashiniiDugaar;
        delete residentData.dugaarUurchilsunOgnoo;
        delete residentData.ezenToot;
        delete residentData.zochinTailbar;
        delete residentData.zochinErkhiinToo;
        delete residentData.zochinTusBurUneguiMinut;
        delete residentData.zochinNiitUneguiMinut;

        // If ezemshigchiinId provided in root body, use it for lookup
        if (ezemshigchiinId && !residentData._id) {
          residentData._id = ezemshigchiinId;
        }

        const isResidentType = orshinSuugchMedeelel.orshinSuugchTurul === "Оршин суугч" || 
                               orshinSuugchMedeelel.zochinTurul === "Оршин суугч" || 
                               req.body.turul === "Оршин суугч";

        if (residentData._id) {
            orshinSuugchResult = await OrshinSuugch(db.erunkhiiKholbolt).findById(residentData._id);
        } else if (isResidentType) {
            const query = { utas: phoneString, baiguullagiinId: String(baiguullagiinId) };
            orshinSuugchResult = await OrshinSuugch(db.erunkhiiKholbolt).findOne(query);
            
            if (!orshinSuugchResult) {
                return res.status(403).json({ 
                    success: false, 
                    message: "Энэ дугаар дээр оршин суугч бүртгэгдээгүй байна. Та эхлээд оршин суугчийг бүртгэлийн хэсгээс бүртгэнэ үү." 
                });
            }
        } else {
            orshinSuugchResult = null;
        }

        console.log(`🔍 [ZOCHIN_HADGALYA] orshinSuugchResult:`, orshinSuugchResult ? { id: orshinSuugchResult._id, ner: orshinSuugchResult.ner, toot: orshinSuugchResult.toot } : "NULL (Skipped)");

        // Also save to Mashin (Vehicle with Guest/Resident Settings)
        if (orshinSuugchResult || !isResidentType) {
          const Mashin = require("../models/mashin");
          
          // Fetch defaults from Baiguullaga/Barilga if not provided
          const Baiguullaga = require("../models/baiguullaga");
          const { db } = require("zevbackv2");
          const baiguullagaObj = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId);
          let defaults = baiguullagaObj?.tokhirgoo?.zochinTokhirgoo || {};
          if (barilgiinId && baiguullagaObj?.barilguud) {
            const barilga = baiguullagaObj.barilguud.find(b => String(b._id) === String(barilgiinId));
            if (barilga?.tokhirgoo?.zochinTokhirgoo) {
               const buildingSettings = barilga.tokhirgoo.zochinTokhirgoo;
               const orgSettings = baiguullagaObj?.tokhirgoo?.zochinTokhirgoo || {};
               const defaultSettings = buildingSettings && buildingSettings.zochinUrikhEsekh !== undefined
                 ? buildingSettings 
                 : orgSettings;

              console.log("🔍 [AUTO-ZOCHIN] Default Settings selected:", !!defaultSettings);
              if (defaultSettings) {
                defaults = defaultSettings;
              }
            }
          }
          
          const updateData = {
            baiguullagiinId: baiguullagiinId.toString(),
            barilgiinId: barilgiinId.toString(),
            dugaar: orshinSuugchMedeelel.mashiniiDugaar || mashiniiDugaar,
            ezemshigchiinId: orshinSuugchResult ? orshinSuugchResult._id.toString() : undefined,
            orshinSuugchiinId: orshinSuugchResult ? orshinSuugchResult._id.toString() : undefined,
            ezemshigchiinNer: orshinSuugchResult ? orshinSuugchResult.ner : (orshinSuugchMedeelel.ner || ""),
            ezemshigchiinUtas: phoneString,
            zochinUrikhEsekh: orshinSuugchMedeelel.zochinUrikhEsekh !== undefined ? orshinSuugchMedeelel.zochinUrikhEsekh : defaults.zochinUrikhEsekh,
            zochinTurul: req.body.zochinTurul || req.body.turul || orshinSuugchMedeelel.orshinSuugchTurul || orshinSuugchMedeelel.turul || orshinSuugchMedeelel.zochinTurul || defaults.zochinTurul || "Оршин суугч",
            turul: req.body.turul || req.body.zochinTurul || orshinSuugchMedeelel.orshinSuugchTurul || orshinSuugchMedeelel.turul || orshinSuugchMedeelel.zochinTurul || defaults.zochinTurul || "Оршин суугч",
            davtamjiinTurul: orshinSuugchMedeelel.davtamjiinTurul || defaults.davtamjiinTurul || "saraar",
            dugaarUurchilsunOgnoo: orshinSuugchMedeelel.dugaarUurchilsunOgnoo,
            ezenToot: orshinSuugchResult ? orshinSuugchResult.toot : (orshinSuugchMedeelel.ezenToot || "-"),
            zochinTailbar: orshinSuugchMedeelel.zochinTailbar || defaults.zochinTailbar,
            davtamjUtga: orshinSuugchMedeelel.davtamjUtga !== undefined ? orshinSuugchMedeelel.davtamjUtga : defaults.davtamjUtga,
            utas: phoneString,
          };
          
          if (requesterRole !== 'OrshinSuugch') {
            updateData.zochinErkhiinToo = orshinSuugchMedeelel.zochinErkhiinToo !== undefined ? orshinSuugchMedeelel.zochinErkhiinToo : defaults.zochinErkhiinToo;
            updateData.zochinTusBurUneguiMinut = orshinSuugchMedeelel.zochinTusBurUneguiMinut !== undefined ? orshinSuugchMedeelel.zochinTusBurUneguiMinut : defaults.zochinTusBurUneguiMinut;
            updateData.zochinNiitUneguiMinut = orshinSuugchMedeelel.zochinNiitUneguiMinut !== undefined ? orshinSuugchMedeelel.zochinNiitUneguiMinut : defaults.zochinNiitUneguiMinut;
          }

          Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

          // Define filter for upsert
          let filter = {};
          if (orshinSuugchResult) {
            filter.ezemshigchiinId = orshinSuugchResult._id.toString();
            filter.dugaar = updateData.dugaar;
          } else {
            // Standalone car (Sukh, Staff, etc.) - find by plate and organization
            filter.dugaar = updateData.dugaar;
            filter.baiguullagiinId = baiguullagiinId.toString();
            filter.ezemshigchiinUtas = phoneString;
          }

           // 1. Identify TARGET document to update (Resident Car Strategy)
           // We try to find if we are updating an existing resident car, regardless of what 'turul' the frontend sent
           let targetCarId = null;

           // A: Explicit ID provided
           if (mashinMedeelel && mashinMedeelel._id) {
               console.log("ℹ️ [ZOCHIN_HADGALYA] Target by ID:", mashinMedeelel._id);
               targetCarId = mashinMedeelel._id;
           } 
           else if (orshinSuugchResult) {
                // B: Check for Placeholder "БҮРТГЭЛГҮЙ"
                const placeholderCar = await Mashin(tukhainBaaziinKholbolt).findOne({
                   ezemshigchiinId: orshinSuugchResult._id.toString(),
                   zochinTurul: "Оршин суугч",
                   dugaar: "БҮРТГЭЛГҮЙ"
                });

                if (placeholderCar) {
                   console.log("ℹ️ [ZOCHIN_HADGALYA] Target by Placeholder:", placeholderCar._id);
                   targetCarId = placeholderCar._id;
                }
                else {
                   // C: Check for Single Resident Car (Implicit Edit)
                   const residentCars = await Mashin(tukhainBaaziinKholbolt).find({
                      ezemshigchiinId: orshinSuugchResult._id.toString(),
                      zochinTurul: "Оршин суугч"
                   });

                   // Check exact match (saving same plate)
                   const exactMatch = await Mashin(tukhainBaaziinKholbolt).findOne({
                      ezemshigchiinId: orshinSuugchResult._id.toString(),
                      dugaar: updateData.dugaar
                   });
                   
                   if (exactMatch) {
                      // If exact match found, update that one
                      targetCarId = exactMatch._id;
                   } 
                   else if (residentCars.length === 1) {
                       // If no exact match but user has exactly one resident car, update it (rename)
                       console.log("ℹ️ [ZOCHIN_HADGALYA] Target by Single Car strategy:", residentCars[0]._id);
                       targetCarId = residentCars[0]._id;
                   }
                }
            }

            // 2. Logic Branching
            if (targetCarId) {
                // UPDATE EXISTING RESIDENT CAR
                filter = { _id: targetCarId };
                
                // FORCE "Оршин суугч" type if we are updating a resident owner's primary car
                // Only do this if it's actually linked to a Resident profile
                if (orshinSuugchResult && (!updateData.zochinTurul || updateData.zochinTurul !== 'Оршин суугч')) {
                     console.log("ℹ️ [ZOCHIN_HADGALYA] Forcing type to 'Оршин суугч' for resident vehicle update.");
                     updateData.zochinTurul = "Оршин суугч";
                     updateData.turul = "Оршин суугч";
                }
            } else {
                 // CREATE NEW / UPDATE GUEST CAR
                 // If not targeting an existing resident car, strictly follow the input data
                 
                 // If plate is not provided, treat as generic update
                 if (!updateData.dugaar) {
                    filter = {
                        ...(orshinSuugchResult ? { ezemshigchiinId: orshinSuugchResult._id.toString() } : { baiguullagiinId: baiguullagiinId.toString(), ezemshigchiinUtas: phoneString }),
                        zochinTurul: updateData.zochinTurul
                    };
                 } else {
                    // Updating/Creating by Plate Number
                    filter = {
                        ...(orshinSuugchResult ? { ezemshigchiinId: orshinSuugchResult._id.toString() } : { baiguullagiinId: baiguullagiinId.toString(), ezemshigchiinUtas: phoneString }),
                        dugaar: updateData.dugaar
                    };
                    
                    // Only apply Resident Car Limit if we are trying to add a NEW "Оршин суугч" car
                    if (updateData.zochinTurul === "Оршин суугч" && orshinSuugchResult) {
                         filter.zochinTurul = "Оршин суугч";
                         
                         const limit = defaults.orshinSuugchMashiniiLimit || 1; 
                         const currentCount = await Mashin(tukhainBaaziinKholbolt).countDocuments({
                            ...(orshinSuugchResult ? { ezemshigchiinId: orshinSuugchResult._id.toString() } : { baiguullagiinId: baiguullagiinId.toString(), ezemshigchiinUtas: phoneString }),
                            zochinTurul: "Оршин суугч"
                         });

                         if (currentCount >= limit) {
                           return res.status(403).json({
                             success: false,
                             message: `Таны машины бүртгэлийн лимит (${limit}) хэтэрсэн байна.`,
                           });
                         }
                    }
                 }
            }

          console.log(`🔍 [ZOCHIN_HADGALYA] Upserting Mashin with filter:`, filter);
          mashinResult = await Mashin(tukhainBaaziinKholbolt).findOneAndUpdate(
            filter,
            { $set: updateData },
            { upsert: true, new: true }
          );
          console.log(`✅ [ZOCHIN_HADGALYA] Mashin saved, ID:`, mashinResult?._id);

          // TRACK USAGE: Create EzenUrisanMashin record if it was an invitation
          if (inviterId && inviterSettings) {
             const newInvitation = new EzenUrisanMashin(tukhainBaaziinKholbolt)({
                baiguullagiinId: baiguullagiinId,
                ezenId: inviterId,
                urisanMashiniiDugaar: mashiniiDugaar,
                tuluv: 0,
                ognoo: new Date()
             });
             await newInvitation.save();
             console.log("✅ [QUOTA] Invitation recorded for", inviterId);
          }

          console.log("✅ [ZOCHIN_URI] Success. OrshinSuugchMashin saved/updated.");
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Харилцагч хадгалахад алдаа: ${error.message}`,
        });
      }
    }

    // Машины мэдээллийг хадгална/засварлана
    if (!mashinResult && mashinMedeelel && mashiniiDugaar && mashiniiDugaar !== "БҮРТГЭЛГҮЙ") {
      try {
        mashinResult = await mashinHadgalya(
          mashinMedeelel,
          tukhainBaaziinKholbolt
        );
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Машин хадгалахад алдаа: ${error.message}`,
        });
      }
    } else if (!mashinResult && mashiniiDugaar && mashiniiDugaar !== "БҮРТГЭЛГҮЙ") {
      const Mashin = require("../models/mashin");
      // Машины мэдээлэл байхгүй бол анхны логикоор шинээр үүсгэнэ
      var existingMashin = await Mashin(tukhainBaaziinKholbolt).findOne({
        dugaar: mashiniiDugaar,
        baiguullagiinId: baiguullagiinId,
        ezemshigchiinUtas: phoneString,
      });

      if (existingMashin) {
        return res.status(409).json({
          success: false,
          message: "Энэ машин аль хэдийн бүртгэгдсэн байна",
        });
      }

      const newVehicleData = {
        baiguullagiinId: baiguullagiinId.toString(),
        barilgiinId: barilgiinId,
        dugaar: mashiniiDugaar,
        ezemshigchiinUtas: phoneString,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      var gereeObject = await Geree(tukhainBaaziinKholbolt, true).findOne({
        baiguullagiinId: baiguullagiinId,
        utas: phoneString,
        tuluv: { $ne: -1 },
      });
      if (gereeObject) {
        newVehicleData.ezemshigchiinRegister = gereeObject.register;
        newVehicleData.ezemshigchiinTalbainDugaar =
          gereeObject.ezemshigchiinTalbainDugaar || "";
        newVehicleData.gereeniiDugaar = gereeObject.gereeniiDugaar || "";
      }

      const newMashin = new Mashin(tukhainBaaziinKholbolt)(newVehicleData);
      mashinResult = await newMashin.save();
    }

    // Машины жагсаалт боловсруулах
    const mashiniiJagsaalt = [mashinResult];

    console.log("✅ [ZOCHIN_URI] Success. OrshinSuugch:", orshinSuugchResult ? orshinSuugchResult._id : "NULL");
    console.log("✅ [ZOCHIN_URI] Success. Mashin:", mashinResult ? mashinResult._id : "NULL");

    res.status(201).json({
      success: true,
      message: "Мэдээлэл амжилттай хадгалагдлаа",
      data: {
        orshinSuugch: orshinSuugchResult,
        mashin: mashinResult,
        jagsaalt: mashiniiJagsaalt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Серверийн алдаа гарлаа",
    });
    if (next) next(error);
  }
});

router.post("/ezenUrisanTuukh", tokenShalgakh, async (req, res, next) => {
  try {
    const searchId = req.body.ezenId || req.body.nevtersenAjiltniiToken?.id;
    if (!searchId) {
      return res.send({ ezenList: [], jagsaalt: [] });
    }

    var ezenJagsaalt = await EzenUrisanMashin(
      req.body.tukhainBaaziinKholbolt
    ).find({
      baiguullagiinId: req.body.baiguullagiinId,
      $or: [{ ezenId: searchId }, { ezemshigchiinId: searchId }],
    });

    var jagsaalt = [];
    if (ezenJagsaalt?.length > 0) {
      const invitationIds = ezenJagsaalt.map((e) => String(e._id));
      const plateNumbers = ezenJagsaalt.map((e) => e.urisanMashiniiDugaar);

      jagsaalt = await Uilchluulegch(
        req.body.tukhainBaaziinKholbolt,
        true
      ).find({
        baiguullagiinId: req.body.baiguullagiinId,
        $or: [
          { "urisanMashin._id": { $in: invitationIds } },
          {
            $and: [
              { mashiniiDugaar: { $in: plateNumbers } },
              {
                $or: [
                  { "urisanMashin.ezenId": searchId },
                  { "urisanMashin.ezemshigchiinId": searchId },
                ],
              },
            ],
          },
        ],
      });
    }
    var ezenList = ezenJagsaalt?.filter((a) => a.tuluv == 0);
    res.send({ ezenList, jagsaalt });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "ezenUrisanTuukh алдаа гарлаа",
    });
    if (next) next(error);
  }
});

router.get("/zochinJagsaalt", tokenShalgakh, async (req, res, next) => {
  try {
    const OrshinSuugch = require("../models/orshinSuugch");
    const Mashin = require("../models/mashin");
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const { db } = require("zevbackv2");
    
    const page = parseInt(req.query.khuudasniiDugaar) || 1;
    const limit = parseInt(req.query.khuudasniiKhemjee) || 50;
    const skip = (page - 1) * limit;
    const baiguullagiinId = req.query.baiguullagiinId;
    const barilgiinId = req.query.barilgiinId;

    if (!baiguullagiinId) {
      return res.status(400).send("baiguullagiinId required");
    }

    // 1. Fetch all Mashin records for this building/org
    const mashinQuery = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) mashinQuery.barilgiinId = String(barilgiinId);
    
    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      mashinQuery.$and = [
        { baiguullagiinId: String(baiguullagiinId) },
        {
          $or: [
            { dugaar: regex },
            { mashiniiDugaar: regex },
            { ezemshigchiinNer: regex },
            { ezemshigchiinUtas: regex },
            { ezenToot: regex }
          ]
        }
      ];
      if (barilgiinId) mashinQuery.$and.push({ barilgiinId: String(barilgiinId) });
    }

    // New Specific Filters
    if (req.query.turul && req.query.turul !== "Бүгд") {
      mashinQuery.$or = [
        { turul: req.query.turul },
        { zochinTurul: req.query.turul }
      ];
    }
    if (req.query.toot) {
      mashinQuery.ezenToot = { $regex: req.query.toot, $options: 'i' };
    }

    const allParkingRecords = await Mashin(tukhainBaaziinKholbolt).find(mashinQuery).sort({ createdAt: -1 }).lean();

    // 2. Fetch all Residents for this building/org (to catch those without cars)
    const resFilters = [];
    resFilters.push({ baiguullagiinId: String(baiguullagiinId) });

    if (barilgiinId) {
      resFilters.push({
        $or: [
          { barilgiinId: String(barilgiinId) },
          { "toots.barilgiinId": String(barilgiinId) }
        ]
      });
    }

    if (req.query.search) {
      const regex = new RegExp(req.query.search, 'i');
      resFilters.push({
        $or: [
          { ner: regex },
          { orshinSuugchNer: regex },
          { utas: regex },
          { toot: regex },
          { "toots.toot": regex }
        ]
      });
    }

    // turul filter: OrshinSuugch has no turul field, so we use Mashin records
    // to find which residents belong to a specific turul category
    if (req.query.turul && req.query.turul !== "Бүгд") {
      // Get resident IDs that have matching Mashin records
      const matchingResidentIds = allParkingRecords
        .filter(p => p.ezemshigchiinId)
        .map(p => String(p.ezemshigchiinId));
      
      if (matchingResidentIds.length > 0) {
        const { ObjectId } = require("mongoose").Types;
        const objectIds = matchingResidentIds
          .filter(id => ObjectId.isValid(id))
          .map(id => new ObjectId(id));
        resFilters.push({ _id: { $in: objectIds } });
      } else {
        // No matching parking records found, so no residents should be shown
        resFilters.push({ _id: null });
      }
    }

    if (req.query.orts) {
      resFilters.push({
        $or: [
          { orts: req.query.orts },
          { "toots.orts": req.query.orts }
        ]
      });
    }
    if (req.query.toot) {
      resFilters.push({
        $or: [
          { toot: { $regex: req.query.toot, $options: 'i' } },
          { "toots.toot": { $regex: req.query.toot, $options: 'i' } }
        ]
      });
    }

    const finalResQuery = resFilters.length > 1 ? { $and: resFilters } : resFilters[0];

    const residents = await OrshinSuugch(db.erunkhiiKholbolt).find(finalResQuery).sort({ createdAt: -1 }).limit(limit).skip(skip).lean();
    const residentTotal = await OrshinSuugch(db.erunkhiiKholbolt).countDocuments(finalResQuery);

    // 3. Map residents to their parking records
    const residentIds = residents.map(r => String(r._id));
    const parkingMap = {};
    
    const linkedParking = await Mashin(tukhainBaaziinKholbolt).find({
        ezemshigchiinId: { $in: residentIds }
    }).lean();

    linkedParking.forEach(p => {
        if (p.ezemshigchiinId) parkingMap[String(p.ezemshigchiinId)] = p;
    });

    // 4. Merge Data
    const mergedData = residents.map(resObj => {
        const p = parkingMap[String(resObj._id)];
        return {
          _id: p?._id || resObj._id,
          ezemshigchiinId: resObj._id,
          createdAt: p?.createdAt || resObj.createdAt,
          ner: resObj.ner || resObj.orshinSuugchNer || "БҮРТГЭЛГҮЙ",
          ovog: resObj.ovog || "",
          utas: resObj.utas || (Array.isArray(resObj.utas) ? resObj.utas[0] : ""),
          mashiniiDugaar: p?.dugaar || "",
          zochinTurul: p?.zochinTurul || p?.turul || "Оршин суугч",
          zochinTailbar: p?.zochinTailbar || "",
          ezenToot: p?.ezenToot || resObj.toot || (resObj.toots && resObj.toots[0]?.toot) || "", 
          orts: resObj.orts || (resObj.toots && resObj.toots[0]?.orts) || "",
          davtamjiinTurul: p?.davtamjiinTurul || "saraar",
          baiguullagiinId: resObj.baiguullagiinId || null,
          barilgiinId: resObj.barilgiinId || null,
          burtgesenAjiltaniiNer: p?.burtgesenAjiltaniiNer || resObj.burtgesenAjiltaniiNer || "-",
          zochinErkhiinToo: p?.zochinErkhiinToo,
          zochinTusBurUneguiMinut: p?.zochinTusBurUneguiMinut
        };
    });

    // 5. Add standalone cars (like Sukh/Staff)
    allParkingRecords.forEach(p => {
        // Apply toot filter to standalone cars if provided
        if (req.query.toot) {
            const tootRegex = new RegExp(req.query.toot, 'i');
            if (!tootRegex.test(p.ezenToot || "")) return;
        }

        // If orts filter is active, standalone cars (which have no orts) should be hidden
        if (req.query.orts) return;

        const isAlreadyIn = mergedData.some(m => String(m._id) === String(p._id));
        if (!isAlreadyIn) {
            mergedData.push({
                _id: p._id,
                ezemshigchiinId: p.ezemshigchiinId || null,
                createdAt: p.createdAt,
                ner: p.ezemshigchiinNer || "БҮРТГЭЛГҮЙ",
                ovog: "",
                utas: p.ezemshigchiinUtas || p.utas || "",
                mashiniiDugaar: p.dugaar || "",
                zochinTurul: p.zochinTurul || p.turul || "",
                zochinTailbar: p.zochinTailbar || "",
                ezenToot: p.ezenToot || "-",
                orts: "",
                davtamjiinTurul: p.davtamjiinTurul || "saraar",
                baiguullagiinId: p.baiguullagiinId || null,
                barilgiinId: p.barilgiinId || null,
                burtgesenAjiltaniiNer: p.burtgesenAjiltaniiNer || "-",
                zochinErkhiinToo: p.zochinErkhiinToo,
                zochinTusBurUneguiMinut: p.zochinTusBurUneguiMinut
            });
        }
    });

    res.status(200).json({
      success: true,
      jagsaalt: mergedData,
      niitMur: residentTotal + (allParkingRecords.length - linkedParking.length)
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
