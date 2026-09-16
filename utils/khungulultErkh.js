/**
 * Ажилтан хөнгөлөлт бүртгэх эрхтэй эсэх (`tulbur.khungulultOruulakh`).
 *
 * Токен нь зөвхөн `id`-г авч явдаг тул ажилтныг баазаас уншина. Админ
 * бүх эрхтэй. Дэлгэц дээр товчийг нуудаг ч API руу шууд хандахад нуулт нь
 * хамгаалалт болохгүй тул сервер тал бүрд давхар шалгана.
 */
async function khungulultOruulakhErkhteiEsekh(ajiltniiId) {
  if (!ajiltniiId) return false;
  try {
    const { db } = require("zevbackv2");
    const Ajiltan = require("../models/ajiltan");
    const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
      .findById(ajiltniiId)
      .select("erkh tsonkhniiErkhuud")
      .lean();
    if (!ajiltan) return false;
    if (String(ajiltan.erkh || "").toLowerCase() === "admin") return true;

    const erkhuud = Array.isArray(ajiltan.tsonkhniiErkhuud)
      ? ajiltan.tsonkhniiErkhuud
      : [];
    return (
      erkhuud.includes("/tulbur/khungulultOruulakh") ||
      erkhuud.includes("tulbur.khungulultOruulakh")
    );
  } catch (err) {
    console.error("Хөнгөлөлтийн эрх шалгахад алдаа:", err.message);
    return false;
  }
}

module.exports = { khungulultOruulakhErkhteiEsekh };
