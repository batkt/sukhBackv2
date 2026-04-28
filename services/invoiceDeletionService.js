const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const Geree = require("../models/geree");
const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");

function getNekhemjlekhiinTuukhModel(kholbolt) {
  const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
  const conn = kholbolt && kholbolt.kholbolt ? kholbolt : { kholbolt };
  return nekhemjlekhiinTuukh(conn);
}

/**
 * Recalculate and set geree.globalUldegdel from raw amounts (totalCharges - totalPayments).
 * totalCharges = geree.ekhniiUldegdel + SUM(invoice originals excl. ekhnii) + SUM(avlaga originals)
 * totalPayments = SUM(tulsunAvlaga.tulsunDun)
 * @param {string} gereeniiId - Contract ID
 * @param {string} baiguullagiinId - Org ID
 * @param {object} kholbolt - DB connection
 * @param {{ excludeInvoiceId?: string }} [opts] - If set, exclude this invoice (e.g. when it is about to be deleted)
 */
async function recalculateGereeGlobalUldegdel(
  gereeniiId,
  baiguullagiinId,
  kholbolt,
  opts = {},
) {
  const NekhemjlekhiinTuukh = getNekhemjlekhiinTuukhModel(kholbolt);

  const { recalcGlobalUldegdel } = require("../utils/recalcGlobalUldegdel");
  await recalcGlobalUldegdel({
    gereeId: gereeniiId,
    baiguullagiinId,
    GereeModel: Geree(kholbolt),
    NekhemjlekhiinTuukhModel: NekhemjlekhiinTuukh,
    GereeniiTulukhAvlagaModel: GereeniiTulukhAvlaga(kholbolt),
    GereeniiTulsunAvlagaModel: GereeniiTulsunAvlaga(kholbolt),
    excludeInvoiceId: opts.excludeInvoiceId,
  });
}

/**
 * Delete an invoice and all connected data for a specific org only.
 * 1. Decrements Geree.globalUldegdel by unpaid amount
 * 2. Deletes GereeniiTulsunAvlaga records for this invoice (org-scoped)
 * 3. Deletes GereeniiTulukhAvlaga records for this invoice (org-scoped)
 * 4. Deletes the nekhemjlekhiinTuukh document
 * Call with (invoiceId, baiguullagiinId). Returns { success, error? }.
 */
async function deleteInvoice(invoiceId, baiguullagiinId) {
  if (!invoiceId || !baiguullagiinId) {
    return {
      success: false,
      statusCode: 400,
      error: "invoiceId and baiguullagiinId are required",
    };
  }

  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  if (!kholbolt) {
    return {
      success: false,
      statusCode: 404,
      error: "Холболтын мэдээлэл олдсонгүй (baiguullagiinId)",
    };
  }

  const Model = getNekhemjlekhiinTuukhModel(kholbolt);
  const invoiceDoc = await Model.findOne({
    _id: invoiceId,
    baiguullagiinId: String(baiguullagiinId),
  });
  if (!invoiceDoc) {
    return {
      success: false,
      statusCode: 404,
      error: "Нэхэмжлэх олдсонгүй",
    };
  }

  await invoiceDoc.deleteOne();
  return {
    success: true,
    message: "Нэхэмжлэх болон холбоотой бүртгэл устгагдлаа",
  };
}

/**
 * Delete all invoices (nekhemjlekhiinTuukh) for a given organization.
 * Each document is deleted individually so pre-delete hooks run and cascade
 * (Geree globalUldegdel, GereeniiTulsunAvlaga, GereeniiTulukhAvlaga) is applied.
 * Body: { baiguullagiinId }. Returns { success, deletedCount, message }.
 */
