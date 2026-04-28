const express = require("express");
const router = express.Router();
const nekhemjlekhiinZagvar = require("../models/nekhemjlekhiinZagvar");
const { crud, UstsanBarimt, tokenShalgakh } = require("zevbackv2");
const fs = require("fs");
const ExcelJS = require("exceljs");
const { toWords } = require("mon_num");
const XLSX = require("xlsx");

crud(router, "nekhemjlekhiinZagvar", nekhemjlekhiinZagvar, UstsanBarimt);

const multer = require("multer");
const aldaa = require("../components/aldaa");
const storage = multer.memoryStorage();
const uploadFile = multer({ storage: storage });
router
  .route("/excelZagvarOruulya")
  .post(uploadFile.single("file"), tokenShalgakh, async (req, res, next) => {
    try {
      const turul = req.body.turul;
      const baiguullagiinId = req.body.baiguullagiinId;
      const barilgiinId = req.body.barilgiinId;
      if (!req.file) {
        throw new aldaa("Excel файл дахин оруулна уу.");
      }
      const excelFile = req.file;
      const savePath = `./excel/${turul}/${baiguullagiinId}/${barilgiinId}/`;
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }
      const garaasNershil = req.body.excelNer;
      const excelFileName = `${turul}${barilgiinId}_${garaasNershil}.xlsx`;
      fs.writeFile(`${savePath}${excelFileName}`, excelFile.buffer, (err) => {
        if (err) {
          throw new aldaa(err);
        }
        res.send("Amjilttai");
      });
    } catch (err) {
      next(err);
    }
  });

const undsenTalbaruud = [
  { ner: "Овог", talbar: "<ovog>" },
  { ner: "Нэр", talbar: "<ner>" },
  { ner: "Гэрээний огноо", talbar: "<gereeniiOgnoo>" },
  { ner: "Төрөл", talbar: "<turul>" },
  { ner: "Регистр", talbar: "<register>" },
  { ner: "Албан тушаал", talbar: "<albanTushaal>" },
  { ner: "Захиралын овог", talbar: "<zakhirliinOvog>" },
  { ner: "Захиралын нэр", talbar: "<zakhirliinNer>" },
  { ner: "Утас", talbar: "<utas>" },
  { ner: "Хаяг", talbar: "<khayag>" },
  { ner: "Гэрээний дугаар", talbar: "<gereeniiDugaar>" },
  { ner: "Гарын үсэг", talbar: "<gariinUseg>" },
  { ner: "Тамга", talbar: "<tamga>" },
];

const khugatsaaniiTalbaruud = [
  { ner: "Хугацаа", talbar: "<khugatsaa>" },
  { ner: "Эхлэх он", talbar: "<ekhlekhOn>" },
  { ner: "Эхлэх сар", talbar: "<ekhelkhSar>" },
  { ner: "Эхлэх өдөр", talbar: "<ekhlekhUdur>" },
  { ner: "Дуусах он", talbar: "<duusakhOn>" },
  { ner: "Дуусах сар", talbar: "duusakhSar" },
  { ner: "Дуусах өдөр", talbar: "<duusakhUdur>" },
];

const talbainiiTalbaruud = [
  { ner: "Талбайн дугаар", talbar: "<talbainDugaar>" },
  { ner: "Талбайн нэгж үнэ", talbar: "<talbainNegjUne>" },
  { ner: "Талбайн нэгж үнэ үсгээр", talbar: "<talbainNegjUneUsgeer>" },
  { ner: "Талбайн нийт үнэ", talbar: "<talbainNiitUne>" },
  { ner: "Талбайн нийт үнэ/Нөатгүй/", talbar: "<talbainNiitUneNuatgui>" },
  { ner: "Талбайн нийт үнэ/Нөат/", talbar: "<talbainNiitUneNuat>" },
  { ner: "Талбайн нийт үнэ үсгээр", talbar: "<talbainNiitUneUsgeer>" },
  { ner: "Талбайн хэмжээ", talbar: "<talbainKhemjee>" },
  { ner: "Түрээсийн талбайн давхар", talbar: "<davkhar>" },
  { ner: "Зардлын дүн", talbar: "<zardliinDun>" },
  { ner: "Зориулалт", talbar: "<zoriulalt>" },
];

const baritsaaniiTalbaruud = [
  { ner: "Барьцаа авах дүн", talbar: "<baritsaaAvakhDun>" },
  {
    ner: "Барьцаа байршуулах хугацаа",
    talbar: "baritsaaBairshuulakhKhugatsaa",
  },
];

