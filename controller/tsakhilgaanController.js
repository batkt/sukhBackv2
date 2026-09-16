/**
 * Цахилгааны тооцооны хоёр горим.
 *
 * Барилга бүр `tokhirgoo.zaaltaarTsakhilgaanBodokhEsekh` тохиргоотой:
 *
 *   true  (өгөгдмөл) — ЗААЛТААР БОДОХ.
 *                      Өдөр/Шөнө/Өмнө заалтыг Excel-ээр оруулж, зөрүүг кВт
 *                      тарифаар үржүүлж систем өөрөө тооцоолно.
 *                      => /zaaltExcelTemplateAvya, /zaaltExcelTatya
 *
 *   false            — ДҮНГЭЭР ОРУУЛАХ.
 *                      Систем юу ч бодохгүй. Хэрэглэгч цахилгааны ЭЦСИЙН
 *                      дүнг Excel-ийн ганц баганад бичиж оруулах ба тэр дүн
 *                      шууд "Цахилгаан" төлбөр болно.
 *                      => /tsakhilgaanExcelTemplateAvya, /tsakhilgaanExcelTatya
 *
 * Хоёр горим ижил хоолойгоор (geree.zardluud[Цахилгаан].dun + zaaltUnshlalt
 * бичлэг) үр дүнгээ хадгалдаг тул нэхэмжлэх үүсгэх тал нь өөрчлөгдөхгүй.
 */

const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");
const xlsx = require("xlsx");
const excel = require("exceljs");

const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const OrshinSuugch = require("../models/orshinSuugch");
const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
const { tolgoiMur } = require("../utils/excelZagvar");

const TSAKHILGAAN_DUN_BAGANA = "Цахилгааны дүн";

/** Барилга дээрх тохиргоог уншина. Хоосон бол заалтаар бодно гэж үзнэ. */
function zaaltaarBodokhEsekh(barilga) {
  return barilga?.tokhirgoo?.zaaltaarTsakhilgaanBodokhEsekh !== false;
}

/** Байгууллага, барилга, тухайн баазын холболтыг нэг дор олж өгнө. */
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

  return { db, baiguullaga, barilga, kholbolt };
}

/**
 * Барилгын "Цахилгаан" зардлыг олно.
 * `zaaltExcelTatya`-тай ижил дараалал: яг "Цахилгаан" > заалттай хувьсах >
 * нэрэндээ "цахилгаан" агуулсан > эцэст нь хоосон загвар.
 *
 * Эх сурвалж нь `ashiglaltiinZardluud` цуглуулга. Тэндээс олдохгүй бол
 * барилгын баримт дотор шигтгэсэн хуучин хуулбар руу буцаж хардаг.
 */
async function tsakhilgaaniiZardliigOlyo(baiguullaga, barilga, kholbolt) {
  let zardluud = [];
  try {
    const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
    zardluud = await AshiglaltiinZardluud(kholbolt)
      .find({
        baiguullagiinId: String(baiguullaga._id),
        barilgiinId: String(barilga._id),
      })
      .lean();
  } catch (err) {
    console.error("ashiglaltiinZardluud уншиж чадсангүй:", err.message);
  }

  if (!zardluud || zardluud.length === 0) {
    zardluud = barilga?.tokhirgoo?.ashiglaltiinZardluud || [];
  }

  const khuvisakhTsakhilgaan = (z) => {
    const ner = (z.ner || "").toLowerCase();
    if (ner.includes("дундын") || ner.includes("өмчлөл")) return false;
    if (ner.includes("шат")) return false;
    return true;
  };

  let zardal =
    zardluud.find(
      (z) => z.zaalt === true && khuvisakhTsakhilgaan(z) && (z.ner || "").trim() === "Цахилгаан"
    ) ||
    zardluud.find((z) => z.zaalt === true && khuvisakhTsakhilgaan(z)) ||
    zardluud.find((z) => {
      const ner = (z.ner || "").toLowerCase();
      return (
        ner.includes("цахилгаан") &&
        !ner.includes("дундын") &&
        !ner.includes("шат")
      );
    });

  if (!zardal) {
    zardal = {
      ner: "Цахилгаан",
      zardliinTurul: "Хувьсах",
      zaaltTariff: 0,
      suuriKhuraamj: 0,
      zaalt: true,
    };
  }

  return { zardal, zardluud };
}

