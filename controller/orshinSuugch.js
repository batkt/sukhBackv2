const asyncHandler = require("express-async-handler");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const NevtreltiinTuukh = require("../models/nevtreltiinTuukh");
const MsgTuukh = require("../models/msgTuukh");
const IpTuukh = require("../models/ipTuukh");
const BatalgaajuulahCode = require("../models/batalgaajuulahCode");
const Geree = require("../models/geree");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const aldaa = require("../components/aldaa");
const request = require("request");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const addressService = require("../services/addressService");
const walletApiService = require("../services/walletApiService");
const {
  findOrCreateBarilgaFromWallet,
  CENTRALIZED_ORG_ID,
} = require("./negdsenSan");
const NekhemjlekhCron = require("../models/cronSchedule");
const { calculateNextDueDate } = require("../utils/dateUtils");

/**
 * Helper to get the correct due date based on billing cycle
 */
const getDueOgnooHelper = async (kholbolt, baiguullagiinId, barilgiinId) => {
  try {
    const cronSchedule = await NekhemjlekhCron(kholbolt).findOne({
      baiguullagiinId: String(baiguullagiinId),
      $or: [{ barilgiinId: barilgiinId ? String(barilgiinId) : null }, { barilgiinId: null }]
    }).sort({ barilgiinId: -1 });

    if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
      return calculateNextDueDate(cronSchedule.nekhemjlekhUusgekhOgnoo);
    }
  } catch (err) {
    console.error("Error in getDueOgnooHelper:", err);
  }
  return new Date();
};

// ... existing code ...

const useragent = require("express-useragent");

async function verifyCodeHelper(baiguullagiinId, utas, code) {
  const { db } = require("zevbackv2");

  if (code.length !== 4 || !/^\d+$/.test(code)) {
    return {
      success: false,
      message: "Код буруу байна!",
    };
  }

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (kholbolt) => String(kholbolt.baiguullagiinId) === String(baiguullagiinId),
  );

  if (!tukhainBaaziinKholbolt) {
    return {
      success: false,
      message: "Холболтын мэдээлэл олдсонгүй!",
    };
  }

  const BatalgaajuulahCodeModel = BatalgaajuulahCode(tukhainBaaziinKholbolt);
  const verificationResult = await BatalgaajuulahCodeModel.verifyCode(
    utas,
    code,
    "password_reset",
  );

  if (!verificationResult.success) {
    await BatalgaajuulahCodeModel.incrementAttempts(
      utas,
      code,
      "password_reset",
    );
  }

  return verificationResult;
}

async function validateCodeOnly(
  baiguullagiinId,
  utas,
  code,
  purpose = "password_reset",
) {
  const { db } = require("zevbackv2");

  if (code.length !== 4 || !/^\d+$/.test(code)) {
    return {
      success: false,
      message: "Код буруу байна!",
    };
  }

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (kholbolt) => String(kholbolt.baiguullagiinId) === String(baiguullagiinId),
  );

  if (!tukhainBaaziinKholbolt) {
    return {
      success: false,
      message: "Холболтын мэдээлэл олдсонгүй!",
    };
  }

  const BatalgaajuulahCodeModel = BatalgaajuulahCode(tukhainBaaziinKholbolt);

  // Find the most recent code that matches (sort by createdAt descending)
  // This ensures we use the latest code if multiple codes exist for the same phone
  const verificationCode = await BatalgaajuulahCodeModel.findOne({
    utas,
    code,
    purpose,
    khereglesenEsekh: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!verificationCode) {
    return {
      success: false,
      message: "Хүчингүй код байна!",
    };
  }

  if (verificationCode.oroldlogo >= verificationCode.niitOroldokhErkh) {
    return {
      success: false,
      message: "Хэт их оролдлого хийгдсэн байна!",
    };
  }

  return {
    success: true,
    message: "Код зөв байна",
  };
}

function duusakhOgnooAvya(ugugdul, onFinish, next) {
  request.get(
    "http://103.143.40.123:8282/baiguullagiinDuusakhKhugatsaaAvya",
    { json: true, body: ugugdul },
    (err, res1, body) => {
      if (err) next(err);
      else {
        onFinish(body);
      }
    },
  );
}

// Helper function to update davkhar with toot in baiguullaga
// Structure: davkhar: ["1", "2", "3"], davkhariinToonuud: {1: ["103,104,105"], 2: ["201,202"]}
exports.updateDavkharWithToot = async function updateDavkharWithToot(
  baiguullaga,
  barilgiinId,
  davkhar,
  toot,
  tukhainBaaziinKholbolt,
) {
  try {
    const { db } = require("zevbackv2");
    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(barilgiinId),
    );

    if (!targetBarilga) {
      return;
    }

    // Get or create davkhar array and davkhariinToonuud object
    const davkharArray = targetBarilga.tokhirgoo?.davkhar || [];
    const davkhariinToonuud = targetBarilga.tokhirgoo?.davkhariinToonuud || {};

    // Validate that davkhar already exists - do not allow creating new davkhar when assigning toot
    const davkharStr = String(davkhar);
    if (!davkharArray.includes(davkharStr)) {
      return; // Exit early - do not create new davkhar or assign toot
    }

    // Get or create toot array for this floor
    const floorKey = parseInt(davkharStr); // Use number as key
    if (!davkhariinToonuud[floorKey]) {
      davkhariinToonuud[floorKey] = [];
    }

    // Get existing toot string for this floor
    const existingToonuud = davkhariinToonuud[floorKey][0] || "";
    let tootList = existingToonuud
      ? existingToonuud
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t)
      : [];

    // Add toot if not already present
    if (toot && !tootList.includes(toot)) {
      tootList.push(toot);
      tootList.sort((a, b) => parseInt(a) - parseInt(b)); // Sort numerically
    }

    // Update davkhariinToonuud - store as array with comma-separated string
    davkhariinToonuud[floorKey] = [tootList.join(",")];

    // Update baiguullaga - find the building index first
    const barilgaIndex = baiguullaga.barilguud.findIndex(
      (b) => String(b._id) === String(barilgiinId),
    );

    if (barilgaIndex >= 0) {
      // Use Mongoose's positional operator for safer nested updates
      const davkharPath = `barilguud.${barilgaIndex}.tokhirgoo.davkhar`;
      const toonuudPath = `barilguud.${barilgaIndex}.tokhirgoo.davkhariinToonuud`;

      await Baiguullaga(db.erunkhiiKholbolt).findByIdAndUpdate(
        baiguullaga._id,
        {
          $set: {
            [davkharPath]: davkharArray,
            [toonuudPath]: davkhariinToonuud,
          },
        },
        { new: false },
      );
    }

    // Reload baiguullaga to get latest data
    const updatedBaiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullaga._id,
    );

    // NOTE: liftShalgaya.choloolugdokhDavkhar should be configured manually by admin
    // It represents floors EXEMPT from lift charges, NOT all floors in the building
    // So we do NOT auto-calculate it when registering users
  } catch (error) {}
};

// Helper function to calculate liftShalgaya based on davkhar entries
// Saves to both baiguullaga.barilguud[].tokhirgoo.liftShalgaya AND liftShalgaya collection
exports.calculateLiftShalgaya = async function calculateLiftShalgaya(
  baiguullagiinId,
  barilgiinId,
  davkharArray,
  tukhainBaaziinKholbolt,
) {
  try {
    const { db } = require("zevbackv2");
    const Baiguullaga = require("../models/baiguullaga");
    const LiftShalgaya = require("../models/liftShalgaya");

    // davkharArray is already an array of floor numbers like ["1", "2", "3"]
    // Extract all unique floor numbers
    const choloolugdokhDavkhar = [
      ...new Set(davkharArray.map((f) => String(f))),
    ];

    // Update liftShalgaya in baiguullaga.barilguud[].tokhirgoo
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );
    if (!baiguullaga) {
      return;
    }

    const barilgaIndex = baiguullaga.barilguud.findIndex(
      (b) => String(b._id) === String(barilgiinId),
    );

    if (barilgaIndex >= 0) {
      if (!baiguullaga.barilguud[barilgaIndex].tokhirgoo) {
        baiguullaga.barilguud[barilgaIndex].tokhirgoo = {};
      }
      if (!baiguullaga.barilguud[barilgaIndex].tokhirgoo.liftShalgaya) {
        baiguullaga.barilguud[barilgaIndex].tokhirgoo.liftShalgaya = {};
      }
      baiguullaga.barilguud[
        barilgaIndex
      ].tokhirgoo.liftShalgaya.choloolugdokhDavkhar = choloolugdokhDavkhar;
      await baiguullaga.save();

      // Also sync with liftShalgaya collection - update existing or create new
      if (tukhainBaaziinKholbolt) {
        const LiftShalgayaModel = LiftShalgaya(tukhainBaaziinKholbolt);
        await LiftShalgayaModel.findOneAndUpdate(
          {
            baiguullagiinId: String(baiguullagiinId),
            barilgiinId: String(barilgiinId),
          },
          {
            baiguullagiinId: String(baiguullagiinId),
            barilgiinId: String(barilgiinId),
            choloolugdokhDavkhar: choloolugdokhDavkhar,
          },
          {
            upsert: true, // Create if doesn't exist, update if exists
            new: true,
          },
        );
      }
    } else {
    }
  } catch (error) {}
};

