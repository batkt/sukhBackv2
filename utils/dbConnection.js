/**
 * Returns the tenant DB connection (kholbolt) for the given organization ID.
 * Tries string comparison first, then ObjectId comparison if baiguullagiinId is a valid ObjectId.
 * @param {string|ObjectId} baiguullagiinId - Organization ID
 * @returns {object|null} The kholbolt connection object or null if not found
 */
function getKholboltByBaiguullagiinId(baiguullagiinId) {
  if (baiguullagiinId == null) return null;
  const { db } = require("zevbackv2");
  let kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
  );
  if (!kholbolt && typeof baiguullagiinId === "string") {
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(baiguullagiinId)) {
      const baiguullagiinObjectId = new mongoose.Types.ObjectId(baiguullagiinId);
      kholbolt = db.kholboltuud.find((k) => {
        const kId = k.baiguullagiinId;
        if (mongoose.Types.ObjectId.isValid(kId)) {
          return kId.equals(baiguullagiinObjectId);
        }
        return String(kId) === String(baiguullagiinId);
      });
    }
  }
  return kholbolt || null;
}

module.exports = { getKholboltByBaiguullagiinId };
