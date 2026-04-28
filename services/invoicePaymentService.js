const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const guilgeeService = require("./guilgeeService");
const { db } = require("zevbackv2");

async function markInvoicesAsPaid(options) {
  const {
    baiguullagiinId,
    dun,
    orshinSuugchId,
    gereeniiId,
    nekhemjlekhiinIds,
    tailbar = null,
  } = options;

  const kholbolt = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(baiguullagiinId));
  if (!kholbolt) return { success: false, error: "Connection not found" };

  const NekhemjlekhiinTuukhModel = NekhemjlekhiinTuukh(kholbolt);

  const allocationFilter = nekhemjlekhiinIds && nekhemjlekhiinIds.length > 0 
    ? { nekhemjlekhId: { $in: nekhemjlekhiinIds } } 
    : {};

  await guilgeeService.recordPayment(kholbolt, {
    baiguullagiinId,
    gereeniiId,
    dun,
    tailbar: tailbar || "Төлбөр төлөв",
    allocationFilter,
  });

  const invoicesToSync = nekhemjlekhiinIds && nekhemjlekhiinIds.length > 0
    ? await NekhemjlekhiinTuukhModel.find({ _id: { $in: nekhemjlekhiinIds } })
    : await NekhemjlekhiinTuukhModel.find({ gereeniiId, tuluv: { $ne: "Төлсөн" } });

  for (const inv of invoicesToSync) {
    const balance = await guilgeeService.getBalance(kholbolt, { nekhemjlekhId: inv._id.toString() });
    inv.tuluv = balance <= 0.01 ? "Төлсөн" : "Төлөөгүй";
    await inv.save();
  }

  return { success: true, updatedCount: invoicesToSync.length };
}

module.exports = {
  markInvoicesAsPaid,
};
