/**
 * Хөнгөлөлт — бөөнөөр бүртгэх ба устгах.
 *
 * Өмнө нь дэлгэц нь гэрээ бүрээр `POST /guilgeeAvlaguud` руу нэг нэгээр
 * хүсэлт явуулдаг байв. 200 тоотод хөнгөлөлт өгөхөд 200 хүсэлт, аль нь
 * амжилтгүй болсныг мэдэх ч арга байхгүй. Мөн зардал тус бүрээр болон
 * хоногоор хөнгөлөх ойлголт огт байсангүй.
 *
 * turees-ийн `khungulultKhadgalya`-тай ижил зарчим:
 *   - Хөнгөлөх ДҮНГ дэлгэц бодно (хувь эсвэл шууд дүн, сарын үржүүлэгчтэй).
 *     Сервер нь дүнг дахин бодохгүй — зөвхөн хаана суухыг шийднэ.
 *   - Сонгосон мөчлөгт тухайн гэрээнд ТӨЛБӨР байхгүй бол хөнгөлөлт суухгүй,
 *     тэр гэрээг `alggasanGereenuud`-д буцааж мэдэгдэнэ.
 *   - Бичлэг бүрд аудит (`zassanBarimt`) үлдээнэ.
 *
 * ЯЛГАА: turees нь хөнгөлөлтийг `geree.avlaga.guilgeenuud[]` дотор
 * шигтгэдэг. sukh-д авлага нь тусдаа `guilgeeAvlaguud` цуглуулга тул
 * хөнгөлөлт ч мөн тэнд сөрөг дүнтэй мөр болж бичигдэнэ.
 */

const asyncHandler = require("express-async-handler");
const aldaa = require("../components/aldaa");

const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const {
  khungulultOruulakhErkhteiEsekh,
} = require("../utils/khungulultErkh");

/** `YYYY-MM` мөрийг тухайн сарын эхлэл/төгсгөл болгоно. */
function sariinKhyazgaar(sarMur) {
  const [jil, sar] = String(sarMur || "").split("-").map(Number);
  if (!jil || !sar) return null;
  return {
    ekhlel: new Date(jil, sar - 1, 1, 0, 0, 0, 0),
    tugsgul: new Date(jil, sar, 0, 23, 59, 59, 999),
  };
}

/** Эхлэх, дуусах сарын хооронд буй бүх `YYYY-MM`. */
function saruudiigZadlaya(ekhlekhSar, duusakhSar) {
  const a = sariinKhyazgaar(ekhlekhSar);
  const b = sariinKhyazgaar(duusakhSar || ekhlekhSar);
  if (!a || !b) return [];

  const saruud = [];
  const guilgee = new Date(a.ekhlel);
  while (guilgee <= b.ekhlel && saruud.length < 60) {
    saruud.push(
      `${guilgee.getFullYear()}-${String(guilgee.getMonth() + 1).padStart(2, "0")}`,
    );
    guilgee.setMonth(guilgee.getMonth() + 1);
  }
  return saruud;
}

/**
 * POST /khungulultKhadgalya
 *
 * Body:
 *   baiguullagiinId, barilgiinId,
 *   gereenuud: [{ gereeniiId, dun, toot? }]   // дүн нь дэлгэцээс бодогдсон
 *   ekhlekhSar, duusakhSar                    // "YYYY-MM"
 *   khonogTootsokhEsekh, khungulultKhonog, khungulultKhuvi
 *   zardliinId, zardliinNer                   // тодорхой зардлыг хөнгөлөх бол
 *   shaltgaan
 */
