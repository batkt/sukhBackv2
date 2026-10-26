const Baiguullaga = require("../models/baiguullaga");
const { zogsoolNiitDungeerEbarimtShivye } = require("../routes/ebarimtRoute");
const { msgIlgeeye } = require("./orshinSuugch");
const {
  Mashin: ParkingMashin,
  Parking,
  Uilchluulegch,
  zogsooliinDunAvya,
  sdkData,
} = require("sukhParking-v1");
const moment = require("moment");
const got = require("got");
const FormData = require("form-data");
const asyncHandler = require("express-async-handler");

module.exports.khungulultKhugatsaaShinechlyaSar =
  async function khungulultKhugatsaaShinechlyaSar() {
    const { db } = require("zevbackv2");
    const kholboltuud = db.kholboltuud;
    if (kholboltuud) {
      for await (const kholbolt of kholboltuud) {
        const mashinuud = await ParkingMashin(kholbolt).find({
          turul: "Түрээслэгч",
          khungulultTurul: "togtmolTsag",
          tsagiinTurul: "Сараар",
        });
        var bulkOps = [];
        if (mashinuud?.length > 0) {
          mashinuud.forEach((mashin) => {
            if (
              mashin.turul === "Түрээслэгч" &&
              (mashin.tuluv === "Хөнгөлөлттэй" ||
                mashin.nemeltTuluv === "Хөнгөлөлттэй") &&
              mashin.khungulultTurul === "togtmolTsag" &&
              mashin.tsagiinTurul === "Сараар"
            ) {
              mashin.uldegdelKhungulukhKhugatsaa = mashin.khungulukhKhugatsaa;
              mashin.khungulujEkhlesenOgnoo = moment();
              var updateOperation = {
                updateOne: {
                  filter: { _id: mashin._id },
                  update: {
                    $set: {
                      uldegdelKhungulukhKhugatsaa: mashin.khungulukhKhugatsaa,
                      khungulujEkhlesenOgnoo: mashin.khungulujEkhlesenOgnoo,
                    },
                  },
                },
              };
              bulkOps.push(updateOperation);
            }
          });
        }
        if (bulkOps.length > 0) {
          await ParkingMashin(kholbolt).bulkWrite(bulkOps);
        }
      }
    }
  };

module.exports.khungulultKhugatsaaShinechlyaUdur =
  async function khungulultKhugatsaaShinechlyaUdur() {
    const { db } = require("zevbackv2");
    const kholboltuud = db.kholboltuud;
    if (kholboltuud) {
      for await (const kholbolt of kholboltuud) {
        const mashinuud = await ParkingMashin(kholbolt).find({
          turul: "Түрээслэгч",
          khungulultTurul: "togtmolTsag",
          tsagiinTurul: "Өдрөөр",
        });
        var bulkOps = [];
        mashinuud.forEach((mashin) => {
          if (
            mashin.turul === "Түрээслэгч" &&
            (mashin.tuluv === "Хөнгөлөлттэй" ||
              mashin.nemeltTuluv === "Хөнгөлөлттэй") &&
            mashin.khungulultTurul === "togtmolTsag" &&
            mashin.tsagiinTurul === "Өдрөөр"
          ) {
            mashin.uldegdelKhungulukhKhugatsaa = mashin.khungulukhKhugatsaa;
            mashin.khungulujEkhlesenOgnoo = moment();
            var updateOperation = {
              updateOne: {
                filter: { _id: mashin._id },
                update: {
                  $set: {
                    uldegdelKhungulukhKhugatsaa: mashin.khungulukhKhugatsaa,
                    khungulujEkhlesenOgnoo: mashin.khungulujEkhlesenOgnoo,
                  },
                },
              },
            };
            bulkOps.push(updateOperation);
          }
        });
        if (bulkOps.length > 0) {
          await ParkingMashin(kholbolt).bulkWrite(bulkOps);
        }
      }
    }
  };