/** Excel-ийн "1,234.50" маягийн утгыг тоо болгоно. */
function toogBolgoyo(utga) {
  if (utga === undefined || utga === null || utga === "") return null;
  if (typeof utga === "number") return utga;
  const tseverlesen = String(utga).replace(/[,\s₮]/g, "").trim();
  if (tseverlesen === "") return null;
  const too = parseFloat(tseverlesen);
  return Number.isFinite(too) ? too : null;
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

/* ------------------------------------------------------------------ *
 *  Цахилгааны дүнгийн Excel загвар
 * ------------------------------------------------------------------ */

/** POST /tsakhilgaanExcelTemplateAvya  { baiguullagiinId, barilgiinId } */
exports.tsakhilgaanExcelTemplateAvya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId } = req.body;
    const { db, baiguullaga, barilga, kholbolt } = await kheregteiZuilsiigOlyo(
      baiguullagiinId,
      barilgiinId
    );

    if (zaaltaarBodokhEsekh(barilga)) {
      throw new aldaa(
        "«Заалтаар цахилгаан бодох» тохиргоо идэвхтэй байна. Заалтын загварыг татаж ашиглана уу."
      );
    }

    const gereenuud = await Geree(kholbolt)
      .find({
        baiguullagiinId: String(baiguullaga._id),
        barilgiinId: String(barilgiinId),
        tuluv: "Идэвхтэй",
      })
      .select("gereeniiDugaar toot orshinSuugchId _id")
      .lean();

    const orshinSuugchiinIdnuud = [
      ...new Set(gereenuud.map((g) => g.orshinSuugchId).filter(Boolean)),
    ];
    const orshinSuugchid = await OrshinSuugch(db.erunkhiiKholbolt)
      .find({ _id: { $in: orshinSuugchiinIdnuud } })
      .select("_id ner utas")
      .lean();

    const orshinSuugchMap = new Map(
      orshinSuugchid.map((o) => [String(o._id), o])
    );

    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet("Цахилгаан");

    worksheet.columns = [
      { header: "Гэрээний дугаар", key: "gereeniiDugaar", width: 20 },
      { header: "Тоот", key: "toot", width: 15 },
      { header: "Нэр", key: "ner", width: 24 },
      { header: "Утас", key: "utas", width: 15 },
      { header: TSAKHILGAAN_DUN_BAGANA, key: "dun", width: 18 },
    ];

    tolgoiMur(worksheet.getRow(1));

    // Ганц бөглөх багана нь аль нь болохыг тодоор харуулна.
    const dunGarchig = worksheet.getCell("E1");
    dunGarchig.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC6EFCE" },
    };
    dunGarchig.font = { bold: true, color: { argb: "FF006100" } };
    dunGarchig.note = {
      texts: [
        {
          font: { bold: true, size: 10, name: "Calibri" },
          text: "ЗӨВХӨН ЭНЭ БАГАНЫГ БӨГЛӨНӨ\n",
        },
        {
          font: { size: 10, name: "Calibri" },
          text:
            "Тухайн тоотын цахилгааны ЭЦСИЙН төлбөрийг төгрөгөөр бичнэ.\n" +
            "Систем нэмж тооцохгүй — бичсэн дүн шууд «Цахилгаан» төлбөр болно.\n" +
            "Хоосон орхивол тухайн мөрийг алгасана.",
        },
      ],
      margins: { insetmode: "custom", inset: [0.13, 0.13, 0.25, 0.25] },
    };

    gereenuud.forEach((geree) => {
      const orshinSuugch = geree.orshinSuugchId
        ? orshinSuugchMap.get(String(geree.orshinSuugchId))
        : null;

      worksheet.addRow({
        gereeniiDugaar: geree.gereeniiDugaar || "",
        toot: geree.toot || "",
        ner: orshinSuugch?.ner || "",
        utas: orshinSuugch?.utas || "",
        dun: "",
      });
    });

    worksheet.getColumn("dun").numFmt = "#,##0.00";
    worksheet.getColumn("dun").alignment = { horizontal: "right" };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tsakhilgaan_template_${Date.now()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ *
 *  Цахилгааны дүнгийн Excel импорт
 * ------------------------------------------------------------------ */

/** POST /tsakhilgaanExcelTatya  (multipart: file) { baiguullagiinId, barilgiinId, ognoo } */
exports.tsakhilgaanExcelTatya = asyncHandler(async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, ognoo } = req.body;

    if (!ognoo) throw new aldaa("Огноо заавал бөглөх шаардлагатай");
    if (!req.file) throw new aldaa("Excel файл оруулах");

    const { baiguullaga, barilga, kholbolt } = await kheregteiZuilsiigOlyo(
      baiguullagiinId,
      barilgiinId
    );

    if (zaaltaarBodokhEsekh(barilga)) {
      throw new aldaa(
        "«Заалтаар цахилгаан бодох» тохиргоо идэвхтэй байна. Заалтын Excel-ээр импортлоно уу."
      );
    }

    const { zardal: tsakhilgaaniiZardal, zardluud } =
      await tsakhilgaaniiZardliigOlyo(baiguullaga, barilga, kholbolt);

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const murnuud = xlsx.utils.sheet_to_json(worksheet, { raw: false });

    if (!murnuud || murnuud.length === 0) throw new aldaa("Excel хоосон");

    const unshlaltiinOgnoo = new Date(ognoo);
    const results = { success: [], failed: [], total: murnuud.length };

    for (let i = 0; i < murnuud.length; i++) {
      const mur = murnuud[i];
      const murniiDugaar = i + 2; // 1-р мөр нь толгой

      try {
        const gereeniiDugaar = (
          baganaAvya(mur, "Гэрээний дугаар", "gereeniiDugaar") || ""
        )
          .toString()
          .trim();

        if (!gereeniiDugaar) {
          results.failed.push({
            row: murniiDugaar,
            gereeniiDugaar: "",
            error: "Гэрээний дугаар хоосон",
          });
          continue;
        }

        const dunRaw = baganaAvya(
          mur,
          TSAKHILGAAN_DUN_BAGANA,
          "Цахилгаан дүн",
          "Дүн",
          "tsakhilgaaniiDun",
          "dun"
        );

        // Хоосон мөрийг алгасана — нэг тоотын дүнг оруулахад бусад нь
        // 0 болж нэхэмжлэх нь эвдэрч болохгүй.
        if (dunRaw === undefined || dunRaw === null || String(dunRaw).trim() === "") {
          results.success.push({
            row: murniiDugaar,
            gereeniiDugaar,
            message: "Дүн хоосон тул алгасав",
          });
          continue;
        }

        const dun = toogBolgoyo(dunRaw);
        if (dun === null) {
          results.failed.push({
            row: murniiDugaar,
            gereeniiDugaar,
            error: `«${TSAKHILGAAN_DUN_BAGANA}» багана тоо байх ёстой`,
          });
          continue;
        }
        if (dun < 0) {
          results.failed.push({
            row: murniiDugaar,
            gereeniiDugaar,
            error: "Цахилгааны дүн сөрөг байж болохгүй",
          });
          continue;
        }

        const geree = await Geree(kholbolt).findOne({
          gereeniiDugaar,
          baiguullagiinId: String(baiguullagiinId),
          barilgiinId: String(barilgiinId),
        });

        if (!geree) {
          results.failed.push({
            row: murniiDugaar,
            gereeniiDugaar,
            error: "Гэрээ олдсонгүй",
          });
          continue;
        }

        // Гэрээнд хувийн зардлын жагсаалт байхгүй бол барилгынхаар үүсгэнэ.
        // Эс бөгөөс цахилгааныг нэмэхэд бусад тогтмол зардал нь алдагдана.
        if (!Array.isArray(geree.zardluud) || geree.zardluud.length === 0) {
          geree.zardluud = JSON.parse(JSON.stringify(zardluud || []));
        }

        const zardalData = {
          ner: tsakhilgaaniiZardal.ner,
          turul: tsakhilgaaniiZardal.turul,
          zaalt: true,
          // Заалтгүй горим: тариф ч, суурь хураамж ч оролцохгүй. Хэрэглэгчийн
          // бичсэн дүн өөрөө эцсийн төлбөр тул 0-ээр тэмдэглэж, дараа нь хэн
          // нэгэн "яагаад ийм дүн гарав" гэж хартал тооцоолол байхгүй нь
          // илэрхий байг.
          zaaltTariff: 0,
          zaaltDefaultDun: 0,
          tariff: 0,
          tariffUsgeer: tsakhilgaaniiZardal.tariffUsgeer || "кВт",
          zardliinTurul: tsakhilgaaniiZardal.zardliinTurul,
          barilgiinId: String(barilgiinId),
          dun: dun,
          zaaltCalculation: {
            umnukhZaalt: 0,
            suuliinZaalt: 0,
            zaaltTog: 0,
            zaaltUs: 0,
            zoruu: 0,
            tariff: 0,
            tariffType: tsakhilgaaniiZardal.zardliinTurul,
            tariffName: tsakhilgaaniiZardal.ner,
            defaultDun: 0,
            tier: null,
            calculatedAt: new Date(),
          },
          bodokhArga: "Гараар оруулсан дүн",
          tseverUsDun: 0,
          bokhirUsDun: 0,
          usKhalaasniiDun: 0,
          tsakhilgaanUrjver: 1,
          tsakhilgaanChadal: 0,
          tsakhilgaanDemjikh: 0,
          suuriKhuraamj: 0,
          nuatNemekhEsekh: tsakhilgaaniiZardal.nuatNemekhEsekh || false,
          ognoonuud: tsakhilgaaniiZardal.ognoonuud || [],
        };

        const baigaaIndex = geree.zardluud.findIndex(
          (z) =>
            z.ner === tsakhilgaaniiZardal.ner &&
            z.zardliinTurul === tsakhilgaaniiZardal.zardliinTurul
        );

        if (baigaaIndex >= 0) {
          geree.zardluud[baigaaIndex] = zardalData;
        } else {
          geree.zardluud.push(zardalData);
        }

        const niitTulbur = geree.zardluud.reduce(
          (dun, z) => dun + (z.dun || z.tariff || 0),
          0
        );

        await Geree(kholbolt).findByIdAndUpdate(
          geree._id,
          {
            $set: {
              zardluud: geree.zardluud,
              niitTulbur: niitTulbur,
              ashiglaltiinZardal: niitTulbur,
            },
          },
          { runValidators: false }
        );

        // Нэхэмжлэх үүсгэх тал нь хамгийн сүүлийн zaaltUnshlalt бичлэгийн
        // `zaaltDun`-г уншдаг тул заалтаар бодсон эсэхээс үл хамааран энд
        // бичлэг үлдээнэ.
        await new (ZaaltUnshlalt(kholbolt))({
          gereeniiId: String(geree._id),
          gereeniiDugaar,
          toot: geree.toot || "",
          baiguullagiinId: String(baiguullaga._id),
          barilgiinId: String(barilgiinId),
          unshlaltiinOgnoo,
          umnukhZaalt: 0,
          suuliinZaalt: 0,
          zaaltTog: 0,
          zaaltUs: 0,
          zoruu: 0,
          zaaltZardliinId: tsakhilgaaniiZardal._id?.toString() || "",
          zaaltZardliinNer: tsakhilgaaniiZardal.ner,
          zaaltZardliinTurul: tsakhilgaaniiZardal.zardliinTurul,
          tariff: 0,
          tariffUsgeer: tsakhilgaaniiZardal.tariffUsgeer || "кВт",
          defaultDun: 0,
          usedTier: null,
          zaaltDun: dun,
          zaaltCalculation: zardalData.zaaltCalculation,
          bodokhArga: "Гараар оруулсан дүн",
          nuatNemekhEsekh: tsakhilgaaniiZardal.nuatNemekhEsekh || false,
          ognoonuud: tsakhilgaaniiZardal.ognoonuud || [],
          importOgnoo: new Date(),
          importAjiltniiId: req.nevtersenAjiltniiToken?.id || "",
          importAjiltniiNer: req.nevtersenAjiltniiToken?.ner || "",
        }).save();

        await tukhainMuchiinNekhemjlekhiigShinechilye(
          kholbolt,
          geree,
          baiguullagiinId,
          barilgiinId,
          unshlaltiinOgnoo,
          req
        );

        results.success.push({
          row: murniiDugaar,
          gereeniiDugaar,
          dun,
        });
      } catch (error) {
        results.failed.push({
          row: murniiDugaar,
          gereeniiDugaar:
            (baganaAvya(mur, "Гэрээний дугаар", "gereeniiDugaar") || "")
              .toString()
              .trim(),
          error: error.message || "Алдаа гарлаа",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Цахилгааны дүн импорт хийгдлээ. Амжилттай: ${results.success.length}, Алдаатай: ${results.failed.length}`,
      results: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Тухайн тооцооны мөчлөгт төлөгдөөгүй нэхэмжлэх байвал шинэ дүнгээр дахин
 * бодуулна. `zaaltExcelTatya`-д байдаг логиктой ижил.
 */
async function tukhainMuchiinNekhemjlekhiigShinechilye(
  kholbolt,
  geree,
  baiguullagiinId,
  barilgiinId,
  ognoo,
  req
) {
  let cronDay = 1;
  try {
    const NekhemjlekhCron = require("../models/cronSchedule");
    const cronSchedule = await NekhemjlekhCron(kholbolt)
      .findOne({
        baiguullagiinId: String(baiguullagiinId),
        $or: [{ barilgiinId: String(barilgiinId) }, { barilgiinId: null }],
      })
      .sort({ barilgiinId: -1 })
      .lean();

    if (cronSchedule?.nekhemjlekhUusgekhOgnoo) {
      cronDay = cronSchedule.nekhemjlekhUusgekhOgnoo;
    }
  } catch (err) {
    console.error(
      "Error fetching cron schedule in tsakhilgaanExcelTatya:",
      err
    );
  }

  try {
    const { calculateBillingCycleBounds } = require("../utils/dateUtils");
    const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(
      cronDay,
      ognoo
    );

    // `createInvoiceForContract` мөчлөгийн хамгийн сүүлийн нэхэмжлэхийг
    // `ognoo: -1`-ээр олдог тул бид ч мөн адил сонгоно. Ингэснээр тэр
    // төлөгдсөн нэхэмжлэх барьж аваад, түүнийг дахин бичих эрсдэлгүй.
    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
    const suuliinNekhemjlekh = await NekhemjlekhiinTuukh(kholbolt)
      .findOne({
        gereeniiId: String(geree._id),
        ognoo: { $gte: startOfCycle, $lte: endOfCycle },
      })
      .sort({ ognoo: -1 })
      .lean();

    if (suuliinNekhemjlekh && suuliinNekhemjlekh.tuluv === "Төлөөгүй") {
      const invoiceService = require("../services/invoiceService");
      await invoiceService.createInvoiceForContract(
        kholbolt,
        String(geree._id),
        {
          // Дахин бодогдсон мөрүүд нь импорт хийсэн өдрөөр бус, нэхэмжлэхийн
          // өөрийнх нь огноогоор бичигдэнэ. Эс бөгөөс гүйлгээний түүхэнд
          // зөвхөн цахилгааны мөр нь бусдаасаа өөр өдөр рүү үсэрнэ.
          billingDate: new Date(suuliinNekhemjlekh.ognoo || ognoo),
          // ЧУХАЛ: `override` байхгүй бол тухайн мөчлөгт нэхэмжлэх аль хэдийн
          // үүссэн тохиолдолд `createInvoiceForContract` нь
          // "Тухайн сарын нэхэмжлэх аль хэдийн үүссэн байна" гээд юу ч
          // хийлгүй буцдаг — цахилгааны шинэ дүн авлагад ОРОХГҮЙ.
          override: true,
          ajiltanNer: req.nevtersenAjiltniiToken?.ner || "Систем",
          ajiltanId: req.nevtersenAjiltniiToken?.id || "",
        }
      );
    } else {
      // Мөчлөгт төлөөгүй нэхэмжлэх байхгүй тул авлага дахин бодогдохгүй.
      // Дүн нь гэрээн дээр хадгалагдсан бөгөөд дараагийн нэхэмжлэх үүсэхэд
      // орно. "Импорт хийсэн ч юу ч нэмэгдсэнгүй" гэх асуултын хариу энд.
      console.log(
        `ℹ️ [tsakhilgaanExcelTatya] Geree ${geree._id}: мөчлөгт төлөөгүй нэхэмжлэх алга (${
          suuliinNekhemjlekh
            ? `сүүлийн нэхэмжлэхийн төлөв: ${suuliinNekhemjlekh.tuluv}`
            : "нэхэмжлэх огт олдсонгүй"
        }) — авлага дахин бодогдоогүй.`
      );
    }
  } catch (err) {
    console.error(
      `Failed to sync invoice for Geree ${geree._id} after tsakhilgaan import:`,
      err
    );
  }
}
