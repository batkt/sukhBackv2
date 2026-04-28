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

async function handleZardluudUpdate(doc) {
  try {
    if (!doc) {
      console.log("❌ No document found, exiting");
      return;
    }

    const { db } = require("zevbackv2");
    const Geree = require("./geree");
    const nekhemjlekhiinTuukh = require("./nekhemjlekhiinTuukh");

    const kholbolt = db.kholboltuud.find(
      (a) => a.baiguullagiinId == doc.baiguullagiinId
    );

    if (!kholbolt) return;

    // Filter geree documents by both baiguullagiinId AND barilgiinId
    // This ensures ashiglaltiinZardluud updates only affect the correct barilga
    const gereeQuery = {
      baiguullagiinId: doc.baiguullagiinId,
    };

    // Only filter by barilgiinId if it exists in the doc
    // This maintains backward compatibility for existing data
    if (doc.barilgiinId) {
      gereeQuery.barilgiinId = doc.barilgiinId;
    }

    const gereenuud = await Geree(kholbolt, true).find(gereeQuery);

    for (const geree of gereenuud) {
      if (!geree.zardluud) {
        geree.zardluud = [];
      }

      // First, remove ALL duplicates of this zardal (by ner, turul, zardliinTurul, and barilgiinId)
      // This prevents duplicate entries from being added multiple times
      // Also match by barilgiinId to ensure zardluud from different barilgas are kept separate
      const matchingZardluudIndices = [];
      for (let i = geree.zardluud.length - 1; i >= 0; i--) {
        const z = geree.zardluud[i];
        const matchesNer = z.ner === doc.ner;
        const matchesTurul = z.turul === doc.turul;
        const matchesZardliinTurul = z.zardliinTurul === doc.zardliinTurul;
        const matchesBarilgiinId =
          (!doc.barilgiinId && !z.barilgiinId) ||
          (doc.barilgiinId &&
            z.barilgiinId &&
            String(doc.barilgiinId) === String(z.barilgiinId));

        if (
          matchesNer &&
          matchesTurul &&
          matchesZardliinTurul &&
          matchesBarilgiinId
        ) {
          matchingZardluudIndices.push(i);
        }
      }

      // If we found matches, remove all but keep track for updating
      // If multiple duplicates exist, remove all and add one fresh entry
      if (matchingZardluudIndices.length > 0) {
        // Remove all duplicates (in reverse order to maintain indices)
        for (let i = matchingZardluudIndices.length - 1; i >= 0; i--) {
          geree.zardluud.splice(matchingZardluudIndices[i], 1);
        }
      }

      // Now add/update with the new zardal (only one entry)
      // Include barilgiinId to track which barilga this zardal came from
      const newZardal = {
        ner: doc.ner,
        turul: doc.turul,
        tariff: doc.tariff,
        tariffUsgeer: doc.tariffUsgeer,
        zardliinTurul: doc.zardliinTurul,
        barilgiinId: doc.barilgiinId || "", // Track which barilga this zardal belongs to
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
        // Include electricity-specific fields
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

      // Save the updated geree
      await geree.save();

      // NOTE: Do NOT update existing nekhemjlekhiinTuukh records
      // Once an invoice is created, it should NEVER be modified
    }
  } catch (error) {
    console.error(
      "Error updating geree and nekhemjlekh after ashiglaltiinZardluud update:",
      error
    );
  }
}

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(ashiglaltiinZardluudSchema, "ashiglaltiinZardluud");

ashiglaltiinZardluudSchema.post(
  ["findOneAndDelete", "deleteOne"],
  async function (doc) {
    try {
      if (!doc) return;

      const { db } = require("zevbackv2");
      const Geree = require("./geree");
      const nekhemjlekhiinTuukh = require("./nekhemjlekhiinTuukh");

      const kholbolt = db.kholboltuud.find(
        (a) => a.baiguullagiinId == doc.baiguullagiinId
      );

      if (!kholbolt) return;

      // Filter geree documents by both baiguullagiinId AND barilgiinId
      // This ensures ashiglaltiinZardluud deletions only affect the correct barilga
      const gereeQuery = {
        baiguullagiinId: doc.baiguullagiinId,
      };

      // Only filter by barilgiinId if it exists in the doc
      // This maintains backward compatibility for existing data
      if (doc.barilgiinId) {
        gereeQuery.barilgiinId = doc.barilgiinId;
      }

      const gereenuud = await Geree(kholbolt, true).find(gereeQuery);

      for (const geree of gereenuud) {
        if (!geree.zardluud) {
          geree.zardluud = [];
        }

        geree.zardluud = geree.zardluud.filter(
          (z) =>
            !(
              z.ner === doc.ner &&
              z.turul === doc.turul &&
              z.zardliinTurul === doc.zardliinTurul
            )
        );

        const niitTulbur = geree.zardluud.reduce((sum, zardal) => {
          return sum + (zardal.tariff || 0);
        }, 0);

        geree.niitTulbur = niitTulbur;

        await geree.save();

        // NOTE: Do NOT update existing nekhemjlekhiinTuukh records
        // Once an invoice is created, it should NEVER be modified
      }
    } catch (error) {
      console.error(
        "Error updating geree and nekhemjlekh after ashiglaltiinZardluud deletion:",
        error
      );
    }
  }
);

//module.exports = mongoose.model("ashiglaltiinZardluud", ashiglaltiinZardluudSchema);

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;

  if (conn.models.ashiglaltiinZardluud) {
    return conn.model("ashiglaltiinZardluud");
  }

  return conn.model("ashiglaltiinZardluud", ashiglaltiinZardluudSchema);
};
