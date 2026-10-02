/**
 * QPay нэхэмжлэхийн төлвийг шалгах (qpayShalgay) — салбарыг заавал дамжуулна.
 *
 * ЯАГААД: олон салбартай байгууллагад quickqpaypackvSukh нь QPay-ийн токеноо
 * салбараар (barilgiinId) сонгодог. Callback-ийн баталгаажуулалт barilgiinId
 * дамжуулдаггүй байсан тул «... undefined ID-тай салбар олдсонгүй» алдаа гарч,
 * төлбөр төлөгдсөн ч бүртгэгддэггүй байв. Салбарыг QuickQpayObject-ийн
 * salbariinId-аас (нэхэмжлэх үүсгэхэд хадгалагдсан) олно.
 */
async function qpayShalgayAyulgui({ invoice_id, baiguullagiinId, barilgiinId }, kholbolt) {
  const { qpayShalgay, QuickQpayObject } = require("quickqpaypackvSukh");
  let salbar = barilgiinId ? String(barilgiinId) : "";
  if (!salbar && invoice_id) {
    try {
      const bichleg = await QuickQpayObject(kholbolt)
        .findOne({ $or: [{ invoice_id }, { "qpay.invoice_id": invoice_id }] })
        .select({ salbariinId: 1, barilgiinId: 1 })
        .lean();
      salbar = String(bichleg?.salbariinId || bichleg?.barilgiinId || "");
    } catch (_) {
      /* салбаргүйгээр оролдоно */
    }
  }
  // Апп-ын ажилладаг /qpayShalgay маршруттай ЯГ ижил: холболтыг body дотор
  // tukhainBaaziinKholbolt-оор дамжуулна. Үгүй бол багц QPay-ийн токеноо
  // олохгүй, QPay «400 Bad Request» буцаадаг байв.
  return qpayShalgay(
    {
      invoice_id,
      baiguullagiinId: String(baiguullagiinId),
      tukhainBaaziinKholbolt: kholbolt,
      ...(salbar ? { barilgiinId: salbar, salbariinId: salbar } : {}),
    },
    kholbolt,
  );
}

module.exports = { qpayShalgayAyulgui };
