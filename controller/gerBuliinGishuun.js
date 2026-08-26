/**
 * Гэр бүлийн гишүүн (sub-account) — урих, баталгаажуулах, удирдах.
 *
 * Загвар:
 *   - Гишүүн бүр өөрийн утас, нууц үг, session-тэй ТУСДАА orshinSuugch бичлэг.
 *   - Бичлэг дээрх `undsenId` нь үндсэн эзэмшигчийг заана.
 *   - Тоот, гэрээ, нэхэмжлэх, төлбөрөө үндсэн эзэмшигчийнхээс уншина
 *     (middleware/gishuuniiKhandalt.js -ийг үзнэ үү).
 *   - Гишүүн өөрөө өөр гишүүн урьж чадахгүй (нэг түвшний л шатлал).
 */

const asyncHandler = require("express-async-handler");
const OrshinSuugch = require("../models/orshinSuugch");
const GerBuliinUrilga = require("../models/gerBuliinUrilga");
const BatalgaajuulahCode = require("../models/batalgaajuulahCode");
const Geree = require("../models/geree");
const aldaa = require("../components/aldaa");
const { msgIlgeeye } = require("./orshinSuugch");
const {
  MAX_GISHUUN,
  GISHUUNII_KHOLBOO,
  ugugdliinEzniiId,
  undsenEesKhayagAvya,
  gishuuniiKhariuBelgeye,
} = require("../utils/gerBuliinGishuun");

const MSG_KEY = "aa8e588459fdd9b7ac0b809fc29cfae3";
const MSG_DUGAAR = "72002002";
const URILGA_KHUCHINTEI_TSAG = 24; // цаг
const KOD_KHUCHINTEI_MINUT = 10;

/** Утасны дугаарыг цэвэрлэж, 8 оронтой эсэхийг шалгана */
function utasTseverleye(utas) {
  const tseverlesen = String(utas || "").replace(/\D/g, "");
  const dugaar = tseverlesen.length > 8 ? tseverlesen.slice(-8) : tseverlesen;
  if (!/^\d{8}$/.test(dugaar)) return null;
  return dugaar;
}

/** Токеноос үндсэн эзэмшигчийг ачаална. Гишүүн бол алдаа шиднэ. */
async function undsenEzemshigchAvya(req) {
  const { db } = require("zevbackv2");
  const token = req.body.nevtersenAjiltniiToken;
  if (!token || !token.id || token.id === "zochin") {
    throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");
  }
  if (token.undsenId) {
    throw new aldaa(
      "Гэр бүлийн гишүүн шинэ гишүүн урих боломжгүй. Үндсэн эзэмшигчид хандана уу.",
    );
  }

  const undsen = await OrshinSuugch(db.erunkhiiKholbolt).findById(token.id);
  if (!undsen) throw new aldaa("Хэрэглэгч олдсонгүй!");
  if (undsen.undsenId) {
    throw new aldaa(
      "Гэр бүлийн гишүүн шинэ гишүүн урих боломжгүй. Үндсэн эзэмшигчид хандана уу.",
    );
  }
  return undsen;
}

/** Байгууллагын баазын холболтыг олно */
function kholboltAvya(baiguullagiinId) {
  const { db } = require("zevbackv2");
  if (!baiguullagiinId) return null;
  return (
    db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    ) || null
  );
}

/**
 * Уригдаж буй дугаар гишүүн болох боломжтой эсэх.
 * Аль хэдийн ӨӨРИЙН тоот/гэрээтэй бол татгалзана — тэр хүн бие даасан данстай.
 */
async function urikhBolomjtoiEsekh(utas, undsen) {
  const { db } = require("zevbackv2");
  const bui = await OrshinSuugch(db.erunkhiiKholbolt).findOne({ utas });
  if (!bui) return { bolomjtoi: true, bui: null };

  if (String(bui._id) === String(undsen._id)) {
    throw new aldaa("Өөрийгөө гэр бүлийн гишүүнээр нэмэх боломжгүй!");
  }

  if (bui.undsenId) {
    if (String(bui.undsenId) === String(undsen._id)) {
      throw new aldaa("Энэ дугаар таны гэр бүлийн гишүүнээр бүртгэлтэй байна!");
    }
    throw new aldaa(
      "Энэ дугаар өөр дансны гэр бүлийн гишүүнээр бүртгэлтэй байна!",
    );
  }

  // Өөрийн тооттой юу?
  if (
    (Array.isArray(bui.toots) && bui.toots.length > 0) ||
    (bui.toot && String(bui.toot).trim())
  ) {
    throw new aldaa(
      "Энэ дугаар өөрийн тоотын бүртгэлтэй тул гэр бүлийн гишүүнээр нэмэх боломжгүй.",
    );
  }

  // Идэвхтэй гэрээтэй юу?
  const kholbolt = kholboltAvya(bui.baiguullagiinId || undsen.baiguullagiinId);
  if (kholbolt) {
    const gereeBui = await Geree(kholbolt)
      .findOne({ orshinSuugchId: String(bui._id), tuluv: { $ne: "Цуцалсан" } })
      .select("_id")
      .lean()
      .catch(() => null);
    if (gereeBui) {
      throw new aldaa(
        "Энэ дугаар идэвхтэй гэрээтэй тул гэр бүлийн гишүүнээр нэмэх боломжгүй.",
      );
    }
  }

  return { bolomjtoi: true, bui };
}

