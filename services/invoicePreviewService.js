const Geree = require("../models/geree");
const GereeniiZagvar = require("../models/gereeniiZagvar");
const { calculateGereeCharges } = require("./invoiceService");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/**
 * Preview what an invoice would look like without saving
 */
const previewInvoice = async (gereeId, baiguullagiinId, barilgiinId, options = {}) => {
  try {
    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    if (!kholbolt) throw new Error("Connection not found");

    const geree = await Geree(kholbolt).findById(gereeId).lean();
    if (!geree) throw new Error("Contract not found");

    // Fetch the matching contract template (zagvar) for this building/org
    const zagvar = await GereeniiZagvar(kholbolt)
      .findOne({
        baiguullagiinId: geree.baiguullagiinId,
        barilgiinId: geree.barilgiinId,
      })
      .lean();

    if (options.targetMonth && options.targetYear) {
      options.billingDate = new Date(
        Number(options.targetYear),
        Number(options.targetMonth) - 1,
        15
      );
    }

    const { charges, total } = await calculateGereeCharges(kholbolt, geree, options);

    return {
      success: true,
      data: {
        ...geree,
        zagvar,
        gereeniiDugaar: geree.gereeniiDugaar,
        niitTulbur: total,
        zardluud: charges,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = { previewInvoice };