exports.orshinSuugchBurtgey = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    // Note: duureg, horoo, and soh are optional - can be retrieved from baiguullaga if not provided
    // baiguullagiinId can be determined from address selection (OWN_ORG) if not provided upfront
    // If email is provided, proceed with Wallet API registration and get baiguullagiinId from address

    if (!req.body.utas) {
      throw new aldaa("Утасны дугаар заавал бөглөх шаардлагатай!");
    }
    // Auto-set defaults for nevtrekhNer and nuutsUg from backend
    const phoneNumber = String(req.body.utas).trim();

    // Set nevtrekhNer to utas if not provided
    if (!req.body.nevtrekhNer) {
      req.body.nevtrekhNer = phoneNumber;
    }

    // Set default password to "1234" if not provided
    if (!req.body.nuutsUg) {
      req.body.nuutsUg = "1234";
    }

    // Email is optional - only register with Wallet API if email is provided
    const email = req.body.mail ? String(req.body.mail).trim() : null;

    // If email is provided, we'll proceed with Wallet API registration
    // baiguullagiinId can be determined from address selection later
    // Only require baiguullagiinId upfront if no email (direct OWN_ORG registration)
    let baiguullaga = null;
    let baiguullagiinId = req.body.baiguullagiinId || "";

    if (baiguullagiinId) {
      baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        baiguullagiinId,
      );

      if (!baiguullaga) {
        throw new aldaa("Байгууллагын мэдээлэл олдсонгүй!");
      }
    } else if (!email) {
      // No email and no baiguullagiinId - require baiguullagiinId for OWN_ORG registration
      throw new aldaa("Байгууллагын ID заавал бөглөх шаардлагатай!");
    }
    // If email is provided but no baiguullagiinId, we'll try to get it from address selection later
    // ALWAYS check and register with Wallet API in orshinSuugchBurtgey
    let walletUserInfo = null;
    let walletUserId = null;

    try {
      // First, try to get existing user from Wallet API
      walletUserInfo = await walletApiService.getUserInfo(phoneNumber);

      if (walletUserInfo && walletUserInfo.userId) {
        // User exists in Wallet API
        walletUserId = walletUserInfo.userId;
      } else {
        // User doesn't exist in Wallet API, register them
        // Use provided email or empty string (frontend will handle email)
        const regEmail = email || "";
        

        walletUserInfo = await walletApiService.registerUser(
          phoneNumber,
          regEmail,
        );

        if (walletUserInfo && walletUserInfo.userId) {
          walletUserId = walletUserInfo.userId;
          console.log(`✅ [BURTGEY] Auto-registered ${phoneNumber} in Wallet API.`);
        }
      }
    } catch (walletError) {
      console.error(`⚠️ [BURTGEY] Wallet API auto-registration failed:`, walletError.message);
      // Proceed with registration - we don't want to block our own registration if BPay is down
    }

    const existingUser = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
      $or: [
        { utas: phoneNumber },
        ...(walletUserId ? [{ walletUserId: walletUserId }] : []),
      ],
    });


    let tukhainBaaziinKholbolt = null;
    if (baiguullaga) {
      tukhainBaaziinKholbolt = db.kholboltuud.find(
        (kholbolt) => kholbolt.baiguullagiinId === baiguullaga._id.toString(),
      );
    }

    let existingCancelledGeree = null;
    if (tukhainBaaziinKholbolt && baiguullaga) {
      const GereeModel = Geree(tukhainBaaziinKholbolt);
      existingCancelledGeree = await GereeModel.findOne({
        utas: { $in: [req.body.utas] }, // utas is an array in geree
        tuluv: "Цуцалсан",
        baiguullagiinId: baiguullaga._id.toString(),
      });
    }

   
    if (!baiguullaga && req.body.bairniiNer) {
      
      const allBaiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).find({});
      for (const org of allBaiguullaguud) {
        const matchingBarilga = org.barilguud?.find(
          (b) => String(b.ner).trim() === String(req.body.bairniiNer).trim(),
        );
        if (matchingBarilga) {
          baiguullaga = org;
          baiguullagiinId = baiguullaga._id.toString();
          tukhainBaaziinKholbolt = db.kholboltuud.find(
            (kholbolt) =>
              kholbolt.baiguullagiinId === baiguullaga._id.toString(),
          );
          break;
        }
      }
    }

    
    if (!baiguullaga && (req.body.duureg || req.body.horoo || req.body.soh)) {
    
      const allBaiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).find({});
      for (const org of allBaiguullaguud) {
        for (const barilga of org.barilguud || []) {
          const tokhirgoo = barilga.tokhirgoo || {};
          const matchesDuureg =
            !req.body.duureg ||
            !tokhirgoo.duuregNer ||
            String(tokhirgoo.duuregNer).trim() ===
              String(req.body.duureg).trim();
          const matchesHoroo =
            !req.body.horoo ||
            !tokhirgoo.horoo?.ner ||
            String(tokhirgoo.horoo.ner).trim() ===
              String(req.body.horoo).trim();
          const matchesSoh =
            !req.body.soh ||
            !tokhirgoo.sohNer ||
            String(tokhirgoo.sohNer).trim() === String(req.body.soh).trim();

          if (matchesDuureg && matchesHoroo && matchesSoh) {
            baiguullaga = org;
            baiguullagiinId = baiguullaga._id.toString();
            // Also set tukhainBaaziinKholbolt now that we have baiguullaga
            tukhainBaaziinKholbolt = db.kholboltuud.find(
              (kholbolt) =>
                kholbolt.baiguullagiinId === baiguullaga._id.toString(),
            );
            break;
          }
        }
        if (baiguullaga) break;
      }
    }

    if (!baiguullaga && !email) {
      throw new aldaa(
        "Байгууллагын мэдээлэл олдсонгүй! Хаягийн мэдээлэлээс байгууллагыг олж чадсангүй.",
      );
    }

  
    let barilgiinId =
      (req.body.barilgiinId && req.body.barilgiinId.toString().trim()) ||
      (req.body.barilgaId && req.body.barilgaId.toString().trim()) ||
      null;

   
    if (barilgiinId && baiguullaga) {
      const providedBarilga = baiguullaga.barilguud?.find(
        (b) => String(b._id) === String(barilgiinId),
      );
      if (providedBarilga) {
      } else {
        barilgiinId = null; // Reset to null so we can search
      }
    }

    if (!barilgiinId && req.body.bairniiNer && baiguullaga.barilguud) {
      const bairniiNerToFind = req.body.bairniiNer.toString().trim();
      const barilgaByName = baiguullaga.barilguud.find(
        (b) => String(b.ner).trim() === bairniiNerToFind,
      );
      if (barilgaByName) {
        barilgiinId = String(barilgaByName._id);
      }
    }

    if (
      !barilgiinId &&
      req.body.duureg &&
      req.body.horoo &&
      req.body.soh &&
      baiguullaga.barilguud
    ) {
      const duuregToFind = req.body.duureg.toString().trim();
      const horooToFind = req.body.horoo.toString().trim();
      const sohToFind = req.body.soh.toString().trim();
      const sohNerToFind = req.body.sohNer
        ? req.body.sohNer.toString().trim()
        : null;

      const barilgaByLocation = baiguullaga.barilguud.find((b) => {
        const tokhirgoo = b.tokhirgoo || {};
        const barilgaDuureg = tokhirgoo.duuregNer
          ? String(tokhirgoo.duuregNer).trim()
          : "";
        const barilgaHoroo = tokhirgoo.horoo?.ner
          ? String(tokhirgoo.horoo.ner).trim()
          : "";
        const barilgaSohNer = tokhirgoo.sohNer
          ? String(tokhirgoo.sohNer).trim()
          : "";

        // Match on duureg, horoo, and sohNer if provided
        const duuregMatch = !barilgaDuureg || barilgaDuureg === duuregToFind;
        const horooMatch = !barilgaHoroo || barilgaHoroo === horooToFind;
        const sohMatch =
          !sohNerToFind ||
          !barilgaSohNer ||
          barilgaSohNer === sohNerToFind ||
          barilgaSohNer === sohToFind;

        return duuregMatch && horooMatch && sohMatch;
      });

      if (barilgaByLocation) {
        barilgiinId = String(barilgaByLocation._id);
      }
    }

    if (
      !barilgiinId &&
      req.body.toot &&
      baiguullaga.barilguud &&
      baiguullaga.barilguud.length > 1
    ) {
      const tootToFind = req.body.toot.trim();
      const davkharToFind = req.body.davkhar ? req.body.davkhar.trim() : null;
      const ortsToFind = req.body.orts ? req.body.orts.trim() : "1";
      const floorKey = davkharToFind ? `${ortsToFind}::${davkharToFind}` : null;

      let foundBuilding = null;
      let foundBuildings = []; // Track all matches if davkhar not provided

      // Search through all buildings to find which one contains this toot
      for (const barilga of baiguullaga.barilguud) {
        const davkhariinToonuud = barilga.tokhirgoo?.davkhariinToonuud || {};

        if (floorKey && davkhariinToonuud[floorKey]) {
          // If davkhar is provided, match on exact floorKey
          const tootArray = davkhariinToonuud[floorKey];

          if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
            let tootList = [];

            if (
              typeof tootArray[0] === "string" &&
              tootArray[0].includes(",")
            ) {
              tootList = tootArray[0]
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);
            } else {
              tootList = tootArray
                .map((t) => String(t).trim())
                .filter((t) => t);
            }

            if (tootList.includes(tootToFind)) {
              foundBuilding = barilga;
              break;
            }
          }
        } else if (!floorKey) {
          // If davkhar is NOT provided, search all floors for this toot
          for (const [key, tootArray] of Object.entries(davkhariinToonuud)) {
            if (!key.includes("::")) {
              continue;
            }

            if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
              let tootList = [];

              if (
                typeof tootArray[0] === "string" &&
                tootArray[0].includes(",")
              ) {
                tootList = tootArray[0]
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t);
              } else {
                tootList = tootArray
                  .map((t) => String(t).trim())
                  .filter((t) => t);
              }

              if (tootList.includes(tootToFind)) {
                foundBuildings.push(barilga);
                break; // Found in this building, move to next building
              }
            }
          }
        }
      }

      // If davkhar was provided and we found a match, use it
      if (foundBuilding) {
        barilgiinId = String(foundBuilding._id);
      } else if (foundBuildings.length === 1) {
        // If davkhar not provided but only one building has this toot, use it
        barilgiinId = String(foundBuildings[0]._id);
      } else if (foundBuildings.length > 1) {
        // Multiple buildings have this toot - use first one (original behavior)
        barilgiinId = String(foundBuildings[0]._id);
      }
    }
    let determinedDavkhar = req.body.davkhar || "";

    if (req.body.toot && barilgiinId) {
      const targetBarilga = baiguullaga.barilguud?.find(
        (b) => String(b._id) === String(barilgiinId),
      );

      if (targetBarilga) {
        const davkhariinToonuud =
          targetBarilga.tokhirgoo?.davkhariinToonuud || {};
        const tootToFind = req.body.toot.trim();
        let foundFloor = null;
        let foundOrts = null;

        // Search through all floors to find which floor contains this toot
        // Key format: 'orts::davkhar' (e.g., '1::1' = Entrance 1, Floor 1)
        for (const [floorKey, tootArray] of Object.entries(davkhariinToonuud)) {
          // Skip invalid entries that don't have :: separator (like '456')
          if (!floorKey.includes("::")) {
            continue;
          }

          if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
            let tootList = [];

            // Handle both formats:
            // Format 1: ['101,102,103'] - comma-separated string in first element
            // Format 2: ['101', '102', '103'] - array of individual strings
            if (
              typeof tootArray[0] === "string" &&
              tootArray[0].includes(",")
            ) {
              // Comma-separated format
              tootList = tootArray[0]
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);
            } else {
              // Array of individual strings format
              tootList = tootArray
                .map((t) => String(t).trim())
                .filter((t) => t);
            }

            if (tootList.includes(tootToFind)) {
              // Parse key format: 'orts::davkhar' (e.g., '1::1' or '1::2')
              const parts = floorKey.split("::");
              if (parts.length === 2) {
                foundOrts = parts[0].trim(); // orts (entrance)
                foundFloor = parts[1].trim(); // davkhar (floor)
              }
              break;
            }
          }
        }

        // If toot is found in davkhariinToonuud, use that floor and orts automatically
        if (foundFloor) {
          determinedDavkhar = foundFloor;
          // Also set orts if found (unless already provided from frontend)
          if (foundOrts && !req.body.orts) {
            req.body.orts = foundOrts;
          }
        } else {
          // If toot is not found in davkhariinToonuud:
          // Strictly block registration if toot is not in the system
          throw new aldaa(
            `"${req.body.toot}" тоот бүртгэлгүй байна. Та барилгын тохиргооноос тоотыг шалгана уу.`,
          );
        }
      }
    }

    let orshinSuugch;
    let isReactivating = false;

    // Get initial electricity reading from request (default to 0 if not provided)
    const tsahilgaaniiZaalt =
      req.body.tsahilgaaniiZaalt !== undefined
        ? parseFloat(req.body.tsahilgaaniiZaalt) || 0
        : 0; // Default to 0 кВт if not provided

    // If user exists, use existing user and add new toot to their toots array
    // If user doesn't exist, create new user
    if (existingUser) {
      // User already exists - use existing user and add new toot
      orshinSuugch = existingUser;

      // Update user info if provided (name, email, etc.) but DON'T update toot-related fields
      // We'll add the new toot to toots array instead
      if (req.body.ner) orshinSuugch.ner = req.body.ner;
      if (req.body.ovog) orshinSuugch.ovog = req.body.ovog;
      if (req.body.mail || walletUserInfo?.email) {
        orshinSuugch.mail =
          walletUserInfo?.email || req.body.mail || email || orshinSuugch.mail;
      }
      if (walletUserId) orshinSuugch.walletUserId = walletUserId;
      if (req.body.ekhniiUldegdel !== undefined) {
        orshinSuugch.ekhniiUldegdel = parseFloat(req.body.ekhniiUldegdel) || 0;
      }
      if (tsahilgaaniiZaalt !== undefined) {
        orshinSuugch.tsahilgaaniiZaalt = tsahilgaaniiZaalt;
      }
      // DON'T update toot, davkhar, barilgiinId - these are for the new toot being added
      // The new toot will be added to toots array, keeping existing toots intact
    } else {
      // Create new user
      // IMPORTANT: Set tsahilgaaniiZaalt explicitly to ensure it's saved
      const userData = {
        ...req.body,
        mail: walletUserInfo?.email || req.body.mail || email, // Use email from Wallet API if available
        erkh: "OrshinSuugch",
        duureg: req.body.duureg,
        horoo: req.body.horoo,
        soh: req.body.soh,
        nevtrekhNer: req.body.nevtrekhNer, // Auto-set from utas earlier if not provided
        utas: phoneNumber, // Ensure phone number is properly set
        toot: req.body.toot || "",
        davkhar: determinedDavkhar, // Automatically determined from toot
        orts: req.body.orts || "", // Automatically determined from toot if found
        ekhniiUldegdel: req.body.ekhniiUldegdel
          ? parseFloat(req.body.ekhniiUldegdel) || 0
          : 0, // Optional: from frontend
        // Link to Wallet API (unifies website and mobile users)
        ...(walletUserId ? { walletUserId: walletUserId } : {}),
      };

      // Only set baiguullaga fields if baiguullaga exists (OWN_ORG registration)
      if (baiguullaga) {
        userData.baiguullagiinId = baiguullaga._id.toString();
        userData.baiguullagiinNer = baiguullaga.ner;
      }

      // Only set barilgiinId if it exists (OWN_ORG registration)
      if (barilgiinId) {
        userData.barilgiinId = barilgiinId;
      }

      userData.tsahilgaaniiZaalt = tsahilgaaniiZaalt;

      orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(userData);
    }

   
    if (orshinSuugch.barilgiinId && barilgiinId) {
      const existingBarilgiinId = String(orshinSuugch.barilgiinId);
      const newBarilgiinId = String(barilgiinId);

      if (existingBarilgiinId !== newBarilgiinId) {
        console.log(`ℹ️ [BURTGEY] Resident ${phoneNumber} is registering in a new building: ${newBarilgiinId} (Primary: ${existingBarilgiinId})`);
        // We allow this now to support multi-building residents
      }
    }

    if (!orshinSuugch.toots) {
      orshinSuugch.toots = [];
    }

    // Check req.body.toot instead of orshinSuugch.toot (which might be empty for new users)
    // Also need baiguullaga and barilgiinId to create toot entry
    if (req.body.toot && barilgiinId && baiguullaga) {
      const targetBarilga = baiguullaga.barilguud?.find(
        (b) => String(b._id) === String(barilgiinId),
      );

      if (targetBarilga) {
        const duuregNer =
          targetBarilga.tokhirgoo?.duuregNer || req.body.duureg || "";
        // Normalize horoo to always be an object format
        let horooData = targetBarilga.tokhirgoo?.horoo || req.body.horoo || {};
        if (typeof horooData === "string") {
          horooData = { ner: horooData, kod: horooData };
        } else if (!horooData || typeof horooData !== "object") {
          horooData = {};
        }
        const sohNer = targetBarilga.tokhirgoo?.sohNer || req.body.soh || "";

     
        const unitsToProcess = Array.isArray(req.body.units) && req.body.units.length > 0 
          ? req.body.units 
          : [{
              toot: req.body.toot,
              davkhar: determinedDavkhar || req.body.davkhar,
              orts: req.body.orts || "1",
              ekhniiUldegdel: req.body.ekhniiUldegdel,
              tsahilgaaniiZaalt: req.body.tsahilgaaniiZaalt
            }];

        for (const unit of unitsToProcess) {
          if (!unit.toot) continue;

          const unitToot = String(unit.toot).trim();
          const unitDavkhar = unit.davkhar ? String(unit.davkhar).trim() : "";
          const unitOrts = unit.orts ? String(unit.orts).trim() : "1";

          const tootEntry = {
            toot: unitToot,
            source: "OWN_ORG",
            baiguullagiinId: baiguullaga._id.toString(),
            barilgiinId: barilgiinId,
            davkhar: unitDavkhar,
            orts: unitOrts,
            duureg: duuregNer,
            horoo: horooData,
            soh: sohNer,
            bairniiNer: targetBarilga.ner || "",
            walletUserId: walletUserId || orshinSuugch.walletUserId || "",
            ekhniiUldegdel: parseFloat(unit.ekhniiUldegdel) || 0,
            tsahilgaaniiZaalt: parseFloat(unit.tsahilgaaniiZaalt) || 0,
            createdAt: new Date(),
          };

          const existingTootIndex = orshinSuugch.toots.findIndex(
            (t) =>
              t.toot === tootEntry.toot &&
              t.barilgiinId === tootEntry.barilgiinId &&
              (!t.orts || t.orts === tootEntry.orts),
          );

          if (existingTootIndex >= 0) {
            orshinSuugch.toots[existingTootIndex] = tootEntry;
          } else {
            orshinSuugch.toots.push(tootEntry);
          }

          // Set primary fields if this is the first unit of a new user
          if (!existingUser && !orshinSuugch.toot) {
            orshinSuugch.toot = unitToot;
            orshinSuugch.davkhar = unitDavkhar;
            orshinSuugch.orts = unitOrts;
            orshinSuugch.barilgiinId = barilgiinId;
            orshinSuugch.baiguullagiinId = baiguullaga._id;
            orshinSuugch.baiguullagiinNer = baiguullaga.ner;
            orshinSuugch.bairniiNer = targetBarilga.ner || "";
            orshinSuugch.ekhniiUldegdel = parseFloat(unit.ekhniiUldegdel) || 0;
            orshinSuugch.tsahilgaaniiZaalt = parseFloat(unit.tsahilgaaniiZaalt) || 0;
          }
        }
      }
    } else if (
      req.body.bairId &&
      req.body.doorNo &&
      !req.body.baiguullagiinId
    ) {
      // Handle Wallet API address - create/find barilga in centralized org
      // Only treat as WALLET_API if baiguullagiinId is NOT provided (ensures OWN_ORG takes priority)

      // Get bairName from request (frontend should send it from address selection)
      const walletBairName = req.body.bairName || req.body.walletBairName;

      if (walletBairName) {
        try {
          // Find or create barilga in centralized org
          const barilgaResult = await findOrCreateBarilgaFromWallet(
            req.body.bairId,
            walletBairName,
          );

          // Set centralized org as primary address
          orshinSuugch.baiguullagiinId = CENTRALIZED_ORG_ID;
          orshinSuugch.barilgiinId = barilgaResult.barilgiinId;

          // Parse customerName into ovog + ner if not directly provided
          const _custNameParts = (req.body.customerName || "").split(" ").filter(Boolean);
          const _custNer = _custNameParts.length > 0 ? _custNameParts[_custNameParts.length - 1] : "";
          const _custOvog = _custNameParts.length > 1 ? _custNameParts.slice(0, -1).join(" ") : "";

          const walletTootEntry = {
            toot: req.body.doorNo,
            source: "WALLET_API",
            bairniiNer: walletBairName || req.body.customerAddress || req.body.bairId,
            ovog: req.body.ovog || orshinSuugch.ovog || _custOvog || "",
            ner: req.body.ner || orshinSuugch.ner || _custNer || "",
            baiguullagiinId: barilgaResult.baiguullagiinId,
            barilgiinId: barilgaResult.barilgiinId,
            walletBairId: req.body.bairId,
            walletDoorNo: req.body.doorNo,
            walletUserId: walletUserId || orshinSuugch.walletUserId || "",
            walletCustomerId:
              req.body.customerId || req.body.walletCustomerId || "",
            walletCustomerCode:
              req.body.customerCode || req.body.walletCustomerCode || "",
            createdAt: new Date(),
          };

          if (!orshinSuugch.toots) orshinSuugch.toots = [];

          const existingWalletTootIndex = orshinSuugch.toots.findIndex(
            (t) =>
              t.source === "WALLET_API" &&
              t.walletBairId === req.body.bairId &&
              t.walletDoorNo === req.body.doorNo &&
              (!t.walletCustomerId || !walletTootEntry.walletCustomerId ||
                t.walletCustomerId === walletTootEntry.walletCustomerId),
          );

          if (existingWalletTootIndex >= 0) {
            orshinSuugch.toots[existingWalletTootIndex] = walletTootEntry;
          } else {
            orshinSuugch.toots.push(walletTootEntry);
          }
        } catch (error) {
          // Fallback: just add to toots array without centralized org
          // Parse customerName into ovog + ner if not directly provided
          const _custNameParts2 = (req.body.customerName || "").split(" ").filter(Boolean);
          const _custNer2 = _custNameParts2.length > 0 ? _custNameParts2[_custNameParts2.length - 1] : "";
          const _custOvog2 = _custNameParts2.length > 1 ? _custNameParts2.slice(0, -1).join(" ") : "";

          const walletTootEntry = {
            toot: req.body.doorNo,
            source: "WALLET_API",
            walletBairId: req.body.bairId,
            walletDoorNo: req.body.doorNo,
            bairniiNer: walletBairName || req.body.customerAddress || req.body.bairId,
            ner: req.body.ner || orshinSuugch.ner || _custNer2 || "",
            ovog: req.body.ovog || orshinSuugch.ovog || _custOvog2 || "",
            walletUserId: walletUserId || orshinSuugch.walletUserId || "",
            walletCustomerId:
              req.body.customerId || req.body.walletCustomerId || "",
            walletCustomerCode:
              req.body.customerCode || req.body.walletCustomerCode || "",
            createdAt: new Date(),
          };

          if (!orshinSuugch.toots) orshinSuugch.toots = [];

          const existingWalletTootIndex = orshinSuugch.toots.findIndex(
            (t) =>
              t.source === "WALLET_API" &&
              t.walletBairId === req.body.bairId &&
              t.walletDoorNo === req.body.doorNo &&
              (!t.walletCustomerId || !walletTootEntry.walletCustomerId ||
                t.walletCustomerId === walletTootEntry.walletCustomerId),
          );

          if (existingWalletTootIndex >= 0) {
            // Update existing
            orshinSuugch.toots[existingWalletTootIndex] = walletTootEntry;
          } else {
            orshinSuugch.toots.push(walletTootEntry);
          }
        }
      } else {
        // Fallback: add to toots array without centralized org (if bairName not provided)
        // Parse customerName into ovog + ner if not directly provided
        const _custNameParts3 = (req.body.customerName || "").split(" ").filter(Boolean);
        const _custNer3 = _custNameParts3.length > 0 ? _custNameParts3[_custNameParts3.length - 1] : "";
        const _custOvog3 = _custNameParts3.length > 1 ? _custNameParts3.slice(0, -1).join(" ") : "";

        const walletTootEntry = {
          toot: req.body.doorNo,
          source: "WALLET_API",
          walletBairId: req.body.bairId,
          walletDoorNo: req.body.doorNo,
          bairniiNer: req.body.bairName || req.body.customerAddress || req.body.bairId,
          ner: req.body.ner || orshinSuugch.ner || _custNer3 || "",
          ovog: req.body.ovog || orshinSuugch.ovog || _custOvog3 || "",
          walletUserId: walletUserId || orshinSuugch.walletUserId || "",
          walletCustomerId:
            req.body.customerId || req.body.walletCustomerId || "",
          walletCustomerCode:
            req.body.customerCode || req.body.walletCustomerCode || "",
          createdAt: new Date(),
        };

        if (!orshinSuugch.toots) orshinSuugch.toots = [];

        const existingWalletTootIndex = orshinSuugch.toots.findIndex(
          (t) =>
            t.source === "WALLET_API" &&
            t.walletBairId === req.body.bairId &&
            t.walletDoorNo === req.body.doorNo &&
            (!t.walletCustomerId || !walletTootEntry.walletCustomerId ||
              t.walletCustomerId === walletTootEntry.walletCustomerId),
        );

        if (existingWalletTootIndex >= 0) {
          orshinSuugch.toots[existingWalletTootIndex] = walletTootEntry;
        } else {
          orshinSuugch.toots.push(walletTootEntry);
        }
      }
    }

    await orshinSuugch.save();

    // --- AUTO CREATE GUEST SETTINGS (Mashin) ---
    try {
      // Only create Mashin if baiguullagiinId and barilgiinId are present
      if (orshinSuugch.baiguullagiinId && orshinSuugch.barilgiinId) {
        const Mashin = require("../models/mashin");

        // Load baiguullaga if not already loaded (for Wallet API registrations)
        let baiguullagaForMashin = baiguullaga;
        if (!baiguullagaForMashin && orshinSuugch.baiguullagiinId) {
          baiguullagaForMashin = await Baiguullaga(
            db.erunkhiiKholbolt,
          ).findById(orshinSuugch.baiguullagiinId);
        }

        // Get tukhainBaaziinKholbolt if not already set
        let tukhainBaaziinKholboltForMashin = tukhainBaaziinKholbolt;
        if (!tukhainBaaziinKholboltForMashin && baiguullagaForMashin) {
          tukhainBaaziinKholboltForMashin = db.kholboltuud.find(
            (kholbolt) =>
              kholbolt.baiguullagiinId === baiguullagaForMashin._id.toString(),
          );
        }

        if (!tukhainBaaziinKholboltForMashin) {
        } else {
          const targetBarilga = baiguullagaForMashin?.barilguud?.find(
            (b) => String(b._id) === String(orshinSuugch.barilgiinId),
          );
          const buildingSettings = targetBarilga?.tokhirgoo?.zochinTokhirgoo;
          const orgSettings = baiguullagaForMashin?.tokhirgoo?.zochinTokhirgoo;

          const defaultSettings =
            buildingSettings && buildingSettings.zochinUrikhEsekh !== undefined
              ? buildingSettings
              : orgSettings;

          const MashinModel = Mashin(tukhainBaaziinKholboltForMashin);

          const existingSettings = await MashinModel.findOne({
            ezemshigchiinId: orshinSuugch._id.toString(),
            zochinTurul: "Оршин суугч",
          });

          if (!existingSettings) {
            const newMashin = new MashinModel({
              ezemshigchiinId: orshinSuugch._id.toString(),
              orshinSuugchiinId: orshinSuugch._id.toString(),
              ezemshigchiinNer: orshinSuugch.ner,
              ezemshigchiinUtas: orshinSuugch.utas,
              baiguullagiinId: orshinSuugch.baiguullagiinId.toString(),
              barilgiinId: String(orshinSuugch.barilgiinId),
              dugaar: (() => {
                if (req.body.mashiniiDugaar) return req.body.mashiniiDugaar;
                if (req.body.dugaar) return req.body.dugaar;
                if (req.body.mashin && req.body.mashin.dugaar)
                  return req.body.mashin.dugaar;
                if (
                  Array.isArray(req.body.mashinuud) &&
                  req.body.mashinuud.length > 0
                ) {
                  const m = req.body.mashinuud[0];
                  return typeof m === "object"
                    ? m.dugaar || m.mashiniiDugaar || "БҮРТГЭЛГҮЙ"
                    : m;
                }
                return "БҮРТГЭЛГҮЙ";
              })(),
              ezenToot: orshinSuugch.toot || req.body.toot || "",
              zochinUrikhEsekh: defaultSettings?.zochinUrikhEsekh !== false,
              zochinTurul: "Оршин суугч",
              turul: "Оршин суугч",
              zochinErkhiinToo: defaultSettings?.zochinErkhiinToo || 0,
              zochinTusBurUneguiMinut:
                defaultSettings?.zochinTusBurUneguiMinut || 0,
              zochinNiitUneguiMinut:
                defaultSettings?.zochinNiitUneguiMinut || 0,
              zochinTailbar: defaultSettings?.zochinTailbar || "",
              davtamjiinTurul: defaultSettings?.davtamjiinTurul || "saraar",
              davtamjUtga: defaultSettings?.davtamjUtga,
            });

            await newMashin.save();
          }
        }
      }
    } catch (zochinErr) {}

    try {
      // Only create contracts if baiguullaga exists (OWN_ORG registration)
      // If email is provided but no baiguullaga, skip contract creation (wallet-only registration)
      if (!baiguullaga) {
        // Skip contract creation for wallet-only registration
      } else {
        // Reuse tukhainBaaziinKholbolt from above (already declared)
        if (!tukhainBaaziinKholbolt) {
          throw new Error("Байгууллагын холболтын мэдээлэл олдсонгүй");
        }

        const targetBarilgaForZardluud = baiguullaga.barilguud?.find(
          (b) => String(b._id) === String(barilgiinId),
        );

        const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
        const ashiglaltiinZardluudData = await AshiglaltiinZardluud(
          tukhainBaaziinKholbolt,
        ).find({
          baiguullagiinId: baiguullagiinId,
          barilgiinId: barilgiinId,
        });

        // Get liftShalgaya from baiguullaga.barilguud[].tokhirgoo
        const liftShalgayaData =
          targetBarilgaForZardluud?.tokhirgoo?.liftShalgaya;
        const choloolugdokhDavkhar =
          liftShalgayaData?.choloolugdokhDavkhar || [];

        const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
          ner: zardal.ner,
          turul: zardal.turul,
          zardliinTurul: zardal.zardliinTurul,
          tariff: zardal.tariff,
          tariffUsgeer: zardal.tariffUsgeer || "",
          tulukhDun: 0, // Default value
          dun: zardal.dun || 0,
          bodokhArga: zardal.bodokhArga || "",
          tseverUsDun: zardal.tseverUsDun || 0,
          bokhirUsDun: zardal.bokhirUsDun || 0,
          usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
          tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
          tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
          tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
          suuriKhuraamj: zardal.suuriKhuraamj || 0,
          nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
          ognoonuud: zardal.ognoonuud || [],
        }));

        // Extract tailbar from ashiglaltiinZardluud (combine all tailbar values if multiple exist)
        const tailbarFromZardluud =
          ashiglaltiinZardluudData
            .map((zardal) => zardal.tailbar)
            .filter((tailbar) => tailbar && tailbar.trim())
            .join("; ") || "";

        const niitTulbur = ashiglaltiinZardluudData.reduce((total, zardal) => {
          const tariff = zardal.tariff || 0;

          const isLiftItem =
            zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";

          if (
            isLiftItem &&
            orshinSuugch.davkhar &&
            choloolugdokhDavkhar.includes(orshinSuugch.davkhar)
          ) {
            return total;
          }

          return total + tariff;
        }, 0);

        // Validate: One toot occupancy check
        // Check if this toot already has an active contract with a different orshinSuugchId
        const GereeModel = Geree(tukhainBaaziinKholbolt);
        if (orshinSuugch.toot && barilgiinId) {
          const conflictingGeree = await GereeModel.findOne({
            barilgiinId: barilgiinId,
            toot: orshinSuugch.toot,
            tuluv: "Идэвхтэй",
            orshinSuugchId: { $ne: orshinSuugch._id.toString() },
          });

          if (conflictingGeree) {
            // Log warning instead of throwing error to allow roommates/multi-family registration
          }
        }
        const existingCancelledGeree = await GereeModel.findOne({
          toot: orshinSuugch.toot || "",
          barilgiinId: barilgiinId || "",
          davkhar: orshinSuugch.davkhar || "",
          orts: orshinSuugch.orts || "",
          tuluv: "Цуцалсан",
        });

        if (existingCancelledGeree && tukhainBaaziinKholbolt) {
          isReactivating = true;

          const updateData = {
            tuluv: "Идэвхтэй",
            gereeniiOgnoo: new Date(),
            orshinSuugchId: orshinSuugch._id.toString(),
            zardluud: zardluudArray,
            niitTulbur: niitTulbur,
            ashiglaltiinZardal: 0,
            khonogoorBodokhEsekh: req.body.khonogoorBodokhEsekh === true || req.body.khonogoorBodokhEsekh === "true",
            bodokhKhonog: Number(req.body.bodokhKhonog) || 0,
            ovog: req.body.ovog || existingCancelledGeree.ovog,
            ner: req.body.ner || existingCancelledGeree.ner,
            register: req.body.register || existingCancelledGeree.register,
            utas: [req.body.utas],
            mail: req.body.mail || existingCancelledGeree.mail,
            toot: orshinSuugch.toot || existingCancelledGeree.toot,
            davkhar: orshinSuugch.davkhar || existingCancelledGeree.davkhar,
            bairNer:
              targetBarilgaForZardluud?.ner ||
              existingCancelledGeree.bairNer ||
              "",
            duureg: req.body.duureg || existingCancelledGeree.duureg,
            horoo: req.body.horoo || existingCancelledGeree.horoo,
            sohNer: req.body.soh || existingCancelledGeree.sohNer,
            umnukhZaalt: tsahilgaaniiZaalt,
            suuliinZaalt: tsahilgaaniiZaalt,
            zaaltTog: 0,
            zaaltUs: 0,
          };

          if (req.body.tailbar) {
            updateData.temdeglel = req.body.tailbar;
            updateData.tailbar = req.body.tailbar;
          }
          if (req.body.ekhniiUldegdel !== undefined) {
            updateData.ekhniiUldegdel =
              parseFloat(req.body.ekhniiUldegdel) || 0;
          }

          await GereeModel.findByIdAndUpdate(existingCancelledGeree._id, {
            $set: updateData,
          });
        }

        const targetBarilga = barilgiinId
          ? baiguullaga.barilguud?.find(
              (b) => String(b._id) === String(barilgiinId),
            )
          : null;

        const duuregNer =
          targetBarilga?.tokhirgoo?.duuregNer || req.body.duureg || "";
        // Normalize horoo to always be an object format
        let horooData = targetBarilga?.tokhirgoo?.horoo || req.body.horoo || {};
        if (typeof horooData === "string") {
          horooData = { ner: horooData, kod: horooData };
        } else if (!horooData || typeof horooData !== "object") {
          horooData = {};
        }
        const sohNer = targetBarilga?.tokhirgoo?.sohNer || req.body.soh || "";

        // Only create new geree if not reactivating (no cancelled geree found)
        if (!isReactivating) {
          // Create geree for each toot in toots array
          // If toots array exists and has entries, create geree for each toot
          // Otherwise, create geree for primary toot (backward compatibility)
          const tootsToProcess =
            orshinSuugch.toots && orshinSuugch.toots.length > 0
              ? orshinSuugch.toots
              : orshinSuugch.toot
                ? [
                    {
                      toot: orshinSuugch.toot,
                      barilgiinId: barilgiinId,
                      davkhar: orshinSuugch.davkhar || "",
                      orts: orshinSuugch.orts || "1",
                      duureg: duuregNer,
                      horoo: horooData,
                      soh: sohNer,
                      bairniiNer: req.body.bairniiNer || "",
                    },
                  ]
                : [];

          for (const tootEntry of tootsToProcess) {
            // Check if geree already exists for this toot
            const existingGereeForToot = await GereeModel.findOne({
              toot: tootEntry.toot,
              barilgiinId: tootEntry.barilgiinId || barilgiinId,
              tuluv: "Идэвхтэй",
              orshinSuugchId: orshinSuugch._id.toString(),
            });

            if (existingGereeForToot) {
              continue; // Skip if geree already exists for this toot
            }

            // Get target barilga for this toot
            const targetBarilgaForToot = baiguullaga.barilguud?.find(
              (b) =>
                String(b._id) === String(tootEntry.barilgiinId || barilgiinId),
            );

            if (!targetBarilgaForToot) {
              continue; // Skip if barilga not found
            }

            const duuregNerForToot =
              targetBarilgaForToot.tokhirgoo?.duuregNer ||
              tootEntry.duureg ||
              duuregNer ||
              "";
            // Normalize horoo to always be an object format
            let horooDataForToot =
              targetBarilgaForToot.tokhirgoo?.horoo ||
              tootEntry.horoo ||
              horooData ||
              {};
            if (typeof horooDataForToot === "string") {
              horooDataForToot = {
                ner: horooDataForToot,
                kod: horooDataForToot,
              };
            } else if (
              !horooDataForToot ||
              typeof horooDataForToot !== "object"
            ) {
              horooDataForToot = {};
            }
            const sohNerForToot =
              targetBarilgaForToot.tokhirgoo?.sohNer ||
              tootEntry.soh ||
              sohNer ||
              "";

            const contractData = {
              gereeniiDugaar: `ГД-${Date.now().toString().slice(-8)}`,
              gereeniiOgnoo: new Date(),
              turul: "Үндсэн",
              tuluv: "Идэвхтэй",
              ovog: req.body.ovog || "",
              ner: req.body.ner,
              register: req.body.register || "",
              utas: [req.body.utas],
              mail: req.body.mail || "",
              baiguullagiinId: baiguullaga._id,
              baiguullagiinNer: baiguullaga.ner,
              barilgiinId: tootEntry.barilgiinId || barilgiinId || "",
              tulukhOgnoo: await getDueOgnooHelper(tukhainBaaziinKholbolt, baiguullaga._id, tootEntry.barilgiinId || barilgiinId),
              ashiglaltiinZardal: 0,
              niitTulbur: niitTulbur,
              toot: tootEntry.toot,
              davkhar: tootEntry.davkhar || "",
              orts: tootEntry.orts || req.body.orts || "",
              bairNer: tootEntry.bairniiNer || targetBarilgaForToot.ner || "",
              sukhBairshil: `${duuregNerForToot}, ${horooDataForToot.ner || ""}, ${sohNerForToot}`,
              duureg: duuregNerForToot,
              horoo: horooDataForToot,
              sohNer: sohNerForToot,
              burtgesenAjiltan: orshinSuugch._id,
              orshinSuugchId: orshinSuugch._id.toString(),
              temdeglel:
                req.body.tailbar ||
                `Автоматаар үүссэн гэрээ (Тоот: ${tootEntry.toot})`,
              tailbar: req.body.tailbar || tailbarFromZardluud || "",
              actOgnoo: new Date(),
              baritsaaniiUldegdel: 0,
              ekhniiUldegdel: tootEntry.ekhniiUldegdel !== undefined
                ? tootEntry.ekhniiUldegdel
                : req.body.ekhniiUldegdel
                  ? parseFloat(req.body.ekhniiUldegdel) || 0
                  : 0,
              umnukhZaalt: tootEntry.tsahilgaaniiZaalt !== undefined
                ? tootEntry.tsahilgaaniiZaalt
                : tsahilgaaniiZaalt,
              suuliinZaalt: tootEntry.tsahilgaaniiZaalt !== undefined
                ? tootEntry.tsahilgaaniiZaalt
                : tsahilgaaniiZaalt,
              zaaltTog: 0,
              zaaltUs: 0,
              zardluud: zardluudArray,
              khonogoorBodokhEsekh: req.body.khonogoorBodokhEsekh === true || req.body.khonogoorBodokhEsekh === "true",
              bodokhKhonog: Number(req.body.bodokhKhonog) || 0,
              segmentuud: [],
              khungulultuud: [],
            };

            const geree = new Geree(tukhainBaaziinKholbolt)(contractData);
            await geree.save();

            // Create invoice immediately (Standardized Service)
            try {
              const invoiceService = require("../services/invoiceService");
              await invoiceService.createInvoiceForContract(
                tukhainBaaziinKholbolt,
                geree._id,
                {
                  billingDate: new Date(),
                  forceEmpty: false,
                  ajiltanId: req.ajiltan?._id,
                  ajiltanNer: req.ajiltan?.ner,
                },
              );
            } catch (invErr) {
              console.error("Error creating initial invoice during registration:", invErr);
            }

            // Update davkhar with toot if provided
            if (tootEntry.toot && tootEntry.davkhar) {
              await exports.updateDavkharWithToot(
                baiguullaga,
                tootEntry.barilgiinId || barilgiinId,
                tootEntry.davkhar,
                tootEntry.toot,
                tukhainBaaziinKholbolt,
              );
            }
          }
        } else {
          // If reactivating, we should also try to create/ensure invoice exists
          if (existingCancelledGeree && tukhainBaaziinKholbolt) {
            const GereeModel = Geree(tukhainBaaziinKholbolt);
            const reactivatedGeree = await GereeModel.findById(
              existingCancelledGeree._id,
            );
            if (reactivatedGeree) {
              try {
                const {
                  gereeNeesNekhemjlekhUusgekh,
                } = require("./nekhemjlekhController");
                await gereeNeesNekhemjlekhUusgekh(
                  reactivatedGeree,
                  baiguullaga,
                  tukhainBaaziinKholbolt,
                  "automataar",
                  true,
                );
              } catch (invErr) {}
            }
          }
        }
      }
    } catch (contractError) {
      // Don't fail registration if contract creation fails - user is already saved
    }

    const response = {
      success: true,
      message: isReactivating
        ? "Хэрэглэгч болон гэрээ амжилттай дахин идэвхжүүллээ"
        : "Амжилттай бүртгэгдлээ",
      result: orshinSuugch,
      isReactivated: isReactivating,
      hierarchy: {
        duureg: req.body.duureg,
        horoo: req.body.horoo,
        soh: req.body.soh,
      },
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

exports.davhardsanOrshinSuugchShalgayy = asyncHandler(
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const { utas } = req.body;

      if (!utas) {
        throw new aldaa("Утасны дугаар оруулах шаардлагатай!");
      }

      const phoneNumber = String(utas).trim();

      // Check if resident already exists in the system
      const existingUser = await OrshinSuugch(db.erunkhiiKholbolt)
        .findOne({
          utas: phoneNumber,
        })
        .lean();

      if (existingUser) {
        return res.json({
          success: false,
          exists: true,
          message: "Энэ утасны дугаар аль хэдийн бүртгэгдсэн байна.",
          data: {
            ner: existingUser.ner,
            ovog: existingUser.ovog,
          },
        });
      }

      // No user found, phone number is available for new registration
      res.json({
        success: true,
        exists: false,
        message: "Ашиглах боломжтой",
      });
    } catch (error) {
      next(error);
    }
  },
);

