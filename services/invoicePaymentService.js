const { db } = require("zevbackv2");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

const { parseOgnooKeepClock } = require("../utils/parseOgnooKeepClock");

function isAvlagaOnlyShellInvoiceDoc(inv) {
  const dugaar = String(inv?.nekhemjlekhiinDugaar || "");
  if (dugaar.startsWith("AVL-")) return true;
  return inv?.nekhemjlekh === "Авлагаар автоматаар үүсгэсэн нэхэмжлэх";
}

async function applyPaymentToOpenTulukhAvlaga({
  GuilgeeAvlaguudModel,
  baiguullagiinId,
  gereeniiId,
  amount,
}) {
  let remaining = Number(amount) || 0;
  if (remaining <= 0.01) return 0;

  const openTulukhRows = await GuilgeeAvlaguudModel.find({
    gereeniiId: String(gereeniiId),
    baiguullagiinId: String(baiguullagiinId),
    uldegdel: { $gt: 0 },
  })
    .sort({ ognoo: 1, createdAt: 1 })
    .lean();

  for (const row of openTulukhRows) {
    if (remaining <= 0.01) break;
    const currentUldegdel = Number(row.uldegdel) || 0;
    if (currentUldegdel <= 0.01) continue;

    const applyHere = Math.min(remaining, currentUldegdel);
    const newUldegdel = Math.round((currentUldegdel - applyHere) * 100) / 100;

    await GuilgeeAvlaguudModel.updateOne(
      { _id: row._id },
      { $set: { uldegdel: newUldegdel } },
    );

    remaining = Math.round((remaining - applyHere) * 100) / 100;
  }

  return Math.round((Number(amount) - remaining) * 100) / 100;
}

function resolveGuilgeeKhiisenAjiltanFromOptions(options) {
  const token = options.nevtersenAjiltniiToken;
  let ner = "";
  let id = "";

  if (
    options.guilgeeKhiisenAjiltniiNer != null &&
    String(options.guilgeeKhiisenAjiltniiNer).trim() !== ""
  ) {
    ner = String(options.guilgeeKhiisenAjiltniiNer);
  }
  if (
    options.guilgeeKhiisenAjiltniiId != null &&
    String(options.guilgeeKhiisenAjiltniiId).trim() !== ""
  ) {
    id = String(options.guilgeeKhiisenAjiltniiId);
  }

  if (token) {
    if (token.ner != null && String(token.ner).trim() !== "")
      ner = String(token.ner);
    if (token.id != null && String(token.id).trim() !== "")
      id = String(token.id);
  }

  if (!id && options.createdBy != null && String(options.createdBy).trim() !== "")
    id = String(options.createdBy);
  if (
    !id &&
    options.burtgesenAjiltaniiId != null &&
    String(options.burtgesenAjiltaniiId).trim() !== ""
  )
    id = String(options.burtgesenAjiltaniiId);
  if (
    !id &&
    options.burtgesenAjiltan != null &&
    String(options.burtgesenAjiltan).trim() !== ""
  )
    id = String(options.burtgesenAjiltan);

  if (!ner) {
    const nameCandidate =
      options.burtgesenAjiltaniiNer ||
      options.createdByNer ||
      options.ajiltanNer ||
      (typeof options.guilgeeKhiisenAjiltniiNer === "string"
        ? options.guilgeeKhiisenAjiltniiNer
        : null);
    if (nameCandidate != null && String(nameCandidate).trim() !== "")
      ner = String(nameCandidate);
  }

  return {
    ner: ner || null,
    id: id || null,
  };
}