exports.khungulultKhadgalya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const {
      baiguullagiinId,
      barilgiinId,
      gereenuud,
      ekhlekhSar,
      duusakhSar,
      khonogTootsokhEsekh = false,
      khungulultKhonog,
      khungulultKhuvi,
      zardliinId,
      zardliinNer,
      shaltgaan,
    } = req.body;

    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    if (!Array.isArray(gereenuud) || gereenuud.length === 0)
      throw new aldaa("Хөнгөлөлт өгөх гэрээ сонгоно уу");
    if (!shaltgaan || !String(shaltgaan).trim())
      throw new aldaa("Шалтгаан заавал бөглөнө");
    if (!ekhlekhSar) throw new aldaa("Хөнгөлөх сар сонгоно уу");

    const zuvshuurugdsun = await khungulultOruulakhErkhteiEsekh(
      (req.body?.nevtersenAjiltniiToken || req.nevtersenAjiltniiToken)?.id,
    );
    if (!zuvshuurugdsun) {
      return res.status(403).json({
        success: false,
        message: "Танд хөнгөлөлт оруулах эрх байхгүй байна.",
      });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    );
    if (!kholbolt) throw new aldaa("Холболт олдсонгүй");

    const saruud = saruudiigZadlaya(ekhlekhSar, duusakhSar);
    if (saruud.length === 0) throw new aldaa("Хөнгөлөх сар буруу байна");

    const GuilgeeModel = GuilgeeAvlaguud(kholbolt);
    const GereeModel = Geree(kholbolt);

    const ajiltanNer = (req.body?.nevtersenAjiltniiToken || req.nevtersenAjiltniiToken)?.ner || "Систем";
    const ajiltanId = (req.body?.nevtersenAjiltniiToken || req.nevtersenAjiltniiToken)?.id || "";

    const results = {
      success: [],
      /** Сонгосон мөчлөгт төлбөргүй тул хөнгөлөлт суугаагүй гэрээнүүд. */
      alggasanGereenuud: [],
      failed: [],
      total: gereenuud.length,
    };

    for (const mur of gereenuud) {
      const gereeniiId = String(mur?.gereeniiId || "").trim();
      const niitDun = Math.abs(Number(mur?.dun) || 0);

      if (!gereeniiId || niitDun <= 0) {
        results.failed.push({
          gereeniiId,
          error: "Гэрээний ID эсвэл дүн буруу",
        });
        continue;
      }

      try {
        const geree = await GereeModel.findById(gereeniiId).lean();
        if (!geree) {
          results.failed.push({ gereeniiId, error: "Гэрээ олдсонгүй" });
          continue;
        }

        /**
         * Хоногийн горимд бүх дүн нэг бичлэг болж, хугацаа нь мужийн
         * эхлэлээр тэмдэглэгдэнэ — turees-тэй ижил. Эс бөгөөс сар тус бүрт
         * хувааж, зөвхөн ТӨЛБӨРТЭЙ сард суулгана.
         */
        const bichleguud = [];

        if (khonogTootsokhEsekh) {
          const khyazgaar = sariinKhyazgaar(saruud[0]);
          bichleguud.push({ ognoo: khyazgaar.ekhlel, dun: niitDun });
        } else {
          // Дэлгэц сар бүрийн дүнг (`saraar`) илгээвэл тэрийг, эс бөгөөс
          // нийт дүнг тэнцүү хуваана. Хувиар хөнгөлөхөд сар бүрийн төлбөр
          // өөр тул тэнцүү хуваах нь буруу дүн суулгадаг байв.
          const saraar = mur?.saraar && typeof mur.saraar === "object" ? mur.saraar : null;
          const NekhemjlekhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);

          for (const sar of saruud) {
            const khyazgaar = sariinKhyazgaar(sar);
            if (!khyazgaar) continue;
            const sariinDun = saraar ? Math.abs(Number(saraar[sar]) || 0) : niitDun / saruud.length;
            if (sariinDun <= 0) continue;

            // Тухайн сарын нэхэмжлэх — хөнгөлөлт нь тэр нэхэмжлэхийн огноонд сууна
            const nekhemjlekh = await NekhemjlekhModel.findOne({
              gereeniiId: String(geree._id),
              ognoo: { $gte: khyazgaar.ekhlel, $lte: khyazgaar.tugsgul },
            })
              .sort({ ognoo: 1 })
              .select({ ognoo: 1 })
              .lean();
            if (nekhemjlekh?.ognoo) {
              bichleguud.push({ ognoo: nekhemjlekh.ognoo, dun: sariinDun });
              continue;
            }

            // Тухайн сард уг гэрээнд НЭХЭМЖИЛСЭН төлбөр байгаа эсэх.
            // Байхгүй бол хөнгөлөх зүйлгүй — turees ч мөн ингэж алгасдаг.
            const tulburiinShuult = {
              gereeniiId: String(geree._id),
              dun: { $gt: 0 },
              ognoo: { $gte: khyazgaar.ekhlel, $lte: khyazgaar.tugsgul },
            };
            if (zardliinId) tulburiinShuult.zardliinId = String(zardliinId);

            const tulbur = await GuilgeeModel.findOne(tulburiinShuult)
              .sort({ ognoo: 1 })
              .lean();

            if (!tulbur) continue;
            bichleguud.push({ ognoo: tulbur.ognoo, dun: sariinDun });
          }
        }

        if (bichleguud.length === 0) {
          results.alggasanGereenuud.push({
            gereeniiId,
            gereeniiDugaar: geree.gereeniiDugaar || "",
            toot: geree.toot || mur?.toot || "",
            dun: niitDun,
            shaltgaan: zardliinNer
              ? `Сонгосон мөчлөгт «${zardliinNer}» төлбөр алга`
              : "Сонгосон мөчлөгт төлбөр алга",
          });
          continue;
        }

        for (const bichleg of bichleguud) {
          await new GuilgeeModel({
            baiguullagiinId: String(baiguullagiinId),
            barilgiinId: barilgiinId ? String(barilgiinId) : geree.barilgiinId,
            gereeniiId: String(geree._id),
            toot: geree.toot || mur?.toot || "",
            turul: "Хөнгөлөлт",
            zardliinTurul: "Хөнгөлөлт",
            ...(zardliinId ? { zardliinId: String(zardliinId) } : {}),
            ...(zardliinNer ? { zardliinNer: String(zardliinNer) } : {}),
            dun: -Math.abs(Math.round(bichleg.dun)),
            ognoo: bichleg.ognoo,
            tailbar: String(shaltgaan).trim(),
            khonogTootsokhEsekh: !!khonogTootsokhEsekh,
            ...(khonogTootsokhEsekh && khungulultKhonog
              ? { khungulultKhonog: Number(khungulultKhonog) }
              : {}),
            ...(khungulultKhuvi
              ? { khungulultKhuvi: Number(khungulultKhuvi) }
              : {}),
            source: "khungulult",
            guilgeeKhiisenAjiltniiNer: ajiltanNer,
            guilgeeKhiisenAjiltniiId: ajiltanId,
          }).save();
        }

        await barimtUldeeye(kholbolt, geree, niitDun, shaltgaan, {
          ajiltanNer,
          ajiltanId,
        });

        results.success.push({
          gereeniiId,
          gereeniiDugaar: geree.gereeniiDugaar || "",
          toot: geree.toot || "",
          dun: niitDun,
          bichlegiinToo: bichleguud.length,
        });
      } catch (error) {
        results.failed.push({
          gereeniiId,
          error: error.message || "Алдаа гарлаа",
        });
      }
    }

    res.status(200).json({
      success: true,
      message:
        `${results.success.length} гэрээнд хөнгөлөлт бүртгэгдлээ` +
        (results.alggasanGereenuud.length
          ? `, ${results.alggasanGereenuud.length} гэрээ алгасагдав`
          : "") +
        (results.failed.length ? `, ${results.failed.length} алдаатай` : ""),
      results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /khungulultUstgaya  { baiguullagiinId, id, tailbar }
 *
 * Хөнгөлөлтийг устгахдаа шалтгааныг заавал шаардана — авлагын дүн
 * өөрчлөгддөг үйлдэл тул мөрөө үлдээх ёстой.
 */
exports.khungulultUstgaya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, id, tailbar } = req.body;

    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    if (!id) throw new aldaa("Устгах хөнгөлөлтийн ID хоосон");
    if (!tailbar || !String(tailbar).trim())
      throw new aldaa("Устгах шалтгаан заавал бөглөнө");

    const zuvshuurugdsun = await khungulultOruulakhErkhteiEsekh(
      (req.body?.nevtersenAjiltniiToken || req.nevtersenAjiltniiToken)?.id,
    );
    if (!zuvshuurugdsun) {
      return res.status(403).json({
        success: false,
        message: "Танд хөнгөлөлт устгах эрх байхгүй байна.",
      });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    );
    if (!kholbolt) throw new aldaa("Холболт олдсонгүй");

    const GuilgeeModel = GuilgeeAvlaguud(kholbolt);
    const khungulult = await GuilgeeModel.findById(id).lean();
    if (!khungulult) throw new aldaa("Хөнгөлөлт олдсонгүй");

    if (String(khungulult.turul) !== "Хөнгөлөлт") {
      throw new aldaa("Энэ бичлэг хөнгөлөлт биш байна");
    }

    await GuilgeeModel.deleteOne({ _id: id });

    // Авлагын үлдэгдэл, нэхэмжлэхийн төлөв дахин бодогдоно.
    try {
      const guilgeeService = require("../services/guilgeeService");
      if (khungulult.gereeniiId) {
        await guilgeeService.syncInvoicesStatus(
          kholbolt,
          String(khungulult.gereeniiId),
        );
      }
    } catch (err) {
      console.error("Хөнгөлөлт устгасны дараа sync амжилтгүй:", err.message);
    }

    res.status(200).json({
      success: true,
      message: "Хөнгөлөлт устгагдлаа",
    });
  } catch (error) {
    next(error);
  }
});