async function deleteAllInvoicesForOrg(baiguullagiinId) {
  if (!baiguullagiinId) {
    return {
      success: false,
      statusCode: 400,
      error: "baiguullagiinId is required",
    };
  }

  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  if (!kholbolt) {
    return {
      success: false,
      statusCode: 404,
      error: "Холболтын мэдээлэл олдсонгүй (baiguullagiinId)",
    };
  }

  const Model = getNekhemjlekhiinTuukhModel(kholbolt);
  const docs = await Model.find({
    baiguullagiinId: String(baiguullagiinId),
  }).lean();

  let deletedCount = 0;
  for (const doc of docs) {
    const fullDoc = await Model.findById(doc._id);
    if (fullDoc) {
      await fullDoc.deleteOne();
      deletedCount++;
    }
  }

  const orgId = String(baiguullagiinId);
  let tulsunUnlinked = 0;
  let tulukhUnlinked = 0;
  try {
    // SAFE: Unlink payments instead of deleting them.
    const tulsunResult = await GereeniiTulsunAvlaga(kholbolt).updateMany(
      { baiguullagiinId: orgId },
      { $set: { nekhemjlekhId: null } }
    );
    tulsunUnlinked = tulsunResult.modifiedCount ?? 0;
  } catch (e) {
    console.error(
      "[NEKHEMJLEKH] deleteAllInvoicesForOrg GereeniiTulsunAvlaga updateMany error:",
      e.message,
    );
  }
  try {
    // SAFE: Unlink receivables instead of deleting them.
    const tulukhResult = await GereeniiTulukhAvlaga(kholbolt).updateMany(
      { baiguullagiinId: orgId },
      { $set: { nekhemjlekhId: null } }
    );
    tulukhUnlinked = tulukhResult.modifiedCount ?? 0;
  } catch (e) {
    console.error(
      "[NEKHEMJLEKH] deleteAllInvoicesForOrg GereeniiTulukhAvlaga updateMany error:",
      e.message,
    );
  }

  const GereeModel = Geree(kholbolt);
  const gereesInOrg = await GereeModel.find({ baiguullagiinId: orgId })
    .select("_id positiveBalance")
    .lean();
  for (const g of gereesInOrg) {
    const positive =
      typeof g.positiveBalance === "number" ? g.positiveBalance : 0;
    await GereeModel.findByIdAndUpdate(g._id, {
      $set: {
        globalUldegdel: -positive,
        guilgeenuudForNekhemjlekh: [],
      },
    });
  }


  return {
    success: true,
    deletedCount,
    unlinkedTulsunAvlaga: tulsunUnlinked,
    unlinkedTulukhAvlaga: tulukhUnlinked,
    gereeUpdatedCount: gereesInOrg.length,
    message: `${deletedCount} нэхэмжлэх устгагдлаа; ${tulsunUnlinked} төлөлт, ${tulukhUnlinked} авлага салгагдлаа; ${gereesInOrg.length} гэрээний үлдэгдэл шинэчлэгдлээ`,
  };
}

/**
 * Runs side effects when an invoice (nekhemjlekh) is deleted: cascade-delete related
 * gereeniiTulsunAvlaga and gereeniiTulukhAvlaga, then recalculate geree.globalUldegdel.
 * Called from nekhemjlekhiinTuukh model pre-delete hooks only.
 * @param {Object} doc - The invoice document being deleted (must have gereeniiId, baiguullagiinId)
 */
async function runDeleteSideEffects(doc) {

  if (!doc || !doc.gereeniiId || !doc.baiguullagiinId) {
    return;
  }

  try {
    const kholbolt = getKholboltByBaiguullagiinId(doc.baiguullagiinId);
    if (!kholbolt) return;

    const oid = String(doc.baiguullagiinId);
    const invId = doc._id;

    try {
      // SAFE: Unlink payments instead of deleting them from the database.
      // This preserves financial history and prevents accidental data loss.
      const tulsunUpdateResult = await GereeniiTulsunAvlaga(
        kholbolt,
      ).updateMany(
        {
          baiguullagiinId: oid,
          $or: [{ nekhemjlekhId: String(invId) }, { nekhemjlekhId: invId }],
        },
        { $set: { nekhemjlekhId: null } },
      );
    } catch (tulsunError) {
      console.error(
        "Error cascade deleting gereeniiTulsunAvlaga:",
        tulsunError.message,
      );
    }

    try {
      // SAFE: Unlink receivables instead of deleting them.
      const tulukhUpdateResult = await GereeniiTulukhAvlaga(
        kholbolt,
      ).updateMany(
        {
          baiguullagiinId: oid,
          $or: [{ nekhemjlekhId: String(invId) }, { nekhemjlekhId: invId }],
        },
        { $set: { nekhemjlekhId: null } },
      );
    } catch (tulukhError) {
      console.error(
        "Error cascade deleting gereeniiTulukhAvlaga:",
        tulukhError.message,
      );
    }

    await recalculateGereeGlobalUldegdel(doc.gereeniiId, oid, kholbolt, {
      excludeInvoiceId: invId,
    });

  } catch (error) {
    console.error("Error in runDeleteSideEffects:", error);
  }
}

module.exports = {
  runDeleteSideEffects,
  deleteInvoice,
  deleteAllInvoicesForOrg,
};