const tulburiinTalbaruud = [
  { ner: "Хөнгөлөх хугацаа", talbar: "<khungulukhKhugatsaa>" },
  { ner: "Сарын түрээс", talbar: "<sariinTurees>" },
  { ner: "Мөнгөн дүн үсгээр", talbar: "<mungunDunUsgeer>" },
  { ner: "Энэ сард төлөх дүн", talbar: "<eneSardTulukhDun>" },
  { ner: "Нийт үлдэгдэл", talbar: "<niitUldegdel>" },
  { ner: "Нийт үлдэгдэл/Нөатгүй/", talbar: "<niitUldegdelNuatgui>" },
  { ner: "Нийт үлдэгдэл/Нөат/", talbar: "<niitUldegdelNuat>" },
  { ner: "Алдангын үлдэгдэл", talbar: "<aldangiinUldegdel>" },
  { ner: "Түрээсийн хөнгөлөлт", talbar: "<khungulult>" },
];
const nekhemjlekhiinTalbaruud = [
  { ner: "Нэхэмжлэхийн сар", talbar: "<sar>" },
  { ner: "Данс", talbar: "<dans>" },
  { ner: "Дансны нэр", talbar: "<dansniiNer>" },
  { ner: "Банк", talbar: "<bank>" },
  { ner: "Хэвлэсэн огноо", talbar: "<khevlesenOgnoo>" },
  { ner: "Нэхэмжлэхийн дугаар", talbar: "<nekhemjlekhiinDugaar>" },
  { ner: "Өмнөх хуримтлагдсан өр төлбөр", talbar: "<umnukhSariinUrTulbur>" },
  { ner: "Энэ сард төлөх үсгээр", talbar: "<eneSardTulukhUsgeer>" },
  { ner: "Нийт үлдэгдэл үсгээр", talbar: "<niitUldegdelUsgeer>" },
];

const nekhemjlekhiinNemelt = [
  { ner: "Дугаар", talbar: "<№>" },
  { ner: "Тайлбар", talbar: "<nemeltNekhemjlekh.tailbar>" },
  { ner: "Төлөх дүн", talbar: "<nemeltNekhemjlekh.tulukhDun>" },
  { ner: "Огноо", talbar: "<nemeltNekhemjlekh.ognoo>" },
  { ner: "Бусад авлагын мөр", talbar: "<nemeltNekhemjlekh>" },
];

router.route("/excelZagvarUstgaya").post(tokenShalgakh, (req, res, next) => {
  try {
    const turul = req.body.turul;
    const baiguullagiinId = req.body.baiguullagiinId;
    const barilgiinId = req.body.barilgiinId;
    const excelNer = req.body.excelNer;
    const filePath = `./excel/${turul}/${baiguullagiinId}/${barilgiinId}/${turul}${barilgiinId}_${excelNer}.xlsx`;
    fs.unlink(filePath, (err) => {
      if (err) {
        next(err);
      } else {
        res.send("Amjilttai");
      }
    });
  } catch (err) {
    next(err);
  }
});

