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

    // 1. Logic moved to createInvoiceForContract (Upsert pattern)

    // 2. Create the invoice
    const result = await createInvoiceForContract(kholbolt, gereeId, {
      ...options,
      override,
    });
    if (!result.success) return result;

    // 3. Send notifications (Placeholder for SMS/Email)
    // await sendNotifications(result.invoiceId);

    return { success: true, invoiceId: result.invoiceId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function manualSendMassInvoices(baiguullagiinId, gereeIds, override = true, options = {}) {
  const results = [];
  let created = 0;
  let errors = 0;
  const errorsList = [];

  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  const GereeModel = kholbolt ? require("../models/geree")(kholbolt) : null;

  for (const id of gereeIds) {
    try {
      const res = await manualSendInvoice(id, baiguullagiinId, override, options);
      if (res.success) {
        created++;
        results.push(res);
      } else {
        errors++;
        let gereeniiDugaar = id;
        if (GereeModel) {
          const geree = await GereeModel.findById(id).select("gereeniiDugaar toot").lean();
          if (geree) {
            gereeniiDugaar = `${geree.gereeniiDugaar || "Гэрээ"} (Тоот ${geree.toot || ""})`;
          }
        }
        errorsList.push({ gereeId: id, gereeniiDugaar, error: res.error || res.message });
      }
    } catch (err) {
      errors++;
      let gereeniiDugaar = id;
      if (GereeModel) {
        try {
          const geree = await GereeModel.findById(id).select("gereeniiDugaar toot").lean();
          if (geree) {
            gereeniiDugaar = `${geree.gereeniiDugaar || "Гэрээ"} (Тоот ${geree.toot || ""})`;
          }
        } catch (_) {}
      }
      errorsList.push({ gereeId: id, gereeniiDugaar, error: err.message });
    }
  }

  return { 
    success: true, 
    data: { 
      created, 
      errors, 
      errorsList,
      results 
    } 
  };
}

module.exports = {
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices: manualSendMassInvoices,
};
