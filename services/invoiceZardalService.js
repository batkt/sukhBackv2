const mongoose = require("mongoose");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const { deleteInvoice } = require("./invoiceDeletionService");
const { createInvoiceForContract } = require("./invoiceService");

/**
 * Update all contracts that use a specific expense template
 */
async function updateGereeAndNekhemjlekhFromZardluud(ashiglaltiinZardal, kholbolt) {
  const GereeModel = Geree(kholbolt);
  const gereenuud = await GereeModel.find({ "zardluud.ner": ashiglaltiinZardal.ner });

  for (const geree of gereenuud) {
    const idx = geree.zardluud.findIndex(z => z.ner === ashiglaltiinZardal.ner);
    if (idx !== -1) {
      geree.zardluud[idx] = { ...geree.zardluud[idx].toObject(), ...ashiglaltiinZardal };
      await geree.save();
      
      // Optionally refresh the current unpaid invoice
      const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
      const unpaid = await NekhemjlekhModel.findOne({ gereeniiId: geree._id, tuluv: "Төлөөгүй" });
      if (unpaid) {
        await deleteInvoice(unpaid._id, geree.baiguullagiinId);
        await createInvoiceForContract(kholbolt, geree._id);
      }
    }
  }
  return { success: true };
}

async function deleteInvoiceZardal(invoiceId, zardalId, baiguullagiinId) {
  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  const NekhemjlekhModel = NekhemjlekhiinTuukh(kholbolt);
  const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud")(kholbolt);

  await GuilgeeAvlaguud.deleteOne({ _id: zardalId });

  await NekhemjlekhModel.findByIdAndUpdate(invoiceId, {
    $pull: { "medeelel.zardluud": { _id: zardalId } }
  });

  return { success: true, message: "Charge removed" };
}

module.exports = {
  updateGereeAndNekhemjlekhFromZardluud,
  deleteInvoiceZardal,
  recalculateGereeBalance: async () => ({ success: true }),
};
