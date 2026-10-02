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
  // Салбар эсвэл байгууллага дутуу бол нэхэмжлэх үүсгэхэд хадгалсан бичлэгээс
  if ((!salbar || !baiguullagiinId) && invoice_id) {
    try {
      const bichleg = await QuickQpayObject(kholbolt)
        .findOne({ $or: [{ invoice_id }, { "qpay.invoice_id": invoice_id }] })
        .select({ salbariinId: 1, barilgiinId: 1, baiguullagiinId: 1 })
        .lean();
      if (!salbar) salbar = String(bichleg?.salbariinId || bichleg?.barilgiinId || "");
      if (!baiguullagiinId) baiguullagiinId = bichleg?.baiguullagiinId;
    } catch (_) {
      /* бичлэггүйгээр оролдоно */
    }
  }
  if (!baiguullagiinId && kholbolt?.baiguullagiinId) baiguullagiinId = kholbolt.baiguullagiinId;
  // Багцын qpayShalgay нь QPay-ийн нэхэмжлэхийн дугаарыг `body.id`-аас
  // уншдаг (invoice_id биш!) — үгүй бол QPay руу дугааргүй хүсэлт явж
  // «400 Bad Request» буцдаг байв. Салбарыг `body.barilgiinId`-аар
  // (qpayKhariltsagch.salbaruud[].salbariinId-тай яг тэнцүү) хайдаг.
  if (!salbar) salbar = await anhnySalbar(kholbolt, baiguullagiinId);
  return qpayShalgay(
    {
      id: invoice_id,
      invoice_id,
      baiguullagiinId: String(baiguullagiinId),
      ...(salbar ? { barilgiinId: salbar } : {}),
    },
    kholbolt,
  );
}

/** Бичлэгт салбар хадгалагдаагүй бол байгууллагын QPay-ийн цорын ганц/эхний салбар */
async function anhnySalbar(kholbolt, baiguullagiinId) {
  try {
    const { QpayKhariltsagch } = require("quickqpaypackvSukh");
    if (!QpayKhariltsagch) return "";
    const kh = await QpayKhariltsagch(kholbolt)
      .findOne({ baiguullagiinId: String(baiguullagiinId) })
      .select({ salbaruud: 1 })
      .lean();
    return String(kh?.salbaruud?.[0]?.salbariinId || "");
  } catch (_) {
    return "";
  }
}

module.exports = { qpayShalgayAyulgui };
