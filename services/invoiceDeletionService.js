const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

/**
 * Delete an invoice and unlink its ledger entries
 */
async function deleteInvoice(invoiceId, baiguullagiinId) {
  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  if (!kholbolt) throw new Error("Connection not found");

  const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);

  const invoice = await NekhemjlekhModel.findById(invoiceId);
  if (!invoice) return { success: false, error: "Invoice not found" };

  const ledgerEntries = await GuilgeeAvlaguudModel.find({ nekhemjlekhId: invoiceId });
  const hasPayments = ledgerEntries.some(e => e.tulsunDun > 0);

  if (hasPayments) {
    return { success: false, error: "Cannot delete invoice with existing payments. Refund first." };
  }

  await GuilgeeAvlaguudModel.deleteMany({ nekhemjlekhId: invoiceId });
  await invoice.deleteOne();

  return { success: true, message: "Invoice deleted" };
}

/**
 * Run delete side effects - called from model pre hooks
 */
async function runDeleteSideEffects(doc) {
  if (!doc) return;
  const invoiceId = doc._id.toString();
  const baiguullagiinId = doc.baiguullagiinId;
  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  if (!kholbolt) return;

  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const ledgerEntries = await GuilgeeAvlaguudModel.find({ nekhemjlekhId: invoiceId });
  const hasPayments = ledgerEntries.some(e => e.tulsunDun > 0);

  if (hasPayments) {
    throw new Error("Cannot delete invoice with existing payments. Refund first.");
  }

  await GuilgeeAvlaguudModel.deleteMany({ nekhemjlekhId: invoiceId });
}

module.exports = {
  deleteInvoice,
  runDeleteSideEffects,
  deleteAllInvoicesForOrg: async () => ({ success: false, message: "Use with caution" }),
};