function textSolyo(text, body) {
  var butsaakh = "";
  
  // Extract the variable name from <variable>
  const variableMatch = text.match(/^<(.+?)>$/);
  if (!variableMatch) {
    return butsaakh;
  }
  
  const variableName = variableMatch[1];
  
  // Check direct body properties (supports all user data, contract sections like "1.1", "1.2", etc.)
  if (body[variableName] !== undefined && body[variableName] !== null) {
    const value = body[variableName];
    // Handle arrays (like utas)
    if (Array.isArray(value)) {
      butsaakh = value.join(", ");
    } else if (value instanceof Date) {
      butsaakh = value.toISOString().split('T')[0];
    } else {
      butsaakh = String(value);
    }
    if (butsaakh !== "") return butsaakh;
  }
  
  // Check nested properties (e.g., "horoo.ner", "geree.ovog")
  const parts = variableName.split('.');
  if (parts.length > 1) {
    let nestedValue = body;
    for (const part of parts) {
      if (nestedValue && nestedValue[part] !== undefined) {
        nestedValue = nestedValue[part];
      } else {
        nestedValue = null;
        break;
      }
    }
    if (nestedValue !== null && nestedValue !== undefined) {
      if (Array.isArray(nestedValue)) {
        butsaakh = nestedValue.join(", ");
      } else if (nestedValue instanceof Date) {
        butsaakh = nestedValue.toISOString().split('T')[0];
      } else if (typeof nestedValue === 'object') {
        butsaakh = JSON.stringify(nestedValue);
      } else {
        butsaakh = String(nestedValue);
      }
      if (butsaakh !== "") return butsaakh;
    }
  }
  
  // Special number-to-words conversions
  if (
    text === "<eneSardTulukhUsgeer>" ||
    text === "<niitUldegdelUsgeer>" ||
    text === "<talbainNiitUneUsgeer>" ||
    text === "<mungunDunUsgeer>"
  ) {
    const shineKey = text
      .replace("Usgeer", "")
      .replace("<", "")
      .replace(">", "");
    if (body[shineKey] !== undefined) {
      butsaakh = numberToWords(
        Math.abs(body[shineKey]),
        { fixed: 2, suffix: "n" },
        "төгрөг",
        "мөнгө"
      );
      return butsaakh;
    }
  }
  
  // VAT calculations
  if (text === "<talbainNiitUneNuat>" || text === "<niitUldegdelNuat>") {
    const shineKey = text.replace("Nuat", "").replace("<", "").replace(">", "");
    if (body[shineKey] !== undefined) {
      butsaakh = ((Number(body[shineKey]) / 1.1) * 0.1).toFixed(2);
      return butsaakh;
    }
  }
  
  if (text === "<talbainNiitUneNuatgui>" || text === "<niitUldegdelNuatgui>") {
    const shineKey = text
      .replace("Nuatgui", "")
      .replace("<", "")
      .replace(">", "");
    if (body[shineKey] !== undefined) {
      const khasakh = (Number(body[shineKey]) / 1.1) * 0.1;
      butsaakh = (body[shineKey] - khasakh).toFixed(2);
      return butsaakh;
    }
  }
  
  // Zardluud (expenses) related variables
  if (body.zardluud && body.zardluud.length > 0) {
    const niitZardliinDun = body.zardluud.reduce((a, b) => a + (b.tulukhDun || 0), 0);
    if (text === "<niitZardliinDun>") {
      butsaakh = niitZardliinDun;
      return butsaakh;
    }
    if (text === "<niitZardliinNuatguiDun>") {
      butsaakh = (niitZardliinDun - (niitZardliinDun / 1.1) * 0.1).toFixed(2);
      return butsaakh;
    }
    if (text === "<niitZardliinNuatiinDun>") {
      butsaakh = ((niitZardliinDun / 1.1) * 0.1).toFixed(2);
      return butsaakh;
    }
    
    body.zardluud.forEach((a) => {
      if (text === `<${a.tailbar}.khemjikhNegj>`) {
        butsaakh = a.khemjikhNegj;
      }
      if (text === `<${a.tailbar}.tulukhDun>`) {
        butsaakh = a.tulukhDun;
      }
      if (text === `<${a.tailbar}.tariff>`) {
        butsaakh = a.tariff;
      }
      if (text === `<${a.tailbar}.negj>`) {
        butsaakh = a.negj;
      }
      if (text === `<${a.tailbar}.suuliinZaalt>`) {
        butsaakh = a.suuliinZaalt;
      }
      if (text === `<${a.tailbar}.umnukhZaalt>`) {
        butsaakh = a.umnukhZaalt;
      }
      if (text === `<${a.tailbar}.khungulult>`) {
        butsaakh = a.khungulult;
      }
    });
  }
  
  return butsaakh;
}

function numberToWords(number, option, bukhel, butarhai) {
  const { fixed, suffix } = option;
  let resValue = "";
  const value = number?.toFixed(fixed)?.toString();
  if (value?.includes(".")) {
    resValue = toWords(Number(value.split(".")[0]), { suffix });
    if (!!bukhel) resValue += ` ${bukhel}`;
    if (Number(value.split(".")[1]) > 0) {
      resValue += ` ${toWords(Number(value.split(".")[1]), { suffix })}`;
      if (!!butarhai) resValue += ` ${butarhai}`;
    }
  }
  return resValue;
}

