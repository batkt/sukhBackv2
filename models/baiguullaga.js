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
          bodokhArgaEnabled: {
            type: Boolean,
            default: false,
          },
          bodokhArga: {
            type: String,
            enum: ["Хуанли", "Тогтмол"],
            default: "Хуанли",
          },
          bodokhKhonog: {
            type: Number,
            default: 30,
          },

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
        orshinSuugchMashiniiLimit: Number,
      },
      bodokhArgaEnabled: {
        type: Boolean,
        default: false,
      },
      bodokhArga: {
        type: String,
        enum: ["Хуанли", "Тогтмол"],
        default: "Хуанли",
      },
      bodokhKhonog: {
        type: Number,
        default: 30,
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


 baiguullagaSchema.pre("save", function (next) {
  try {
    console.log(`🔍 [TRACE-SAVE] Baiguullaga saving: ${this.ner} (${this._id})`);
    if (this.barilguud) {
      normalizeBarilguud(this.barilguud);
      this.barilguud.forEach((b, idx) => {
        if (b.tokhirgoo && b.tokhirgoo.davkhariinToonuud) {
          console.log(`   - Barilga[${idx}] "${b.ner}" has ${Object.keys(b.tokhirgoo.davkhariinToonuud).length} floors configured.`);
        } else {
          console.log(`   - Barilga[${idx}] "${b.ner}" HAS NO TOOTS CONFIGURED!`);
        }
      });
    }

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
  

});

function normalizeDavkhariinToonuudObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const normalized = {};
  for (const [floorKey, tootArray] of Object.entries(obj)) {
    if (!tootArray) continue;
    let orts = "1";
    let davkhar = "";
    if (String(floorKey).includes("::")) {
      const parts = String(floorKey).split("::");
      orts = parts[0] || "1";
      davkhar = parts[1] || parts[0];
    } else {
      davkhar = floorKey;
    }
    const canonicalKey = `${orts}::${davkhar}`;
    let tootList = [];
    if (Array.isArray(tootArray)) {
      if (typeof tootArray[0] === "string" && tootArray[0].includes(",")) {
        tootList = tootArray[0]
          .split(",")
          .map((t) => String(t).trim())
          .filter((t) => t);
      } else {
        tootList = tootArray.map((t) => String(t).trim()).filter((t) => t);
      }
    } else if (typeof tootArray === "string") {
      tootList = tootArray
        .split(",")
        .map((t) => String(t).trim())
        .filter((t) => t);
    }
    if (!normalized[canonicalKey]) normalized[canonicalKey] = [];
    const currentSet = new Set(normalized[canonicalKey]);
    tootList.forEach((t) => currentSet.add(t));
    normalized[canonicalKey] = Array.from(currentSet);
  }
  return normalized;
}

function normalizeBarilguud(barilguud) {
  if (!barilguud || !Array.isArray(barilguud)) return;
  barilguud.forEach((barilga) => {
    if (barilga.tokhirgoo && barilga.tokhirgoo.davkhariinToonuud) {
      barilga.tokhirgoo.davkhariinToonuud = normalizeDavkhariinToonuudObject(
        barilga.tokhirgoo.davkhariinToonuud
      );
    }
  });
}

function validateDavkhariinToonuud(barilguud) {
  if (!barilguud || !Array.isArray(barilguud)) {
    return null; // No error
  }

  for (let barilgaIndex = 0; barilgaIndex < barilguud.length; barilgaIndex++) {
    const barilga = barilguud[barilgaIndex];
    if (!barilga.tokhirgoo || !barilga.tokhirgoo.davkhariinToonuud) {
      continue;
    }

    const davkhariinToonuud = barilga.tokhirgoo.davkhariinToonuud;
    const tootMap = new Map();
    for (const [floorKey, tootArray] of Object.entries(davkhariinToonuud)) {
      if (!tootArray || !Array.isArray(tootArray)) {
        continue;
      }

      let orts = "1";
      let davkhar = "";
      if (String(floorKey).includes("::")) {
        const parts = String(floorKey).split("::");
        orts = parts[0] || "1";
        davkhar = parts[1] || parts[0];
      } else {
        davkhar = floorKey;
      }

      let tootList = [];
      if (typeof tootArray[0] === "string" && tootArray[0].includes(",")) {
        tootList = tootArray[0]
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t);
      } else {
        tootList = tootArray.map((t) => String(t).trim()).filter((t) => t);
      }

      for (const toot of tootList) {
        const compositeKey = `${orts}::${toot}`;
        if (tootMap.has(compositeKey)) {
          const existingDavkhar = String(tootMap.get(compositeKey)).trim();
          const currentDavkhar = String(davkhar).trim();

          // Only error if it's a DIFFERENT floor. If it's the same floor, it's just a duplicate entry/format.
          if (existingDavkhar !== currentDavkhar) {
            console.error(
              `❌ [VALIDATION FUNCTION] Duplicate toot found in same orts: "${toot}" in orts ${orts}, davkhar ${existingDavkhar} and ${currentDavkhar}`
            );
            return new Error(
              `Тоот "${toot}" аль хэдийн ${orts}-р орцны ${existingDavkhar}-р давхарт байна. ${orts}-р орцны ${currentDavkhar}-р давхарт давхардсан тоот байж болохгүй!`
            );
          }
          continue;
        }
        tootMap.set(compositeKey, davkhar);
      }
    }
  }
  return null; // No error
}

