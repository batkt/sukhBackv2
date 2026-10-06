const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const orshinSuugchSchema = new Schema(
  {
    id: String,
    ner: String,
    hasCustomName: {
      type: Boolean,
      default: false,
    },
    toot: String, // Keep for backward compatibility
    toots: [
      {
        toot: String, // Door number
        turul: {
          type: String,
          enum: ["Орон сууц", "Гараж", "Агуулах"],
          default: "Орон сууц"
        },
        source: {
          type: String,
          enum: ["WALLET_API", "OWN_ORG"],
          default: "OWN_ORG",
        },
        baiguullagiinId: String, // Required for OWN_ORG
        barilgiinId: String, // Required for OWN_ORG
        davkhar: String,
        orts: String,
        duureg: String,
        horoo: Schema.Types.Mixed,
        soh: String,
        bairniiNer: String,
        ovog: String, // Resident's ovog for this specific address
        ner: String, // Resident's ner for this specific address
        billingId: String, // Added: For identifying billing in Wallet API
        walletUserId: String, // Global Wallet User ID
        walletCustomerId: String, // Added: For multiple wallet accounts
        walletCustomerCode: String, // Added: For multiple wallet accounts
        walletBairId: String, // For WALLET_API source
        walletDoorNo: String, // Keer multiple wallet accounts
        gereeniiId: String,
        linkedAptToot: String,
        ekhniiUldegdel: Number,
        tsahilgaaniiZaalt: Number,
        khonogoorBodokhEsekh: {
          type: Boolean,
          default: false,
        },
        bodokhKhonog: {
          type: Number,
          default: 0,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    ovog: String,
    utas: String,
    currentSessionId: String,
    mail: String,
    tuluv: String,
    davkhar: String, // Keep for backward compatibility
    bairniiNer: String, // Keep for backward compatibility
    tailbar: String,
    taniltsuulgaKharakhEsekh: {
      type: Boolean,
      default: true,
    },
    nuutsUg: {
      type: String,
      select: false,
    },
    baiguullagiinId: String, // Keep for backward compatibility (primary/default)
    baiguullagiinNer: String,
    barilgiinId: String, // Keep for backward compatibility (primary/default)
    erkh: String,
    firebaseToken: String,
    zurgiinId: String,
    nevtrekhNer: String,
    duureg: String, // Keep for backward compatibility
    horoo: String, // Keep for backward compatibility
    soh: String, // Keep for backward compatibility
    orts: String, // Web only field, keep for backward compatibility
    tailbar: String,
    tsahilgaaniiZaalt: Number,
    odorZaalt: Number,
    shonoZaalt: Number,
    suuliinZaalt: Number,
    ekhniiUldegdel: Number,
    khonogoorBodokhEsekh: {
      type: Boolean,
      default: false,
    },
    bodokhKhonog: {
      type: Number,
      default: 0,
    },
    baritsaaniiUldegdel: Number,
    billNicknames: [
      {
        billingId: String,
        nickname: String,
      },
    ],

    // --- Гэр бүлийн гишүүн (sub-account) ---
    // Гишүүн бүр өөрийн утас/нууц үгтэй тусдаа orshinSuugch бичлэг боловч
    // бүх тоот, гэрээ, нэхэмжлэх, төлбөрөө үндсэн эзэмшигчээсээ уншина.
    undsenId: String, // Үндсэн эзэмшигчийн orshinSuugch._id. Үндсэн данс дээр хоосон.
    gishuuniiKholboo: String, // Эхнэр / Нөхөр / Хүү / Охин / Аав / Ээж гэх мэт
    gishuuniiTuluv: {
      type: String,
      enum: ["Хүлээгдэж буй", "Идэвхтэй", "Цуцлагдсан"],
    },
    gishuuniiErkh: {
      type: String,
      enum: ["Харах", "Харах + Төлөх"],
      default: "Харах + Төлөх",
    },
    gishuunUrisenOgnoo: Date,
    gishuunBatalgaajsanOgnoo: Date,

    // --- Тээврийн хэрэгсэл / Машины дугаар ---
    mashiniiDugaar: String,
    dugaar: String,
    mashinuud: [String],
    dugaarUurchilsunOgnoo: Date,
  },
  {
    timestamps: true,
  },
);

orshinSuugchSchema.index({ utas: 1 }, { unique: true, sparse: true });
orshinSuugchSchema.index({ baiguullagiinId: 1 });
orshinSuugchSchema.index({ baiguullagiinId: 1, barilgiinId: 1 });
orshinSuugchSchema.index({ "toots.walletUserId": 1 });
orshinSuugchSchema.index({ "toots.toot": 1 });
orshinSuugchSchema.index({ "toots.baiguullagiinId": 1 });

orshinSuugchSchema.index({ nevtrekhNer: 1 });
orshinSuugchSchema.index({ mail: 1 });
orshinSuugchSchema.index({ undsenId: 1, gishuuniiTuluv: 1 });

// Гишүүн эсэхийг нэг мөрөөр шалгах туслах
orshinSuugchSchema.virtual("gishuunEsekh").get(function () {
  return !!this.undsenId;
});

orshinSuugchSchema.methods.tokenUusgeye = function (
  duusakhOgnoo,
  salbaruud = null,
) {
  const token = jwt.sign(
    {
      id: this._id,
      ner: this.ner,
      baiguullagiinId: this.baiguullagiinId,
      salbaruud: salbaruud,
      duusakhOgnoo: duusakhOgnoo,
      sessionId: this.currentSessionId || null,
      // Гэр бүлийн гишүүн бол өгөгдлөө үндсэн эзэмшигчээс уншина
      undsenId: this.undsenId || null,
      gishuuniiErkh: this.undsenId ? this.gishuuniiErkh || "Харах + Төлөх" : null,
    },
    process.env.APP_SECRET,
    {
      expiresIn:
        this.baiguullagiinId == "68e4e2bff3ff09acb5705a93" ? "7d" : "12h",
    },
  );
  return token;
};

orshinSuugchSchema.methods.khugatsaaguiTokenUusgeye = function () {
  const token = jwt.sign(
    {
      id: this._id,
      ner: this.ner,
      baiguullagiinId: this.baiguullagiinId,
    },
    process.env.APP_SECRET,
    {},
  );
  return token;
};

orshinSuugchSchema.methods.zochinTokenUusgye = function (
  baiguullagiinId,
  gishuunEsekh,
) {
  const token = jwt.sign(
    {
      id: "zochin",
      baiguullagiinId,
    },
    process.env.APP_SECRET,
    gishuunEsekh
      ? {
          expiresIn: "12h",
        }
      : {
          expiresIn: "1h",
        },
  );
  return token;
};

orshinSuugchSchema.pre("save", async function (next) {
  this.indexTalbar = this.nevtrekhNer;

  if (this.nuutsUg && !this.nuutsUg.startsWith("$2b$")) {
    const salt = await bcrypt.genSalt(12);
    this.nuutsUg = await bcrypt.hash(this.nuutsUg, salt);
  }
  if (!this.isNew) return next();

  // Гэр бүлийн гишүүн өөрийн тоот эзэмшдэггүй — үндсэн эзэмшигчийн тоотыг
  // хардаг тул давхардлын шалгуур энд хамаарахгүй.
  if (this.undsenId) return next();

  const OrshinSuugchModel = this.constructor;
  const toCheck = [];

  // Top-level toot
  const toot = this.toot ? String(this.toot).trim() : "";
  const davkhar = this.davkhar ? String(this.davkhar).trim() : "";
  const orts = this.orts ? String(this.orts).trim() : "";
  const barilgiinId = this.barilgiinId ? String(this.barilgiinId) : "";
  const baiguullagiinId = this.baiguullagiinId
    ? String(this.baiguullagiinId)
    : "";
  if (toot && (barilgiinId || baiguullagiinId)) {
    toCheck.push({
      toot,
      davkhar,
      orts,
      barilgiinId,
      baiguullagiinId,
      turul: "Орон сууц",
    });
  }

  // Each toot in toots array
  if (Array.isArray(this.toots)) {
    for (const t of this.toots) {
      const tToot = t?.toot ? String(t.toot).trim() : "";
      const tDavkhar = t?.davkhar ? String(t.davkhar).trim() : "";
      const tOrts = t?.orts ? String(t.orts).trim() : "";
      const tBarilgiinId = t?.barilgiinId ? String(t.barilgiinId) : "";
      const tBaiguullagiinId = t?.baiguullagiinId
        ? String(t.baiguullagiinId)
        : "";
      if (tToot && (tBarilgiinId || tBaiguullagiinId)) {
        toCheck.push({
          toot: tToot,
          davkhar: tDavkhar,
          orts: tOrts,
          barilgiinId: tBarilgiinId,
          baiguullagiinId: tBaiguullagiinId,
          turul: t?.turul || "Орон сууц",
        });
      }
    }
  }

  for (const {
    toot: t,
    davkhar: d,
    orts: o,
    barilgiinId: bId,
    baiguullagiinId: baId,
    turul: tur,
  } of toCheck) {
    const isGarage = tur === "Гараж" || tur === "Зогсоол";
    const isStorage = tur === "Агуулах";
    const isApt = !isGarage && !isStorage;

    const orConditions = [];

    if (bId) {
      if (isApt) {
        // Орон сууц: баримтын ДЭЭД талын toot эсвэл toots[] доторх орон сууцтай л мөргөлдөнө
        const baseMatch = { toot: t, barilgiinId: bId };
        const baseTootMatch = {
          toot: t,
          barilgiinId: bId,
          turul: { $nin: ["Гараж", "Зогсоол", "Агуулах"] },
        };
        if (d) {
          baseMatch.davkhar = d;
          baseTootMatch.davkhar = d;
        }
        if (o) {
          baseMatch.orts = o;
          baseTootMatch.orts = o;
        }
        orConditions.push(baseMatch);
        orConditions.push({ toots: { $elemMatch: baseTootMatch } });
        orConditions.push({
          barilgiinId: bId,
          toots: {
            $elemMatch: {
              toot: t,
              turul: { $nin: ["Гараж", "Зогсоол", "Агуулах"] },
              ...(d ? { davkhar: d } : {}),
              ...(o ? { orts: o } : {}),
            },
          },
        });
      } else if (isGarage) {
        // Гараж: зөвхөн toots[] доторх гараж/зогсоолтой мөргөлдөнө (дээд талын орон сууц, агуулахтай МӨРГӨЛДӨХГҮЙ)
        const garageElem = {
          toot: t,
          barilgiinId: bId,
          turul: { $in: ["Гараж", "Зогсоол"] },
        };
        if (d) garageElem.davkhar = d;
        orConditions.push({ toots: { $elemMatch: garageElem } });
        orConditions.push({
          barilgiinId: bId,
          toots: {
            $elemMatch: {
              toot: t,
              turul: { $in: ["Гараж", "Зогсоол"] },
              ...(d ? { davkhar: d } : {}),
            },
          },
        });
      } else if (isStorage) {
        // Агуулах: зөвхөн toots[] доторх агуулахтай мөргөлдөнө (орон сууц, гаражтай МӨРГӨЛДӨХГҮЙ)
        const storageElem = {
          toot: t,
          barilgiinId: bId,
          turul: "Агуулах",
        };
        if (d) storageElem.davkhar = d;
        orConditions.push({ toots: { $elemMatch: storageElem } });
        orConditions.push({
          barilgiinId: bId,
          toots: {
            $elemMatch: {
              toot: t,
              turul: "Агуулах",
              ...(d ? { davkhar: d } : {}),
            },
          },
        });
      }
    }
    if (orConditions.length > 0) {
      const query = { $or: orConditions };
      if (this._id) query._id = { $ne: this._id };
      const existing = await OrshinSuugchModel.findOne(query);
      if (existing) {
        const ezen = [existing.ovog, existing.ner].filter(Boolean).join(" ");
        return next(
          new Error(
            `${tur || "Орон сууц"} «${t}» дээр` +
              `${ezen ? ` «${ezen}»` : ""}` +
              `${existing.utas ? ` (утас ${existing.utas})` : ""}` +
              ` аль хэдийн бүртгэгдсэн байна.`,
          ),
        );
      }
    }
  }
  next();
});

// PUT /orshinSuugch/:id нь findByIdAndUpdate ашигладаг — өмнө нь зөвхөн
// updateOne дээр hash хийдэг тул нууц үг ил хадгалагдаж, нэвтрэх боломжгүй болдог байв.
orshinSuugchSchema.pre("findOneAndUpdate", async function () {
  const u = this._update || {};
  const target = u.$set && u.$set.nuutsUg !== undefined ? u.$set : u;
  if (typeof target.nuutsUg === "string" && target.nuutsUg && !target.nuutsUg.startsWith("$2b$")) {
    const salt = await bcrypt.genSalt(12);
    target.nuutsUg = await bcrypt.hash(target.nuutsUg, salt);
  }
});

orshinSuugchSchema.pre("updateOne", async function () {
  this.indexTalbar = this._update.nevtrekhNer;

  if (this._update.nuutsUg && !this._update.nuutsUg.startsWith("$2b$")) {
    const salt = await bcrypt.genSalt(12);
    this._update.nuutsUg = await bcrypt.hash(this._update.nuutsUg, salt);
  }
});

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(orshinSuugchSchema, "orshinSuugch");

orshinSuugchSchema.methods.passwordShalgaya = async function (pass) {
  return await bcrypt.compare(pass, this.nuutsUg);
};

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("orshinSuugch", orshinSuugchSchema);
};
