const mongoose = require("mongoose");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

const ROUNDING = 100;

function roundMoney(amount) {
  return Math.round((amount || 0) * ROUNDING) / ROUNDING;
}

/**
 * Get MongoDB client for starting transactions
 */
function getMongoClient(kholbolt) {
  if (!kholbolt) return null;
  return kholbolt.client || (kholbolt.kholbolt ? kholbolt.kholbolt.client : null);
}

/**
 * Record a charge (receivable) in the ledger
 */
async function recordCharge(kholbolt, data, options = {}) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const amount = roundMoney(Math.abs(data.dun || 0));

  // Automatically find or CREATE a 'home' invoice if not provided
  if (!data.nekhemjlekhId && data.gereeniiId) {
    const invoiceService = require("./invoiceService");
    const activeInv = await invoiceService.ensureActiveInvoice(kholbolt, data.gereeniiId);
    if (activeInv) {
      data.nekhemjlekhId = activeInv._id.toString();
    }
  }

  const charge = new GuilgeeAvlaguudModel({
    ...data,
    dun: amount,
    undsenDun: amount,
    tulukhDun: amount,
    tulsunDun: 0,
    tulsunAldangi: 0,
  });

  if (options.session) {
    charge.$session(options.session);
  }

  const saved = await charge.save();

  // Sync statuses immediately
  if (data.gereeniiId) {
    await syncInvoicesStatus(kholbolt, data.gereeniiId).catch(err => {
      console.error("❌ [LEDGER SYNC] syncInvoicesStatus failed:", err.message);
    });
  }

  return saved;
}

/**
 * Record a single payment in the ledger
 */
async function recordPayment(kholbolt, data, options = {}) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const paidAmount = roundMoney(Math.abs(data.dun || 0));

  if (paidAmount <= 0) {
    return { success: false, error: "Invalid payment amount" };
  }

  const { session } = options;

  if (data.bankniiGuilgeeId) {
    const existing = await GuilgeeAvlaguudModel.findOne({
      bankniiGuilgeeId: data.bankniiGuilgeeId,
      baiguullagiinId: data.baiguullagiinId,
      turul: "төлөлт"
    }).session(session);

    if (existing) {
      console.log(`ℹ️ [LEDGER] Duplicate payment ignored: ${data.bankniiGuilgeeId}`);
      return { success: true, paymentRecord: existing, alreadyExists: true };
    }
  }

  const paymentRecord = new GuilgeeAvlaguudModel({
    ...data,
    dun: -paidAmount,
    tulsunDun: paidAmount,
    undsenDun: 0,
    tulukhDun: 0,
    turul: "төлөлт",
  });

  if (session) {
    paymentRecord.$session(session);
  }

  await paymentRecord.save();
  console.log(`✅ [LEDGER] Payment persisted: ${paymentRecord._id}, amount=${paymentRecord.dun}`);

  // Trigger Full Sync of invoice statuses for this contract
  if (data.gereeniiId) {
    await syncInvoicesStatus(kholbolt, data.gereeniiId).catch((err) => {
      console.error("❌ [LEDGER SYNC] syncInvoicesStatus failed:", err.message);
    });
  }

  return { success: true, paymentRecord };
}

/**
 * Synchronize all invoices for a contract based on total ledger balance (Full Sync / FIFO)
 */
