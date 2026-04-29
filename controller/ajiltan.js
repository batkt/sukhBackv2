const asyncHandler = require("express-async-handler");
const Ajiltan = require("../models/ajiltan");
const Baiguullaga = require("../models/baiguullaga");
const NevtreltiinTuukh = require("../models/nevtreltiinTuukh");
const IpTuukh = require("../models/ipTuukh");
const BackTuukh = require("../models/backTuukh");
const Geree = require("../models/geree");
const aldaa = require("../components/aldaa");
const jwt = require("jsonwebtoken");
const request = require("request");
const axios = require("axios");
const fs = require("fs");
const moment = require("moment");
const useragent = require("express-useragent");
const http = require("http");
const lodash = require("lodash");
const { formatNumber, tokenShalgakh } = require("zevbackv2");
const session = require("../models/session");

function duusakhOgnooAvya(ugugdul, onFinish, next) {
  request.get(
    "http://103.143.40.123:8282/baiguullagiinDuusakhKhugatsaaAvya",
    { json: true, body: ugugdul },
    (err, res1, body) => {
      if (err) next(err);
      else {
        onFinish(body);
      }
    },
  );
}

async function nevtreltiinTuukhKhadgalya(tuukh, tukhainBaaziinKholbolt) {
  var ipTuukh = await IpTuukh(tukhainBaaziinKholbolt).findOne({ ip: tuukh.ip });
  if (ipTuukh) {
    tuukh.bairshilUls = ipTuukh.bairshilUls;
    tuukh.bairshilKhot = ipTuukh.bairshilKhot;
  } else if (tuukh.ip) {
    try {
      var axiosKhariu = await axios.get(
        "https://api.ipgeolocation.io/ipgeo?apiKey=8ee349f1c7304c379fdb6b855d1e9df4&ip=" +
          tuukh.ip.toString(),
      );
      ipTuukh = new IpTuukh(tukhainBaaziinKholbolt)();
      ipTuukh.ognoo = new Date();
      ipTuukh.medeelel = axiosKhariu.data;
      ipTuukh.bairshilUls = axiosKhariu.data.country_name;
      ipTuukh.bairshilKhot = axiosKhariu.data.city;
      ipTuukh.ip = tuukh.ip;
      tuukh.bairshilUls = ipTuukh.bairshilUls;
      tuukh.bairshilKhot = ipTuukh.bairshilKhot;
      await ipTuukh.save();
    } catch (err) {}
  }
  await tuukh.save();
}

