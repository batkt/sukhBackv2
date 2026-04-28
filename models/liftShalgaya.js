const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const liftShalgayaSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    choloolugdokhDavkhar: [String],
  },
  { timestamps: true }
);

// NOTE: Unique index temporarily removed to allow cleanup of existing duplicates
// After running scripts/cleanupLiftShalgayaDuplicates.js, uncomment the index below:
liftShalgayaSchema.index(
  { baiguullagiinId: 1, barilgiinId: 1 },
  { unique: true, sparse: true }
);

// Post-save hook to sync liftShalgaya back to baiguullaga.barilguud[].tokhirgoo.liftShalgaya
liftShalgayaSchema.post("save", async function (doc) {
  try {
    if (!doc.baiguullagiinId || !doc.barilgiinId) {
      return;
    }

    const { db } = require("zevbackv2");
    const Baiguullaga = require("./baiguullaga");

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      doc.baiguullagiinId
    );

    if (!baiguullaga) {
      console.error("⚠️ [LIFTSHALGAYA HOOK] Baiguullaga not found:", doc.baiguullagiinId);
      return;
    }

    const barilgaIndex = baiguullaga.barilguud.findIndex(
      (b) => String(b._id) === String(doc.barilgiinId)
    );

    if (barilgaIndex >= 0) {
      const BaiguullagaModel = Baiguullaga(db.erunkhiiKholbolt);
      const baiguullagaObjectId = mongoose.Types.ObjectId.isValid(doc.baiguullagiinId) 
        ? new mongoose.Types.ObjectId(doc.baiguullagiinId)
        : doc.baiguullagiinId;
      const barilgiinObjectId = mongoose.Types.ObjectId.isValid(doc.barilgiinId) 
        ? new mongoose.Types.ObjectId(doc.barilgiinId)
        : doc.barilgiinId;
      
      const updateData = {
        $set: {
          [`barilguud.$[barilga].tokhirgoo.liftShalgaya.choloolugdokhDavkhar`]: doc.choloolugdokhDavkhar || []
        }
      };
      
      const arrayFilters = [
        { "barilga._id": barilgiinObjectId }
      ];
      
      console.log(`🔍 [LIFTSHALGAYA HOOK] Updating baiguullaga with arrayFilters:`, JSON.stringify(arrayFilters, null, 2));
      
      const updateResult = await BaiguullagaModel.collection.updateOne(
        { _id: baiguullagaObjectId },
        updateData,
        { arrayFilters: arrayFilters }
      );
      console.log(
        `✅ [LIFTSHALGAYA HOOK] Synced liftShalgaya to baiguullaga: ${doc.baiguullagiinId}, barilga: ${doc.barilgiinId}, matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`
      );
      
      if (updateResult.matchedCount === 0) {
        console.error(`❌ [LIFTSHALGAYA HOOK] No document matched for _id: ${baiguullagaObjectId}`);
      }
      if (updateResult.modifiedCount === 0 && updateResult.matchedCount > 0) {
        console.warn(`⚠️ [LIFTSHALGAYA HOOK] Document matched but not modified. Path might already have the same value.`);
      }

      const baiguullagaAfterUpdate = await Baiguullaga(db.erunkhiiKholbolt).findById(
        doc.baiguullagiinId
      ).lean();
      
      if (baiguullagaAfterUpdate?.barilguud?.[barilgaIndex]?.tokhirgoo?.ashiglaltiinZardluud) {
        const ashiglaltiinZardluud = baiguullagaAfterUpdate.barilguud[barilgaIndex].tokhirgoo.ashiglaltiinZardluud;
        const hasLiftZardal = ashiglaltiinZardluud.some(z => z.zardliinTurul === "Лифт");
        
        if (hasLiftZardal) {
          const updatedZardluud = ashiglaltiinZardluud.map((zardal) => {
            if (zardal.zardliinTurul === "Лифт") {
              return {
                ...zardal,
                choloolugdsonDavkhar: true
              };
            }
            return zardal;
          });
          
          const BaiguullagaModel = Baiguullaga(db.erunkhiiKholbolt);
          const baiguullagaObjectId = mongoose.Types.ObjectId.isValid(doc.baiguullagiinId) 
            ? new mongoose.Types.ObjectId(doc.baiguullagiinId)
            : doc.baiguullagiinId;
          const barilgiinObjectId = mongoose.Types.ObjectId.isValid(doc.barilgiinId) 
            ? new mongoose.Types.ObjectId(doc.barilgiinId)
            : doc.barilgiinId;
          
          await BaiguullagaModel.collection.updateOne(
            { _id: baiguullagaObjectId },
            {
              $set: {
                [`barilguud.$[barilga].tokhirgoo.ashiglaltiinZardluud`]: updatedZardluud
              }
            },
            { arrayFilters: [{ "barilga._id": barilgiinObjectId }] }
          );
          console.log(
            `✅ [LIFTSHALGAYA HOOK] Updated choloolugdsonDavkhar to true for lift zardals`
          );
        }
      }
    } else {
      console.error("⚠️ [LIFTSHALGAYA HOOK] Barilga not found:", doc.barilgiinId);
    }
  } catch (error) {
    console.error("❌ [LIFTSHALGAYA HOOK] Error syncing to baiguullaga:", error.message);
  }
});