module.exports.zogsoolMsgIlgeeye = async function zogsoolMsgIlgeeye() {
  const { db } = require("zevbackv2");
  var baiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).find({
    "barilguud.tokhirgoo.zogsoolMsgIlgeekh": true,
  });
  if (!!baiguullaguud) {
    var kholboltuud = db.kholboltuud;
    var unuudur = new Date();
    unuudur = new Date(
      unuudur.getFullYear(),
      unuudur.getMonth(),
      unuudur.getDate(),
      0,
      0,
      0
    );
    var daraagiinUdur = new Date();
    daraagiinUdur.setDate(unuudur.getDate() + 3);
    for await (const baiguullaga of baiguullaguud) {
      var tukhainKholbolt = kholboltuud.find(
        (x) => x.baiguullagiinId == baiguullaga._id.toString()
      );
      var msgnuud = [];
      for await (const barilga of baiguullaga.barilguud) {
        var mashinuud = await ParkingMashin(tukhainKholbolt).find({
          barilgiinId: barilga._id.toString(),
          duusakhOgnoo: {
            $gte: unuudur,
            $lte: daraagiinUdur,
          },
          ezemshigchiinUtas: { $exists: true },
        });
        if (!!mashinuud && mashinuud.length > 0) {
          for await (const mashin of mashinuud) {
            var text =
              "Tanii zogsooliin geree " +
              moment(mashin.duusakhOgnoo).format("MM/DD") +
              "nii udur duusna." +
              barilga.ner;
            msgnuud.push({ to: mashin.ezemshigchiinUtas, text });
          }
        }
      }
      if (msgnuud.length > 0) {
        var msgIlgeekhKey = "aa8e588459fdd9b7ac0b809fc29cfae3";
        var msgIlgeekhDugaar = "72002002";
        msgIlgeeye(
          msgnuud,
          msgIlgeekhKey,
          msgIlgeekhDugaar,
          [],
          0,
          tukhainKholbolt,
          baiguullaga._id
        );
      }
    }
  }
};

module.exports.tulburUridchiljTulukh = async (body, next) => {
  try {
    const tukhainKholbolt = body.tukhainBaaziinKholbolt;
    if (!tukhainKholbolt) {
      return "Холболт олдсонгүй!";
    }

    let oldsonMashin = null;
    if (body.uilchluulegchiinId) {
      oldsonMashin = await Uilchluulegch(tukhainKholbolt, true).findById(
        body.uilchluulegchiinId
      );
    }
    if (!oldsonMashin && body.plate_number) {
      oldsonMashin = await Uilchluulegch(tukhainKholbolt, true)
        .findOne({ mashiniiDugaar: body.plate_number })
        .sort({ createdAt: -1 });
    }

    if (!oldsonMashin) {
      return "Машины мэдээлэл олдсонгүй!";
    }

    const zogsooliinId =
      body.zogsooliinId ||
      oldsonMashin.tuukh?.[0]?.zogsooliinId ||
      oldsonMashin.zogsooliinId;

    let tukhainZogsool = null;
    if (zogsooliinId) {
      tukhainZogsool = await Parking(tukhainKholbolt).findOne({
        _id: zogsooliinId,
      });
    }
    if (!tukhainZogsool) {
      tukhainZogsool = await Parking(tukhainKholbolt).findOne({
        baiguullagiinId: body.baiguullagiinId || oldsonMashin.baiguullagiinId,
        barilgiinId: body.barilgiinId || oldsonMashin.barilgiinId,
      });
    }

    const exitedDun =
      Number(oldsonMashin.niitDun) ||
      Number(oldsonMashin.tuukh?.[0]?.savedDun) ||
      0;
    const garsanTsag =
      oldsonMashin?.tuukh?.[0]?.tsagiinTuukh?.[0]?.garsanTsag;

    let bodsonDun = 0;
    if (garsanTsag && exitedDun > 0) {
      bodsonDun = exitedDun;
    } else {
      bodsonDun = await zogsooliinDunAvya(
        tukhainZogsool,
        oldsonMashin,
        tukhainKholbolt
      );
    }

    const tulsunDun = Number(body.paid_amount) || 0;
    const existingTulbur = Array.isArray(oldsonMashin?.tuukh?.[0]?.tulbur)
      ? [...oldsonMashin.tuukh[0].tulbur]
      : oldsonMashin?.tuukh?.[0]?.tulbur
        ? [oldsonMashin.tuukh[0].tulbur]
        : [];

    existingTulbur.push({
      ognoo: new Date(),
      turul: body.turul || "QPay",
      dun: tulsunDun,
    });

    const currentTulsun = existingTulbur.reduce(
      (s, t) => s + (Number(t?.dun) > 0 ? Number(t.dun) : 0),
      0
    );

    const set = {
      "tuukh.0.tulbur": existingTulbur,
      "tuukh.0.tulsunDun": currentTulsun,
      tulsunDun: currentTulsun,
      "tuukh.0.tuluv": 1,
      "tuukh.0.tulukhDun": 0,
      freezeOgnoo: new Date(),
    };

    if (!(Number(oldsonMashin.niitDun) > 0)) {
      set["niitDun"] = bodsonDun > 0 ? bodsonDun : currentTulsun;
    }
    if (!garsanTsag) {
      set["garakhTsag"] = new Date(
        Date.now() + (tukhainZogsool?.garakhTsag || 30) * 60000
      );
    }
    if (body.ajiltniiId) {
      set["tuukh.0.burtgesenAjiltaniiId"] = body.ajiltniiId;
    }
    if (body.ajiltniiNer) {
      set["tuukh.0.burtgesenAjiltaniiNer"] = body.ajiltniiNer;
    }

    const updatedMashin = await Uilchluulegch(tukhainKholbolt).findByIdAndUpdate(
      oldsonMashin._id,
      { $set: set },
      { new: true }
    );
    return updatedMashin;
  } catch (err) {
    if (typeof next === "function") next(err);
    else throw err;
  }
};