baiguullagaSchema.pre("updateOne", function (next) {
  try {
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

baiguullagaSchema.pre("findOneAndUpdate", async function (next) {
  try {
    let barilguudToValidate = null;
    
    if (this._update && this._update.$set) {
      const setKeys = Object.keys(this._update.$set);
      const isDavkhariinToonuudUpdate = setKeys.some(
        (key) =>
          key.includes("tokhirgoo.davkhariinToonuud") || key.includes("barilguud")
      );
      if (isDavkhariinToonuudUpdate) {
        console.log(
          `🔍 [TRACE-UPDATE] Triggered for Baiguullaga. Query:`,
          JSON.stringify(this.getQuery())
        );
        console.log(
          `🔍 [TRACE-UPDATE] Update set:`,
          JSON.stringify(this._update.$set)
        );

        const doc = await this.model.findOne(this.getQuery()).lean();
        if (doc && doc.barilguud) {
          const mergedBarilguud = JSON.parse(JSON.stringify(doc.barilguud));

          for (const [path, value] of Object.entries(this._update.$set)) {
            if (path === "barilguud") {
              normalizeBarilguud(value);
              barilguudToValidate = value;
              break;
            } else if (path.startsWith("barilguud.")) {
              const pathParts = path.split(".");
              const barilgaIndex = parseInt(pathParts[1]);

              if (!isNaN(barilgaIndex) && mergedBarilguud[barilgaIndex]) {
                if (
                  pathParts[2] === "tokhirgoo" &&
                  pathParts[3] === "davkhariinToonuud"
                ) {
                  const normalizedValue = normalizeDavkhariinToonuudObject(value);
                  mergedBarilguud[barilgaIndex].tokhirgoo =
                    mergedBarilguud[barilgaIndex].tokhirgoo || {};
                  mergedBarilguud[barilgaIndex].tokhirgoo.davkhariinToonuud =
                    normalizedValue;
                  // Update the actual $set value so it is saved in normalized form
                  this._update.$set[path] = normalizedValue;
                }
              }
            }
          }

          if (!barilguudToValidate) {
            barilguudToValidate = mergedBarilguud;
          }
        }
      }
    } else if (this._update && this._update.barilguud && !this._update.$set) {
      normalizeBarilguud(this._update.barilguud);
      barilguudToValidate = this._update.barilguud;
    } else if (
      this._update &&
      this._update.$set &&
      this._update.$set.barilguud
    ) {
      normalizeBarilguud(this._update.$set.barilguud);
      barilguudToValidate = this._update.$set.barilguud;
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



// Add audit hooks for tracking changes (including tokhirgoo) - after all hooks
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(baiguullagaSchema, "baiguullaga");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("baiguullaga", baiguullagaSchema);
};
