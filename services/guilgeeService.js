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
 * Uses atomic operation and optional transaction
 */
async function recordCharge(kholbolt, data, options = {}) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const amount = roundMoney(Math.abs(data.dun || 0));

  const charge = new GuilgeeAvlaguudModel({
    ...data,
    dun: amount,
    undsenDun: amount,
    tulukhDun: amount,
    tulsunDun: 0,
    uldegdel: amount,
  });

  if (options.session) {
    charge.$session(options.session);
  }

  return await charge.save();
}

async function recordPayment(kholbolt, data, options = {}) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const paidAmount = roundMoney(Math.abs(data.dun || 0));

  if (paidAmount <= 0) {
    return { success: false, error: "Invalid payment amount" };
  }

  const { session, allocationFilter } = options;

  const paymentRecord = new GuilgeeAvlaguudModel({
    ...data,
    dun: -paidAmount,
    tulsunDun: paidAmount,
    undsenDun: 0,
    tulukhDun: 0,
    uldegdel: -paidAmount,
    turul: "төлөлт",
  });

  if (session) {
    paymentRecord.$session(session);
  }

  await paymentRecord.save();

  let remaining = paidAmount;
  const query = {
    gereeniiId: data.gereeniiId,
    baiguullagiinId: data.baiguullagiinId,
    uldegdel: { $gt: 0 },
  };

  if (allocationFilter) {
    Object.assign(query, allocationFilter);
  }

  const updateOps = [];

  while (remaining > 0) {
    const charge = await GuilgeeAvlaguudModel.findOne({
      ...query,
      uldegdel: { $gt: 0 },
    }).sort({ ognoo: 1, createdAt: 1 });

    if (!charge) break;

    const applyHere = Math.min(remaining, charge.uldegdel);
    const newTulsunDun = roundMoney((charge.tulsunDun || 0) + applyHere);
    const newUldegdel = roundMoney(charge.undsenDun - newTulsunDun);

    const updateResult = await GuilgeeAvlaguudModel.updateOne(
      {
        _id: charge._id,
        uldegdel: charge.uldegdel,
      },
      {
        $inc: { tulsunDun: applyHere },
        $set: { uldegdel: newUldegdel },
      },
      { session }
    );

    if (updateResult.modifiedCount === 0) {
      console.warn(`[GUILGEE] Race condition detected for charge ${charge._id}, retrying...`);
      continue;
    }

    updateOps.push({
      chargeId: charge._id,
      applied: applyHere,
      newTulsunDun,
      newUldegdel,
    });

    remaining = roundMoney(remaining - applyHere);
  }

  if (remaining > 0) {
    console.warn(`[GUILGEE] Overpayment: ${remaining} remains unallocated`);
  }

  return {
    success: true,
    paymentRecord,
    allocated: updateOps,
    unallocated: remaining,
  };
}

/**
 * Record multiple payments atomically within a transaction
 */
async function recordPayments(kholbolt, payments, options = {}) {
  const client = getMongoClient(kholbolt);
  if (!client) {
    return { success: false, error: "MongoDB client not available" };
  }

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
        totalUldegdel: { $sum: "$uldegdel" },
      },
    },
  ]);

  return result[0]?.totalUldegdel || 0;
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
    {
      $match: { uldegdel: { $ne: 0 } },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  return records;
}

module.exports = {
  recordCharge,
  recordPayment,
  recordPayments,
  getBalance,
  getBalanceByInvoice,
  getMongoClient,
  roundMoney,
};
