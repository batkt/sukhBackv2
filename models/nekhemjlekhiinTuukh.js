const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const nekhemjlekhiinTuukhSchema = new Schema(
  {
    baiguullagiinNer: String,
    baiguullagiinUtas: String,
    baiguullagiinKhayag: String,
    baiguullagiinId: String,
    barilgiinId: String,
    ovog: String,
    ner: String,
    register: String,
    utas: [String],
    khayag: String,
    gereeniiOgnoo: Date,
    turul: String,
    gereeniiId: String,
    gereeniiDugaar: String,
    ekhniiUldegdel: Number,
    ekhniiUldegdelUsgeer: String,
    /** Tracks FIFO ekhnii paid on this invoice — only for idempotent orshinSuugch sync (geree is not decremented here). */
    ekhniiAppliedToOrshinSuugchDun: { type: Number, default: 0 },
    davkhar: String,
    uldegdel: Number,
    daraagiinTulukhOgnoo: Date,
    dansniiDugaar: String,
    gereeniiZagvariinId: String,
    tulukhUdur: [String],
    ognoo: Date,
    mailKhayagTo: String,
    maililgeesenAjiltniiNer: String,
    maililgeesenAjiltniiId: String,
    nekhemjlekhiinZagvarId: String,
    medeelel: mongoose.Schema.Types.Mixed,
    nekhemjlekh: String,
    zagvariinNer: String,
    content: String,
    nekhemjlekhiinDans: String,
    nekhemjlekhiinDansniiNer: String,
    nekhemjlekhiinBank: String,
    nekhemjlekhiinIbanDugaar: String,
    nekhemjlekhiinOgnoo: Date,
    nekhemjlekhiinDugaar: String, // Unique invoice number
    dugaalaltDugaar: Number,
    niitTulbur: Number,
    niitTulburOriginal: Number, // Stores the original total before any payments
    tuluv: {
      type: String,
      enum: ["Төлөөгүй", "Төлсөн", "Хугацаа хэтэрсэн", "Хэсэгчлэн төлсөн"],
      default: "Төлөөгүй",
    },
    qpayPaymentId: String,
    qpayInvoiceId: String,
    qpayUrl: String,
    tulukhOgnoo: Date,
    tulsunOgnoo: Date,
    paymentHistory: [
      {
        ognoo: Date,
        dun: Number,
        turul: String, // "qpay", "bank", "cash"
        guilgeeniiId: String,
        tailbar: String,
      },
    ],
    orts: String, // Web only field
    tsahilgaanNekhemjlekh: Number, // Electricity invoice amount (calculated from zaalt readings)
    tailbar: String,
  },
  {
    timestamps: true,
  },
);

nekhemjlekhiinTuukhSchema.virtual("canPay").get(function () {
  return this.tuluv !== "Төлсөн";
});

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(nekhemjlekhiinTuukhSchema, "nekhemjlekhiinTuukh");

nekhemjlekhiinTuukhSchema.methods.checkOverdue = function () {
  const today = new Date();
  if (this.tulukhOgnoo && today > this.tulukhOgnoo && this.tuluv !== "Төлсөн") {
    this.tuluv = "Хугацаа хэтэрсэн";
    return true;
  }
  return false;
};

nekhemjlekhiinTuukhSchema.set("toJSON", { virtuals: true });

// Add unique index on nekhemjlekhiinDugaar
nekhemjlekhiinTuukhSchema.index(
  { nekhemjlekhiinDugaar: 1 },
  { unique: true, sparse: true },
);

// Match invoiceSendService / historyLedger — some invoices use trailing spaces or longer labels.
function isEkhniiUldegdelZardal(z) {
  return (
    !!z &&
    (z.isEkhniiUldegdel === true ||
      z.ner === "Эхний үлдэгдэл" ||
      (typeof z.ner === "string" && z.ner.includes("Эхний үлдэгдэл")))
  );
}

function expandPhoneVariantsForOrshin(phones) {
  const out = new Set();
  for (const raw of phones || []) {
    const p = String(raw || "").trim();
    if (!p) continue;
    out.add(p);
    const digits = p.replace(/\D/g, "");
    if (digits.length >= 8) {
      const last8 = digits.slice(-8);
      out.add(last8);
      out.add(`976${last8}`);
      out.add(`+976${last8}`);
    }
  }
  return [...out];
}

