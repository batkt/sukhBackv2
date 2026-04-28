const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const baiguullagaSchema = new Schema(
  {
    id: String,
    ner: String,
    dotoodNer: String,
    khayag: String,
    mail: [String],
    register: String,
    utas: [String],
    zurgiinNer: String,
    dans: String,
    bankniiNer: String,
    barilguud: [
      {
        bairshil: {
          type: {
            type: String,
            enum: ["Point"],
          },
          coordinates: {
            type: [Number],
          },
        },
        ner: String,
        khayag: String,
        register: String,
        niitTalbai: Number,
        tokhirgoo: {
          /**Хоногт бодох алдангийн хувь дээд тал 0.5 байна */
          aldangiinKhuvi: Number,
          /**Алданги авалгүйгээр хүлээх хоног */
          aldangiChuluulukhKhonog: Number,
          /**Алданги бодож эхлэх огноо */
          aldangiBodojEkhlekhOgnoo: Date,
          eBarimtAshiglakhEsekh: Boolean,
          eBarimtShine: Boolean,
          eBarimtAutomataarIlgeekh: Boolean,
          eBarimtBugdShivikh: Boolean, //Bux barimtand ebarimt shiwix odoogoor zuwxun zogsool deer xiilee
          eBarimtMessageIlgeekhEsekh: Boolean,
          merchantTin: String,
          EbarimtDuuregNer: String,
          EbarimtDistrictCode: String,
          EbarimtDHoroo: {
            ner: String,
            kod: String,
          },
          duuregNer: String,
          districtCode: String,
          horoo: {
            ner: String,
            kod: String,
          },
          sohNer: String,
          orts: String,
          davkhar: [String],
          davkhariinToonuud: Schema.Types.Mixed,
          nuatTulukhEsekh: Boolean,
          zogsoolMsgIlgeekh: Boolean,
          tooluurAutomatTatakhToken: String,
          /**Сар бүрийн тогтмол өдөр хөнгөлөлт боломж олгоно */
          sarBurAutoKhungulultOruulakhEsekh: Boolean,
          khungulukhSarBuriinShalguurDun: Number,
          khungulukhSarBuriinTurul: String,
          khungulukhSarBuriinUtga: Number,
          khungulukhSarBuriinTulburEkhlekhUdur: Number,
          khungulukhSarBuriinTulburDuusakhUdur: Number,
          tureesiinDungeesKhungulukhEsekh: Boolean,
          ashiglaltDungeesKhungulukhEsekh: Boolean,
          jilBurTalbaiTulburNemekhEsekh:
            Boolean /** жил бүр талбайн төлбөр нэмэх эсэх */,
          jilBurTulbur: Number,
          gereeDuusakhTalbaiTulburNemekhEsekh:
            Boolean /** гэрээ дуусах үед талбайн төлбөр нэмэх эсэх */,
          gereeDuusakhTulbur: Number,
          zochinUrikhUneguiMinut: Number,
          zochinTokhirgoo: {
            zochinUrikhEsekh: Boolean,
            zochinTurul: String,
            zochinErkhiinToo: Number,
            zochinTusBurUneguiMinut: Number,
            zochinNiitUneguiMinut: Number,
            zochinTailbar: String,
            davtamjiinTurul: String,
            davtamjUtga: Number,
            orshinSuugchMashiniiLimit: Number
          },
          /** Ашиглалтын зардлууд - барилга тус бүрт тусдаа */
          ashiglaltiinZardluud: [
            {
              ner: String,
              turul: String,
              bodokhArga: String,
              tseverUsDun: Number,
              bokhirUsDun: Number,
              usKhalaasniiDun: Number,
              tsakhilgaanUrjver: Number,
              tsakhilgaanChadal: Number,
              tsakhilgaanDemjikh: Number,
              tailbar: String,
              tariff: Number,
              tariffUsgeer: String,
              suuriKhuraamj: Number,
              nuatNemekhEsekh: Boolean,
              togtmolUtga: Number,
              choloolugdsonDavkhar: Boolean,
              zardliinTurul: String,
              dun: Number,
              ognoonuud: [Date],
              nuatBodokhEsekh: Boolean,
              zaalt: Boolean, // Electricity (цахилгаан) flag
              zaaltTariff: Number, // кВт tariff for electricity (legacy - use zaaltTariffTiers if available)
              zaaltDefaultDun: Number, // Default amount for electricity calculation
              // Tiered pricing: zaaltTariffTiers = [{ threshold: 175, tariff: 175 }, { threshold: 256, tariff: 256 }, { threshold: Infinity, tariff: 285 }]
              zaaltTariffTiers: [
                {
                  threshold: Number, // Usage threshold (кВт)
                  tariff: Number, // Tariff rate for this tier (Төг/кВт.цаг)
                },
              ],
            },
          ],
          /** Лифт шалгая - хөлөгдсөн давхрууд */
          liftShalgaya: {
            choloolugdokhDavkhar: [String],
          },
          /** Дансны мэдээлэл - барилга тус бүрт тусдаа */
          dans: {
            dugaar: String, // Дансны дугаар
            dansniiNer: String, // Дансны нэр
            bank: String, // Банкны нэр
            ibanDugaar: String, // IBAN дугаар
          },
        },
        davkharuud: [
          {
            davkhar: String,
            talbai: Number,
            tariff: Number,
            planZurag: String,
          },
        ],
      },
    ],
    talbai: Number,
    tokhirgoo: {
      /**Хоногт бодох алдангийн хувь дээд тал 0.5 байна */
      aldangiinKhuvi: Number,

      /**Алданги авалгүйгээр хүлээх хоног */
      aldangiChuluulukhKhonog: Number,

      /**Алданги бодож эхлэх огноо */
      aldangiBodojEkhlekhOgnoo: Date,

      /**Жилийн эцэсээр гэрээ хаах бол 12 гэж байна ИХ Наяд дээр бүх гэрээ жилийн эцэст хаагддаг учир ийл тохиргоо авлаа */
      gereeDuusgakhSar: Number,

      /**Хэдэн сараар барьцаа авах вэ */
      baritsaaAvakhSar: Number,

      /**Хөнгөлөлт ажилтан харгалзахгүй өгөх боломж олгоно */
      bukhAjiltanKhungulultOruulakhEsekh: Boolean,

      /**Хоногоор хөнгөлөлт боломж олгоно */
      khonogKhungulultOruulakhEsekh: Boolean,

      /**Тухайн байгууллагын хөнгөлж болох дээд хувь байна */
      deedKhungulultiinKhuvi: Number,

      /**Гэрээний хугацаа дуусах үед автоматаар сунгах эсэх */
      gereeAvtomataarSungakhEsekh: Boolean,

      /**Гэрээ засах эрх бүх ажилтанд олгох эсэх */
      bukhAjiltanGereendZasvarOruulakhEsekh: Boolean,
      /**Системд И Баримт ашиглах эсэх */
      eBarimtAshiglakhEsekh: Boolean,
      eBarimtAutomataarShivikh: Boolean,
      eBarimtAutomataarIlgeekh: Boolean,
      msgIlgeekhKey: String,
      msgIlgeekhDugaar: String,
      msgAvakhTurul: String,
      msgAvakhDugaar: [String],
      msgAvakhTsag: String,
      zogsoolMsgZagvar: String,
      mailNevtrekhNer: String,
      mailPassword: String,
      mailHost: String,
      mailPort: String,
      khereglegchEkhlekhOgnoo: Date,
      zogsooliinMinut: Number,
      zogsooliinKhungulukhMinut: Number,
      zogsooliinDun: Number,
      apiAvlagaDans: String,
      apiOrlogoDans: String,
      apiNuatDans: String,
      apiZogsoolDans: String,
      apiTogloomiinTuvDans: String,
      aktAshiglakhEsekh: Boolean,
      guidelBuchiltKhonogEsekh: Boolean,
      sekhDemjikhTulburAvakhEsekh: Boolean,
      bichiltKhonog: Number,
      udruurBodokhEsekh: Boolean,
      baritsaaUneAdiltgakhEsekh: Boolean,
      zogsoolNer: String,
      davkharsanMDTSDavtamjSecond: Number,
      zurchulMsgeerSanuulakh:
        Boolean /** Зогсоолын зөрчил сануулах жагсаалт харуулах тохируулах */,
      guidliinKoepEsekh: Boolean,
      msgNegjUne: Number /** мессеж нэгж үнэ тохируулах */,
      gadaaStickerAshiglakhEsekh: Boolean /** gadaa sticker ashiglakh esekh */,
      togloomiinTuvDavkhardsanShalgakh: Boolean,
      dotorGadnaTsagEsekh: Boolean,
      zochinTokhirgoo: {
        zochinUrikhEsekh: Boolean,
        zochinTurul: String,
        zochinErkhiinToo: Number,
        zochinTusBurUneguiMinut: Number,
        zochinNiitUneguiMinut: Number,
        zochinTailbar: String,
        davtamjiinTurul: String,
        davtamjUtga: Number,
        orshinSuugchMashiniiLimit: Number
      },
    },
    erkhuud: [
      {
        zam: String,
        ner: String,
        tailbar: String,
        tokhirgoo: [
          {
            utga: String,
            ner: String,
            tailbar: String,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

baiguullagaSchema.index({ register: 1 });
baiguullagaSchema.index({ id: 1 });

// Shared function to update geree.zardluud when baiguullaga.barilguud[].tokhirgoo.ashiglaltiinZardluud changes
async function updateGereeFromBaiguullagaZardluud(doc) {
  try {
    if (!doc || !doc.barilguud || !Array.isArray(doc.barilguud)) {
      return;
    }

    const { db } = require("zevbackv2");
    const Geree = require("./geree");

    const kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(doc._id)
    );

    if (!kholbolt) {
      return;
    }

    // Process each barilga's ashiglaltiinZardluud
    for (const barilga of doc.barilguud) {
      if (
        !barilga._id ||
        !barilga.tokhirgoo ||
        !barilga.tokhirgoo.ashiglaltiinZardluud ||
        !Array.isArray(barilga.tokhirgoo.ashiglaltiinZardluud)
      ) {
        continue;
      }

      const barilgiinId = barilga._id.toString();
      const ashiglaltiinZardluud = barilga.tokhirgoo.ashiglaltiinZardluud;

      // Find all active geree documents for this baiguullaga and barilga
      const gereenuud = await Geree(kholbolt, true).find({
        baiguullagiinId: doc._id.toString(),
        barilgiinId: barilgiinId,
        tuluv: "Идэвхтэй", // Only update active contracts
      });
      
      for (const geree of gereenuud) {
        if (!geree.zardluud) {
          geree.zardluud = [];
        }

        // Get current zardluud from building config
        const buildingZardluudMap = new Map();
        for (const zardal of ashiglaltiinZardluud) {
          const key = `${zardal.ner || ""}_${zardal.turul || ""}_${zardal.zardliinTurul || ""}`;
          buildingZardluudMap.set(key, zardal);
        }

        // Remove zardluud that no longer exist in building config (matching by barilgiinId)
        geree.zardluud = geree.zardluud.filter((z) => {
          // Keep zardluud from other barilgas
          if (z.barilgiinId && String(z.barilgiinId) !== barilgiinId) {
            return true;
          }
          // Keep zardluud that don't have barilgiinId (backward compatibility)
          if (!z.barilgiinId) {
            // Only remove if it matches a building zardal (to avoid removing unrelated zardluud)
            const key = `${z.ner || ""}_${z.turul || ""}_${z.zardliinTurul || ""}`;
            return !buildingZardluudMap.has(key);
          }
          // For zardluud from this barilga, check if it still exists in building config
          const key = `${z.ner || ""}_${z.turul || ""}_${z.zardliinTurul || ""}`;
          return buildingZardluudMap.has(key);
        });

        // Update or add zardluud from building config
        for (const buildingZardal of ashiglaltiinZardluud) {
          const key = `${buildingZardal.ner || ""}_${buildingZardal.turul || ""}_${buildingZardal.zardliinTurul || ""}`;
          
          // Find existing zardal in geree
          // Match by ner, turul, zardliinTurul
          // For barilgiinId: if geree zardal doesn't have barilgiinId, it's from this building (backward compatibility)
          // If geree zardal has barilgiinId, it must match this building's barilgiinId
          const existingIndex = geree.zardluud.findIndex((z) => {
            const matchesNer = z.ner === buildingZardal.ner;
            const matchesTurul = z.turul === buildingZardal.turul;
            const matchesZardliinTurul = z.zardliinTurul === buildingZardal.zardliinTurul;
            
            // For backward compatibility: if zardal doesn't have barilgiinId, assume it's from this building
            // If zardal has barilgiinId, it must match this building's barilgiinId
            const matchesBarilgiinId = !z.barilgiinId || String(z.barilgiinId) === barilgiinId;
            
            return matchesNer && matchesTurul && matchesZardliinTurul && matchesBarilgiinId;
          });

          const newZardal = {
            ner: buildingZardal.ner,
            turul: buildingZardal.turul,
            tariff: buildingZardal.tariff,
            tariffUsgeer: buildingZardal.tariffUsgeer,
            zardliinTurul: buildingZardal.zardliinTurul,
            barilgiinId: barilgiinId,
            tulukhDun: 0,
            dun: buildingZardal.dun || 0,
            bodokhArga: buildingZardal.bodokhArga || "",
            tseverUsDun: buildingZardal.tseverUsDun || 0,
            bokhirUsDun: buildingZardal.bokhirUsDun || 0,
            usKhalaasniiDun: buildingZardal.usKhalaasniiDun || 0,
            tsakhilgaanUrjver: buildingZardal.tsakhilgaanUrjver || 1,
            tsakhilgaanChadal: buildingZardal.tsakhilgaanChadal || 0,
            tsakhilgaanDemjikh: buildingZardal.tsakhilgaanDemjikh || 0,
            suuriKhuraamj: buildingZardal.suuriKhuraamj || 0,
            nuatNemekhEsekh: buildingZardal.nuatNemekhEsekh || false,
            ognoonuud: buildingZardal.ognoonuud || [],
            zaalt: buildingZardal.zaalt || false,
            zaaltTariff: buildingZardal.zaaltTariff || 0,
            zaaltDefaultDun: buildingZardal.zaaltDefaultDun || 0,
            zaaltTariffTiers: buildingZardal.zaaltTariffTiers || [],
          };

          if (existingIndex !== -1) {
            // Update existing zardal
            geree.zardluud[existingIndex] = {
              ...geree.zardluud[existingIndex].toObject(),
              ...newZardal,
            };
          } else {
            // Add new zardal
            geree.zardluud.push(newZardal);
          }
        }

        // Recalculate niitTulbur
        const niitTulbur = geree.zardluud.reduce((sum, zardal) => {
          return sum + (zardal.tariff || 0);
        }, 0);

        const oldNiitTulbur = geree.niitTulbur;
        geree.niitTulbur = niitTulbur;

        // Save the updated geree
        await geree.save();
        // NOTE: Do NOT update existing nekhemjlekhiinTuukh (invoice) records
        // Once an invoice is created, it should NEVER be modified
        // This ensures historical accuracy - invoices represent what was billed at a specific point in time
      }
    }
  } catch (error) {
    console.error(
      "Error updating geree.zardluud after baiguullaga.ashiglaltiinZardluud update:",
      error
    );
  }
}

// Pre-save hook to validate that toots are unique across all davkhars
 baiguullagaSchema.pre("save", function (next) {
  try {
    const error = validateDavkhariinToonuud(this.barilguud);
    if (error) {
      console.error(`❌ [VALIDATION PRE-SAVE] Validation failed:`, error.message);
      error.name = "ValidationError";
      return next(error);
    }
    next();
  } catch (error) {
    console.error(`❌ [VALIDATION PRE-SAVE] Error in validation:`, error);
    console.error(`❌ [VALIDATION PRE-SAVE] Error stack:`, error.stack);
    next(error);
  }
});

// Post-save hook - validate AFTER save as safety check
baiguullagaSchema.post("save", async function (doc) {
  try {
    if (doc.barilguud && Array.isArray(doc.barilguud)) {
      const error = validateDavkhariinToonuud(doc.barilguud);
      if (error) {
      }
    }
  } catch (err) {
    console.error(`❌ [VALIDATION POST-SAVE] Error during validation:`, err);
    console.error(`❌ [VALIDATION POST-SAVE] Error stack:`, err.stack);
  }
  
  await updateGereeFromBaiguullagaZardluud(doc);
});

// Helper function to validate davkhariinToonuud for duplicate toots
function validateDavkhariinToonuud(barilguud) {
  if (!barilguud || !Array.isArray(barilguud)) {
    return null; // No error
  }

  // Check each building's davkhariinToonuud for duplicate toots across davkhars
  for (let barilgaIndex = 0; barilgaIndex < barilguud.length; barilgaIndex++) {
    const barilga = barilguud[barilgaIndex];
    if (!barilga.tokhirgoo || !barilga.tokhirgoo.davkhariinToonuud) {
      continue;
    }

    const davkhariinToonuud = barilga.tokhirgoo.davkhariinToonuud;
    const tootMap = new Map(); // Map<toot, davkhar>
    for (const [floorKey, tootArray] of Object.entries(davkhariinToonuud)) {
      if (!tootArray || !Array.isArray(tootArray)) {
        continue;
      }

      // Extract davkhar from floorKey
      let davkhar = "";
      if (floorKey.includes("::")) {
        const parts = floorKey.split("::");
        davkhar = parts[1] || parts[0]; // davkhar is the second part (e.g., "1::4" -> "4")
      } else {
        davkhar = floorKey; // If no ::, the key itself is davkhar (e.g., "1" -> "1")
      }

      // Parse toot list from array (can be comma-separated string or array)
      let tootList = [];
      if (typeof tootArray[0] === "string" && tootArray[0].includes(",")) {
        tootList = tootArray[0].split(",").map((t) => t.trim()).filter((t) => t);
      } else {
        tootList = tootArray.map((t) => String(t).trim()).filter((t) => t);
      }
      // Check each toot for duplicates across davkhars
      for (const toot of tootList) {
        if (tootMap.has(toot)) {
          const existingDavkhar = tootMap.get(toot);
          console.error(`❌ [VALIDATION FUNCTION] Duplicate toot found: "${toot}" in davkhar ${existingDavkhar} and ${davkhar}`);
          console.error(`❌ [VALIDATION FUNCTION] Floor keys processed so far:`, Array.from(tootMap.entries()));
          console.error(`❌ [VALIDATION FUNCTION] Current floorKey: ${floorKey}, davkhar: ${davkhar}, tootList:`, tootList);
          return new Error(
            `Тоот "${toot}" аль хэдийн ${existingDavkhar}-р давхарт байна. ${davkhar}-р давхарт давхардсан тоот байж болохгүй!`
          );
        }
        tootMap.set(toot, davkhar);
      }
    }
  }
  return null; // No error
}

// Pre-updateOne hook (for updateOne operations)
// Only validate if entire barilguud array is being updated (not nested path updates)
baiguullagaSchema.pre("updateOne", function (next) {
  try {
    // Only validate if barilguud is directly in _update (full array update)
    // Skip validation for nested path updates like "barilguud.0.tokhirgoo.davkhariinToonuud"
    if (this._update && this._update.barilguud && !this._update.$set) {
      const error = validateDavkhariinToonuud(this._update.barilguud);
      if (error) {
        error.name = "ValidationError";
        return next(error);
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-findOneAndUpdate hook (for findOneAndUpdate operations)
// Validate both full array updates AND nested path updates that modify davkhariinToonuud
baiguullagaSchema.pre("findOneAndUpdate", async function (next) {
  try {
    let barilguudToValidate = null;
    
    // Case 1: Direct barilguud update (PUT with full object, Mongoose sets it directly)
    if (this._update && this._update.barilguud && !this._update.$set) {
      barilguudToValidate = this._update.barilguud;
    }
    // Case 2: barilguud in $set (PUT with full object wrapped in $set)
    else if (this._update && this._update.$set && this._update.$set.barilguud) {
      barilguudToValidate = this._update.$set.barilguud;
    }
    // Case 3: Nested davkhariinToonuud update via $set (partial update)
    else if (this._update && this._update.$set) {
      const setKeys = Object.keys(this._update.$set);
      const isDavkhariinToonuudUpdate = setKeys.some(key => 
        key.includes('tokhirgoo.davkhariinToonuud') || key.includes('barilguud')
      );
      if (isDavkhariinToonuudUpdate) {
        const doc = await this.model.findOne(this.getQuery()).lean();
        if (doc && doc.barilguud) {
          const mergedBarilguud = JSON.parse(JSON.stringify(doc.barilguud));
          
          for (const [path, value] of Object.entries(this._update.$set)) {
            if (path === 'barilguud') {
              barilguudToValidate = value;
              break;
            } else if (path.startsWith('barilguud.')) {
              const pathParts = path.split('.');
              const barilgaIndex = parseInt(pathParts[1]);
              
              if (!isNaN(barilgaIndex) && mergedBarilguud[barilgaIndex]) {
                if (pathParts[2] === 'tokhirgoo' && pathParts[3] === 'davkhariinToonuud') {
                  mergedBarilguud[barilgaIndex].tokhirgoo = mergedBarilguud[barilgaIndex].tokhirgoo || {};
                  mergedBarilguud[barilgaIndex].tokhirgoo.davkhariinToonuud = value;
                }
              }
            }
          }
          
          if (!barilguudToValidate) {
            barilguudToValidate = mergedBarilguud;
          }
        }
      }
    }
    
    if (barilguudToValidate) {
      const error = validateDavkhariinToonuud(barilguudToValidate);
      if (error) {
        error.name = "ValidationError";
        return next(error);
      }
    }
    
    next();
  } catch (error) {
    console.error(`❌ [VALIDATION PRE-FINDONEANDUPDATE] Error:`, error);
    next(error);
  }
});

baiguullagaSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) {
    await updateGereeFromBaiguullagaZardluud(doc);
  }
});

baiguullagaSchema.post("updateOne", async function () {
  try {
    const doc = await this.model.findOne(this.getQuery());
    if (doc) {
      await updateGereeFromBaiguullagaZardluud(doc);
    }
  } catch (error) {
    console.error("Error in updateOne hook:", error);
  }
});

// Add audit hooks for tracking changes (including tokhirgoo) - after all hooks
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(baiguullagaSchema, "baiguullaga");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("baiguullaga", baiguullagaSchema);
};