// Toot validation endpoint for OWN_ORG bair
exports.validateOwnOrgToot = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { toot, baiguullagiinId, barilgiinId, davkhar, orts } = req.body;

    if (!toot) {
      return res.status(400).json({
        success: false,
        message: "Тоот заавал оруулах шаардлагатай!",
        valid: false,
      });
    }

    if (!baiguullagiinId || !barilgiinId) {
      return res.status(400).json({
        success: false,
        message: "Байгууллагын болон барилгын ID заавал оруулах шаардлагатай!",
        valid: false,
      });
    }

    // Find baiguullaga
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );
    if (!baiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Байгууллагын мэдээлэл олдсонгүй!",
        valid: false,
      });
    }

    // Find target barilga
    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(barilgiinId),
    );

    if (!targetBarilga) {
      return res.status(404).json({
        success: false,
        message: "Барилгын мэдээлэл олдсонгүй!",
        valid: false,
      });
    }

    const tootToValidate = String(toot).trim();
    const davkharToValidate = davkhar ? String(davkhar).trim() : "";
    const ortsToValidate = orts ? String(orts).trim() : "1";

    // Check if toot exists in davkhariinToonuud (available toots)
    const davkhariinToonuud = targetBarilga.tokhirgoo?.davkhariinToonuud || {};
    let tootFound = false;
    let foundDavkhar = null;
    let foundOrts = null;
    let availableToonuud = [];

    if (davkharToValidate) {
      // If davkhar is provided, check specific floor
      const floorKey = `${ortsToValidate}::${davkharToValidate}`;
      const tootArray = davkhariinToonuud[floorKey];

      if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
        let tootList = [];
        if (typeof tootArray[0] === "string" && tootArray[0].includes(",")) {
          tootList = tootArray[0]
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t);
        } else {
          tootList = tootArray.map((t) => String(t).trim()).filter((t) => t);
        }

        availableToonuud = tootList;
        if (tootList.includes(tootToValidate)) {
          tootFound = true;
          foundDavkhar = davkharToValidate;
          foundOrts = ortsToValidate;
        }
      }
    } else {
      // If davkhar not provided, search all floors
      for (const [floorKey, tootArray] of Object.entries(davkhariinToonuud)) {
        if (!floorKey.includes("::")) {
          continue; // Skip invalid keys
        }

        if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
          let tootList = [];
          if (typeof tootArray[0] === "string" && tootArray[0].includes(",")) {
            tootList = tootArray[0]
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t);
          } else {
            tootList = tootArray.map((t) => String(t).trim()).filter((t) => t);
          }

          // Collect all available toots
          availableToonuud = [...availableToonuud, ...tootList];

          if (tootList.includes(tootToValidate)) {
            tootFound = true;
            const parts = floorKey.split("::");
            if (parts.length === 2) {
              foundOrts = parts[0].trim();
              foundDavkhar = parts[1].trim();
            }
            break;
          }
        }
      }
    }

    if (!tootFound) {
      return res.status(400).json({
        success: false,
        message: "Бүртгэлгүй тоот байна",
        valid: false,
        availableToonuud:
          availableToonuud.length > 0
            ? [...new Set(availableToonuud)].sort()
            : [],
      });
    }
    const existingUserWithToot = await OrshinSuugch(
      db.erunkhiiKholbolt,
    ).findOne({
      $or: [
        {
          toots: {
            $elemMatch: {
              toot: tootToValidate,
              barilgiinId: String(barilgiinId),
              orts: foundOrts || ortsToValidate
            },
          },
        },
        {
          toot: tootToValidate,
          barilgiinId: String(barilgiinId),
          orts: foundOrts || ortsToValidate
        },
      ],
    });

    if (existingUserWithToot) {
      return res.status(400).json({
        success: false,
        message: `(${tootToValidate}) тоот аль хэдийн хэрэглэгчид бүртгэгдсэн байна`,
        valid: false,
        existingUser: {
          id: existingUserWithToot._id,
          ner: existingUserWithToot.ner,
          utas: existingUserWithToot.utas,
        },
      });
    }

    return res.json({
      success: true,
      message: "Тоот зөв байна",
      valid: true,
      result: {
        toot: tootToValidate,
        davkhar: foundDavkhar,
        orts: foundOrts,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Toot validation endpoint
exports.tootShalgaya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { toot, orts, baiguullagiinId, utas } = req.body;

    if (!toot) {
      return res.status(400).json({
        success: false,
        message: "Тоот заавал оруулах шаардлагатай!",
      });
    }

    if (!utas) {
      return res.status(400).json({
        success: false,
        message: "Утасны дугаар заавал оруулах шаардлагатай!",
      });
    }

    // Find user by utas
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
      utas: utas,
    });

    if (!orshinSuugch) {
      return res.status(404).json({
        success: false,
        message: "Бүртгэлгүй тоот байна",
      });
    }

    const inputToot = String(toot).trim();
    const inputOrts = orts ? String(orts).trim() : null;

    // 1. Check primary address
    const primaryMatch = 
      String(orshinSuugch.toot || "").trim() === inputToot &&
      (!inputOrts || String(orshinSuugch.orts || "").trim() === inputOrts);

    // 2. Check toots array
    const secondaryMatch = 
      Array.isArray(orshinSuugch.toots) && 
      orshinSuugch.toots.some(t => 
        String(t.toot || "").trim() === inputToot &&
        (!inputOrts || String(t.orts || "").trim() === inputOrts)
      );

    if (primaryMatch || secondaryMatch) {
      return res.json({
        success: true,
        message: "Тоот зөв байна",
        result: {
          validated: true,
          toot: inputToot,
          orts: inputOrts,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Бүртгэлгүй тоот байна",
      });
    }
  } catch (error) {
    next(error);
  }
});

