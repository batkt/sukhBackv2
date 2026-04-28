const mongoose = require("mongoose");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const { normalizeTurul, sumZardalDun } = require("../utils/zardalUtils");

/**
 * Update geree and unpaid invoice when an ashiglaltiinZardal is updated.
 */
async function updateGereeAndNekhemjlekhFromZardluud(
  ashiglaltiinZardal,
  tukhainBaaziinKholbolt,
) {
  try {
    const gereenuud = await Geree(tukhainBaaziinKholbolt, true).find({
      "zardluud.ner": ashiglaltiinZardal.ner,
      "zardluud.turul": ashiglaltiinZardal.turul,
      "zardluud.zardliinTurul": ashiglaltiinZardal.zardliinTurul,
    });

    for (const geree of gereenuud) {
      const zardalIndex = geree.zardluud.findIndex(
        (z) =>
          z.ner === ashiglaltiinZardal.ner &&
          z.turul === ashiglaltiinZardal.turul &&
          z.zardliinTurul === ashiglaltiinZardal.zardliinTurul,
      );

      if (zardalIndex !== -1) {
        geree.zardluud[zardalIndex] = {
          ...geree.zardluud[zardalIndex].toObject(),
          ner: ashiglaltiinZardal.ner,
          turul: normalizeTurul(ashiglaltiinZardal.turul),
          tariff: ashiglaltiinZardal.tariff,
          tariffUsgeer: ashiglaltiinZardal.tariffUsgeer,
          zardliinTurul: ashiglaltiinZardal.zardliinTurul,
          tseverUsDun: ashiglaltiinZardal.tseverUsDun,
          bokhirUsDun: ashiglaltiinZardal.bokhirUsDun,
          usKhalaasniiDun: ashiglaltiinZardal.usKhalaasniiDun,
          tsakhilgaanUrjver: ashiglaltiinZardal.tsakhilgaanUrjver,
          tsakhilgaanChadal: ashiglaltiinZardal.tsakhilgaanChadal,
          tsakhilgaanDemjikh: ashiglaltiinZardal.tsakhilgaanDemjikh,
          suuriKhuraamj: ashiglaltiinZardal.suuriKhuraamj,
          nuatNemekhEsekh: ashiglaltiinZardal.nuatNemekhEsekh,
          dun: ashiglaltiinZardal.dun,
        };

        const niitTulbur = sumZardalDun(geree.zardluud);

        geree.niitTulbur = niitTulbur;

        await geree.save();

        const nekhemjlekh = await nekhemjlekhiinTuukh(
          tukhainBaaziinKholbolt,
        ).findOne({
          gereeniiId: geree._id,
          tuluv: { $ne: "Төлсөн" },
        });

        if (nekhemjlekh) {
          const nekhemjlekhZardalIndex =
            nekhemjlekh.medeelel.zardluud.findIndex(
              (z) =>
                z.ner === ashiglaltiinZardal.ner &&
                z.turul === ashiglaltiinZardal.turul &&
                z.zardliinTurul === ashiglaltiinZardal.zardliinTurul,
            );

          if (nekhemjlekhZardalIndex !== -1) {
            nekhemjlekh.medeelel.zardluud[nekhemjlekhZardalIndex] = {
              ...nekhemjlekh.medeelel.zardluud[nekhemjlekhZardalIndex],
              ner: ashiglaltiinZardal.ner,
              turul: normalizeTurul(ashiglaltiinZardal.turul),
              tariff: ashiglaltiinZardal.tariff,
              tariffUsgeer: ashiglaltiinZardal.tariffUsgeer,
              zardliinTurul: ashiglaltiinZardal.zardliinTurul,
              tseverUsDun: ashiglaltiinZardal.tseverUsDun,
              bokhirUsDun: ashiglaltiinZardal.bokhirUsDun,
              usKhalaasniiDun: ashiglaltiinZardal.usKhalaasniiDun,
              tsakhilgaanUrjver: ashiglaltiinZardal.tsakhilgaanUrjver,
              tsakhilgaanChadal: ashiglaltiinZardal.tsakhilgaanChadal,
              tsakhilgaanDemjikh: ashiglaltiinZardal.tsakhilgaanDemjikh,
              suuriKhuraamj: ashiglaltiinZardal.suuriKhuraamj,
              nuatNemekhEsekh: ashiglaltiinZardal.nuatNemekhEsekh,
              dun: ashiglaltiinZardal.dun,
            };

            nekhemjlekh.niitTulbur = sumZardalDun(
              nekhemjlekh.medeelel.zardluud,
            );

            nekhemjlekh.content = `Гэрээний дугаар: ${geree.gereeniiDugaar}, Нийт төлбөр: ${nekhemjlekh.niitTulbur}₮`;

            await nekhemjlekh.save();
          }
        }
      }
    }

    return { success: true, updatedGereenuud: gereenuud.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a zardal (or guilgee) from an invoice. Returns result shape for API.
 */
async function deleteInvoiceZardal(invoiceId, zardalId, baiguullagiinId) {
  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);

  if (!kholbolt) {
    return {
      success: false,
      statusCode: 404,
      error: "Холболтын мэдээлэл олдсонгүй!",
    };
  }

  const NekhemjlekhModel = nekhemjlekhiinTuukh(kholbolt);
  const GereeModel = Geree(kholbolt);

  const invoice = await NekhemjlekhModel.findById(invoiceId);
  if (!invoice) {
    return {
      success: false,
      statusCode: 404,
      error: "Нэхэмжлэх олдсонгүй!",
    };
  }

  if (!invoice.medeelel || !Array.isArray(invoice.medeelel.zardluud)) {
    return {
      success: false,
      statusCode: 400,
      error: "Энэ нэхэмжлэхэд зардал олдсонгүй!",
    };
  }

  const zardluud = Array.isArray(invoice.medeelel?.zardluud)
    ? invoice.medeelel.zardluud
    : [];
  const guilgeenuud = Array.isArray(invoice.medeelel?.guilgeenuud)
    ? invoice.medeelel.guilgeenuud
    : [];

  let deletedAmount = 0;
  let pullPath = "";

  const zardalIndex = zardluud.findIndex(
    (z) => String(z._id) === String(zardalId),
  );
  const guilgeeIndex = guilgeenuud.findIndex(
    (g) => String(g._id) === String(zardalId),
  );

  if (zardalIndex !== -1) {
    const deletedZardal = zardluud[zardalIndex];
    deletedAmount = Number(
      deletedZardal.dun || deletedZardal.tariff || deletedZardal.tulukhDun || 0,
    );
    pullPath = "medeelel.zardluud";
  } else if (guilgeeIndex !== -1) {
    const deletedGuilgee = guilgeenuud[guilgeeIndex];
    const charge = Number(deletedGuilgee.tulukhDun || 0);
    const payment = Number(deletedGuilgee.tulsunDun || 0);
    deletedAmount = charge - payment;
    pullPath = "medeelel.guilgeenuud";
  } else {
    return {
      success: false,
      statusCode: 404,
      error: "Зардал эсвэл гүйлгээ олдсонгүй (ID mismatch)!",
    };
  }

  const updateQuery = {
    $pull: {
      [pullPath]: {
        _id: mongoose.Types.ObjectId.isValid(zardalId)
          ? new mongoose.Types.ObjectId(zardalId)
          : zardalId,
      },
    },
    $inc: {
      niitTulbur: -deletedAmount,
      ...(zardalIndex !== -1 ? { niitTulburOriginal: -deletedAmount } : {}),
    },
  };

  await NekhemjlekhModel.findByIdAndUpdate(invoiceId, updateQuery);

  if (invoice.gereeniiId && deletedAmount !== 0) {
    await GereeModel.findByIdAndUpdate(invoice.gereeniiId, {
      $inc: { globalUldegdel: -deletedAmount },
    });
  }

  const updatedInvoice = await NekhemjlekhModel.findById(invoiceId);
  if (updatedInvoice && updatedInvoice.niitTulbur <= 0) {
    updatedInvoice.tuluv = "Төлсөн";
    await updatedInvoice.save();
  }


  if (invoice.gereeniiId) {
    await recalculateGereeBalance(invoice.gereeniiId, baiguullagiinId);
  }

  const finalInvoice = await NekhemjlekhModel.findById(invoiceId);

  return {
    success: true,
    message: "Зардал амжилттай устгагдлаа",
    newTotal: finalInvoice?.niitTulbur || 0,
  };
}

/**
 * Recalculate geree globalUldegdel from raw amounts (totalCharges - totalPayments).
 * totalCharges = geree.ekhniiUldegdel + SUM(invoice originals excl. ekhnii) + SUM(avlaga originals)
 * totalPayments = SUM(tulsunAvlaga.tulsunDun)
 */
async function recalculateGereeBalance(gereeId, baiguullagiinId) {
  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);

  if (!kholbolt) {
    return {
      success: false,
      statusCode: 404,
      message: "Connection not found",
    };
  }

  const NekhemjlekhiinTuukhModel = nekhemjlekhiinTuukh(kholbolt);
  const GereeModel = Geree(kholbolt);

  const { recalcGlobalUldegdel } = require("../utils/recalcGlobalUldegdel");
  const updatedGeree = await recalcGlobalUldegdel({
    gereeId,
    baiguullagiinId,
    GereeModel,
    NekhemjlekhiinTuukhModel,
    GereeniiTulukhAvlagaModel: GereeniiTulukhAvlaga(kholbolt),
    GereeniiTulsunAvlagaModel: GereeniiTulsunAvlaga(kholbolt),
  });

  if (!updatedGeree) {
    return { success: false, statusCode: 404, message: "Geree not found" };
  }

  return {
    success: true,
    message: "Balance recalculated successfully",
    data: {
      globalUldegdel: updatedGeree.globalUldegdel,
      positiveBalance: updatedGeree.positiveBalance,
    },
  };
}

module.exports = {
  updateGereeAndNekhemjlekhFromZardluud,
  deleteInvoiceZardal,
  recalculateGereeBalance,
};
