const asyncHandler = require("express-async-handler");
const GereeniiZaalt = require("../models/gereeniiZaalt");
const GereeniiZagvar = require("../models/gereeniiZagvar");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
// const Talbai = require("../models/talbai");
// const Mashin = require("../models/mashin");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const AshiglaltiinExcel = require("../models/ashiglaltiinExcel");
// const EkhniiUldegdelExcel = require("../models/ekhniiUldegdelExcel");
// const { Dans, Segment } = require("zevbackv2");
const aldaa = require("../components/aldaa");
const xlsx = require("xlsx");
// const moment = require("moment");
const lodash = require("lodash");
const excel = require("exceljs");
// const mongoose = require("mongoose");
// const {
//   Parking,
//   Mashin,
//   BlockMashin,
//   Uilchluulegch,
//   ZogsooliinTulbur,
//   uilchluulegchdiinToo,
//   sdkData,
// } = require("parking-v1");

function formatNumber(num, fixed = 2) {
  if (num === undefined || num === null || num === "")
    return formatNumber("0.00", fixed);
  var fixedNum = parseFloat(num).toFixed(fixed).toString();
  var numSplit = fixedNum.split(".");
  if (numSplit === null || numSplit.length === 0) {
    return formatNumber("0.00", fixed);
  }
  var firstFormatNum = numSplit[0]
    .toString()
    .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
  if (lodash.isNaN(firstFormatNum)) firstFormatNum = "0";
  if (fixed === 0) return firstFormatNum;
  return firstFormatNum + "." + numSplit[1];
}

function usegTooruuKhurvuulekh(useg) {
  if (!!useg) return useg.charCodeAt() - 65;
  else return 0;
}

function toogUsegruuKhurvuulekh(too) {
  if (!!too) {
    if (too < 26) return String.fromCharCode(too + 65);
    else {
      var orongiinToo = Math.floor(too / 26);
      var uldegdel = too % 26;
      return (
        String.fromCharCode(orongiinToo + 64) +
        String.fromCharCode(uldegdel + 65)
      );
    }
  } else return 0;
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

async function gereeBaivalBugluy(
  mashiniiJagsaalt,
  baiguullagiinId,
  tukhainBaaziinKholbolt
) {
  var match = {
    utas: { $in: utasnuud },
    baiguullagiinId: baiguullagiinId,
  };

  var utasnuud = [];
  mashiniiJagsaalt.forEach((a) => {
    utasnuud.push(a.ezemshigchiinUtas);
  });
  var gereeniiJagsaalt = await Geree(tukhainBaaziinKholbolt).find(match);
  if (gereeniiJagsaalt.length !== 0) {
    var tukhainMashin;
    gereeniiJagsaalt.forEach((x) => {
      tukhainMashin = mashiniiJagsaalt.find((a) =>
        x.utas.includes(a.ezemshigchiinUtas)
      );
      if (tukhainMashin) {
        tukhainMashin.ezemshigchiinRegister = x.register;
        tukhainMashin.ezemshigchiinTalbainDugaar = x.talbainDugaar;
        tukhainMashin.ezemshigchiinNer = x.ner;
        tukhainMashin.gereeniiDugaar = x.gereeniiDugaar;
      }
    });
  }
  return mashiniiJagsaalt;
}

async function gereeBaigaaEskhiigShalgaya(
  gereenuud,
  aldaaniiMsg,
  baiguullagiinId,
  tukhainBaaziinKholbolt
) {
  var jagsaalt = [];
  var shineAldaaniiMsg = "";
  gereenuud.forEach((a) => {
    jagsaalt.push(a.gereeniiDugaar);
  });
  var gereeniiJagsaalt = await Geree(tukhainBaaziinKholbolt).find({
    gereeniiDugaar: { $in: jagsaalt },
    baiguullagiinId: baiguullagiinId,
  });
  if (gereeniiJagsaalt.length !== 0) {
    gereeniiDugaaruud = [];
    gereeniiJagsaalt.forEach((x) => {
      gereeniiDugaaruud.push(x.gereeniiDugaar);
    });
    shineAldaaniiMsg =
      aldaaniiMsg +
      "Гэрээний дугаар давхардаж байна! : " +
      gereeniiDugaaruud +
      "<br/>";
  }
  if (shineAldaaniiMsg) aldaaniiMsg = shineAldaaniiMsg;
  return aldaaniiMsg;
}

exports.gereeniiZaaltTatya = asyncHandler(async (req, res, next) => {
  try {
    const workbook = xlsx.read(req.file.buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jagsaalt = [];
    var tolgoinObject = {};
    for (let cell in worksheet) {
      var cellAsString = cell.toString();
      if (
        cellAsString[1] === "1" &&
        cellAsString.length == 2 &&
        !!worksheet[cellAsString].v
      ) {
        if (worksheet[cellAsString].v.includes("Харагдах дугаар"))
          tolgoinObject.kharagdakhDugaar = cellAsString[0];
        else if (worksheet[cellAsString].v.includes("Заалт"))
          tolgoinObject.zaalt = cellAsString[0];
        else if (worksheet[cellAsString].v.includes("Хамаарах хэсэг"))
          tolgoinObject.khamaarakh = cellAsString[0];
      }
    }
    var data = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 1,
    });
    data.forEach((mur) => {
      let object = new GereeniiZaalt(req.body.tukhainBaaziinKholbolt)();
      object.kharagdakhDugaar =
        mur[usegTooruuKhurvuulekh(tolgoinObject.kharagdakhDugaar)];
      object.zaalt = mur[usegTooruuKhurvuulekh(tolgoinObject.zaalt)];
      object.khamaarakh = mur[usegTooruuKhurvuulekh(tolgoinObject.khamaarakh)];
      object.baiguullagiinId = req.body.baiguullagiinId;
      object.barilgiinId = req.body.barilgiinId;
      jagsaalt.push(object);
    });
    var aldaaniiMsg = "";
    if (aldaaniiMsg) throw new aldaa(aldaaniiMsg);
    GereeniiZaalt(req.body.tukhainBaaziinKholbolt).insertMany(
      jagsaalt,
      function (err) {
        if (err) {
          next(err);
        }
        res.status(200).send("Amjilttai");
      }
    );
  } catch (error) {
    next(error);
  }
});

