/**
 * Гадаа наалтын QR-аар зогсоолын төлбөр төлөх (нэвтрэлтгүй) endpoint.
 *
 * QR уншуулсан хүн QPay-ээр өөрөө төлнө. Тэр нь одоо байгаа /qpayGargaya
 * (turul: "QRGadaa") + /qpaycallbackGadaaSticker гэсэн замаар явдаг тул энд
 * зөвхөн хуудсыг зурахад хэрэгтэй мэдээллийг гаргана.
 *
 * Машины session-ыг хайх нь одоо байгаа нэвтрэлтгүй
 * GET /v1/search_car/:plate_number?baiguullagiinId=&barilgiinId=&freeze=true
 * -аар явна.
 *
 * ЖИЧ: замд "tokhirgoo" гэсэн үг ХЭРЭГЛЭЖ БОЛОХГҮЙ - index.js дээрх
 * exploit-bot шүүлтүүр (tokhirgoo.env-ийг хамгаалдаг) URL-д тэр тэмдэгт
 * орсон бүх хүсэлтийг handler хүртэл хүргэлгүй хоосон 404-ээр тасалдаг.
 */

const express = require("express");
const router = express.Router();
const { Parking } = require("sukhParking-v1");

const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");

/**
 * Зогсоолыг олно.
 *
 * Нэг барилгад хэд хэдэн зогсоол (гадаа/дотор) байж болно. Иймд zogsooliinId
 * дамжуулсан бол ЯГ түүнийг авна - эс тэгвээс буруу зогсоолын данс руу төлбөр
 * явуулах эрсдэлтэй. zogsooliinId байхгүй үед хамгийн эртнийхийг тогтвортой
 * (үргэлж ижил) сонгоно.
 */
async function zogsoolOlyo(kholbolt, baiguullagiinId, barilgiinId, zogsooliinId) {
  if (zogsooliinId) {
    const zogsool = await Parking(kholbolt).findOne({ _id: zogsooliinId });
    // Дамжуулсан зогсоол өөр байгууллагад хамаарах бол хүлээж авахгүй
    if (zogsool && String(zogsool.baiguullagiinId) === String(baiguullagiinId))
      return zogsool;
    return null;
  }
  return Parking(kholbolt)
    .findOne({
      baiguullagiinId: String(baiguullagiinId),
      barilgiinId: String(barilgiinId),
    })
    .sort({ createdAt: 1 });
}

/**
 * GET /zogsool/qr/medeelel/:baiguullagiinId/:barilgiinId
 *
 * Нийтийн QR хуудсыг зурахад хэрэгтэй ХАМГИЙН БАГА мэдээлэл. Зогсоолын бүтэн
 * бичлэгийг нэвтрэлтгүй гаргах нь зохимжгүй тул зөвхөн шаардлагатай
 * талбаруудыг буцаана.
 *
 * ?zogsooliinId= дамжуулбал тухайн зогсоолын мэдээллийг авна - машиныг олсны
 * дараа түүний БОДИТ зогсоолын данс/гарах хугацааг авахад хэрэглэнэ.
 */
router.get(
  "/zogsool/qr/medeelel/:baiguullagiinId/:barilgiinId",
  async (req, res, next) => {
    try {
      const { baiguullagiinId, barilgiinId } = req.params;
      const { zogsooliinId } = req.query;
      const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
      if (!kholbolt)
        return res
          .status(404)
          .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });

      const zogsool = await zogsoolOlyo(
        kholbolt,
        baiguullagiinId,
        barilgiinId,
        zogsooliinId,
      );
      if (!zogsool)
        return res
          .status(404)
          .json({ success: false, message: "Зогсоол олдсонгүй" });

      return res.json({
        success: true,
        data: {
          _id: String(zogsool._id),
          ner: zogsool.ner || "",
          garakhTsag: zogsool.garakhTsag || 30,
          undsenUne: zogsool.undsenUne || 0,
          zogsooliinDans: zogsool.zogsooliinDans || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
