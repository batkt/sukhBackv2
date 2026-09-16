/**
 * Excel файлуудын нэгдсэн толгойн загвар.
 *
 * Өмнө нь экспорт бүр өөрийн өнгийг сонгодог байв — саарал (E0E0E0), хар хөх
 * (2F5597), цэнхэр (6FA8FF), цайвар ногоон (C6EFCE), шар (FFEB9C) гэх мэт.
 * Ингэснээр нэг системээс гарсан файлууд өөр өөр бүтээгдэхүүний юм шиг
 * харагддаг байлаа.
 *
 * Энд нэг эх сурвалж болгон төвлөрүүлэв. Өнгө нь вэбийн `--theme` токентой
 * (`#059669`, globals.css) нийцнэ — Excel нь үргэлж "цайвар" горимд нээгддэг
 * тул гэрэл/харанхуйн хувилбар шаардлагагүй.
 *
 * ЯМАР ӨНГИЙГ ЭНД ОРУУЛААГҮЙ ВЭ: утга илэрхийлдэг өнгүүд. Жишээ нь
 * «бөглөх шаардлагагүй» улбар шар багана, мөрийн төлөв заасан ногоон/улаан,
 * нийлбэр мөрийн саарал. Тэдгээрийг толгойтой нэгтгэвэл мэдээлэл алдагдана.
 */

/** Системийн үндсэн өнгө (вэбийн `--theme`). ARGB — эхний хоёр орон нь alpha. */
const TOLGOI_UNGU = "FF059669";

/** Толгойн цайвар хувилбар — хоёрдогч мөр, заавал биш багананд. */
const TOLGOI_ZOOLON = "FFD1FAE5";

/** Толгой дээрх бичгийн өнгө (тод дэвсгэр дээр цагаан). */
const TOLGOI_BICHIG = "FFFFFFFF";

/** Цайвар дэвсгэр дээрх бичгийн өнгө. */
const TOLGOI_BICHIG_BARAAN = "FF065F46";

const NIMGEN_KHUREE = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

/**
 * Нэг нүдийг толгойн загварт оруулна.
 *
 * @param {object} cell exceljs-ийн нүд
 * @param {object} [tokhirgoo]
 * @param {boolean} [tokhirgoo.zoolon] цайвар хувилбар эсэх
 * @param {boolean} [tokhirgoo.khureegui] хүрээ зурахгүй эсэх
 */
function tolgoiNud(cell, tokhirgoo = {}) {
  const { zoolon = false, khureegui = false } = tokhirgoo;

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: zoolon ? TOLGOI_ZOOLON : TOLGOI_UNGU },
  };
  cell.font = {
    bold: true,
    color: { argb: zoolon ? TOLGOI_BICHIG_BARAAN : TOLGOI_BICHIG },
  };
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
  if (!khureegui) cell.border = NIMGEN_KHUREE;
}

/**
 * Мөрийг бүхэлд нь толгой болгоно.
 *
 * @param {object} row exceljs-ийн мөр
 * @param {object} [tokhirgoo] `tolgoiNud`-тай ижил сонголтууд
 */
function tolgoiMur(row, tokhirgoo = {}) {
  if (!row) return;
  row.eachCell({ includeEmpty: true }, (cell) => tolgoiNud(cell, tokhirgoo));
}

module.exports = {
  TOLGOI_UNGU,
  TOLGOI_ZOOLON,
  TOLGOI_BICHIG,
  TOLGOI_BICHIG_BARAAN,
  NIMGEN_KHUREE,
  tolgoiNud,
  tolgoiMur,
};
