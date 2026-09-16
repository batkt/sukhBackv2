/**
 * Ашиглалтын зардлыг Excel-ээр бөөнөөр оруулах / шинэчлэх.
 *
 * Загвар нь тухайн барилгын ОДОО байгаа зардлуудаар дүүргэгдэж татагддаг.
 * Ингэснээр нэг файлаар:
 *   - байгаа зардлуудын тарифыг бөөнөөр засах,
 *   - доор нь шинэ мөр нэмж шинэ зардал үүсгэх
 * хоёуланг нь хийж болно.
 *
 * Тааруулалт: нэг барилгын дотор «Нэр» + «Төрөл» хосоор нь хайж, олдвол
 * ШИНЭЧИЛНЭ, олдохгүй бол ШИНЭЭР үүсгэнэ. Иймд нэг зардлыг хоёр удаа
 * импортлоход давхардахгүй.
 */

const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");
const xlsx = require("xlsx");
const excel = require("exceljs");

const Baiguullaga = require("../models/baiguullaga");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");

/** Хүснэгтийн баганын нэрс — загвар үүсгэх ба унших хоёрт нэг эх сурвалж. */
const BAGANUUD = {
  ner: "Нэр",
  turul: "Төрөл",
  zardliinTurul: "Зардлын төрөл",
  tariff: "Тариф",
  suuriKhuraamj: "Суурь хураамж",
  nuat: "НӨАТ",
  tailbar: "Тайлбар",
};

/** `turul` нь зөвхөн энэ хоёрын нэг байна — аль хүснэгтэд харагдахыг заана. */
const TURLUUD = ["Тогтмол", "Дурын"];

/** Байгууллага, барилга, тухайн баазын холболтыг олж өгнө. */
async function kheregteiZuilsiigOlyo(baiguullagiinId, barilgiinId) {
  const { db } = require("zevbackv2");

  if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
  if (!barilgiinId) throw new aldaa("Барилгын ID хоосон");

  const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
    baiguullagiinId
  );
  if (!baiguullaga) throw new aldaa("Байгууллага олдсонгүй");

  const barilga = baiguullaga.barilguud?.find(
    (b) => String(b._id) === String(barilgiinId)
  );
  if (!barilga) throw new aldaa("Барилга олдсонгүй");

  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullaga._id)
  );
  if (!kholbolt) throw new aldaa("Холболт олдсонгүй");

  return { baiguullaga, barilga, kholbolt };
}

/** "1,234.50" маягийн утгыг тоо болгоно. Хоосон бол null. */
function toogBolgoyo(utga) {
  if (utga === undefined || utga === null || utga === "") return null;
  if (typeof utga === "number") return utga;
  const tseverlesen = String(utga).replace(/[,\s₮]/g, "").trim();
  if (tseverlesen === "") return null;
  const too = parseFloat(tseverlesen);
  return Number.isFinite(too) ? too : null;
}

/** "Тийм"/"Үгүй"/true/1 гэх мэтийг boolean болгоно. */
function tiimEsekh(utga) {
  if (utga === undefined || utga === null || String(utga).trim() === "")
    return false;
  const u = String(utga).trim().toLowerCase();
  return ["тийм", "yes", "true", "1", "+", "y"].includes(u);
}

/** Баганын нэрийг том/жижиг үсэг, илүү зайг үл харгалзан хайна. */
function baganaAvya(mur, ...nerus) {
  for (const ner of nerus) {
    if (mur[ner] !== undefined && mur[ner] !== null) return mur[ner];
    const olson = Object.keys(mur).find(
      (k) => k.trim().toLowerCase() === ner.toLowerCase()
    );
    if (olson) return mur[olson];
  }
  return undefined;
}

/** Нэрийг тааруулахад ашиглах хэлбэр — зай, том/жижиг үсгийг үл тоомсорлоно. */
function tulkhuur(ner, turul) {
  return `${String(ner || "").trim().toLowerCase()}||${String(turul || "").trim()}`;
}

/* ------------------------------------------------------------------ *
 *  Excel загвар (одоо байгаа зардлуудаар дүүргэсэн)
 * ------------------------------------------------------------------ */