exports.ajiltanNevtrey = asyncHandler(async (req, res, next) => {
  console.log("Энэ рүү орлоо");

  const io = req.app.get("socketio");
  const { db } = require("zevbackv2");

  const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
    .findOne()
    .select("+nuutsUg")
    .where("nevtrekhNer")
    .equals(req.body.nevtrekhNer)
    .catch((err) => {
      next(err);
    });

  if (!ajiltan) {
    throw new aldaa("Хэрэглэгчийн нэр эсвэл нууц үг буруу байна!");
  }

  var ok = await ajiltan.passwordShalgaya(req.body.nuutsUg);

  if (!ok) {
    throw new aldaa("Хэрэглэгчийн нэр эсвэл нууц үг буруу байна!");
  }
  var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
    ajiltan.baiguullagiinId,
  );

  var butsaakhObject = {
    result: ajiltan,
    success: true,
  };
  if (ajiltan.nevtrekhNer !== "CAdmin1") {
    io.emit(`ajiltan${ajiltan._id}`, {
      ip: req.headers["x-real-ip"],
      type: "logout",
    });
  }

  duusakhOgnooAvya(
    { register: baiguullaga.register, system: process.env.SYSTEM_NAME },
    async (khariu) => {
      try {
        if (khariu.success) {
          if (!!khariu.salbaruud) {
            var butsaakhSalbaruud = [];
            butsaakhSalbaruud.push({
              salbariinId: baiguullaga?.barilguud?.[0]?._id,
              duusakhOgnoo: khariu.duusakhOgnoo,
            });
            for await (const salbar of khariu.salbaruud) {
              var tukhainSalbar = baiguullaga?.barilguud?.find((x) => {
                return (
                  !!x.licenseRegister && x.licenseRegister == salbar.register
                );
              });
              if (!!tukhainSalbar) {
                butsaakhSalbaruud.push({
                  salbariinId: tukhainSalbar._id,
                  duusakhOgnoo: salbar.license?.duusakhOgnoo,
                });
              }
            }
            butsaakhObject.salbaruud = butsaakhSalbaruud;
          }
          const jwt = await ajiltan.tokenUusgeye(
            khariu.duusakhOgnoo,
            butsaakhObject.salbaruud,
          );

          butsaakhObject.duusakhOgnoo = khariu.duusakhOgnoo;
          if (!!butsaakhObject.result) {
            butsaakhObject.result = JSON.parse(
              JSON.stringify(butsaakhObject.result),
            );
            butsaakhObject.result.salbaruud = butsaakhObject.salbaruud;
            butsaakhObject.result.duusakhOgnoo = khariu.duusakhOgnoo;
          }
          butsaakhObject.token = jwt;

          // Create session for single session policy
          try {
            await exports.sessionUusgekh(
              jwt,
              ajiltan._id.toString(),
              ajiltan.baiguullagiinId,
              req,
            );
          } catch (sessionError) {
            console.error("Session creation failed:", sessionError);
            // Continue even if session creation fails
          }

          //doorxiig zogsooliinPos-d zoriulj oruulaw
          if (!!baiguullaga?.tokhirgoo?.zogsoolNer)
            butsaakhObject.result.zogsoolNer =
              baiguullaga?.tokhirgoo?.zogsoolNer;
          else butsaakhObject.result.zogsoolNer = baiguullaga.ner;
          var source = req.headers["user-agent"];
          var ua = useragent.parse(source);
          var tuukh = new NevtreltiinTuukh(db.erunkhiiKholbolt)();
          tuukh.ajiltniiId = ajiltan._id;
          tuukh.ajiltniiNer = ajiltan.ner;
          tuukh.ognoo = new Date();
          tuukh.uildliinSystem = ua.os;
          tuukh.ip = req.headers["x-real-ip"];
          if (tuukh.ip && tuukh.ip.substr(0, 7) == "::ffff:") {
            tuukh.ip = tuukh.ip.substr(7);
          }
          ua = Object.keys(ua).reduce(function (r, e) {
            if (ua[e]) r[e] = ua[e];
            return r;
          }, {});
          tuukh.browser = ua.browser;
          tuukh.useragent = ua;
          tuukh.baiguullagiinId = ajiltan.baiguullagiinId;
          tuukh.baiguullagiinRegister = baiguullaga.register;
          await nevtreltiinTuukhKhadgalya(tuukh, db.erunkhiiKholbolt);

          res.status(200).json(butsaakhObject);
        } else {
          throw new Error(khariu.msg);
        }
      } catch (err) {
        next(err);
      }
    },
    next,
  );
});

async function khuuBodyo(dun, khuu) {
  var khuugiinNiitDun =
    (await Math.round((dun * khuu + Number.EPSILON) * 100)) / 100;
  return (
    (await Math.round((khuugiinNiitDun / 365 + Number.EPSILON) * 100)) / 100
  );
}