/**
 * Mark invoices as paid with credit/overpayment system
 * Payment reduces from latest month first, then previous months
 * If payment exceeds all invoices, remaining is saved as positiveBalance
 * @param {Object} options - Payment options
 * @param {String} options.baiguullagiinId - Organization ID (required)
 * @param {Number} options.dun - Payment amount (required)
 * @param {String} [options.orshinSuugchId] - User ID (mark all invoices for this user)
 * @param {String} [options.gereeniiId] - Contract ID (mark all invoices for this contract)
 * @param {Array<String>} [options.nekhemjlekhiinIds] - Array of invoice IDs (mark specific invoices)
 * @param {Boolean} [options.markEkhniiUldegdel] - If true, also mark invoices with ekhniiUldegdel (default: false)
 * @param {String} [options.tailbar] - Payment description/notes
 * @param {Object} [options.nevtersenAjiltniiToken] - { ner, id } logged-in staff (same as other routes)
 * @param {String} [options.guilgeeKhiisenAjiltniiNer] - Staff name for ledger
 * @param {String} [options.guilgeeKhiisenAjiltniiId] - Staff id for ledger
 * @param {String} [options.createdBy] - Fallback staff id
 * @param {String} [options.createdByNer] - Fallback staff name
 * @param {String} [options.ajiltanNer] - Fallback staff name
 * @returns {Object} - Result with updated invoices count and details
 */