// Post-update hook for findOneAndUpdate
liftShalgayaSchema.post("findOneAndUpdate", async function (result) {
  try {
    if (!result || !result.baiguullagiinId || !result.barilgiinId) {
      return;
    }

    const { db } = require("zevbackv2");
    const Baiguullaga = require("./baiguullaga");

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      result.baiguullagiinId
    );

    if (!baiguullaga) {
      return;
    }

    const barilgaIndex = baiguullaga.barilguud.findIndex(
      (b) => String(b._id) === String(result.barilgiinId)
    );

    if (barilgaIndex >= 0) {
      if (!baiguullaga.barilguud[barilgaIndex].tokhirgoo) {
        baiguullaga.barilguud[barilgaIndex].tokhirgoo = {};
      }
      if (!baiguullaga.barilguud[barilgaIndex].tokhirgoo.liftShalgaya) {
        baiguullaga.barilguud[barilgaIndex].tokhirgoo.liftShalgaya = {};
      }
      baiguullaga.barilguud[
        barilgaIndex
      ].tokhirgoo.liftShalgaya.choloolugdokhDavkhar = result.choloolugdokhDavkhar || [];
      
      await baiguullaga.save();
      console.log(
        `✅ [LIFTSHALGAYA HOOK] Synced liftShalgaya to baiguullaga after findOneAndUpdate: ${result.baiguullagiinId}, barilga: ${result.barilgiinId}`
      );

      // Update choloolugdsonDavkhar to true for lift zardals in ashiglaltiinZardluud
      if (baiguullaga.barilguud[barilgaIndex].tokhirgoo?.ashiglaltiinZardluud) {
        let updated = false;
        baiguullaga.barilguud[barilgaIndex].tokhirgoo.ashiglaltiinZardluud = 
          baiguullaga.barilguud[barilgaIndex].tokhirgoo.ashiglaltiinZardluud.map((zardal) => {
            if (zardal.zardliinTurul === "Лифт") {
              updated = true;
              return {
                ...zardal,
                choloolugdsonDavkhar: true
              };
            }
            return zardal;
          });
        
        if (updated) {
          await baiguullaga.save();
          console.log(
            `✅ [LIFTSHALGAYA HOOK] Updated choloolugdsonDavkhar to true for lift zardals after findOneAndUpdate`
          );
        }
      }
    }
  } catch (error) {
    console.error("❌ [LIFTSHALGAYA HOOK] Error syncing to baiguullaga after update:", error.message);
  }
});

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("liftShalgaya", liftShalgayaSchema);
};
//module.exports = mongoose.model("license", licenseSchema);