exports.backAvya = asyncHandler(async (req, res, next) => {
  try {
    var tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const { exec } = require("child_process");
    try {
      fs.unlinkSync("dump.tar");
    } catch (err) {
      throw err;
    }
    const { db } = require("zevbackv2");
    var backupDB = exec(
      "mongodump --host=" +
        "localhost" +
        " --port=" +
        "27017" +
        " --db=" +
        tukhainBaaziinKholbolt.baaziinNer +
        " --archive=dump.tar" +
        "  --gzip",
      (err, stdout, stderr) => {
        if (err) {
          res.send(err);
        }
        if (stdout) {
          if (stdout.includes("error"))
            res.send(new Error("Back авах боломжгүй байна!"));
          else {
            if (!fs.existsSync("file/tmp/dump.tar"))
              res.send(new Error("Back авах боломжгүй байна!"));
            var path = require("path");
            res.sendFile(path.resolve("file/tmp/dump.tar"), function (err) {
              if (err) {
                next(err);
              } else {
                next();
              }
            });
          }
        }
        if (stderr) {
          if (stderr.includes("error"))
            res.send(new Error("Back авах боломжгүй байна!"));
          else {
            if (!fs.existsSync("dump.tar"))
              res.send(new Error("Back авах боломжгүй байна!"));
            var path = require("path");
            var stats = fs.statSync("dump.tar");
            var fileSizeInBytes = stats.size;
            var fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
            var source = req.headers["user-agent"];
            var ua = useragent.parse(source);
            var tuukh = new BackTuukh(db.erunkhiiKholbolt)();
            tuukh.ajiltniiId = req.body.nevtersenAjiltniiToken.id;
            tuukh.ajiltniiNer = req.body.nevtersenAjiltniiToken.ner;
            tuukh.ognoo = new Date();
            tuukh.ip = req.ip;
            if (tuukh.ip.substr(0, 7) == "::ffff:") {
              tuukh.ip = tuukh.ip.substr(7);
            }
            ua = Object.keys(ua).reduce(function (r, e) {
              if (ua[e]) r[e] = ua[e];
              return r;
            }, {});
            tuukh.useragent = ua;
            tuukh.khemjee = fileSizeInMegabytes;
            tuukh.baiguullagiinId = req.body.baiguullagiinId;
            tuukh.save();
            res.sendFile(path.resolve("dump.tar"), function (err) {
              if (err) {
                next(err);
              } else {
                next();
              }
            });
          }
        }
      },
    );
  } catch (error) {
    next(error);
  }
});

exports.tokenoorAjiltanAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    const token = req.headers.authorization.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    let tokenObject;
    try {
      tokenObject = jwt.verify(token, process.env.APP_SECRET);
    } catch (jwtError) {
      console.error("❌ JWT Verification Error:", jwtError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        error: jwtError.message,
      });
    }

    if (tokenObject.id == "zochin") {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    Ajiltan(db.erunkhiiKholbolt)
      .findById(tokenObject.id)
      .then((urDun) => {
        if (!urDun) {
          return res.status(404).json({
            success: false,
            message: "Хэрэглэгч олдсонгүй",
          });
        }
        var urdunJson = urDun.toJSON();
        urdunJson.duusakhOgnoo = tokenObject.duusakhOgnoo;
        urdunJson.salbaruud = tokenObject.salbaruud;
        res.send(urdunJson);
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

exports.nuutsUgShalgakhAjiltan = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
      .findById(req.body.id)
      .select("+nuutsUg");
    const ok = await ajiltan.passwordShalgaya(req.body.nuutsUg);
    if (ok) res.send({ success: true });
    else
      res.send({
        success: false,
        message: "Хэрэглэгчийн одоо ашиглаж буй нууц үг буруу байна!",
      });
  } catch (error) {
    next(error);
  }
});

exports.zochiniiTokenAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var zochin = new Ajiltan(db.erunkhiiKholbolt)();
    res.send(zochin.zochinTokenUusgye(req.params.baiguullagiinId));
  } catch (error) {
    next(error);
  }
});

exports.khugatsaaguiTokenAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    const token = req.headers.authorization.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    let tokenObject;
    try {
      tokenObject = jwt.verify(token, process.env.APP_SECRET);
    } catch (jwtError) {
      console.error("❌ JWT Verification Error:", jwtError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        error: jwtError.message,
      });
    }

    if (tokenObject.id == "zochin") {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    Ajiltan(db.erunkhiiKholbolt)
      .findById(tokenObject.id)
      .then(async (urDun) => {
        const jwt = await urDun.khugatsaaguiTokenUusgeye();
        res.send(jwt);
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

exports.erkhiinMedeelelAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      req.body.baiguullagiinId,
    );
    if (!baiguullaga) throw new Error("Байгууллагын мэдээлэл олдсонгүй!");
    request.post(
      "http://103.143.40.123:8282/erkhiinMedeelelAvya",
      {
        json: true,
        body: {
          system: process.env.SYSTEM_NAME,
          register: baiguullaga.register,
        },
      },
      (err, res1, body) => {
        if (err) next(err);
        else {
          res.send(body);
        }
      },
    );
  } catch (error) {
    next(error);
  }
});

