/**
 * Ажилтан хөнгөлөлт бүртгэх эрхтэй эсэх (`tulbur.khungulultOruulakh`).
 *
 * Токен нь зөвхөн `id`-г авч явдаг тул ажилтныг баазаас уншина. Админ
 * бүх эрхтэй. Дэлгэц дээр товчийг нуудаг ч API руу шууд хандахад нуулт нь
 * хамгаалалт болохгүй тул сервер тал бүрд давхар шалгана.
 */
async function khungulultOruulakhErkhteiEsekh(ajiltniiId) {
  if (!ajiltniiId) {
    console.warn("[Хөнгөлөлт эрх] ⛔ токенд ажилтны id алга");
    return false;
  }
  try {
    const { db } = require("zevbackv2");
    const Ajiltan = require("../models/ajiltan");
    const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
      .findById(ajiltniiId)
      .select("erkh tsonkhniiErkhuud")
      .lean();
    if (!ajiltan) {
      console.warn(`[Хөнгөлөлт эрх] ⛔ ажилтан олдсонгүй: ${ajiltniiId}`);
      return false;
    }
    if (String(ajiltan.erkh || "").toLowerCase() === "admin") return true;

    const erkhuud = Array.isArray(ajiltan.tsonkhniiErkhuud)
      ? ajiltan.tsonkhniiErkhuud
      : [];
    // Вэб талын hasPermission-тэй ижил: «/tulbur/x», «tulbur/x», «tulbur.x».
    const ok = [
      "/tulbur/khungulultOruulakh",
      "tulbur/khungulultOruulakh",
      "tulbur.khungulultOruulakh",
    ].some((e) => erkhuud.includes(e));
    if (!ok) {
      console.warn(
        `[Хөнгөлөлт эрх] ⛔ ${ajiltniiId} (erkh=${ajiltan.erkh || "-"}) «Хөнгөлөлт оруулах» эрхгүй`
      );
    }
    return ok;
  } catch (err) {
    console.error("Хөнгөлөлтийн эрх шалгахад алдаа:", err.message);
    return false;
  }
}

module.exports = { khungulultOruulakhErkhteiEsekh };
