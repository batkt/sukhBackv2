const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const orshinSuugchSchema = new Schema(
  {
    id: String,
    ner: String,
    toot: String, // Keep for backward compatibility
    toots: [
      {
        toot: String, // Door number
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
        ekhniiUldegdel: Number,
        tsahilgaaniiZaalt: Number,
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
  },
  {
    timestamps: true,
  },
);

orshinSuugchSchema.index({ utas: 1 });
orshinSuugchSchema.index({ baiguullagiinId: 1 });
orshinSuugchSchema.index({ "toots.walletUserId": 1 });
orshinSuugchSchema.index({ "toots.toot": 1 });
orshinSuugchSchema.index({ "toots.baiguullagiinId": 1 });

orshinSuugchSchema.index({
  $nevtrekhNer: "text",
  mail: 1,
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

  const OrshinSuugchModel = this.constructor;
  const toCheck = [];

  // Top-level toot
  const toot = this.toot ? String(this.toot).trim() : "";
  const davkhar = this.davkhar ? String(this.davkhar).trim() : "";
  const barilgiinId = this.barilgiinId ? String(this.barilgiinId) : "";
  const baiguullagiinId = this.baiguullagiinId
    ? String(this.baiguullagiinId)
    : "";
  if (toot && (barilgiinId || baiguullagiinId)) {
    toCheck.push({ toot, davkhar, barilgiinId, baiguullagiinId });
  }

  // Each toot in toots array
  if (Array.isArray(this.toots)) {
    for (const t of this.toots) {
      const tToot = t?.toot ? String(t.toot).trim() : "";
      const tDavkhar = t?.davkhar ? String(t.davkhar).trim() : "";
      const tBarilgiinId = t?.barilgiinId ? String(t.barilgiinId) : "";
      const tBaiguullagiinId = t?.baiguullagiinId
        ? String(t.baiguullagiinId)
        : "";
      if (tToot && (tBarilgiinId || tBaiguullagiinId)) {
        toCheck.push({
          toot: tToot,
          davkhar: tDavkhar,
          barilgiinId: tBarilgiinId,
          baiguullagiinId: tBaiguullagiinId,
        });
      }
    }
  }

  for (const {
    toot: t,
    davkhar: d,
    barilgiinId: bId,
    baiguullagiinId: baId,
  } of toCheck) {
    const orConditions = [];
    const baseMatch = { toot: t };
    const baseTootMatch = { toot: t };
    if (d) {
      baseMatch.davkhar = d;
      baseTootMatch.davkhar = d;
    }
    if (bId) {
      orConditions.push({ ...baseMatch, barilgiinId: bId });
      orConditions.push({
        toots: { $elemMatch: { ...baseTootMatch, barilgiinId: bId } },
      });
    } else if (baId) {
      orConditions.push({ ...baseMatch, baiguullagiinId: baId });
      orConditions.push({
        toots: { $elemMatch: { ...baseTootMatch, baiguullagiinId: baId } },
      });
    }
    if (orConditions.length > 0) {
      const query = { $or: orConditions };
      if (this._id) query._id = { $ne: this._id };
      const existing = await OrshinSuugchModel.findOne(query);
      if (existing) {
        return next(
          new Error("Энэ тоот дээр оршин суугч аль хэдийн бүртгэгдсэн байна."),
        );
      }
    }
  }
  next();
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
