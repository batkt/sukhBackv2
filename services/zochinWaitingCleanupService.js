const { db } = require("zevbackv2");
const { EzenUrisanMashin } = require("sukhParking-v1");
const zochinTureesSyncService = require("./zochinTureesSyncService");

/**
 * Хүлээлгэнд байгаа (tuluv === 0) болон үүсгэгдээд 12-оос дээш цаг болсон
 * урилгуудыг бүх холболтуудаас автоматаар устгах үйлчилгээ.
 *
 * @param {object} io - Socket.io instance (optional)
 * @param {number} maxAgeHours - Хүлээлгийн дээд хугацаа цагаар (default: 12)
 * @returns {Promise<{ totalDeleted: number, details: Array }>}
 */
async function zochinWaitingCleanup(io = null, maxAgeHours = 12) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  console.log(
    `🧹 [ZOCHIN_WAITING_CLEANUP] Starting cleanup for waiting invitations older than ${maxAgeHours} hours (before ${cutoff.toISOString()})...`
  );

  let totalDeleted = 0;
  const deletedDetails = [];

  // Шалгах холболтууд: бүх түрээслэгчийн холболтууд + ерөнхий холболт
  const connectionSet = new Set();
  if (Array.isArray(db.kholboltuud)) {
    for (const k of db.kholboltuud) {
      if (k) connectionSet.add(k);
    }
  }
  if (db.erunkhiiKholbolt) {
    connectionSet.add(db.erunkhiiKholbolt);
  }

  for (const kholbolt of connectionSet) {
    try {
      const EzenUrisanMashinModel = EzenUrisanMashin(kholbolt);
      if (!EzenUrisanMashinModel) continue;

      // tuluv: 0 (хүлээлгэ), createdAt эсвэл ognoo нь cutoff-аас өмнө
      const query = {
        tuluv: 0,
        $or: [
          { createdAt: { $lte: cutoff } },
          { ognoo: { $lte: cutoff } },
          { createdAt: { $exists: false }, ognoo: { $exists: false } }
        ]
      };

      const expiredDocs = await EzenUrisanMashinModel.find(query);
      if (!expiredDocs || expiredDocs.length === 0) continue;

      for (const doc of expiredDocs) {
        try {
          // Түрээсийн зогсоолын систем дээр бүртгэгдсэн бол цуцлах
          try {
            await zochinTureesSyncService.urilgaTsutslaya(doc);
          } catch (syncErr) {
            console.warn(
              `⚠️ [ZOCHIN_WAITING_CLEANUP] Turees cancellation warning for ${doc.urisanMashiniiDugaar}:`,
              syncErr.message
            );
          }

          // Баазаас устгах
          await EzenUrisanMashinModel.findByIdAndDelete(doc._id);
          totalDeleted++;

          const residentId = doc.ezenId || doc.ezemshigchiinId;
          deletedDetails.push({
            id: doc._id,
            plate: doc.urisanMashiniiDugaar,
            createdAt: doc.createdAt || doc.ognoo,
            residentId,
            baiguullagiinId: doc.baiguullagiinId
          });

          // Сокет мэдэгдэл илгээх (хэрэв оршин суугч холбогдсон бол)
          if (io && residentId) {
            try {
              io.emit(`orshinSuugch${residentId}`, {
                type: "ZOCHIN_DELETE",
                message: `Хүлээлгийн хугацаа (${maxAgeHours} цаг) дууссан тул ${doc.urisanMashiniiDugaar} дугаартай зочны урилга автоматаар цуцлагдлаа`,
                id: String(doc._id)
              });
            } catch (socketErr) {
              console.error("Socket emit error on waiting cleanup:", socketErr.message);
            }
          }

          console.log(
            `✅ [ZOCHIN_WAITING_CLEANUP] Deleted expired waiting guest: ${doc.urisanMashiniiDugaar} (ID: ${doc._id}, created: ${doc.createdAt || doc.ognoo})`
          );
        } catch (itemErr) {
          console.error(
            `❌ [ZOCHIN_WAITING_CLEANUP] Error deleting invitation ${doc._id}:`,
            itemErr.message
          );
        }
      }
    } catch (kholboltErr) {
      console.error(
        "❌ [ZOCHIN_WAITING_CLEANUP] Error scanning database connection:",
        kholboltErr.message
      );
    }
  }

  console.log(
    `🧹 [ZOCHIN_WAITING_CLEANUP] Finished. Total expired waiting invitations deleted: ${totalDeleted}`
  );
  return { totalDeleted, details: deletedDetails };
}

module.exports = {
  zochinWaitingCleanup
};