/** Баталгаажуулах код үүсгэж SMS илгээнэ */
async function kodIlgeeye(utas, undsen, kholbolt) {
  const BatalgaajuulahCodeModel = BatalgaajuulahCode(kholbolt);
  const kodDoc = await BatalgaajuulahCodeModel.batalgaajuulkhCodeUusgeye(
    utas,
    "gishuun_urikh",
    KOD_KHUCHINTEI_MINUT,
  );

  const urisenNer =
    [undsen.ovog, undsen.ner].filter(Boolean).join(" ") || undsen.utas || "";

  const text =
    `AmarSukh: ${urisenNer} tanig ger buliin gishuunee urij baina. ` +
    `Batalgaajuulax code: ${kodDoc.code}.`;

  msgIlgeeye(
    [{ to: utas, text, gereeniiId: "gishuun_urikh" }],
    MSG_KEY,
    MSG_DUGAAR,
    [],
    0,
    kholbolt,
    undsen.baiguullagiinId,
  );

  return kodDoc;
}

/**
 * POST /gerBuliinGishuunUrikh
 * Үндсэн эзэмшигч гэр бүлийн гишүүн урина. SMS-ээр баталгаажуулах код явна.
 */
exports.gishuunUrikh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const undsen = await undsenEzemshigchAvya(req);

    const utas = utasTseverleye(req.body.utas);
    if (!utas) throw new aldaa("Утасны дугаар буруу байна!");

    const kholboo = req.body.kholboo || "Бусад";
    const erkh = req.body.erkh === "Харах" ? "Харах" : "Харах + Төлөх";

    if (!undsen.baiguullagiinId) {
      throw new aldaa(
        "Таны бүртгэл байгууллагад холбогдоогүй байна. Эхлээд тоотоо бүртгүүлнэ үү.",
      );
    }

    const kholbolt = kholboltAvya(undsen.baiguullagiinId);
    if (!kholbolt) throw new aldaa("Байгууллагын холболт олдсонгүй!");

    // Тоон хязгаар — идэвхтэй гишүүд + хүлээгдэж буй урилгууд
    const UrilgaModel = GerBuliinUrilga(db.erunkhiiKholbolt);
    const [idevkhteiToo, khuleegdejBuiToo] = await Promise.all([
      OrshinSuugch(db.erunkhiiKholbolt).countDocuments({
        undsenId: String(undsen._id),
        gishuuniiTuluv: "Идэвхтэй",
      }),
      UrilgaModel.countDocuments({
        undsenId: String(undsen._id),
        tuluv: "Хүлээгдэж буй",
        expiresAt: { $gt: new Date() },
        utas: { $ne: utas },
      }),
    ]);

    if (idevkhteiToo + khuleegdejBuiToo >= MAX_GISHUUN) {
      throw new aldaa(
        `Нэг дансанд хамгийн ихдээ ${MAX_GISHUUN} гэр бүлийн гишүүн нэмэх боломжтой.`,
      );
    }

    await urikhBolomjtoiEsekh(utas, undsen);

    const expiresAt = new Date(
      Date.now() + URILGA_KHUCHINTEI_TSAG * 60 * 60 * 1000,
    );

    const urilga = await UrilgaModel.findOneAndUpdate(
      { utas, undsenId: String(undsen._id) },
      {
        $set: {
          undsenId: String(undsen._id),
          undsenUtas: undsen.utas || "",
          utas,
          ovog: req.body.ovog || "",
          ner: req.body.ner || "",
          kholboo,
          erkh,
          baiguullagiinId: String(undsen.baiguullagiinId),
          barilgiinId: undsen.barilgiinId ? String(undsen.barilgiinId) : "",
          tuluv: "Хүлээгдэж буй",
          expiresAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await kodIlgeeye(utas, undsen, kholbolt);

    res.status(200).json({
      success: true,
      message: "Баталгаажуулах код илгээгдлээ",
      urilga: {
        _id: urilga._id,
        utas: urilga.utas,
        ner: urilga.ner,
        kholboo: urilga.kholboo,
        erkh: urilga.erkh,
        tuluv: urilga.tuluv,
        expiresAt: urilga.expiresAt,
      },
      expiresIn: KOD_KHUCHINTEI_MINUT,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /gerBuliinGishuunDakhinIlgeeye
 * Хүлээгдэж буй урилгын кодыг дахин илгээнэ.
 */
exports.gishuunDakhinIlgeeye = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const undsen = await undsenEzemshigchAvya(req);

    const utas = utasTseverleye(req.body.utas);
    if (!utas) throw new aldaa("Утасны дугаар буруу байна!");

    const urilga = await GerBuliinUrilga(db.erunkhiiKholbolt).findOne({
      utas,
      undsenId: String(undsen._id),
      tuluv: "Хүлээгдэж буй",
      expiresAt: { $gt: new Date() },
    });
    if (!urilga) throw new aldaa("Хүлээгдэж буй урилга олдсонгүй!");

    const kholbolt = kholboltAvya(urilga.baiguullagiinId);
    if (!kholbolt) throw new aldaa("Байгууллагын холболт олдсонгүй!");

    await kodIlgeeye(utas, undsen, kholbolt);

    res.status(200).json({
      success: true,
      message: "Баталгаажуулах код дахин илгээгдлээ",
      expiresIn: KOD_KHUCHINTEI_MINUT,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /gerBuliinGishuunBatalgaajuulya  (нээлттэй — уригдсан хүн өөрөө дуудна)
 * Код + нууц үгээ өгч гишүүнчлэлээ баталгаажуулаад шууд нэвтэрсэн токен авна.
 */
exports.gishuunBatalgaajuulya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const utas = utasTseverleye(req.body.utas);
    const code = String(req.body.code || "").trim();
    const nuutsUg = String(req.body.nuutsUg || "").trim();

    if (!utas) throw new aldaa("Утасны дугаар буруу байна!");
    if (!code) throw new aldaa("Баталгаажуулах код заавал бөглөх шаардлагатай!");
    if (nuutsUg.length < 4) {
      throw new aldaa("Нууц үг доод тал нь 4 тэмдэгт байх шаардлагатай!");
    }

    const UrilgaModel = GerBuliinUrilga(db.erunkhiiKholbolt);
    const urilga = await UrilgaModel.findOne({
      utas,
      tuluv: "Хүлээгдэж буй",
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!urilga) {
      throw new aldaa("Урилга олдсонгүй эсвэл хугацаа нь дууссан байна!");
    }

    const kholbolt = kholboltAvya(urilga.baiguullagiinId);
    if (!kholbolt) throw new aldaa("Байгууллагын холболт олдсонгүй!");

    const BatalgaajuulahCodeModel = BatalgaajuulahCode(kholbolt);
    const shalgalt = await BatalgaajuulahCodeModel.verifyCode(
      utas,
      code,
      "gishuun_urikh",
    );
    if (!shalgalt.success) {
      await BatalgaajuulahCodeModel.incrementAttempts(
        utas,
        code,
        "gishuun_urikh",
      ).catch(() => {});
      throw new aldaa(shalgalt.message || "Хүчингүй код байна!");
    }

    const undsen = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      urilga.undsenId,
    );
    if (!undsen) throw new aldaa("Үндсэн эзэмшигчийн бүртгэл олдсонгүй!");
    if (undsen.undsenId) {
      throw new aldaa("Үндсэн эзэмшигчийн бүртгэл буруу байна!");
    }

    // Урилга үүссэнээс хойш нөхцөл өөрчлөгдсөн эсэхийг дахин шалгана
    let gishuun = await OrshinSuugch(db.erunkhiiKholbolt)
      .findOne({ utas })
      .select("+nuutsUg");

    if (gishuun && !gishuun.undsenId) {
      const uurTootTai =
        (Array.isArray(gishuun.toots) && gishuun.toots.length > 0) ||
        !!(gishuun.toot && String(gishuun.toot).trim());
      if (uurTootTai) {
        throw new aldaa(
          "Энэ дугаар өөрийн тоотын бүртгэлтэй тул гишүүнээр бүртгэх боломжгүй.",
        );
      }
    }
    if (
      gishuun &&
      gishuun.undsenId &&
      String(gishuun.undsenId) !== String(undsen._id)
    ) {
      throw new aldaa("Энэ дугаар өөр дансны гишүүнээр бүртгэлтэй байна!");
    }

    if (!gishuun) {
      gishuun = new (OrshinSuugch(db.erunkhiiKholbolt))({
        utas,
        nevtrekhNer: utas,
        erkh: "OrshinSuugch",
      });
    }

    gishuun.undsenId = String(undsen._id);
    gishuun.gishuuniiKholboo = urilga.kholboo || "Бусад";
    gishuun.gishuuniiErkh = urilga.erkh || "Харах + Төлөх";
    gishuun.gishuuniiTuluv = "Идэвхтэй";
    gishuun.gishuunUrisenOgnoo = urilga.createdAt;
    gishuun.gishuunBatalgaajsanOgnoo = new Date();
    gishuun.erkh = "OrshinSuugch";
    gishuun.nevtrekhNer = gishuun.nevtrekhNer || utas;
    gishuun.ovog = req.body.ovog || gishuun.ovog || urilga.ovog || "";
    gishuun.ner = req.body.ner || gishuun.ner || urilga.ner || "";
    gishuun.nuutsUg = nuutsUg; // pre("save") hook нь hash хийнэ
    gishuun.currentSessionId = String(
      Date.now() + Math.random().toString(36).substring(2, 7),
    );

    // Токен нь baiguullagiinId-аар бааз сонгодог тул үндсэнтэй ижил байх ёстой
    undsenEesKhayagAvya(gishuun, undsen);
    gishuun.toots = []; // Гишүүн өөрийн тоот эзэмшихгүй

    await gishuun.save();

    urilga.tuluv = "Баталгаажсан";
    urilga.batalgaajsanOgnoo = new Date();
    await urilga.save();

    const token = gishuun.tokenUusgeye();
    const khariu = gishuuniiKhariuBelgeye(gishuun.toJSON(), undsen);

    const butsaakhObject = {
      success: true,
      message: "Гэр бүлийн гишүүнээр амжилттай бүртгэгдлээ",
      result: khariu,
      token,
    };

    if (kholbolt.kholboltNer) {
      butsaakhObject.tukhainBaaziinKholbolt = kholbolt.kholboltNer;
    }

    res.status(200).json(butsaakhObject);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /gerBuliinGishuud
 * Үндсэн эзэмшигчийн гишүүд + хүлээгдэж буй урилгууд.
 * Гишүүн дуудсан ч ижил жагсаалтыг харна (нэг өрхийн мэдээлэл).
 */
exports.gishuudJagsaalt = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const token = req.body.nevtersenAjiltniiToken;
    const undsenId = ugugdliinEzniiId(token);
    if (!undsenId) throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");

    const [gishuud, urilguud] = await Promise.all([
      OrshinSuugch(db.erunkhiiKholbolt)
        .find({ undsenId: String(undsenId), gishuuniiTuluv: "Идэвхтэй" })
        .select(
          "ovog ner utas mail gishuuniiKholboo gishuuniiErkh gishuuniiTuluv gishuunBatalgaajsanOgnoo zurgiinId",
        )
        .sort({ gishuunBatalgaajsanOgnoo: 1 })
        .lean(),
      GerBuliinUrilga(db.erunkhiiKholbolt)
        .find({
          undsenId: String(undsenId),
          tuluv: "Хүлээгдэж буй",
          expiresAt: { $gt: new Date() },
        })
        .select("utas ovog ner kholboo erkh tuluv expiresAt createdAt")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      gishuud,
      khuleegdejBuiUrilguud: urilguud,
      niit: gishuud.length,
      dundKhyazgaar: MAX_GISHUUN,
      kholboonuud: GISHUUNII_KHOLBOO,
      // Хүсэлт гаргаж буй хүн өөрөө гишүүн үү?
      gishuunEsekh: !!token.undsenId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /gerBuliinGishuunErkh
 * Гишүүний эрхийг ("Харах" / "Харах + Төлөх") солино.
 */
exports.gishuunErkhSoliyo = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const undsen = await undsenEzemshigchAvya(req);

    const gishuuniiId = req.body.gishuuniiId || req.body.id;
    const erkh = req.body.erkh === "Харах" ? "Харах" : "Харах + Төлөх";
    if (!gishuuniiId) throw new aldaa("Гишүүний ID заавал бөглөх шаардлагатай!");

    const gishuun = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
      _id: gishuuniiId,
      undsenId: String(undsen._id),
    });
    if (!gishuun) throw new aldaa("Гишүүн олдсонгүй!");

    gishuun.gishuuniiErkh = erkh;
    // Эрх өөрчлөгдсөн тул хуучин токеныг хүчингүй болгож дахин нэвтрүүлнэ
    gishuun.currentSessionId = String(
      Date.now() + Math.random().toString(36).substring(2, 7),
    );
    await gishuun.save();

    res.status(200).json({
      success: true,
      message: "Гишүүний эрх шинэчлэгдлээ",
      result: {
        _id: gishuun._id,
        utas: gishuun.utas,
        gishuuniiErkh: gishuun.gishuuniiErkh,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /gerBuliinGishuunUstgakh
 * Үндсэн эзэмшигч гишүүнээ хасна, эсвэл хүлээгдэж буй урилгаа цуцална.
 * Гишүүн өөрөө ч гишүүнчлэлээсээ гарч чадна.
 */
exports.gishuunUstgakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const token = req.body.nevtersenAjiltniiToken;
    if (!token || !token.id || token.id === "zochin") {
      throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");
    }

    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    const UrilgaModel = GerBuliinUrilga(db.erunkhiiKholbolt);

    // 1. Гишүүн өөрөө гарч байна
    if (token.undsenId) {
      const gishuun = await OrshinSuugchModel.findById(token.id);
      if (!gishuun || !gishuun.undsenId) throw new aldaa("Гишүүн олдсонгүй!");

      await OrshinSuugchModel.deleteOne({ _id: gishuun._id });
      await UrilgaModel.deleteMany({
        utas: gishuun.utas,
        undsenId: String(gishuun.undsenId),
      });

      return res.status(200).json({
        success: true,
        message: "Та гэр бүлийн гишүүнчлэлээсээ гарлаа",
      });
    }

    // 2. Үндсэн эзэмшигч гишүүн/урилга хасаж байна
    const undsen = await undsenEzemshigchAvya(req);
    const gishuuniiId = req.body.gishuuniiId || req.body.id;
    const utas = utasTseverleye(req.body.utas);

    if (!gishuuniiId && !utas) {
      throw new aldaa("Гишүүний ID эсвэл утасны дугаар заавал шаардлагатай!");
    }

    const shuult = { undsenId: String(undsen._id) };
    if (gishuuniiId) shuult._id = gishuuniiId;
    else shuult.utas = utas;

    const gishuun = await OrshinSuugchModel.findOne(shuult);

    if (gishuun) {
      await OrshinSuugchModel.deleteOne({ _id: gishuun._id });
      await UrilgaModel.deleteMany({
        utas: gishuun.utas,
        undsenId: String(undsen._id),
      });
      return res.status(200).json({
        success: true,
        message: "Гэр бүлийн гишүүн хасагдлаа",
      });
    }

    // Гишүүн олдсонгүй — хүлээгдэж буй урилга байж магадгүй
    const urilgaShuult = { undsenId: String(undsen._id) };
    if (utas) urilgaShuult.utas = utas;
    else urilgaShuult._id = gishuuniiId;

    const ustgasan = await UrilgaModel.deleteMany(urilgaShuult);
    if (ustgasan.deletedCount > 0) {
      return res.status(200).json({
        success: true,
        message: "Урилга цуцлагдлаа",
      });
    }

    throw new aldaa("Гишүүн эсвэл урилга олдсонгүй!");
  } catch (err) {
    next(err);
  }
});

/**
 * GET /gerBuliinUndsenEzemshigch
 * Гишүүн хэний дансыг харж байгаагаа мэдэх.
 */
exports.undsenEzemshigchiinMedeelel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const token = req.body.nevtersenAjiltniiToken;
    if (!token || !token.id) {
      throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");
    }

    if (!token.undsenId) {
      return res.status(200).json({
        success: true,
        gishuunEsekh: false,
        undsenEzemshigch: null,
      });
    }

    const undsen = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(token.undsenId)
      .select(
        "ovog ner utas toot toots baiguullagiinId baiguullagiinNer barilgiinId bairniiNer",
      )
      .lean();

    if (!undsen) throw new aldaa("Үндсэн эзэмшигчийн бүртгэл олдсонгүй!");

    res.status(200).json({
      success: true,
      gishuunEsekh: true,
      gishuuniiErkh: token.gishuuniiErkh || "Харах + Төлөх",
      undsenEzemshigch: undsen,
    });
  } catch (err) {
    next(err);
  }
});
