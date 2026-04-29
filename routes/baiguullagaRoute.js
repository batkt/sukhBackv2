const express = require("express");
const router = express.Router();
const Baiguullaga = require("../models/baiguullaga");
const Ajiltan = require("../models/ajiltan");
//const { crudWithFile, crud } = require("../components/crud");
//const UstsanBarimt = require("../models/ustsanBarimt");
const TatvariinAlba = require("../models/tatvariinAlba");
const { tokenShalgakh, crud, UstsanBarimt, khuudaslalt } = require("zevbackv2");
const axios = require("axios");
const request = require("request");
const NevtreltiinTuukh = require("../models/nevtreltiinTuukh");

// Custom GET handler to filter barilguud by barilgiinId - must be before crud() call
router.get("/baiguullaga/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { id } = req.params;
    const { barilgiinId } = req.query;

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
      .findById(id)
      .lean();

    if (!baiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Байгууллага олдсонгүй",
      });
    }

    // If barilgiinId is provided, filter barilguud to only include the matching barilga
    if (barilgiinId) {
      const filteredBarilga = baiguullaga.barilguud?.find(
        (b) => String(b._id) === String(barilgiinId),
      );

      if (!filteredBarilga) {
        return res.status(404).json({
          success: false,
          message: "Барилгын мэдээлэл олдсонгүй",
        });
      }

      // Return baiguullaga with only the filtered barilga
      return res.json({
        ...baiguullaga,
        barilguud: [filteredBarilga],
      });
    }

    // If no barilgiinId provided, return full baiguullaga (default behavior)
    res.json(baiguullaga);
  } catch (error) {
    next(error);
  }
});