exports.orshinSuugchNevtrey = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    // App version validation - block versions 1.0.0 to 2.1.3
    // const appVersion = req.body.version || 
    //                    req.body.appVersion || 
    //                    req.body.v || 
    //                    req.headers["app-version"] || 
    //                    req.headers["x-app-version"] || 
    //                    req.headers["version"] || 
    //                    req.headers["client-version"];

    // console.log(`[DEBUG] orshinSuugchNevtrey login attempt from: ${req.body.utas}`);
    // console.log(`[DEBUG] Detected App Version: "${appVersion}"`);
    // console.log(`[DEBUG] All headers:`, JSON.stringify(req.headers));

    // if (appVersion) {
    //   // Sanitize: handle "v1.2.3" -> "1.2.3"
    //   const versionStr = String(appVersion).toLowerCase().startsWith("v") ? String(appVersion).slice(1) : String(appVersion);
    //   const parts = versionStr.split(".").map((num) => parseInt(num) || 0);
    //   const major = parts[0];
    //   const minor = parts[1];
    //   const patch = parts[2];

    //   const isBlocked = major < 2 || 
    //                     (major === 2 && minor < 1) || 
    //                     (major === 2 && minor === 1 && patch <= 3);

    //   if (isBlocked) {
    //     console.log(`[DEBUG] BLOCKING login attempt from ${req.body.utas} due to old version: "${appVersion}"`);
    //     throw new aldaa("Та шинэчэлэлт хийнэ үү");
    //   }
    // }

    if (!req.body.utas) {
      throw new aldaa("Утасны дугаар заавал бөглөх шаардлагатай!");
    }

    const phoneNumber = String(req.body.utas).trim();

    // Password validation - support both local and Wallet API passwords
    if (!req.body.nuutsUg) {
      throw new aldaa("Нууц үг заавал бөглөх шаардлагатай!");
    }

    const providedPassword = String(req.body.nuutsUg).trim();

    const [orshinSuugch, walletUserInfo] = await Promise.all([
      OrshinSuugch(db.erunkhiiKholbolt)
        .findOne({ utas: phoneNumber })
        .select("+nuutsUg"),
      walletApiService.getUserInfo(phoneNumber).catch(() => null),
    ]);

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    let walletUserId = walletUserInfo?.userId || null;

    if (orshinSuugch && !walletUserId) {

      const emailToUse = orshinSuugch.mail || "";
      
      try {
        const newWalletUser = await walletApiService.registerUser(phoneNumber, emailToUse);
        if (newWalletUser && newWalletUser.userId) {
          walletUserId = newWalletUser.userId;
          console.log(`✅ [NEVTREY] Auto-registered ${phoneNumber} in Wallet API during login.`);
        }
      } catch (regErr) {
        console.error(`⚠️ [NEVTREY] Wallet API auto-registration failed during login:`, regErr.message);
      }
    }

    let passwordValid = false;

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    if (!orshinSuugch.nuutsUg) {
      throw new aldaa("Нууц үг тохируулаагүй байна. Эхлээд бүртгүүлнэ үү.");
    }

    // Validate against local password (stored in our database)
    try {
      passwordValid = await orshinSuugch.passwordShalgaya(providedPassword);
    } catch (passwordError) {
      passwordValid = false;
    }

    if (!passwordValid) {
      throw new aldaa("Нууц үг буруу байна!");
    }

    // Send SMS verification code on login
    // Frontend will handle verification status in local storage
    // TEMPORARILY DISABLED: SMS sending for login
    const ENABLE_LOGIN_SMS = false; // Set to true to re-enable SMS verification on login

    if (ENABLE_LOGIN_SMS) {
      try {
        // Get baiguullaga for SMS sending
        let baiguullagiinId = orshinSuugch.baiguullagiinId;
        if (!baiguullagiinId && req.body.baiguullagiinId) {
          baiguullagiinId = req.body.baiguullagiinId;
        }

        if (baiguullagiinId) {
          const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            baiguullagiinId,
          );
          if (baiguullaga) {
            const tukhainBaaziinKholbolt = db.kholboltuud.find(
              (kholbolt) =>
                kholbolt.baiguullagiinId === baiguullaga._id.toString(),
            );

            if (tukhainBaaziinKholbolt) {
              // Generate and send verification code
              const BatalgaajuulahCodeModel = BatalgaajuulahCode(
                tukhainBaaziinKholbolt,
              );
              const verificationCodeDoc =
                await BatalgaajuulahCodeModel.batalgaajuulkhCodeUusgeye(
                  phoneNumber,
                  "login", // Purpose: login verification
                  10, // Expires in 10 minutes
                );

              // Send SMS
              var msgIlgeekhKey = "aa8e588459fdd9b7ac0b809fc29cfae3";
              var msgIlgeekhDugaar = "72002002";
              var smsText = `AmarSukh: Tany nevtrekh batalgaajuulax code: ${verificationCodeDoc.code}.`;

              var ilgeexList = [
                {
                  to: phoneNumber,
                  text: smsText,
                  gereeniiId: "login_verification",
                },
              ];

              var khariu = [];
              msgIlgeeye(
                ilgeexList,
                msgIlgeekhKey,
                msgIlgeekhDugaar,
                khariu,
                0,
                tukhainBaaziinKholbolt,
                baiguullagiinId,
              );
            }
          }
        }
      } catch (smsError) {
        // Don't fail login if SMS fails
      }
    } else {
    }

    const userData = {
      utas: phoneNumber,
      mail: walletUserInfo?.email || orshinSuugch.mail || "",
      erkh: "OrshinSuugch",
      nevtrekhNer: phoneNumber,
    };

    // Update walletUserId if available (for billing, etc.) but password stays local
    if (walletUserId) {
      userData.walletUserId = walletUserId;
    }

    // Single Device Login: Set unique sessionId
    userData.currentSessionId = String(Date.now() + Math.random().toString(36).substring(2, 7));

    // 1. Preserve existing primary organization - STRIKTLY IMMUTABLE
    if (orshinSuugch && orshinSuugch.baiguullagiinId) {
      // If user exists and has an org, that is their PERMANENT primary home in erunkhiiBaaz
      userData.baiguullagiinId = orshinSuugch.baiguullagiinId;
      userData.baiguullagiinNer = orshinSuugch.baiguullagiinNer;
    } else if (req.body.baiguullagiinId) {
      // For NEW users without an org, set the initial primary org
      userData.baiguullagiinId = req.body.baiguullagiinId;
    }

    // 2. Fetch baiguullaga name and building info once if needed
    let baiguullaga = null;
    const baiguullagaId =
      userData.baiguullagiinId || orshinSuugch.baiguullagiinId;

    if (baiguullagaId) {
      try {
        baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
          .findById(baiguullagaId)
          .lean();
        if (baiguullaga && baiguullaga.ner && !userData.baiguullagiinNer) {
          userData.baiguullagiinNer = baiguullaga.ner;
        }
      } catch (err) {}
    }

    // Handle barilgiinId - check both barilgiinId and bairId (frontend might send either)
    const barilgiinIdToSave = req.body.barilgiinId || req.body.bairId;

    // Check if this is an OWN_ORG address login (user is explicitly selecting a building)
    const isOwnOrgAddressLoginCheck =
      req.body.baiguullagiinId &&
      req.body.doorNo &&
      (req.body.barilgiinId || req.body.bairId);

    // Validate: User can only register with ONE building
    // ONLY validate if user is explicitly trying to login with OWN_ORG address AND a different building
    // If user is just logging in normally (without providing barilgiinId), allow it
    if (
      isOwnOrgAddressLoginCheck &&
      orshinSuugch &&
      orshinSuugch.barilgiinId &&
      barilgiinIdToSave
    ) {
      const existingBarilgiinId = String(orshinSuugch.barilgiinId);
      const newBarilgiinId = String(barilgiinIdToSave);

      if (existingBarilgiinId !== newBarilgiinId) {
        // Get building names for better error message
        let existingBuildingName = "";
        let newBuildingName = "";

        if (baiguullaga) {
          const existingBarilga = baiguullaga.barilguud?.find(
            (b) => String(b._id) === existingBarilgiinId,
          );
          const newBarilga = baiguullaga.barilguud?.find(
            (b) => String(b._id) === newBarilgiinId,
          );

          existingBuildingName = existingBarilga?.ner || existingBarilgiinId;
          newBuildingName = newBarilga?.ner || newBarilgiinId;
        }

        return res.status(400).json({
          success: false,
          message: `Та аль хэдийн "${existingBuildingName}" барилгад бүртгэгдсэн байна. Өөр барилгад нэвтрэх боломжгүй.`,
        });
      }
    }

    // 3. Preserve existing primary building - STRIKTLY IMMUTABLE
    if (orshinSuugch && orshinSuugch.barilgiinId) {
      // Use existing building, ignore barilgiinIdToSave for primary document
      userData.barilgiinId = orshinSuugch.barilgiinId;
    } else if (barilgiinIdToSave) {
      // First time setting a building
      userData.barilgiinId = barilgiinIdToSave;
    }

    // Validate OWN_ORG bair toot/doorNo if provided
    // Check for OWN_ORG: baiguullagiinId is required, and either barilgiinId OR bairId (frontend might send bairId)
    const isOwnOrgAddressLogin =
      req.body.baiguullagiinId &&
      req.body.doorNo &&
      (req.body.barilgiinId || req.body.bairId);
    const ownOrgBarilgiinIdLogin = req.body.barilgiinId || req.body.bairId; // Use barilgiinId if provided, otherwise bairId

    if (isOwnOrgAddressLogin) {
      try {
        if (!baiguullaga) {
          baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
            .findById(req.body.baiguullagiinId)
            .lean();
        }
        if (!baiguullaga) {
          throw new aldaa("Байгууллагын мэдээлэл олдсонгүй!");
        }

        const targetBarilga = baiguullaga.barilguud?.find(
          (b) => String(b._id) === String(ownOrgBarilgiinIdLogin),
        );

        if (!targetBarilga) {
          throw new aldaa("Барилгын мэдээлэл олдсонгүй!");
        }

        const tootToValidate = req.body.doorNo.trim();
        const davkharToValidate = (req.body.davkhar || "").trim();
        const ortsToValidate = (req.body.orts || "1").trim();

        // Check if toot exists in davkhariinToonuud (available toots)
        // Automatically determine orts and davkhar from toot
        const davkhariinToonuud =
          targetBarilga.tokhirgoo?.davkhariinToonuud || {};
        let tootFound = false;
        let foundDavkhar = null;
        let foundOrts = null;

        if (davkharToValidate) {
          // If davkhar is provided, check specific floor
          const floorKey = `${ortsToValidate}::${davkharToValidate}`;
          const tootArray = davkhariinToonuud[floorKey];

          if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
            let tootList = [];
            if (
              typeof tootArray[0] === "string" &&
              tootArray[0].includes(",")
            ) {
              tootList = tootArray[0]
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);
            } else {
              tootList = tootArray
                .map((t) => String(t).trim())
                .filter((t) => t);
            }

            if (tootList.includes(tootToValidate)) {
              tootFound = true;
              foundDavkhar = davkharToValidate;
              foundOrts = ortsToValidate;
            }
          }
        } else {
          // If davkhar not provided, search all floors
          for (const [floorKey, tootArray] of Object.entries(
            davkhariinToonuud,
          )) {
            // Skip invalid entries that don't have :: separator
            if (!floorKey.includes("::")) {
              continue;
            }

            if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
              let tootList = [];
              if (
                typeof tootArray[0] === "string" &&
                tootArray[0].includes(",")
              ) {
                tootList = tootArray[0]
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t);
              } else {
                tootList = tootArray
                  .map((t) => String(t).trim())
                  .filter((t) => t);
              }

              if (tootList.includes(tootToValidate)) {
                tootFound = true;
                // Extract orts and davkhar from floorKey (format: "orts::davkhar")
                const parts = floorKey.split("::");
                if (parts.length === 2) {
                  foundOrts = parts[0].trim(); // orts (entrance)
                  foundDavkhar = parts[1].trim(); // davkhar (floor)
                }
                break;
              }
            }
          }
        }

        if (!tootFound) {
          throw new aldaa(
            `(${tootToValidate}) тоот энэ барилгад бүртгэлгүй байна`,
          );
        }

        // Use found values, fallback to request values if not found
        const finalDavkhar = foundDavkhar || davkharToValidate || "";
        const finalOrts = foundOrts || ortsToValidate || "1";

        // Validation passes - toot will be added to toots array
        // Multiple users can have the same toot, so no unique check needed

        // Prepare toot entry for toots array
        userData.newTootEntry = {
          toot: tootToValidate,
          source: "OWN_ORG",
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: ownOrgBarilgiinIdLogin, // Use the resolved barilgiinId (from barilgiinId or bairId)
          davkhar: finalDavkhar, // Auto-determined from toot
          orts: finalOrts, // Auto-determined from toot
          duureg: targetBarilga.tokhirgoo?.duuregNer || "",
          horoo: targetBarilga.tokhirgoo?.horoo || {},
          soh: targetBarilga.tokhirgoo?.sohNer || "",
          bairniiNer: targetBarilga.ner || "",
        };
      } catch (error) {
        throw error;
      }
    }

    if (req.body.duureg) userData.duureg = req.body.duureg;
    if (req.body.horoo) userData.horoo = req.body.horoo;
    if (req.body.soh) userData.soh = req.body.soh;
    if (req.body.toot) userData.toot = req.body.toot;
    if (req.body.davkhar) userData.davkhar = req.body.davkhar;
    if (req.body.orts) userData.orts = req.body.orts;

    // Save address if provided, or preserve existing
    if (req.body.bairId) {
      userData.walletBairId = req.body.bairId;
    } else if (orshinSuugch && orshinSuugch.walletBairId) {
      // Preserve existing walletBairId if user already has one
      userData.walletBairId = orshinSuugch.walletBairId;
    }

    if (req.body.doorNo) {
      userData.walletDoorNo = req.body.doorNo;
    } else if (orshinSuugch && orshinSuugch.walletDoorNo) {
      // Preserve existing walletDoorNo if user already has one
      userData.walletDoorNo = orshinSuugch.walletDoorNo;
    }

    // Store address values before saving for later use
    const bairIdToUse = userData.walletBairId || req.body.bairId;
    const doorNoToUse = userData.walletDoorNo || req.body.doorNo;

    if (orshinSuugch) {
      Object.assign(orshinSuugch, userData);
      // Initialize toots array if it doesn't exist
      if (!orshinSuugch.toots) {
        orshinSuugch.toots = [];
      }
    } else {
      orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(userData);
      // Initialize toots array if it doesn't exist
      if (!orshinSuugch.toots) {
        orshinSuugch.toots = [];
      }
    }

    // Handle multiple toots - add new toot to array if provided
    if (userData.newTootEntry) {
      // Check if this toot already exists in user's toots array
      const existingTootIndex = orshinSuugch.toots?.findIndex(
        (t) =>
          t.toot === userData.newTootEntry.toot &&
          t.barilgiinId === userData.newTootEntry.barilgiinId,
      );

      if (existingTootIndex >= 0) {
        // Update existing toot entry
        orshinSuugch.toots[existingTootIndex] = userData.newTootEntry;
      } else {
        // Add new toot to array
        orshinSuugch.toots.push(userData.newTootEntry);
      }

      // Also set as primary toot ONLY if user doesn't have one (first registration)
      if (!orshinSuugch.baiguullagiinId) {
        orshinSuugch.toot = userData.newTootEntry.toot;
        orshinSuugch.baiguullagiinId = userData.newTootEntry.baiguullagiinId;
        orshinSuugch.barilgiinId = userData.newTootEntry.barilgiinId;
        orshinSuugch.davkhar = userData.newTootEntry.davkhar;
        orshinSuugch.orts = userData.newTootEntry.orts;
        orshinSuugch.duureg = userData.newTootEntry.duureg;
        orshinSuugch.horoo = userData.newTootEntry.horoo;
        orshinSuugch.soh = userData.newTootEntry.soh;
      }
    } else if (
      req.body.baiguullagiinId &&
      (req.body.barilgiinId || req.body.bairId)
    ) {
      // OWN_ORG address selected but no doorNo/toot provided
      // Only set primary fields if user doesn't have them yet
      if (!orshinSuugch.baiguullagiinId) {
        if (userData.baiguullagiinId) {
          orshinSuugch.baiguullagiinId = userData.baiguullagiinId;
          if (userData.baiguullagiinNer) {
            orshinSuugch.baiguullagiinNer = userData.baiguullagiinNer;
          }
        }
        if (userData.barilgiinId) {
          orshinSuugch.barilgiinId = userData.barilgiinId;
        }
      }
    } else if (bairIdToUse && doorNoToUse && !req.body.baiguullagiinId) {
      // Handle Wallet API address - create/find barilga in centralized org
      // Only treat as WALLET_API if baiguullagiinId is NOT provided (ensures OWN_ORG takes priority)

      // Get bairName from request or fetch from Wallet API
      let walletBairName = req.body.bairName || req.body.walletBairName;

      if (!walletBairName && bairIdToUse) {
        // Try to fetch bair name from Wallet API (optional, frontend should send it)
        try {
          // Note: We don't have a direct getBairById endpoint, so frontend should send bairName
        } catch (error) {}
      }

      if (walletBairName) {
        try {
          // Find or create barilga in centralized org
          const barilgaResult = await findOrCreateBarilgaFromWallet(
            bairIdToUse,
            walletBairName,
          );

          // Set centralized org as primary address
          orshinSuugch.baiguullagiinId = CENTRALIZED_ORG_ID;
          orshinSuugch.barilgiinId = barilgaResult.barilgiinId;

          // Also add to toots array for tracking
          const walletTootEntry = {
            toot: doorNoToUse,
            source: "WALLET_API",
            walletBairId: bairIdToUse,
            walletDoorNo: doorNoToUse,
            bairniiNer: walletBairName || bairIdToUse,
            ner: orshinSuugch.ner || "",
            ovog: orshinSuugch.ovog || "",
            baiguullagiinId: CENTRALIZED_ORG_ID,
            barilgiinId: barilgaResult.barilgiinId,
            createdAt: new Date(),
          };

          const existingWalletTootIndex = orshinSuugch.toots?.findIndex(
            (t) =>
              t.source === "WALLET_API" &&
              t.walletBairId === bairIdToUse &&
              t.walletDoorNo === doorNoToUse &&
              (!t.walletCustomerId || !req.body.customerId ||
                t.walletCustomerId === req.body.customerId),
          );

          if (existingWalletTootIndex >= 0) {
            orshinSuugch.toots[existingWalletTootIndex] = walletTootEntry;
          } else {
            if (!orshinSuugch.toots) {
              orshinSuugch.toots = [];
            }
            orshinSuugch.toots.push(walletTootEntry);
          }
        } catch (error) {
          // Fallback: just add to toots array without centralized org
          const walletTootEntry = {
            toot: doorNoToUse,
            source: "WALLET_API",
            walletBairId: bairIdToUse,
            walletDoorNo: doorNoToUse,
            bairniiNer: walletBairName || bairIdToUse,
            ner: orshinSuugch.ner || "",
            ovog: orshinSuugch.ovog || "",
            createdAt: new Date(),
          };

          if (!orshinSuugch.toots) {
            orshinSuugch.toots = [];
          }

          const existingIdx = orshinSuugch.toots.findIndex(
            (t) =>
              t.source === "WALLET_API" &&
              t.walletBairId === bairIdToUse &&
              t.walletDoorNo === doorNoToUse &&
              (!t.walletCustomerId || !req.body.customerId ||
                t.walletCustomerId === req.body.customerId),
          );
          if (existingIdx >= 0) {
            orshinSuugch.toots[existingIdx] = walletTootEntry;
          } else {
            orshinSuugch.toots.push(walletTootEntry);
          }
        }
      } else {
        // Fallback: add to toots array without centralized org (if bairName not provided)
        const walletTootEntry = {
          toot: doorNoToUse,
          source: "WALLET_API",
          walletBairId: bairIdToUse,
          walletDoorNo: doorNoToUse,
          createdAt: new Date(),
        };

        if (!orshinSuugch.toots) {
          orshinSuugch.toots = [];
        }

        const existingIdx = orshinSuugch.toots.findIndex(
          (t) =>
            t.source === "WALLET_API" &&
            t.walletBairId === bairIdToUse &&
            t.walletDoorNo === doorNoToUse &&
            (!t.walletCustomerId || !req.body.customerId ||
              t.walletCustomerId === req.body.customerId),
        );
        if (existingIdx >= 0) {
          orshinSuugch.toots[existingIdx] = walletTootEntry;
        } else {
          orshinSuugch.toots.push(walletTootEntry);
        }
      }
    }

    // Explicitly ensure walletBairId and walletDoorNo are saved (they might be in userData but need to be on document)
    if (userData.walletBairId) {
      orshinSuugch.walletBairId = userData.walletBairId;
    }
    if (userData.walletDoorNo) {
      orshinSuugch.walletDoorNo = userData.walletDoorNo;
    }
    // Also ensure bairniiNer is saved if provided
    if (req.body.bairniiNer) {
      orshinSuugch.bairniiNer = req.body.bairniiNer;
    }

    if (req.body.firebaseToken) {
      orshinSuugch.firebaseToken = req.body.firebaseToken;
    }

    await orshinSuugch.save();

    let billingInfo = null;

    // Optimized: Consolidate Wallet API calls if address is available
    if (bairIdToUse && doorNoToUse) {
      try {
        // Run billing lookups in parallel where possible
        const billingResponse = await walletApiService.getBillingByAddress(
          phoneNumber,
          bairIdToUse,
          doorNoToUse,
        );

        if (
          billingResponse &&
          Array.isArray(billingResponse) &&
          billingResponse.length > 0
        ) {
          billingInfo = billingResponse[0];

          if (
            !billingInfo.billingId &&
            (billingInfo.customerId || billingInfo.customerCode)
          ) {
            try {
              // Parallel fetch for list and customer billing
              const [billingByCustomer, billingList] = await Promise.all([
                billingInfo.customerId
                  ? walletApiService
                      .getBillingByCustomer(phoneNumber, billingInfo.customerId)
                      .catch(() => null)
                  : null,
                walletApiService.getBillingList(phoneNumber).catch(() => []),
              ]);

              if (billingByCustomer && billingByCustomer.billingId) {
                billingInfo.billingId = billingByCustomer.billingId;
              } else if (billingList && billingList.length > 0) {
                const matching = billingList.find(
                  (b) =>
                    b.customerId === billingInfo.customerId ||
                    b.customerCode === billingInfo.customerCode,
                );
                if (matching) {
                  billingInfo.billingId = matching.billingId;
                }
              }
            } catch (err) {}
          }

          // Connect billing if needed
          if (billingInfo.customerId) {
            walletApiService
              .saveBilling(phoneNumber, { customerId: billingInfo.customerId })
              .catch(() => null);
          }

          // Update user fields in memory
          if (billingInfo.customerName) {
            const nameParts = billingInfo.customerName.split(" ");
            if (nameParts.length >= 2) {
              orshinSuugch.ovog = nameParts[0];
              orshinSuugch.ner = nameParts.slice(1).join(" ");
            } else {
              orshinSuugch.ner = billingInfo.customerName;
            }
          }
          if (billingInfo.customerAddress)
            orshinSuugch.bairniiNer = billingInfo.customerAddress;
          if (billingInfo.customerId)
            orshinSuugch.walletCustomerId = billingInfo.customerId;
          if (billingInfo.customerCode)
            orshinSuugch.walletCustomerCode = billingInfo.customerCode;

          await orshinSuugch.save();
        }
      } catch (billingError) {}
    }

    // Create gerees for all OWN_ORG toots that don't have gerees yet
    if (
      orshinSuugch.toots &&
      Array.isArray(orshinSuugch.toots) &&
      orshinSuugch.toots.length > 0
    ) {
      const ownOrgToots = orshinSuugch.toots.filter(
        (t) => t.source === "OWN_ORG" && t.baiguullagiinId && t.barilgiinId,
      );

      for (const tootEntry of ownOrgToots) {
        try {
          const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            tootEntry.baiguullagiinId,
          );

          if (!baiguullaga) {
            continue;
          }

          const tukhainBaaziinKholbolt = db.kholboltuud.find(
            (kholbolt) =>
              kholbolt.baiguullagiinId === baiguullaga._id.toString(),
          );

          if (!tukhainBaaziinKholbolt) {
            continue;
          }

          // Check if geree already exists for this specific toot (user + barilgiinId + toot combination)
          const GereeModel = Geree(tukhainBaaziinKholbolt);
          const existingGeree = await GereeModel.findOne({
            orshinSuugchId: orshinSuugch._id.toString(),
            barilgiinId: tootEntry.barilgiinId,
            toot: tootEntry.toot,
            tuluv: { $ne: "Цуцалсан" }, // Only check active gerees
          });

          if (existingGeree) {
            continue;
          }

          const existingCancelledGeree = await GereeModel.findOne({
            barilgiinId: tootEntry.barilgiinId,
            toot: tootEntry.toot,
            davkhar: tootEntry.davkhar || "",
            orts: tootEntry.orts || "",
            tuluv: "Цуцалсан",
            orshinSuugchId: orshinSuugch._id.toString(),
          });

          if (existingCancelledGeree) {
            // Reactivate the cancelled geree instead of creating a new one
            const targetBarilga = baiguullaga.barilguud?.find(
              (b) => String(b._id) === String(tootEntry.barilgiinId),
            );

            if (targetBarilga) {
              const ashiglaltiinZardluudData =
                targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
              const liftShalgayaData = targetBarilga.tokhirgoo?.liftShalgaya;
              const choloolugdokhDavkhar =
                liftShalgayaData?.choloolugdokhDavkhar || [];

              const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
                ner: zardal.ner,
                turul: zardal.turul,
                zardliinTurul: zardal.zardliinTurul,
                tariff: zardal.tariff,
                tariffUsgeer: zardal.tariffUsgeer || "",
                tulukhDun: 0,
                dun: zardal.dun || 0,
                bodokhArga: zardal.bodokhArga || "",
                tseverUsDun: zardal.tseverUsDun || 0,
                bokhirUsDun: zardal.bokhirUsDun || 0,
                usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
                tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
                tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
                tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
                suuriKhuraamj: zardal.suuriKhuraamj || 0,
                nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
                ognoonuud: zardal.ognoonuud || [],
              }));

              // Extract tailbar from ashiglaltiinZardluud (combine all tailbar values if multiple exist)
              const tailbarFromZardluud =
                ashiglaltiinZardluudData
                  .map((zardal) => zardal.tailbar)
                  .filter((tailbar) => tailbar && tailbar.trim())
                  .join("; ") || "";

              const niitTulbur = ashiglaltiinZardluudData.reduce(
                (total, zardal) => {
                  const tariff = zardal.tariff || 0;
                  const isLiftItem =
                    zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
                  if (
                    isLiftItem &&
                    tootEntry.davkhar &&
                    choloolugdokhDavkhar.includes(tootEntry.davkhar)
                  ) {
                    return total;
                  }
                  return total + tariff;
                },
                0,
              );

              const duuregNer =
                targetBarilga.tokhirgoo?.duuregNer || tootEntry.duureg || "";
              // Normalize horoo to always be an object format
              let horooData =
                targetBarilga.tokhirgoo?.horoo || tootEntry.horoo || {};
              if (typeof horooData === "string") {
                horooData = { ner: horooData, kod: horooData };
              } else if (!horooData || typeof horooData !== "object") {
                horooData = {};
              }
              const sohNer =
                targetBarilga.tokhirgoo?.sohNer || tootEntry.soh || "";

              const updateData = {
                tuluv: "Идэвхтэй",
                gereeniiOgnoo: new Date(),
                orshinSuugchId: orshinSuugch._id.toString(),
                barilgiinId: tootEntry.barilgiinId, // Update to new barilgiinId if changed
                bairNer:
                  targetBarilga.ner || existingCancelledGeree.bairNer || "", // Update building name
                sukhBairshil: `${duuregNer}, ${horooData.ner || ""}, ${sohNer}`,
                duureg: duuregNer,
                horoo: horooData,
                sohNer: sohNer,
                toot: tootEntry.toot,
                davkhar:
                  tootEntry.davkhar || existingCancelledGeree.davkhar || "",
                orts: tootEntry.orts || existingCancelledGeree.orts || "",
                zardluud: zardluudArray,
                niitTulbur: niitTulbur,
                ashiglaltiinZardal: 0,
                ovog: orshinSuugch.ovog || existingCancelledGeree.ovog,
                ner: orshinSuugch.ner || existingCancelledGeree.ner,
                register:
                  orshinSuugch.register || existingCancelledGeree.register,
                utas: [orshinSuugch.utas],
                mail: orshinSuugch.mail || existingCancelledGeree.mail,
                tailbar: existingCancelledGeree.tailbar || "", // Preserve tailbar if exists
              };

              await GereeModel.findByIdAndUpdate(existingCancelledGeree._id, {
                $set: updateData,
              });
              continue; // Skip creating new contract, we reactivated the old one
            }
          }

          // Validate: One toot cannot have different owners
          // Check if this toot already has an active contract with a different orshinSuugchId
          const conflictingGeree = await GereeModel.findOne({
            barilgiinId: tootEntry.barilgiinId,
            toot: tootEntry.toot,
            tuluv: "Идэвхтэй",
            orshinSuugchId: { $ne: orshinSuugch._id.toString() },
          });

          if (conflictingGeree) {
            continue; // Skip creating contract - toot already owned by someone else
          }

          // Creating new geree for toot
          const targetBarilga = baiguullaga.barilguud?.find(
            (b) => String(b._id) === String(tootEntry.barilgiinId),
          );

          if (targetBarilga) {
            // Get ashiglaltiinZardluud from barilga
            const ashiglaltiinZardluudData =
              targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
            const liftShalgayaData = targetBarilga.tokhirgoo?.liftShalgaya;
            const choloolugdokhDavkhar =
              liftShalgayaData?.choloolugdokhDavkhar || [];

            const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
              ner: zardal.ner,
              turul: zardal.turul,
              zardliinTurul: zardal.zardliinTurul,
              tariff: zardal.tariff,
              tariffUsgeer: zardal.tariffUsgeer || "",
              tulukhDun: 0,
              dun: zardal.dun || 0,
              bodokhArga: zardal.bodokhArga || "",
              tseverUsDun: zardal.tseverUsDun || 0,
              bokhirUsDun: zardal.bokhirUsDun || 0,
              usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
              tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
              tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
              tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
              suuriKhuraamj: zardal.suuriKhuraamj || 0,
              nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
              ognoonuud: zardal.ognoonuud || [],
            }));

            const niitTulbur = ashiglaltiinZardluudData.reduce(
              (total, zardal) => {
                const tariff = zardal.tariff || 0;
                const isLiftItem =
                  zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
                if (
                  isLiftItem &&
                  tootEntry.davkhar &&
                  choloolugdokhDavkhar.includes(tootEntry.davkhar)
                ) {
                  return total;
                }
                return total + tariff;
              },
              0,
            );

            const duuregNer =
              targetBarilga.tokhirgoo?.duuregNer || tootEntry.duureg || "";
            // Normalize horoo to always be an object format
            let horooData =
              targetBarilga.tokhirgoo?.horoo || tootEntry.horoo || {};
            if (typeof horooData === "string") {
              horooData = { ner: horooData, kod: horooData };
            } else if (!horooData || typeof horooData !== "object") {
              horooData = {};
            }
            const sohNer =
              targetBarilga.tokhirgoo?.sohNer || tootEntry.soh || "";

            // Create geree (contract) for this specific toot
            const contractData = {
              gereeniiDugaar: `ГД-${Date.now().toString().slice(-8)}`,
              gereeniiOgnoo: new Date(),
              turul: "Үндсэн",
              tuluv: "Идэвхтэй",
              ovog: orshinSuugch.ovog || "",
              ner: orshinSuugch.ner || "",
              register: orshinSuugch.register || "",
              utas: [orshinSuugch.utas],
              mail: orshinSuugch.mail || "",
              baiguullagiinId: baiguullaga._id,
              baiguullagiinNer: baiguullaga.ner,
              barilgiinId: tootEntry.barilgiinId,
              tulukhOgnoo: await getDueOgnooHelper(kholbolt, baiguullaga._id, tootEntry.barilgiinId),
              ashiglaltiinZardal: 0,
              niitTulbur: niitTulbur,
              toot: tootEntry.toot,
              davkhar: tootEntry.davkhar || "",
              orts: tootEntry.orts || "",
              bairNer: targetBarilga.ner || "",
              sukhBairshil: `${duuregNer}, ${horooData.ner || ""}, ${sohNer}`,
              duureg: duuregNer,
              horoo: horooData,
              sohNer: sohNer,
              burtgesenAjiltan: orshinSuugch._id,
              orshinSuugchId: orshinSuugch._id.toString(),
              temdeglel: `Wallet API-аас автоматаар үүссэн гэрээ (Тоот: ${tootEntry.toot})`,
              tailbar: "",
              actOgnoo: new Date(),
              baritsaaniiUldegdel: 0,
              ekhniiUldegdel: orshinSuugch.ekhniiUldegdel || 0,
              zardluud: zardluudArray,
              segmentuud: [],
              khungulultuud: [],
            };

            const geree = new Geree(tukhainBaaziinKholbolt)(contractData);
            await geree.save();

            // Update davkhar with toot if provided
            if (tootEntry.toot && tootEntry.davkhar) {
              await exports.updateDavkharWithToot(
                baiguullaga,
                tootEntry.barilgiinId,
                tootEntry.davkhar,
                tootEntry.toot,
                tukhainBaaziinKholbolt,
              );
            }
          }
        } catch (tootGereeError) {
          // Continue with next toot if this one fails
        }
      }
    } else if (orshinSuugch.baiguullagiinId && orshinSuugch.barilgiinId) {
      // Backward compatibility: if toots array is empty but old fields exist, create geree for primary toot
      try {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          orshinSuugch.baiguullagiinId,
        );

        if (!baiguullaga) {
        } else {
          const tukhainBaaziinKholbolt = db.kholboltuud.find(
            (kholbolt) =>
              kholbolt.baiguullagiinId === baiguullaga._id.toString(),
          );

          if (!tukhainBaaziinKholbolt) {
          } else {
            // Check if geree already exists for this user and toot combination
            const GereeModel = Geree(tukhainBaaziinKholbolt);
            const existingGeree = await GereeModel.findOne({
              orshinSuugchId: orshinSuugch._id.toString(),
              barilgiinId: orshinSuugch.barilgiinId,
              toot: orshinSuugch.toot || "",
              tuluv: { $ne: "Цуцалсан" }, // Only check active gerees
            });

            if (existingGeree) {
            } else {
              // Validate: One toot cannot have different owners
              if (orshinSuugch.toot && orshinSuugch.barilgiinId) {
                const conflictingGeree = await GereeModel.findOne({
                  barilgiinId: orshinSuugch.barilgiinId,
                  toot: orshinSuugch.toot,
                  tuluv: "Идэвхтэй",
                  orshinSuugchId: { $ne: orshinSuugch._id.toString() },
                });

                if (conflictingGeree) {
                  // Skip creating contract - toot already owned by someone else
                } else {
                  const targetBarilga = baiguullaga.barilguud?.find(
                    (b) => String(b._id) === String(orshinSuugch.barilgiinId),
                  );

                  if (targetBarilga) {
                    // Get ashiglaltiinZardluud from barilga
                    const ashiglaltiinZardluudData =
                      targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
                    const liftShalgayaData =
                      targetBarilga.tokhirgoo?.liftShalgaya;
                    const choloolugdokhDavkhar =
                      liftShalgayaData?.choloolugdokhDavkhar || [];

                    const zardluudArray = ashiglaltiinZardluudData.map(
                      (zardal) => ({
                        ner: zardal.ner,
                        turul: zardal.turul,
                        zardliinTurul: zardal.zardliinTurul,
                        tariff: zardal.tariff,
                        tariffUsgeer: zardal.tariffUsgeer || "",
                        tulukhDun: 0,
                        dun: zardal.dun || 0,
                        bodokhArga: zardal.bodokhArga || "",
                        tseverUsDun: zardal.tseverUsDun || 0,
                        bokhirUsDun: zardal.bokhirUsDun || 0,
                        usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
                        tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
                        tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
                        tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
                        suuriKhuraamj: zardal.suuriKhuraamj || 0,
                        nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
                        ognoonuud: zardal.ognoonuud || [],
                      }),
                    );

                    const niitTulbur = ashiglaltiinZardluudData.reduce(
                      (total, zardal) => {
                        const tariff = zardal.tariff || 0;
                        const isLiftItem =
                          zardal.zardliinTurul &&
                          zardal.zardliinTurul === "Лифт";
                        if (
                          isLiftItem &&
                          orshinSuugch.davkhar &&
                          choloolugdokhDavkhar.includes(orshinSuugch.davkhar)
                        ) {
                          return total;
                        }
                        return total + tariff;
                      },
                      0,
                    );

                    const duuregNer =
                      targetBarilga.tokhirgoo?.duuregNer ||
                      orshinSuugch.duureg ||
                      "";
                    // Normalize horoo to always be an object format
                    let horooData =
                      targetBarilga.tokhirgoo?.horoo ||
                      orshinSuugch.horoo ||
                      {};
                    if (typeof horooData === "string") {
                      horooData = { ner: horooData, kod: horooData };
                    } else if (!horooData || typeof horooData !== "object") {
                      horooData = {};
                    }
                    const sohNer =
                      targetBarilga.tokhirgoo?.sohNer || orshinSuugch.soh || "";

                    // Create geree (contract)
                    const contractData = {
                      gereeniiDugaar: `ГД-${Date.now().toString().slice(-8)}`,
                      gereeniiOgnoo: new Date(),
                      turul: "Үндсэн",
                      tuluv: "Идэвхтэй",
                      ovog: orshinSuugch.ovog || "",
                      ner: orshinSuugch.ner || "",
                      register: orshinSuugch.register || "",
                      utas: [orshinSuugch.utas],
                      mail: orshinSuugch.mail || "",
                      baiguullagiinId: baiguullaga._id,
                      baiguullagiinNer: baiguullaga.ner,
                      barilgiinId: orshinSuugch.barilgiinId,
                      tulukhOgnoo: await getDueOgnooHelper(kholbolt, baiguullaga._id, orshinSuugch.barilgiinId),
                      ashiglaltiinZardal: 0,
                      niitTulbur: niitTulbur,
                      toot: orshinSuugch.toot || "",
                      davkhar: orshinSuugch.davkhar || "",
                      bairNer: targetBarilga.ner || "",
                      sukhBairshil: `${duuregNer}, ${horooData.ner || ""}, ${sohNer}`,
                      duureg: duuregNer,
                      horoo: horooData,
                      sohNer: sohNer,
                      burtgesenAjiltan: orshinSuugch._id,
                      orshinSuugchId: orshinSuugch._id.toString(),
                      temdeglel: "Wallet API-аас автоматаар үүссэн гэрээ",
                      tailbar: tailbarFromZardluud || "",
                      actOgnoo: new Date(),
                      baritsaaniiUldegdel: 0,
                      ekhniiUldegdel: orshinSuugch.ekhniiUldegdel || 0,
                      zardluud: zardluudArray,
                      segmentuud: [],
                      khungulultuud: [],
                    };

                    const geree = new Geree(tukhainBaaziinKholbolt)(
                      contractData,
                    );
                    await geree.save();

                    // Create invoice immediately (Like Excel Import)
                    try {
                      const {
                        gereeNeesNekhemjlekhUusgekh,
                      } = require("./nekhemjlekhController");
                      await gereeNeesNekhemjlekhUusgekh(
                        geree,
                        baiguullaga,
                        tukhainBaaziinKholbolt,
                        "automataar",
                        true,
                      );
                    } catch (invErr) {}

                    // Update davkhar with toot if provided
                    if (orshinSuugch.toot && orshinSuugch.davkhar) {
                      await exports.updateDavkharWithToot(
                        baiguullaga,
                        orshinSuugch.barilgiinId,
                        orshinSuugch.davkhar,
                        orshinSuugch.toot,
                        tukhainBaaziinKholbolt,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      } catch (gereeError) {
        // Don't fail login if geree creation fails
      }
    }

    const token = await orshinSuugch.tokenUusgeye();

    const butsaakhObject = {
      result: orshinSuugch,
      success: true,
      token: token,
      walletUserInfo: walletUserInfo,
    };

    if (billingInfo) {
      butsaakhObject.billingInfo = billingInfo;
    }

    res.status(200).json(butsaakhObject);
  } catch (err) {
    next(err);
  }
});

exports.walletBurtgey = asyncHandler(async (req, res, next) => {
  try {
    if (!req.body.utas) {
      throw new aldaa("Утасны дугаар заавал бөглөх шаардлагатай!");
    }

    // Email is optional - only register with Wallet API if email is provided
    const email = req.body.mail ? String(req.body.mail).trim() : null;

    const { db } = require("zevbackv2");
    const phoneNumber = String(req.body.utas).trim();

    let walletUserInfo = null;

    if (email) {
      walletUserInfo = await walletApiService.registerUser(phoneNumber, email);

      if (!walletUserInfo || !walletUserInfo.userId) {
        throw new aldaa("Хэтэвчний системд бүртгүүлэхэд алдаа гарлаа.");
      }
    }

    let orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
      $or: [
        { utas: phoneNumber },
        ...(walletUserInfo?.userId
          ? [{ walletUserId: walletUserInfo.userId }]
          : []),
      ],
    });

    const userData = {
      utas: phoneNumber,
      mail: walletUserInfo?.email || email || "",
      ...(walletUserInfo?.userId
        ? { walletUserId: walletUserInfo.userId }
        : {}),
      erkh: "OrshinSuugch",
      nevtrekhNer: phoneNumber,
    };

    // Save password locally if provided (password is NOT sent to Wallet API, only stored in our DB)
    if (req.body.nuutsUg) {
      userData.nuutsUg = req.body.nuutsUg;
    }

    // Preserve existing baiguullagiinId if user already has one
    if (orshinSuugch && orshinSuugch.baiguullagiinId) {
      userData.baiguullagiinId = orshinSuugch.baiguullagiinId;
      userData.baiguullagiinNer = orshinSuugch.baiguullagiinNer;
    }

    // Save baiguullagiinId if provided (from OWN_ORG bair selection or WALLET_API)
    if (req.body.baiguullagiinId) {
      userData.baiguullagiinId = req.body.baiguullagiinId;
      // Try to get baiguullagiinNer if baiguullagiinId is provided
      try {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          req.body.baiguullagiinId,
        );
        if (baiguullaga) {
          userData.baiguullagiinNer = baiguullaga.ner;
        }
      } catch (error) {}
    }

    // Handle barilgiinId - check both barilgiinId and bairId (frontend might send either)
    const barilgiinIdToSave = req.body.barilgiinId || req.body.bairId;

    // Validate: User can only register with ONE building
    // If user already has a barilgiinId, they cannot register with a different one
    if (orshinSuugch && orshinSuugch.barilgiinId && barilgiinIdToSave) {
      const existingBarilgiinId = String(orshinSuugch.barilgiinId);
      const newBarilgiinId = String(barilgiinIdToSave);

      if (existingBarilgiinId !== newBarilgiinId) {
        // Get building names for better error message
        let existingBuildingName = "";
        let newBuildingName = "";

        try {
          if (userData.baiguullagiinId || orshinSuugch.baiguullagiinId) {
            const baiguullagaId =
              userData.baiguullagiinId || orshinSuugch.baiguullagiinId;
            const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
              baiguullagaId,
            );

            if (baiguullaga) {
              const existingBarilga = baiguullaga.barilguud?.find(
                (b) => String(b._id) === existingBarilgiinId,
              );
              const newBarilga = baiguullaga.barilguud?.find(
                (b) => String(b._id) === newBarilgiinId,
              );

              existingBuildingName =
                existingBarilga?.ner || existingBarilgiinId;
              newBuildingName = newBarilga?.ner || newBarilgiinId;
            }
          }
        } catch (err) {
          // Error fetching building names
        }

        return res.status(400).json({
          success: false,
          message: `Та аль хэдийн "${existingBuildingName}" барилгад бүртгэгдсэн байна. Өөр барилгад бүртгүүлэх боломжгүй.`,
        });
      }
    }

    if (barilgiinIdToSave) {
      userData.barilgiinId = barilgiinIdToSave;
    } else if (orshinSuugch && orshinSuugch.barilgiinId) {
      // Preserve existing barilgiinId if user already has one
      userData.barilgiinId = orshinSuugch.barilgiinId;
    }

    if (req.body.duureg) userData.duureg = req.body.duureg;
    if (req.body.horoo) userData.horoo = req.body.horoo;
    if (req.body.soh) userData.soh = req.body.soh;
    if (req.body.toot) userData.toot = req.body.toot;
    if (req.body.davkhar) userData.davkhar = req.body.davkhar;
    if (req.body.orts) userData.orts = req.body.orts;

    // Save address if provided
    if (req.body.bairId) {
      userData.walletBairId = req.body.bairId;
    }
    if (req.body.doorNo) {
      userData.walletDoorNo = req.body.doorNo;
    }

    // Validate OWN_ORG bair toot/doorNo if provided
    // Check for OWN_ORG: baiguullagiinId is required, and either barilgiinId OR bairId (frontend might send bairId)
    const isOwnOrgAddress =
      req.body.baiguullagiinId &&
      req.body.doorNo &&
      (req.body.barilgiinId || req.body.bairId);
    const ownOrgBarilgiinId = req.body.barilgiinId || req.body.bairId; // Use barilgiinId if provided, otherwise bairId

    if (isOwnOrgAddress) {
      try {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          req.body.baiguullagiinId,
        );
        if (!baiguullaga) {
          throw new aldaa("Байгууллагын мэдээлэл олдсонгүй!");
        }

        const targetBarilga = baiguullaga.barilguud?.find(
          (b) => String(b._id) === String(ownOrgBarilgiinId),
        );

        if (!targetBarilga) {
          throw new aldaa("Барилгын мэдээлэл олдсонгүй!");
        }

        const tootToValidate = req.body.doorNo.trim();
        const davkharFromRequest = (req.body.davkhar || "").trim();
        const ortsFromRequest = (req.body.orts || "1").trim();

        // Check if toot exists in davkhariinToonuud (available toots)
        // Automatically determine orts and davkhar from toot (same as website registration)
        const davkhariinToonuud =
          targetBarilga.tokhirgoo?.davkhariinToonuud || {};
        let tootFound = false;
        let foundDavkhar = null;
        let foundOrts = null;
        let matchedFloorKey = null;

        if (davkharFromRequest) {
          // If davkhar is provided, check specific floor first
          const floorKey = `${ortsFromRequest}::${davkharFromRequest}`;
          const tootArray = davkhariinToonuud[floorKey];

          if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
            let tootList = [];
            if (
              typeof tootArray[0] === "string" &&
              tootArray[0].includes(",")
            ) {
              tootList = tootArray[0]
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);
            } else {
              tootList = tootArray
                .map((t) => String(t).trim())
                .filter((t) => t);
            }

            if (tootList.includes(tootToValidate)) {
              tootFound = true;
              matchedFloorKey = floorKey;
              foundDavkhar = davkharFromRequest;
              foundOrts = ortsFromRequest;
            }
          }
        }

        // If not found with provided davkhar/orts, or davkhar not provided, search all floors
        if (!tootFound) {
          for (const [floorKey, tootArray] of Object.entries(
            davkhariinToonuud,
          )) {
            // Skip invalid entries that don't have :: separator
            if (!floorKey.includes("::")) {
              continue;
            }

            if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
              let tootList = [];
              if (
                typeof tootArray[0] === "string" &&
                tootArray[0].includes(",")
              ) {
                tootList = tootArray[0]
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t);
              } else {
                tootList = tootArray
                  .map((t) => String(t).trim())
                  .filter((t) => t);
              }

              if (tootList.includes(tootToValidate)) {
                tootFound = true;
                matchedFloorKey = floorKey;

                // Extract orts and davkhar from floorKey (format: "orts::davkhar")
                const parts = floorKey.split("::");
                if (parts.length === 2) {
                  foundOrts = parts[0].trim(); // orts (entrance)
                  foundDavkhar = parts[1].trim(); // davkhar (floor)
                }
                break;
              }
            }
          }
        }

        if (!tootFound) {
          throw new aldaa(
            `(${tootToValidate}) тоот энэ барилгад бүртгэлгүй байна`,
          );
        }

        // Use found values, fallback to request values if not found
        const finalDavkhar = foundDavkhar || davkharFromRequest || "";
        const finalOrts = foundOrts || ortsFromRequest || "1";

        // Validation passes - toot will be added to toots array
        // Multiple users can have the same toot, so no unique check needed

        // Set auto-determined values in userData for backward compatibility
        // This ensures davkhar and orts are available even if not provided in request
        if (finalDavkhar) {
          userData.davkhar = finalDavkhar;
        }
        if (finalOrts) {
          userData.orts = finalOrts;
        }
        // Also set toot in userData for backward compatibility
        userData.toot = tootToValidate;

        // Prepare toot entry for toots array
        userData.newTootEntry = {
          toot: tootToValidate,
          source: "OWN_ORG",
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: ownOrgBarilgiinId, // Use the resolved barilgiinId (from barilgiinId or bairId)
          davkhar: finalDavkhar, // Auto-determined from toot
          orts: finalOrts, // Auto-determined from toot
          duureg: targetBarilga.tokhirgoo?.duuregNer || "",
          horoo: targetBarilga.tokhirgoo?.horoo || {},
          soh: targetBarilga.tokhirgoo?.sohNer || "",
          bairniiNer: targetBarilga.ner || "",
        };
      } catch (error) {
        throw error;
      }
    }

    if (orshinSuugch) {
      Object.assign(orshinSuugch, userData);
    } else {
      orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(userData);
      // Initialize toots array if it doesn't exist
      if (!orshinSuugch.toots) {
        orshinSuugch.toots = [];
      }
    }

    // Handle multiple toots - add new toot to array if provided
    if (userData.newTootEntry) {
      // Check if this toot already exists in user's toots array
      const existingTootIndex = orshinSuugch.toots?.findIndex(
        (t) =>
          t.toot === userData.newTootEntry.toot &&
          t.barilgiinId === userData.newTootEntry.barilgiinId,
      );

      if (existingTootIndex >= 0) {
        // Update existing toot entry
        orshinSuugch.toots[existingTootIndex] = userData.newTootEntry;
      } else {
        // Add new toot to array
        if (!orshinSuugch.toots) {
          orshinSuugch.toots = [];
        }
        orshinSuugch.toots.push(userData.newTootEntry);
      }

      // Also set as primary toot for backward compatibility
      orshinSuugch.toot = userData.newTootEntry.toot;
      orshinSuugch.baiguullagiinId = userData.newTootEntry.baiguullagiinId;
      orshinSuugch.barilgiinId = userData.newTootEntry.barilgiinId;
      orshinSuugch.davkhar = userData.newTootEntry.davkhar; // Auto-determined from toot
      orshinSuugch.orts = userData.newTootEntry.orts; // Auto-determined from toot
      orshinSuugch.duureg = userData.newTootEntry.duureg;
      orshinSuugch.horoo = userData.newTootEntry.horoo;
      orshinSuugch.soh = userData.newTootEntry.soh;
    } else if (
      req.body.bairId &&
      req.body.doorNo &&
      !req.body.baiguullagiinId
    ) {
      // Handle Wallet API address - create/find barilga in centralized org
      // Only treat as WALLET_API if baiguullagiinId is NOT provided (ensures OWN_ORG takes priority)

      // Get bairName from request (frontend should send it from address selection)
      const walletBairName = req.body.bairName || req.body.walletBairName;

      if (walletBairName) {
        try {
          // Find or create barilga in centralized org
          const barilgaResult = await findOrCreateBarilgaFromWallet(
            req.body.bairId,
            walletBairName,
          );

          // Set centralized org as primary address
          orshinSuugch.baiguullagiinId = CENTRALIZED_ORG_ID;
          orshinSuugch.barilgiinId = barilgaResult.barilgiinId;

          // Also add to toots array for tracking
          const walletTootEntry = {
            toot: req.body.doorNo,
            source: "WALLET_API",
            walletBairId: req.body.bairId,
            walletDoorNo: req.body.doorNo,
            walletBairName: walletBairName,
            baiguullagiinId: CENTRALIZED_ORG_ID,
            barilgiinId: barilgaResult.barilgiinId,
            createdAt: new Date(),
          };

          const existingWalletTootIndex = orshinSuugch.toots?.findIndex(
            (t) =>
              t.source === "WALLET_API" &&
              t.walletBairId === req.body.bairId &&
              t.walletDoorNo === req.body.doorNo,
          );

          if (existingWalletTootIndex >= 0) {
            orshinSuugch.toots[existingWalletTootIndex] = walletTootEntry;
          } else {
            if (!orshinSuugch.toots) {
              orshinSuugch.toots = [];
            }
            orshinSuugch.toots.push(walletTootEntry);
          }
        } catch (error) {
          // Fallback: just add to toots array without centralized org
          const walletTootEntry = {
            toot: req.body.doorNo,
            source: "WALLET_API",
            walletBairId: req.body.bairId,
            walletDoorNo: req.body.doorNo,
            createdAt: new Date(),
          };

          if (!orshinSuugch.toots) {
            orshinSuugch.toots = [];
          }
          orshinSuugch.toots.push(walletTootEntry);
        }
      } else {
        // Fallback: add to toots array without centralized org (if bairName not provided)
        const walletTootEntry = {
          toot: req.body.doorNo,
          source: "WALLET_API",
          walletBairId: req.body.bairId,
          walletDoorNo: req.body.doorNo,
          createdAt: new Date(),
        };

        if (!orshinSuugch.toots) {
          orshinSuugch.toots = [];
        }
        orshinSuugch.toots.push(walletTootEntry);
      }
    }

    if (req.body.firebaseToken) {
      orshinSuugch.firebaseToken = req.body.firebaseToken;
    }

    await orshinSuugch.save();

    // Create gerees for all OWN_ORG toots that don't have gerees yet
    if (
      orshinSuugch.toots &&
      Array.isArray(orshinSuugch.toots) &&
      orshinSuugch.toots.length > 0
    ) {
      const ownOrgToots = orshinSuugch.toots.filter(
        (t) => t.source === "OWN_ORG" && t.baiguullagiinId && t.barilgiinId,
      );

      for (const tootEntry of ownOrgToots) {
        try {
          const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            tootEntry.baiguullagiinId,
          );

          if (!baiguullaga) {
            continue;
          }

          const tukhainBaaziinKholbolt = db.kholboltuud.find(
            (kholbolt) =>
              kholbolt.baiguullagiinId === baiguullaga._id.toString(),
          );

          if (!tukhainBaaziinKholbolt) {
            continue;
          }

          const GereeModel = Geree(tukhainBaaziinKholbolt);
          const existingGeree = await GereeModel.findOne({
            orshinSuugchId: orshinSuugch._id.toString(),
            barilgiinId: tootEntry.barilgiinId,
            toot: tootEntry.toot,
            tuluv: { $ne: "Цуцалсан" }, // Only check active gerees
          });

          if (existingGeree) {
            continue;
          }

          const existingCancelledGeree = await GereeModel.findOne({
            barilgiinId: tootEntry.barilgiinId,
            toot: tootEntry.toot,
            davkhar: tootEntry.davkhar || "",
            orts: tootEntry.orts || "",
            tuluv: "Цуцалсан",
            orshinSuugchId: orshinSuugch._id.toString(),
          });

          if (existingCancelledGeree) {
            // Reactivate the cancelled geree instead of creating a new one
            const targetBarilga = baiguullaga.barilguud?.find(
              (b) => String(b._id) === String(tootEntry.barilgiinId),
            );

            if (targetBarilga) {
              const ashiglaltiinZardluudData =
                targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
              const liftShalgayaData = targetBarilga.tokhirgoo?.liftShalgaya;
              const choloolugdokhDavkhar =
                liftShalgayaData?.choloolugdokhDavkhar || [];

              const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
                ner: zardal.ner,
                turul: zardal.turul,
                zardliinTurul: zardal.zardliinTurul,
                tariff: zardal.tariff,
                tariffUsgeer: zardal.tariffUsgeer || "",
                tulukhDun: 0,
                dun: zardal.dun || 0,
                bodokhArga: zardal.bodokhArga || "",
                tseverUsDun: zardal.tseverUsDun || 0,
                bokhirUsDun: zardal.bokhirUsDun || 0,
                usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
                tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
                tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
                tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
                suuriKhuraamj: zardal.suuriKhuraamj || 0,
                nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
                ognoonuud: zardal.ognoonuud || [],
              }));

              // Extract tailbar from ashiglaltiinZardluud (combine all tailbar values if multiple exist)
              const tailbarFromZardluud =
                ashiglaltiinZardluudData
                  .map((zardal) => zardal.tailbar)
                  .filter((tailbar) => tailbar && tailbar.trim())
                  .join("; ") || "";

              const niitTulbur = ashiglaltiinZardluudData.reduce(
                (total, zardal) => {
                  const tariff = zardal.tariff || 0;
                  const isLiftItem =
                    zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
                  if (
                    isLiftItem &&
                    tootEntry.davkhar &&
                    choloolugdokhDavkhar.includes(tootEntry.davkhar)
                  ) {
                    return total;
                  }
                  return total + tariff;
                },
                0,
              );

              const duuregNer =
                targetBarilga.tokhirgoo?.duuregNer || tootEntry.duureg || "";
              // Normalize horoo to always be an object format
              let horooData =
                targetBarilga.tokhirgoo?.horoo || tootEntry.horoo || {};
              if (typeof horooData === "string") {
                horooData = { ner: horooData, kod: horooData };
              } else if (!horooData || typeof horooData !== "object") {
                horooData = {};
              }
              const sohNer =
                targetBarilga.tokhirgoo?.sohNer || tootEntry.soh || "";

              const updateData = {
                tuluv: "Идэвхтэй",
                gereeniiOgnoo: new Date(),
                orshinSuugchId: orshinSuugch._id.toString(),
                barilgiinId: tootEntry.barilgiinId, // Update to new barilgiinId if changed
                bairNer:
                  targetBarilga.ner || existingCancelledGeree.bairNer || "", // Update building name
                sukhBairshil: `${duuregNer}, ${horooData.ner || ""}, ${sohNer}`,
                duureg: duuregNer,
                horoo: horooData,
                sohNer: sohNer,
                toot: tootEntry.toot,
                davkhar:
                  tootEntry.davkhar || existingCancelledGeree.davkhar || "",
                orts: tootEntry.orts || existingCancelledGeree.orts || "",
                zardluud: zardluudArray,
                niitTulbur: niitTulbur,
                ashiglaltiinZardal: 0,
                ovog: orshinSuugch.ovog || existingCancelledGeree.ovog,
                ner: orshinSuugch.ner || existingCancelledGeree.ner,
                register:
                  orshinSuugch.register || existingCancelledGeree.register,
                utas: [orshinSuugch.utas],
                mail: orshinSuugch.mail || existingCancelledGeree.mail,
                tailbar: existingCancelledGeree.tailbar || "", // Preserve tailbar if exists
              };

              await GereeModel.findByIdAndUpdate(existingCancelledGeree._id, {
                $set: updateData,
              });
              continue; // Skip creating new contract, we reactivated the old one
            }
          }
          const targetBarilga = baiguullaga.barilguud?.find(
            (b) => String(b._id) === String(tootEntry.barilgiinId),
          );

          if (targetBarilga) {
            // Get ashiglaltiinZardluud from barilga
            const ashiglaltiinZardluudData =
              targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
            const liftShalgayaData = targetBarilga.tokhirgoo?.liftShalgaya;
            const choloolugdokhDavkhar =
              liftShalgayaData?.choloolugdokhDavkhar || [];

            const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
              ner: zardal.ner,
              turul: zardal.turul,
              zardliinTurul: zardal.zardliinTurul,
              tariff: zardal.tariff,
              tariffUsgeer: zardal.tariffUsgeer || "",
              tulukhDun: 0,
              dun: zardal.dun || 0,
              bodokhArga: zardal.bodokhArga || "",
              tseverUsDun: zardal.tseverUsDun || 0,
              bokhirUsDun: zardal.bokhirUsDun || 0,
              usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
              tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
              tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
              tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
              suuriKhuraamj: zardal.suuriKhuraamj || 0,
              nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
              ognoonuud: zardal.ognoonuud || [],
            }));

            const niitTulbur = ashiglaltiinZardluudData.reduce(
              (total, zardal) => {
                const tariff = zardal.tariff || 0;
                const isLiftItem =
                  zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
                if (
                  isLiftItem &&
                  tootEntry.davkhar &&
                  choloolugdokhDavkhar.includes(tootEntry.davkhar)
                ) {
                  return total;
                }
                return total + tariff;
              },
              0,
            );

            const duuregNer =
              targetBarilga.tokhirgoo?.duuregNer || tootEntry.duureg || "";
            // Normalize horoo to always be an object format
            let horooData =
              targetBarilga.tokhirgoo?.horoo || tootEntry.horoo || {};
            if (typeof horooData === "string") {
              horooData = { ner: horooData, kod: horooData };
            } else if (!horooData || typeof horooData !== "object") {
              horooData = {};
            }
            const sohNer =
              targetBarilga.tokhirgoo?.sohNer || tootEntry.soh || "";

            // Create geree (contract) for this specific toot
            const contractData = {
              gereeniiDugaar: `ГД-${Date.now().toString().slice(-8)}`,
              gereeniiOgnoo: new Date(),
              turul: "Үндсэн",
              tuluv: "Идэвхтэй",
              ovog: orshinSuugch.ovog || "",
              ner: orshinSuugch.ner || "",
              register: orshinSuugch.register || "",
              utas: [orshinSuugch.utas],
              mail: orshinSuugch.mail || "",
              baiguullagiinId: baiguullaga._id,
              baiguullagiinNer: baiguullaga.ner,
              barilgiinId: tootEntry.barilgiinId,
              tulukhOgnoo: await getDueOgnooHelper(kholbolt, baiguullaga._id, tootEntry.barilgiinId),
              ashiglaltiinZardal: 0,
              niitTulbur: niitTulbur,
              toot: tootEntry.toot,
              davkhar: tootEntry.davkhar || "",
              bairNer: targetBarilga.ner || "",
              sukhBairshil: `${duuregNer}, ${horooData.ner || ""}, ${sohNer}`,
              duureg: duuregNer,
              horoo: horooData,
              sohNer: sohNer,
              burtgesenAjiltan: orshinSuugch._id,
              orshinSuugchId: orshinSuugch._id.toString(),
              temdeglel: `Wallet API-аас автоматаар үүссэн гэрээ (Тоот: ${tootEntry.toot})`,
              tailbar: "",
              actOgnoo: new Date(),
              baritsaaniiUldegdel: 0,
              ekhniiUldegdel: orshinSuugch.ekhniiUldegdel || 0,
              zardluud: zardluudArray,
              segmentuud: [],
              khungulultuud: [],
            };

            const geree = new Geree(tukhainBaaziinKholbolt)(contractData);
            await geree.save();

            // Update davkhar with toot if provided
            if (tootEntry.toot && tootEntry.davkhar) {
              await exports.updateDavkharWithToot(
                baiguullaga,
                tootEntry.barilgiinId,
                tootEntry.davkhar,
                tootEntry.toot,
                tukhainBaaziinKholbolt,
              );
            }
          } else {
          }
        } catch (tootGereeError) {
          // Continue with next toot if this one fails
        }
      }
    } else if (orshinSuugch.baiguullagiinId && orshinSuugch.barilgiinId) {
      // Backward compatibility: if toots array is empty but old fields exist, create geree for primary toot
      try {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          orshinSuugch.baiguullagiinId,
        );

        if (!baiguullaga) {
        } else {
          const tukhainBaaziinKholbolt = db.kholboltuud.find(
            (kholbolt) =>
              kholbolt.baiguullagiinId === baiguullaga._id.toString(),
          );

          if (!tukhainBaaziinKholbolt) {
          } else {
            // Check if geree already exists for this user and toot combination
            const GereeModel = Geree(tukhainBaaziinKholbolt);
            const existingGeree = await GereeModel.findOne({
              orshinSuugchId: orshinSuugch._id.toString(),
              barilgiinId: orshinSuugch.barilgiinId,
              toot: orshinSuugch.toot || "",
              tuluv: { $ne: "Цуцалсан" }, // Only check active gerees
            });

            if (existingGeree) {
              // Geree already exists, skip
            } else {
              const targetBarilga = baiguullaga.barilguud?.find(
                (b) => String(b._id) === String(orshinSuugch.barilgiinId),
              );

              if (targetBarilga) {
                // Get ashiglaltiinZardluud from barilga
                const ashiglaltiinZardluudData =
                  targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
                const liftShalgayaData = targetBarilga.tokhirgoo?.liftShalgaya;
                const choloolugdokhDavkhar =
                  liftShalgayaData?.choloolugdokhDavkhar || [];

                const zardluudArray = ashiglaltiinZardluudData.map(
                  (zardal) => ({
                    ner: zardal.ner,
                    turul: zardal.turul,
                    zardliinTurul: zardal.zardliinTurul,
                    tariff: zardal.tariff,
                    tariffUsgeer: zardal.tariffUsgeer || "",
                    tulukhDun: 0,
                    dun: zardal.dun || 0,
                    bodokhArga: zardal.bodokhArga || "",
                    tseverUsDun: zardal.tseverUsDun || 0,
                    bokhirUsDun: zardal.bokhirUsDun || 0,
                    usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
                    tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
                    tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
                    tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
                    suuriKhuraamj: zardal.suuriKhuraamj || 0,
                    nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
                    ognoonuud: zardal.ognoonuud || [],
                  }),
                );

                const niitTulbur = ashiglaltiinZardluudData.reduce(
                  (total, zardal) => {
                    const tariff = zardal.tariff || 0;
                    const isLiftItem =
                      zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
                    if (
                      isLiftItem &&
                      orshinSuugch.davkhar &&
                      choloolugdokhDavkhar.includes(orshinSuugch.davkhar)
                    ) {
                      return total;
                    }
                    return total + tariff;
                  },
                  0,
                );

                const duuregNer =
                  targetBarilga.tokhirgoo?.duuregNer ||
                  orshinSuugch.duureg ||
                  "";
                // Normalize horoo to always be an object format
                let horooData =
                  targetBarilga.tokhirgoo?.horoo || orshinSuugch.horoo || {};
                if (typeof horooData === "string") {
                  horooData = { ner: horooData, kod: horooData };
                } else if (!horooData || typeof horooData !== "object") {
                  horooData = {};
                }
                const sohNer =
                  targetBarilga.tokhirgoo?.sohNer || orshinSuugch.soh || "";

                // Create geree (contract)
                const contractData = {
                  gereeniiDugaar: `ГД-${Date.now().toString().slice(-8)}`,
                  gereeniiOgnoo: new Date(),
                  turul: "Үндсэн",
                  tuluv: "Идэвхтэй",
                  ovog: orshinSuugch.ovog || "",
                  ner: orshinSuugch.ner || "",
                  register: orshinSuugch.register || "",
                  utas: [orshinSuugch.utas],
                  mail: orshinSuugch.mail || "",
                  baiguullagiinId: baiguullaga._id,
                  baiguullagiinNer: baiguullaga.ner,
                  barilgiinId: orshinSuugch.barilgiinId,
                  tulukhOgnoo: await getDueOgnooHelper(kholbolt, baiguullaga._id, orshinSuugch.barilgiinId),
                  ashiglaltiinZardal: 0,
                  niitTulbur: niitTulbur,
                  toot: orshinSuugch.toot || "",
                  davkhar: orshinSuugch.davkhar || "",
                  bairNer: targetBarilga.ner || "",
                  sukhBairshil: `${duuregNer}, ${horooData.ner || ""}, ${sohNer}`,
                  duureg: duuregNer,
                  horoo: horooData,
                  sohNer: sohNer,
                  burtgesenAjiltan: orshinSuugch._id,
                  orshinSuugchId: orshinSuugch._id.toString(),
                  temdeglel: "Wallet API-аас автоматаар үүссэн гэрээ",
                  actOgnoo: new Date(),
                  baritsaaniiUldegdel: 0,
                  ekhniiUldegdel: orshinSuugch.ekhniiUldegdel || 0,
                  zardluud: zardluudArray,
                  segmentuud: [],
                  khungulultuud: [],
                };

                const geree = new Geree(tukhainBaaziinKholbolt)(contractData);
                await geree.save();

                // Update davkhar with toot if provided
                if (orshinSuugch.toot && orshinSuugch.davkhar) {
                  await exports.updateDavkharWithToot(
                    baiguullaga,
                    orshinSuugch.barilgiinId,
                    orshinSuugch.davkhar,
                    orshinSuugch.toot,
                    tukhainBaaziinKholbolt,
                  );
                }
              }
            }
          }
        }
      } catch (gereeError) {
        // Don't fail registration if geree creation fails
      }
    }

    // Automatically fetch and connect billing if address is provided
    let billingInfo = null;
    if (req.body.bairId && req.body.doorNo) {
      try {
        // getBillingByAddress requires phoneNumber, not walletUserId
        const billingResponse = await walletApiService.getBillingByAddress(
          phoneNumber,
          req.body.bairId,
          req.body.doorNo,
        );

        if (
          billingResponse &&
          Array.isArray(billingResponse) &&
          billingResponse.length > 0
        ) {
          billingInfo = billingResponse[0];

          // If billingId is not in the response, try to get it using customerId
          if (!billingInfo.billingId && billingInfo.customerId) {
            try {
              // Wallet API userId means phoneNumber
              const billingByCustomer =
                await walletApiService.getBillingByCustomer(
                  phoneNumber,
                  billingInfo.customerId,
                );
              if (billingByCustomer && billingByCustomer.billingId) {
                billingInfo.billingId = billingByCustomer.billingId;
                billingInfo.billingName =
                  billingByCustomer.billingName || billingInfo.billingName;
              } else {
                // Try to find billingId from billing list
                try {
                  // Wallet API userId means phoneNumber
                  const billingList =
                    await walletApiService.getBillingList(phoneNumber);
                  if (billingList && billingList.length > 0) {
                    const matchingBilling = billingList.find(
                      (b) =>
                        b.customerId === billingInfo.customerId ||
                        b.customerCode === billingInfo.customerCode,
                    );
                    if (matchingBilling && matchingBilling.billingId) {
                      billingInfo.billingId = matchingBilling.billingId;
                      billingInfo.billingName =
                        matchingBilling.billingName || billingInfo.billingName;
                    } else if (billingList[0] && billingList[0].billingId) {
                      billingInfo.billingId = billingList[0].billingId;
                      billingInfo.billingName =
                        billingList[0].billingName || billingInfo.billingName;
                    }
                  }
                } catch (listError) {}
              }
            } catch (customerBillingError) {
              // Try billing list as fallback
              try {
                // Wallet API userId means phoneNumber
                const billingList =
                  await walletApiService.getBillingList(phoneNumber);
                if (billingList && billingList.length > 0) {
                  const matchingBilling = billingList.find(
                    (b) => b.customerId === billingInfo.customerId,
                  );
                  if (matchingBilling && matchingBilling.billingId) {
                    billingInfo.billingId = matchingBilling.billingId;
                    billingInfo.billingName =
                      matchingBilling.billingName || billingInfo.billingName;
                  }
                }
              } catch (listError) {}
            }
          }

          // Automatically connect billing to Wallet API account
          if (billingInfo.billingId || billingInfo.customerId) {
            try {
              // Wallet API doesn't allow billingId in body - use only customerId
              const billingData = {
                customerId: billingInfo.customerId,
              };

              await walletApiService.saveBilling(phoneNumber, billingData);
            } catch (connectError) {
              // Silent fail - billing connection is optional
            }
          } else {
            // Try to connect billing without billingId using customerId
            if (billingInfo.customerId) {
              try {
                // Send only customerId - Wallet API will return full billing info including billingId
                const billingData = {
                  customerId: billingInfo.customerId,
                };

                // Try to save without billingId - Wallet API might create it
                // saveBilling requires phoneNumber, not walletUserId
                const connectResult = await walletApiService.saveBilling(
                  phoneNumber,
                  billingData,
                );

                // If successful, update billingInfo with returned billingId
                if (connectResult && connectResult.billingId) {
                  billingInfo.billingId = connectResult.billingId;
                }
              } catch (connectError) {
                // Silent fail - billing connection is optional
              }
            }
          }

          // Update user with billing data
          const updateData = {};
          if (billingInfo.customerName) {
            const nameParts = billingInfo.customerName.split(" ");
            if (nameParts.length >= 2) {
              updateData.ovog = nameParts[0];
              updateData.ner = nameParts.slice(1).join(" ");
            } else {
              updateData.ner = billingInfo.customerName;
            }
          }
          if (billingInfo.customerAddress) {
            updateData.bairniiNer = billingInfo.customerAddress;
          }
          if (billingInfo.customerId) {
            updateData.walletCustomerId = billingInfo.customerId;
          }
          if (billingInfo.customerCode) {
            updateData.walletCustomerCode = billingInfo.customerCode;
          }

          if (Object.keys(updateData).length > 0) {
            Object.assign(orshinSuugch, updateData);
            await orshinSuugch.save();
          }
        }
      } catch (billingError) {
        // Log error but don't fail registration
      }
    }

    const token = await orshinSuugch.tokenUusgeye();

    const butsaakhObject = {
      result: orshinSuugch,
      success: true,
      token: token,
      walletUserInfo: walletUserInfo,
      message: "Хэтэвчний системд амжилттай бүртгүүлж, нэвтэрлээ",
    };

    if (billingInfo) {
      butsaakhObject.billingInfo = billingInfo;
    }
    res.status(200).json(butsaakhObject);
  } catch (err) {
    next(err);
  }
});