async function markInvoicesAsPaid(options) {
  const {
    baiguullagiinId,
    dun, // Payment amount (required)
    orshinSuugchId,
    gereeniiId,
    nekhemjlekhiinIds,
    markEkhniiUldegdel = false,
    tailbar = null,
    barilgiinId, // Optional: if provided, restrict to contracts/invoices in this building
    ognoo, // Optional: payment date (YYYY-MM-DD or ISO string) - uses selected date instead of today
  } = options;

  const ajiltanMeta = resolveGuilgeeKhiisenAjiltanFromOptions(options);

  function resolvePaymentOgnoo() {
    const d = parseOgnooKeepClock(ognoo);
    return d && !Number.isNaN(d.getTime()) ? d : new Date();
  }

  if (!baiguullagiinId) {
    throw new Error("baiguullagiinId is required");
  }

  if (!dun || dun <= 0) {
    throw new Error(
      "dun (payment amount) is required and must be greater than 0",
    );
  }

  // Validate that at least one identifier is provided
  if (
    !orshinSuugchId &&
    !gereeniiId &&
    (!nekhemjlekhiinIds || nekhemjlekhiinIds.length === 0)
  ) {
    throw new Error(
      "Either orshinSuugchId, gereeniiId, or nekhemjlekhiinIds must be provided",
    );
  }

  // Get database connection
  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
  );

  if (!kholbolt) {
    throw new Error(`Холболт олдсонгүй: ${baiguullagiinId}`);
  }

  const NekhemjlekhiinTuukh = nekhemjlekhiinTuukh(kholbolt);
  const GereeModel = Geree(kholbolt);
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);


  // Build query to find invoices
  const query = {
    baiguullagiinId: String(baiguullagiinId),
    tuluv: { $ne: "Төлсөн" }, // Only unpaid invoices
  };

  // Restrict to specific building if provided
  if (barilgiinId) {
    query.barilgiinId = String(barilgiinId);
  }

  // NOTE: Previously excluded invoices with ekhniiUldegdel when markEkhniiUldegdel=false.
  // Removed: all unpaid invoices should be payable regardless of ekhniiUldegdel.

  if (nekhemjlekhiinIds && nekhemjlekhiinIds.length > 0) {
    // Mark specific invoices by IDs
    query._id = { $in: nekhemjlekhiinIds };
  } else if (gereeniiId) {
    // Mark all invoices for a specific contract (highest priority after explicit IDs)
    query.gereeniiId = String(gereeniiId);
  } else if (orshinSuugchId) {
    // Mark all invoices for a user (all their active contracts)
    const gereeQuery = {
      orshinSuugchId: String(orshinSuugchId),
      baiguullagiinId: String(baiguullagiinId),
      tuluv: { $ne: "Цуцалсан" },
    };

    // IMPORTANT: If barilgiinId is provided, ONLY find contracts in that building
    if (barilgiinId) {
      gereeQuery.barilgiinId = String(barilgiinId);
    }

    const gerees = await GereeModel.find(gereeQuery).select("_id").lean();

    if (gerees.length === 0) {
      return {
        success: true,
        updatedCount: 0,
        message: "No active contracts found for this user",
        invoices: [],
        remainingBalance: dun,
      };
    }

    const gereeniiIds = gerees.map((g) => g._id.toString());
    query.gereeniiId = { $in: gereeniiIds };
  }

  // Find all unpaid invoices matching the query
  let invoices = await NekhemjlekhiinTuukh.find(query)
    .sort({ ognoo: -1, createdAt: -1 }) // Latest month first
    .lean();

  // If user selected a payment date, apply payment to that invoice cycle month first,
  // then move forward to next months (chronological).
  try {
    const paymentDate = ognoo ? new Date(ognoo) : null;
    if (
      paymentDate &&
      !Number.isNaN(paymentDate.getTime()) &&
      invoices.length > 1
    ) {
      const mk = (d) => {
        const x = d instanceof Date ? d : new Date(d);
        if (Number.isNaN(x.getTime())) return null;
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
      };
      const invDate = (inv) =>
        inv.ognoo || inv.nekhemjlekhiinOgnoo || inv.createdAt;

      const payMonth = mk(paymentDate);
      const asc = [...invoices].sort((a, b) => {
        const da = invDate(a) ? new Date(invDate(a)).getTime() : 0;
        const db = invDate(b) ? new Date(invDate(b)).getTime() : 0;
        if (da !== db) return da - db;
        const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (ca !== cb) return ca - cb;
        return String(a._id).localeCompare(String(b._id));
      });

      const inMonth = [];
      const after = [];
      const before = [];
      for (const inv of asc) {
        const m = mk(invDate(inv));
        if (m === payMonth) inMonth.push(inv);
        else if (m && payMonth && m > payMonth) after.push(inv);
        else before.push(inv);
      }

      // Apply to selected month first, then later months, then older months.
      invoices = [...inMonth, ...after, ...before];
    }
  } catch (_orderErr) {
    // keep default ordering
  }

  if (invoices.length === 0) {
    // No invoices found - save entire payment as positiveBalance
    let gereeToUpdate = null;
    if (gereeniiId) {
      gereeToUpdate = await GereeModel.findById(gereeniiId);
    } else if (orshinSuugchId) {
      // Get the first active contract for this user (respecting barilgiinId)
      const gereeQuery = {
        orshinSuugchId: String(orshinSuugchId),
        baiguullagiinId: String(baiguullagiinId),
        tuluv: { $ne: "Цуцалсан" },
      };
      if (barilgiinId) {
        gereeQuery.barilgiinId = String(barilgiinId);
      }
      const firstGeree = await GereeModel.findOne(gereeQuery);
      gereeToUpdate = firstGeree;
    }

    if (gereeToUpdate) {
      // First, apply payment to outstanding gereeniiTulukhAvlaga records
      let remainingForAvlaga = dun;
      try {
        const openTulukhRows = await GuilgeeAvlaguudModel.find({
          gereeniiId: String(gereeToUpdate._id),
          baiguullagiinId: String(baiguullagiinId),
          uldegdel: { $gt: 0 },
        })
          .sort({ ognoo: 1, createdAt: 1 })
          .lean();

        for (const row of openTulukhRows) {
          if (remainingForAvlaga <= 0) break;
          const currentUldegdel = row.uldegdel || 0;
          if (currentUldegdel <= 0) continue;

          const applyHere = Math.min(remainingForAvlaga, currentUldegdel);
          const newUldegdel = currentUldegdel - applyHere;

          await GuilgeeAvlaguudModel.updateOne(
            { _id: row._id },
            { $set: { uldegdel: newUldegdel } },
          );

          remainingForAvlaga -= applyHere;
        }
      } catch (tulukhErr) {
        console.error(
          `❌ [INVOICE PAYMENT] Error applying payment to GuilgeeAvlaguud (no invoices branch):`,
          tulukhErr.message,
        );
      }

      if (remainingForAvlaga > 0) {
        gereeToUpdate.positiveBalance =
          (gereeToUpdate.positiveBalance || 0) + remainingForAvlaga;
      }

      let totalUnpaidForRecalc = 0;
      try {
        const tulukhRowsAfter = await GuilgeeAvlaguudModel.find({
          gereeniiId: String(gereeToUpdate._id),
          baiguullagiinId: String(baiguullagiinId),
        })
          .select("uldegdel")
          .lean();
        tulukhRowsAfter.forEach((row) => {
          totalUnpaidForRecalc +=
            typeof row.uldegdel === "number" && !isNaN(row.uldegdel)
              ? row.uldegdel
              : 0;
        });
      } catch (recalcErr) {
        console.error(
          `❌ [INVOICE PAYMENT] Error recalculating avlaga for globalUldegdel (no invoices branch):`,
          recalcErr.message,
        );
      }

      const positive = gereeToUpdate.positiveBalance || 0;
      gereeToUpdate.globalUldegdel = totalUnpaidForRecalc - positive;
      await gereeToUpdate.save();

      // NEW: Also create a history record for this prepayment so it's visible and counts
      // towards the dashboard balance reduction.
      try {
        const paymentDate = resolvePaymentOgnoo();
        const prepayDoc = new GuilgeeAvlaguudModel({
          baiguullagiinId: String(baiguullagiinId),
          baiguullagiinNer: gereeToUpdate.baiguullagiinNer || "",
          barilgiinId: gereeToUpdate.barilgiinId || "",
          gereeniiId: gereeToUpdate._id.toString(),
          gereeniiDugaar: gereeToUpdate.gereeniiDugaar || "",
          orshinSuugchId: gereeToUpdate.orshinSuugchId || orshinSuugchId || "",
          nekhemjlekhId: null,

          ognoo: paymentDate,
          tulsunDun: dun,
          tulsunAldangi: 0,

          turul: "төлөлт",
          zardliinTurul: "",
          zardliinId: "",
          zardliinNer: "",

          tailbar: tailbar || `Илүү төлөлт (positiveBalance): ${dun}₮`,

          source: "geree",
          guilgeeKhiisenAjiltniiNer: ajiltanMeta.ner,
          guilgeeKhiisenAjiltniiId: ajiltanMeta.id,
        });
        await prepayDoc.save();
      } catch (historyError) {
        console.error(
          `❌ [INVOICE PAYMENT] Error creating prepayment history:`,
          historyError.message,
        );
      }
    }

    return {
      success: true,
      updatedCount: 0,
      totalFound: 0,
      message: `No unpaid invoices found. Saved ${dun} as positive balance.`,
      invoices: [],
      remainingBalance: dun,
      positiveBalanceAdded: dun,
    };
  }

  let remainingPayment = dun;
  const updatedInvoices = [];
  const gereePositiveBalanceMap = new Map(); // Track positiveBalance per geree
  const tulsunAvlagaDocs = []; // Track created gereeniiTulsunAvlaga records
  const gereesNeedingRecalc = new Set(); // geree IDs whose globalUldegdel we will recalculate

  // Process invoices in computed order
  for (const invoice of invoices) {
    if (remainingPayment <= 0) {
      break; // Payment fully applied
    }

    try {
      const invoiceAmount = invoice.niitTulbur || 0;
      // Use uldegdel if it exists and is valid, otherwise use full amount
      const existingUldegdel =
        typeof invoice.uldegdel === "number" &&
        !isNaN(invoice.uldegdel) &&
        invoice.uldegdel > 0
          ? invoice.uldegdel
          : invoiceAmount;
      const unpaidAmount = existingUldegdel;

      if (unpaidAmount <= 0) {
        continue; // Skip invoices with 0 remaining
      }

      // Calculate how much to apply to this invoice
      const amountToApply = Math.min(remainingPayment, unpaidAmount);
      const newUldegdel = unpaidAmount - amountToApply;
      const isFullyPaid = newUldegdel <= 0.01; // Use small threshold for floating point

      // Calculate per-item (zardluud) payment distribution
      let zardluudUpdate = null;
      if (
        invoice.medeelel &&
        invoice.medeelel.zardluud &&
        invoice.medeelel.zardluud.length > 0
      ) {
        let remainingToDistribute = amountToApply;
        const updatedZardluud = invoice.medeelel.zardluud.map((z) => {
          const itemDun = z.dun || 0;
          const itemTulsunDun = z.tulsunDun || 0;
          const itemUldegdel = itemDun - itemTulsunDun;

          if (remainingToDistribute <= 0 || itemUldegdel <= 0) {
            return { ...z };
          }

          const applyToItem = Math.min(remainingToDistribute, itemUldegdel);
          remainingToDistribute -= applyToItem;

          return {
            ...z,
            tulsunDun: itemTulsunDun + applyToItem,
            tulsenEsekh: itemTulsunDun + applyToItem >= itemDun - 0.01,
          };
        });
        zardluudUpdate = updatedZardluud;
      }

      // Update invoice
      const paymentDate = resolvePaymentOgnoo();
      const updateData = {
        $push: {
          paymentHistory: {
            ognoo: paymentDate,
            dun: amountToApply,
            turul: "төлөлт",
            guilgeeniiId: `payment_${Date.now()}_${invoice._id}`,
            tailbar:
              tailbar ||
              (isFullyPaid
                ? "Төлбөр хийгдлээ"
                : `Хэсэгчилсэн төлбөр: ${amountToApply}₮`),
          },
        },
        $set: {
          uldegdel: isFullyPaid ? 0 : newUldegdel,
          niitTulbur: isFullyPaid ? 0 : newUldegdel, // Update niitTulbur to match remaining
          tuluv: isFullyPaid ? "Төлсөн" : "Төлөөгүй", // tuluv stays Төлөөгүй until uldegdel reaches 0
        },
      };

      // Ensure original total is preserved
      if (typeof invoice.niitTulburOriginal !== "number") {
        updateData.$set.niitTulburOriginal = invoice.niitTulbur;
      }

      if (isFullyPaid) {
        updateData.$set.tulsunOgnoo = paymentDate;
      }

      // Update zardluud with per-item payment tracking
      if (zardluudUpdate) {
        updateData.$set["medeelel.zardluud"] = zardluudUpdate;
      }

      const updatedInvoice = await NekhemjlekhiinTuukh.findByIdAndUpdate(
        invoice._id,
        updateData,
        { new: true },
      );

      if (!updatedInvoice) {
        console.error(
          `❌ [INVOICE PAYMENT] Failed to update invoice ${invoice._id}`,
        );
        continue;
      }

      // Special case: AVL-* invoice is just a shell that mirrors open receivables (GuilgeeAvlaguud).
      // making it look like payment "didn't work". So we must also reduce the underlying open avlaga rows.
      try {
        if (isAvlagaOnlyShellInvoiceDoc(updatedInvoice)) {
          await applyPaymentToOpenTulukhAvlaga({
            GuilgeeAvlaguudModel,
            baiguullagiinId,
            gereeniiId: updatedInvoice.gereeniiId,
            amount: amountToApply,
          });
        }
      } catch (avlagaPayErr) {
        console.error(
          `❌ [INVOICE PAYMENT] Error applying payment to AVL avlaga rows for invoice ${invoice._id}:`,
          avlagaPayErr.message,
        );
      }

      try {
        const invFresh = await NekhemjlekhiinTuukh.findById(invoice._id);
        if (invFresh) {
          invFresh._skipTuluvRecalc = true;
          await invFresh.save();
        }
      } catch (ekhniiSyncErr) {
        console.error(
          `❌ [INVOICE PAYMENT] ekhniiUldegdel sync save failed for ${invoice._id}:`,
          ekhniiSyncErr.message,
        );
      }

      remainingPayment -= amountToApply;
      updatedInvoices.push({
        invoice: updatedInvoice,
        amountApplied: amountToApply,
        isFullyPaid,
      });

      // Track geree whose invoices changed, to recalc globalUldegdel later
      if (updatedInvoice.gereeniiId) {
        gereesNeedingRecalc.add(String(updatedInvoice.gereeniiId));
      }
    } catch (error) {
      console.error(
        `❌ [INVOICE PAYMENT] Error updating invoice ${invoice._id}:`,
        error.message,
      );
    }
  }

  if (dun > 0 && (updatedInvoices.length > 0 || invoices.length > 0)) {
    const paymentDate = resolvePaymentOgnoo();
    const firstInvoice =
      updatedInvoices.length > 0 ? updatedInvoices[0].invoice : invoices[0];
    try {
      const tulsunDoc = new GuilgeeAvlaguudModel({
        baiguullagiinId: String(firstInvoice.baiguullagiinId),
        baiguullagiinNer: firstInvoice.baiguullagiinNer || "",
        barilgiinId: firstInvoice.barilgiinId || "",
        gereeniiId: firstInvoice.gereeniiId,
        gereeniiDugaar: firstInvoice.gereeniiDugaar || "",
        orshinSuugchId: firstInvoice.orshinSuugchId || "",
        nekhemjlekhId: firstInvoice._id?.toString() || null,

        ognoo: paymentDate,
        tulsunDun: dun,
        tulsunAldangi: 0,

        turul: "төлөлт",
        zardliinTurul: "",
        zardliinId: "",
        zardliinNer: "",

        tailbar: tailbar || "Төлөлт хийгдлээ",

        source: "nekhemjlekh",
        guilgeeKhiisenAjiltniiNer: ajiltanMeta.ner,
        guilgeeKhiisenAjiltniiId: ajiltanMeta.id,
      });

      const savedTulsun = await tulsunDoc.save();
      tulsunAvlagaDocs.push(savedTulsun);
    } catch (tulsunError) {
      console.error(
        "❌ [INVOICE PAYMENT] Error creating GuilgeeAvlaguud (payment):",
        tulsunError.message,
      );
    }
  }

  if (remainingPayment > 0) {
    const gereesToUpdate = new Set();

    if (gereeniiId) {
      gereesToUpdate.add(gereeniiId);
    } else if (orshinSuugchId) {
      const gereeQuery = {
        orshinSuugchId: String(orshinSuugchId),
        baiguullagiinId: String(baiguullagiinId),
        tuluv: { $ne: "Цуцалсан" },
      };
      if (barilgiinId) {
        gereeQuery.barilgiinId = String(barilgiinId);
      }

      const gerees = await GereeModel.find(gereeQuery).select("_id").lean();
      gerees.forEach((g) => gereesToUpdate.add(g._id.toString()));
    } else if (nekhemjlekhiinIds && nekhemjlekhiinIds.length > 0) {
      const invoiceGerees = await NekhemjlekhiinTuukh.find({
        _id: { $in: nekhemjlekhiinIds },
      })
        .select("gereeniiId")
        .lean();

      invoiceGerees.forEach((inv) => {
        if (inv.gereeniiId) gereesToUpdate.add(inv.gereeniiId);
      });
    }

    if (gereesToUpdate.size > 0) {
      const balancePerGeree = remainingPayment / gereesToUpdate.size;

      for (const gereeId of gereesToUpdate) {
        try {
          const geree = await GereeModel.findById(gereeId);
          if (!geree) continue;

          let leftoverForGeree = balancePerGeree;

          try {
            const openTulukhRows = await GuilgeeAvlaguudModel.find({
              gereeniiId: String(gereeId),
              baiguullagiinId: String(baiguullagiinId),
              uldegdel: { $gt: 0 },
            })
              .sort({ ognoo: 1, createdAt: 1 })
              .lean();

            for (const row of openTulukhRows) {
              if (leftoverForGeree <= 0) break;
              const currentUldegdel = row.uldegdel || 0;
              if (currentUldegdel <= 0) continue;

              const applyHere = Math.min(leftoverForGeree, currentUldegdel);
              const newUldegdel = currentUldegdel - applyHere;

              await GuilgeeAvlaguudModel.updateOne(
                { _id: row._id },
                { $set: { uldegdel: newUldegdel } },
              );

              leftoverForGeree -= applyHere;
            }
          } catch (tulukhErr) {
            console.error(
              `❌ [INVOICE PAYMENT] Error applying remaining to avlaga:`,
              tulukhErr.message,
            );
          }

          // 2) Only what's left after avlaga goes to positiveBalance
          if (leftoverForGeree > 0) {
            geree.positiveBalance =
              (geree.positiveBalance || 0) + leftoverForGeree;
          }

          gereesNeedingRecalc.add(String(geree._id.toString()));
          await geree.save();
          gereePositiveBalanceMap.set(gereeId, geree.positiveBalance);
        } catch (error) {
          console.error(
            `❌ [INVOICE PAYMENT] Error applying remaining payment for geree ${gereeId}:`,
            error.message,
          );
        }
      }
    }
  }

  // Recalculation logic removed as per request.


  return {
    success: true,
    updatedCount: updatedInvoices.length,
    totalFound: invoices.length,
    paymentAmount: dun,
    remainingBalance: remainingPayment,
    positiveBalanceAdded: remainingPayment > 0 ? remainingPayment : 0,
    message: `Applied ${dun - remainingPayment}₮ to ${updatedInvoices.length} invoice(s)${remainingPayment > 0 ? `, saved ${remainingPayment}₮ as positive balance` : ""}`,
    invoices: updatedInvoices.map(
      ({ invoice, amountApplied, isFullyPaid }) => ({
        _id: invoice._id,
        nekhemjlekhiinDugaar: invoice.nekhemjlekhiiDugaar,
        gereeniiDugaar: invoice.gereeniiDugaar,
        niitTulbur: invoice.niitTulbur,
        amountApplied,
        isFullyPaid,
        uldegdel: invoice.uldegdel || 0,
        tuluv: invoice.tuluv,
        tulsunOgnoo: invoice.tulsunOgnoo,
      }),
    ),
    // NEW: high‑level view of payment projection rows created
    tulsunAvlaga: tulsunAvlagaDocs.map((doc) => ({
      _id: doc._id,
      gereeniiId: doc.gereeniiId,
      gereeniiDugaar: doc.gereeniiDugaar,
      nekhemjlekhId: doc.nekhemjlekhId,
      tulsunDun: doc.tulsunDun,
      turul: doc.turul,
      source: doc.source,
      ognoo: doc.ognoo,
    })),
    positiveBalance: Array.from(gereePositiveBalanceMap.entries()).map(
      ([gereeId, balance]) => ({
        gereeniiId: gereeId,
        positiveBalance: balance,
      }),
    ),
  };
}