module.exports.zogsoolTseverlye = async (body, next) => {
  try {
    const { db } = require("zevbackv2");
    const kholboltuud = db.kholboltuud;
    if (kholboltuud) {
      for await (const kholbolt of kholboltuud) {
        var zogsooluud = await Parking(kholbolt).find({
          baiguullagiinId: kholbolt.baiguullagiinId,
        });
        if (!!zogsooluud) {
          for await (const zogsool of zogsooluud) {
            console.log("zogsoolTseverlye:", zogsool.mashinGargakhKhugatsaa);
            var ognoo = new Date();
            ognoo = new Date(
              ognoo.getTime() - (zogsool.mashinGargakhKhugatsaa || 120) * 60 * 60000
            );
            await Uilchluulegch(kholbolt).updateMany(
              {
                "tuukh.0.garsanKhaalga": {
                  $exists: false,
                },
                "tuukh.0.tsagiinTuukh.0.garsanTsag": {
                  $exists: false,
                },
                createdAt: {
                  $lt: ognoo,
                },
              },
              // {
              //   $set: {
              //     "tuukh.0.garsanKhaalga": "tseverlesen",
              //     "tuukh.0.tsagiinTuukh.0.garsanTsag": new Date(),
              //     "tuukh.0.tuluv": -3, //Tseverlesen tuluv
              //     zurchil: "Гарсан цаг тодорхойгүй!",
              //   },
              // }
            );
          }
        }
      }
    }
  } catch (err) {
    next(err);
  }
};

module.exports.zogsooloosUstgay = async (body, next) => {
  try {
    const { db } = require("zevbackv2");
    const kholboltuud = db.kholboltuud;
    if (kholboltuud) {
      for await (const kholbolt of kholboltuud) {
        var zogsooluud = await Parking(kholbolt).find({
          mashinUstgakhKhugatsaa: { $gt: 1 },
          baiguullagiinId: kholbolt.baiguullagiinId,
        });
        if (!!zogsooluud) {
          for await (const zogsool of zogsooluud) {
            var ognoo = new Date();
            ognoo = new Date(
              ognoo.getTime() - zogsool.mashinUstgakhKhugatsaa * 24 * 60 * 60000
            );
            await Uilchluulegch(kholbolt).deleteMany({
              createdAt: {
                $lt: ognoo,
              },
            });
          }
        }
      }
    }
  } catch (err) {
    next(err);
  }
};