exports.walletBillingHavakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { findOrCreateBarilgaFromWallet, CENTRALIZED_ORG_ID } = require("./negdsenSan");

    if (!req.body.bairId || !req.body.doorNo) {
      throw new aldaa("Байрын ID болон тоот заавал бөглөх шаардлагатай!");
    }

    if (!req.headers.authorization) {
      throw new aldaa("Нэвтрэх шаардлагатай!");
    }

    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      throw new aldaa("Token олдсонгүй!");
    }

    const jwt = require("jsonwebtoken");
    let tokenObject;
    try {
      tokenObject = jwt.verify(token, process.env.APP_SECRET);
    } catch (jwtError) {
      throw new aldaa("Token хүчингүй байна!");
    }

    if (!tokenObject?.id || tokenObject.id === "zochin") {
      throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );
    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    const phoneNumber = orshinSuugch.utas;
    const { bairId, doorNo } = req.body;
    const requestedCustomerId = req.body.customerId || req.body.walletCustomerId || null;
    const requestedCustomerCode = req.body.customerCode || req.body.walletCustomerCode || null;

    let billingInfo = null;
    
    // 1. Get Billing by Address
    const billingResponse = await walletApiService.getBillingByAddress(
      phoneNumber,
      bairId,
      doorNo,
    );

    if (!billingResponse || billingResponse.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Энэ хаягийн биллингийн мэдээлэл олдсонгүй.",
      });
    }

    // 2. Select the right customer
    if (requestedCustomerId || requestedCustomerCode) {
      billingInfo = billingResponse.find((b) =>
        (requestedCustomerId && b.customerId === requestedCustomerId) ||
        (requestedCustomerCode && b.customerCode === requestedCustomerCode)
      ) || billingResponse[0];
    } else {
      billingInfo = billingResponse[0];
    }

    // 3. Enrich with billingId and billerCode if missing
    if (!billingInfo.billingId && billingInfo.customerId) {
      try {
        const byCustomer = await walletApiService.getBillingByCustomer(phoneNumber, billingInfo.customerId);
        if (byCustomer) {
          billingInfo.billingId = byCustomer.billingId || billingInfo.billingId;
          billingInfo.billerCode = byCustomer.billerCode || billingInfo.billerCode;
          billingInfo.billingName = byCustomer.billingName || billingInfo.billingName;
        }
      } catch (err) {}
    }

    // 4. Save/Connect Billing
    let billingConnected = false;
    let saveResult = null;
    try {
      const billingData = {
        customerId: billingInfo.customerId,
        billerCode: billingInfo.billerCode || "ELECTRIC", // Fallback to avoid crash
      };
      saveResult = await walletApiService.saveBilling(phoneNumber, billingData);
      billingConnected = true;
      
      if (saveResult) {
        billingInfo.billingId = saveResult.billingId || billingInfo.billingId;
        billingInfo.billerCode = saveResult.billerCode || billingInfo.billerCode;
        billingInfo.billingName = saveResult.billingName || billingInfo.billingName;
        billingInfo.customerName = saveResult.customerName || billingInfo.customerName;
        billingInfo.customerAddress = saveResult.customerAddress || billingInfo.customerAddress;
      }
    } catch (saveErr) {
      console.error("⚠️ [HAVAKH] saveBilling failed:", saveErr.message);
    }

    // 5. Update local OrshinSuugch and Centralized Org Sync
    const updateData = {};
    if (billingInfo.customerName) {
      const nameParts = billingInfo.customerName.split(" ");
      if (nameParts.length >= 2) {
        updateData.ovog = nameParts[0];
        updateData.ner = nameParts.slice(1).join(" ");
      } else {
        updateData.ner = billingInfo.customerName;
      }
    }
    if (billingInfo.customerAddress) updateData.bairniiNer = billingInfo.customerAddress;
    updateData.toot = doorNo;
    updateData.walletBairId = bairId;
    updateData.walletDoorNo = doorNo;
    if (billingInfo.customerId) updateData.walletCustomerId = billingInfo.customerId;
    if (billingInfo.customerCode) updateData.walletCustomerCode = billingInfo.customerCode;

    // Resolve building in centralized org
    try {
      let walletBairName = (billingInfo.customerAddress || "").trim();
      walletBairName = walletBairName.replace(/,\s*\d+\s*$/, "").replace(/\s+\d+\s*$/, "").trim();
      
      if (walletBairName && bairId) {
        const barilgaResult = await findOrCreateBarilgaFromWallet(bairId, walletBairName);
        updateData.baiguullagiinId = CENTRALIZED_ORG_ID;
        updateData.barilgiinId = barilgaResult.barilgiinId;
      }
    } catch (bErr) {}

    // Sync toots array
    if (!orshinSuugch.toots) orshinSuugch.toots = [];
    const newTootEntry = {
      toot: doorNo,
      source: "WALLET_API",
      bairniiNer: billingInfo.customerAddress || orshinSuugch.bairniiNer,
      ovog: updateData.ovog || orshinSuugch.ovog,
      ner: updateData.ner || orshinSuugch.ner,
      walletBairId: bairId,
      walletDoorNo: doorNo,
      walletUserId: phoneNumber,
      walletCustomerId: billingInfo.customerId,
      walletCustomerCode: billingInfo.customerCode,
      billingId: billingInfo.billingId,
      billerCode: billingInfo.billerCode,
      baiguullagiinId: updateData.baiguullagiinId,
      barilgiinId: updateData.barilgiinId,
      createdAt: new Date(),
    };

    const existingIndex = orshinSuugch.toots.findIndex(t => 
       t.source === "WALLET_API" && t.walletBairId === bairId && t.walletDoorNo === doorNo && 
       (!t.walletCustomerId || !billingInfo.customerId || t.walletCustomerId === billingInfo.customerId)
    );

    if (existingIndex >= 0) {
      orshinSuugch.toots[existingIndex] = { ...orshinSuugch.toots[existingIndex].toObject(), ...newTootEntry };
    } else {
      orshinSuugch.toots.push(newTootEntry);
    }

    Object.assign(orshinSuugch, updateData);
    await orshinSuugch.save();

    res.status(200).json({
      success: true,
      message: "Биллингийн мэдээлэл амжилттай холбогдлоо",
      data: billingInfo,
      billingConnected,
    });

  } catch (err) {
    next(err);
  }
});

