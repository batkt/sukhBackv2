/**
 * Гэрээнүүдээс ашиглалтын зардлыг хасах/синк хийх нэгдсэн хэрэгсэл.
 *
 * ЯАГААД ТУСДАА ФАЙЛ БОЛСОН БЭ:
 *
 * Зардал устгахад гэрээнээс нь хасах код 3 газар ТУСТУСДАА бичигдсэн байв
 * (`routes/ashiglaltiinZardluudRoute.js`-ийн хоёр зам, `models/ashiglaltiinZardluud.js`
 * -ийн hook). Тааруулах дүрэм нь газар бүр өөр байсан тул нэг зам хасдаг
 * зардлыг нөгөө нь хасахгүй өнгөрөх боломжтой байлаа.
 *
 * ХАМГИЙН ЧУХАЛ ЗАСВАР:
 *
 * Өмнө нь гэрээ бүр дээр `geree.save()` дууддаг байсан. `save()` нь баримтыг
 * БҮХЭЛД нь шалгадаг (`gereeSchema.tuluv` дээр `enum: ["Идэвхтэй","Цуцалсан"]`
 * гэх мэт). Хуучин/импортоор орж ирсэн ганц гэрээ энэ шалгалтад унамагц
 * давталт бүхэлдээ таслагдаж, ДАРААГИЙН бүх гэрээнээс зардал хасагдалгүй
 * үлддэг байв — зардал нь `ashiglaltiinZardluud`-аас устсан ч гэрээнд нь
 * үлдсэн тул ДАРАА САРЫН нэхэмжлэхэд дахин бичигддэг.
 *
 * Синк товч ч яг ижил давталттай байсан тул ижил гэрээн дээр унаад,
 * "цэвэрлэх" гэсэн оролдлого ч үр дүнгүй байв.
 *
 * Энд:
 *   1. `updateOne`-оор зөвхөн хэрэгтэй талбарыг бичнэ — Mongoose нь validator-
 *      ыг анхдагчаар ажиллуулахгүй тул хуучин өгөгдөлтэй гэрээ ч саадгүй
 *      шинэчлэгдэнэ.
 *   2. Гэрээ бүрийг ТУСДАА try/catch-д оруулсан — нэг нь унасан ч бусад нь
 *      үргэлжилнэ.
 *   3. Унасан гэрээг тоолж, дуудагч руу буцаана — чимээгүй бүтэлгүйтэхгүй.
 */

const Geree = require("../models/geree");

/** Текстийг жишихэд бэлтгэнэ. */
const jishiye = (utga) => String(utga || "").trim().toLowerCase();

/**
 * Гэрээн доторх зардлын мөр нь устгаж буй зардалтай ижил эсэх.
 *
 * Нэр нь ЗААВАЛ таарна. Төрөл нь аль нэг талдаа хоосон бол таарсанд тооцно —
 * хуучин гэрээн дэх хуулбарт `turul` бөглөгдөөгүй байдаг.
 */
function zardalAdilUu(murZardal, ustgakhZardal) {
  const ner = jishiye(ustgakhZardal?.ner);
  const murNer = jishiye(murZardal?.ner);
  if (!ner || !murNer || ner !== murNer) return false;

  const turul = jishiye(ustgakhZardal?.turul);
  const murTurul = jishiye(murZardal?.turul);
  if (turul && murTurul && turul !== murTurul) return false;

  return true;
}

/** Зардлын жагсаалтаас нийт төлбөрийг бодно (өмнөх кодтой ижил дүрэм). */
const niitTulburBodoyo = (zardluud) =>
  (zardluud || []).reduce((dun, z) => dun + (z?.tariff || 0), 0);

/**
 * Зардал хамаарах гэрээнүүдийн шүүлт.
 *
 * Барилгатай зардал нь тухайн барилгын гэрээнүүд, мөн барилга нь тодорхойгүй
 * гэрээнүүдэд хамаарна. Барилгагүй (байгууллагын нийтийн) зардал бүх гэрээнд
 * хамаарна.
 */
function gereeniiShuult(baiguullagiinId, barilgiinId) {
  const shuult = { baiguullagiinId: String(baiguullagiinId) };
  if (barilgiinId) {
    shuult.$or = [
      { barilgiinId: String(barilgiinId) },
      { barilgiinId: { $exists: false } },
      { barilgiinId: null },
      { barilgiinId: "" },
    ];
  }
  return shuult;
}

/**
 * Нэг гэрээний зардлын жагсаалтыг бүхэлд нь бичнэ.
 *
 * `save()` БИШ `updateOne` ашиглаж буйн учир нь файлын толгойд тайлбарласан —
 * баримтын бусад (бидэнтэй хамаагүй) талбарын алдаа энэ бичилтийг унагахгүй.
 */
async function gereeniiZardluudBichye(Model, gereeniiId, zardluud) {
  await Model.updateOne(
    { _id: gereeniiId },
    { $set: { zardluud, niitTulbur: niitTulburBodoyo(zardluud) } },
  );
}

/**
 * Устгасан ашиглалтын зардлыг БҮХ хамаарах гэрээнээс хасна.
 *
 * @returns {{zassan:number, shalgasan:number, aldaatai:Array<{gereeniiId:string,gereeniiDugaar:string,aldaa:string}>}}
 */
async function zardlaasGereenuudiigTseverleye(kholbolt, zardal) {
  const Model = Geree(kholbolt);
  const shuult = {
    ...gereeniiShuult(zardal.baiguullagiinId, zardal.barilgiinId),
    "zardluud.0": { $exists: true },
  };

  // `lean()` — зөвхөн уншиж, шүүгээд `updateOne`-оор бичих тул баримтыг
  // Mongoose-ийн бүрэн обьект болгож хувиргах шаардлагагүй.
  const gereenuud = await Model.find(shuult)
    .select({ zardluud: 1, gereeniiDugaar: 1 })
    .lean();

  let zassan = 0;
  const aldaatai = [];

  for (const geree of gereenuud) {
    try {
      const uldekh = (geree.zardluud || []).filter(
        (z) => !zardalAdilUu(z, zardal),
      );
      if (uldekh.length === (geree.zardluud || []).length) continue;

      await gereeniiZardluudBichye(Model, geree._id, uldekh);
      zassan++;
    } catch (aldaa) {
      // Нэг гэрээ унасан ч бусдыг үргэлжлүүлнэ — чимээгүй биш, бүртгэнэ.
      console.error(
        `[zardalTseverlegee] гэрээнээс хасаж чадсангүй: ${geree.gereeniiDugaar || geree._id} —`,
        aldaa?.message,
      );
      aldaatai.push({
        gereeniiId: String(geree._id),
        gereeniiDugaar: geree.gereeniiDugaar || "",
        aldaa: aldaa?.message || "Тодорхойгүй алдаа",
      });
    }
  }

  return { zassan, shalgasan: gereenuud.length, aldaatai };
}

module.exports = {
  zardalAdilUu,
  niitTulburBodoyo,
  gereeniiShuult,
  gereeniiZardluudBichye,
  zardlaasGereenuudiigTseverleye,
};
