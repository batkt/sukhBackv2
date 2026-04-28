const asyncHandler = require("express-async-handler");
const Geree = require("../models/geree");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const Baiguullaga = require("../models/baiguullaga");
const lodash = require("lodash");

async function tooZasya(too) {
  var zassanToo = (await Math.round((too + Number.EPSILON) * 100)) / 100;
  return +zassanToo.toFixed(2);
}

function tooZasyaSync(too) {
  var zassanToo = Math.round((too + Number.EPSILON) * 100) / 100;
  return +zassanToo.toFixed(2);
}

async function daraagiinTulukhOgnooZasya(gereeniiId, tukhainBaaziinKholbolt) {
  var geree = await Geree(tukhainBaaziinKholbolt, true)
    .findById(gereeniiId)
    .select("avlaga");
  var jagsaalt = [];
  if (lodash.isArray(lodash.get(geree, "avlaga.guilgeenuud"))) {
    jagsaalt = lodash.get(geree, "avlaga.guilgeenuud");
  }
  jagsaalt = lodash.filter(jagsaalt, (a) => a.turul != "baritsaa");
  var niitTulsunDun = lodash.sumBy(jagsaalt, function (object) {
    if (object.ognoo < new Date()) return object.tulsunDun;
    else return 0;
  });
  var niitKhyamdral = lodash.sumBy(jagsaalt, function (object) {
    if (object.ognoo < new Date()) return object.khyamdral;
    else return 0;
  });
  niitTulsunDun = niitTulsunDun + niitKhyamdral;
  jagsaalt = lodash.filter(jagsaalt, (a) => a.tulukhDun != null);
  jagsaalt = lodash.orderBy(jagsaalt, ["ognoo"], ["asc"]);
  var tulukhOgnoo;
  if (jagsaalt && jagsaalt.length > 0) tulukhOgnoo = jagsaalt[0].ognoo;
  jagsaalt.forEach((element) => {
    if (niitTulsunDun >= 0) {
      tulukhOgnoo = element.ognoo;
      niitTulsunDun = niitTulsunDun - element.tulukhDun;
    }
  });
  Geree(tukhainBaaziinKholbolt)
    .findByIdAndUpdate(gereeniiId, {
      $set: { daraagiinTulukhOgnoo: tulukhOgnoo },
    })
    .then((result) => {})
    .catch((err) => {});
}

module.exports.tulultTaniya = async function tulultTaniya() {
  try {
    const { db } = require("zevbackv2");
    const { Dans } = require("zevbackv2");
    var kholboltuud = db.kholboltuud;
    if (kholboltuud) {
      for await (const kholbolt of kholboltuud) {
        var dansnuud = await Dans(kholbolt).find({
          corporateAshiglakhEsekh: true,
          oirkhonTatakhEsekh: { $exists: false },
        });
        for await (const dans of dansnuud) {
          if (!!dans.bank) {
            var match = {
              createdAt: {
                $gt: new Date(new Date().getTime() - 60000),
                $lt: new Date(),
              },
              dansniiDugaar: dans.dugaar,
              baiguullagiinId: dans.baiguullagiinId,
              barilgiinId: dans.barilgiinId,
              bank: dans.bank,
              kholbosonTalbainId: { $size: 0 },
              magadlaltaiGereenuud: { $exists: false },
            };

            var match1 = { ...match };
            if (dans.bank == "golomt") {
              match1["tranDesc"] = { $regex: "qpay", $options: "i" };
              match1["drOrCr"] = "Credit";
              match1["recNum"] = "1";
              match1["tranAmount"] = { $gt: 0 };
            } else if (dans.bank == "tdb") {
              match1["Amt"] = { $gt: 0 };
              match1["TxAddInf"] = { $regex: "qpay", $options: "i" };
            } else {
              match1["description"] = { $regex: "qpay", $options: "i" };
              match1["amount"] = { $gt: 0 };
            }
            var guilgeenuud = await BankniiGuilgee(kholbolt, true).find(match1);

            if (guilgeenuud?.length > 0) {
              guilgeenuud.forEach(async (x) => {
                if (
                  (x.description &&
                    x.description.toLowerCase().includes("qpay")) ||
                  (x.TxAddInf && x.TxAddInf.toLowerCase().includes("qpay")) ||
                  (x.tranDesc && x.tranDesc.toLowerCase().includes("qpay"))
                ) {
                  var tailbar = [];
                  if (x.description) tailbar = x.description.split(/,| /);
                  else if (x.TxAddInf) tailbar = x.TxAddInf.split(/,| /);
                  else if (x.tranDesc) tailbar = x.tranDesc.split(/,| /);

                  var oldsonGereenuud = await Geree(kholbolt, true).find({
                    gereeniiDugaar: { $in: tailbar },
                    tuluv: 1,
                    barilgiinId: x.barilgiinId,
                  });

                  if (oldsonGereenuud != null && oldsonGereenuud.length == 1) {
                    x.kholbosonGereeniiId = [oldsonGereenuud[0]._id];
                    x.isNew = false;
                    x.save();
                  }
                }
              });
            }
          }
        }
      }
    }
  } catch (e) {}
};

module.exports.daraagiinTulukhOgnooZasya = daraagiinTulukhOgnooZasya;
module.exports.tooZasya = tooZasya;
module.exports.tooZasyaSync = tooZasyaSync;