router
  .route("/excelZagvarTatya")
  .post(tokenShalgakh, async (req, res, next) => {
    const baiguullagiinId = req.body.baiguullagiinId;
    const tulugchid = req.body.nekhemjlekhiinJagsaalt;
    const barilgiinId = req.body.barilgiinId;
    const turul = "nekhemjlel";
    const ashiglaltiinZardluud = req.body.ashiglaltiinZardluud;
    const garaasNershil = req.body.excelNer;
    const savePath = `./excel/${turul}/${baiguullagiinId}/${barilgiinId}/${turul}${barilgiinId}_${garaasNershil}.xlsx`;
    var butsaakhArray = [];
    try {
      for (const tulugch of tulugchid) {
        const workbook = new ExcelJS.Workbook();
        try {
          await workbook.xlsx.readFile(savePath);
          const worksheet = workbook.getWorksheet("Sheet1");
          const solikhTextArray = await undsenTalbaruud.concat(
            khugatsaaniiTalbaruud,
            talbainiiTalbaruud,
            baritsaaniiTalbaruud,
            tulburiinTalbaruud,
            nekhemjlekhiinTalbaruud,
            nekhemjlekhiinNemelt
          );
          if (!!ashiglaltiinZardluud && ashiglaltiinZardluud.length > 0) {
            var oruulakhTalbar = [];
            ashiglaltiinZardluud.map((a) => {
              oruulakhTalbar.push({
                ner: `${a.ner}.Дүн`,
                talbar: `<${a.ner}.tulukhDun>`,
              });
              oruulakhTalbar.push({
                ner: `${a.ner}.Хэмжих нэгж`,
                talbar: `<${a.ner}.khemjikhNegj>`,
              });
              oruulakhTalbar.push({
                ner: `${a.ner}.Тариф`,
                talbar: `<${a.ner}.tariff>`,
              });
              oruulakhTalbar.push({
                ner: `${a.ner}.Нэгж`,
                talbar: `<${a.ner}.negj>`,
              });
              if (a.turul == "кВт" || a.turul == "1м3" || a.turul == "кг") {
                oruulakhTalbar.push({
                  ner: `${a.ner}.Өмнөх заалт`,
                  talbar: `<${a.ner}.umnukhZaalt>`,
                });
                oruulakhTalbar.push({
                  ner: `${a.ner}.Сүүлийн заалт`,
                  talbar: `<${a.ner}.suuliinZaalt>`,
                });
              } else {
                oruulakhTalbar.push({
                  ner: `${a.ner}.Хөнгөлөлт`,
                  talbar: `<${a.ner}.khungulult>`,
                });
              }
            });
            oruulakhTalbar.push({
              ner: `Нийт ашиглалтын зардал`,
              talbar: `<niitZardliinDun>`,
            });

            oruulakhTalbar.push({
              ner: `Нийт ашиглалтын зардал/Нөатгүй/`,
              talbar: `<niitZardliinNuatguiDun>`,
            });

            oruulakhTalbar.push({
              ner: `Нөат (10%)`,
              talbar: `<niitZardliinNuatiinDun>`,
            });
            solikhTextArray.concat(oruulakhTalbar);
          }
          await worksheet.eachRow(async (row, rowNumber) => {
            await row.eachCell(
              { includeEmpty: true },
              async (cell, colNumber) => {
                await solikhTextArray.forEach(async (solikhText) => {
                  // textSolyo checks body for any variable - user data, contract sections (1.1, 1.2), etc.
                  const shineText = await textSolyo(solikhText.talbar, tulugch);
                  if (
                    typeof cell.value === "string" &&
                    cell.value.includes(solikhText.talbar)
                  ) {
                    cell.value = cell.value.replace(
                      solikhText.talbar,
                      shineText
                    );
                  }
                });
              }
            );
          });
          const htmlContent = exceleesHtmlAvya(worksheet);
          butsaakhArray.push(htmlContent);
        } catch (error) {
          next(error);
        }
      }
      res.setHeader("Content-Type", "text/plain");
      res.send(butsaakhArray);
    } catch (err) {
      next(err);
    }
  });

function exceleesHtmlAvya(worksheet) {
  let htmlContent = '<table border="1">';

  worksheet.eachRow((row, rowNumber) => {
    htmlContent += "<tr>";
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      htmlContent += `<td>${cell.text}</td>`;
    });
    htmlContent += "</tr>";
  });

  htmlContent += "</table>";
  return htmlContent;
}

router
  .route("/excelZagvarKharya")
  .post(tokenShalgakh, async (req, res, next) => {
    const baiguullagiinId = req.body.baiguullagiinId;
    const barilgiinId = req.body.barilgiinId;
    const turul = "nekhemjlel";
    const fileNer = req.body.excelNer;
    const zam = `./excel/${turul}/${baiguullagiinId}/${barilgiinId}/${turul}${barilgiinId}_${fileNer}.xlsx`;
    try {
      const workbook = XLSX.readFile(zam);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const htmlContent = XLSX.utils.sheet_to_html(sheet);
      res.send(htmlContent);
    } catch (err) {
      next(err);
    }
  });

module.exports = router;
