/**
 * Харилцагчийг Excel-ээр оруулах — загвар татах + импорт.
 *
 * Харилцагч (khariltsagch) нь оршин суугчаас (orshinSuugch) тусдаа цуглуулга.
 * Тэр нь орон сууцгүй, зөвхөн ЗОГСООЛ/АГУУЛАХ эзэмшдэг тул бүртгэл нь машины
 * дугаартай нягт холбоотой — зогсоол бүртгэсэн ч машин бүртгэгдээгүй бол
 * хаалга/камер машиныг танихгүй. Иймд энэ импорт зогсоол/агуулахын тоот,
 * гэрээ, нэхэмжлэх, машины дугаарыг НЭГ мөрөнд бүгдийг гүйцэтгэнэ.
 *
 * Гэрээ үүсгэх/цуцлах логикийг ДАХИН БИЧСЭНГҮЙ — гараар бүртгэх урсгал
 * (`POST /khariltsagch`) хэрэглэдэг `syncResidentContracts`-ыг л дуудна.
 * Ингэснээр Excel-ээр орсон харилцагч гараар орсонтой яг адилхан болно
 * (`khariltsagchId` талбар, зогсоолыг үндсэн тоот болгох зэрэг).
 */

const asyncHandler = require("express-async-handler");
const XLSX = require("xlsx");
const excel = require("exceljs");
const { tolgoiNud } = require("../utils/excelZagvar");
const { mashinuudBurtgeye, dugaaruudSalgaya } = require("../utils/mashinBurtgel");
const Baiguullaga = require("../models/baiguullaga");
const Khariltsagch = require("../models/khariltsagch");
const Geree = require("../models/geree");
const aldaa = require("../components/aldaa");

/** Загварын багануудын нэр — импорт ч эндээс уншина. */
const TOLGOINUUD = [
  "Овог",
  "Нэр",
  "Утас",
  "Имэйл",
  "Давхар",
  "Зогсоолын дугаар",
  "Агуулахын дугаар",
  "Машины дугаар",
  "Эхний үлдэгдэл",
  "Тайлбар",
];

/** Excel-ийн баганын өргөн (TOLGOINUUD-ийн дараалалтай нийцнэ). */
const BAGANANII_URGUN = [15, 18, 12, 24, 10, 18, 18, 22, 16, 24];

/**
 * Заавал бөглөх багануудын Excel дугаар (1-ээс).
 *
 * Зөвхөн «Нэр» (2). Өмнө нь «Утас» (3) ба «Зогсоолын дугаар» (6) ч
 * орсон байсныг хассан — харилцагч дээр тэдгээр нь сул талбар.
 */
const ZAAVAL_BAGANA = [2];

/** "B1", "b2" гэх мэт хонгилын давхар эсэхийг шалгана. */
const doodDavkharEsekh = (d) => /^b\d+$/i.test(String(d || "").trim());

/**
 * Нэг мөрнөөс баганын аль нэг нэрээр утга уншина (хуучин/шинэ гарчиг хоёуланг
 * тэвчихийн тулд хэд хэдэн нэр дамжуулж болно).
 */
function nudUnshiya(mur, ...neruud) {
  for (const ner of neruud) {
    const utga = mur[ner];
    if (utga !== undefined && utga !== null && String(utga).trim() !== "") {
      return String(utga).trim();
    }
  }
  return "";
}

/**
 * Нэг нүдэнд бичсэн олон тоотыг салгана: "12, 13" / "12;13" / мөр бүрд нэг.
 * Машины дугаараас өөр — том/жижиг үсэг, зайг нь хөндөхгүй (тоот "B1-05"
 * гэх мэт бичигдсэн байж болно).
 */