module.exports.ebarimtDutuugShivye = async (body, next) => {
  try {
    const { db } = require("zevbackv2");
    var baiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).find({
      "barilguud.tokhirgoo.eBarimtBugdShivikh": true,
    });
    if (!!baiguullaguud) {
      const kholboltuud = db.kholboltuud;
      if (kholboltuud) {
        for await (const baiguullaga of baiguullaguud) {
          var tukhainKholbolt = kholboltuud.find(
            (x) => x.baiguullagiinId == baiguullaga._id.toString()
          );
          var shiveeguiTuukhuud = await Uilchluulegch(
            tukhainKholbolt,
            true
          ).find({
            ebarimtAvsanEsekh: { $ne: true },
            "tuukh.0.tulbur": { $exists: true, $not: { $size: 0 } },
            "tuukh.0.tulbur.ognoo": {
              $gt: new Date(
                moment(new Date()).add(-1, "day").format("YYYY-MM-DD 23:59:59")
              ),
            },
          });
          var uilchluulegchBulk = [];
          if (!!shiveeguiTuukhuud) {
            var niitDun = 0;
            for await (const object of shiveeguiTuukhuud) {
              var niilberDun = 0;
              for await (const tulbur of object.tuukh[0]?.tulbur) {
                if (
                  !!tulbur.turul &&
                  !["khungulult", "discount", "Хөнгөлөлт", "khariult"].includes(tulbur.turul) &&
                  Number(tulbur.dun) > 0
                )
                  niilberDun += Number(tulbur.dun);
              }
              if (niilberDun > 0) {
                niitDun = niitDun + niilberDun;
                let upsert = {
                  updateOne: {
                    filter: {
                      _id: object._id,
                      baiguullagiinId: baiguullaga._id,
                    },
                    update: {
                      ebarimtAvsanDun: niilberDun,
                      ebarimtAvsanEsekh: true,
                    },
                  },
                };
                uilchluulegchBulk.push(upsert);
              }
            }
            if (niitDun > 0) {
              await zogsoolNiitDungeerEbarimtShivye(
                tukhainKholbolt,
                niitDun,
                shiveeguiTuukhuud[0]?.barilgiinId,
                next,
                shiveeguiTuukhuud,
                null
              );
            }
            if (uilchluulegchBulk)
              Uilchluulegch(tukhainKholbolt)
                .bulkWrite(uilchluulegchBulk)
                .then((bulkWriteOpResult) => { })
                .catch((err) => {
                  throw err;
                });
          }
        }
      }
    }
  } catch (err) {
    if (!!next) {
      next(err);
    }
  }
};

module.exports.archiveUilchluulegch =
  async function archiveUilchluulegch() {
    try {
      const { db } = require("zevbackv2");
      const kholboltuud = db.kholboltuud;
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      if (kholboltuud) {
        for (const kholbolt of kholboltuud) {
          var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(kholbolt.baiguullagiinId);
          if (baiguullaga?.tokhirgoo?.dolooKhonogTutamArchiveEsekh) continue;
          const months = await Uilchluulegch(kholbolt).aggregate([
            { $project: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } } },
            { $group: { _id: { year: "$year", month: "$month" } } },
            { $sort: { "_id.year": 1, "_id.month": 1 }, },
          ]);
          for (const { _id } of months) {
            const y = _id.year;
            const m = _id.month;
            if (y === currentYear && m === currentMonth) continue; // одоогийн сар алгасна
            const archiveName = `Uilchluulegch${y}${String(m).padStart(2, "0")}`;
            const docs = await Uilchluulegch(kholbolt, false, archiveName).find({
              "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
              createdAt: { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) }
            });
            if (docs?.length > 0) continue;
            // --- Archive ---
            const data = await Uilchluulegch(kholbolt).aggregate([
              {
                $match: {
                  "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
                  createdAt: { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) }
                }
              },
            ]);
            await Uilchluulegch(kholbolt, false, archiveName).insertMany(data);
            // --- Delete ---
            const res = await Uilchluulegch(kholbolt).deleteMany({
              "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
              createdAt: { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) }
            });
          }
        }
      }
    } catch (error) {
    }
  };