exports.gereeniiZagvarTatya = asyncHandler(async (req, res, next) => {
  try {
    const workbook = xlsx.read(req.file.buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jagsaalt = [];
    var tolgoinObject = {};
    var data = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 1,
    });
    if (!worksheet["Гэрээ"]) throw new Error("Буруу файл байна!");
    var zagvariinNer = worksheet["Гэрээ"].v;
    const zagvar = new GereeniiZagvar(req.body.tukhainBaaziinKholbolt)();
    zagvar.ner = zagvariinNer;
    data.forEach((mur) => {
      let object = new GereeniiZaalt(req.body.tukhainBaaziinKholbolt)();
      object.kharagdakhDugaar = mur[0];
      object.zaalt = mur[1];
      object.khamaarakhKheseg = mur[2];
      if (!object.kharagdakhDugaar) object.kharagdakhDugaar = "";
      jagsaalt.push(object);
    });
    zagvar.dedKhesguud = jagsaalt;
    zagvar.baiguullagiinId = req.body.baiguullagiinId;
    zagvar.barilgiinId = req.body.barilgiinId;
    var aldaaniiMsg = "";
    if (aldaaniiMsg) throw new aldaa(aldaaniiMsg);
    zagvar
      .save()
      .then((result) => {
        res.status(200).send("Amjilttai");
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

exports.gereeniiZagvarAvya = asyncHandler(async (req, res, next) => {
  let workbook = new excel.Workbook();
  let worksheet = workbook.addWorksheet("Гэрээ");
  worksheet.columns = [
    {
      header: "Загварын нэр",
      width: 20,
    },
    {
      header: "",
      key: "",
      width: 30,
    },
    {
      header: "Хамаарагдах алхам",
      key: "Хамаарагдах алхам",
      width: 20,
    },
  ];
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "attachment; filename=" + "Гэрээний загвар"
  );

  return workbook.xlsx.write(res).then(function () {
    res.status(200).end();
  });
});


exports.gereeniiExcelAvya = asyncHandler(async (req, res, next) => {
  let workbook = new excel.Workbook();
  let worksheet = workbook.addWorksheet("365 хоног");
  let worksheet30 = workbook.addWorksheet("30 хоног");
  const { db } = require("zevbackv2");
  var segmentuud = await Segment(req.body.tukhainBaaziinKholbolt).find({
    baiguullagiinId: req.body.baiguullagiinId,
    turul: "geree",
  });
  const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
  var zardluud = await AshiglaltiinZardluud(req.body.tukhainBaaziinKholbolt).find({
    baiguullagiinId: req.body.baiguullagiinId,
    barilgiinId: req.params.barilgiinId
  });
  var dansnuud = await Dans(req.body.tukhainBaaziinKholbolt).find({
    baiguullagiinId: req.body.baiguullagiinId,
    barilgiinId: req.params.barilgiinId,
  });
  var baganuud = [
    {
      header: "Гэрээний дугаар",
      key: "Гэрээний дугаар",
      width: 30,
    },
    {
      header: "Регистр/Бүртгэлийн дугаар",
      key: "Регистр/Бүртгэлийн дугаар",
      width: 30,
    },
    {
      header: "Эхлэх огноо",
      key: "Эхлэх огноо",
      width: 20,
    },
    {
      header: "Хугацаа(Сараар)",
      key: "Хугацаа(Сараар)",
      width: 20,
    },
    {
      header: "Авлага үүсэх өдөр",
      key: "Авлага үүсэх өдөр",
      width: 20,
    },
    {
      header: "Талбайн код",
      key: "Талбайн код",
      width: 20,
    },
    {
      header: "Барьцаа авах хугацаа",
      key: "Барьцаа авах хугацаа",
      width: 20,
    },
    {
      header: "Барьцаа байршуулах хугацаа",
      key: "Барьцаа байршуулах хугацаа",
      width: 20,
    },
    {
      header: "Авлага",
      key: "Авлага",
      width: 20,
    },
    {
      header: "Эхний сарын ашиглах хоног",
      key: "Эхний сарын ашиглах хоног",
      width: 20,
    },
  ];

  var baganiiToo = baganuud.length;
  if (dansnuud?.length > 0) {
    baganuud.push({
      header: "Данс",
      key: "Данс",
      width: 20,
    });
    var baganiiUseg = toogUsegruuKhurvuulekh(baganiiToo);
    var bagana = baganiiUseg + "2:" + baganiiUseg + "9999";
    worksheet.dataValidations.add(bagana, {
      type: "list",
      allowBlank: false,
      formulae: [`"${dansnuud?.map((a) => a.dugaar).join(",")}"`],
      showErrorMessage: true,
      errorStyle: "error",
      error: "Данс сонгоно уу!",
    });
    worksheet30.dataValidations.add(bagana, {
      type: "list",
      allowBlank: false,
      formulae: [`"${dansnuud?.map((a) => a.dugaar).join(",")}"`],
      showErrorMessage: true,
      errorStyle: "error",
      error: "Данс сонгоно уу!",
    });
    baganiiToo = baganiiToo + 1;
  }
  if (segmentuud && segmentuud.length > 0) {
    segmentuud.forEach((x) => {
      baganuud.push({
        header: x.ner,
        key: x.ner,
        width: 20,
      });
    });
  }
  if (zardluud && zardluud.length > 0) {
    zardluud.forEach((x) => {
      baganuud.push({
        header: x.ner,
        key: x.ner,
        width: 20,
      });
      if (x.turul === "Дурын") {
        baganuud.push({
          header: x.ner + " дүн",
          key: x.ner + " дүн",
          width: 20,
        });
      }
    });
  }
  worksheet.columns = baganuud;
  worksheet30.columns = baganuud;

  if (segmentuud && segmentuud.length > 0) {
    segmentuud.forEach((x) => {
      if (x.utguud) {
        var baganiiUseg = toogUsegruuKhurvuulekh(baganiiToo);
        var bagana = baganiiUseg + "2:" + baganiiUseg + "9999";
        worksheet.dataValidations.add(bagana, {
          type: "list",
          allowBlank: false,
          formulae: [`"${x.utguud.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "error",
          error: "Тохирох утгыг сонгоно уу!",
        });
        worksheet30.dataValidations.add(bagana, {
          type: "list",
          allowBlank: false,
          formulae: [`"${x.utguud.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "error",
          error: "Тохирох утгыг сонгоно уу!",
        });
      }
      baganiiToo = baganiiToo + 1;
    });
  }
  if (zardluud && zardluud.length > 0) {
    zardluud.forEach((x) => {
      if (x.turul != "төг") {
        var baganiiUseg = toogUsegruuKhurvuulekh(baganiiToo);
        var bagana = baganiiUseg + "2:" + baganiiUseg + "9999";
        worksheet.dataValidations.add(bagana, {
          type: "list",
          allowBlank: false,
          formulae: ['"Авна,Авахгүй"'],
          showErrorMessage: true,
          errorStyle: "error",
          error: "Тохирох утгыг сонгоно уу!",
        });
        worksheet30.dataValidations.add(bagana, {
          type: "list",
          allowBlank: false,
          formulae: ['"Авна,Авахгүй"'],
          showErrorMessage: true,
          errorStyle: "error",
          error: "Тохирох утгыг сонгоно уу!",
        });
      }
      baganiiToo = baganiiToo + (x.turul === "Дурын" ? 2 : 1);
    });
  }
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=" + encodeURI("Гэрээ.xlsx")
  );
  workbook.xlsx.write(res).then(function () {
    res.end();
  });
});

exports.gereeniiExcelTatya = asyncHandler(async (req, res, next) => {
  try {
    const workbook = xlsx.read(req.file.buffer);
    var zagvariinId;
    if (req.body.zagvariinId) zagvariinId = req.body.zagvariinId;
    else throw new aldaa("Загвараа сонгоно уу!");
    var ognoo;
    var segmentuud = await Segment(req.body.tukhainBaaziinKholbolt).find({
      baiguullagiinId: req.body.baiguullagiinId,
      turul: "geree",
    });
    const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
    var zardluud = await AshiglaltiinZardluud(req.body.tukhainBaaziinKholbolt).find({
      baiguullagiinId: req.body.baiguullagiinId,
      barilgiinId: req.body.barilgiinId
    });
    const { db } = require("zevbackv2");
    if (req.body.ognoo) ognoo = req.body.ognoo;
    else throw new aldaa("Огноо сонгоно уу!");
    if (!req.body.barilgiinId) throw new aldaa("Барилгаа сонгоно уу!");
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const worksheet30 = workbook.Sheets[workbook.SheetNames[1]];
    const jagsaalt = [];
    var tolgoinObject = {};
    var tolgoinObject30 = {};
    var baritsaaAvakhSar = await Baiguullaga(req.body.tukhainBaaziinKholbolt)
      .findById({
        _id: req.body.baiguullagiinId,
      })
      .select({ "tokhirgoo.baritsaaAvakhSar": 1 });
    if (
      baritsaaAvakhSar &&
      baritsaaAvakhSar.tokhirgoo &&
      baritsaaAvakhSar.tokhirgoo.baritsaaAvakhSar
    )
      baritsaaAvakhSar = baritsaaAvakhSar.tokhirgoo.baritsaaAvakhSar;
    else baritsaaAvakhSar = 0;
    for (let cell in worksheet) {
      var cellAsString = cell.toString();
      if (
        cellAsString[1] === "1" &&
        cellAsString.length == 2 &&
        !!worksheet[cellAsString].v
      ) {
        try {
          if (worksheet[cellAsString].v.includes("Гэрээний дугаар"))
            tolgoinObject.gereeniiDugaar = cellAsString[0];
          else if (
            worksheet[cellAsString].v.includes("Регистр/Бүртгэлийн дугаар")
          )
            tolgoinObject.register = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Эхлэх огноо"))
            tolgoinObject.gereeniiOgnoo = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Хугацаа(Сараар)"))
            tolgoinObject.khugatsaa = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Авлага үүсэх өдөр"))
            tolgoinObject.tulukhUdur = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Талбайн код"))
            tolgoinObject.talbainDugaar = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Барьцаа авах хугацаа"))
            tolgoinObject.baritsaaAwakhKhugatsaa = cellAsString[0];
          else if (
            worksheet[cellAsString].v.includes("Барьцаа байршуулах хугацаа")
          )
            tolgoinObject.baritsaaBairshuulakhKhugatsaa = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Авлага"))
            tolgoinObject.avlaga = cellAsString[0];
          else if (worksheet[cellAsString].v.includes("Данс"))
            tolgoinObject.dans = cellAsString[0];
          else if (
            worksheet[cellAsString].v.includes("Эхний сарын ашиглах хоног")
          )
            tolgoinObject.ekhniiSariinKhonog = cellAsString[0];
          else if (
            (segmentuud && segmentuud.length > 0) ||
            (zardluud && zardluud.length > 0)
          ) {
            if (segmentuud && segmentuud.length > 0) {
              var segment = segmentuud.find(
                (element) => element.ner === worksheet[cellAsString].v
              );
              if (segment) tolgoinObject[segment.ner] = cellAsString[0];
            }
            if (zardluud && zardluud.length > 0) {
              var zardal = zardluud.find(
                (element) => element.ner === worksheet[cellAsString].v
              );
              if (zardal) {
                tolgoinObject[zardal.ner] = cellAsString[0];
                if (zardal.turul === "Дурын") {
                  for (const key in worksheet) {
                    if (
                      key[1] === "1" &&
                      key.length == 2 &&
                      !!worksheet[cellAsString].v &&
                      worksheet[key].v === zardal.ner + " дүн"
                    ) {
                      tolgoinObject[zardal.ner + " дүн"] = key[0];
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          throw new aldaa("Буруу файл байна! " + err);
        }
      }
    }
    for (let cell in worksheet30) {
      var cellAsString = cell.toString();
      if (
        cellAsString[1] === "1" &&
        cellAsString.length == 2 &&
        !!worksheet30[cellAsString].v
      ) {
        try {
          if (worksheet30[cellAsString].v.includes("Гэрээний дугаар"))
            tolgoinObject30.gereeniiDugaar = cellAsString[0];
          else if (
            worksheet30[cellAsString].v.includes("Регистр/Бүртгэлийн дугаар")
          )
            tolgoinObject30.register = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Эхлэх огноо"))
            tolgoinObject30.gereeniiOgnoo = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Хугацаа(Сараар)"))
            tolgoinObject30.khugatsaa = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Авлага үүсэх өдөр"))
            tolgoinObject30.tulukhUdur = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Талбайн код"))
            tolgoinObject30.talbainDugaar = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Барьцаа авах хугацаа"))
            tolgoinObject30.baritsaaAwakhKhugatsaa = cellAsString[0];
          else if (
            worksheet30[cellAsString].v.includes("Барьцаа байршуулах хугацаа")
          )
            tolgoinObject30.baritsaaBairshuulakhKhugatsaa = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Авлага"))
            tolgoinObject30.avlaga = cellAsString[0];
          else if (worksheet30[cellAsString].v.includes("Данс"))
            tolgoinObject30.dans = cellAsString[0];
          else if (
            worksheet30[cellAsString].v.includes("Эхний сарын ашиглах хоног")
          )
            tolgoinObject30.ekhniiSariinKhonog = cellAsString[0];
          else if (
            (segmentuud && segmentuud.length > 0) ||
            (zardluud && zardluud.length > 0)
          ) {
            if (segmentuud && segmentuud.length > 0) {
              var segment = segmentuud.find(
                (element) => element.ner === worksheet30[cellAsString].v
              );
              if (segment) tolgoinObject30[segment.ner] = cellAsString[0];
            }
            if (zardluud && zardluud.length > 0) {
              var zardal = zardluud.find(
                (element) => element.ner === worksheet30[cellAsString].v
              );
              if (zardal) {
                tolgoinObject30[zardal.ner] = cellAsString[0];
                if (zardal.turul === "Дурын") {
                  for (const key in worksheet30) {
                    if (
                      key[1] === "1" &&
                      key.length == 2 &&
                      !!worksheet30[key].v &&
                      worksheet30[key].v === zardal.ner + " дүн"
                    ) {
                      tolgoinObject30[zardal.ner + " дүн"] = key[0];
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          throw new aldaa("Буруу файл байна! " + err);
        }
      }
    }
    var data = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 1,
    });
    var data30 = xlsx.utils.sheet_to_json(worksheet30, {
      header: 1,
      range: 1,
    });
    var aldaaniiMsg = "";
    var muriinDugaar = 1;
    try {
      data.forEach((mur) => {
        muriinDugaar++;
        let object = new Geree(req.body.tukhainBaaziinKholbolt)();
        object.tuluv = 1;
        object.gereeniiDugaar =
          mur[usegTooruuKhurvuulekh(tolgoinObject.gereeniiDugaar)];
        object.register = mur[usegTooruuKhurvuulekh(tolgoinObject.register)];
        object.gereeniiOgnoo = new ExcelDateToJSDate(
          mur[usegTooruuKhurvuulekh(tolgoinObject.gereeniiOgnoo)]
        );
        object.khugatsaa = mur[usegTooruuKhurvuulekh(tolgoinObject.khugatsaa)];
        var ekhlekhOgnoo = new Date(object.gereeniiOgnoo);
        object.duusakhOgnoo = new Date(
          ekhlekhOgnoo.setMonth(ekhlekhOgnoo.getMonth() + object.khugatsaa)
        );
        object.tulukhUdur = [
          mur[usegTooruuKhurvuulekh(tolgoinObject.tulukhUdur)],
        ];
        object.talbainDugaar =
          mur[usegTooruuKhurvuulekh(tolgoinObject.talbainDugaar)];
        object.baritsaaAwakhKhugatsaa =
          mur[usegTooruuKhurvuulekh(tolgoinObject.baritsaaAwakhKhugatsaa)];
        if (!object.baritsaaAwakhKhugatsaa) object.baritsaaAwakhKhugatsaa = 0;
        object.baritsaaBairshuulakhKhugatsaa =
          mur[
          usegTooruuKhurvuulekh(tolgoinObject.baritsaaBairshuulakhKhugatsaa)
          ];
        object.uldegdel = mur[usegTooruuKhurvuulekh(tolgoinObject.avlaga)];
        object.dans = mur[usegTooruuKhurvuulekh(tolgoinObject.dans)];
        object.ekhniiSariinKhonog =
          mur[usegTooruuKhurvuulekh(tolgoinObject.ekhniiSariinKhonog)];
        object.guchKhonogOruulakhEsekh = false;
        object.garaasKhonogOruulakhEsekh = !!object.ekhniiSariinKhonog;
        object.daraagiinTulukhOgnoo = moment(ognoo)
          .add(1, "month")
          .set("date", object.tulukhUdur);
        object.baritsaaAvakhKhugatsaa =
          baritsaaAvakhSar === 0
            ? mur[usegTooruuKhurvuulekh(tolgoinObject.baritsaaAwakhKhugatsaa)]
            : baritsaaAvakhSar;
        object.baritsaaAvakhEsekh = object.baritsaaAvakhKhugatsaa > 0;
        object.avlaga = { guilgeenuud: [] };
        if (!!object.uldegdel)
          object.avlaga.guilgeenuud.push({
            ognoo,
            tulukhDun: object.uldegdel,
            undsenDun: object.uldegdel,
          });
        object.gereeniiZagvariinId = zagvariinId;
        object.baiguullagiinId = req.body.baiguullagiinId;
        object.barilgiinId = req.body.barilgiinId;
        if (segmentuud && segmentuud.length > 0) {
          segmentuud.forEach((segment) => {
            if (tolgoinObject.hasOwnProperty(segment.ner)) {
              if (object.segmentuud && object.segmentuud.length > 0) {
                object.segmentuud.push({
                  ner: segment.ner,
                  utga: mur[usegTooruuKhurvuulekh(tolgoinObject[segment.ner])],
                });
              } else {
                object.segmentuud = [
                  {
                    ner: segment.ner,
                    utga: mur[
                      usegTooruuKhurvuulekh(tolgoinObject[segment.ner])
                    ],
                  },
                ];
              }
            }
          });
        }

        if (zardluud && zardluud.length > 0) {
          zardluud.forEach((zardal) => {
            if (zardal.turul == "Дурын")
              zardal.dun =
                mur[usegTooruuKhurvuulekh(tolgoinObject[zardal.ner + " дүн"])];
            if (tolgoinObject.hasOwnProperty(zardal.ner)) {
              if (
                mur[usegTooruuKhurvuulekh(tolgoinObject[zardal.ner])] !=
                "Авахгүй" &&
                mur[usegTooruuKhurvuulekh(tolgoinObject[zardal.ner])] !=
                undefined
              ) {
                if (object.zardluud && object.zardluud.length > 0) {
                  object.zardluud.push(zardal);
                } else {
                  object.zardluud = [zardal];
                }
              }
            }
          });
        }
        if (
          !object.register ||
          !object.gereeniiOgnoo ||
          !object.khugatsaa ||
          !object.talbainDugaar ||
          object.gereeniiOgnoo < Date.parse("2010-01-01") ||
          !object.tulukhUdur ||
          !isNumeric(object.tulukhUdur[0])
        ) {
          aldaaniiMsg = aldaaniiMsg + muriinDugaar + " дугаар мөрөнд ";
          if (!object.register) aldaaniiMsg = aldaaniiMsg + "Регистр ";
          if (!object.gereeniiOgnoo)
            aldaaniiMsg = aldaaniiMsg + "Гэрээний огноо ";
          if (!object.khugatsaa) aldaaniiMsg = aldaaniiMsg + "Хугацаа ";
          if (!object.talbainDugaar) aldaaniiMsg = aldaaniiMsg + "Талбайн код ";
          if (
            !object.register ||
            !object.gereeniiOgnoo ||
            !object.khugatsaa ||
            !object.talbainDugaar
          )
            aldaaniiMsg = aldaaniiMsg + "талбар хоосон ";
          if (object.gereeniiOgnoo < Date.parse("2010-01-01"))
            aldaaniiMsg = aldaaniiMsg + "Гэрээний огноо буруу ";
          if (!object.tulukhUdur || !isNumeric(object.tulukhUdur[0]))
            aldaaniiMsg = aldaaniiMsg + "Төлөх өдөр буруу ";
          aldaaniiMsg = aldaaniiMsg + "байна! <br/>";
        } else jagsaalt.push(object);
      });
    } catch (err) {
      throw new aldaa(
        aldaaniiMsg + muriinDugaar + " дугаар мөрөнд алдаа гарлаа" + err
      );
    }
    muriinDugaar = 1;
    try {
      data30.forEach((mur) => {
        muriinDugaar++;
        let object = new Geree(req.body.tukhainBaaziinKholbolt)();
        object.tuluv = 1;
        object.gereeniiDugaar =
          mur[usegTooruuKhurvuulekh(tolgoinObject30.gereeniiDugaar)];
        object.register = mur[usegTooruuKhurvuulekh(tolgoinObject30.register)];
        object.gereeniiOgnoo = new ExcelDateToJSDate(
          mur[usegTooruuKhurvuulekh(tolgoinObject30.gereeniiOgnoo)]
        );
        object.khugatsaa =
          mur[usegTooruuKhurvuulekh(tolgoinObject30.khugatsaa)];
        var ekhlekhOgnoo = new Date(object.gereeniiOgnoo);
        object.duusakhOgnoo = new Date(
          ekhlekhOgnoo.setMonth(ekhlekhOgnoo.getMonth() + object.khugatsaa)
        );
        object.tulukhUdur = [
          mur[usegTooruuKhurvuulekh(tolgoinObject30.tulukhUdur)],
        ];
        object.talbainDugaar =
          mur[usegTooruuKhurvuulekh(tolgoinObject30.talbainDugaar)];
        object.baritsaaAwakhKhugatsaa =
          mur[usegTooruuKhurvuulekh(tolgoinObject30.baritsaaAwakhKhugatsaa)];
        if (!object.baritsaaAwakhKhugatsaa) object.baritsaaAwakhKhugatsaa = 0;
        object.baritsaaBairshuulakhKhugatsaa =
          mur[
          usegTooruuKhurvuulekh(tolgoinObject30.baritsaaBairshuulakhKhugatsaa)
          ];
        object.uldegdel = mur[usegTooruuKhurvuulekh(tolgoinObject30.avlaga)];
        object.dans = mur[usegTooruuKhurvuulekh(tolgoinObject30.dans)];
        object.ekhniiSariinKhonog =
          mur[usegTooruuKhurvuulekh(tolgoinObject30.ekhniiSariinKhonog)];
        object.guchKhonogOruulakhEsekh = true;
        object.garaasKhonogOruulakhEsekh = !!object.ekhniiSariinKhonog;
        object.daraagiinTulukhOgnoo = moment(ognoo)
          .add(1, "month")
          .set("date", object.tulukhUdur);
        object.baritsaaAvakhKhugatsaa =
          baritsaaAvakhSar === 0
            ? mur[usegTooruuKhurvuulekh(tolgoinObject30.baritsaaAwakhKhugatsaa)]
            : baritsaaAvakhSar;
        object.baritsaaAvakhEsekh = object.baritsaaAvakhKhugatsaa > 0;
        object.avlaga = { guilgeenuud: [] };
        if (!!object.uldegdel)
          object.avlaga.guilgeenuud.push({
            ognoo,
            tulukhDun: object.uldegdel,
            undsenDun: object.uldegdel,
          });
        object.gereeniiZagvariinId = zagvariinId;
        object.baiguullagiinId = req.body.baiguullagiinId;
        object.barilgiinId = req.body.barilgiinId;
        if (segmentuud && segmentuud.length > 0) {
          segmentuud.forEach((segment) => {
            if (tolgoinObject30.hasOwnProperty(segment.ner)) {
              if (object.segmentuud && object.segmentuud.length > 0) {
                object.segmentuud.push({
                  ner: segment.ner,
                  utga: mur[
                    usegTooruuKhurvuulekh(tolgoinObject30[segment.ner])
                  ],
                });
              } else {
                object.segmentuud = [
                  {
                    ner: segment.ner,
                    utga: mur[
                      usegTooruuKhurvuulekh(tolgoinObject30[segment.ner])
                    ],
                  },
                ];
              }
            }
          });
        }

        if (zardluud && zardluud.length > 0) {
          zardluud.forEach((zardal) => {
            if (zardal.turul === "Дурын")
              zardal.dun =
                mur[
                usegTooruuKhurvuulekh(tolgoinObject30[zardal.ner + " дүн"])
                ];
            if (tolgoinObject30.hasOwnProperty(zardal.ner)) {
              if (
                mur[usegTooruuKhurvuulekh(tolgoinObject30[zardal.ner])] !=
                "Авахгүй" &&
                mur[usegTooruuKhurvuulekh(tolgoinObject30[zardal.ner])] !=
                undefined
              ) {
                if (object.zardluud && object.zardluud.length > 0) {
                  object.zardluud.push(zardal);
                } else {
                  object.zardluud = [zardal];
                }
              }
            }
          });
        }
        if (
          !object.register ||
          !object.gereeniiOgnoo ||
          !object.khugatsaa ||
          !object.talbainDugaar ||
          object.gereeniiOgnoo < Date.parse("2010-01-01") ||
          !object.tulukhUdur ||
          !isNumeric(object.tulukhUdur[0])
        ) {
          aldaaniiMsg = aldaaniiMsg + muriinDugaar + " дугаар мөрөнд ";
          if (!object.register) aldaaniiMsg = aldaaniiMsg + "Регистр ";
          if (!object.gereeniiOgnoo)
            aldaaniiMsg = aldaaniiMsg + "Гэрээний огноо ";
          if (!object.khugatsaa) aldaaniiMsg = aldaaniiMsg + "Хугацаа ";
          if (!object.talbainDugaar) aldaaniiMsg = aldaaniiMsg + "Талбайн код ";
          if (
            !object.register ||
            !object.gereeniiOgnoo ||
            !object.khugatsaa ||
            !object.talbainDugaar
          )
            aldaaniiMsg = aldaaniiMsg + "талбар хоосон ";
          if (object.gereeniiOgnoo < Date.parse("2010-01-01"))
            aldaaniiMsg = aldaaniiMsg + "Гэрээний огноо буруу ";
          if (!object.tulukhUdur || !isNumeric(object.tulukhUdur[0]))
            aldaaniiMsg = aldaaniiMsg + "Төлөх өдөр буруу ";
          aldaaniiMsg = aldaaniiMsg + "байна! <br/>";
        } else jagsaalt.push(object);
      });
    } catch (err) {
      throw new aldaa(
        aldaaniiMsg + muriinDugaar + " дугаар мөрөнд алдаа гарлаа" + err
      );
    }
    if (jagsaalt.length == 0) throw new Error("Хоосон файл байна!");
    aldaaniiMsg = await gereeBaigaaEskhiigShalgaya(
      jagsaalt,
      aldaaniiMsg,
      req.body.baiguullagiinId,
      req.body.tukhainBaaziinKholbolt
    );
    aldaaniiMsg = await orshinSuugchBaigaaEskhiigShalgaya(
      jagsaalt,
      aldaaniiMsg,
      req.body.baiguullagiinId,
      req.body.barilgiinId,
      db.erunkhiiKholbolt
    );
    aldaaniiMsg = await talbaiBaigaaEskhiigShalgaya(
      jagsaalt,
      aldaaniiMsg,
      req.body.baiguullagiinId,
      req.body.barilgiinId,
      req.body.tukhainBaaziinKholbolt
    );
    if (aldaaniiMsg) throw new aldaa(aldaaniiMsg);
    jagsaalt.forEach((x) => {
      var data = [];
      new Array(x.khugatsaa || 0).fill("").map((mur, index) => {
        x.tulukhUdur.forEach((udur) => {
          if (
            moment(ognoo).add(index, "month").set("date", udur) <=
            moment(x.duusakhOgnoo)
          ) {
            var dun = ekhniiSariinDunZasyaSync(
              x,
              moment(ognoo).add(index, "month").set("date", udur),
              moment(x.gereeniiOgnoo).startOf("month"),
              x.talbainNiitUne
            ); // Ekhnii sariin dun bodokh
            data.push({
              ognoo: moment(ognoo).add(index, "month").set("date", udur),
              undsenDun: dun,
              tulukhDun: dun,
              turul: "khuvaari",
            });
            if (x.zardluud && x.zardluud.length > 0)
              x.zardluud.forEach((zardal) => {
                if (zardal && !zardal.ner?.includes("Цахилгаан")) {
                  if (zardal.turul == "1м2")
                    zardal.dun = tooZasyaSync(
                      zardal.tariff * (x.talbainKhemjee || 0)
                    );
                  if (zardal.turul == "1м3/талбай")
                    zardal.dun = tooZasyaSync(
                      zardal.tariff * (x.talbainKhemjeeMetrKube || 0)
                    );
                  if (zardal.turul == "Тогтмол") zardal.dun = zardal.tariff;
                  if (!!zardal.dun) {
                    var zardalDun = ekhniiSariinDunZasyaSync(
                      x,
                      moment(ognoo).add(index, "month").set("date", udur),
                      moment(x.gereeniiOgnoo).startOf("month"),
                      zardal.dun
                    ); // Ekhnii sariin dun bodokh
                    data.push({
                      turul: "avlaga",
                      tailbar: zardal.ner,
                      ognoo: moment(ognoo)
                        .add(index, "month")
                        .set("date", udur),
                      tulukhDun: zardalDun,
                    });
                  }
                }
              });
          }
        });
      });
      x.avlaga.guilgeenuud = [...x.avlaga.guilgeenuud, ...data];
      if (baritsaaAvakhSar > 0) {
        x.avlaga.guilgeenuud = [
          ...x.avlaga.guilgeenuud,
          {
            turul: "baritsaa",
            ognoo: x.gereeniiOgnoo,
            khyamdral: 0,
            undsenDun: x.talbainNiitUne * baritsaaAvakhSar,
            tulukhDun: x.talbainNiitUne * baritsaaAvakhSar,
          },
        ];
      }
    });
    Geree(req.body.tukhainBaaziinKholbolt).insertMany(jagsaalt);
    var talbainBulk = [];
    var orshinSuugchBulk = [];
    jagsaalt.forEach((a) => {
      a.talbainIdnuud.forEach((b) => {
        let upsertTalbai = {
          updateOne: {
            filter: {
              _id: b,
              baiguullagiinId: req.body.baiguullagiinId,
              barilgiinId: req.body.barilgiinId,
            },
            update: {
              idevkhiteiEsekh: true,
            },
          },
        };
        talbainBulk.push(upsertTalbai);
      });
      let upsertKhariltsagcj = {
        updateOne: {
          filter: {
            register: a.register,
            baiguullagiinId: req.body.baiguullagiinId,
            barilgiinId: req.body.barilgiinId,
          },
          update: {
            idevkhiteiEsekh: true,
          },
        },
      };
      orshinSuugchBulk.push(upsertKhariltsagcj);
      let upsertTinKhariltsagcj = {
        updateOne: {
          filter: {
            customerTin: a.register,
            baiguullagiinId: req.body.baiguullagiinId,
            barilgiinId: req.body.barilgiinId,
          },
          update: {
            idevkhiteiEsekh: true,
          },
        },
      };
      orshinSuugchBulk.push(upsertTinKhariltsagcj);
    });
    if (talbainBulk)
      Talbai(req.body.tukhainBaaziinKholbolt)
        .bulkWrite(talbainBulk)
        .then((bulkWriteOpResult) => { })
        .catch((err) => {
          next(err);
        });
    if (orshinSuugchBulk)
      OrshinSuugch(db.erunkhiiKholbolt)
        .bulkWrite(orshinSuugchBulk)
        .then((bulkWriteOpResult) => { })
        .catch((err) => {
          next(err);
        });
    res.status(200).send("Amjilttai");
  } catch (error) {
    next(error);
  }
});

// ============================================
// ELECTRICITY (ЦАХИЛГААН) EXCEL IMPORT/EXPORT
// ============================================

/**
 * Download Excel template for electricity readings
 * Columns: … Өмнө, Өдөр, Шөнө, Нийт (одоо), Зөрүү, Суурь хураамж, Цахилгаан кВт
 * Өмнө = сүүлийн импортын "Нийт (одоо)" (zaaltUnshlalt); байхгүй бол гэрээний suuliinZaalt
 * (хэрэв энэ нь оршин суугчийн тарифтай ижил биш — олон тохиолдолд тарифыг тоолуур гэж буруу хадгалсан)
 * Formulas: Нийт (одоо) = Өдөр + Шөнө; Зөрүү = Нийт (одоо) - Өмнө
 */
exports.zaaltExcelTemplateAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон");
    }

    if (!barilgiinId) {
      throw new aldaa("Барилгын ID хоосон");
    }

    const Baiguullaga = require("../models/baiguullaga");
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId);
    if (!baiguullaga) {
      throw new aldaa("Байгууллага олдсонгүй");
    }

    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(barilgiinId)
    );
    if (!targetBarilga) {
      throw new aldaa("Барилга олдсонгүй");
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullaga._id.toString()
    );
    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболт олдсонгүй");
    }

    // Get all active gerees for this building
    const Geree = require("../models/geree");
    const OrshinSuugch = require("../models/orshinSuugch");
    const gereenuud = await Geree(tukhainBaaziinKholbolt).find({
      baiguullagiinId: baiguullaga._id.toString(),
      barilgiinId: barilgiinId,
      tuluv: "Идэвхтэй",
    })
      .select("gereeniiDugaar toot orshinSuugchId suuliinZaalt _id")
      .lean();

    const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
    const gereeIdStrings = gereenuud.map((g) => String(g._id));
    const latestTotalByGereeId = new Map();
    if (gereeIdStrings.length > 0) {
      const latestRows = await ZaaltUnshlalt(tukhainBaaziinKholbolt).aggregate([
        {
          $match: {
            baiguullagiinId: baiguullaga._id.toString(),
            barilgiinId: String(barilgiinId),
            gereeniiId: { $in: gereeIdStrings },
          },
        },
        { $sort: { unshlaltiinOgnoo: -1, importOgnoo: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$gereeniiId",
            suuliinZaalt: { $first: "$suuliinZaalt" },
          },
        },
      ]);
      latestRows.forEach((r) => {
        if (r.suuliinZaalt != null && !Number.isNaN(Number(r.suuliinZaalt))) {
          latestTotalByGereeId.set(String(r._id), Number(r.suuliinZaalt));
        }
      });
    }

    /** Өмнө = last billing "Нийт (одоо)", not ₮/кВт tariff stored on geree by mistake */
    function templateUmnuValue(geree, orshinSuugch) {
      const fromHistory = latestTotalByGereeId.get(String(geree._id));
      if (fromHistory != null) return fromHistory;
      const s = Number(geree.suuliinZaalt);
      const tariff = Number(orshinSuugch?.tsahilgaaniiZaalt);
      if (
        Number.isFinite(s) &&
        Number.isFinite(tariff) &&
        Math.abs(s - tariff) < 1e-6
      ) {
        return 0;
      }
      return Number.isFinite(s) ? s : 0;
    }

    // Fetch orshinSuugch data to get name, phone, and electricity tariff (кВт)
    const orshinSuugchIds = [...new Set(gereenuud.map(g => g.orshinSuugchId).filter(id => id))];
    const orshinSuugchuud = await OrshinSuugch(db.erunkhiiKholbolt)
      .find({
        _id: { $in: orshinSuugchIds }
      })
      .select("_id ner utas tsahilgaaniiZaalt")
      .lean();

    // Create map for quick lookup
    const orshinSuugchMap = new Map();
    orshinSuugchuud.forEach((orshinSuugch) => {
      orshinSuugchMap.set(orshinSuugch._id.toString(), orshinSuugch);
    });

    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Цахилгаан");

    // Define columns (headers are automatically created in row 1)
    worksheet.columns = [
      { header: "Гэрээний дугаар", key: "gereeniiDugaar", width: 20 },
      { header: "Тоот", key: "toot", width: 15 },
      { header: "Нэр", key: "ner", width: 20 },
      { header: "Утас", key: "utas", width: 15 },
      { header: "Өмнө", key: "umnu", width: 15 },
      { header: "Өдөр", key: "odor", width: 15 },
      { header: "Шөнө", key: "shone", width: 15 },
      { header: "Нийт (одоо)", key: "niitOdoo", width: 15 },
      { header: "Зөрүү", key: "zoruu", width: 15 },
      { header: "Суурь хураамж", key: "defaultDun", width: 15 },
      { header: "Цахилгаан кВт", key: "kwt", width: 12 },
    ];

    // Style header row (worksheet.columns already creates headers in row 1)
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add data rows with geree numbers
    gereenuud.forEach((geree) => {
      const orshinSuugch = geree.orshinSuugchId
        ? orshinSuugchMap.get(geree.orshinSuugchId.toString())
        : null;

      worksheet.addRow({
        gereeniiDugaar: geree.gereeniiDugaar || "",
        toot: geree.toot || "",
        ner: orshinSuugch?.ner || "",
        utas: orshinSuugch?.utas || "",
        umnu: templateUmnuValue(geree, orshinSuugch),
        odor: "",
        shone: "",
        niitOdoo: "",
        zoruu: "",
        defaultDun: "",
        kwt: orshinSuugch?.tsahilgaaniiZaalt ?? "",
      });
    });

    // Add formula for "Нийт (одоо)" column (Өдөр + Шөнө)
    // Columns: A=Гэрээний дугаар, B=Тоот, C=Нэр, D=Утас, E=Өмнө, F=Өдөр, G=Шөнө, H=Нийт (одоо), I=Зөрүү, J=Суурь хураамж, K=кВт
    // Add formula for "Зөрүү" column (Нийт (одоо) - Өмнө)
    gereenuud.forEach((geree, index) => {
      const rowNumber = index + 2; // +2 because row 1 is header

      // Нийт (одоо) = Өдөр + Шөнө (Column H = F + G)
      const niitCell = worksheet.getCell(`H${rowNumber}`);
      niitCell.value = {
        formula: `F${rowNumber}+G${rowNumber}`,
      };
      niitCell.numFmt = "0.00";

      // Зөрүү = Нийт (одоо) - Өмнө (Column I = H - E)
      const zoruuCell = worksheet.getCell(`I${rowNumber}`);
      zoruuCell.value = {
        formula: `H${rowNumber}-E${rowNumber}`,
      };
      zoruuCell.numFmt = "0.00";
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="zaalt_template_${Date.now()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

/**
 * Import electricity readings from Excel
 * Calculation: (Өдөр + Шөнө) = Нийт (одоо)
 * Then: (Нийт (одоо) - Өмнө) * кВт tariff + 2000 (default)
 */
exports.zaaltExcelTatya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId, ognoo } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон");
    }

    if (!barilgiinId) {
      throw new aldaa("Барилгын ID хоосон");
    }

    if (!ognoo) {
      throw new aldaa("Огноо заавал бөглөх шаардлагатай");
    }

    if (!req.file) {
      throw new aldaa("Excel файл оруулах");
    }

    const Baiguullaga = require("../models/baiguullaga");
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId);
    if (!baiguullaga) {
      throw new aldaa("Байгууллага олдсонгүй");
    }

    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(barilgiinId)
    );
    if (!targetBarilga) {
      throw new aldaa("Барилга олдсонгүй");
    }

    // Find electricity zardal (zaalt = true AND is a VARIABLE electricity charge)
    // "Дундын өмчлөл Цахилгаан" is FIXED and should NOT be used for zaalt import
    // Only "Цахилгаан" (without "дундын" or "өмчлөл") should be used
    const zardluud = targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];

    // Helper to check if this is a VARIABLE electricity (not fixed)
    const isVariableElectricity = (z) => {
      const nameLower = (z.ner || "").toLowerCase();
      // Exclude fixed electricity charges or lift-related ones
      if (nameLower.includes("дундын") || nameLower.includes("өмчлөл")) return false;
      if (nameLower.includes("шат")) return false;
      return true;
    };

    const zaaltZardluud = zardluud.filter(z => z.zaalt === true && isVariableElectricity(z));

    // Prioritize exact "Цахилгаан" match
    let zaaltZardal = zaaltZardluud.find(
      (z) => z.ner && z.ner.trim() === "Цахилгаан"
    );

    // If no exact match among those with zaalt=true, check all variable ones
    if (!zaaltZardal) {
      zaaltZardal = zardluud.find(z => z.zaalt === true && isVariableElectricity(z));
    }

    // If STILL no match, use ANY electricity charge that isn't shared/elevator
    if (!zaaltZardal) {
      zaaltZardal = zardluud.find(z => {
        const name = (z.ner || "").toLowerCase();
        return name.includes("цахилгаан") && !name.includes("дундын") && !name.includes("шат");
      });
    }

    // Final stub if absolutely nothing found to avoid 500 error
    if (!zaaltZardal) {
      zaaltZardal = {
        ner: "Цахилгаан",
        zardliinTurul: "Хувьсах",
        zaaltTariff: 0,
        suuriKhuraamj: 2000,
        zaalt: true
      };
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullagiinId
    );
    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболт олдсонгүй");
    }

    // Read Excel file
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { raw: false });

    if (!data || data.length === 0) {
      throw new aldaa("Excel хоосон");
    }

    const Geree = require("../models/geree");
    const OrshinSuugch = require("../models/orshinSuugch");
    
    // Robust number parser for Mongolian Excel formats (stripping commas)
    const parseExcelNum = (val) => {
      if (val === undefined || val === null || val === "") return 0;
      if (typeof val === "number") return val;
      const cleaned = String(val).replace(/,/g, "").trim();
      return parseFloat(cleaned) || 0;
    };

    const results = {
      success: [],
      failed: [],
      total: data.length,
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; 

      // Robust field lookup helper
      const getVal = (row, ...names) => {
        for (const name of names) {
          if (row[name] !== undefined && row[name] !== null) return row[name];
          // Try case-insensitive and trimmed versions
          const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === name.toLowerCase());
          if (foundKey) return row[foundKey];
        }
        return undefined;
      };

      try {
        const gereeniiDugaar = (getVal(row, "Гэрээний дугаар", "gereeniiDugaar") || "").toString().trim();
        if (!gereeniiDugaar) {
          results.failed.push({
            row: rowNumber,
            gereeniiDugaar: "",
            error: "Гэрээний дугаар хоосон",
          });
          continue;
        }

        const geree = await Geree(tukhainBaaziinKholbolt).findOne({
          gereeniiDugaar: gereeniiDugaar,
          baiguullagiinId: baiguullagiinId,
          barilgiinId: barilgiinId,
        });

        if (!geree) {
          results.failed.push({
            row: rowNumber,
            gereeniiDugaar: gereeniiDugaar,
            error: "Гэрээ олдсонгүй",
          });
          continue;
        }

        // Parse readings with comma handling and robust column naming
        let umnuValue = getVal(row, "Өмнө", "Өмнөх", "umnu", "Өмнөх заалт");
        let odorValue = getVal(row, "Өдөр", "odor", "Өдрийн заалт");
        let shoneValue = getVal(row, "Шөнө", "shone", "Шөнийн заалт");
        let niitOdooRaw = getVal(row, "Нийт (одоо)", "Нийт", "niit", "suuliinZaalt");

        const isEmptyStr = (v) => v === undefined || v === null || String(v).trim() === "";
        
        // If the user uploads the excel template but leaves these columns blank for this row, skip it.
        // "if i insert one data only change that dont make other data empty value like 0 0 0 0"
        if (isEmptyStr(umnuValue) && isEmptyStr(odorValue) && isEmptyStr(shoneValue) && isEmptyStr(niitOdooRaw)) {
            // No reading data provided for this geree. Skip to avoid billing 0 or duplicating baseFee.
            results.success.push({
              row: rowNumber,
              gereeniiDugaar: gereeniiDugaar,
              message: "Уншилтын мэдээлэл хоосон тул алгасав",
            });
            continue;
        }

        let umnu = !isEmptyStr(umnuValue) ? parseExcelNum(umnuValue) : (geree.suuliinZaalt || 0);
        let odor = !isEmptyStr(odorValue) ? parseExcelNum(odorValue) : (geree.zaaltTog || 0);
        let shone = !isEmptyStr(shoneValue) ? parseExcelNum(shoneValue) : (geree.zaaltUs || 0);
        
        let niitOdoo = geree.suuliinZaalt || 0;
        
        if (!isEmptyStr(niitOdooRaw)) {
            niitOdoo = parseExcelNum(niitOdooRaw);
        } else if (!isEmptyStr(odorValue) || !isEmptyStr(shoneValue)) {
            // Re-calculate if odor or shone is provided
            niitOdoo = odor + shone;
        }
        
        // Base fee from Excel (Support multiple naming variations)
        const defaultDunFromExcel = parseExcelNum(getVal(row, "Суурь хураамж", "Суурь хүраамж", "defaultDun", "baseFee"));

        // Usage amount and calculation
        const zoruuValue = Math.abs(niitOdoo - umnu);
        let finalTariff = (zaaltZardal ? (zaaltZardal.zaaltTariff || zaaltZardal.tariff || 0) : 0);
        let gereeZaaltTariff = finalTariff; // Keep for tiered calculation fallback
        
        // Base fee: Priority Excel > Global Setting > Default 2000
        const baseFeeUsed = defaultDunFromExcel || (zaaltZardal ? (zaaltZardal.suuriKhuraamj || 0) : 2000);

        // Parse per-resident electricity tariff from Excel
        let tsahilgaaniiZaaltFromExcel = null;
        const elecTariffRowValue = row["Цахилгаан кВт"] || row["Цахилгаан тариф"] || row["tsahilgaanTariff"];
        if (
          elecTariffRowValue !== undefined &&
          elecTariffRowValue !== null &&
          String(elecTariffRowValue).trim() !== ""
        ) {
          const parsedTariff = parseExcelNum(elecTariffRowValue);
          if (parsedTariff > 0) {
            tsahilgaaniiZaaltFromExcel = parsedTariff;
          }
        }

        // Row priority: If Excel row has a tariff, use it!
        if (tsahilgaaniiZaaltFromExcel !== null) {
          finalTariff = tsahilgaaniiZaaltFromExcel;
        }

        // Validate readings
        if (odor < 0 || shone < 0 || umnu < 0) {
          results.failed.push({
            row: rowNumber,
            gereeniiDugaar: gereeniiDugaar,
            error: "Уншилтын утга сөрөг байж болохгүй",
          });
          continue;
        }

        // Update Resident latest readings and tariff if record exists
        if (geree.orshinSuugchId) {
          const centralConn = db.erunkhiiKholbolt;
          let orshinSuugch = await OrshinSuugch(centralConn).findById(geree.orshinSuugchId).catch(() => null);
          
          if (!orshinSuugch && tukhainBaaziinKholbolt) {
            orshinSuugch = await OrshinSuugch(tukhainBaaziinKholbolt).findById(geree.orshinSuugchId).catch(() => null);
          }

          if (orshinSuugch) {
            orshinSuugch.odorZaalt = odor;
            orshinSuugch.shonoZaalt = shone;
            orshinSuugch.suuliinZaalt = niitOdoo;

            if (tsahilgaaniiZaaltFromExcel !== null) {
              orshinSuugch.tsahilgaaniiZaalt = tsahilgaaniiZaaltFromExcel;
            } else if (orshinSuugch.tsahilgaaniiZaalt > 0 && finalTariff === 0) {
              // Only fallback to resident tariff if Excel row was empty and building global was 0
              finalTariff = orshinSuugch.tsahilgaaniiZaalt;
            }

            await orshinSuugch.save();
          }
        }
        
        // Sync tiered calculation tariff with finalized resident/row tariff
        gereeZaaltTariff = finalTariff;

        const calculatedZaaltDun = (zoruuValue * finalTariff) + baseFeeUsed;

        // Get tariff tiers from geree.zardluud or building level
        let gereeZaaltZardal = null;
        if (geree.zardluud && Array.isArray(geree.zardluud)) {
          gereeZaaltZardal = geree.zardluud.find(
            (z) => z.zaalt === true && z.ner === zaaltZardal.ner && z.zardliinTurul === zaaltZardal.zardliinTurul
          );
        }
        const gereeZaaltTariffTiers = gereeZaaltZardal?.zaaltTariffTiers || zaaltZardal.zaaltTariffTiers || [];

        // Use base fee (Priority Excel > Global > 2000)
        const gereeZaaltDefaultDun = baseFeeUsed;

        // Calculate tiered pricing if zaaltTariffTiers is available
        let zaaltDun = 0;
        let usedTariff = gereeZaaltTariff;
        let usedTier = null;

        if (gereeZaaltTariffTiers && gereeZaaltTariffTiers.length > 0) {
          // Sort tiers by threshold (ascending)
          const sortedTiers = [...gereeZaaltTariffTiers].sort(
            (a, b) => (a.threshold || 0) - (b.threshold || 0)
          );

          // Find the appropriate tier based on zoruuValue (usage)
          for (const tier of sortedTiers) {
            if (zoruuValue <= (tier.threshold || Infinity)) {
              usedTariff = tier.tariff || gereeZaaltTariff;
              usedTier = tier;
              break;
            }
          }

          // If zoruuValue exceeds all tiers, use the last (highest) tier
          if (!usedTier && sortedTiers.length > 0) {
            const lastTier = sortedTiers[sortedTiers.length - 1];
            usedTariff = lastTier.tariff || gereeZaaltTariff;
            usedTier = lastTier;
          }

          zaaltDun = zoruuValue * usedTariff + gereeZaaltDefaultDun;
        } else {
          // Fallback to simple calculation if no tiers defined
          zaaltDun = zoruuValue * gereeZaaltTariff + gereeZaaltDefaultDun;
        }

        // Update geree with electricity readings
        geree.umnukhZaalt = umnu;
        geree.suuliinZaalt = niitOdoo;
        geree.zaaltTog = odor;
        geree.zaaltUs = shone;

        // Update or add electricity zardal in geree.zardluud
        if (!geree.zardluud || (Array.isArray(geree.zardluud) && geree.zardluud.length === 0)) {
          // If contract has no custom zardluud, initialize it with current building-level defaults
          // to prevent losing non-electricity charges (like waste disposal, maintenance etc.)
          // when the first custom zardal (electricity) is added to the contract.
          geree.zardluud = JSON.parse(JSON.stringify(zardluud || []));
        }

        // Find existing electricity zardal
        const existingZaaltIndex = geree.zardluud.findIndex(
          (z) => z.ner === zaaltZardal.ner && z.zardliinTurul === zaaltZardal.zardliinTurul
        );

        // Best Practice: Save tariff and calculation details for transparency and audit
        // Identify tariff type by ner (name) and zardliinTurul to distinguish different кВт tariff types
        const zaaltZardalData = {
          ner: zaaltZardal.ner, // Tariff name/identifier (e.g., "Цахилгаан - Байгаль", "Цахилгаан - Ажлын")
          turul: zaaltZardal.turul,
          zaalt: true, // Mark as electricity zardal
          zaaltTariff: gereeZaaltTariff, // Save tariff from geree (or building fallback)
          zaaltDefaultDun: gereeZaaltDefaultDun, // Save defaultDun from Excel input (separate from ashiglaltiinZardluud)
          zaaltTariffTiers: gereeZaaltTariffTiers.length > 0 ? gereeZaaltTariffTiers : undefined, // Save tiers from geree if available
          tariff: usedTariff, // кВт tariff rate used for calculation (from tier if applicable)
          tariffUsgeer: zaaltZardal.tariffUsgeer || "кВт",
          zardliinTurul: zaaltZardal.zardliinTurul, // Tariff type identifier (e.g., "Цахилгаан", "Цахилгаан - Өдөр", "Цахилгаан - Шөнө")
          barilgiinId: barilgiinId,
          dun: zaaltDun, // Final calculated amount
          // Save calculation details for transparency/audit
          zaaltCalculation: {
            umnukhZaalt: umnu, // Previous reading
            suuliinZaalt: niitOdoo, // Total now
            zaaltTog: odor, // Day reading
            zaaltUs: shone, // Night reading
            zoruu: zoruuValue, // Usage amount (Зөрүү) = Нийт (одоо) - Өмнө
            tariff: usedTariff, // кВт tariff rate used (from tier if applicable)
            tariffType: zaaltZardal.zardliinTurul, // Tariff type identifier to distinguish different кВт types
            tariffName: zaaltZardal.ner, // Tariff name to distinguish different кВт types
            defaultDun: gereeZaaltDefaultDun, // Default amount used (from Excel input, separate from ashiglaltiinZardluud)
            tier: usedTier ? { threshold: usedTier.threshold, tariff: usedTier.tariff } : null, // Tier used for calculation
            calculatedAt: new Date(), // When calculation was performed
          },
          bodokhArga: zaaltZardal.bodokhArga || "",
          tseverUsDun: zaaltZardal.tseverUsDun || 0,
          bokhirUsDun: zaaltZardal.bokhirUsDun || 0,
          usKhalaasniiDun: zaaltZardal.usKhalaasniiDun || 0,
          tsakhilgaanUrjver: zaaltZardal.tsakhilgaanUrjver || 1,
          tsakhilgaanChadal: zaaltZardal.tsakhilgaanChadal || 0,
          tsakhilgaanDemjikh: zaaltZardal.tsakhilgaanDemjikh || 0,
          suuriKhuraamj: zaaltZardal.suuriKhuraamj || 0,
          nuatNemekhEsekh: zaaltZardal.nuatNemekhEsekh || false,
          ognoonuud: zaaltZardal.ognoonuud || [],
        };

        if (existingZaaltIndex >= 0) {
          geree.zardluud[existingZaaltIndex] = zaaltZardalData;
        } else {
          geree.zardluud.push(zaaltZardalData);
        }

        // Recalculate niitTulbur (Total Amount)
        // IMPORTANT: Fallback to tariff if dun is not set (typical for fixed charges)
        const niitTulbur = geree.zardluud.reduce((sum, zardal) => {
          return sum + (zardal.dun || zardal.tariff || 0);
        }, 0);

        // Update geree with electricity readings using surgical update to prevent race conditions
        const updateFields = {
          umnukhZaalt: umnu,
          suuliinZaalt: niitOdoo,
          zaaltTog: odor,
          zaaltUs: shone,
          zardluud: geree.zardluud,
          niitTulbur: niitTulbur,
          ashiglaltiinZardal: niitTulbur
        };

        await Geree(tukhainBaaziinKholbolt).findByIdAndUpdate(
          geree._id,
          { $set: updateFields },
          { runValidators: false }
        );

        // Save to dedicated zaaltUnshlalt model for easier querying and export
        const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
        const zaaltUnshlalt = new ZaaltUnshlalt(tukhainBaaziinKholbolt)({
          gereeniiId: geree._id.toString(),
          gereeniiDugaar: gereeniiDugaar,
          toot: geree.toot || "",
          baiguullagiinId: baiguullaga._id.toString(),
          barilgiinId: barilgiinId,
          unshlaltiinOgnoo: new Date(ognoo), // Date from import request
          umnukhZaalt: umnu,
          suuliinZaalt: niitOdoo,
          zaaltTog: odor,
          zaaltUs: shone,
          zoruu: zoruuValue,
          zaaltZardliinId: zaaltZardal._id?.toString() || "",
          zaaltZardliinNer: zaaltZardal.ner,
          zaaltZardliinTurul: zaaltZardal.zardliinTurul,
          tariff: usedTariff,
          tariffUsgeer: zaaltZardal.tariffUsgeer || "кВт",
          defaultDun: gereeZaaltDefaultDun, // From Excel input
          usedTier: usedTier ? { threshold: usedTier.threshold, tariff: usedTier.tariff } : null,
          zaaltDun: zaaltDun,
          zaaltCalculation: {
            umnukhZaalt: umnu,
            suuliinZaalt: niitOdoo,
            zaaltTog: odor,
            zaaltUs: shone,
            zoruu: zoruuValue,
            tariff: usedTariff,
            tariffType: zaaltZardal.zardliinTurul,
            tariffName: zaaltZardal.ner,
            defaultDun: gereeZaaltDefaultDun, // From Excel input
            tier: usedTier ? { threshold: usedTier.threshold, tariff: usedTier.tariff } : null,
            calculatedAt: new Date(),
          },
          bodokhArga: zaaltZardal.bodokhArga || "",
          tseverUsDun: zaaltZardal.tseverUsDun || 0,
          bokhirUsDun: zaaltZardal.bokhirUsDun || 0,
          usKhalaasniiDun: zaaltZardal.usKhalaasniiDun || 0,
          tsakhilgaanUrjver: zaaltZardal.tsakhilgaanUrjver || 1,
          tsakhilgaanChadal: zaaltZardal.tsakhilgaanChadal || 0,
          tsakhilgaanDemjikh: zaaltZardal.tsakhilgaanDemjikh || 0,
          suuriKhuraamj: zaaltZardal.suuriKhuraamj || 0,
          nuatNemekhEsekh: zaaltZardal.nuatNemekhEsekh || false,
          ognoonuud: zaaltZardal.ognoonuud || [],
          importOgnoo: new Date(),
          importAjiltniiId: req.nevtersenAjiltniiToken?.id || "",
          importAjiltniiNer: req.nevtersenAjiltniiToken?.ner || "",
        });

        await zaaltUnshlalt.save();

        results.success.push({
          row: rowNumber,
          gereeniiDugaar: gereeniiDugaar,
          umnu: umnu,
          odor: odor,
          shone: shone,
          niitOdoo: niitOdoo,
          zoruu: zoruuValue,
          tariff: usedTariff,
          suuriKhuraamj: gereeZaaltDefaultDun,
          zaaltDun: zaaltDun,
        });
      } catch (error) {
        results.failed.push({
          row: rowNumber,
          gereeniiDugaar: row["Гэрээний дугаар"]?.toString().trim() || "",
          error: error.message || "Алдаа гарлаа",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Цахилгааны уншилт импорт хийгдлээ. Амжилттай: ${results.success.length}, Алдаатай: ${results.failed.length}`,
      results: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Export electricity readings data that has been imported
 * Shows all gerees with electricity readings in Excel format
 */
exports.zaaltExcelDataAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон");
    }

    if (!barilgiinId) {
      throw new aldaa("Барилгын ID хоосон");
    }

    const Baiguullaga = require("../models/baiguullaga");
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(baiguullagiinId);
    if (!baiguullaga) {
      throw new aldaa("Байгууллага олдсонгүй");
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullaga._id.toString()
    );
    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболт олдсонгүй");
    }

    // Get electricity readings from dedicated zaaltUnshlalt model
    const ZaaltUnshlalt = require("../models/zaaltUnshlalt");

    // Get all electricity readings for this building, sorted by contract number and date
    const zaaltUnshlaltuud = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
      .find({
        baiguullagiinId: baiguullaga._id.toString(),
        barilgiinId: barilgiinId,
      })
      .sort({ gereeniiDugaar: 1, unshlaltiinOgnoo: -1 }) // Latest reading first for each contract
      .lean();

    if (!zaaltUnshlaltuud || zaaltUnshlaltuud.length === 0) {
      throw new aldaa("Цахилгааны уншилтын мэдээлэл олдсонгүй");
    }

    // Get unique contracts (latest reading for each contract)
    // Prioritize by importOgnoo (when data was imported) or calculatedAt, then unshlaltiinOgnoo
    const latestReadings = new Map();
    zaaltUnshlaltuud.forEach((reading) => {
      const key = reading.gereeniiDugaar;
      const existing = latestReadings.get(key);

      if (!existing) {
        latestReadings.set(key, reading);
      } else {
        // Compare by importOgnoo first (most recent import), then calculatedAt, then unshlaltiinOgnoo
        const readingImportDate = reading.importOgnoo
          ? new Date(reading.importOgnoo)
          : (reading.zaaltCalculation?.calculatedAt ? new Date(reading.zaaltCalculation.calculatedAt) : new Date(reading.unshlaltiinOgnoo));
        const existingImportDate = existing.importOgnoo
          ? new Date(existing.importOgnoo)
          : (existing.zaaltCalculation?.calculatedAt ? new Date(existing.zaaltCalculation.calculatedAt) : new Date(existing.unshlaltiinOgnoo));

        if (readingImportDate > existingImportDate) {
          latestReadings.set(key, reading);
        }
      }
    });

    const gereenuud = Array.from(latestReadings.values());

    // Get building-level electricity zardal configuration
    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(barilgiinId)
    );
    if (!targetBarilga) {
      throw new aldaa("Барилга олдсонгүй");
    }

    const zardluud = targetBarilga.tokhirgoo?.ashiglaltiinZardluud || [];
    const zaaltZardluud = zardluud.filter((z) => z.zaalt === true);

    // Prioritize exact "Цахилгаан" match (no trailing space)
    let zaaltZardal = zaaltZardluud.find(
      (z) => z.ner && z.ner.trim() === "Цахилгаан"
    );

    // If no exact match, use first one
    if (!zaaltZardal && zaaltZardluud.length > 0) {
      zaaltZardal = zaaltZardluud[0];
    }

    // Fetch all gerees to get orshinSuugchId for each contract
    const Geree = require("../models/geree");
    const OrshinSuugch = require("../models/orshinSuugch");
    const uniqueGereeniiDugaaruud = [...new Set(gereenuud.map(r => r.gereeniiDugaar))];
    const gerees = await Geree(tukhainBaaziinKholbolt)
      .find({
        gereeniiDugaar: { $in: uniqueGereeniiDugaaruud },
        baiguullagiinId: baiguullaga._id.toString(),
        barilgiinId: barilgiinId,
      })
      .select("gereeniiDugaar orshinSuugchId")
      .lean();

    // Get all unique orshinSuugchIds
    const orshinSuugchIds = [...new Set(gerees.map(g => g.orshinSuugchId).filter(id => id))];

    // Fetch all orshinSuugch documents to get tsahilgaaniiZaalt (tariff)
    const orshinSuugchuud = await OrshinSuugch(db.erunkhiiKholbolt)
      .find({
        _id: { $in: orshinSuugchIds }
      })
      .select("_id tsahilgaaniiZaalt")
      .lean();

    // Create maps for quick lookup
    const gereeToOrshinSuugchMap = new Map();
    gerees.forEach((geree) => {
      if (geree.orshinSuugchId) {
        gereeToOrshinSuugchMap.set(geree.gereeniiDugaar, geree.orshinSuugchId);
      }
    });

    const orshinSuugchMap = new Map();
    orshinSuugchuud.forEach((orshinSuugch) => {
      orshinSuugchMap.set(orshinSuugch._id.toString(), orshinSuugch);
    });

    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Цахилгааны заалт");

    // Define columns
    worksheet.columns = [
      { header: "Гэрээний дугаар", key: "gereeniiDugaar", width: 20 },
      { header: "Тоот", key: "toot", width: 15 },
      { header: "Өмнө", key: "umnukhZaalt", width: 15 },
      { header: "Өдөр", key: "zaaltTog", width: 15 },
      { header: "Шөнө", key: "zaaltUs", width: 15 },
      { header: "Нийт (одоо)", key: "suuliinZaalt", width: 15 },
      { header: "Зөрүү", key: "zoruu", width: 15 },
      { header: "Цахилгаан кВт", key: "tariff", width: 15 },
      { header: "Суурь хураамж", key: "defaultDun", width: 15 },
      { header: "Төлбөр", key: "zaaltDun", width: 15 },
      { header: "Тооцоолсон огноо", key: "calculatedAt", width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add data rows from zaaltUnshlalt model
    gereenuud.forEach((reading) => {
      const umnukhZaalt = reading.umnukhZaalt || 0;
      const suuliinZaalt = reading.suuliinZaalt || 0;
      const zaaltTog = reading.zaaltTog || 0;
      const zaaltUs = reading.zaaltUs || 0;
      const zoruu = reading.zoruu || (suuliinZaalt - umnukhZaalt);

      // Get tariff from orshinSuugch.tsahilgaaniiZaalt ONLY (do NOT use zaaltZardal or ashiglaltiinZardluud)
      let tariff = 0;
      let defaultDun = 0;

      // Get orshinSuugchId from geree
      const orshinSuugchId = gereeToOrshinSuugchMap.get(reading.gereeniiDugaar);

      if (orshinSuugchId) {
        const orshinSuugch = orshinSuugchMap.get(orshinSuugchId);

        if (orshinSuugch && orshinSuugch.tsahilgaaniiZaalt !== undefined) {
          tariff = orshinSuugch.tsahilgaaniiZaalt || 0;
        }
      }

      // DO NOT fallback to zaaltZardal.zaaltTariff - tariff MUST come from orshinSuugch

      // defaultDun comes from Excel input ONLY (separate from ashiglaltiinZardluud)
      // For export, use the defaultDun from the calculation (which was saved from Excel during import)
      // DO NOT fallback to zaaltZardal.zaaltDefaultDun - it must come from Excel input
      if (reading.zaaltCalculation?.defaultDun) {
        defaultDun = reading.zaaltCalculation.defaultDun;
      } else if (reading.defaultDun) {
        // Fallback to reading.defaultDun (which should also be from Excel)
        defaultDun = reading.defaultDun;
      } else {
        // DO NOT use zaaltZardal.zaaltDefaultDun - defaultDun MUST come from Excel input
        defaultDun = 0;
      }

      // Always recalculate payment: (usage * tariff) + base fee
      // Formula: zaaltDun = zoruu * tariff + defaultDun
      const zaaltDun = (zoruu * tariff) + defaultDun;
      const calculatedAt = reading.zaaltCalculation?.calculatedAt
        ? new Date(reading.zaaltCalculation.calculatedAt).toLocaleString("mn-MN", {
          timeZone: "Asia/Ulaanbaatar",
        })
        : reading.unshlaltiinOgnoo
          ? new Date(reading.unshlaltiinOgnoo).toLocaleString("mn-MN", {
            timeZone: "Asia/Ulaanbaatar",
          })
          : "";

      worksheet.addRow({
        gereeniiDugaar: reading.gereeniiDugaar || "",
        toot: reading.toot || "",
        umnukhZaalt: umnukhZaalt,
        zaaltTog: zaaltTog,
        zaaltUs: zaaltUs,
        suuliinZaalt: suuliinZaalt,
        zoruu: zoruu,
        tariff: tariff,
        defaultDun: defaultDun,
        zaaltDun: zaaltDun,
        calculatedAt: calculatedAt,
      });
    });

    // Format number columns
    worksheet.getColumn("umnukhZaalt").numFmt = "0.00";
    worksheet.getColumn("zaaltTog").numFmt = "0.00";
    worksheet.getColumn("zaaltUs").numFmt = "0.00";
    worksheet.getColumn("suuliinZaalt").numFmt = "0.00";
    worksheet.getColumn("zoruu").numFmt = "0.00";
    worksheet.getColumn("tariff").numFmt = "0.00";
    worksheet.getColumn("defaultDun").numFmt = "#,##0";
    worksheet.getColumn("zaaltDun").numFmt = "#,##0";

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      if (column.width) {
        column.width = Math.max(column.width, 12);
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="zaalt_data_${Date.now()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});