// Custom POST handler for updating baiguullaga (before crud to take precedence)
router.post("/baiguullaga/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { id } = req.params;
    
    // Remove _id from body if present (Mongoose will use params.id)
    delete req.body._id;
    
    // Find the existing baiguullaga
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(id);
    
    if (!baiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Байгууллага олдсонгүй",
      });
    }
    
    // Handle barilguud array - if provided, merge with existing or add new ones
    if (req.body.barilguud && Array.isArray(req.body.barilguud)) {
      // Check if we should replace the entire array (if replaceBarilguud flag is set)
      if (req.body.replaceBarilguud === true) {
        // Replace entire barilguud array
        baiguullaga.barilguud = [];
        
        // Process each barilga in the request
        req.body.barilguud.forEach(barilga => {
          const newBarilga = { ...barilga };
          delete newBarilga._id;
          delete newBarilga.baiguullagiinId;
          
          // Ensure bairshil follows the pattern
          if (!newBarilga.bairshil) {
            newBarilga.bairshil = { coordinates: [] };
          } else if (!newBarilga.bairshil.coordinates) {
            newBarilga.bairshil.coordinates = [];
          }
          
          // Ensure tokhirgoo structure
          if (!newBarilga.tokhirgoo) {
            newBarilga.tokhirgoo = {};
          }
          if (!newBarilga.tokhirgoo.ashiglaltiinZardluud) {
            newBarilga.tokhirgoo.ashiglaltiinZardluud = [];
          }
          if (!newBarilga.tokhirgoo.liftShalgaya) {
            newBarilga.tokhirgoo.liftShalgaya = { choloolugdokhDavkhar: [] };
          }
          if (!newBarilga.davkharuud) {
            newBarilga.davkharuud = [];
          }
          
          baiguullaga.barilguud.push(newBarilga);
        });
        
        // Remove barilguud and replaceBarilguud from req.body since we've handled it
        delete req.body.barilguud;
        delete req.body.replaceBarilguud;
      } else {
        // Default behavior: merge/update existing and add new ones
        // Separate existing barilguud (with _id) and new barilguud (without _id)
        const existingBarilguud = req.body.barilguud.filter(b => b._id);
        const newBarilguud = req.body.barilguud.filter(b => !b._id);
        
        // If there are new barilguud, add them to the array
        if (newBarilguud.length > 0) {
        // Remove baiguullagiinId from new barilguud if present (shouldn't be in subdocuments)
        newBarilguud.forEach(barilga => {
          delete barilga.baiguullagiinId;
        });
        
        // Get first barilga as template for copying settings
        const firstBarilga = baiguullaga.barilguud && baiguullaga.barilguud.length > 0 
          ? baiguullaga.barilguud[0] 
          : null;
        
        // Process each new barilga
        newBarilguud.forEach(newBarilga => {
          // Ensure bairshil follows the pattern
          if (!newBarilga.bairshil) {
            newBarilga.bairshil = { coordinates: [] };
          } else if (!newBarilga.bairshil.coordinates) {
            newBarilga.bairshil.coordinates = [];
          }
          
          // Copy default values from first barilga if available
          if (firstBarilga) {
            // Copy top-level fields
            if (newBarilga.khayag === undefined) {
              newBarilga.khayag = firstBarilga.khayag || baiguullaga.khayag || "";
            }
            if (newBarilga.register === undefined) {
              newBarilga.register = firstBarilga.register || baiguullaga.register || "";
            }
            if (newBarilga.niitTalbai === undefined) {
              newBarilga.niitTalbai = firstBarilga.niitTalbai || 0;
            }
            if (newBarilga.davkharuud === undefined) {
              newBarilga.davkharuud = []; // Do not duplicate floor metadata
            }
          } else {
            // If no first barilga, use baiguullaga defaults
            if (newBarilga.khayag === undefined) {
              newBarilga.khayag = baiguullaga.khayag || "";
            }
            if (newBarilga.register === undefined) {
              newBarilga.register = baiguullaga.register || "";
            }
            if (newBarilga.niitTalbai === undefined) {
              newBarilga.niitTalbai = 0;
            }
            if (newBarilga.davkharuud === undefined) {
              newBarilga.davkharuud = [];
            }
          }
          
          // Ensure tokhirgoo exists and follows the pattern
          if (!newBarilga.tokhirgoo) {
            newBarilga.tokhirgoo = {};
          }
          
          // Copy tokhirgoo structure from first barilga if available
          if (firstBarilga && firstBarilga.tokhirgoo) {
            // Deep clone the first barilga's tokhirgoo as base
            const baseTokhirgoo = JSON.parse(JSON.stringify(firstBarilga.tokhirgoo));
            
            // Do not duplicate unit structure (room numbers)
            delete baseTokhirgoo.davkhariinToonuud;
            
            // Merge user-provided tokhirgoo with base (user values take precedence)
            newBarilga.tokhirgoo = {
              ...baseTokhirgoo,
              ...newBarilga.tokhirgoo,
            };
            
            // Ensure required arrays/objects exist
            if (!newBarilga.tokhirgoo.ashiglaltiinZardluud) {
              newBarilga.tokhirgoo.ashiglaltiinZardluud = [];
            }
            if (!newBarilga.tokhirgoo.liftShalgaya) {
              newBarilga.tokhirgoo.liftShalgaya = { choloolugdokhDavkhar: [] };
            } else if (!newBarilga.tokhirgoo.liftShalgaya.choloolugdokhDavkhar) {
              newBarilga.tokhirgoo.liftShalgaya.choloolugdokhDavkhar = [];
            }
            if (!newBarilga.tokhirgoo.davkhar) {
              newBarilga.tokhirgoo.davkhar = [];
            }
            // davkhariinToonuud is optional, don't force it
          } else {
            // If no first barilga, ensure minimum structure
            if (!newBarilga.tokhirgoo.ashiglaltiinZardluud) {
              newBarilga.tokhirgoo.ashiglaltiinZardluud = [];
            }
            if (!newBarilga.tokhirgoo.liftShalgaya) {
              newBarilga.tokhirgoo.liftShalgaya = { choloolugdokhDavkhar: [] };
            } else if (!newBarilga.tokhirgoo.liftShalgaya.choloolugdokhDavkhar) {
              newBarilga.tokhirgoo.liftShalgaya.choloolugdokhDavkhar = [];
            }
            if (!newBarilga.tokhirgoo.davkhar) {
              newBarilga.tokhirgoo.davkhar = [];
            }
          }
        });
        
        // Add new barilguud to the array
        baiguullaga.barilguud.push(...newBarilguud);
      }
      
        // Update existing barilguud if provided
        if (existingBarilguud.length > 0) {
          existingBarilguud.forEach(updatedBarilga => {
            const barilgaId = updatedBarilga._id;
            const index = baiguullaga.barilguud.findIndex(
              b => String(b._id) === String(barilgaId)
            );
            
            if (index >= 0) {
              delete updatedBarilga._id;
              delete updatedBarilga.baiguullagiinId;
              
              // Use .set() to ensure Mongoose tracks changes in nested objects like tokhirgoo.zochinTokhirgoo
              baiguullaga.barilguud[index].set(updatedBarilga);
            }
          });
        }
        
        // Remove barilguud from req.body since we've handled it manually
        delete req.body.barilguud;
      }
    }
    
    // Use .set() to ensure Mongoose detects changes in nested objects like tokhirgoo.zochinTokhirgoo
    // This replaces manual Object.assign and individual field updates
    baiguullaga.set(req.body);
    
    // Save the updated baiguullaga
    await baiguullaga.save();

    // ======== SYNC ZOCHIN TOKHIRGOO TO MASHIN ========
    try {
      const { db } = require("zevbackv2");
      const kholbolt = db.kholboltuud?.find(k => String(k.baiguullagiinId) === String(baiguullaga._id));
      if (kholbolt && kholbolt.kholbolt) {
        const Mashin = require("../models/mashin");
        
        // 1. Sync org defaults to all resident cars
        if (baiguullaga.tokhirgoo && baiguullaga.tokhirgoo.zochinTokhirgoo) {
           const orgSettings = baiguullaga.tokhirgoo.zochinTokhirgoo;
           await Mashin(kholbolt).updateMany({
             baiguullagiinId: String(baiguullaga._id),
             zochinTurul: "Оршин суугч"
           }, {
             $set: {
               zochinUrikhEsekh: orgSettings.zochinUrikhEsekh,
               zochinErkhiinToo: orgSettings.zochinErkhiinToo,
               zochinTusBurUneguiMinut: orgSettings.zochinTusBurUneguiMinut,
               zochinNiitUneguiMinut: orgSettings.zochinNiitUneguiMinut,
               davtamjiinTurul: orgSettings.davtamjiinTurul,
               davtamjUtga: orgSettings.davtamjUtga,
               zochinTailbar: orgSettings.zochinTailbar
             }
           });
        }
        
        // 2. Sync building specific overrides
        if (baiguullaga.barilguud && baiguullaga.barilguud.length > 0) {
           for (const b of baiguullaga.barilguud) {
              if (b.tokhirgoo && b.tokhirgoo.zochinTokhirgoo) {
                 const bSettings = b.tokhirgoo.zochinTokhirgoo;
                 await Mashin(kholbolt).updateMany({
                   baiguullagiinId: String(baiguullaga._id),
                   barilgiinId: String(b._id),
                   zochinTurul: "Оршин суугч"
                 }, {
                   $set: {
                     zochinUrikhEsekh: bSettings.zochinUrikhEsekh,
                     zochinErkhiinToo: bSettings.zochinErkhiinToo,
                     zochinTusBurUneguiMinut: bSettings.zochinTusBurUneguiMinut,
                     zochinNiitUneguiMinut: bSettings.zochinNiitUneguiMinut,
                     davtamjiinTurul: bSettings.davtamjiinTurul,
                     davtamjUtga: bSettings.davtamjUtga,
                     zochinTailbar: bSettings.zochinTailbar
                   }
                 });
              }
           }
        }
      }
    } catch(err) {
      console.log("Sync guest settings error:", err);
    }
    // ===========================================
    
    res.json({
      success: true,
      message: "Байгууллага амжилттай шинэчлэгдлээ",
      result: baiguullaga,
    });
  } catch (error) {
    console.error("Error updating baiguullaga:", error);
    next(error);
  }
});