function msgIlgeeye(
  jagsaalt,
  key,
  dugaar,
  khariu,
  index,
  tukhainBaaziinKholbolt,
  baiguullagiinId,
) {
  try {
    url =
      process.env.MSG_SERVER +
      "/send" +
      "?key=" +
      key +
      "&from=" +
      dugaar +
      "&to=" +
      jagsaalt[index].to.toString() +
      "&text=" +
      jagsaalt[index].text.toString();
    url =
      process.env.MSG_SERVER +
      "/send" +
      "?key=" +
      key +
      "&from=" +
      dugaar +
      "&to=" +
      jagsaalt[index].to.toString() +
      "&text=" +
      jagsaalt[index].text.toString();
    url = encodeURI(url);
    request(url, { json: true }, (err1, res1, body) => {
      if (err1) {
        next(err1);
      } else {
        var msg = new MsgTuukh(tukhainBaaziinKholbolt)();
        msg.baiguullagiinId = baiguullagiinId;
        msg.dugaar = jagsaalt[index].to;
        msg.gereeniiId = jagsaalt[index].gereeniiId;
        msg.msg = jagsaalt[index].text;
        msg.msgIlgeekhKey = key;
        msg.msgIlgeekhDugaar = dugaar;
        msg.save();
        if (jagsaalt.length > index + 1) {
          khariu.push(body[0]);
          msgIlgeeye(
            jagsaalt,
            key,
            dugaar,
            khariu,
            index + 1,
            tukhainBaaziinKholbolt,
            baiguullagiinId,
          );
        } else {
          khariu.push(body[0]);
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

async function orchuulya(text) {
  text = text.toString();
  var butsaakhText = "";
  for (let i = 0; i < text.length; i++) {
    switch (text[i]) {
      case "А":
        butsaakhText = butsaakhText + "A";
        break;
      case "Б":
        butsaakhText = butsaakhText + "B";
        break;
      case "В":
        butsaakhText = butsaakhText + "V";
        break;
      case "Г":
        butsaakhText = butsaakhText + "G";
        break;
      case "Д":
        butsaakhText = butsaakhText + "D";
        break;
      case "Е":
        butsaakhText = butsaakhText + "Ye";
        break;
      case "Ё":
        butsaakhText = butsaakhText + "Yo";
        break;
      case "Ж":
        butsaakhText = butsaakhText + "J";
        break;
      case "З":
        butsaakhText = butsaakhText + "Z";
        break;
      case "И":
      case "Й":
        butsaakhText = butsaakhText + "I";
        break;
      case "К":
        butsaakhText = butsaakhText + "K";
        break;
      case "Л":
        butsaakhText = butsaakhText + "L";
        break;
      case "М":
        butsaakhText = butsaakhText + "M";
        break;
      case "Н":
        butsaakhText = butsaakhText + "N";
        break;
      case "О":
        butsaakhText = butsaakhText + "O";
        break;
      case "Ө":
        butsaakhText = butsaakhText + "U";
        break;
      case "П":
        butsaakhText = butsaakhText + "P";
        break;
      case "Р":
        butsaakhText = butsaakhText + "R";
        break;
      case "С":
        butsaakhText = butsaakhText + "S";
        break;
      case "​Т":
        butsaakhText = butsaakhText + "T";
        break;
      case "У":
      case "Ү":
        butsaakhText = butsaakhText + "U";
        break;
      case "Ф":
        butsaakhText = butsaakhText + "F";
        break;
      case "Х":
        butsaakhText = butsaakhText + "H";
        break;
      case "Ц":
        butsaakhText = butsaakhText + "Ts";
        break;
      case "Ч":
        butsaakhText = butsaakhText + "Ch";
        break;
      case "Ш":
        butsaakhText = butsaakhText + "Sh";
        break;
      case "Ь":
        butsaakhText = butsaakhText + "i";
        break;
      case "Ы":
        butsaakhText = butsaakhText + "ii";
        break;
      case "Э":
        butsaakhText = butsaakhText + "E";
        break;
      case "Ю":
        butsaakhText = butsaakhText + "Yu";
      case "Я":
        butsaakhText = butsaakhText + "Ya";
        break;
      case "а":
        butsaakhText = butsaakhText + "a";
        break;
      case "б":
        butsaakhText = butsaakhText + "b";
        break;
      case "в":
        butsaakhText = butsaakhText + "v";
        break;
      case "г":
        butsaakhText = butsaakhText + "g";
        break;
      case "д":
        butsaakhText = butsaakhText + "d";
        break;
      case "е":
        butsaakhText = butsaakhText + "ye";
        break;
      case "ё":
        butsaakhText = butsaakhText + "yo";
        break;
      case "ж":
        butsaakhText = butsaakhText + "j";
        break;
      case "з":
        butsaakhText = butsaakhText + "z";
        break;
      case "и":
      case "й":
        butsaakhText = butsaakhText + "i";
        break;
      case "к":
        butsaakhText = butsaakhText + "k";
        break;
      case "л":
        butsaakhText = butsaakhText + "l";
        break;
      case "м":
        butsaakhText = butsaakhText + "m";
        break;
      case "н":
        butsaakhText = butsaakhText + "n";
        break;
      case "о":
        butsaakhText = butsaakhText + "o";
        break;
      case "ө":
        butsaakhText = butsaakhText + "u";
        break;
      case "п":
        butsaakhText = butsaakhText + "p";
        break;
      case "р":
        butsaakhText = butsaakhText + "r";
        break;
      case "с":
        butsaakhText = butsaakhText + "s";
        break;
      case "т":
        butsaakhText = butsaakhText + "t";
        break;
      case "у":
      case "ү":
        butsaakhText = butsaakhText + "u";
        break;
      case "ф":
        butsaakhText = butsaakhText + "f";
        break;
      case "х":
        butsaakhText = butsaakhText + "kh";
        break;
      case "ц":
        butsaakhText = butsaakhText + "ts";
        break;
      case "ч":
        butsaakhText = butsaakhText + "ch";
        break;
      case "ш":
        butsaakhText = butsaakhText + "sh";
        break;
      case "ь":
        butsaakhText = butsaakhText + "i";
        break;
      case "ы":
        butsaakhText = butsaakhText + "ii";
        break;
      case "э":
        butsaakhText = butsaakhText + "e";
        break;
      case "ю":
        butsaakhText = butsaakhText + "yu";
      case "я":
        butsaakhText = butsaakhText + "ya";
        break;
      default:
        butsaakhText = butsaakhText + text[i];
        break;
    }
  }
  return butsaakhText;
}

exports.orlogiinMsgIlgeeye = asyncHandler(
  async (tsag, baiguullagiinId = null) => {
    try {
      const { db } = require("zevbackv2");
      var msgIlgeekhKey = "aa8e588459fdd9b7ac0b809fc29cfae3";
      var msgIlgeekhDugaar = "72002002";
      var baiguullaguud;
      if (!!baiguullagiinId) {
        baiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).findById(
          baiguullagiinId,
        );
        baiguullaguud = [baiguullaguud];
      } else {
        baiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).find({
          "tokhirgoo.msgAvakhTurul": {
            $exists: true,
          },
          "tokhirgoo.msgAvakhDugaar.0": {
            $exists: true,
          },
          "tokhirgoo.msgAvakhTsag": tsag,
        });
      }
      var ekhlekhOgnoo = new Date(
        Date.now() - (tsag == "20:00" || tsag == "22:00" ? 0 : 86400000),
      );
      var duusakhOgnoo = new Date(
        Date.now() - (tsag == "20:00" || tsag == "22:00" ? 0 : 86400000),
      );
      ekhlekhOgnoo.setHours(0, 0, 0, 0);
      duusakhOgnoo.setHours(23, 59, 59, 999);
      for await (const baiguullaga of baiguullaguud) {
        try {
          var kholboltuud = db.kholboltuud;
          var kholbolt = kholboltuud.find(
            (a) => a.baiguullagiinId == baiguullaga._id.toString(),
          );
          var textuud = [];
          if (
            baiguullaga.tokhirgoo.msgAvakhTurul == "dans" ||
            baiguullaga.tokhirgoo.msgAvakhTurul == "bugd"
          ) {
            var text = "";
            let query = [
              {
                $match: {
                  $or: [
                    {
                      $and: [
                        {
                          TxDt: {
                            $gte: ekhlekhOgnoo,
                            $lte: duusakhOgnoo,
                          },
                        },
                        {
                          Amt: {
                            $gt: 0,
                          },
                        },
                      ],
                    },
                    {
                      $and: [
                        {
                          tranDate: {
                            $gte: ekhlekhOgnoo,
                            $lte: duusakhOgnoo,
                          },
                        },
                        {
                          amount: {
                            $gt: 0,
                          },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                $project: {
                  barilgiinId: "$barilgiinId",
                  dun: { $ifNull: ["$Amt", "$amount"] },
                },
              },
              {
                $group: {
                  _id: "$barilgiinId",
                  dun: {
                    $sum: "$dun",
                  },
                },
              },
            ];
            var result = await BankniiGuilgee(kholbolt, true).aggregate(query);
            if (result && result.length > 0) {
              var niitDun = lodash.sumBy(result, function (object) {
                return object.dun;
              });
              var text =
                "Rently systemd " +
                moment(ekhlekhOgnoo).format("MM/DD") +
                " udur " +
                (await formatNumber(niitDun)) +
                " orlogo burtgegdej ";

              for await (const a of result) {
                var barilgiinNer = "";
                try {
                  barilgiinNer = baiguullaga.barilguud.find(
                    (x) => x._id == a._id,
                  ).ner;
                } catch (aldaa) {}
                barilgiinNer = await orchuulya(barilgiinNer);
                text =
                  text +
                  barilgiinNer +
                  " - " +
                  (await formatNumber(a.dun)) +
                  ", ";
              }
              text = text.slice(0, -2);
              text = text + " tus tus orlogo orson baina.";
              textuud.push(text);
            }
          }
          if (
            baiguullaga.tokhirgoo.msgAvakhTurul == "system" ||
            baiguullaga.tokhirgoo.msgAvakhTurul == "bugd"
          ) {
            var text = "";
            var togloom = await TogloomiinTuv(kholbolt).aggregate([
              {
                $match: {
                  baiguullagiinId: baiguullaga._id.toString(),
                  ognoo: {
                    $gte: ekhlekhOgnoo,
                    $lte: duusakhOgnoo,
                  },
                  tuluv: {
                    $ne: -1,
                  },
                },
              },
              {
                $unwind: "$niitTulbur",
              },
              {
                $match: {
                  "niitTulbur.turul": { $nin: ["khariult", "khungulult"] },
                },
              },
              {
                $group: {
                  _id: "niit",
                  niitDun: {
                    $sum: "$niitTulbur.dun",
                  },
                },
              },
            ]);
            var zogsool = await Uilchluulegch(kholbolt, true).aggregate([
              {
                $match: {
                  baiguullagiinId: baiguullaga._id.toString(),
                },
              },
              {
                $unwind: "$tuukh",
              },
              {
                $unwind: "$tuukh.tulbur",
              },
              {
                $match: {
                  "tuukh.tulbur.ognoo": {
                    $gte: ekhlekhOgnoo,
                    $lte: duusakhOgnoo,
                  },
                },
              },
              {
                $group: {
                  _id: "niit",
                  niitDun: {
                    $sum: "$tuukh.tulbur.dun",
                  },
                },
              },
            ]);
            var sukh = await Geree(kholbolt, true).aggregate([
              {
                $match: {
                  baiguullagiinId: baiguullaga._id.toString(),
                  tuluv: {
                    $ne: -1,
                  },
                },
              },
              {
                $unwind: {
                  path: "$avlaga.guilgeenuud",
                },
              },
              {
                $match: {
                  "avlaga.guilgeenuud.ognoo": {
                    $gte: new Date(ekhlekhOgnoo),
                    $lte: new Date(duusakhOgnoo),
                  },
                  "avlaga.guilgeenuud.turul": {
                    $in: ["bank", "qpay"],
                  },
                },
              },
              {
                $group: {
                  _id: "niit",
                  niitDun: {
                    $sum: "$avlaga.guilgeenuud.tulsunDun",
                  },
                },
              },
            ]);
            var zurchiluud = [];
            if (baiguullaga.tokhirgoo.zurchulMsgeerSanuulakh) {
              zurchiluud = await ZurchilteiMashin(kholbolt).aggregate([
                {
                  $match: {
                    baiguullagiinId: baiguullaga._id.toString(),
                    tuluv: { $ne: 1 },
                  },
                },
                {
                  $group: {
                    _id: "niit",
                    niitDun: {
                      $sum: "$niitDun",
                    },
                  },
                },
              ]);
            }
            if (
              (togloom && togloom.length > 0) ||
              (zogsool && zogsool.length > 0) ||
              (sukh && sukh.length > 0) ||
              (zurchiluud && zurchiluud.length > 0)
            ) {
              text = moment(ekhlekhOgnoo).format("MM/DD") + " udur ";
              if (togloom && togloom.length > 0) {
                text =
                  text +
                  "Togloom-" +
                  (await formatNumber(togloom[0].niitDun)) +
                  ",";
              }
              if (zogsool && zogsool.length > 0) {
                text =
                  text +
                  "Zogsool-" +
                  (await formatNumber(zogsool[0].niitDun)) +
                  ",";
              }
              if (sukh && sukh.length > 0) {
                text =
                  text + "sukh-" + (await formatNumber(sukh[0].niitDun)) + ",";
              }
              text = text + " orlogo orson baina.";
              if (
                baiguullaga?.tokhirgoo?.zurchulMsgeerSanuulakh &&
                zurchiluud?.length > 0
              )
                text =
                  text +
                  " Zurchiltei- " +
                  (await formatNumber(zurchiluud[0].niitDun)) +
                  " avlaga uussen baina. ";
              if (zogsool && zogsool.length > 0 && zogsool[0].niitDun > 0) {
                const shineSession = new session(db.erunkhiiKholbolt)();
                const gishuun = new Ajiltan(kholbolt)();
                shineSession.sessionToken = await gishuun.zochinTokenUusgye(
                  baiguullaga._id.toString(),
                  true,
                );
                await shineSession
                  .save()
                  .then((khadgalsanSession) => {
                    const dynamicUrl = `https://turees.zevtabs.mn/khyanalt/zg/${khadgalsanSession._id}`;
                    text += `Holboosoor orno uu: ${dynamicUrl}`;
                  })
                  .catch((error) => {
                    throw error;
                  });
              }
              textuud.push(text);
            }
          }
          // TEMPORARILY DISABLED: Scheduled SMS notifications
          // if (textuud.length > 0) {
          //   var ilgeexList = [];
          //   for await (const dugaar of baiguullaga.tokhirgoo.msgAvakhDugaar)
          //     for await (const text of textuud)
          //       ilgeexList.push({ to: dugaar, text });
          //   /*[{
          //   to: "88880140",
          //   text,
          // },
          // {
          //   to: "88889501",
          //   text,
          // },
          // {
          //   to: "88043808",
          //   text,
          // }];*/
          //   msgIlgeeye(
          //     ilgeexList,
          //     msgIlgeekhKey,
          //     msgIlgeekhDugaar,
          //     [],
          //     0,
          //     db.erunkhiiKholbolt,
          //     baiguullaga._id
          //   );
          // }
        } catch (aldaaa) {
          continue;
        }
      }
    } catch (error) {}
  },
);

exports.baiguullagaIdgaarAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      req.body.baiguullagiinId,
    );
    if (!baiguullaga) throw new Error("Байгууллагын мэдээлэл олдсонгүй!");
    res.send(baiguullaga);
  } catch (error) {
    next(error);
  }
});

exports.licenseOgnooShalgakh = asyncHandler(
  async (io, baiguullagiinId = null) => {
    try {
      const { db } = require("zevbackv2");
      var kholboltuud = db.kholboltuud;
      if (!!baiguullagiinId)
        kholboltuud = [
          kholboltuud.find((a) => a.baiguullagiinId == baiguullagiinId),
        ];
      if (kholboltuud) {
        for await (const kholbolt of kholboltuud) {
          var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            kholbolt.baiguullagiinId,
          );
          if (!!baiguullaga && !!baiguullaga.register) {
            duusakhOgnooAvya(
              { register: baiguullaga.register, system: "Turees" },
              async (khariu) => {
                try {
                  if (khariu.success) {
                    var odooOgnoo = new Date();
                    odooOgnoo.setHours(23, 59, 59, 0);
                    if (
                      io &&
                      moment(odooOgnoo).isSameOrAfter(
                        moment(khariu.duusakhOgnoo),
                      )
                    )
                      io.emit(`autoLogout${baiguullagiinId}`, khariu);
                  }
                } catch (err) {}
              },
            );
          }
        }
      }
    } catch (error) {
      if (next) next(error);
    }
  },
);

// Session management functions
exports.ajiltanGaraa = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    let tokenObject;
    try {
      tokenObject = jwt.verify(token, process.env.APP_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (tokenObject.id === "zochin") {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    // Invalidate all sessions for this user
    await session(db.erunkhiiKholbolt).updateMany(
      {
        ajiltanId: tokenObject.id,
        isActive: true,
      },
      {
        isActive: false,
        updatedAt: new Date(),
      },
    );

    res.json({
      success: true,
      message: "Амжилттай гарлаа!",
    });
  } catch (error) {
    next(error);
  }
});

exports.sessionUusgekh = asyncHandler(
  async (token, ajiltanId, baiguullagiinId, req) => {
    try {
      const { db } = require("zevbackv2");
      const Session = session(db.erunkhiiKholbolt);

      // Invalidate old sessions for this user (single session policy)
      await Session.updateMany(
        {
          ajiltanId: ajiltanId,
          isActive: true,
        },
        {
          isActive: false,
          updatedAt: new Date(),
        },
      );

      // Get device info
      const source = req.headers["user-agent"];
      const ua = useragent.parse(source);
      const ip = req.headers["x-real-ip"] || req.ip;
      if (ip && ip.substr(0, 7) == "::ffff:") {
        ip.substr(7);
      }

      // Create new session
      const newSession = new Session({
        sessionToken: token,
        ajiltanId: ajiltanId,
        baiguullagiinId: baiguullagiinId,
        deviceInfo: {
          userAgent: source,
          ip: ip,
          platform: ua.platform,
          browser: ua.browser,
        },
        lastAccessedAt: new Date(),
      });

      await newSession.save();
      return newSession;
    } catch (error) {
      console.error("Session creation error:", error);
      throw error;
    }
  },
);

exports.sessionShalgakh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");

    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: "Энэ үйлдлийг хийх эрх байхгүй байна!",
      });
    }

    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    // Check if session exists and is active
    const activeSession = await session(db.erunkhiiKholbolt).findOne({
      sessionToken: token,
      isActive: true,
    });

    if (!activeSession) {
      return res.status(401).json({
        success: false,
        message: "Session идэвхгүй байна. Дахин нэвтэрнэ үү!",
      });
    }

    // Update last accessed time
    await session(db.erunkhiiKholbolt).updateOne(
      { _id: activeSession._id },
      { lastAccessedAt: new Date() },
    );

    next();
  } catch (error) {
    next(error);
  }
});
