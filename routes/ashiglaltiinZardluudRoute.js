const express = require("express");
const router = express.Router();
const { tokenShalgakh, crud, UstsanBarimt } = require("zevbackv2");
const mongoose = require("mongoose");
const ashiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");
const Geree = require("../models/geree");
const ZaaltUnshlalt = require("../models/zaaltUnshlalt");

// CRUD routes
crud(router, "ashiglaltiinZardluud", ashiglaltiinZardluud, UstsanBarimt);

// GET route with turul filter
router.get("/ashiglaltiinZardluudAvya", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId, turul } = req.query;

    if (!baiguullagiinId) {
      return res.status(400).send({
        success: false,
        message: "baiguullagiinId is required",
      });
    }

    // Get database connection for this organization
    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).send({
        success: false,
        message: "Organization connection not found",
      });
    }

    // Build query filter
    const filter = { baiguullagiinId: baiguullagiinId };

    if (barilgiinId) {
      filter.barilgiinId = barilgiinId;
    }

    // Filter by turul if provided (Дурын or Тогтмол)
    if (turul) {
      filter.turul = turul;
    }

    const zardluud = await ashiglaltiinZardluud(tukhainBaaziinKholbolt).find(
      filter
    );

    res.send({
      success: true,
      data: zardluud,
    });
  } catch (err) {
    next(err);
  }
});

// POST route to create new ashiglaltiinZardluud
router.post("/ashiglaltiinZardluudNemekh", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, ner, turul } = req.body;

    if (!baiguullagiinId) {
      return res.status(400).send({
        success: false,
        message: "baiguullagiinId is required",
      });
    }

    if (!ner || !turul) {
      return res.status(400).send({
        success: false,
        message: "ner and turul are required",
      });
    }

    // Get database connection for this organization
    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).send({
        success: false,
        message: "Organization connection not found",
      });
    }

    // Create new ashiglaltiinZardluud
    const newZardal = new (ashiglaltiinZardluud(tukhainBaaziinKholbolt))(
      req.body
    );

    await newZardal.save();

    res.send({
      success: true,
      message: "Ашиглалтын зардал амжилттай нэмэгдлээ",
      data: newZardal,
    });
  } catch (err) {
    next(err);
  }
});