crud(router, "baiguullaga", Baiguullaga, UstsanBarimt);

router.post("/baiguullagaBurtgekh", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const BaiguullagaModel = Baiguullaga(db.erunkhiiKholbolt);
    const baiguullaga = new BaiguullagaModel(req.body);
    console.log("------------->" + JSON.stringify(baiguullaga));
    baiguullaga.isNew = !baiguullaga.zasakhEsekh;
    // Don't create default barilga - only create when explicitly requested from frontend
    // If barilguud is provided in req.body, it will be used, otherwise it will be empty
    baiguullaga
      .save()
      .then(async (result) => {
        try {
          // Create separate database for the organization
          // Note: kholboltNemye should include authSource=admin in connection string
          // Function signature: kholboltNemye(baiguullagiinId, baaziinNer, cloudMongoDBEsekh, clusterUrl, password, userName)
          await db.kholboltNemye(
            baiguullaga._id,
            req.body.baaziinNer,
            false,              // cloudMongoDBEsekh - false for local MongoDB
            "127.0.0.1:27017",  // clusterUrl
            "Br1stelback1",     // password
            "admin",            // userName
          );
          console.log(
            `✅ Database connection created for: ${req.body.baaziinNer}`,
          );

          // Verify connection was created and log connection details
          const createdConnection = db.kholboltuud?.find(
            (k) => String(k.baiguullagiinId) === String(baiguullaga._id),
          );
          if (createdConnection) {
            console.log(`✅ Connection verified for ${req.body.baaziinNer}`);
            console.log(`Connection details:`, {
              baiguullagiinId: createdConnection.baiguullagiinId,
              baaziinNer: createdConnection.baaziinNer,
              clusterUrl: createdConnection.clusterUrl,
              userName: createdConnection.userName,
              cloudMongoDBEsekh: createdConnection.cloudMongoDBEsekh,
            });

            // Write initial data to ensure database is created (MongoDB only shows databases with data)
            try {
              // Use the connection's mongoose instance to write initial data
              const mongooseConnection = createdConnection.kholbolt;
              if (mongooseConnection && mongooseConnection.db) {
                // Create a test collection with a document to initialize the database
                await mongooseConnection.db.collection("_init").insertOne({
                  baiguullagiinId: baiguullaga._id.toString(),
                  baaziinNer: req.body.baaziinNer,
                  createdAt: new Date(),
                  initialized: true,
                });
                console.log(
                  `✅ Initial data written to database: ${req.body.baaziinNer}`,
                );
              } else {
                console.warn(
                  `⚠️ Connection object structure unexpected for ${req.body.baaziinNer}`,
                );
              }
            } catch (initErr) {
              console.error(
                `⚠️ Failed to write initial data to ${req.body.baaziinNer}:`,
                initErr.message,
              );
            }
          } else {
            console.warn(
              `⚠️ Connection not found in kholboltuud for ${req.body.baaziinNer}`,
            );
          }
        } catch (dbErr) {
          console.error(
            `❌ Failed to create database connection for ${req.body.baaziinNer}:`,
            dbErr,
          );
          // Continue anyway - organization is saved
        }

        if (req.body.ajiltan) {
          let ajiltan = new Ajiltan(db.erunkhiiKholbolt)(req.body.ajiltan);
          ajiltan.erkh = "Admin";
          ajiltan.baiguullagiinId = result._id;
          ajiltan.baiguullagiinNer = result.ner;
          ajiltan
            .save()
            .then((result1) => {
              res.send("Amjilttai");
            })
            .catch((err) => {
              next(err);
            });
        } else res.send("Amjilttai");
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

router.post("/salbarBurtgey", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    Baiguullaga(db.erunkhiiKholbolt)
      .updateOne(
        { register: req.body.tolgoiCompany },
        {
          $push: {
            barilguud: {
              licenseRegister: req.body.register,
              ner: req.body.ner,
              khayag: req.body.khayag,
            },
          },
        },
      )
      .then((result) => {
        res.send("Amjilttai");
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

router.post("/baiguullagaAvya", (req, res, next) => {
  const { db } = require("zevbackv2");
  Baiguullaga(db.erunkhiiKholbolt)
    .findOne({
      register: req.body.register,
    })
    .then((result) => {
      res.send(result);
    })
    .catch((err) => {
      next(err);
    });
});

router.get("/baiguullagaBairshilaarAvya", (req, res, next) => {
  const { db } = require("zevbackv2");

  Baiguullaga(db.erunkhiiKholbolt)
    .find(
      {},
      {
        _id: 1,
        ner: 1,
        dotoodNer: 1,
        register: 1,
        khayag: 1,
        "barilguud._id": 1,
        "barilguud.ner": 1,
        "barilguud.tokhirgoo.duuregNer": 1,
        "barilguud.tokhirgoo.districtCode": 1,
        "barilguud.tokhirgoo.sohNer": 1,
        "barilguud.tokhirgoo.horoo": 1,
        "barilguud.tokhirgoo.davkhar": 1,
        "barilguud.tokhirgoo.davkhariinToonuud": 1,
        "barilguud.tokhirgoo.zochinTokhirgoo": 1,
        "tokhirgoo.zochinTokhirgoo": 1,
      },
    )
    .then((result) => {
      const transformedResult = result.map((item) => {
        // Transform all barilguud into an array
        const barilguud = (item.barilguud || []).map((barilga) => {
          const tokhirgoo = barilga?.tokhirgoo;
          return {
            barilgiinId: barilga._id?.toString() || "",
            bairniiNer: barilga?.ner || "", 
            duuregNer: tokhirgoo?.duuregNer || "",
            districtCode: tokhirgoo?.districtCode || "",
            sohNer: tokhirgoo?.sohNer || "",
            horoo: tokhirgoo?.horoo || {},
            davkhar: Array.isArray(tokhirgoo?.davkhar)
              ? tokhirgoo.davkhar
              : tokhirgoo?.davkhar
                ? [tokhirgoo.davkhar]
                : [],
            davkhariinToonuud: tokhirgoo?.davkhariinToonuud || {}, 
            zochinTokhirgoo: tokhirgoo?.zochinTokhirgoo || {},
          };
        });

        return {
          baiguullagiinId: item._id,
          baiguullagiinNer: item.ner || "",
          dotoodNer: item.dotoodNer || "",
          register: item.register || "",
          khayag: item.khayag || "",
          tokhirgoo: item.tokhirgoo || {},
          barilguud: barilguud, 
        };
      });

      res.json({
        success: true,
        message: "Бүх байгууллагын мэдээлэл олдлоо",
        result: transformedResult,
      });
    })
    .catch((err) => {
      next(err);
    });
});

router.get("/tatvariinAlba", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    const body = req.query;
    if (!!body?.query) body.query = JSON.parse(body.query);
    if (!!body?.order) body.order = JSON.parse(body.order);
    if (!!body?.khuudasniiDugaar)
      body.khuudasniiDugaar = Number(body.khuudasniiDugaar);
    if (!!body?.khuudasniiKhemjee)
      body.khuudasniiKhemjee = Number(body.khuudasniiKhemjee);
    if (!!body?.search) body.search = String(body.search);
    khuudaslalt(TatvariinAlba(db.erunkhiiKholbolt), body)
      .then((result) => {
        res.send(result);
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/tatvariinAlbaOlnoorNemye",
  tokenShalgakh,
  async (req, res, next) => {
    const { db } = require("zevbackv2");

    try {
      const jagsaalt = req.body.jagsaalt;
      TatvariinAlba(db.erunkhiiKholbolt)
        .insertMany(jagsaalt)
        .then((x) => {
          res.send(x);
        })
        .catch((a) => {
          next(a);
        });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/barilgaBurtgekh", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, ner, sohNer, davkhar } = req.body;

    if (!baiguullagiinId || !ner || !sohNer) {
      return res.status(400).json({
        success: false,
        message: "baiguullagiinId, ner, and sohNer are required",
      });
    }

    // Find the baiguullaga
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );

    if (!baiguullaga) {
      return res.status(404).json({
        success: false,
        message: "Байгууллага олдсонгүй",
      });
    }

    // Check if barilguud array exists and has at least one barilga
    if (!baiguullaga.barilguud || baiguullaga.barilguud.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Байгууллагад барилга байхгүй байна",
      });
    }

    // Get the first barilga (the template)
    const firstBarilga = baiguullaga.barilguud[0];

    // Create a new barilga object by copying the first one but excluding units and floor metadata
    const tokhirgooBase = firstBarilga.tokhirgoo
      ? JSON.parse(JSON.stringify(firstBarilga.tokhirgoo))
      : baiguullaga.tokhirgoo
        ? JSON.parse(JSON.stringify(baiguullaga.tokhirgoo))
        : {};

    // Do not duplicate unit structure (room numbers)
    delete tokhirgooBase.davkhariinToonuud;

    const newBarilga = {
      ner: ner,
      khayag: firstBarilga.khayag || baiguullaga.khayag || "",
      register: firstBarilga.register || baiguullaga.register || "",
      niitTalbai: firstBarilga.niitTalbai || 0,
      bairshil: firstBarilga.bairshil || {
        type: "Point",
        coordinates: [],
      },
      tokhirgoo: tokhirgooBase,
      davkharuud: [], // Do not duplicate floor metadata
    };

    // Update sohNer and davkhar in tokhirgoo
    // davkhar is an array
    // Note: bairniiNer comes from barilga.ner, not from tokhirgoo
    if (newBarilga.tokhirgoo) {
      newBarilga.tokhirgoo.sohNer = sohNer;
      if (davkhar !== undefined) {
        newBarilga.tokhirgoo.davkhar = Array.isArray(davkhar)
          ? davkhar
          : davkhar
            ? [davkhar]
            : [];
      }
    }

    // Add the new barilga to the barilguud array
    baiguullaga.barilguud.push(newBarilga);
    await baiguullaga.save();

    // Get the newly created barilga ID (last one in the array)
    const newBarilgiinId =
      baiguullaga.barilguud[baiguullaga.barilguud.length - 1]._id.toString();

    // Find the company's database connection
    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullagiinId,
    );

    if (tukhainBaaziinKholbolt) {
      // Copy ashiglaltiinZardluud from first barilga tokhirgoo to new barilga tokhirgoo
      const firstBarilgiinId = firstBarilga._id.toString();
      const existingZardluud =
        firstBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
      const existingLiftShalgaya = firstBarilga.tokhirgoo?.liftShalgaya || {};
      const existingDans = firstBarilga.tokhirgoo?.dans || null;

      // Copy to new barilga's tokhirgoo
      if (existingZardluud && existingZardluud.length > 0) {
        const newZardluudArray = existingZardluud.map((zardal) => {
          // Create a clean copy without Mongoose metadata
          const zardalCopy = JSON.parse(JSON.stringify(zardal));
          return zardalCopy;
        });

        // Find the new barilga index and update its tokhirgoo
        const newBarilgaIndex = baiguullaga.barilguud.findIndex(
          (b) => String(b._id) === String(newBarilgiinId),
        );

        if (newBarilgaIndex >= 0) {
          if (!baiguullaga.barilguud[newBarilgaIndex].tokhirgoo) {
            baiguullaga.barilguud[newBarilgaIndex].tokhirgoo = {};
          }
          baiguullaga.barilguud[
            newBarilgaIndex
          ].tokhirgoo.ashiglaltiinZardluud = newZardluudArray;

          // Also copy liftShalgaya
          if (
            existingLiftShalgaya &&
            Object.keys(existingLiftShalgaya).length > 0
          ) {
            baiguullaga.barilguud[newBarilgaIndex].tokhirgoo.liftShalgaya =
              JSON.parse(JSON.stringify(existingLiftShalgaya));
          }

          // Also copy dans (bank account info)
          if (existingDans) {
            baiguullaga.barilguud[newBarilgaIndex].tokhirgoo.dans = JSON.parse(
              JSON.stringify(existingDans),
            );
          }

          await baiguullaga.save();
        }
      }
    }

    res.json({
      success: true,
      message: "Барилга амжилттай бүртгэгдлээ",
      result: {
        baiguullagiinId: baiguullagiinId,
        barilgiinId: newBarilgiinId,
        ner: ner,
        sohNer: sohNer,
        bairniiNer: ner, // Барилгын нэр comes from barilga.ner
        davkhar: Array.isArray(davkhar) ? davkhar : davkhar ? [davkhar] : [],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /baiguullaga/:baiguullagiinId/barilga/:barilgiinId
 * @desc  Delete a specific building from an organization
 * @access Private (tokenShalgakh)
 */
router.delete(
  "/baiguullaga/:baiguullagiinId/barilga/:barilgiinId",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const { baiguullagiinId, barilgiinId } = req.params;

      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        baiguullagiinId,
      );
      if (!baiguullaga) {
        return res.status(404).json({
          success: false,
          message: "Байгууллага олдсонгүй",
        });
      }

      const barilgaIndex = baiguullaga.barilguud.findIndex(
        (b) => String(b._id) === String(barilgiinId),
      );
      if (barilgaIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Барилга олдсонгүй",
        });
      }

      const deletedBarilgaName = baiguullaga.barilguud[barilgaIndex].ner;
      baiguullaga.barilguud.splice(barilgaIndex, 1);
      await baiguullaga.save();

      res.json({
        success: true,
        message: `"${deletedBarilgaName}" барилга амжилттай устгагдлаа`,
        deletedId: barilgiinId,
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
