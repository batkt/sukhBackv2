const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  tailanOrlogoAvlaga,
  tailanSariinTulbur,
  tailanNekhemjlekhiinTuukh,
  tailanAvlagiinNasjilt,
  tailanGuitsetgel,
  tailanUdsanAvlaga,
  tailanTsutslasanGereeniiAvlaga,
  tailanExport,
  tailanZogsool,
  tailanNegtgelTailan,
  tailanOrshinSuugchSariinMatrix,
} = require("../controller/tailan");

const cacheMiddleware = require("../middleware/cacheMiddleware");

// Өр, авлагын тайлан (оршин суугчдийн) - Байр, орц, давхар, тоогоор хайж хэн төлбөрөө төлсөн, хэн төлөөгүйг хянах
router.all("/tailan/orlogo-avlaga", tokenShalgakh, cacheMiddleware(300), tailanOrlogoAvlaga);

// Сарын төлбөр тайлан (сар сараар нэмээд улиралаар шүүж харах боломжтой, хураангуй дэлгэрэнгүй)
router.all("/tailan/sariin-tulbur", tokenShalgakh, cacheMiddleware(300), tailanSariinTulbur);

// Нэхэмжлэлийн түүх (Бүх үүссэн нэхэмжлэлийн жагсаалтыг хянах)
router.all("/tailan/nekhemjlekhiin-tuukh", tokenShalgakh, cacheMiddleware(300), tailanNekhemjlekhiinTuukh);

// Авлагын насжилтийн тайлан (Төлөгдөөгүй төлбөрийн насжилтыг тодорхойлох)
router.all("/tailan/avlagiin-nasjilt", tokenShalgakh, cacheMiddleware(300), tailanAvlagiinNasjilt);

// Гүйцэтгэлийн тайлан (Сарын төлөвлөгөөт орлого vs бодит орлого г.м ба Зардлын төсөв vs бодит зардал г.м)
router.all("/tailan/guitsetgel", tokenShalgakh, cacheMiddleware(300), tailanGuitsetgel);

// Төлөгдөөгүй удсан авлага 2+ сар
router.all("/tailan/udsan-avlaga", tokenShalgakh, cacheMiddleware(300), tailanUdsanAvlaga);

// Цуцлагдсан гэрээний авлага
router.all("/tailan/tsutslasan-gereenii-avlaga", tokenShalgakh, cacheMiddleware(300), tailanTsutslasanGereeniiAvlaga);

// Тайланг excel/pdf-р татаж авах боломж
router.all("/tailan/export", tokenShalgakh, cacheMiddleware(300), tailanExport);

// Зогсоолын тайлан - Оршин суугчдын урьсан зочдын машин
router.all("/tailan/zogsool", tokenShalgakh, cacheMiddleware(300), tailanZogsool);

// Нэгтгэл тайлан - Гэрээгээр бүлэглэсэн нэхэмжлэлийн авлагын нэгтгэл
router.all("/tailan/negtgel", tokenShalgakh, cacheMiddleware(300), tailanNegtgelTailan);

// Урвуу хүснэгтэн тайлан - Сарын төлбөрийг сар сараар харуулах
router.all("/tailan/resident-monthly-matrix", tokenShalgakh, cacheMiddleware(300), tailanOrshinSuugchSariinMatrix);

module.exports = router;