module.exports.archiveUilchluulegchKhonog =
  async function archiveUilchluulegchKhonog() {
    try {
      const { db } = require("zevbackv2");
      const kholboltuud = db.kholboltuud;
      const now = new Date();
      const archiveBeforeDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      archiveBeforeDate.setHours(0, 0, 0, 0);
      const y = archiveBeforeDate.getFullYear();
      const m = archiveBeforeDate.getMonth() + 1;
      const archiveName = `Uilchluulegch${y}${String(m).padStart(2, "0")}`;
      for (const kholbolt of kholboltuud) {
        console.log(`Processing kholbolt: ${kholbolt.baiguullagiinId}`);
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(kholbolt.baiguullagiinId);
        if (!baiguullaga) continue;
        // if (!baiguullaga?.tokhirgoo?.dolooKhonogTutamArchiveEsekh) continue;
        const archivedIds = await Uilchluulegch(
          kholbolt,
          false,
          archiveName
        ).find({}, { _id: 1 }).lean();
        const archivedIdSet = new Set(archivedIds.map(d => String(d._id)));
        console.log("archiveBeforeDate --->:", archiveBeforeDate);
        // ТӨЛӨӨГҮЙ машиныг архивлахгүй.
        //
        // Архивлалт нь бичлэгийг `Uilchluulegch{YYYY}{MM}` руу зөөж, амьд
        // цуглуулгаас УСТГАДАГ. Харин өөрөө үйлчлэх хайлт
        // (/v1/search_car → `Uilchluulegch(kholbolt, true)`) нь зөвхөн амьд
        // цуглуулгаас хайдаг тул архивлагдсан машин "Машины мэдээлэл
        // олдсонгүй" болж, ӨРӨӨ ТӨЛӨХ БОЛОМЖГҮЙ үлддэг байв.
        //
        // `$not: { $gt: 0 }` нь талбар нь байхгүй, null, 0 буюу сөрөг
        // бүх тохиолдлыг хамарна — өөрөөр хэлбэл "үлдэгдэлгүй". Өртэй
        // бичлэг нь төлөгдөх хүртлээ амьд цуглуулгадаа үлдэнэ.
        const data = await Uilchluulegch(kholbolt).find({
          _id: { $nin: Array.from(archivedIdSet) },
          "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
          "tuukh.0.tulukhDun": { $not: { $gt: 0 } },
          createdAt: { $lt: archiveBeforeDate }
        }).lean();
        if (!data.length) continue;
        console.log(`Archiving ${data.length} docs for ${baiguullaga?.ner} (${kholbolt.baiguullagiinId})`);
        await Uilchluulegch(kholbolt, false, archiveName).insertMany(data);
        await Uilchluulegch(kholbolt).deleteMany({
          _id: { $in: data.map(d => d._id) },
          "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
          createdAt: { $lt: archiveBeforeDate }
        });
      }
    } catch (error) {
      console.error("Archive error:", error);
    }
  };

exports.zurchilteiTuvulBoluulakh = asyncHandler(
  async (baiguullagiinId = null) => {
    try {
      const { db } = require("zevbackv2");
      var kholboltuud = db.kholboltuud;
      if (!!baiguullagiinId)
        kholboltuud = [kholboltuud.find((a) => a.baiguullagiinId == baiguullagiinId),];
      if (kholboltuud) {
        for (const kholbolt of kholboltuud) {
          const zurchilteiUilchluulegch = await Uilchluulegch(kholbolt).find({
            baiguullagiinId: kholbolt?.baiguullagiinId,
            'tuukh.0.tsagiinTuukh.0.garsanTsag': { $exists: true },
            'tuukh.0.garsanKhaalga': { $exists: true },
            'tuukh.0.tuluv': 0,
            zurchil: { $exists: false },
            createdAt: {
              $lt: moment().startOf('day').toDate(),
            },
          });
          var bulkOps = [];
          if (zurchilteiUilchluulegch?.length > 0) {
            for (const zurchiltei of zurchilteiUilchluulegch) {
              var dun = zurchiltei?.tuukh[0]?.tulbur?.length > 0 ? zurchiltei?.tuukh[0]?.tulbur.reduce((a, b) => a + b.dun || 0, 0) : 0;
              var update = (dun > 0 && zurchiltei.niitDun === dun) ? { "tuukh.0.tuluv": 2 } : { "tuukh.0.tuluv": -4, zurchil: zurchiltei.niitDun > 0 ? "Төлбөрийн зөрчилтэй" : "Тодорхойгүй зөрчилтэй!" };
              update["tuukh.0.burtgesenAjiltaniiNer"] = "систем";
              console.log("zurchilteiTuvulBoluulakh:", zurchiltei._id, update);
              let upsertDoc = {
                updateOne: {
                  filter: { _id: zurchiltei._id },
                  update: update,
                },
              };
              bulkOps.push(upsertDoc);
            }
            await Uilchluulegch(kholbolt).bulkWrite(bulkOps).then((bulkWriteOpResult) => { }).catch((err) => { });
          }
        }
      }
    } catch (error) {
    }
  });