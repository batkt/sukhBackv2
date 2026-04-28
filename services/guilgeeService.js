const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

/**
 * Record a charge (receivable) in the ledger
 */
async function recordCharge(kholbolt, data) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const charge = new GuilgeeAvlaguudModel({
    ...data,
    dun: Math.abs(data.dun || 0), // Positive for charges
    undsenDun: Math.abs(data.dun || 0),
    tulukhDun: Math.abs(data.dun || 0),
    tulsunDun: 0,
    uldegdel: Math.abs(data.dun || 0),
  });
  return await charge.save();
}

async function recordPayment(kholbolt, data) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const paidAmount = Math.abs(data.dun || 0);

  const paymentRecord = new GuilgeeAvlaguudModel({
    ...data,
    dun: -paidAmount,
    tulsunDun: paidAmount,
    undsenDun: 0,
    tulukhDun: 0,
    uldegdel: -paidAmount,
    turul: "төлөлт",
  });
  await paymentRecord.save();

  let remaining = paidAmount;
  const query = {
    gereeniiId: data.gereeniiId,
    baiguullagiinId: data.baiguullagiinId,
    uldegdel: { $gt: 0 },
  };

  if (data.allocationFilter) {
    Object.assign(query, data.allocationFilter);
  }

  const openCharges = await GuilgeeAvlaguudModel.find(query).sort({ ognoo: 1, createdAt: 1 });

  for (const charge of openCharges) {
    if (remaining <= 0) break;
    const applyHere = Math.min(remaining, charge.uldegdel);
    
    charge.tulsunDun = (charge.tulsunDun || 0) + applyHere;
    charge.uldegdel = Math.round((charge.undsenDun - charge.tulsunDun) * 100) / 100;
    await charge.save();

    remaining = Math.round((remaining - applyHere) * 100) / 100;
  }

  return paymentRecord;
}

async function getBalance(kholbolt, query) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const records = await GuilgeeAvlaguudModel.find(query).select("uldegdel").lean();
  return records.reduce((sum, r) => sum + (r.uldegdel || 0), 0);
}

module.exports = {
  recordCharge,
  recordPayment,
  getBalance,
};