// Ensure tuluv and uldegdel always stay consistent with payments
nekhemjlekhiinTuukhSchema.pre("save", function (next) {
  try {
    const invoice = this;

    const recordContractEkhniiSyncDeltaOnly = () => {
      const zardluud = invoice.medeelel?.zardluud;
      if (!Array.isArray(zardluud)) return;
      const ekhniiIdx = zardluud.findIndex((z) => isEkhniiUldegdelZardal(z));
      if (ekhniiIdx === -1) return;
      const ekhniiRow = zardluud[ekhniiIdx];

      const t =
        typeof ekhniiRow.tulukhDun === "number" ? ekhniiRow.tulukhDun : null;
      const d = ekhniiRow.dun != null ? Number(ekhniiRow.dun) : null;
      const tariff = ekhniiRow.tariff != null ? Number(ekhniiRow.tariff) : 0;
      const ekhniiOriginal =
        t != null && t > 0 ? t : d != null && d > 0 ? d : tariff;
      if (!Number.isFinite(ekhniiOriginal) || ekhniiOriginal <= 0.01) return;

      const totalPaid =
        Math.round(
          (invoice.paymentHistory || []).reduce((sum, p) => {
            if (p && p.turul === "system_sync") return sum;
            return sum + (Number(p?.dun) || 0);
          }, 0) * 100,
        ) / 100;

      const paidTowardEkhnii =
        Math.round(Math.min(totalPaid, ekhniiOriginal) * 100) / 100;

      const prevApplied =
        Math.round(
          (Number(invoice.ekhniiAppliedToOrshinSuugchDun) || 0) * 100,
        ) / 100;
      const delta = Math.round((paidTowardEkhnii - prevApplied) * 100) / 100;
      if (!invoice.$locals || typeof invoice.$locals !== "object") {
        invoice.$locals = {};
      }
      if (delta > 0.01) {
        invoice.ekhniiAppliedToOrshinSuugchDun = paidTowardEkhnii;
        invoice.$locals.pendingOrshinEkhniiDelta = delta;
      } else {
        invoice.$locals.pendingOrshinEkhniiDelta = 0;
      }
    };

    // If tuluv was explicitly set by manualSendInvoice or payment logic, skip recalculation
    // The caller already set niitTulbur, uldegdel, and tuluv correctly
    if (invoice._skipTuluvRecalc) {
      delete invoice._skipTuluvRecalc;
      recordContractEkhniiSyncDeltaOnly();
      return next();
    }

    if (typeof invoice.niitTulbur === "number") {
      // Always round niitTulbur to 2dp to clean up any float arithmetic artifacts
      // e.g. 113284.80000000005 → 113284.80,  5.82e-11 → 0
      invoice.niitTulbur = Math.round(invoice.niitTulbur * 100) / 100;

      // If we don't have original total yet, set it now from initial niitTulbur (already rounded)
      if (typeof invoice.niitTulburOriginal !== "number") {
        invoice.niitTulburOriginal = invoice.niitTulbur;
      } else {
        // Round existing original too (in case it was stored with float artifacts)
        invoice.niitTulburOriginal =
          Math.round(invoice.niitTulburOriginal * 100) / 100;
      }

      const totalPaidHistory =
        Math.round(
          (invoice.paymentHistory || []).reduce((sum, p) => {
            if (p && p.turul === "system_sync") return sum;
            return sum + (p?.dun || 0);
          }, 0) * 100,
        ) / 100;

      const totalPaidGuilgee =
        Math.round(
          (invoice.medeelel?.guilgeenuud || []).reduce((sum, g) => {
            return sum + (Number(g?.tulsunDun || g?.dun) || 0);
          }, 0) * 100,
        ) / 100;

      const totalPaid = Math.max(totalPaidHistory, totalPaidGuilgee);

      // remaining = originalTotal - paid, rounded to 2dp
      const remaining =
        Math.round(Math.max(0, invoice.niitTulburOriginal - totalPaid) * 100) /
        100;

      invoice.uldegdel = remaining;

      if (remaining <= 0.01) {
        invoice.niitTulbur = 0;
        invoice.uldegdel = 0;
        invoice.tuluv = "Төлсөн";
      } else {
        invoice.niitTulbur = remaining;
        if (invoice.tuluv === "Хугацаа хэтэрсэн") {
          invoice.tuluv = "Хугацаа хэтэрсэн";
        } else {
          invoice.tuluv = "Төлөөгүй";
        }
      }
    }

    recordContractEkhniiSyncDeltaOnly();

    next();
  } catch (err) {
    next(err);
  }
});