/** POST /ashiglaltiinZardalExcelTemplateAvya { baiguullagiinId, barilgiinId } */
exports.ashiglaltiinZardalExcelTemplateAvya = asyncHandler(
  async (req, res, next) => {
    try {
      const { baiguullagiinId, barilgiinId } = req.body;
      const { baiguullaga, kholbolt } = await kheregteiZuilsiigOlyo(
        baiguullagiinId,
        barilgiinId
      );

      const zardluud = await AshiglaltiinZardluud(kholbolt)
        .find({
          baiguullagiinId: String(baiguullaga._id),
          barilgiinId: String(barilgiinId),
        })
        .sort({ turul: 1, ner: 1 })
        .lean();

      const workbook = new excel.Workbook();
      const worksheet = workbook.addWorksheet("Ашиглалтын зардал");

      worksheet.columns = [
        { header: BAGANUUD.ner, key: "ner", width: 30 },
        { header: BAGANUUD.turul, key: "turul", width: 14 },
        { header: BAGANUUD.zardliinTurul, key: "zardliinTurul", width: 18 },
        { header: BAGANUUD.tariff, key: "tariff", width: 16 },
        { header: BAGANUUD.suuriKhuraamj, key: "suuriKhuraamj", width: 16 },
        { header: BAGANUUD.nuat, key: "nuat", width: 10 },
        { header: BAGANUUD.tailbar, key: "tailbar", width: 34 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      const tailbaruud = {
        A1:
          "Зардлын нэр. Байгаа зардлын нэрийг ӨӨРЧЛӨХГҮЙ орхивол тухайн зардал шинэчлэгдэнэ.\n" +
          "Шинэ нэр бичвэл шинэ зардал үүснэ.",
        B1: `Зөвхөн "${TURLUUD.join('" эсвэл "')}" гэж бичнэ.\n"Тогтмол" нь тогтмол зардлын, "Дурын" нь хувьсах зардлын хүснэгтэд орно.`,
        C1: "Заавал биш. Жишээ нь: 1м3/талбай, нэгж/талбай, Тогтмол, Дурын.",
        D1: "Сар бүр нэхэмжлэхэд бодогдох тариф (төгрөгөөр).",
        E1: "Заавал биш. Суурь хураамж (төгрөгөөр).",
        F1: 'Тийм / Үгүй гэж бичнэ. Хоосон бол "Үгүй" гэж үзнэ.',
        G1: "Заавал биш тайлбар.",
      };

      Object.entries(tailbaruud).forEach(([nud, text]) => {
        worksheet.getCell(nud).note = {
          texts: [{ font: { size: 10, name: "Calibri" }, text }],
          margins: { insetmode: "custom", inset: [0.13, 0.13, 0.25, 0.25] },
        };
      });

      zardluud.forEach((z) => {
        worksheet.addRow({
          ner: z.ner || "",
          turul: z.turul || "",
          zardliinTurul: z.zardliinTurul || "",
          tariff: z.tariff ?? "",
          suuriKhuraamj: z.suuriKhuraamj ?? "",
          nuat: z.nuatBodokhEsekh ? "Тийм" : "Үгүй",
          tailbar: z.tailbar || "",
        });
      });

      worksheet.getColumn("tariff").numFmt = "#,##0.00";
      worksheet.getColumn("tariff").alignment = { horizontal: "right" };
      worksheet.getColumn("suuriKhuraamj").numFmt = "#,##0.00";
      worksheet.getColumn("suuriKhuraamj").alignment = { horizontal: "right" };

      // «Төрөл» ба «НӨАТ» баганад гараар алдаа гаргахгүйн тулд сонголт өгөв.
      const murniiToo = Math.max(zardluud.length, 0) + 200;
      for (let i = 2; i <= murniiToo; i++) {
        worksheet.getCell(`B${i}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${TURLUUD.join(",")}"`],
        };
        worksheet.getCell(`F${i}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"Тийм,Үгүй"'],
        };
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ashiglaltiin_zardal_${Date.now()}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }
);

/* ------------------------------------------------------------------ *
 *  Excel импорт
 * ------------------------------------------------------------------ */

/** POST /ashiglaltiinZardalExcelTatya (multipart: file) { baiguullagiinId, barilgiinId } */
exports.ashiglaltiinZardalExcelTatya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId } = req.body;

    if (!req.file) throw new aldaa("Excel файл оруулах");

    const { baiguullaga, kholbolt } = await kheregteiZuilsiigOlyo(
      baiguullagiinId,
      barilgiinId
    );

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const murnuud = xlsx.utils.sheet_to_json(worksheet, { raw: false });

    if (!murnuud || murnuud.length === 0) throw new aldaa("Excel хоосон");

    const Zardal = AshiglaltiinZardluud(kholbolt);

    // Байгаа зардлуудыг нэг удаа уншаад санах ойд тааруулна — мөр бүрт
    // тусад нь хайвал олон зардалтай барилга дээр удаан болно.
    const baigaaZardluud = await Zardal.find({
      baiguullagiinId: String(baiguullaga._id),
      barilgiinId: String(barilgiinId),
    }).lean();

    const baigaaMap = new Map(
      baigaaZardluud.map((z) => [tulkhuur(z.ner, z.turul), z])
    );

    // Нэг файлд ижил нэр хоёр удаа орвол хоёр дахь нь эхнийхээ дарж бичих
    // тул анхааруулж, зөвхөн эхнийхийг нь авна.
    const eneFailDeerkh = new Set();

    const results = {
      created: [],
      updated: [],
      failed: [],
      total: murnuud.length,
    };

    for (let i = 0; i < murnuud.length; i++) {
      const mur = murnuud[i];
      const murniiDugaar = i + 2; // 1-р мөр нь толгой

      try {
        const ner = (baganaAvya(mur, BAGANUUD.ner, "ner") || "")
          .toString()
          .trim();

        // Бүрэн хоосон мөрийг чимээгүй алгасана (Excel-ийн сүүлийн хоосон
        // мөрүүд ихэвчлэн ийм байдаг).
        const buhUtga = Object.values(mur).some(
          (v) => v !== undefined && v !== null && String(v).trim() !== ""
        );
        if (!ner && !buhUtga) continue;

        if (!ner) {
          results.failed.push({
            row: murniiDugaar,
            ner: "",
            error: `«${BAGANUUD.ner}» багана хоосон`,
          });
          continue;
        }

        const turulRaw = (baganaAvya(mur, BAGANUUD.turul, "turul") || "")
          .toString()
          .trim();
        const turul = TURLUUD.find(
          (t) => t.toLowerCase() === turulRaw.toLowerCase()
        );

        if (!turul) {
          results.failed.push({
            row: murniiDugaar,
            ner,
            error: `«${BAGANUUD.turul}» багана "${
              TURLUUD.join('" эсвэл "')
            }" байх ёстой (одоо: "${turulRaw}")`,
          });
          continue;
        }

        const tariff = toogBolgoyo(
          baganaAvya(mur, BAGANUUD.tariff, "tariff")
        );
        if (tariff === null) {
          results.failed.push({
            row: murniiDugaar,
            ner,
            error: `«${BAGANUUD.tariff}» багана тоо байх ёстой`,
          });
          continue;
        }
        if (tariff < 0) {
          results.failed.push({
            row: murniiDugaar,
            ner,
            error: `«${BAGANUUD.tariff}» сөрөг байж болохгүй`,
          });
          continue;
        }

        const suuriKhuraamj =
          toogBolgoyo(
            baganaAvya(mur, BAGANUUD.suuriKhuraamj, "suuriKhuraamj")
          ) ?? 0;
        if (suuriKhuraamj < 0) {
          results.failed.push({
            row: murniiDugaar,
            ner,
            error: `«${BAGANUUD.suuriKhuraamj}» сөрөг байж болохгүй`,
          });
          continue;
        }

        const tuluur = tulkhuur(ner, turul);
        if (eneFailDeerkh.has(tuluur)) {
          results.failed.push({
            row: murniiDugaar,
            ner,
            error: "Энэ файлд ижил нэр, төрөл давхардаж байна",
          });
          continue;
        }
        eneFailDeerkh.add(tuluur);

        const utguud = {
          ner,
          turul,
          tariff,
          suuriKhuraamj,
          zardliinTurul: (
            baganaAvya(mur, BAGANUUD.zardliinTurul, "zardliinTurul") || ""
          )
            .toString()
            .trim(),
          tailbar:
            (baganaAvya(mur, BAGANUUD.tailbar, "tailbar") || "")
              .toString()
              .trim() || "",
          nuatBodokhEsekh: tiimEsekh(baganaAvya(mur, BAGANUUD.nuat, "nuat")),
        };

        const baigaa = baigaaMap.get(tuluur);

        if (baigaa) {
          // `findOneAndUpdate` нь post-hook дуудаж, тухайн зардлыг ашигладаг
          // гэрээнүүд рүү шинэ тарифыг тараана.
          await Zardal.findOneAndUpdate(
            { _id: baigaa._id },
            { $set: utguud },
            { new: true, runValidators: true }
          );
          results.updated.push({ row: murniiDugaar, ner, turul, tariff });
        } else {
          const shine = new Zardal({
            ...utguud,
            baiguullagiinId: String(baiguullaga._id),
            barilgiinId: String(barilgiinId),
          });
          await shine.save();
          results.created.push({ row: murniiDugaar, ner, turul, tariff });
        }
      } catch (error) {
        results.failed.push({
          row: murniiDugaar,
          ner: (baganaAvya(mur, BAGANUUD.ner, "ner") || "").toString().trim(),
          error: error.message || "Алдаа гарлаа",
        });
      }
    }

    res.status(200).json({
      success: true,
      message:
        `Ашиглалтын зардал импорт хийгдлээ. Шинээр: ${results.created.length}, ` +
        `Шинэчилсэн: ${results.updated.length}, Алдаатай: ${results.failed.length}`,
      results: results,
    });
  } catch (error) {
    next(error);
  }
});