// GET route to fetch a list of meter readings (each month's data)
router.get("/zaaltJagsaaltAvya", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const params = { ...req.query, ...req.body };
    const { 
      baiguullagiinId, 
      barilgiinId, 
      ekhlekhOgnoo, 
      duusakhOgnoo, 
      gereeniiDugaar,
      toot
    } = params;

    if (!baiguullagiinId) {
      return res.status(400).send({ success: false, message: "baiguullagiinId is required" });
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).send({ success: false, message: "Organization connection not found" });
    }

    // Build filter
    const filter = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) filter.barilgiinId = String(barilgiinId);
    if (gereeniiDugaar) filter.gereeniiDugaar = { $regex: gereeniiDugaar, $options: "i" };
    if (toot) filter.toot = { $regex: toot, $options: "i" };

    // Date filtering (for selecting specific months)
    if (ekhlekhOgnoo || duusakhOgnoo) {
      filter.unshlaltiinOgnoo = {};
      if (ekhlekhOgnoo) filter.unshlaltiinOgnoo.$gte = new Date(ekhlekhOgnoo);
      if (duusakhOgnoo) filter.unshlaltiinOgnoo.$lte = new Date(duusakhOgnoo);
    }

    const jagsaalt = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
      .find(filter)
      .sort({ unshlaltiinOgnoo: -1, createdAt: -1 })
      .limit(2000)
      .lean();

    // Secondary lookup: Fetch previous month's readings for these contracts to allow comparison
    const gereeIds = jagsaalt.map(item => item.gereeniiId);
    let prevMonthReadings = [];
    if (ekhlekhOgnoo && gereeIds.length > 0) {
      const prevEkhlekh = new Date(new Date(ekhlekhOgnoo).setMonth(new Date(ekhlekhOgnoo).getMonth() - 1));
      const prevDuusakh = new Date(new Date(ekhlekhOgnoo).getTime() - 1); // Up to the millisecond before this month
      
      prevMonthReadings = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
        .find({
          gereeniiId: { $in: gereeIds },
          unshlaltiinOgnoo: { $gte: prevEkhlekh, $lte: prevDuusakh }
        })
        .lean();
    }

    const prevMap = {};
    prevMonthReadings.forEach(r => {
      prevMap[r.gereeniiId] = r;
    });

    res.send({
      success: true,
      count: jagsaalt.length,
      data: jagsaalt.map(item => {
        const prev = prevMap[item.gereeniiId];
        return {
          _id: item._id,
          gereeniiId: item.gereeniiId,
          gereeniiDugaar: item.gereeniiDugaar || "",
          toot: item.toot || "",
          suuliinZaalt: item.suuliinZaalt,
          umnukhZaalt: item.umnukhZaalt,
          odorZaalt: item.zaaltTog,
          shonoZaalt: item.zaaltUs,
          zoruu: item.zoruu,
          tariff: item.tariff,
          suuriKhuraamj: item.defaultDun || item.suuriKhuraamj,
          zaaltDun: item.zaaltDun,
          ognoo: item.unshlaltiinOgnoo,
          importOgnoo: item.importOgnoo || item.createdAt,
          // Comparison with previous month
          prevMonth: prev ? {
            suuliinZaalt: prev.suuliinZaalt,
            zoruu: prev.zoruu,
            zaaltDun: prev.zaaltDun,
            ognoo: prev.unshlaltiinOgnoo
          } : null,
          source: "ZaaltUnshlalt"
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

// GET route to fetch latest meter readings for a resident/contract
router.get("/latestZaaltAvya", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, residentId, gereeniiId, gereeniiDugaar } = req.query;

    if (!baiguullagiinId) {
      return res.status(400).send({ success: false, message: "baiguullagiinId is required" });
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).send({ success: false, message: "Organization not found" });
    }

    let filter = {};
    if (gereeniiId) filter.gereeniiId = gereeniiId;
    else if (residentId) filter.residentId = residentId;
    else if (gereeniiDugaar) filter.gereeniiDugaar = gereeniiDugaar;
    else return res.status(400).send({ success: false, message: "Insufficient search criteria" });

    // Fetch the absolute most recent reading from ZaaltUnshlalt (where Excel imports go)
    const latest = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
      .findOne(filter)
      .sort({ unshlaltiinOgnoo: -1, createdAt: -1 });

    res.send({
      success: true,
      data: latest ? {
        suuliinZaalt: latest.suuliinZaalt,
        umnukhZaalt: latest.umnukhZaalt,
        odorZaalt: latest.zaaltTog,
        shonoZaalt: latest.zaaltUs,
        zoruu: latest.zoruu,
        suuriKhuraamj: latest.defaultDun || latest.suuriKhuraamj,
        ognoo: latest.unshlaltiinOgnoo,
        source: "ZaaltUnshlalt"
      } : null
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /tsakhilgaanTootsool – calculate electricity (цахилгаан) amount from meter readings.
 * Formula: usageDun = zoruuDun * guidliinKoeff; niitDun = usageDun [+ suuriKhuraamj if includeSuuriKhuraamj].
 * Body: baiguullagiinId, barilgiinId (optional), umnukhZaalt, suuliinZaalt, guidliinKoeff, includeSuuriKhuraamj (optional boolean).
 */
router.post("/tsakhilgaanTootsool", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const baiguullagiinId = req.body.baiguullagiinId;
    const barilgiinId = req.body.barilgiinId;
    const residentId = req.body.residentId;
    const gereeniiId = req.body.gereeniiId;
    // Support both camelCase and snake_case; accept number or string
    const umnukhZaaltRaw =
      req.body.umnukhZaalt ??
      req.body.umnukh_zaalt ??
      req.body.omnohZaalt;
    const suuliinZaaltRaw =
      req.body.suuliinZaalt ??
      req.body.suuliin_zaalt;
    const guidliinKoeffRaw =
      req.body.guidliinKoeff ??
      req.body.guidliin_koeff;
    const includeSuuriKhuraamj = req.body.includeSuuriKhuraamj === true ||
      req.body.includeSuuriKhuraamj === "true" ||
      req.body.includeSuuriKhuraamj === 1 ||
      req.body.includeSuuriKhuraamj === "1" ||
      req.body.includeSuuriKhuraamj === undefined;

    if (!baiguullagiinId) {
      return res.status(400).send({
        success: false,
        message: "baiguullagiinId is required",
      });
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId
    );
    if (!baiguullaga || !baiguullaga.barilguud || !baiguullaga.barilguud.length) {
      return res.status(404).send({
        success: false,
        message: "Baiguullaga or barilguud not found",
      });
    }

    const targetBarilga = barilgiinId
      ? baiguullaga.barilguud.find(
        (b) => String(b._id) === String(barilgiinId)
      )
      : baiguullaga.barilguud[0];
    if (!targetBarilga || !targetBarilga.tokhirgoo) {
      return res.status(404).send({
        success: false,
        message: "Barilga or tokhirgoo not found",
      });
    }

    const zardluud = targetBarilga.tokhirgoo.ashiglaltiinZardluud || [];
    const isTsakhilgaan = (z) => {
      const name = (z.ner || "").trim().toLowerCase();
      const hasElec = name.includes("цахилгаан");
      const isNotElevator = !name.includes("шат");
      const isNotShared = !name.includes("дундын") && !name.includes("нийтийн") && !name.includes("ерөнхий") && !name.includes("гадна") && !name.includes("гэрэлтүүлэг");
      return hasElec && isNotElevator && isNotShared;
    };

    const candidates = zardluud.filter(isTsakhilgaan);
    
    // Initialize defaults
    let maxTariff = 0;
    let maxSuuriKhuraamj = 2000; // Common default for this system
    let selectedChargeName = "";
    
    // Process global candidates if they exist
    if (candidates.length > 0) {
      let bestScore = -Infinity;
      candidates.forEach(c => {
        const tariffVal = Number(c.tariff) || Number(c.zaaltTariff) || 0;
        const suuriVal = Number(c.suuriKhuraamj) || 0;
        
        // Track the maximum tariff across all candidates as a fallback
        if (tariffVal > maxTariff) maxTariff = tariffVal;

        const name = (c.ner || "").trim().toLowerCase();
        const isMeter = c.zaalt ? 10000000 : 0;
        const isExact = (name === "цахилгаан" || name === "цахилгаан квт" || name === "цахилгаан кв") ? 1000000 : 0;
        const currentScore = isMeter + isExact;

        if (currentScore > bestScore) {
          bestScore = currentScore;
          selectedChargeName = c.ner;
          // IMPORTANT: Take the base fee from the BEST matching candidate
          if (suuriVal > 0) maxSuuriKhuraamj = suuriVal;
        }
      });
    } else {
      selectedChargeName = "Цахилгаан (кВт)";
    }

    let finalTariff = maxTariff;
    let residentSpecificUsed = false;
    let tariffSource = "Global";
    let debugInfo = {
      residentIdPassed: residentId,
      gereeniiIdPassed: gereeniiId,
      maxTariffAggregated: maxTariff
    };

    if (residentId || gereeniiId) {
      const tukhainBaaziinKholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
      );

      if (tukhainBaaziinKholbolt) {
        debugInfo.orgKholboltFound = true;
        let actualResidentId = residentId;
        let contractObj = null;
        let resident = null;

        if (gereeniiId) {
          try {
            contractObj = await Geree(tukhainBaaziinKholbolt).findById(gereeniiId);
            if (contractObj && contractObj.orshinSuugchId) {
              actualResidentId = contractObj.orshinSuugchId;
            }
          } catch (e) {
            debugInfo.contractLookupError = e.message;
          }
        }

        if (actualResidentId) {
          try {
            // Check BOTH central and local org connection just in case
            const centralConn = db.erunkhiiKholbolt;
            
            // Cast to ObjectId if possible
            let residentObjectId = actualResidentId;
            try {
              if (mongoose.Types.ObjectId.isValid(actualResidentId)) {
                residentObjectId = new mongoose.Types.ObjectId(actualResidentId);
              }
            } catch (err) {}

            debugInfo.lookupContext = {
              centralDb: centralConn?.kholbolt?.db?.databaseName,
              localDb: tukhainBaaziinKholbolt?.baiguullagiinId,
              searchingFor: actualResidentId
            };

            // Try AGGRESSIVE lookup (central vs local)
            const modelsToTry = [];
            if (centralConn) modelsToTry.push(OrshinSuugch(centralConn));
            if (tukhainBaaziinKholbolt) modelsToTry.push(OrshinSuugch(tukhainBaaziinKholbolt));

            for (const Model of modelsToTry) {
              // Try ObjectId findById
              resident = await Model.findById(residentObjectId).catch(() => null);
              if (resident) { debugInfo.foundBy = "findById(ObjectId)"; break; }
              
              // Try String findById
              resident = await Model.findById(String(actualResidentId)).catch(() => null);
              if (resident) { debugInfo.foundBy = "findById(String)"; break; }
              
              // Try findOne
              resident = await Model.findOne({ _id: actualResidentId }).catch(() => null);
              if (resident) { debugInfo.foundBy = "findOne({_id})"; break; }

              // Try searching by "id" field (some old records might use it)
              resident = await Model.findOne({ id: String(actualResidentId) }).catch(() => null);
              if (resident) { debugInfo.foundBy = "findOne({id})"; break; }
            }

            if (resident) {
              debugInfo.residentFound = true;
              debugInfo.residentTsahilgaaniiZaalt = resident.tsahilgaaniiZaalt;
              const resTariff = Number(resident.tsahilgaaniiZaalt);
              if (resTariff > 0) {
                finalTariff = resTariff;
                residentSpecificUsed = true;
                tariffSource = "Resident Setting";
              }
            } else {
               debugInfo.residentNotFoundById = true;
               
                // FINAL FALLBACK: Search by Toot and baiguullagiinId
               const searchToot = contractObj?.toot || (resident ? resident.toot : null);
               if (searchToot) {
                 debugInfo.fallingBackToTootSearch = searchToot;
                 
                 // Try both string and ObjectId for baiguullagiinId
                 const baiguullagaIds = [String(baiguullagiinId)];
                 try {
                   if (mongoose.Types.ObjectId.isValid(baiguullagiinId)) {
                     baiguullagaIds.push(new mongoose.Types.ObjectId(baiguullagiinId));
                   }
                 } catch(e) {}

                 for (const Model of modelsToTry) {
                   // Aggressive search: top-level toot OR inside toots array (for Central DB)
                   const foundByToot = await Model.findOne({ 
                     $or: [
                       { 
                         toot: { $in: [String(searchToot), Number(searchToot)] }, 
                         baiguullagiinId: { $in: baiguullagaIds }
                       },
                       { 
                         toots: { 
                           $elemMatch: { 
                             baiguullagiinId: { $in: baiguullagaIds }, 
                             toot: { $in: [String(searchToot), Number(searchToot)] }
                           } 
                         } 
                       }
                     ]
                   }).catch(() => null);
                   
                   if (foundByToot) {
                     resident = foundByToot;
                     debugInfo.residentFoundBy = "Toot Aggressive Match";
                     debugInfo.residentTsahilgaaniiZaalt = resident.tsahilgaaniiZaalt;
                     const resTariff = Number(resident.tsahilgaaniiZaalt) || 0;
                     if (resTariff > 0) {
                       finalTariff = resTariff;
                       residentSpecificUsed = true;
                       tariffSource = "Resident (Toot Match)";
                     }
                     break;
                   }
                 }
               }
               
               if (!resident) {
                 debugInfo.residentNotFoundAtAll = true;
                 debugInfo.triedId = residentObjectId;
                 const sample = await OrshinSuugch(centralConn).findOne({}).select("ner").catch(() => null);
                 if (sample) debugInfo.connectionSample = sample.ner;
               }
            }
          } catch (e) {
            debugInfo.residentLookupError = e.message;
          }
        }

        let finalSuuriKhuraamj = maxSuuriKhuraamj;

        if (residentSpecificUsed) {
          // Check if resident has a specific base fee (unlikely based on current schema but for future proofing)
          if (resident && Number(resident.tsahilgaaniiSuuriKhuraamj) > 0) {
            finalSuuriKhuraamj = Number(resident.tsahilgaaniiSuuriKhuraamj);
            debugInfo.suuriSource = "Resident Setting";
          }
        }

        if (!residentSpecificUsed || debugInfo.contractFound || gereeniiId) {
          const geree = contractObj || (gereeniiId ? await Geree(tukhainBaaziinKholbolt).findById(gereeniiId).catch(() => null) : null);
          if (geree) {
            debugInfo.contractFound = true;
            const actualGereeniiId = geree._id.toString();

            // LOOKUP LATEST READING FROM EXCEL IMPORT (ZaaltUnshlalt)
            const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
            const latestZaalt = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
              .findOne({ gereeniiId: actualGereeniiId })
              .sort({ unshlaltiinOgnoo: -1, createdAt: -1 })
              .catch(() => null);

            if (latestZaalt) {
               debugInfo.hasLatestZaalt = true;
               // Check for Excel-imported base fee (defaultDun or suuriKhuraamj)
               const importSuuri = latestZaalt.defaultDun || latestZaalt.suuriKhuraamj;
               if (importSuuri > 0) {
                 finalSuuriKhuraamj = importSuuri;
                 debugInfo.suuriSource = "Latest Import (ZaaltUnshlalt)";
               }
            }

            if (geree.zardluud) {
              const contractElec = geree.zardluud.find(z => {
                const name = (z.ner || "").trim().toLowerCase();
                return name.includes("цахилгаан") && !name.includes("шат") && !name.includes("дундын");
              });
              
              if (contractElec) {
                debugInfo.contractElecFound = contractElec.ner;
                
                // TARIFF
                const cTariff = Number(contractElec.tariff) || Number(contractElec.zaaltTariff) || 0;
                if (cTariff > 0 && !residentSpecificUsed) {
                  finalTariff = cTariff;
                  tariffSource = "Contract Specific";
                  residentSpecificUsed = true;
                }

                // BASE FEE (Suuri Khuraamj) in Contract
                const cSuuri = Number(contractElec.zaaltDefaultDun) || Number(contractElec.suuriKhuraamj) || 0;
                if (cSuuri > 0 && debugInfo.suuriSource !== "Latest Import (ZaaltUnshlalt)") {
                  finalSuuriKhuraamj = cSuuri;
                  debugInfo.suuriSource = "Contract Specific (" + (Number(contractElec.zaaltDefaultDun) > 0 ? "zaaltDefaultDun" : "suuriKhuraamj") + ")";
                }
              }
            }
          }
        }

        const umnukhZaaltNum =
          typeof umnukhZaaltRaw === "number"
            ? umnukhZaaltRaw
            : parseFloat(String(umnukhZaaltRaw || "").replace(/,/g, "").trim()) || 0;

        // Split readings: Odor (Day) and Shono (Night)
        const odorZaaltRaw = req.body.odorZaalt ?? req.body.odor_zaalt;
        const shonoZaaltRaw = req.body.shonoZaalt ?? req.body.shono_zaalt;

        const odorZaaltNum =
          typeof odorZaaltRaw === "number"
            ? odorZaaltRaw
            : parseFloat(String(odorZaaltRaw || "").replace(/,/g, "").trim()) || 0;
        const shonoZaaltNum =
          typeof shonoZaaltRaw === "number"
            ? shonoZaaltRaw
            : parseFloat(String(shonoZaaltRaw || "").replace(/,/g, "").trim()) || 0;

        // If both Odor and Shono are provided, suuliinZaalt is their sum
        const suuliinZaaltNum = (odorZaaltRaw != null || shonoZaaltRaw != null)
          ? odorZaaltNum + shonoZaaltNum
          : (typeof suuliinZaaltRaw === "number"
            ? suuliinZaaltRaw
            : parseFloat(String(suuliinZaaltRaw || "").replace(/,/g, "").trim()) || 0);

        const guidliinKoeffNum =
          typeof guidliinKoeffRaw === "number"
            ? guidliinKoeffRaw
            : parseFloat(String(guidliinKoeffRaw || "").replace(/,/g, "").trim()) || 1;

        // Use aggregated/resident values
        const zoruu = Math.abs(suuliinZaaltNum - umnukhZaaltNum);
        const usageAmount = zoruu * finalTariff * guidliinKoeffNum;
        const suuriKhuraamj = finalSuuriKhuraamj;
        const niitDun = includeSuuriKhuraamj ? usageAmount + suuriKhuraamj : usageAmount;

        res.send({
          success: true,
          niitDun: Math.round(niitDun * 100) / 100,
          usageAmount: Math.round(usageAmount * 100) / 100,
          suuriKhuraamj: Math.round(suuriKhuraamj * 100) / 100,
          zoruu: Math.round(zoruu * 100) / 100,
          odorZaaltNum,
          shonoZaaltNum,
          suuliinZaaltNum,
          tariff: finalTariff,
          tariffSource,
          isResidentTariff: residentSpecificUsed,
          selectedCharge: selectedChargeName || "None",
          _received: { umnukhZaaltNum, odorZaaltNum, shonoZaaltNum, suuliinZaaltNum, guidliinKoeffNum, includeSuuriKhuraamj },
          _debug: debugInfo
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