function orshinMatchesGereeUtas(osDoc, uniqPhones) {
  if (!uniqPhones.length) return true;
  const u = String(osDoc?.utas || "").trim();
  const n = String(osDoc?.nevtrekhNer || "").trim();
  const last8 = (s) => {
    const d = String(s || "").replace(/\D/g, "");
    return d.length >= 8 ? d.slice(-8) : d;
  };
  const u8 = last8(u);
  const n8 = last8(n);
  return uniqPhones.some((p) => {
    const pTrim = String(p || "").trim();
    if (pTrim === u || pTrim === n) return true;
    const p8 = last8(pTrim);
    if (p8.length === 8 && (p8 === u8 || p8 === n8)) return true;
    return false;
  });
}

// After save: decrement orshinSuugch.ekhniiUldegdel only (erunkhiiKholbolt) — not geree / not invoice zardluud.
// Idempotent via ekhniiAppliedToOrshinSuugchDun on the invoice.
nekhemjlekhiinTuukhSchema.post("save", async function (doc) {
  const delta = Number(doc.$locals?.pendingOrshinEkhniiDelta) || 0;
  if (doc.$locals && "pendingOrshinEkhniiDelta" in doc.$locals) {
    delete doc.$locals.pendingOrshinEkhniiDelta;
  }
  if (!delta || delta <= 0.01) return;
  if (!doc.gereeniiId || !doc.baiguullagiinId) return;

  try {
    const { db } = require("zevbackv2");
    const Geree = require("./geree");
    const OrshinSuugch = require("./orshinSuugch");

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(doc.baiguullagiinId),
    );
    if (!kholbolt) return;

    const gereeLean = await Geree(kholbolt)
      .findById(doc.gereeniiId)
      .select("orshinSuugchId utas barilgiinId baiguullagiinId")
      .lean();
    if (!gereeLean) return;

    const uniqPhones = expandPhoneVariantsForOrshin([
      ...new Set(
        [
          ...(gereeLean.utas || []),
          ...((doc.utas && Array.isArray(doc.utas) && doc.utas) || []),
        ]
          .map((x) => String(x || "").trim())
          .filter(Boolean),
      ),
    ]);

    // orshinSuugch documents live on the central connection (erunkhiiKholbolt), not the
    // per-org tenant DB where geree / nekhemjlekhiinTuukh are stored — same as walletController, excel, qpayRoute.
    const centralConn = db.erunkhiiKholbolt;
    const OrshinOnCentral = centralConn ? OrshinSuugch(centralConn) : null;
    if (!OrshinOnCentral) {
      console.error(
        "[nekhemjlekhiinTuukh] erunkhiiKholbolt missing; orshinSuugch ekhniiUldegdel not synced",
      );
      return;
    }

    const applyOrshinEkhniiDecrement = async (osId) => {
      if (!osId) return false;
      const osLean = await OrshinOnCentral.findById(osId)
        .select("ekhniiUldegdel")
        .lean();
      if (!osLean?._id) return false;
      const curOs = Number(osLean.ekhniiUldegdel) || 0;
      const nextOs = Math.round(Math.max(0, curOs - delta) * 100) / 100;
      const updated = await OrshinOnCentral.findByIdAndUpdate(osLean._id, {
        $set: { ekhniiUldegdel: nextOs },
      });
      return !!updated;
    };

    // Primary: geree.orshinSuugchId is authoritative — do not require phone match.
    let orshinSynced = false;
    if (gereeLean.orshinSuugchId) {
      orshinSynced = await applyOrshinEkhniiDecrement(gereeLean.orshinSuugchId);
    }

    // Fallback: missing/wrong id — resolve by org + phone (+ optional building)
    if (!orshinSynced && uniqPhones.length) {
      const orgId = String(gereeLean.baiguullagiinId || doc.baiguullagiinId);
      const baseQ = {
        baiguullagiinId: orgId,
        $or: [
          { utas: { $in: uniqPhones } },
          { nevtrekhNer: { $in: uniqPhones } },
        ],
      };
      const barilgiinCandidates = [gereeLean.barilgiinId, doc.barilgiinId]
        .map((x) => (x != null ? String(x).trim() : ""))
        .filter(Boolean);
      let osLean = null;
      const tried = new Set();
      for (const bid of barilgiinCandidates) {
        if (tried.has(bid)) continue;
        tried.add(bid);
        const found = await OrshinOnCentral.findOne({
          ...baseQ,
          barilgiinId: bid,
        })
          .select("_id ekhniiUldegdel utas nevtrekhNer")
          .lean();
        if (found && orshinMatchesGereeUtas(found, uniqPhones)) {
          osLean = found;
          break;
        }
      }
      if (!osLean) {
        const found = await OrshinOnCentral.findOne(baseQ)
          .select("_id ekhniiUldegdel utas nevtrekhNer")
          .lean();
        if (found && orshinMatchesGereeUtas(found, uniqPhones)) {
          osLean = found;
        }
      }
      if (osLean?._id) {
        await applyOrshinEkhniiDecrement(osLean._id);
      }
    }
  } catch (e) {
    console.error(
      "[nekhemjlekhiinTuukh] orshinSuugch ekhniiUldegdel sync failed:",
      e.message,
    );
  }
});

