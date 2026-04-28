const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ajiltanSchema = new Schema(
  {
    id: String,
    ner: String,
    ovog: String,
    utas: String,
    mail: String,
    nuutsUg: {
      type: String,
      select: false,
    },
    register: String,
    tsonkhniiErkhuud: [String],
    barilguud: [String],
    zogsoolKhaalga: [String],
    tuukh: [
      {
        barilgiinId: String,
        ekhelsenOgnoo: Date,
        duussanOgnoo: Date,
      },
    ],
    khayag: String,
    ajildOrsonOgnoo: Date,
    baiguullagiinId: String,
    baiguullagiinNer: String,
    erkh: String,
    firebaseToken: String,
    zurgiinId: String,
    nevtrekhNer: String,
    albanTushaal: String,

    tokhirgoo: {
      gereeKharakhErkh: [String], //barilgiin id-nuud
      gereeZasakhErkh: [String],
      gereeSungakhErkh: [String],
      gereeSergeekhErkh: [String],
      gereeTsutslakhErkh: [String],
      umkhunSaraarKhungulultEsekh: [String],
      guilgeeUstgakhErkh: [String],
      guilgeeKhiikhEsekh: [String],
      aldangiinUldegdelZasakhEsekh: [String],
    },
  },
  {
    timestamps: true,
  }
);

ajiltanSchema.index({
  $nevtrekhNer: "text",
  mail: 1,
});

ajiltanSchema.methods.tokenUusgeye = function (duusakhOgnoo, salbaruud = null) {
  const token = jwt.sign(
    {
      id: this._id,
      ner: this.ner,
      baiguullagiinId: this.baiguullagiinId,
      salbaruud: salbaruud,
      duusakhOgnoo: duusakhOgnoo,
    },
    process.env.APP_SECRET,
    {
      expiresIn:
        this.baiguullagiinId == "68ecac3c72ca957270336159" ? "7d" : "12h",
    }
  );
  return token;
};

ajiltanSchema.methods.khugatsaaguiTokenUusgeye = function () {
  const token = jwt.sign(
    {
      id: this._id,
      ner: this.ner,
      baiguullagiinId: this.baiguullagiinId,
    },
    process.env.APP_SECRET,
    {}
  );
  return token;
};

ajiltanSchema.methods.zochinTokenUusgye = function (
  baiguullagiinId,
  gishuunEsekh
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
        }
  );
  return token;
};
ajiltanSchema.pre("save", async function () {
  this.indexTalbar = this.register + this.nevtrekhNer;
  // Only hash if password is provided and not already hashed
  if (this.nuutsUg && !/^\$2[aby]\$\d+\$/.test(this.nuutsUg)) {
    const salt = await bcrypt.genSalt(12);
    this.nuutsUg = await bcrypt.hash(this.nuutsUg, salt);
  }
});

ajiltanSchema.pre("updateOne", async function () {
  this.indexTalbar = this._update.register + this._update.nevtrekhNer;
  // Only hash if password is provided and not already hashed
  if (this._update.nuutsUg && !/^\$2[aby]\$\d+\$/.test(this._update.nuutsUg)) {
    const salt = await bcrypt.genSalt(12);
    this._update.nuutsUg = await bcrypt.hash(this._update.nuutsUg, salt);
  }
  
  // Store old document for audit logging
  if (!this._oldDoc) {
    try {
      this._oldDoc = await this.model.findOne(this.getQuery()).lean();
    } catch (err) {
      // Ignore errors
    }
  }
});

// Pre-update hook to capture old document
ajiltanSchema.pre("findOneAndUpdate", async function () {
  if (!this._oldDoc) {
    try {
      this._oldDoc = await this.model.findOne(this.getQuery()).lean();
    } catch (err) {
      // Ignore errors
    }
  }
});

// Post-update hook for audit logging
ajiltanSchema.post("findOneAndUpdate", async function (doc) {
  if (doc && this._oldDoc) {
    try {
      const { logEdit } = require("../services/auditService");
      const { getCurrentRequest } = require("../middleware/requestContext");
      const { db } = require("zevbackv2");
      
      const req = getCurrentRequest();
      if (req) {
        await logEdit(
          req,
          db,
          "ajiltan",
          doc._id.toString(),
          this._oldDoc,
          doc.toObject ? doc.toObject() : doc,
          { barilgiinId: doc.barilgiinId }
        );
      }
    } catch (err) {
      console.error("❌ [AUDIT] Error logging ajiltan edit:", err.message);
    }
  }
});

// Post-delete hook for audit logging
ajiltanSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    try {
      const { logDelete } = require("../services/auditService");
      const { getCurrentRequest } = require("../middleware/requestContext");
      const { db } = require("zevbackv2");
      
      const req = getCurrentRequest();
      if (req) {
        await logDelete(
          req,
          db,
          "ajiltan",
          doc._id.toString(),
          doc.toObject ? doc.toObject() : doc,
          "hard",
          null,
          { barilgiinId: doc.barilgiinId }
        );
      }
    } catch (err) {
      console.error("❌ [AUDIT] Error logging ajiltan delete:", err.message);
    }
  }
});

ajiltanSchema.methods.passwordShalgaya = async function (pass) {
  console.log("Энэ рүү орлоо");
  
  if (!this.nuutsUg) {
    return false;
  }
  
  if (!pass) {
    return false;
  }
  
  // Convert to string and trim to handle any whitespace issues
  const inputPassword = String(pass).trim();
  const storedPassword = String(this.nuutsUg).trim();
  
  // Check if the stored password is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
  const isHashed = /^\$2[aby]\$\d+\$/.test(storedPassword);
  
  if (isHashed) {
    // Password is hashed, use bcrypt.compare
    try {
      const result = await bcrypt.compare(inputPassword, storedPassword);
      return result;
    } catch (error) {
      return false;
    }
  } else {
    // Password is plain text (for backward compatibility), compare directly
    const match = inputPassword === storedPassword;
    
    if (match) {
      // Hash the password and save it for future logins
      try {
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(inputPassword, salt);
        this.nuutsUg = hashedPassword;
        await this.save({ validateBeforeSave: false });
        return true;
      } catch (error) {
        // Still return true since the password matched
        return true;
      }
    }
    return false;
  }
};

const syncPhonesToGeree = async function (doc) {
  try {
    if (!doc || !doc.baiguullagiinId || !doc.barilguud || doc.barilguud.length === 0) return;

    let db;
    try {
      db = require("zevbackv2").db;
    } catch (e) {
      return;
    }

    if (!db || !db.kholboltuud) return;

    const kholbolt = db.kholboltuud.find(k => k.baiguullagiinId == doc.baiguullagiinId);
    if (!kholbolt) {
      return;
    }

    const GereeModel = require("./geree")(kholbolt);
    
    const AjiltanModel = doc.constructor;

    for (const buildingId of doc.barilguud) {
      const employees = await AjiltanModel.find({
        baiguullagiinId: doc.baiguullagiinId,
        barilguud: buildingId
      }).select('utas');

      const phoneNumbers = [...new Set(
        employees
          .map(e => e.utas)
          .filter(p => p && p.trim().length > 0)
      )];

      // Update all contracts in this building
      await GereeModel.updateMany(
         { barilgiinId: buildingId },
         { $set: { suhUtas: phoneNumbers } }
      );
    }
  } catch (error) {
    // Silently handle errors
  }
};

ajiltanSchema.post('save', syncPhonesToGeree);
ajiltanSchema.post('findOneAndUpdate', syncPhonesToGeree);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("ajiltan", ajiltanSchema);
};
