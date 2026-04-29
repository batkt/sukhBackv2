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


// Өр, авлагын тайлан (оршин суугчдийн) - Байр, орц, давхар, тоогоор хайж хэн төлбөрөө төлсөн, хэн төлөөгүйг хянах
router.all("/tailan/orlogo-avlaga", tokenShalgakh, tailanOrlogoAvlaga);

// Сарын төлбөр тайлан (сар сараар нэмээд улиралаар шүүж харах боломжтой, хураангуй дэлгэрэнгүй)
router.all("/tailan/sariin-tulbur", tokenShalgakh, tailanSariinTulbur);

// Нэхэмжлэлийн түүх (Бүх үүссэн нэхэмжлэлийн жагсаалтыг хянах)
router.all("/tailan/nekhemjlekhiin-tuukh", tokenShalgakh, tailanNekhemjlekhiinTuukh);

// Авлагын насжилтийн тайлан (Төлөгдөөгүй төлбөрийн насжилтыг тодорхойлох)
router.all("/tailan/avlagiin-nasjilt", tokenShalgakh, tailanAvlagiinNasjilt);

// Гүйцэтгэлийн тайлан (Сарын төлөвлөгөөт орлого vs бодит орлого г.м ба Зардлын төсөв vs бодит зардал г.м)
router.all("/tailan/guitsetgel", tokenShalgakh, tailanGuitsetgel);

// Төлөгдөөгүй удсан авлага 2+ сар
router.all("/tailan/udsan-avlaga", tokenShalgakh, tailanUdsanAvlaga);

// Цуцлагдсан гэрээний авлага
router.all("/tailan/tsutslasan-gereenii-avlaga", tokenShalgakh, tailanTsutslasanGereeniiAvlaga);

// Тайланг excel/pdf-р татаж авах боломж
router.all("/tailan/export", tokenShalgakh, tailanExport);

// Зогсоолын тайлан - Оршин суугчдын урьсан зочдын машин
router.all("/tailan/zogsool", tokenShalgakh, tailanZogsool);

// Нэгтгэл тайлан - Гэрээгээр бүлэглэсэн нэхэмжлэлийн авлагын нэгтгэл
router.all("/tailan/negtgel", tokenShalgakh, tailanNegtgelTailan);

// Урвуу хүснэгтэн тайлан - Сарын төлбөрийг сар сараар харуулах
router.all("/tailan/resident-monthly-matrix", tokenShalgakh, tailanOrshinSuugchSariinMatrix);

module.exports = router;