function tootuudSalgaya(raw) {
  const jagsaalt = String(raw ?? "")
    .split(/[,;|\n\r]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return Array.from(new Set(jagsaalt));
}

/** "Тийм"/"true"/"1" → true. Бусад бүхэн false. */
function tiimEsekh(utga) {
  const tsever = String(utga ?? "").trim().toLowerCase();
  return tsever === "true" || tsever === "тийм" || tsever === "1";
}

/**
 * Овог тусдаа баганад байхгүй бол нэрнээс салгана: "Б.Батбаяр" → "Б." + "Батбаяр".
 * Оршин суугчийн импорттой ижил дүрэм.
 */
function ovogNerSalgaya(ovogRaw, nerRaw) {
  let ovog = ovogRaw;
  let ner = nerRaw;

  if (!ovog && ner) {
    const tsegtei = ner.match(/^([А-ЯЁа-яё]+)\.(.+)$/);
    if (tsegtei) {
      ovog = tsegtei[1] + ".";
      ner = tsegtei[2].trim();
    } else {
      const zaitai = ner.match(/^([А-ЯЁа-яё]+)\s+(.+)$/);
      if (zaitai) {
        ovog = zaitai[1].trim();
        ner = zaitai[2].trim();
      }
    }
  }

  return { ovog: ovog || "", ner: ner || "" };
}

/** Барилгын тохиргооноос зогсоол/агуулахын давхруудыг цуглуулна. */
function davkhruudOlya(barilga) {
  const olonts = new Set();

  const turluud = [
    barilga?.tokhirgoo?.davkhariinZogsoolnuud,
    barilga?.tokhirgoo?.davkhariinAguulakhnuud,
  ];

  for (const map of turluud) {
    if (!map || typeof map !== "object") continue;
    Object.keys(map).forEach((key) => {
      const davkhar = key.includes("::") ? key.split("::")[1] : key;
      const tsever = String(davkhar || "").trim();
      if (tsever) olonts.add(tsever);
    });
  }

  // Тохиргоонд зогсоолын давхар бүртгээгүй байрны хувьд барилгын давхрын
  // жагсаалтаас хонгилынхыг (B1, B2...) сонгож нөхнө.
  if (olonts.size === 0 && Array.isArray(barilga?.tokhirgoo?.davkhar)) {
    barilga.tokhirgoo.davkhar
      .filter(doodDavkharEsekh)
      .forEach((d) => olonts.add(String(d).trim()));
  }

  return Array.from(olonts).sort((a, b) => {
    const toonA = parseInt(String(a).replace(/\D/g, ""), 10);
    const toonB = parseInt(String(b).replace(/\D/g, ""), 10);
    if (!isNaN(toonA) && !isNaN(toonB)) return toonA - toonB;
    return String(a).localeCompare(String(b));
  });
}

/** "12, 13" / ["12","13"] → ["12","13"] (барилгын тохиргооны утга) */
function negjuudJagsaalt(utga) {
  const tuukhii = Array.isArray(utga) ? utga : typeof utga === "string" ? [utga] : [];
  return tuukhii
    .flatMap((v) => String(v ?? "").split(/[\s,;|]+/))
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Гараж/зогсоол ба агуулахын төрлийг нэг хэлбэрт оруулна. */
function negjiinAngilal(turul) {
  const t = String(turul || "").trim().toLowerCase();
  if (t === "гараж" || t === "гараш" || t === "зогсоол" || t === "parking" || t === "garage") return "Гараж";
  if (t === "агуулах" || t === "storage") return "Агуулах";
  return "";
}

/**
 * Барилгын бүртгэлтэй гараж/агуулахын дугааруудаас ЭЗЭМШИГЧГҮЙ (сул)
 * дугааруудыг давхраар нь буцаана: { "B1": ["1","2"], ... }.
 *
 * Эзэмшигч = харилцагч эсвэл оршин суугчийн toots[] дотор тухайн барилгын
 * ижил төрөл, давхар, дугаартай тоот. Давхаргүй хадгалсан хуучин бичлэг
 * бүх давхрын тэр дугаарыг эзэлсэнд тооцно (андуурч давхар олгохоос сэргийлнэ).
 */
async function sulNegjuudOlya({ erunkhiiKholbolt, barilga, barilgiinId }) {
  const OrshinSuugch = require("../models/orshinSuugch");
  const tokhirgooTalbar = { Гараж: "davkhariinZogsoolnuud", Агуулах: "davkhariinAguulakhnuud" };

  const shuult = {
    $or: [{ "toots.barilgiinId": String(barilgiinId) }, { barilgiinId: String(barilgiinId) }],
  };
  const talbaruud = { toots: 1, toot: 1, davkhar: 1, turul: 1, barilgiinId: 1 };
  const [khariltsagchid, orshinSuugchid] = await Promise.all([
    Khariltsagch(erunkhiiKholbolt).find(shuult, talbaruud).lean(),
    OrshinSuugch(erunkhiiKholbolt).find(shuult, talbaruud).lean(),
  ]);

  // ezlegdsen[angilal] = Set("B1|12", "|12" (давхаргүй))
  const ezlegdsen = { Гараж: new Set(), Агуулах: new Set() };
  for (const khun of [...khariltsagchid, ...orshinSuugchid]) {
    const tootuud = Array.isArray(khun.toots) && khun.toots.length > 0 ? khun.toots : [];
    for (const t of tootuud) {
      if (String(t?.barilgiinId || "") !== String(barilgiinId)) continue;
      const angilal = negjiinAngilal(t.turul);
      const toot = String(t.toot || "").trim();
      if (!angilal || !toot) continue;
      ezlegdsen[angilal].add(`${String(t.davkhar || "").trim().toLowerCase()}|${toot.toLowerCase()}`);
    }
  }

  const ur = { Гараж: {}, Агуулах: {} };
  for (const angilal of ["Гараж", "Агуулах"]) {
    const map = barilga?.tokhirgoo?.[tokhirgooTalbar[angilal]] || {};
    Object.entries(map).forEach(([key, utga]) => {
      const davkhar = String(key.includes("::") ? key.split("::")[1] : key).trim();
      if (!davkhar) return;
      const d = davkhar.toLowerCase();
      const sul = negjuudJagsaalt(utga).filter((toot) => {
        const tl = toot.toLowerCase();
        return !ezlegdsen[angilal].has(`${d}|${tl}`) && !ezlegdsen[angilal].has(`|${tl}`);
      });
      ur[angilal][davkhar] = Array.from(new Set([...(ur[angilal][davkhar] || []), ...sul]));
    });
  }
  return ur;
}

/** Excel-ийн баганын үсэг: 1 → A, 27 → AA */
function baganiinUseg(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Давхрын нэрийг Excel-ийн нэрлэсэн мужид тохирох болгоно: "B-1" → "B_1" */
const davkhariinNerKhevshuulekh = (d) => String(d).trim().replace(/[^0-9A-Za-zА-Яа-яЁёӨөҮү]/g, "_");

/**
 * Excel-ийн буферээс өгөгдлийн мөрүүдийг уншина.
 *
 * 1-р мөр = гарчиг. Загварт 2-р мөр хоосон байж болох тул ҮНЭХЭЭР хоосон
 * байвал л алгасна — хэрэглэгч тэнд эхний бүртгэлээ бичсэн байж мэднэ.
 * Мөр бүрд `__mur` талбараар Excel-ийн бодит мөрийн дугаарыг хамт буцаана
 * (алдааг хэрэглэгч файл дээрээ шууд олох боломжтой байх).
 *
 * @param {Buffer} buffer
 * @returns {object[]}
 */
function murnuudUnshiya(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const buhMur = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    header: 1,
  });

  const tolgoi = buhMur[0] || [];
  const khoosonMur = (m) =>
    !m || !m.some((n) => n !== undefined && n !== null && n !== "");
  const ekhlel = khoosonMur(buhMur[1]) ? 2 : 1;

  return buhMur
    .slice(ekhlel)
    .map((m, i) => ({ m, excelMur: ekhlel + 1 + i }))
    .filter(({ m }) => !khoosonMur(m))
    .map(({ m, excelMur }) => {
      const obj = { __mur: excelMur };
      tolgoi.forEach((ner, idx) => {
        if (ner) obj[ner] = m[idx] !== undefined ? m[idx] : "";
      });
      return obj;
    });
}

/**
 * Нэг мөрийн талбаруудыг уншиж, шалгалтын алдааг нь хамт буцаана.
 * Хуучин гарчигтай файл ч ажиллахын тулд багана бүрд хувилбар нэр тэвчинэ.
 *
 * @param {object} mur `murnuudUnshiya`-аас гарсан мөр
 */
function murniiUtgaUnshiya(mur) {
  const { ovog, ner } = ovogNerSalgaya(
    nudUnshiya(mur, "Овог"),
    nudUnshiya(mur, "Нэр"),
  );

  const utas = nudUnshiya(mur, "Утас", "Утасны дугаар").replace(/\s/g, "");
  const zogsoolnuud = tootuudSalgaya(
    nudUnshiya(mur, "Зогсоолын дугаар", "Зогсоол", "Гаражийн дугаар", "Гараж"),
  );
  const aguulakhnuud = tootuudSalgaya(
    nudUnshiya(mur, "Агуулахын дугаар", "Агуулах"),
  );

  const aldaanuud = [];
  // Зөвхөн НЭР шаардлагатай. Харилцагч дээр утас, зогсоол/агуулахын дугаар
  // байхгүй байх нь хэвийн (жишээ нь зөвхөн гэрээ бүртгэх, дараа нь тоот
  // нэмэх) тул тэднийг албадахгүй.
  if (!ner) aldaanuud.push("Нэр");
  // Утас ОРУУЛСАН бол хэлбэрийг шалгасаар байна — буруу дугаар нь хоосон
  // байхаас ч дор.
  if (utas) {
    if (!/^\d+$/.test(utas)) aldaanuud.push("Утас буруу");
    else if (utas.length !== 8) aldaanuud.push("Утас 8 орон");
  }

  return {
    ovog,
    ner,
    utas,
    mail: nudUnshiya(mur, "Имэйл", "Мэйл"),
    davkhar: nudUnshiya(mur, "Давхар"),
    tailbar: nudUnshiya(mur, "Тайлбар"),
    zogsoolnuud,
    aguulakhnuud,
    mashinuud: dugaaruudSalgaya(
      nudUnshiya(mur, "Машины дугаар", "Машин", "Улсын дугаар", "Автомашин"),
    ),
    ekhniiUldegdel:
      parseFloat(nudUnshiya(mur, "Эхний үлдэгдэл").replace(/[,\s\u20ae]/g, "")) ||
      0,
    khonogoorBodokhEsekh: tiimEsekh(nudUnshiya(mur, "Хоногоор бодох")),
    bodokhKhonog:
      parseInt(
        nudUnshiya(mur, "Ирээдүйд ашиглах хоног", "Ашиглах хоног"),
        10,
      ) || 0,
    aldaanuud,
  };
}

/**
 * GET /khariltsagchExcelTemplate
 * Харилцагч бүртгэх Excel загварыг үүсгэж буцаана.
 */
exports.generateKhariltsagchExcelTemplate = asyncHandler(
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const { baiguullagiinId, barilgiinId } = req.query;

      let davkharList = [];
      // Сул гараж/агуулахын дугаар давхраар: { Гараж: { B1: [...] }, Агуулах: {...} }
      let sulNegjuud = { Гараж: {}, Агуулах: {} };

      if (baiguullagiinId) {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          baiguullagiinId,
        );
        const barilga = barilgiinId
          ? baiguullaga?.barilguud?.find(
            (b) => String(b._id) === String(barilgiinId),
          )
          : baiguullaga?.barilguud?.[0];
        if (barilga) {
          davkharList = davkhruudOlya(barilga);
          try {
            sulNegjuud = await sulNegjuudOlya({
              erunkhiiKholbolt: db.erunkhiiKholbolt,
              barilga,
              barilgiinId: String(barilga._id),
            });
          } catch (e) {
            // Жагсаалт гаргаж чадаагүй ч загвар (dropdown-гүй) татагдана
            console.error("Сул гараж/агуулахын жагсаалт гаргахад алдаа:", e.message);
          }
        }
      }

      if (davkharList.length === 0) davkharList = ["B1", "B2", "B3"];

      const workbook = new excel.Workbook();
      const worksheet = workbook.addWorksheet("Харилцагч бүртгэх");

      worksheet.columns = TOLGOINUUD.map((tolgoi, i) => ({
        header: tolgoi,
        key: tolgoi,
        width: BAGANANII_URGUN[i] || 15,
      }));

      const tolgoiMur = worksheet.getRow(1);
      tolgoiMur.eachCell((nud, baganiinDugaar) => {
        tolgoiNud(nud, { zoolon: !ZAAVAL_BAGANA.includes(baganiinDugaar) });
      });
      tolgoiMur.commit();

      // Давхар (E багана) — барилгын тохиргооны жагсаалтаас сонгуулна.
      const davkharFormula = `"${davkharList.join(",")}"`;
      if (davkharFormula.length < 255) {
        worksheet.dataValidations.add("E2:E2000", {
          type: "list",
          allowBlank: true,
          formulae: [davkharFormula],
          showErrorMessage: true,
          errorStyle: "error",
          error: "Жагсаалтаас сонгоно уу!",
        });
      }

      // ── Гараж / агуулахын дугаар — зөвхөн бүртгэлтэй СУЛ дугаараас сонгуулна ──
      // Жагсаалтыг нуусан «Жагсаалт» хуудсанд давхар бүрээр багана болгон
      // бичиж, нэрлэсэн муж (Z_B1, A_B1 ...) үүсгэнэ. Давхар (E) сонгосон бол
      // тухайн давхрын сул дугаар, сонгоогүй бол бүх давхрын сул дугаар гарна.
      // Нэг нүдэнд таслалаар олон дугаар бичих боломжийг хадгалахын тулд
      // алдааг «анхааруулга» хэлбэрээр харуулна (хориглохгүй).
      const jagsaalt = workbook.addWorksheet("Жагсаалт", { state: "veryHidden" });
      let jagsaaltBagana = 0;
      const muzNemekh = (ner, utguud) => {
        if (!utguud.length) return false;
        jagsaaltBagana += 1;
        const useg = baganiinUseg(jagsaaltBagana);
        jagsaalt.getCell(`${useg}1`).value = ner;
        utguud.forEach((u, i) => {
          // Тоог текст болгож хадгална — «01» гэх мэт дугаар тэглэгдэхгүй
          jagsaalt.getCell(`${useg}${i + 2}`).value = String(u);
        });
        workbook.definedNames.add(
          `'Жагсаалт'!$${useg}$2:$${useg}$${utguud.length + 1}`,
          ner,
        );
        return true;
      };

      [
        { angilal: "Гараж", tolgoi: "Зогсоолын дугаар", urtgal: "Z" },
        { angilal: "Агуулах", tolgoi: "Агуулахын дугаар", urtgal: "A" },
      ].forEach(({ angilal, tolgoi, urtgal }) => {
        const davkhraar = sulNegjuud[angilal] || {};
        const davkhruud = Object.keys(davkhraar).filter((d) => davkhraar[d].length > 0);
        const buh = Array.from(new Set(davkhruud.flatMap((d) => davkhraar[d])));
        // Давхар хоосон үед «Z_» нэр (бүх давхрын сул дугаар) гарна.
        const buhNer = `${urtgal}_`;
        if (!muzNemekh(buhNer, buh)) return; // Сул дугаар алга — dropdown тавихгүй
        davkhruud.forEach((d) => muzNemekh(`${urtgal}_${davkhariinNerKhevshuulekh(d)}`, davkhraar[d]));

        const useg = baganiinUseg(TOLGOINUUD.indexOf(tolgoi) + 1);
        // Давхрын нэрийг томъёонд ижил дүрмээр хувиргана (- , зай → _)
        const davkharNer = `SUBSTITUTE(SUBSTITUTE(TRIM($E2),"-","_")," ","_")`;
        worksheet.dataValidations.add(`${useg}2:${useg}2000`, {
          type: "list",
          allowBlank: true,
          // Энгийн INDIRECT — Excel (Windows/Mac/Online) бүгд dropdown-ийг
          // найдвартай нээдэг. IF/ISREF/IFERROR-оор ороосон томъёо зарим
          // хувилбарт жагсаалтыг нээдэггүй байв.
          formulae: [`INDIRECT("${urtgal}_"&${davkharNer})`],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Жагсаалтад байхгүй дугаар",
          error: `Энэ ${angilal === "Гараж" ? "зогсоолын" : "агуулахын"} дугаар бүртгэлгүй эсвэл эзэмшигчтэй байна. Олон дугаарыг таслалаар бичсэн бол «Yes» дарж үргэлжлүүлнэ үү.`,
          showInputMessage: true,
          promptTitle: `Сул ${angilal === "Гараж" ? "зогсоол" : "агуулах"}`,
          prompt: "Давхар сонгосон бол тухайн давхрын сул дугаар л гарна.",
        });
      });

      // «Зогсоолын дугаар» гарчиг дээр тайлбар (Excel-ийн note) — гадна
      // зогсоол дугааргүй тул хоосон үлдээнэ.
      const zogsoolBagana = TOLGOINUUD.indexOf("Зогсоолын дугаар") + 1;
      tolgoiMur.getCell(zogsoolBagana).note = {
        texts: [
          { font: { bold: true, size: 9 }, text: "Зогсоолын дугаар\n" },
          {
            font: { size: 9 },
            text: "Зөвхөн гадна зогсоол бол хоосон үлдээнэ үү. Олон зогсоол байвал таслалаар: 12,13,14",
          },
        ],
        margins: { insetmode: "auto" },
      };

      // Зааврыг тусдаа хуудсанд — өгөгдлийн хуудас цэвэр байх.
      const zaavar = workbook.addWorksheet("Заавар");
      zaavar.columns = [{ width: 26 }, { width: 86 }];
      const zaavriinMur = zaavar.getRow(1);
      zaavriinMur.values = ["Багана", "Тайлбар"];
      zaavriinMur.eachCell((nud) => tolgoiNud(nud));
      zaavriinMur.commit();

      [
        ["Нэр", "Заавал. Овог тусдаа баганад байхгүй бол \"Б.Батбаяр\" гэж бичиж болно."],
        ["Утас", "Хоосон байж болно. Бөглөвөл 8 оронтой тоо. Ижил утастай харилцагч аль хэдийн бүртгэлтэй бол шинээр үүсгэхгүй, тоот/машиныг нь нэмж бүртгэнэ."],
        ["Давхар", "Зогсоол/агуулах байрлах давхар (B1, B2 ...). Хоосон байж болно."],
        ["Зогсоолын дугаар", "Жагсаалтаас сонгоно — зөвхөн бүртгэлтэй, эзэмшигчгүй (сул) дугаар гарна. Давхар сонгосон бол тухайн давхрынх л гарна. Зөвхөн гадна зогсоол бол хоосон үлдээнэ үү. Олон зогсоол байвал таслалаар: 12,13,14"],
        ["Агуулахын дугаар", "Жагсаалтаас сонгоно — зөвхөн сул агуулах гарна. Таслалаар олныг бичиж болно: 5,6"],
        ["Машины дугаар", "Таслалаар олныг бичиж болно: 1234УБА, 5678УНА. Зогсоолын гэрээтэй хамт машин нь бүртгэгдэнэ."],
        ["Эхний үлдэгдэл", "Гэрээний эхний үлдэгдэл. Хоосон бол 0."],
        ["Өөр давхар", "Нэг харилцагч өөр давхарт бас зогсоол эзэмшдэг бол ижил утастай ӨӨР мөр нэмнэ."],
      ].forEach((utga) => {
        const mur = zaavar.addRow(utga);
        mur.getCell(2).alignment = { wrapText: true, vertical: "top" };
        mur.commit();
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="khariltsagch_import_template_${Date.now()}.xlsx"`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /khariltsagchExcelImport
 * Excel-ээс харилцагч + зогсоол/агуулахын гэрээ + машины дугаарыг бүртгэнэ.
 */
exports.importKhariltsagchFromExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId } = req.body;

    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон");
    if (!req.file) throw new aldaa("Excel файл оруулах");

    const murnuud = murnuudUnshiya(req.file.buffer);

    if (murnuud.length === 0) throw new aldaa("Excel хоосон");

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );
    if (!baiguullaga) throw new aldaa("Байгууллага олдсонгүй");

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => k.baiguullagiinId === baiguullaga._id.toString(),
    );
    if (!tukhainBaaziinKholbolt) throw new aldaa("Холболт олдсонгүй");

    const undsenBarilgiinId =
      barilgiinId ||
      (baiguullaga.barilguud && baiguullaga.barilguud.length > 0
        ? String(baiguullaga.barilguud[0]._id)
        : null);
    if (!undsenBarilgiinId) throw new aldaa("Барилга олдсонгүй");

    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(undsenBarilgiinId),
    );
    if (!targetBarilga) throw new aldaa("Барилга олдсонгүй");

    const KhariltsagchModel = Khariltsagch(db.erunkhiiKholbolt);
    const GereeModel = Geree(tukhainBaaziinKholbolt);
    const { syncResidentContracts } = require("./orshinSuugch");
    const {
      gereeNeesNekhemjlekhUusgekh,
    } = require("./nekhemjlekhController");

    const duuregNer = targetBarilga.tokhirgoo?.duuregNer || "";
    const horooData = targetBarilga.tokhirgoo?.horoo || {};
    const sohNer = targetBarilga.tokhirgoo?.sohNer || "";

    const durslel = { success: [], failed: [], total: murnuud.length };

    for (const mur of murnuud) {
      const murniiDugaar = mur.__mur;

      try {
        const {
          ovog,
          ner,
          utas,
          mail,
          davkhar,
          tailbar,
          zogsoolnuud,
          aguulakhnuud,
          mashinuud,
          ekhniiUldegdel,
          khonogoorBodokhEsekh,
          bodokhKhonog,
          aldaanuud,
        } = murniiUtgaUnshiya(mur);

        if (aldaanuud.length > 0) {
          throw new Error(aldaanuud.join(", ") + " хоосон эсвэл буруу");
        }

        // ── Тоотуудыг бэлдэнэ ─────────────────────────────────────────────
        // Эхний үлдэгдэл/хоногийн тохиргоо нь зөвхөн ҮНДСЭН (эхний) тоот дээр
        // бичигдэнэ — гараар бүртгэх модалтай ижил. Бүх тоот дээр хуулбал
        // нэг харилцагчийн эхний үлдэгдэл хэд дахин давхарлана.
        const tootuud = [
          ...zogsoolnuud.map((toot) => ({ toot, turul: "Гараж" })),
          ...aguulakhnuud.map((toot) => ({ toot, turul: "Агуулах" })),
        ].map((t, idx) => ({
          toot: t.toot,
          turul: t.turul,
          source: "OWN_ORG",
          baiguullagiinId: baiguullaga._id.toString(),
          barilgiinId: undsenBarilgiinId,
          davkhar: davkhar || "",
          orts: "1",
          duureg: duuregNer,
          horoo: horooData,
          soh: sohNer,
          bairniiNer: targetBarilga.ner || "",
          ovog,
          ner,
          ekhniiUldegdel: idx === 0 ? ekhniiUldegdel : 0,
          tsahilgaaniiZaalt: 0,
          khonogoorBodokhEsekh: idx === 0 ? khonogoorBodokhEsekh : false,
          bodokhKhonog: idx === 0 ? bodokhKhonog : 0,
          createdAt: new Date(),
        }));

        // ── Ижил утастай харилцагч байвал нэмж бүртгэнэ ───────────────────
        // `utas` нь khariltsagch дээр unique тул шинээр үүсгэвэл 11000 алдаа
        // гарна. Тиймээс байгаа бичлэг дээрээ тоот/машиныг нэмнэ.
        //
        // ЧУХАЛ: утас хоосон үед хайлт хийж БОЛОХГҮЙ. `findOne({ utas: "" })`
        // нь утасгүй ӨӨР харилцагчийг олж, тоот/машиныг тэр хүн дээр нэмнэ;
        // `undefined` бол Mongoose талбарыг хаяж `findOne({})` болгож ДУРЫН
        // харилцагч буцаана. Хоёулаа өгөгдлийг хольж эвдэнэ.
        let khariltsagch = utas
          ? await KhariltsagchModel.findOne({ utas })
          : null;

        // ── Тоот давхардлын шалгалт ───────────────────────────────────────
        // `turul`-ыг нь тулгах нь ЗААВАЛ: зогсоолын "5" ба агуулахын "5" нь
        // өөр өөр обьект. Зөвхөн тоотоор тулгавал хууль ёсны импортыг
        // "аль хэдийн бүртгэлтэй" гэж хааж мэднэ.
        //
        // Дээрх `toots`-гүй хуучин бичлэгийг (толгойн `toot` л байгаа)
        // гээхгүйн тулд хоёр дахь салааг нэмэв — гэхдээ зөвхөн ТЭР
        // тохиолдолд, ингэснээр turul-ын шалгалт тойрогдохгүй.
        for (const tootEntry of tootuud) {
          const shalgalt = {
            $or: [
              {
                toots: {
                  $elemMatch: {
                    toot: tootEntry.toot,
                    barilgiinId: undsenBarilgiinId,
                    turul: tootEntry.turul,
                  },
                },
              },
              {
                barilgiinId: undsenBarilgiinId,
                toot: tootEntry.toot,
                toots: { $size: 0 },
              },
              {
                barilgiinId: undsenBarilgiinId,
                toot: tootEntry.toot,
                toots: { $exists: false },
              },
            ],
          };
          if (khariltsagch) shalgalt._id = { $ne: khariltsagch._id };

          const davkhardsan = await KhariltsagchModel.findOne(shalgalt);
          if (davkhardsan) {
            const ezniiNer =
              [davkhardsan.ovog, davkhardsan.ner].filter(Boolean).join(" ") ||
              davkhardsan.utas ||
              "";
            const davkhardsanToot = (davkhardsan.toots || []).find(
              (t) => t && t.toot === tootEntry.toot && t.turul === tootEntry.turul,
            );
            const bairlal = [
              davkhardsanToot?.davkhar || tootEntry.davkhar ? `${davkhardsanToot?.davkhar || tootEntry.davkhar} давхар` : "",
              davkhardsanToot?.orts || tootEntry.orts ? `${davkhardsanToot?.orts || tootEntry.orts}-р орц` : "",
            ].filter(Boolean).join(", ");
            throw new Error(
              `${tootEntry.turul === "Агуулах" ? "Агуулах" : "Гараж"} ${tootEntry.toot} дугаар${bairlal ? ` (${bairlal})` : ""}${ezniiNer ? ` «${ezniiNer}»-д` : " өөр харилцагчид"} идэвхтэй бүртгэлтэй байна. Сул дугаар сонгох эсвэл өмнөх эзэмшигчээс салгаад дахин оруулна уу.`,
            );
          }
        }

        // ── Харилцагчийг үүсгэх / шинэчлэх ────────────────────────────────
        // Зогсоол/агуулах шаардлагагүй болсон тул `tootuud` хоосон байж
        // болно — `tootuud[0].toot` нь тэр үед гацна.
        const undsenToot = tootuud[0] || null;

        if (!khariltsagch) {
          khariltsagch = new KhariltsagchModel({
            ovog,
            ner,
            // Хоосон мөр бичвэл sparse unique индекст ОРДОГ тул хоёр дахь
            // утасгүй харилцагч E11000 өгнө. Иймд утас байхгүй бол талбарыг
            // бүр тавихгүй — индекс тухайн бичлэгийг тооцохгүй.
            ...(utas ? { utas, nevtrekhNer: utas } : {}),
            mail,
            nuutsUg: "1234",
            baiguullagiinId: baiguullaga._id.toString(),
            baiguullagiinNer: baiguullaga.ner,
            barilgiinId: undsenBarilgiinId,
            duureg: duuregNer,
            soh: sohNer,
            bairniiNer: targetBarilga.ner || "",
            davkhar: davkhar || "",
            orts: "1",
            toot: undsenToot ? undsenToot.toot : "",
            tailbar,
            ekhniiUldegdel,
            khonogoorBodokhEsekh,
            bodokhKhonog,
            toots: [],
            // Excel-ээр оруулахад ашиглалтын зардал АВТОМАТААР холбогдохгүй —
            // хоосон массив = зардалгүй. Зардлыг дараа нь модалаас гараар холбоно.
            songosonZardluud: [],
          });
        } else {
          if (ovog) khariltsagch.ovog = ovog;
          if (ner) khariltsagch.ner = ner;
          if (mail) khariltsagch.mail = mail;
          if (tailbar) khariltsagch.tailbar = tailbar;
          if (!khariltsagch.baiguullagiinId) {
            khariltsagch.baiguullagiinId = baiguullaga._id.toString();
            khariltsagch.baiguullagiinNer = baiguullaga.ner;
          }
          if (!khariltsagch.barilgiinId) {
            khariltsagch.barilgiinId = undsenBarilgiinId;
          }
          if (!khariltsagch.toot && undsenToot)
            khariltsagch.toot = undsenToot.toot;
          if (!khariltsagch.davkhar && davkhar) khariltsagch.davkhar = davkhar;
          // Зардлаа гараар сонгоогүй харилцагчид импортоор зардал холбохгүй.
          // Аль хэдийн сонгосон бол (массив) тэр сонголт хэвээр үлдэнэ.
          if (!Array.isArray(khariltsagch.songosonZardluud)) {
            khariltsagch.songosonZardluud = [];
          }

          // Нэр солигдвол тоот тус бүрийн хуулбарыг нь нийцүүлнэ.
          if (Array.isArray(khariltsagch.toots)) {
            khariltsagch.toots.forEach((t) => {
              if (ovog) t.ovog = ovog;
              if (ner) t.ner = ner;
            });
          }
        }

        if (!Array.isArray(khariltsagch.toots)) khariltsagch.toots = [];

        for (const tootEntry of tootuud) {
          const baigaaIndex = khariltsagch.toots.findIndex(
            (t) =>
              String(t.toot || "").trim() === String(tootEntry.toot).trim() &&
              String(t.barilgiinId || "") === String(tootEntry.barilgiinId),
          );

          if (baigaaIndex >= 0) {
            // Байгаа тоотын эхний үлдэгдлийг Excel-ийн дүнгээр ДАРААГҮЙ бол
            // хоосон дүн нь хуучин үлдэгдлийг тэглэх байсан.
            const khuuchin = khariltsagch.toots[baigaaIndex];
            const shineToot = {
              ...(khuuchin.toObject ? khuuchin.toObject() : khuuchin),
              ...tootEntry,
              ekhniiUldegdel:
                tootEntry.ekhniiUldegdel || khuuchin.ekhniiUldegdel || 0,
              createdAt: khuuchin.createdAt || tootEntry.createdAt,
            };

            // `toots[i] = ...` гэж шууд онооход mongoose өөрчлөлтийг
            // тэмдэглэдэггүй тул хадгалалт чимээгүй алга болдог.
            if (typeof khariltsagch.toots.set === "function") {
              khariltsagch.toots.set(baigaaIndex, shineToot);
            } else {
              khariltsagch.toots[baigaaIndex] = shineToot;
              khariltsagch.markModified("toots");
            }
          } else {
            khariltsagch.toots.push(tootEntry);
          }
        }

        // ── Үндсэн барилга/байгууллага ────────────────────────────────────
        // Утсаар олдсон харилцагч өмнө нь ӨӨР барилга (эсвэл байгууллага)
        // дээр бүртгэгдсэн байж болно. Толгойн `barilgiinId` нь тэр хуучин
        // барилга руу заасаар үлдвэл гэрээ, нэхэмжлэх нь энэ барилгад үүсдэг
        // атлаа харилцагч өөр барилгын жагсаалтад харагддаг байв. Хуучин
        // барилгад нь тоот үлдээгүй бол толгойг энэ импортын барилга руу
        // шилжүүлнэ — тоот эзэмшиж буй барилга нь л үндсэн байх ёстой.
        if (tootuud.length > 0) {
          const khuuchinBarilga = String(khariltsagch.barilgiinId || "");
          const khuuchinBarilgadTootBii = khariltsagch.toots.some(
            (t) => khuuchinBarilga && String(t.barilgiinId || "") === khuuchinBarilga,
          );
          if (khuuchinBarilga !== String(undsenBarilgiinId) && !khuuchinBarilgadTootBii) {
            khariltsagch.baiguullagiinId = baiguullaga._id.toString();
            khariltsagch.baiguullagiinNer = baiguullaga.ner;
            khariltsagch.barilgiinId = undsenBarilgiinId;
            khariltsagch.bairniiNer = targetBarilga.ner || "";
            khariltsagch.duureg = duuregNer;
            khariltsagch.soh = sohNer;
            if (undsenToot) {
              khariltsagch.toot = undsenToot.toot;
              khariltsagch.davkhar = davkhar || "";
            }
          }
        }

        await khariltsagch.save();

        // ── Гэрээ (гараар бүртгэхтэй ижил логик) ──────────────────────────
        // `syncResidentContracts` нь URL дотор "khariltsagch" байгаа эсэхээр
        // харилцагч эсэхийг мэддэг — зогсоолыг үндсэн тоот болгож гэрээ
        // үүсгэх, `khariltsagchId` бичих нь тэр шалгалтаас хамаарна.
        const syncReq = {
          originalUrl: "/khariltsagchExcelImport",
          url: "/khariltsagchExcelImport",
          ajiltan: req.ajiltan,
          body: {
            baiguullagiinId: baiguullaga._id.toString(),
            barilgiinId: undsenBarilgiinId,
            ovog,
            ner,
            mail,
            tailbar,
            turul: "Үндсэн",
            ekhniiUldegdel,
            khonogoorBodokhEsekh,
            bodokhKhonog,
          },
        };

        await syncResidentContracts(
          khariltsagch,
          baiguullaga,
          tukhainBaaziinKholbolt,
          syncReq,
        );

        // ── Машины дугаар ────────────────────────────────────────────────
        let mashiniiKhariu = null;
        if (mashinuud.length > 0) {
          mashiniiKhariu = await mashinuudBurtgeye({
            erunkhiiKholbolt: db.erunkhiiKholbolt,
            tukhainBaaziinKholbolt,
            baiguullaga,
            ezemshigch: khariltsagch,
            dugaaruud: mashinuud,
            barilgiinId: undsenBarilgiinId,
            toot: undsenToot ? undsenToot.toot : "",
            utas,
            zochinTurul: "Харилцагч",
            ezemshigchiinTurul: "Khariltsagch",
          });
        }

        // ── Нэхэмжлэх ─────────────────────────────────────────────────────
        // Импортоор ашиглалтын зардлын нэхэмжлэх (гүйлгээний түүх) ҮҮСГЭХГҮЙ.
        // Зардлыг модалаас гараар холбож авлага үүсгэсэн үед л түүхэнд орно.
        // Зөвхөн Excel-д эхний үлдэгдэл оруулсан бол түүнийг бүртгэхийн тулд
        // нэхэмжлэх үүсгэнэ. "automataar" нь мөчлөгт давхардахаас хамгаална.
        const idevkhteiGereenuud = ekhniiUldegdel
          ? await GereeModel.find({
              orshinSuugchId: khariltsagch._id.toString(),
              barilgiinId: String(undsenBarilgiinId),
              tuluv: "Идэвхтэй",
            })
          : [];

        for (const geree of idevkhteiGereenuud) {
          try {
            await gereeNeesNekhemjlekhUusgekh(
              geree,
              baiguullaga,
              tukhainBaaziinKholbolt,
              "automataar",
              true,
            );
          } catch (nekhemjlekhAldaa) {
            console.error(
              `Харилцагчийн нэхэмжлэх үүсгэхэд алдаа (мөр ${murniiDugaar}):`,
              nekhemjlekhAldaa.message,
            );
          }
        }

        durslel.success.push({
          row: murniiDugaar,
          utas,
          ner,
          tootuud: tootuud.map((t) => t.toot),
          mashinuud: mashiniiKhariu
            ? [...mashiniiKhariu.shine, ...mashiniiKhariu.shinechilsen]
            : [],
          // Машины хязгаараар хасагдсан / бүртгэгдээгүй дугаарууд.
          // Өмнө нь `aldaa` хаягддаг тул хязгаар чимээгүй ажиллаж,
          // хэрэглэгч машин орсон гэж боддог байв.
          mashiniiAldaa: mashiniiKhariu?.aldaa?.length
            ? mashiniiKhariu.aldaa
            : undefined,
          message: mashiniiKhariu?.aldaa?.length
            ? `Бүртгэгдлээ — ${mashiniiKhariu.aldaa.join("; ")}`
            : "Амжилттай бүртгэгдлээ",
        });
      } catch (error) {
        durslel.failed.push({
          row: murniiDugaar,
          utas: nudUnshiya(mur, "Утас") || "Тодорхойгүй",
          ner: nudUnshiya(mur, "Нэр") || "Тодорхойгүй",
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `${durslel.success.length} харилцагчийн бүртгэл амжилттай орлоо, ${durslel.failed.length} мөр алдаатай байна`,
      result: durslel,
    });
  } catch (error) {
    next(error);
  }
});

// Туршилт/дахин хэрэглээнд зориулсан дотоод хэрэгслүүд.
exports.murnuudUnshiya = murnuudUnshiya;
exports.murniiUtgaUnshiya = murniiUtgaUnshiya;
