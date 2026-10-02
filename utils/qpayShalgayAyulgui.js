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

/**
 * QPay-ийн хариунаас ТӨЛСӨН огноо (payments[].payment_date). Төлбөрийг
 * боловсруулсан мөчөөр биш, иргэн бодитоор төлсөн огноогоор бүртгэхэд —
 * хоцорч ирсэн callback / нөхөх скриптийн үед ч огноо зөв гарна.
 */
function qpayTulsunOgnoo(khariu) {
  const tulburuud = Array.isArray(khariu?.payments) ? khariu.payments : [];
  const paid = tulburuud.find((p) => p?.payment_status === "PAID" || p?.status === "PAID") || tulburuud[0];
  const guilgee = Array.isArray(paid?.transactions) ? paid.transactions[0] : null;
  const raw =
    paid?.payment_date ||
    paid?.paid_date ||
    paid?.payment_created_date ||
    paid?.created_date ||
    guilgee?.transaction_date ||
    guilgee?.created_date ||
    khariu?.paid_date ||
    // QPay /payment/check: нэхэмжлэх PAID болсон мөч (жишээ 2026-10-02T00:21:52Z)
    (["PAID", "CLOSED"].includes(String(khariu?.invoice_status || "").toUpperCase())
      ? khariu?.invoice_status_date
      : null) ||
    null;
  const d = raw ? new Date(raw) : null;
  // QPay огноо өгөөгүй бол ТААХГҮЙ — null (дуудагч нь одоогийн цагийг хэрэглэнэ)
  if (!d || isNaN(d) || d.getTime() > Date.now() + 60000) return null;
  return d;
}

/**
 * QPay-ийн хариунаас ТӨЛСӨН дүн. Хариунд дүн байхгүй (зарим үед payments
 * хоосон ирдэг) бол 0 — дуудагч нь QR үүсгэсэн дүнг (QuickQpayObject.amount)
 * нөөц болгоно. QPay QR нь тогтмол дүнтэй тул PAID бол тэр дүнг л төлсөн.
 */
function qpayTulsunDun(khariu) {
  const tulburuud = (Array.isArray(khariu?.payments) ? khariu.payments : []).filter(
    (p) => p?.payment_status === "PAID" || p?.status === "PAID",
  );
  const too = (v) => Number(v) || 0;
  const niit = tulburuud.reduce(
    (s, p) =>
      s +
      (too(p?.payment_amount) ||
        too(p?.amount) ||
        too(p?.paid_amount) ||
        too(p?.transactions?.[0]?.amount)),
    0,
  );
  return niit || too(khariu?.paid_amount) || 0;
}

module.exports = { qpayShalgayAyulgui, qpayTulsunOgnoo, qpayTulsunDun };