/** Аудитын бичлэг — хэн, хэзээ, хэдийн хөнгөлөлт өгсөн. */
async function barimtUldeeye(kholbolt, geree, dun, shaltgaan, ajiltan) {
  try {
    const ZassanBarimt = require("../models/zassanBarimt");
    await new (ZassanBarimt(kholbolt))({
      baiguullagiinId: geree.baiguullagiinId,
      barilgiinId: geree.barilgiinId,
      classId: String(geree._id),
      classDugaar: geree.gereeniiDugaar,
      classType: "Khungulult",
      className: "Хөнгөлөлт",
      uurchlult: [
        {
          talbar: "khungulult",
          talbarNer: "Хөнгөлөлт",
          umnukhUtga: "",
          shineUtga: `${dun}₮ ${shaltgaan || ""}`.trim(),
          utganiiTurul: "string",
        },
      ],
      ajiltniiId: ajiltan.ajiltanId,
      ajiltniiNer: ajiltan.ajiltanNer,
      shaltgaan: shaltgaan,
    }).save();
  } catch (err) {
    // Аудит бичигдээгүй нь хөнгөлөлтийг буцаах шалтгаан биш.
    console.error("Хөнгөлөлтийн аудит бичихэд алдаа:", err.message);
  }
}

/**
 * POST /khungulultSuuriAvya — хувиар хөнгөлөхийн СУУРЬ дүн.
 *
 * Дэлгэц өмнө нь `turesiinOrlogo`-оос хувь бодож байсан ч энэ талбар sukh-д
 * огт байхгүй (turees-ээс хуулагдсан) тул хувь үргэлж 0₮ гардаг байв. Энд
 * тухайн сард БОДИТ нэхэмжилсэн төлбөрийг (`guilgeeAvlaguud`, dun > 0,
 * хөнгөлөлт/эхний үлдэгдэл биш) гэрээ × сараар нэгтгэж буцаана.
 *
 * Body: baiguullagiinId, barilgiinId?, ekhlekhSar, duusakhSar?, zardliinId?
 * Хариу: { suuri: { [gereeniiId]: { "YYYY-MM": дүн } } }
 */
