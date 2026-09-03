const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ashiglaltiinZardluudSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    ner: String,
    turul: String,
    bodokhArga: String, //togtmol tomyotoi baidag arguud
    tseverUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
    bokhirUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
    usKhalaasniiDun: Number, // xaluun us ued xatuu bodno
    tsakhilgaanUrjver: Number, //tsakhilgaanii coefficent
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
    zaaltTariffTiers: [
      {
        threshold: Number, // Usage threshold (кВт) - e.g., 175, 256
        tariff: Number, // Tariff rate for this tier (Төг/кВт.цаг) - e.g., 175, 256, 285
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Helper function to check if two zardals match (flexible case & whitespace)
function isSameZardal(z1, z2) {
  if (!z1 || !z2) return false;
  const ner1 = String(z1.ner || "").trim().toLowerCase();
  const ner2 = String(z2.ner || "").trim().toLowerCase();
  if (!ner1 || !ner2 || ner1 !== ner2) return false;

  const turul1 = String(z1.turul || "").trim().toLowerCase();
  const turul2 = String(z2.turul || "").trim().toLowerCase();
  if (turul1 && turul2 && turul1 !== turul2) return false;

  return true;
}

// Pre-deletion hook: Store document before query execution so we never lose it in post hook
ashiglaltiinZardluudSchema.pre(
  ["findOneAndDelete", "deleteOne", "findOneAndRemove", "deleteMany"],
  async function () {
    try {
      this._docToDelete = await this.model.findOne(this.getQuery()).lean();
    } catch (_) {}
  }
);

ashiglaltiinZardluudSchema.post("save", async function (doc) {
  await handleZardluudUpdate(doc);
});

ashiglaltiinZardluudSchema.post("findOneAndUpdate", async function (result) {
  if (result) {
    await handleZardluudUpdate(result);
  }
});

ashiglaltiinZardluudSchema.post("updateOne", async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    await handleZardluudUpdate(doc);
  }
});

ashiglaltiinZardluudSchema.post(
  ["findOneAndDelete", "deleteOne", "findOneAndRemove", "deleteMany"],
  async function (resDoc) {
    try {
      const doc = resDoc || this._docToDelete;
      if (!doc) return;
      await handleZardluudDelete(doc);
    } catch (err) {
      console.error("Error in post-delete hook for ashiglaltiinZardluud:", err);
    }
  }
);

async function handleZardluudUpdate(doc) {
  try {
    if (!doc || !doc.baiguullagiinId) {
      return;
    }

    const { db } = require("zevbackv2");
    const Geree = require("./geree");

    const kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(doc.baiguullagiinId)
    );

    if (!kholbolt) return;

    // Build flexible geree query for organization & building
    const gereeQuery = {
      baiguullagiinId: String(doc.baiguullagiinId),
    };

    if (doc.barilgiinId) {
      const bIdStr = String(doc.barilgiinId);
      gereeQuery.$or = [
        { barilgiinId: bIdStr },
        { barilgiinId: doc.barilgiinId },
        { barilgiinId: { $exists: false } },
        { barilgiinId: null },
        { barilgiinId: "" },
      ];
    }

    const gereenuud = await Geree(kholbolt, true).find(gereeQuery);

    for (const geree of gereenuud) {
      if (!geree.zardluud) {
        geree.zardluud = [];
      }

      // Remove any pre-existing entry with matching name/turul
      geree.zardluud = geree.zardluud.filter((z) => !isSameZardal(z, doc));

      // Construct fresh zardal entry
      const newZardal = {
        ner: doc.ner,
        turul: doc.turul,
        tariff: doc.tariff || 0,
        tariffUsgeer: doc.tariffUsgeer || "",
        zardliinTurul: doc.zardliinTurul || "Энгийн",
        barilgiinId: doc.barilgiinId || "",
        tulukhDun: 0,
        dun: doc.dun || 0,
        bodokhArga: doc.bodokhArga || "",
        tseverUsDun: doc.tseverUsDun || 0,
        bokhirUsDun: doc.bokhirUsDun || 0,
        usKhalaasniiDun: doc.usKhalaasniiDun || 0,
        tsakhilgaanUrjver: doc.tsakhilgaanUrjver || 1,
        tsakhilgaanChadal: doc.tsakhilgaanChadal || 0,
        tsakhilgaanDemjikh: doc.tsakhilgaanDemjikh || 0,
        tailbar: doc.tailbar || "",
        suuriKhuraamj: doc.suuriKhuraamj || 0,
        nuatNemekhEsekh: doc.nuatNemekhEsekh || false,
        ognoonuud: doc.ognoonuud || [],
        zaalt: doc.zaalt || false,
        zaaltTariff: doc.zaaltTariff || 0,
        zaaltDefaultDun: doc.zaaltDefaultDun || 0,
        zaaltTariffTiers: doc.zaaltTariffTiers || [],
      };

      geree.zardluud.push(newZardal);

      const niitTulbur = geree.zardluud.reduce((sum, zardal) => {
        return sum + (zardal.tariff || 0);
      }, 0);

      geree.niitTulbur = niitTulbur;
      await geree.save();
    }
  } catch (error) {
    console.error(
      "Error updating geree after ashiglaltiinZardluud update:",
      error
    );
  }
}

async function handleZardluudDelete(doc) {
  try {
    if (!doc || !doc.baiguullagiinId) return;

    const { db } = require("zevbackv2");
    const Geree = require("./geree");

    const kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(doc.baiguullagiinId)
    );

    if (!kholbolt) return;

    const gereeQuery = {
      baiguullagiinId: String(doc.baiguullagiinId),
    };

    if (doc.barilgiinId) {
      const bIdStr = String(doc.barilgiinId);
      gereeQuery.$or = [
        { barilgiinId: bIdStr },
        { barilgiinId: doc.barilgiinId },
        { barilgiinId: { $exists: false } },
        { barilgiinId: null },
        { barilgiinId: "" },
      ];
    }

    const gereenuud = await Geree(kholbolt, true).find(gereeQuery);

    for (const geree of gereenuud) {
      if (!geree.zardluud || geree.zardluud.length === 0) continue;

      const initialLength = geree.zardluud.length;
      geree.zardluud = geree.zardluud.filter((z) => !isSameZardal(z, doc));

      if (geree.zardluud.length !== initialLength) {
        const niitTulbur = geree.zardluud.reduce((sum, zardal) => {
          return sum + (zardal.tariff || 0);
        }, 0);

        geree.niitTulbur = niitTulbur;
        await geree.save();
      }
    }
  } catch (error) {
    console.error(
      "Error updating geree after ashiglaltiinZardluud deletion:",
      error
    );
  }
}

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(ashiglaltiinZardluudSchema, "ashiglaltiinZardluud");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;

  if (conn.models.ashiglaltiinZardluud) {
    return conn.model("ashiglaltiinZardluud");
  }

  return conn.model("ashiglaltiinZardluud", ashiglaltiinZardluudSchema);
};