// Post-query hooks to populate zardal based on tailbar
nekhemjlekhiinTuukhSchema.post("find", async function (docs) {
  if (!docs || docs.length === 0) return;

  try {
    const { db } = require("zevbackv2");
    const AshiglaltiinZardluud = require("./ashiglaltiinZardluud");

    // Get unique tailbar values and baiguullagiinId from docs
    const tailbarMap = new Map();
    docs.forEach((doc) => {
      if (doc.tailbar && doc.baiguullagiinId) {
        const key = `${doc.baiguullagiinId}|${doc.tailbar}`;
        if (!tailbarMap.has(key)) {
          tailbarMap.set(key, {
            baiguullagiinId: doc.baiguullagiinId,
            tailbar: doc.tailbar,
            barilgiinId: doc.barilgiinId,
          });
        }
      }
    });

    // Fetch all matching zardluud
    for (const [key, { baiguullagiinId, tailbar, barilgiinId }] of tailbarMap) {
      const kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
      );

      if (kholbolt) {
        const query = {
          baiguullagiinId: String(baiguullagiinId),
          tailbar: tailbar,
        };

        if (barilgiinId) {
          query.barilgiinId = String(barilgiinId);
        }

        const zardluud = await AshiglaltiinZardluud(kholbolt)
          .find(query)
          .lean();

        // Attach zardluud to matching docs
        docs.forEach((doc) => {
          if (
            doc.tailbar === tailbar &&
            String(doc.baiguullagiinId) === String(baiguullagiinId) &&
            (!barilgiinId || String(doc.barilgiinId) === String(barilgiinId))
          ) {
            doc.zardal = zardluud;
          }
        });
      }
    }
  } catch (error) {
    console.error("Error populating zardal in nekhemjlekhiinTuukh:", error);
  }
});

nekhemjlekhiinTuukhSchema.post("findOne", async function (doc) {
  if (!doc || !doc.tailbar || !doc.baiguullagiinId) return;

  try {
    const { db } = require("zevbackv2");
    const AshiglaltiinZardluud = require("./ashiglaltiinZardluud");

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(doc.baiguullagiinId),
    );

    if (kholbolt) {
      const query = {
        baiguullagiinId: String(doc.baiguullagiinId),
        tailbar: doc.tailbar,
      };

      if (doc.barilgiinId) {
        query.barilgiinId = String(doc.barilgiinId);
      }

      const zardluud = await AshiglaltiinZardluud(kholbolt).find(query).lean();

      doc.zardal = zardluud;
    }
  } catch (error) {
    console.error("Error populating zardal in nekhemjlekhiinTuukh:", error);
  }
});
// Update global balance on deletion and cascade delete related avlaga records
// This covers both doc.deleteOne() and Query.deleteOne() / Query.findOneAndDelete()
const { runDeleteSideEffects } = require("../services/invoiceDeletionService");

const handleBalanceOnDelete = async function (doc) {
  await runDeleteSideEffects(doc);
};

nekhemjlekhiinTuukhSchema.pre(
  "deleteOne",
  { document: true, query: true },
  async function () {
    if (this instanceof mongoose.Document) {
      await handleBalanceOnDelete(this);
    } else {
      const doc = await this.model.findOne(this.getQuery());
      await handleBalanceOnDelete(doc);
    }
  },
);

nekhemjlekhiinTuukhSchema.pre("findOneAndDelete", async function () {
  const doc = await this.model.findOne(this.getQuery());
  await handleBalanceOnDelete(doc);
});

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("nekhemjlekhiinTuukh", nekhemjlekhiinTuukhSchema);
};
