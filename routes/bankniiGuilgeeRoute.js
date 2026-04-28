const express = require("express");
const router = express.Router();
const BankniiGuilgee = require("../models/bankniiGuilgee");
const { bankniiGuilgeeToololtAvya } = require("../controller/toololt");
//const UstsanBarimt = require("../models/ustsanBarimt");
const { tokenShalgakh, crud, UstsanBarimt, Dans } = require("zevbackv2");
const { downloadBankniiGuilgeeExcel } = require("../controller/excelImportController");
//const { crud } = require('../components/crud');
//const { tokenShalgakh } = require("../middlewares/tokenShalgakh");

crud(router, "bankniiGuilgee", (conn) => BankniiGuilgee(conn, false), UstsanBarimt);
router.post(
  "/bankniiGuilgeeToololtAvya",
  tokenShalgakh,
  bankniiGuilgeeToololtAvya
);

router
  .route("/dansniiKhuulgaDunAvya")
  .post(tokenShalgakh, async (req, res, next) => {
    var turul = req.body.turul;
    let query = [
      {
        $match: {
          baiguullagiinId: req.body.baiguullagiinId,
          barilgiinId: req.body.barilgiinId,
          dansniiDugaar: req.body.dansniiDugaar,
          $or: [
            {
              $and: [
                {
                  TxDt: {
                    $gte: new Date(req.body.ekhlekhOgnoo),
                    $lte: new Date(req.body.duusakhOgnoo),
                  },
                },
                {
                  Amt:
                    turul == "orlogo"
                      ? {
                          $gt: 0,
                        }
                      : {
                          $lt: 0,
                        },
                },
              ],
            },
            {
              $and: [
                {
                  tranDate: {
                    $gte: new Date(req.body.ekhlekhOgnoo),
                    $lte: new Date(req.body.duusakhOgnoo),
                  },
                },
                {
                  amount:
                    turul == "orlogo"
                      ? {
                          $gt: 0,
                        }
                      : {
                          $lt: 0,
                        },
                },
              ],
            },
          ],
        },
      },
      {
        $project: {
          dun: { $ifNull: ["$Amt", "$amount"] },
        },
      },
      {
        $group: {
          _id: "dun",
          dun: {
            $sum: "$dun",
          },
        },
      },
    ];
    BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false)
      .aggregate(query)
      .then((result) => {
        res.send(result);
      })
      .catch((err) => {
        next(err);
      });
  });

  router
  .route("/davkhardsanDansniiKhuulga")
  .post(tokenShalgakh, async (req, res, next) => {
    var bank = req.body.bank;
    var match = {
      baiguullagiinId: req.body.baiguullagiinId,
      barilgiinId: req.body.barilgiinId,
      bank: bank,
    }
    if(!!req.body.dugaar)  
    {
      if(bank === "khanbank")
        match["record"] = req.body.dugaar;
      else if(bank === "golomt")
        match["tranId"] = req.body.dugaar;
      else if(bank === "bogd")
        match["recNum"] = req.body.dugaar;
      else if(bank === "tran")
        match["jrno"] = req.body.dugaar;
      else if(bank === "tdb")
        match["NtryRef"] = req.body.dugaar;
    }
    var str = bank === "khanbank" ? "$record" : 
                bank === "golomt" ? "$tranId" : 
                  bank === "bogd" ? "$recNum" : 
                    bank === "tran" ? "$jrno" : 
                      bank === "tdb" ? "$NtryRef" : "$refno";
    let query = [
      {
        $match: match,
      },
      {
        $group: {
          _id: str,
          countRef: {
            $sum: 1,
          },
        },
      }]

    var result = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).aggregate(query);
    var filterResult = result?.filter((e) => e.countRef > 1);
    for await (const val of filterResult)
    {
      match = {
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
      }
      if(bank === "khanbank")
        match["record"] = val?._id;
      else if(bank === "golomt")
        match["tranId"] = val?._id;
      else if(bank === "bogd")
        match["recNum"] = val?._id;
      else if(bank === "tran")
        match["jrno"] = val?._id;
      else if(bank === "tdb")
        match["NtryRef"] = val?._id;
      var resultRef = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).find(match);
      if(resultRef?.length > 0)
      {
        if(req.body.type === 1) // ebarimtAvsanEsekh true baival uldeekh
        {
          var ustgakhJagsaalt = [];
          ustgakhJagsaalt.push(resultRef[0]);
          var fRemove = resultRef.filter((el) => !ustgakhJagsaalt.includes(el) && !el.ebarimtAvsanEsekh);
          await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: fRemove?.map((e) => e._id) }, });
        }
        else if(req.body.type === 2) // khamgiin ekhnii uldeekh
        {
          var ustgakhJagsaalt = [];
          ustgakhJagsaalt.push(resultRef[0]);
          var fRemove = resultRef.filter((el) => !ustgakhJagsaalt.includes(el));
          await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: fRemove?.map((e) => e._id) }, });
        }
        else
        {
          var filterKholboson =  resultRef?.filter((e) => e.kholbosonTalbainId?.length > 0);
          if(filterKholboson?.length > 0)
          {
            var filterRemove = resultRef?.filter((e) => e.kholbosonTalbainId?.length === 0);
            await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: filterRemove?.map((e) => e._id) }, });
          }
          else
          {
            var ustgakhJagsaalt = [];
            ustgakhJagsaalt.push(resultRef[0]);
            var fRemove = resultRef.filter((el) => !ustgakhJagsaalt.includes(el) && !el.ebarimtAvsanEsekh);
            await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: fRemove?.map((e) => e._id) }, });
          }
        }
      }
    }
    res.send("Амжилт");
  });

  router
  .route("/copyBankniiKhuulga")
  .post(tokenShalgakh, async (req, res, next) => {
    var match = {
      baiguullagiinId: req.body.baiguullagiinId,
      barilgiinId: req.body.barilgiinId,
      dansniiDugaar: req.body.dansniiDugaar,
    }
    if(!!req.body.record)  
      match["record"] = req.body.record;
    
    var result = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).find(match);
    for await (const val of result)
    {
      match = {
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.insertBarilgiinId,
        dansniiDugaar: req.body.dansniiDugaar,
        record: val.record,
      }
      var resultRef = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).find(match);
      if(resultRef?.length === 0)
      {
        var guilgee = new BankniiGuilgee(req.body.tukhainBaaziinKholbolt)();
        guilgee.record = val.record;
        guilgee.tranDate = val.tranDate;
        guilgee.postDate = val.postDate;
        guilgee.time = val.time;
        guilgee.branch = val.branch;
        guilgee.teller = val.teller;
        guilgee.journal = val.journal;
        guilgee.code = val.code;
        guilgee.amount = val.amount;
        guilgee.balance = val.balance;
        guilgee.debit = val.debit;
        guilgee.correction = val.correction;
        guilgee.description = val.description;
        guilgee.relatedAccount = val.relatedAccount;
        guilgee.kholbosonGereeniiId = [];
        guilgee.kholbosonTalbainId = [];
        guilgee.dansniiDugaar = val.dansniiDugaar;
        guilgee.baiguullagiinId = val.baiguullagiinId;
        guilgee.barilgiinId = req.body.insertBarilgiinId;
        guilgee.save();
      }
    }
    res.send("Амжилт");
  });

