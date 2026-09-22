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
const {
  gerBuliinGishuunZovshoorokhEsekh,
} = require("../utils/baiguullagiinTokhirgoo");
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
  const token =
    req.body?.nevtersenAjiltniiToken ||
    req.nevtersenAjiltniiToken ||
    req.user;
  if (!token || !token.id || token.id === "zochin") {
    throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");
  }

  // Хэрэв админ/систем талаас үндсэн эзэмшигчийн ID дамжуулсан бол
  const undsenId = req.body?.undsenId;
  if (undsenId) {
    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    let undsen = await OrshinSuugchModel.findById(undsenId);
    if (!undsen && Array.isArray(db.kholboltuud)) {
      for (const k of db.kholboltuud) {
        try {
          const found = await OrshinSuugch(k).findById(undsenId);
          if (found) {
            undsen = found;
            break;
          }
        } catch (e) { }
      }
    }
    if (undsen) return undsen;
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

/**
 * Байгууллага дээр гэр бүлийн гишүүн урихыг зөвшөөрсөн эсэхийг шалгана.
 *
 * Вебийн «Нэмэлт тохиргоо → Гэр бүлийн гишүүн урих» чекээр удирдана.
 * Унтраалттай бол гишүүн урих/нэмэх/баталгаажуулах гурвуулан хаагдана —
 * эс бөгөөс хүлээгдэж байсан урилга дараа нь бүртгэгдээд орчихно.
 *
 * @param {string} baiguullagiinId
 * @param {string} [barilgiinId]
 */
async function gishuunZovshoorolShalgaya(baiguullagiinId, barilgiinId) {
  if (!baiguullagiinId) return;

  const { db } = require("zevbackv2");
  const Baiguullaga = require("../models/baiguullaga");

  let baiguullaga = null;
  try {
    baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );
  } catch (e) {
    // Байгууллагыг уншиж чадаагүй бол хориглохгүй — тохиргоо нь зөвшөөрөх
    // талдаа байна гэж үзнэ (хуучин зан төлөв).
    return;
  }

  if (!gerBuliinGishuunZovshoorokhEsekh(baiguullaga, barilgiinId)) {
    throw new aldaa(
      "Гэр бүлийн гишүүн урих боломжийг байрын удирдлага хаасан байна.",
    );
  }
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
    `${urisenNer} tanig ger buliin gishuunee urij baina. ` +
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

    await gishuunZovshoorolShalgaya(
      undsen.baiguullagiinId,
      undsen.barilgiinId,
    );

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

    const kodDoc = await kodIlgeeye(utas, undsen, kholbolt);

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
          code: String(kodDoc.code),
          expiresAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

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

    const kodDoc = await kodIlgeeye(utas, undsen, kholbolt);
    urilga.code = String(kodDoc.code);
    await urilga.save();

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
 * POST /gerBuliinUrilgaShalgaya  (нээлттэй)
 * 4 оронтой кодоор урилгыг шалгаж, хэн ямар хаягт урьсныг харуулна.
 */
exports.urilgaShalgaya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const code = String(req.body.code || "").trim();

    if (!code || code.length !== 4) {
      throw new aldaa("4 оронтой баталгаажуулах кодоо оруулна уу!");
    }

    const UrilgaModel = GerBuliinUrilga(db.erunkhiiKholbolt);
    let urilga = await UrilgaModel.findOne({
      code,
      tuluv: "Хүлээгдэж буй",
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    // 1. Бүх байгууллагын холболтуудаас (жишээ нь zevSukh) уг 4 оронтой кодыг хайна
    if (!urilga) {
      for (const k of (db.kholboltuud || [])) {
        if (!k || !k.kholbolt) continue;
        try {
          const bCode = await BatalgaajuulahCode(k).findOne({
            code,
            purpose: "gishuun_urikh",
            khereglesenEsekh: false,
          }).sort({ createdAt: -1 });

          if (bCode) {
            urilga = await UrilgaModel.findOne({
              utas: bCode.utas,
              tuluv: "Хүлээгдэж буй",
              expiresAt: { $gt: new Date() },
            }).sort({ createdAt: -1 });

            if (urilga) {
              urilga.code = code;
              if (k.baiguullagiinId && !urilga.baiguullagiinId) {
                urilga.baiguullagiinId = String(k.baiguullagiinId);
              }
              await urilga.save().catch(() => { });
              break;
            }
          }
        } catch (e) { }
      }
    }

    // 2. Хүлээгдэж буй урилгуудаас холболтоор нь шалгах
    if (!urilga) {
      const buiUrilguud = await UrilgaModel.find({
        tuluv: "Хүлээгдэж буй",
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });

      for (const u of buiUrilguud) {
        const k = kholboltAvya(u.baiguullagiinId);
        if (k) {
          try {
            const bCode = await BatalgaajuulahCode(k).findOne({
              utas: u.utas,
              code,
              purpose: "gishuun_urikh",
              khereglesenEsekh: false,
            });
            if (bCode) {
              urilga = u;
              u.code = code;
              await u.save().catch(() => { });
              break;
            }
          } catch (e) { }
        }
      }
    }

    if (!urilga) {
      throw new aldaa("Хүчингүй код эсвэл урилгын хугацаа дууссан байна!");
    }

    const undsen = await OrshinSuugch(db.erunkhiiKholbolt).findById(urilga.undsenId);
    if (!undsen) {
      throw new aldaa("Үндсэн эзэмшигчийн бүртгэл олдсонгүй!");
    }

    const urisenNer = [undsen.ovog, undsen.ner].filter(Boolean).join(" ") || undsen.utas || "Гэр бүлийн гишүүн";
    const khayag = [undsen.bairName, undsen.toot ? `${undsen.toot} тоот` : ""].filter(Boolean).join(", ");

    const urilgaData = {
      urisenNer,
      urisenUtas: undsen.utas,
      gishuunNer: urilga.ner || "",
      kholboo: urilga.kholboo || "Гэр бүлийн гишүүн",
      khayag,
      utas: urilga.utas,
    };

    res.status(200).json({
      success: true,
      urilga: urilgaData,
      ...urilgaData,
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
    let utas = req.body.utas ? utasTseverleye(req.body.utas) : null;
    const code = String(req.body.code || "").trim();
    const nuutsUg = String(req.body.nuutsUg || "").trim();

    if (!code) throw new aldaa("Баталгаажуулах код заавал бөглөх шаардлагатай!");
    if (nuutsUg.length < 4) {
      throw new aldaa("Нууц үг доод тал нь 4 тэмдэгт байх шаардлагатай!");
    }

    const UrilgaModel = GerBuliinUrilga(db.erunkhiiKholbolt);
    let urilga = null;

    if (code) {
      urilga = await UrilgaModel.findOne({
        code,
        tuluv: "Хүлээгдэж буй",
        expiresAt: { $gt: new Date() },
        ...(utas ? { utas } : {}),
      }).sort({ createdAt: -1 });
    }

    if (!urilga) {
      for (const k of (db.kholboltuud || [])) {
        if (!k || !k.kholbolt) continue;
        try {
          const bCode = await BatalgaajuulahCode(k).findOne({
            code,
            purpose: "gishuun_urikh",
            khereglesenEsekh: false,
            ...(utas ? { utas } : {}),
          }).sort({ createdAt: -1 });

          if (bCode) {
            urilga = await UrilgaModel.findOne({
              utas: bCode.utas,
              tuluv: "Хүлээгдэж буй",
              expiresAt: { $gt: new Date() },
            }).sort({ createdAt: -1 });
            if (urilga) {
              urilga.code = code;
              if (k.baiguullagiinId && !urilga.baiguullagiinId) {
                urilga.baiguullagiinId = String(k.baiguullagiinId);
              }
              await urilga.save().catch(() => { });
              break;
            }
          }
        } catch (e) { }
      }
    }

    if (!urilga) {
      const buiUrilguud = await UrilgaModel.find({
        tuluv: "Хүлээгдэж буй",
        expiresAt: { $gt: new Date() },
        ...(utas ? { utas } : {}),
      }).sort({ createdAt: -1 });

      for (const u of buiUrilguud) {
        const k = kholboltAvya(u.baiguullagiinId);
        if (k) {
          const bCode = await BatalgaajuulahCode(k).findOne({
            utas: u.utas,
            code,
            purpose: "gishuun_urikh",
            khereglesenEsekh: false,
          });
          if (bCode) {
            urilga = u;
            break;
          }
        }
      }
    }

    if (!urilga) {
      throw new aldaa("Хүчингүй код эсвэл урилгын хугацаа дууссан байна!");
    }

    utas = urilga.utas;

    // Урилга үүссэний дараа байрын удирдлага боломжийг хааж мэднэ —
    // баталгаажуулах үед дахин шалгана, эс бөгөөс хүлээгдэж байсан урилга
    // тохиргоог тойрч бүртгэгдэнэ.
    await gishuunZovshoorolShalgaya(urilga.baiguullagiinId, urilga.barilgiinId);

    let kholbolt = kholboltAvya(urilga.baiguullagiinId);
    if (!kholbolt) {
      for (const k of (db.kholboltuud || [])) {
        if (!k || !k.kholbolt) continue;
        try {
          const exists = await BatalgaajuulahCode(k).findOne({
            utas,
            code,
            purpose: "gishuun_urikh",
            khereglesenEsekh: false,
          });
          if (exists) {
            kholbolt = k;
            break;
          }
        } catch (e) { }
      }
    }
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
      ).catch(() => { });
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

    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    let gishuun = await OrshinSuugchModel.findOne({
      _id: gishuuniiId,
      undsenId: String(undsen._id),
    });
    if (!gishuun) {
      gishuun = await OrshinSuugchModel.findById(gishuuniiId);
    }
    if (!gishuun) throw new aldaa("Гишүүн олдсонгүй!");

    gishuun.gishuuniiErkh = erkh;
    // Эрх өөрчлөгдсөн тул хуучин токеныг хүчингүй болгож дахин нэвтрүүлнэ
    gishuun.currentSessionId = String(
      Date.now() + Math.random().toString(36).substring(2, 7),
    );
    await gishuun.save();

    // Tenant DB sync
    const kholbolt = kholboltAvya(undsen.baiguullagiinId || gishuun.baiguullagiinId);
    if (kholbolt) {
      try {
        await OrshinSuugch(kholbolt).updateOne(
          { _id: gishuun._id },
          { $set: { gishuuniiErkh: erkh } },
        );
      } catch (e) { }
    }

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
    const token =
      req.body?.nevtersenAjiltniiToken ||
      req.nevtersenAjiltniiToken ||
      req.user;
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

    // 2. Үндсэн эзэмшигч эсвэл админ гишүүн/урилга хасаж байна
    const undsen = await undsenEzemshigchAvya(req);
    const gishuuniiId = req.body.gishuuniiId || req.body.id;
    const utas = utasTseverleye(req.body.utas);

    if (!gishuuniiId && !utas) {
      throw new aldaa("Гишүүний ID эсвэл утасны дугаар заавал шаардлагатай!");
    }

    const shuult = { undsenId: String(undsen._id) };
    if (gishuuniiId) shuult._id = gishuuniiId;
    else shuult.utas = utas;

    let gishuun = await OrshinSuugchModel.findOne(shuult);
    if (!gishuun && gishuuniiId) {
      gishuun = await OrshinSuugchModel.findById(gishuuniiId);
    }

    if (gishuun) {
      await OrshinSuugchModel.deleteOne({ _id: gishuun._id });
      await UrilgaModel.deleteMany({
        utas: gishuun.utas,
        undsenId: String(undsen._id),
      });

      const kholbolt = kholboltAvya(undsen.baiguullagiinId || gishuun.baiguullagiinId);
      if (kholbolt) {
        try {
          await OrshinSuugch(kholbolt).deleteOne({ _id: gishuun._id });
        } catch (e) { }
      }

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
 * POST /gerBuliinGishuunZasakh
 * Гишүүний мэдээлэл засах (овог, нэр, утас, холбоо, эрх)
 */
exports.gishuunZasakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const gishuuniiId = req.body.gishuuniiId || req.body.id;
    if (!gishuuniiId) throw new aldaa("Гишүүний ID шаардлагатай!");

    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
    let gishuun = await OrshinSuugchModel.findById(gishuuniiId);
    if (!gishuun) throw new aldaa("Гишүүн олдсонгүй!");

    if (req.body.ovog !== undefined) gishuun.ovog = String(req.body.ovog || "").trim();
    if (req.body.ner !== undefined) gishuun.ner = String(req.body.ner || "").trim();
    if (req.body.kholboo !== undefined) gishuun.gishuuniiKholboo = req.body.kholboo;
    if (req.body.erkh !== undefined) {
      gishuun.gishuuniiErkh = req.body.erkh === "Харах" ? "Харах" : "Харах + Төлөх";
    }
    if (req.body.utas) {
      const tseverUtas = utasTseverleye(req.body.utas);
      if (tseverUtas) {
        gishuun.utas = tseverUtas;
        gishuun.nevtrekhNer = tseverUtas;
      }
    }

    await gishuun.save();

    const kholbolt = kholboltAvya(gishuun.baiguullagiinId);
    if (kholbolt) {
      try {
        await OrshinSuugch(kholbolt).updateOne(
          { _id: gishuun._id },
          {
            $set: {
              ovog: gishuun.ovog,
              ner: gishuun.ner,
              utas: gishuun.utas,
              gishuuniiKholboo: gishuun.gishuuniiKholboo,
              gishuuniiErkh: gishuun.gishuuniiErkh,
            },
          },
        );
      } catch (e) { }
    }

    res.status(200).json({
      success: true,
      message: "Гишүүний мэдээлэл шинэчлэгдлээ",
      gishuun,
    });
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

/**
 * АДМИН талаас гэр бүлийн гишүүнийг ШУУД нэмэх.
 *
 * `gishuunUrikh` нь оршин суугчийн апп-д зориулагдсан: үндсэн эзэмшигчийг
 * НЭВТЭРСЭН ТОКЕНООС олж, урилга үүсгээд тухайн хүн өөрөө баталгаажуулдаг.
 * Админ веб дээр токен нь ажилтных тул тэр зам ажиллахгүй.
 *
 * Энд үндсэн эзэмшигчийг `undsenId`-гээр ШУУД зааж, баталгаажуулалтгүйгээр
 * гишүүнийг үүсгэнэ. Талбарууд нь `gishuunBatalgaajuulya`-гийнхтай ижил
 * байхаар бичив — хоёр замаар үүссэн гишүүн ялгаагүй байх ёстой.
 *
 * POST /gerBuliinGishuunNemekh
 *   { undsenId, utas, ner?, ovog?, kholboo?, erkh? }
 */
exports.gishuunNemekh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    // Ажилтан мөн эсэх — энэ зам зөвхөн админ талд зориулагдсан.
    const token =
      req.body?.nevtersenAjiltniiToken ||
      req.nevtersenAjiltniiToken ||
      req.user;
    const ajiltniiId = token?.id || token?._id || token?.sub;
    if (!ajiltniiId) throw new aldaa("Нэвтрэх шаардлагатай!");

    const undsenId = String(req.body.undsenId || "").trim();
    if (!undsenId) throw new aldaa("Үндсэн эзэмшигчийн ID хоосон!");

    const utas = utasTseverleye(req.body.utas);
    if (!utas) throw new aldaa("Утасны дугаар буруу байна!");

    const kholboo = req.body.kholboo || "Бусад";
    const erkh = req.body.erkh === "Харах" ? "Харах" : "Харах + Төлөх";

    const OrshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);

    let undsen = await OrshinSuugchModel.findById(undsenId);
    if (!undsen && Array.isArray(db.kholboltuud)) {
      for (const k of db.kholboltuud) {
        try {
          const found = await OrshinSuugch(k).findById(undsenId);
          if (found) {
            undsen = found;
            break;
          }
        } catch (e) { }
      }
    }
    if (!undsen) throw new aldaa("Үндсэн эзэмшигч олдсонгүй!");
    if (undsen.undsenId) {
      throw new aldaa(
        "Сонгосон хэрэглэгч нь өөрөө гэр бүлийн гишүүн байна. Үндсэн эзэмшигч дээр нэмнэ үү.",
      );
    }
    if (!undsen.baiguullagiinId) {
      throw new aldaa("Үндсэн эзэмшигч байгууллагад холбогдоогүй байна.");
    }

    await gishuunZovshoorolShalgaya(
      undsen.baiguullagiinId,
      undsen.barilgiinId,
    );

    // Тоон хязгаар — оршин суугчийн урсгалтай ижил дүрэм.
    const idevkhteiToo = await OrshinSuugchModel.countDocuments({
      undsenId: String(undsen._id),
      gishuuniiTuluv: "Идэвхтэй",
    });
    if (idevkhteiToo >= MAX_GISHUUN) {
      throw new aldaa(
        `Гэр бүлийн гишүүний тоо хязгаарт (${MAX_GISHUUN}) хүрсэн байна.`,
      );
    }

    let gishuun = await OrshinSuugchModel.findOne({ utas });

    if (gishuun) {
      // Аль хэдийн өөр хүний гишүүн, эсвэл өөрөө тоот эзэмшдэг бол хөндөхгүй.
      if (
        gishuun.undsenId &&
        String(gishuun.undsenId) !== String(undsen._id)
      ) {
        throw new aldaa("Энэ дугаар өөр эзэмшигчийн гишүүнээр бүртгэлтэй байна.");
      }
      if (
        !gishuun.undsenId &&
        Array.isArray(gishuun.toots) &&
        gishuun.toots.length > 0
      ) {
        throw new aldaa(
          "Энэ дугаар тоот эзэмшдэг оршин суугчийнх байна. Гишүүн болгох боломжгүй.",
        );
      }
    } else {
      gishuun = new OrshinSuugchModel({
        utas,
        nevtrekhNer: utas,
        erkh: "OrshinSuugch",
      });
    }

    gishuun.undsenId = String(undsen._id);
    gishuun.gishuuniiKholboo = kholboo;
    gishuun.gishuuniiErkh = erkh;
    gishuun.gishuuniiTuluv = "Идэвхтэй";
    gishuun.gishuunBatalgaajsanOgnoo = new Date();
    gishuun.erkh = "OrshinSuugch";
    gishuun.nevtrekhNer = gishuun.nevtrekhNer || utas;
    gishuun.ovog = req.body.ovog || gishuun.ovog || "";
    gishuun.ner = req.body.ner || gishuun.ner || "";
    gishuun.baiguullagiinId = undsen.baiguullagiinId;
    gishuun.barilgiinId = undsen.barilgiinId;
    // Гишүүн өөрийн тоот эзэмшихгүй — үндсэнийхээ мэдээллийг уншина.
    gishuun.toots = [];

    await gishuun.save();

    res.send({
      success: true,
      message: "Гэр бүлийн гишүүн нэмэгдлээ",
      gishuun: {
        _id: String(gishuun._id),
        ner: gishuun.ner,
        ovog: gishuun.ovog,
        utas: gishuun.utas,
        gishuuniiErkh: gishuun.gishuuniiErkh,
        gishuuniiKholboo: gishuun.gishuuniiKholboo,
        gishuuniiTuluv: gishuun.gishuuniiTuluv,
      },
    });
  } catch (error) {
    next(error);
  }
});
