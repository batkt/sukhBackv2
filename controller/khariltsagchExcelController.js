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
  "Хоногоор бодох",
  "Ирээдүйд ашиглах хоног",
  "Тайлбар",
];

/** Excel-ийн баганын өргөн (TOLGOINUUD-ийн дараалалтай нийцнэ). */
const BAGANANII_URGUN = [15, 18, 12, 24, 10, 18, 18, 22, 16, 14, 20, 24];

/** Заавал бөглөх багануудын Excel дугаар (1-ээс). */
const ZAAVAL_BAGANA = [2, 3, 6];

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

      if (baiguullagiinId) {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          baiguullagiinId,
        );
        const barilga = barilgiinId
          ? baiguullaga?.barilguud?.find(
              (b) => String(b._id) === String(barilgiinId),
            )
          : baiguullaga?.barilguud?.[0];
        if (barilga) davkharList = davkhruudOlya(barilga);
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

      // Хоногоор бодох (J багана)
      worksheet.dataValidations.add("J2:J2000", {
        type: "list",
        allowBlank: true,
        formulae: ['"Тийм,Үгүй"'],
        showErrorMessage: true,
        errorStyle: "error",
        error: "Жагсаалтаас сонгоно уу!",
      });

      // Зааврыг тусдаа хуудсанд — өгөгдлийн хуудас цэвэр байх.
      const zaavar = workbook.addWorksheet("Заавар");
      zaavar.columns = [{ width: 26 }, { width: 86 }];
      const zaavriinMur = zaavar.getRow(1);
      zaavriinMur.values = ["Багана", "Тайлбар"];
      zaavriinMur.eachCell((nud) => tolgoiNud(nud));
      zaavriinMur.commit();

      [
        ["Нэр", "Заавал. Овог тусдаа баганад байхгүй бол \"Б.Батбаяр\" гэж бичиж болно."],
        ["Утас", "Заавал. 8 оронтой тоо. Ижил утастай харилцагч аль хэдийн бүртгэлтэй бол шинээр үүсгэхгүй, тоот/машиныг нь нэмж бүртгэнэ."],
        ["Давхар", "Зогсоол/агуулах байрлах давхар (B1, B2 ...). Хоосон байж болно."],
        ["Зогсоолын дугаар", "Зогсоол эсвэл агуулахын аль нэг заавал. Нэг харилцагчид олон зогсоол байвал таслалаар: 12,13,14"],
        ["Агуулахын дугаар", "Таслалаар олныг бичиж болно: 5,6"],
        ["Машины дугаар", "Таслалаар олныг бичиж болно: 1234УБА, 5678УНА. Зогсоолын гэрээтэй хамт машин нь бүртгэгдэнэ."],
        ["Эхний үлдэгдэл", "Гэрээний эхний үлдэгдэл. Хоосон бол 0."],
        ["Хоногоор бодох", "Тийм/Үгүй. Тийм бол дараагийн баганад хоногийн тоо бичнэ."],
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

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const buhMur = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: 1,
    });

    // 1-р мөр = гарчиг. Загварт 2-р мөр хоосон байж болох тул ҮНЭХЭЭР хоосон
    // байвал л алгасна — хэрэглэгч тэнд эхний бүртгэлээ бичсэн байж мэднэ.
    const tolgoiMur = buhMur[0] || [];
    const khoosonMur = (m) =>
      !m || !m.some((n) => n !== undefined && n !== null && n !== "");
    const murnuud = buhMur
      .slice(khoosonMur(buhMur[1]) ? 2 : 1)
      .map((m, i) => ({ m, excelMur: (khoosonMur(buhMur[1]) ? 3 : 2) + i }))
      .filter(({ m }) => !khoosonMur(m))
      .map(({ m, excelMur }) => {
        const obj = { __mur: excelMur };
        tolgoiMur.forEach((tolgoi, idx) => {
          if (tolgoi) obj[tolgoi] = m[idx] !== undefined ? m[idx] : "";
        });
        return obj;
      });

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
        const { ovog, ner } = ovogNerSalgaya(
          nudUnshiya(mur, "Овог"),
          nudUnshiya(mur, "Нэр"),
        );

        const utas = nudUnshiya(mur, "Утас", "Утасны дугаар").replace(/\s/g, "");
        const mail = nudUnshiya(mur, "Имэйл", "Мэйл");
        const davkhar = nudUnshiya(mur, "Давхар");
        const tailbar = nudUnshiya(mur, "Тайлбар");

        const zogsoolnuud = tootuudSalgaya(
          nudUnshiya(mur, "Зогсоолын дугаар", "Зогсоол", "Гаражийн дугаар", "Гараж"),
        );
        const aguulakhnuud = tootuudSalgaya(
          nudUnshiya(mur, "Агуулахын дугаар", "Агуулах"),
        );
        const mashinuud = dugaaruudSalgaya(
          nudUnshiya(mur, "Машины дугаар", "Машин", "Улсын дугаар", "Автомашин"),
        );

        const ekhniiUldegdel =
          parseFloat(
            nudUnshiya(mur, "Эхний үлдэгдэл").replace(/[,\s₮]/g, ""),
          ) || 0;
        const khonogoorBodokhEsekh = tiimEsekh(nudUnshiya(mur, "Хоногоор бодох"));
        const bodokhKhonog =
          parseInt(
            nudUnshiya(mur, "Ирээдүйд ашиглах хоног", "Ашиглах хоног"),
            10,
          ) || 0;

        // ── Шалгалт ───────────────────────────────────────────────────────
        const aldaanuud = [];
        if (!ner) aldaanuud.push("Нэр");
        if (!utas) aldaanuud.push("Утас");
        else if (!/^\d+$/.test(utas)) aldaanuud.push("Утас буруу");
        else if (utas.length !== 8) aldaanuud.push("Утас 8 орон");
        if (zogsoolnuud.length === 0 && aguulakhnuud.length === 0) {
          aldaanuud.push("Зогсоол эсвэл агуулахын дугаар");
        }
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
        let khariltsagch = await KhariltsagchModel.findOne({ utas });

        // ── Тоот давхардлын шалгалт ───────────────────────────────────────
        for (const tootEntry of tootuud) {
          const elemMatch = {
            toot: tootEntry.toot,
            barilgiinId: undsenBarilgiinId,
          };
          const shalgalt = {
            $or: [
              { barilgiinId: undsenBarilgiinId, toot: tootEntry.toot },
              { toots: { $elemMatch: elemMatch } },
            ],
          };
          if (khariltsagch) shalgalt._id = { $ne: khariltsagch._id };

          const davkhardsan = await KhariltsagchModel.findOne(shalgalt);
          if (davkhardsan) {
            const ezniiNer =
              [davkhardsan.ovog, davkhardsan.ner].filter(Boolean).join(" ") ||
              davkhardsan.utas ||
              "";
            throw new Error(
              `"${tootEntry.toot}" ${tootEntry.turul === "Агуулах" ? "агуулах" : "зогсоол"} дээр${ezniiNer ? ` "${ezniiNer}"` : ""} харилцагч аль хэдийн бүртгэгдсэн байна.`,
            );
          }
        }

        // ── Харилцагчийг үүсгэх / шинэчлэх ────────────────────────────────
        const undsenToot = tootuud[0];

        if (!khariltsagch) {
          khariltsagch = new KhariltsagchModel({
            ovog,
            ner,
            utas,
            mail,
            nuutsUg: "1234",
            nevtrekhNer: utas,
            baiguullagiinId: baiguullaga._id.toString(),
            baiguullagiinNer: baiguullaga.ner,
            barilgiinId: undsenBarilgiinId,
            duureg: duuregNer,
            soh: sohNer,
            bairniiNer: targetBarilga.ner || "",
            davkhar: davkhar || "",
            orts: "1",
            toot: undsenToot.toot,
            turul: "Үндсэн",
            tailbar,
            ekhniiUldegdel,
            khonogoorBodokhEsekh,
            bodokhKhonog,
            toots: [],
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
          if (!khariltsagch.toot) khariltsagch.toot = undsenToot.toot;
          if (!khariltsagch.davkhar && davkhar) khariltsagch.davkhar = davkhar;

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
            khariltsagch.toots[baigaaIndex] = {
              ...(khuuchin.toObject ? khuuchin.toObject() : khuuchin),
              ...tootEntry,
              ekhniiUldegdel:
                tootEntry.ekhniiUldegdel || khuuchin.ekhniiUldegdel || 0,
              createdAt: khuuchin.createdAt || tootEntry.createdAt,
            };
          } else {
            khariltsagch.toots.push(tootEntry);
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
            toot: undsenToot.toot,
            utas,
            zochinTurul: "Оршин суугч",
          });
        }

        // ── Нэхэмжлэх ─────────────────────────────────────────────────────
        // `syncResidentContracts` харилцагчид нэхэмжлэх үүсгэдэггүй тул
        // гараар бүртгэх урсгалтай ижлээр энд үүсгэнэ. "automataar" нь
        // тухайн тооцооны мөчлөгт давхар нэхэмжлэх үүсэхийг хаана.
        const idevkhteiGereenuud = await GereeModel.find({
          orshinSuugchId: khariltsagch._id.toString(),
          barilgiinId: String(undsenBarilgiinId),
          tuluv: "Идэвхтэй",
        });

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
          message: "Амжилттай бүртгэгдлээ",
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