router
  .route("/bankniiGuilgeeBankSet")
  .post(async (req, res, next) => {
    try
    {
      console.log("Энэ рүү орлоо: bankniiGuilgeeBankSet");
      var kholboltuud;
      const { db } = require("zevbackv2");
      if (!!req?.body?.tukhainBaaziinKholbolt) {
        kholboltuud = [req.body.tukhainBaaziinKholbolt];
      } else {
        kholboltuud = db.kholboltuud;
      }
      if (kholboltuud) {
        for await (const kholbolt of kholboltuud) {
          var guilgeenuud = await BankniiGuilgee(kholbolt, false).find({ baiguullagiinId: kholbolt.baiguullagiinId, bank: { $exists: false }});
          
          for await (const guilgee of guilgeenuud)
          {
            var dans = await Dans(kholbolt).findOne({ baiguullagiinId: kholbolt.baiguullagiinId, dugaar: guilgee.dansniiDugaar });
            if(dans) {
              await BankniiGuilgee(kholbolt).findByIdAndUpdate(guilgee._id, { bank: dans?.bank });
            }
          }
        }    
      }
      res.send("Амжилт");
    } catch (error) {
      console.error("Error setting bank field:", error.message);
      next(error);
    }
  });

router
  .route("/bankIndexTalbar")
  .post(async (req, res, next) => {
    try
    {
      console.log("Энэ рүү орлоо: bankIndexTalbar");
      var kholboltuud;
      const { db } = require("zevbackv2");
      if (!!req?.body?.tukhainBaaziinKholbolt) {
        kholboltuud = [req.body.tukhainBaaziinKholbolt];
      } else {
        kholboltuud = db.kholboltuud;
      }
      if (kholboltuud) {
        for await (const kholbolt of kholboltuud) {
          var guilgeenuud = await BankniiGuilgee(kholbolt, false).find({ baiguullagiinId: kholbolt.baiguullagiinId });
          
          for await (const guilgee of guilgeenuud)
          {
            var dugaar = guilgee.bank === "khanbank" ? guilgee.record : 
                guilgee.bank === "golomt" ?  guilgee.tranId : 
                  guilgee.bank === "bogd" ?  guilgee.recNum :
                    guilgee.bank === "tran" ? guilgee.jrno  :
                      guilgee.bank === "tdb" && !!guilgee.NtryRef ? guilgee.NtryRef : guilgee.refno
            var mungunDun = guilgee.bank === "khanbank" ? guilgee.amount : 
                        guilgee.bank === "golomt" ?  guilgee.tranAmount : 
                        guilgee.bank === "bogd" ?  guilgee.amount :
                        guilgee.bank === "tran" ? (guilgee.income > 0 ? guilgee.income : guilgee.outcome) :
                        guilgee.bank === "tdb" ? guilgee.Amt : 0
            indexTalbar = guilgee.barilgiinId + guilgee.bank + guilgee.dansniiDugaar + dugaar + mungunDun.toString();
            await BankniiGuilgee(kholbolt).findByIdAndUpdate(guilgee._id, { indexTalbar: indexTalbar });
          }
        }    
      }
      res.send("Амжилт");
    } catch (error) {
      console.error("Error generating indexes:", error.message);
      next(error);
    }
  });

// Excel download route
router.post(
  "/bankniiGuilgeeExcelDownload",
  tokenShalgakh,
  downloadBankniiGuilgeeExcel
);

module.exports = router;
