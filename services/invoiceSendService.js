const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const { createInvoiceForContract } = require("./invoiceService");
const { deleteInvoice } = require("./invoiceDeletionService");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/**
 * Handle manual invoice generation and sending
 */
async function manualSendInvoice(gereeId, baiguullagiinId, override = false, options = {}) {
  try {
    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    if (!kholbolt) throw new Error("Connection not found");

    // 1. Handle Overwrite logic
    if (override) {
      // Find existing unpaid invoice for this contract/month (Simplified)
      const existing = await NekhemjlekhiinTuukh(kholbolt).findOne({ 
        gereeniiId: gereeId, 
        tuluv: { $ne: "Төлсөн" } 
      });
      if (existing) {
        await deleteInvoice(existing._id, baiguullagiinId);
      }
    }

    // 2. Create the invoice
    const result = await createInvoiceForContract(kholbolt, gereeId, options);
    if (!result.success) return result;

    // 3. Send notifications (Placeholder for SMS/Email)
    // await sendNotifications(result.invoiceId);

    return { success: true, invoiceId: result.invoiceId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function manualSendMassInvoices(baiguullagiinId, gereeIds, options = {}) {
  const results = [];
  for (const id of gereeIds) {
    results.push(await manualSendInvoice(id, baiguullagiinId, true, options));
  }
  return { success: true, results };
}

module.exports = {
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices: manualSendMassInvoices,
};