exports.walletAddressCities = asyncHandler(async (req, res, next) => {
  try {
    const result = await addressService.getCities();

    res.status(200).json({
      success: true,
      data: result.data,
      sources: result.sources,
      message: `Found ${result.sources.total} cities (Wallet API: ${result.sources.walletApi}, Own Org: ${result.sources.ownOrg})`,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletAddressDistricts = asyncHandler(async (req, res, next) => {
  try {
    const { cityId } = req.params;
    if (!cityId) {
      throw new aldaa("Хотын ID заавал бөглөх шаардлагатай!");
    }

    const result = await addressService.getDistricts(cityId);

    res.status(200).json({
      success: true,
      data: result.data,
      sources: result.sources,
      message: `Found ${result.sources.total} districts (Wallet API: ${result.sources.walletApi}, Own Org: ${result.sources.ownOrg})`,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletAddressKhoroo = asyncHandler(async (req, res, next) => {
  try {
    const { districtId } = req.params;
    if (!districtId) {
      throw new aldaa("Дүүргийн ID заавал бөглөх шаардлагатай!");
    }

    const result = await addressService.getKhoroo(districtId);

    res.status(200).json({
      success: true,
      data: result.data,
      sources: result.sources,
      message: `Found ${result.sources.total} khoroos (Wallet API: ${result.sources.walletApi}, Own Org: ${result.sources.ownOrg})`,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletAddressBair = asyncHandler(async (req, res, next) => {
  try {
    const { khorooId } = req.params;
    if (!khorooId) {
      throw new aldaa("Хорооны ID заавал бөглөх шаардлагатай!");
    }

    const result = await addressService.getBair(khorooId);

    res.status(200).json({
      success: true,
      data: result.data,
      sources: result.sources,
      message: `Found ${result.sources.total} bair (Wallet API: ${result.sources.walletApi}, Own Org: ${result.sources.ownOrg})`,
    });
  } catch (err) {
    next(err);
  }
});

exports.dugaarBatalgaajuulya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var msgIlgeekhKey = "aa8e588459fdd9b7ac0b809fc29cfae3";
    var msgIlgeekhDugaar = "72002002";

    const { baiguullagiinId, utas, purpose: purposeRaw } = req.body;
    
    // Canonicalize purpose to match enum: ["password_reset", "registration", "login", "signup"]
    // We already added "signup" to the model enum, but we map common variations for robustness.
    let purpose = purposeRaw || "password_reset";
    if (purpose === "register") purpose = "registration";
    if (purpose === "signup") purpose = "registration"; // Most apps use registration
    if (purpose === "forgot_password") purpose = "password_reset";

    console.log(`[OTP] Generating code for ${utas} (${purpose}) at org ${baiguullagiinId}`);

    if (!baiguullagiinId || !utas) {
      return res.status(400).json({
        success: false,
        message: "Байгууллагын ID болон утас заавал бөглөх шаардлагатай!",
      });
    }

    var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );
    if (!baiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Байгууллагын мэдээлэл олдсонгүй!",
      });
    }

    var kholboltuud = db.kholboltuud;
    var kholbolt = kholboltuud.find(
      (a) => a.baiguullagiinId == baiguullaga._id.toString(),
    );

    if (!kholbolt) {
      return res.status(404).json({
        success: false,
        message: "Холболтын мэдээлэл олдсонгүй!",
      });
    }

    const existing = await OrshinSuugch(db.erunkhiiKholbolt).findOne({ utas });
    if (purpose === "registration") {
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Энэ утас аль хэдийн бүртгэгдсэн байна!",
          codeSent: false,
        });
      }
    } else if (purpose === "password_reset") {
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Энэ утасны дугаартай хэрэглэгч олдсонгүй!",
          codeSent: false,
        });
      }
    }

    const BatalgaajuulahCodeModel = BatalgaajuulahCode(kholbolt);
    const batalgaajuulkhCodeDoc =
      await BatalgaajuulahCodeModel.batalgaajuulkhCodeUusgeye(
        utas,
        purpose,
        10,
      );

    var text = `AmarSukh: Tany batalgaajuulax code: ${batalgaajuulkhCodeDoc.code}.`;

    var ilgeexList = [
      {
        to: utas,
        text: text,
        gereeniiId: "password_reset",
      },
    ];

    var khariu = [];

    msgIlgeeye(
      ilgeexList,
      msgIlgeekhKey,
      msgIlgeekhDugaar,
      khariu,
      0,
      kholbolt,
      baiguullagiinId,
    );

    res.json({
      success: true,
      message: "Баталгаажуулах код илгээгдлээ",
      expiresIn: 10,
      baiguullagiinId: baiguullagiinId,
      purpose: purpose,
      codeSent: true,
    });
  } catch (error) {
    next(error);
  }
});

exports.orshinSuugchBatalgaajuulya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { utas } = req.body;

    if (!utas) {
      return res.status(400).json({
        success: false,
        message: "Утасны дугаар заавал бөглөх шаардлагатай!",
      });
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
      .findOne({ utas: utas })
      .catch((err) => {
        next(err);
      });

    if (!orshinSuugch) {
      return res.status(404).json({
        success: false,
        message: "Энэ утасны дугаартай хэрэглэгч олдсонгүй!",
      });
    }

    req.body.baiguullagiinId = orshinSuugch.baiguullagiinId;

    await exports.dugaarBatalgaajuulya(req, res, next);
  } catch (error) {
    next(error);
  }
});

exports.nuutsUgSergeeye = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { utas, code, shineNuutsUg } = req.body;

    if (!utas || !code || !shineNuutsUg) {
      return res.status(400).json({
        success: false,
        message: "Бүх талбарыг бөглөх шаардлагатай!",
      });
    }

    if (shineNuutsUg.length < 4) {
      return res.status(400).json({
        success: false,
        message: "Нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой!",
      });
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
      .findOne({ utas: utas })
      .catch((err) => {
        next(err);
      });

    if (!orshinSuugch) {
      return res.status(404).json({
        success: false,
        message: "Энэ утасны дугаартай хэрэглэгч олдсонгүй!",
      });
    }

    const verificationResult = await verifyCodeHelper(
      orshinSuugch.baiguullagiinId,
      utas,
      code,
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
      });
    }

    const oldPasswordHash = orshinSuugch.nuutsUg || null;
    let passwordChanged = false;

    try {
      orshinSuugch.nuutsUg = shineNuutsUg;
      await orshinSuugch.save();
    } catch (saveError) {
      return res.status(400).json({
        success: false,
        message: "Нууц үг хадгалахад алдаа гарлаа!",
      });
    }

    try {
      const updatedUser = await OrshinSuugch(db.erunkhiiKholbolt)
        .findById(orshinSuugch._id)
        .select("+nuutsUg");

      passwordChanged = oldPasswordHash
        ? oldPasswordHash !== updatedUser.nuutsUg
        : true;
    } catch (fetchError) {
      return res.status(400).json({
        success: false,
        message: "Хэрэглэгчийн мэдээлэл авахад алдаа гарлаа!",
      });
    }

    res.json({
      success: true,
      message: "Нууц үг амжилттай сэргээгдлээ",
      data: {
        step: 3,
        passwordChanged: passwordChanged,
        userId: orshinSuugch._id.toString(),
        userName: orshinSuugch.ner,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Нууц үг солиход алдаа гарлаа",
      error: error.message,
    });
  }
});

exports.tokenoorOrshinSuugchAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    if (!req.headers.authorization) {
      return next(new Error("Энэ үйлдлийг хийх эрх байхгүй байна!"));
    }
    const token = req.headers.authorization.split(" ")[1];

    if (!token) {
      return next(new Error("Token олдсонгүй!"));
    }

    let tokenObject;
    try {
      tokenObject = jwt.verify(token, process.env.APP_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "JsonWebTokenError") {
        return next(new Error("Token буруу байна!"));
      } else if (jwtError.name === "TokenExpiredError") {
        return next(new Error("Token хугацаа дууссан байна!"));
      } else {
        return next(new Error("Token шалгах үед алдаа гарлаа!"));
      }
    }

    if (tokenObject.id == "zochin")
      return next(new Error("Энэ үйлдлийг хийх эрх байхгүй байна!"));

    try {
      if (!db.erunkhiiKholbolt) {
        console.error("❌ [Profile] Database connection (erunkhiiKholbolt) is missing!");
        return res.status(500).json({
          success: false,
          message: "Өгөгдлийн баазтай холбогдоогүй байна. Түр хүлээнэ үү.",
        });
      }

      const urDun = await OrshinSuugch(db.erunkhiiKholbolt).findById(
        tokenObject.id,
      );

      if (!urDun) {
        console.error(`❌ [Profile] User not found for ID: ${tokenObject.id}`);
        return res.status(404).json({
          success: false,
          message: "Хэрэглэгч олдсонгүй",
        });
      }

      const urdunJson = urDun.toJSON();
      urdunJson.duusakhOgnoo = tokenObject.duusakhOgnoo;
      urdunJson.salbaruud = tokenObject.salbaruud;
      res.send(urdunJson);
    } catch (dbErr) {
      console.error("❌ [Profile] Database error:", dbErr.message);
      return next(dbErr);
    }
  } catch (error) {
    console.error("❌ [Profile] Unexpected error:", error.message);
    next(error);
  }
});

function msgIlgeeye(
  jagsaalt,
  key,
  dugaar,
  khariu,
  index,
  tukhainBaaziinKholbolt,
  baiguullagiinId,
) {
  try {
    const msgServer = process.env.MSG_SERVER || "https://api.messagepro.mn";
    let url =
      msgServer +
      "/send" +
      "?key=" +
      key +
      "&from=" +
      dugaar +
      "&to=" +
      jagsaalt[index].to.toString() +
      "&text=" +
      jagsaalt[index].text.toString();

    url = encodeURI(url);
    request(url, { json: true }, (err1, res1, body) => {
      if (err1) {
      } else {
        var msg = new MsgTuukh(tukhainBaaziinKholbolt)();
        msg.baiguullagiinId = baiguullagiinId;
        msg.dugaar = jagsaalt[index].to;
        msg.gereeniiId = jagsaalt[index].gereeniiId || "";
        msg.msg = jagsaalt[index].text;
        msg.msgIlgeekhKey = key;
        msg.msgIlgeekhDugaar = dugaar;
        msg.save();
        if (jagsaalt.length > index + 1) {
          khariu.push(body[0]);
          msgIlgeeye(
            jagsaalt,
            key,
            dugaar,
            khariu,
            index + 1,
            tukhainBaaziinKholbolt,
            baiguullagiinId,
          );
        } else {
          khariu.push(body[0]);
        }
      }
    });
  } catch (err) {}
}