async function syncInvoicesStatus(kholbolt, gereeniiId) {
  try {
    const NekhemjlekhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);
    const GuilgeeModel = require("../models/guilgeeAvlaguud")(kholbolt);

    console.log(`🔍 [LEDGER SYNC] Starting sync for contract: ${gereeniiId}`);

    // 1. Get all ledger entries for this contract
    const allLedger = await GuilgeeModel.find({ gereeniiId: gereeniiId }).lean();

    // 2. Calculate Total Paid (negative entries)
    const totalPayments = allLedger
      .filter((r) => (r.dun || 0) < 0)
      .reduce((sum, r) => sum + Math.abs(r.dun || 0), 0);

    // 3. Calculate Total Charges NOT linked to any invoice (loose charges)
    const looseCharges = allLedger
      .filter((r) => (r.dun || 0) > 0 && !r.nekhemjlekhId)
      .reduce((sum, r) => sum + (r.dun || 0), 0);

    let availableFunds = totalPayments - looseCharges;

    // 4. Fetch all invoices for this contract, sorted by date (FIFO)
    const invoices = await NekhemjlekhModel.find({ gereeniiId: gereeniiId })
      .sort({ ognoo: 1 })
      .lean();

    console.log(`ℹ️ [LEDGER SYNC] Stats: TotalPayments=${totalPayments}, LooseCharges=${looseCharges}, AvailableForInvoices=${availableFunds}, InvoicesCount=${invoices.length}`);

    for (const inv of invoices) {
      // Amount for this specific invoice = sum of positive dun linked to it in ledger
      const invCharge = allLedger
        .filter((r) => String(r.nekhemjlekhId || "") === String(inv._id) && (r.dun || 0) > 0)
        .reduce((sum, r) => sum + (r.dun || 0), 0);

      // Fallback to niitTulbur if ledger doesn't have explicit charges yet
      const targetAmount = invCharge > 0 ? invCharge : (inv.niitTulbur || 0);

      const isPaid = availableFunds + 0.1 >= targetAmount;
      const newStatus = isPaid ? "Төлсөн" : "Төлөөгүй";
      const newUldegdel = isPaid ? 0 : Math.max(0, targetAmount - availableFunds);

      console.log(`   - Inv ${inv.nekhemjlekhiinDugaar} (${inv.ognoo.toISOString().split('T')[0]}): Target=${targetAmount}, Status=${newStatus}, Uldegdel=${newUldegdel}`);

      // Update the invoice with new status AND uldegdel
      // We update regardless of status change to ensure uldegdel is consistent
      await NekhemjlekhModel.findByIdAndUpdate(inv._id, {
        tuluv: newStatus,
        uldegdel: newUldegdel,
        tulsunOgnoo: isPaid ? new Date() : null,
      });

      if (isPaid) {
        availableFunds -= targetAmount;
      } else {
        availableFunds = 0; 
      }
    }
    console.log(`🏁 [LEDGER SYNC] Sync completed for contract: ${gereeniiId}. Remaining credit: ${availableFunds.toFixed(2)}`);
  } catch (err) {
    console.error("❌ [LEDGER SYNC] Error in syncInvoicesStatus:", err.message, err.stack);
  }
}

/**
 * Record multiple payments atomically within a transaction
 */
async function recordPayments(kholbolt, payments, options = {}) {
  const client = getMongoClient(kholbolt);
  if (!client) return { success: false, error: "MongoDB client not available" };

  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const results = [];
      for (const payment of payments) {
        const res = await recordPayment(kholbolt, payment, { ...options, session });
        results.push(res);
      }
      result = { success: true, results };
    });

    // Sync contract after bulk update
    if (payments[0]?.gereeniiId) {
      await syncInvoicesStatus(kholbolt, payments[0].gereeniiId);
    }

    return result || { success: false, error: "Transaction failed" };
  } finally {
    await session.endSession();
  }
}

/**
 * Get balance using aggregation for accuracy
 */
async function getBalance(kholbolt, query) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const result = await GuilgeeAvlaguudModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        uldegdel: { $sum: "$dun" },
      },
    },
  ]);

  const balance = result[0]?.uldegdel || 0;
  return balance;
}

/**
 * Get detailed balance breakdown by invoice
 */
async function getBalanceByInvoice(kholbolt, query) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const records = await GuilgeeAvlaguudModel.aggregate([
    { $match: { ...query, nekhemjlekhId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$nekhemjlekhId",
        undsenDun: { $sum: "$undsenDun" },
        tulsunDun: { $sum: "$tulsunDun" },
        uldegdel: { $sum: "$uldegdel" },
      },
    },
    { $match: { uldegdel: { $ne: 0 } } },
    { $sort: { _id: 1 } },
  ]);

  return records;
}

module.exports = {
  recordCharge,
  recordPayment,
  recordPayments,
  getBalance,
  getBalanceByInvoice,
  syncInvoicesStatus,
  getMongoClient,
  roundMoney,
};