exports.khungulultSuuriAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId, ekhlekhSar, duusakhSar, zardliinId } =
      req.body;
    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");

    const saruud = saruudiigZadlaya(ekhlekhSar, duusakhSar);
    if (saruud.length === 0) return res.json({ suuri: {} });

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    );
    if (!kholbolt) throw new aldaa("Холболт олдсонгүй");

    const ekhlel = sariinKhyazgaar(saruud[0]).ekhlel;
    const tugsgul = sariinKhyazgaar(saruud[saruud.length - 1]).tugsgul;

    /**
     * Суурь = тухайн сарын НЭХЭМЖЛЭХЭД орсон төлбөр, НЭХЭМЖЛЭХИЙН огноогоор
     * сар ангилна. Өмнө нь `dun > 0` бүх мөрийг (гар авлага, зогсоол, excel
     * заалт...) мөрийн өөрийн огноогоор нэгтгэдэг тул хувь нь нэхэмжлэх дээр
     * харагдах дүнтэй таардаггүй байв.
     */
    const match = {
      baiguullagiinId: String(baiguullagiinId),
      dun: { $gt: 0 },
      ekhniiUldegdelEsekh: { $ne: true },
      nekhemjlekhId: { $exists: true, $nin: [null, ""] },
      turul: { $nin: ["Хөнгөлөлт", "khungulult", "discount", "төлөлт"] },
    };
    if (barilgiinId) match.barilgiinId = String(barilgiinId);
    if (zardliinId) match.zardliinId = String(zardliinId);

    const GuilgeeModel = GuilgeeAvlaguud(kholbolt);
    const mur = await GuilgeeModel.aggregate([
      { $match: match },
      {
        $addFields: {
          nid: {
            $convert: { input: "$nekhemjlekhId", to: "objectId", onError: null, onNull: null },
          },
        },
      },
      {
        $lookup: {
          from: "nekhemjlekhiinTuukh",
          localField: "nid",
          foreignField: "_id",
          as: "n",
        },
      },
      { $unwind: "$n" },
      { $project: { gereeniiId: 1, dun: 1, "n.ognoo": 1 } },
      { $match: { "n.ognoo": { $gte: ekhlel, $lte: tugsgul } } },
      {
        $group: {
          _id: {
            g: "$gereeniiId",
            s: { $dateToString: { format: "%Y-%m", date: "$n.ognoo", timezone: "Asia/Ulaanbaatar" } },
          },
          dun: { $sum: "$dun" },
        },
      },
    ]);

    const suuri = {};
    mur.forEach(({ _id, dun }) => {
      if (!_id?.g) return;
      const g = String(_id.g);
      if (!suuri[g]) suuri[g] = {};
      suuri[g][_id.s] = Math.round(dun * 100) / 100;
    });

    // Гэрээ бүрийн БОДИТ үлдэгдэл (авлага − төлөлт − хөнгөлөлт). Дэлгэц өмнө
    // нь оршин суугчийн статик `ekhniiUldegdel`-ийг харуулдаг байв.
    const uldMatch = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) uldMatch.barilgiinId = String(barilgiinId);
    const uldMur = await GuilgeeModel.aggregate([
      { $match: uldMatch },
      { $group: { _id: "$gereeniiId", dun: { $sum: "$dun" } } },
    ]);
    const uldegdel = {};
    uldMur.forEach(({ _id, dun }) => {
      if (_id) uldegdel[String(_id)] = Math.round(dun * 100) / 100;
    });

    res.json({ suuri, uldegdel });
  } catch (err) {
    next(err);
  }
});