exports.utasBatalgaajuulakhLogin = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, utas, code } = req.body;

    const ENABLE_LOGIN_SMS = false; 

    if (!ENABLE_LOGIN_SMS) {
      const { db } = require("zevbackv2");
      const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
        utas,
      });

      if (!orshinSuugch) {
        return res.status(404).json({
          success: false,
          message: "Хэрэглэгч олдсонгүй!",
        });
      }

      return res.json({
        success: true,
        message: "Баталгаажуулалт амжилттай (SMS идэвхгүй)",
      });
    }

    if (!baiguullagiinId) {
      const { db } = require("zevbackv2");
      const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
        utas,
      });

      if (!orshinSuugch) {
        return res.status(404).json({
          success: false,
          message: "Хэрэглэгч олдсонгүй!",
        });
      }

      return res.json({
        success: true,
        message: "Баталгаажуулалт алгассан (байгууллагын ID байхгүй)",
      });
    }

    if (!utas || !code) {
      return res.status(400).json({
        success: false,
        message: "Утас, код заавал бөглөх шаардлагатай!",
      });
    }

    const { db } = require("zevbackv2");
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );
    if (!baiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Байгууллагын мэдээлэл олдсонгүй!",
      });
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullaga._id.toString(),
    );
    if (!tukhainBaaziinKholbolt) {
      return res.status(404).json({
        success: false,
        message: "Холболт олдсонгүй!",
      });
    }

    // Verify code
    const verificationResult = await validateCodeOnly(
      baiguullagiinId,
      utas,
      code,
      "login", 
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
      });
    }

    // Verify code - frontend handles local storage
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
      utas,
    });
    if (!orshinSuugch) {
      return res.status(404).json({
        success: false,
        message: "Хэрэглэгч олдсонгүй!",
      });
    }

    res.json({
      success: true,
      message: "Код амжилттай баталгаажлаа",
    });
  } catch (error) {
    next(error);
  }
});

exports.dugaarBatalgaajuulakh = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, utas, code } = req.body;
    const purposeRaw = req.body.purpose || "password_reset";
    
    // Canonicalize purpose for verification lookup
    let purpose = purposeRaw;
    if (purpose === "register" || purpose === "signup") purpose = "registration";
    if (purpose === "forgot_password") purpose = "password_reset";

    if (!baiguullagiinId || !utas || !code) {
      return res.status(400).json({
        success: false,
        message: "Бүх талбарыг бөглөх шаардлагатай!",
      });
    }

    const verificationResult = await validateCodeOnly(
      baiguullagiinId,
      utas,
      code,
      purpose,
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
      });
    }

    res.json({
      success: true,
      message: "Дугаар амжилттай баталгаажлаа!",
      data: {
        verified: true,
        phone: utas,
        code: code,
        purpose,
      },
    });
  } catch (error) {
    next(error);
  }
});

exports.nuutsUgShalgakhOrshinSuugch = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(req.body.id)
      .select("+nuutsUg");
    const ok = await orshinSuugch.passwordShalgaya(req.body.nuutsUg);
    if (ok) res.send({ success: true });
    else
      res.send({
        success: false,
        message: "Хэрэглэгчийн одоо ашиглаж буй нууц үг буруу байна!",
      });
  } catch (error) {
    next(error);
  }
});

exports.orshinSuugchiinNuutsUgSoliyo = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { odoogiinNuutsUg, shineNuutsUg, davtahNuutsUg } = req.body || {};

    if (!odoogiinNuutsUg || !shineNuutsUg || !davtahNuutsUg) {
      return res
        .status(400)
        .json({ success: false, message: "Бүх талбарыг бөглөх шаардлагатай!" });
    }
    if (String(shineNuutsUg) !== String(davtahNuutsUg)) {
      return res
        .status(400)
        .json({ success: false, message: "Шинэ нууц үг таарахгүй байна!" });
    }
    if (String(shineNuutsUg).length < 4) {
      return res.status(400).json({
        success: false,
        message: "Нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой!",
      });
    }

    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Token олдсонгүй!" });
    }

    let tokenObject;
    try {
      tokenObject = jwt.verify(token, process.env.APP_SECRET);
    } catch (jwtError) {
      return res
        .status(401)
        .json({ success: false, message: "Token хүчингүй байна!" });
    }
    if (!tokenObject?.id || tokenObject.id === "zochin") {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(tokenObject.id)
      .select("+nuutsUg");
    if (!orshinSuugch) {
      return res
        .status(404)
        .json({ success: false, message: "Хэрэглэгч олдсонгүй!" });
    }

    const ok = await orshinSuugch.passwordShalgaya(odoogiinNuutsUg);
    if (!ok) {
      return res
        .status(400)
        .json({ success: false, message: "Одоогийн нууц үг буруу байна!" });
    }

    orshinSuugch.nuutsUg = shineNuutsUg;
    await orshinSuugch.save();

    return res.json({ success: true, message: "Нууц үг амжилттай солигдлоо" });
  } catch (error) {
    next(error);
  }
});

exports.khayagaarBaiguullagaAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { duureg, horoo, soh } = req.params;

    if (!duureg || !horoo || !soh) {
      throw new aldaa("Дүүрэг, Хороо, СӨХ заавал бөглөх шаардлагатай!");
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findOne({
      $and: [
        { "tokhirgoo.duuregNer": duureg },
        { "tokhirgoo.districtCode": horoo },
        { "tokhirgoo.sohNer": soh },
      ],
    });

    if (!baiguullaga) {
      throw new aldaa(
        "Тухайн дүүрэг, хороо, СӨХ-д тохирох байгууллагын мэдээлэл олдсонгүй!",
      );
    }

    res.status(200).json({
      success: true,
      message: "Байгууллагын мэдээлэл олдлоо",
      result: baiguullaga,
    });
  } catch (error) {
    next(error);
  }
});

exports.cleanupExpiredCodes = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const BatalgaajuulahCodeModel = BatalgaajuulahCode(db.erunkhiiKholbolt);
    const deletedCount = await BatalgaajuulahCodeModel.cleanupExpired();

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired verification codes`,
      deletedCount,
    });
  } catch (error) {
    next(error);
  }
});

exports.getVerificationCodeStatus = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { phone } = req.params;

    const BatalgaajuulahCodeModel = BatalgaajuulahCode(db.erunkhiiKholbolt);
    const codes = await BatalgaajuulahCodeModel.find({ utas: phone })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      message: "Verification codes retrieved",
      codes: codes.map((code) => ({
        code: code.code,
        purpose: code.purpose,
        used: code.khereglesenEsekh,
        attempts: code.oroldlogo,
        expiresAt: code.expiresAt,
        createdAt: code.createdAt,
        isExpired: code.expiresAt < new Date(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Self-delete orshinSuugch and all related data
 * Requires password verification in request body
 * Deletes all traces of the user from:
 * - geree (invoices/contracts where orshinSuugchId matches)
 * - nekhemjlekhiinTuukh (invoice history related to deleted gerees)
 * - nevtreltiinTuukh (login history)
 * - Finally deletes the orshinSuugch user itself
 */
exports.orshinSuugchOorooUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    // Verify password is provided
    const nuutsUg = req.body.nuutsUg;
    if (!nuutsUg) {
      throw new aldaa("Нууц код заавал оруулах шаардлагатай!");
    }

    // Get user ID from token (from tokenShalgakh middleware or manually verify)
    let userId;
    if (req.body.nevtersenOrshinSuugchiinToken?.id) {
      userId = req.body.nevtersenOrshinSuugchiinToken.id;
    } else if (req.headers.authorization) {
      // Fallback: manually verify token from header
      const token = req.headers.authorization.split(" ")[1];
      if (token) {
        try {
          const tokenObject = jwt.verify(token, process.env.APP_SECRET);
          userId = tokenObject.id;
        } catch (err) {
          throw new aldaa("Token хүчингүй байна!");
        }
      }
    }

    if (!userId) {
      throw new aldaa("Хэрэглэгчийн мэдээлэл олдсонгүй!");
    }

    const userIdString = String(userId);

    // Verify user exists and get user with password
    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    const orshinSuugch =
      await OrshinSuugchModel.findById(userId).select("+nuutsUg");

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Verify password
    const passwordMatch = await orshinSuugch.passwordShalgaya(nuutsUg);
    if (!passwordMatch) {
      throw new aldaa("Нууц код буруу байна!");
    }

    // Mark all gerees as "Цуцалсан" (Cancelled) instead of deleting
    const orgIdsForDel = new Set();
    if (orshinSuugch.baiguullagiinId) orgIdsForDel.add(orshinSuugch.baiguullagiinId.toString());
    if (Array.isArray(orshinSuugch.toots)) {
      orshinSuugch.toots.forEach(t => { if (t.baiguullagiinId) orgIdsForDel.add(t.baiguullagiinId.toString()); });
    }

    for (const orgId of orgIdsForDel) {
      const conn = db.kholboltuud.find(k => String(k.baiguullagiinId) === String(orgId));
      if (conn) {
        await Geree(conn).updateMany(
          { orshinSuugchId: userIdString },
          { $set: { tuluv: "Цуцалсан" } }
        );
      }
    }

    let gereesToCancel = [];

    // Don't delete nekhemjlekhiinTuukh - keep all invoice history
    // Don't delete nevtreltiinTuukh - keep login history
    // Don't delete ebarimt - keep all receipts

    // Log deletion to audit before actually deleting
    try {
      const { logDelete } = require("../services/auditService");
      const deletedDoc = orshinSuugch.toObject
        ? orshinSuugch.toObject()
        : orshinSuugch;
      await logDelete(
        req,
        db,
        "orshinSuugch",
        userId.toString(),
        deletedDoc,
        "hard",
        "Self-delete by user",
        {
          baiguullagiinId: orshinSuugch.baiguullagiinId,
          barilgiinId: null,
        },
      );
    } catch (auditErr) {
      // Don't block deletion if audit logging fails
    }

    // Actually delete the orshinSuugch user account
    // The gerees are marked as "Цуцалсан" and can be restored when they register again with the same utas
    await OrshinSuugchModel.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Хэрэглэгчийн данс устгагдлаа. Бүх мэдээлэл хадгалагдсан байна.",
      data: {
        userId: userId,
        status: "Cancelled"
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /orshinSuugch/:id - Admin delete orshinSuugch
 * Same behavior as oorooUstgakh but without password verification (admin action)
 * Marks all gerees as "Цуцалсан" and deletes the user account
 */
exports.orshinSuugchUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const Geree = require("../models/geree");

    const userId = req.params.id;
    if (!userId) {
      throw new aldaa("Хэрэглэгчийн ID заавал оруулах шаардлагатай!");
    }

    const userIdString = String(userId);

    // Verify user exists
    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    const orshinSuugch = await OrshinSuugchModel.findById(userId);

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Mark all gerees as "Цуцалсан" (Cancelled) instead of deleting
    const orgIdsForDel = new Set();
    if (orshinSuugch.baiguullagiinId) orgIdsForDel.add(orshinSuugch.baiguullagiinId.toString());
    if (Array.isArray(orshinSuugch.toots)) {
      orshinSuugch.toots.forEach(t => { if (t.baiguullagiinId) orgIdsForDel.add(t.baiguullagiinId.toString()); });
    }

    for (const orgId of orgIdsForDel) {
      const conn = db.kholboltuud.find(k => String(k.baiguullagiinId) === String(orgId));
      if (conn) {
        await Geree(conn).updateMany(
          { orshinSuugchId: userIdString },
          { $set: { tuluv: "Цуцалсан" } }
        );
      }
    }

    let gereesToCancel = [];

    // Don't delete nekhemjlekhiinTuukh - keep all invoice history
    // Don't delete nevtreltiinTuukh - keep login history
    // Don't delete ebarimt - keep all receipts

    // Log deletion to audit before actually deleting
    try {
      const { logDelete } = require("../services/auditService");
      const deletedDoc = orshinSuugch.toObject
        ? orshinSuugch.toObject()
        : orshinSuugch;
      await logDelete(
        req,
        db,
        "orshinSuugch",
        userId.toString(),
        deletedDoc,
        "hard",
        "Admin delete",
        {
          baiguullagiinId: orshinSuugch.baiguullagiinId,
          barilgiinId: null,
        },
      );
    } catch (auditErr) {
      // Don't block deletion if audit logging fails
    }

    // Actually delete the orshinSuugch user account
    // The gerees are marked as "Цуцалсан" and can be restored when they register again with the same utas
    await OrshinSuugchModel.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "Хэрэглэгчийн данс устгагдлаа. Бүх мэдээлэл хадгалагдсан байна.",
      data: {
        userId: userId,
        status: "Cancelled"
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /walletAddress/details/:bairId/:doorNo
 * Search for customer details in a specific building/door (Wallet API)
 */
exports.walletAddressDetails = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { bairId, doorNo } = req.params;
    const { utas } = req.query; // fallback for unauthenticated calls during registration

    // Get phone number: 1) from query param, 2) from authenticated user token
    let phoneNumber = utas;

    if (!phoneNumber && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
          const tokenObject = jwt.verify(token, process.env.APP_SECRET);
          if (tokenObject && tokenObject.id && tokenObject.id !== "zochin") {
            const orshinSuugch = await OrshinSuugch(
              db.erunkhiiKholbolt,
            ).findById(tokenObject.id);
            if (orshinSuugch && orshinSuugch.utas) {
              phoneNumber = orshinSuugch.utas;
            }
          }
        }
      } catch (tokenErr) {
        console.log(
          "⚠️ [WALLET ADDRESS DETAILS] Could not get phone from token:",
          tokenErr.message,
        );
      }
    }

    if (!phoneNumber) {
      throw new aldaa(
        "Утасны дугаар заавал шаардлагатай! ?utas= параметр эсвэл token дамжуулна уу.",
      );
    }

    if (!bairId || !doorNo) {
      throw new aldaa("Барилга болон тоот заавал оруулах шаардлагатай!");
    }

    console.log("🔍 [WALLET ADDRESS DETAILS] Request:", {
      phoneNumber,
      bairId,
      doorNo,
    });

    // AUTO-REGISTER check: If this user is in our DB but not in Wallet API, register them now
    // Address search (getBillingByAddress) fails at Wallet API if the user doesn't exist there
    try {
      const walletUserInfo = await walletApiService.getUserInfo(phoneNumber);
      if (!walletUserInfo || !walletUserInfo.userId) {

        
        // Find existing record in our DB to get their email
        const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findOne({ utas: phoneNumber });
        const emailToUse = orshinSuugch?.mail || "";
        
        try {
          await walletApiService.registerUser(phoneNumber, emailToUse);
          console.log(`✅ [WALLET ADDRESS DETAILS] Auto-registered ${phoneNumber} with email: ${emailToUse}`);
        } catch (regErr) {
          console.error(`⚠️ [WALLET ADDRESS DETAILS] Auto-registration failed for ${phoneNumber}:`, regErr.message);
        }
      }
    } catch (userInfoErr) {
      // Just log and continue - registration might have been the problem anyway
    }

    const data = await walletApiService.getBillingByAddress(
      phoneNumber,
      bairId,
      doorNo,
    );

    console.log(
      "✅ [WALLET ADDRESS DETAILS] Response data count:",
      Array.isArray(data) ? data.length : "not array",
    );

    res.status(200).json({
      responseCode: true,
      responseMsg: "Амжилттай",
      data: data,
    });
  } catch (err) {
    console.error("❌ [WALLET ADDRESS DETAILS] Error:", err.message);
    next(err);
  }
});

/**
 * Get door numbers for a specific building
 * GET /api/walletAddress/toots/:bairId
 */
exports.getBuildingToots = asyncHandler(async (req, res, next) => {
  const { bairId } = req.params;
  const { orts } = req.query; // Optional: filter by entrance
  const { db } = require("zevbackv2");

  try {
    let toots = [];

    if (bairId.startsWith("own_")) {
      // Fetch from own database
      const realBuildingId = bairId.replace("own_", "");
      const kholboltuud = db.kholboltuud || [];

      for (const kholbolt of kholboltuud) {
        const baiguullaga = await Baiguullaga(kholbolt)
          .findOne({
            "barilguud._id": realBuildingId,
          })
          .select("barilguud")
          .lean();

        if (baiguullaga && baiguullaga.barilguud) {
          const barilga = baiguullaga.barilguud.find(
            (b) => b._id.toString() === realBuildingId,
          );
          if (
            barilga &&
            barilga.tokhirgoo &&
            barilga.tokhirgoo.davkhariinToonuud
          ) {
            const davkhars = barilga.tokhirgoo.davkhariinToonuud;
            const uniqueToots = new Set();

            for (const [key, floorArray] of Object.entries(davkhars)) {
              // If orts is provided, only include toots from that entrance
              // Key format: 'orts::davkhar'
              if (orts && !key.startsWith(`${orts}::`)) {
                continue;
              }

              if (Array.isArray(floorArray)) {
                floorArray.forEach((t) => {
                  if (typeof t === "string" && t.includes(",")) {
                    t.split(",").forEach((subT) =>
                      uniqueToots.add(subT.trim()),
                    );
                  } else {
                    uniqueToots.add(String(t).trim());
                  }
                });
              }
            }
            toots = Array.from(uniqueToots)
              .filter((t) => t)
              .sort((a, b) => {
                // Try numeric sort
                const numA = parseInt(a.replace(/\D/g, ""));
                const numB = parseInt(b.replace(/\D/g, ""));
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.localeCompare(b);
              });
            break;
          }
        }
      }
    } else {
      // Wallet API buildings
      // Look up residents in our DB who have this bairId to provide a selection list
      const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
      const residents = await OrshinSuugchModel.find({
        $or: [{ bairId: bairId }, { "toots.bairId": bairId }],
      })
        .select("toot toots.toot toots.bairId toots.orts orts")
        .lean();

      const uniqueToots = new Set();
      residents.forEach((r) => {
        // If orts is provided, only include if matches
        if (String(r.bairId) === String(bairId) && r.toot) {
          if (!orts || String(r.orts || "1") === String(orts)) {
            uniqueToots.add(String(r.toot).trim());
          }
        }
        if (Array.isArray(r.toots)) {
          r.toots.forEach((t) => {
            if (String(t.bairId) === String(bairId) && t.toot) {
              if (!orts || String(t.orts || "1") === String(orts)) {
                uniqueToots.add(String(t.toot).trim());
              }
            }
          });
        }
      });

      toots = Array.from(uniqueToots)
        .filter((t) => t)
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ""));
          const numB = parseInt(b.replace(/\D/g, ""));
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });
    }

    res.status(200).json({
      responseCode: true,
      responseMsg: "Амжилттай",
      data: toots,
    });
  } catch (error) {
    console.error("❌ [GET TOOTS] Error:", error.message);
    res.status(200).json({ responseCode: false, data: [] });
  }
});

exports.getBuildingOrts = asyncHandler(async (req, res, next) => {
  const { bairId } = req.params;
  const { db } = require("zevbackv2");
  try {
    let orts = [];
    if (bairId.startsWith("own_")) {
      const realBuildingId = bairId.replace("own_", "");
      const kholboltuud = db.kholboltuud || [];
      for (const kholbolt of kholboltuud) {
        const baiguullaga = await Baiguullaga(kholbolt)
          .findOne({
            "barilguud._id": realBuildingId,
          })
          .select("barilguud")
          .lean();
        if (baiguullaga && baiguullaga.barilguud) {
          const barilga = baiguullaga.barilguud.find(
            (b) => b._id.toString() === realBuildingId,
          );
          if (
            barilga &&
            barilga.tokhirgoo &&
            barilga.tokhirgoo.davkhariinToonuud
          ) {
            const ortsSet = new Set();
            for (const key of Object.keys(barilga.tokhirgoo.davkhariinToonuud)) {
              if (key.includes("::")) {
                ortsSet.add(key.split("::")[0]);
              }
            }
            orts = Array.from(ortsSet).sort((a, b) => {
              const numA = parseInt(a);
              const numB = parseInt(b);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.localeCompare(b);
            });
            break;
          }
        }
      }
    }
    res.json({ success: true, data: orts });
  } catch (error) {
    console.error("❌ [GET ORTS] Error:", error.message);
    res.status(200).json({ success: false, data: [] });
  }
});

exports.getProfileByPhoneOrCustomer = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { phone, customerNo } = req.query; // Changed from body to query for GET request
    const query = {};
    if (phone) query.utas = phone;
    if (customerNo) query.customerNo = customerNo;

    if (Object.keys(query).length === 0) {
      return res.status(400).json({ success: false, message: "Утас эсвэл харилцагчийн дугаар шаардлагатай" });
    }

    const user = await OrshinSuugch(db.erunkhiiKholbolt).findOne(query).lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Хэрэглэгч олдсонгүй" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error("❌ [GET PROFILE] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});