/**
 * Get payment summary (tulsunDun) for a single geree from GuilgeeAvlaguud.
 *
 * Returns total paid, split by invoice payments and prepayments.
 *
 * @param {Object} options
 * @param {String} options.baiguullagiinId - Organization ID (required)
 * @param {String} options.gereeniiId - Contract ID (required)
 */
async function getGereeniiTulsunSummary(options) {
  const {
    baiguullagiinId,
    gereeniiId,
    barilgiinId,
    ekhlekhOgnoo,
    duusakhOgnoo,
  } = options || {};

  if (!baiguullagiinId) {
    throw new Error("baiguullagiinId is required");
  }
  if (!gereeniiId && !barilgiinId) {
    throw new Error("Either gereeniiId or barilgiinId must be provided");
  }

  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
  );

  if (!kholbolt) {
    throw new Error(`Холболт олдсонгүй: ${baiguullagiinId}`);
  }

  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);

  const match = { baiguullagiinId: String(baiguullagiinId) };
  if (gereeniiId) match.gereeniiId = String(gereeniiId);
  if (barilgiinId) match.barilgiinId = String(barilgiinId);

  if (ekhlekhOgnoo || duusakhOgnoo) {
    match.ognoo = {};
    if (ekhlekhOgnoo) match.ognoo.$gte = new Date(ekhlekhOgnoo);
    if (duusakhOgnoo) match.ognoo.$lte = new Date(duusakhOgnoo);
  }

  const [row] = await GuilgeeAvlaguudModel.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: "$gereeniiId",
        totalTulsunDun: { $sum: "$tulsunDun" },
        totalInvoicePayment: {
          $sum: {
            $cond: [{ $eq: ["$turul", "төлөлт"] }, "$tulsunDun", 0],
          },
        },
        totalPrepayment: {
          $sum: {
            $cond: [{ $eq: ["$turul", "төлөлт"] }, "$tulsunDun", 0],
          },
        },
      },
    },
  ]);

  return {
    success: true,
    gereeniiId: gereeniiId ? String(gereeniiId) : undefined,
    barilgiinId: barilgiinId ? String(barilgiinId) : undefined,
    totalTulsunDun: row?.totalTulsunDun || 0,
    totalInvoicePayment: row?.totalInvoicePayment || 0,
    totalPrepayment: row?.totalPrepayment || 0,
  };
}

module.exports = {
  markInvoicesAsPaid,
  getGereeniiTulsunSummary,
};
