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
    if (!!req.body.dugaar) {
      if (bank === "khanbank")
        match["record"] = req.body.dugaar;
      else if (bank === "golomt")
        match["tranId"] = req.body.dugaar;
      else if (bank === "bogd")
        match["recNum"] = req.body.dugaar;
      else if (bank === "tran")
        match["jrno"] = req.body.dugaar;
      else if (bank === "tdb")
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
    for await (const val of filterResult) {
      match = {
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
      }
      if (bank === "khanbank")
        match["record"] = val?._id;
      else if (bank === "golomt")
        match["tranId"] = val?._id;
      else if (bank === "bogd")
        match["recNum"] = val?._id;
      else if (bank === "tran")
        match["jrno"] = val?._id;
      else if (bank === "tdb")
        match["NtryRef"] = val?._id;
      var resultRef = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).find(match);
      if (resultRef?.length > 0) {
        if (req.body.type === 1) // ebarimtAvsanEsekh true baival uldeekh
        {
          var ustgakhJagsaalt = [];
          ustgakhJagsaalt.push(resultRef[0]);
          var fRemove = resultRef.filter((el) => !ustgakhJagsaalt.includes(el) && !el.ebarimtAvsanEsekh);
          await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: fRemove?.map((e) => e._id) }, });
        }
        else if (req.body.type === 2) // khamgiin ekhnii uldeekh
        {
          var ustgakhJagsaalt = [];
          ustgakhJagsaalt.push(resultRef[0]);
          var fRemove = resultRef.filter((el) => !ustgakhJagsaalt.includes(el));
          await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: fRemove?.map((e) => e._id) }, });
        }
        else {
          var filterKholboson = resultRef?.filter((e) => e.kholbosonTalbainId?.length > 0);
          if (filterKholboson?.length > 0) {
            var filterRemove = resultRef?.filter((e) => e.kholbosonTalbainId?.length === 0);
            await BankniiGuilgee(req.body.tukhainBaaziinKholbolt).deleteMany({ _id: { $in: filterRemove?.map((e) => e._id) }, });
          }
          else {
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
    if (!!req.body.record)
      match["record"] = req.body.record;

    var result = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).find(match);
    for await (const val of result) {
      match = {
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.insertBarilgiinId,
        dansniiDugaar: req.body.dansniiDugaar,
        record: val.record,
      }
      var resultRef = await BankniiGuilgee(req.body.tukhainBaaziinKholbolt, false).find(match);
      if (resultRef?.length === 0) {
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
    try {
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
          var guilgeenuud = await BankniiGuilgee(kholbolt, false).find({ baiguullagiinId: kholbolt.baiguullagiinId, bank: { $exists: false } });

          for await (const guilgee of guilgeenuud) {
            var dans = await Dans(kholbolt).findOne({ baiguullagiinId: kholbolt.baiguullagiinId, dugaar: guilgee.dansniiDugaar });
            if (dans) {
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
    try {
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

          for await (const guilgee of guilgeenuud) {
            var dugaar = guilgee.bank === "khanbank" ? guilgee.record :
              guilgee.bank === "golomt" ? guilgee.tranId :
                guilgee.bank === "bogd" ? guilgee.recNum :
                  guilgee.bank === "tran" ? guilgee.jrno :
                    guilgee.bank === "tdb" && !!guilgee.NtryRef ? guilgee.NtryRef : guilgee.refno
            var mungunDun = guilgee.bank === "khanbank" ? guilgee.amount :
              guilgee.bank === "golomt" ? guilgee.tranAmount :
                guilgee.bank === "bogd" ? guilgee.amount :
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

// ═══════════════════════════════════════════════════════════════════
// CGW — Corporate Gateway: банкны үлдэгдэл, хуулга татах, тулалт
// ═══════════════════════════════════════════════════════════════════
const {
  tokenAvya,
  golomtTokenAvya,
  tdbTokenAvya,
  bogdTokentAvya,
  transTokenAvya,
  golomtServiceDuudya,
  dansniiJagsaaltAvya,
  dansniiKhuulgaAvya,
} = require("../controller/cgw");

const got = require("got");
const axios = require("axios");

// POST /dansniiUldegdelAvya — дансны үлдэгдэл авах
router.post("/dansniiUldegdelAvya", tokenShalgakh, async (req, res, next) => {
  try {
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const dans = await Dans(tukhainBaaziinKholbolt).findOne({
      dugaar: req.body.dansniiDugaar,
    }).lean();

    var uldegdel = 0;

    if (dans && dans.bank === "khanbank") {
      const { Token } = require("zevbackv2");
      var query = {
        turul: "khaanCorporate",
        baiguullagiinId: dans.baiguullagiinId,
        ognoo: { $gte: new Date(new Date().getTime() - 29 * 60000) },
      };
      if (dans.corporateBarilgaTusBur && !!dans.barilgiinId)
        query["barilgiinId"] = dans.barilgiinId;
      var tokenObject = await Token(tukhainBaaziinKholbolt).findOne(query);
      var token;
      if (!tokenObject) {
        tokenObject = await tokenAvya(
          dans.corporateNevtrekhNer,
          dans.corporateNuutsUg,
          next,
          dans.baiguullagiinId,
          dans.corporateBarilgaTusBur ? dans.barilgiinId : null,
          tukhainBaaziinKholbolt
        );
        token = tokenObject?.access_token;
      } else token = tokenObject.token;
      if (!token)
        throw new Error("Corporate Gateway үйлчилгээний нэвтрэх мэдээллээ шалгана уу!");
      var khariu = await dansniiJagsaaltAvya(token, next);
      khariu = khariu?.accounts?.filter((a) => a.number == req.body.dansniiDugaar);
      if (khariu && khariu.length > 0) uldegdel = khariu[0].avalaibleBalance;
      res.send({ uldegdel });

    } else if (dans && dans.bank === "tdb") {
      if (
        !!dans.corporateNevtrekhNer &&
        !!dans.corporateNuutsUg &&
        !dans.AnyBIC &&
        !dans.RoleID &&
        !!dans.dugaar &&
        (dans.dugaar.includes("mn") || dans.dugaar.includes("MN"))
      ) {
        var tokenObject = await tdbTokenAvya(dans, tukhainBaaziinKholbolt);
        var url = process.env.TDB_SERVER + "/accounts/" + dans.dugaar + "/balance";
        const response = await got.get(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + tokenObject.token,
          },
        }).catch((err) => { throw err; });
        var khariu = JSON.parse(response.body);
        res.send({ uldegdel: khariu.acntno.BALANCE });
      }

    } else if (dans && dans.bank === "golomt") {
      var yawuulaxBody = { registerNo: dans.register, accountId: dans.dugaar };
      var khariu = await golomtServiceDuudya(
        dans, yawuulaxBody, "/v1/account/balance/inq", "ACCTBALINQ", next, tukhainBaaziinKholbolt
      );
      if (!!khariu && !!khariu.balanceLL && khariu.balanceLL.length > 0)
        khariu = { uldegdel: khariu?.balanceLL[0].amount?.value };
      res.send(khariu);

    } else if (dans && dans.bank === "bogd") {
      var tokenObject = await bogdTokentAvya(dans, tukhainBaaziinKholbolt);
      const response = await got.post(process.env.BOGD_SERVER + "api/accounts", {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          lang_code: "MN",
          Authorization: "Bearer " + tokenObject,
        },
      }).catch((err) => { throw err; });
      var khariu = JSON.parse(response.body);
      var khariltsakh = khariu?.data?.types[0].accounts?.filter(
        (e) => e.accountNo === dans.dugaar
      )[0];
      res.send({ uldegdel: khariltsakh?.balance });

    } else if (dans && dans.bank === "trans") {
      var tokenObject = await transTokenAvya(dans, tukhainBaaziinKholbolt);
      var url =
        process.env.TRANS_SERVER +
        "/getAccountBalance?apikey=" +
        (dans.apikey ? dans.apikey : "p_uZ6A");
      const response = await got.post(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + tokenObject.token,
        },
        json: { acnt_code: dans.dugaar },
      }).catch((err) => { throw err; });
      var khariu = JSON.parse(response.body);
      res.send(khariu);

    } else {
      res.send({ uldegdel: 0 });
    }
  } catch (err) {
    next(err);
  }
});

// POST /bankniiKhuulgaTatajKhadgalya — банкны хуулга татаж хадгалах
router.post("/bankniiKhuulgaTatajKhadgalya", tokenShalgakh, async (req, res, next) => {
  try {
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    var dansnuud;
    var firstDay;
    var lastDay;

    if (req.body.ognoo) {
      var ognoo = new Date(req.body.ognoo);
      firstDay = new Date(ognoo.getFullYear(), ognoo.getMonth(), 1);
      lastDay = new Date(ognoo.getFullYear(), ognoo.getMonth() + 1, 0);
    } else {
      firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    }

    if (req.body.dansniiDugaar) {
      dansnuud = await Dans(tukhainBaaziinKholbolt).find({
        corporateAshiglakhEsekh: true,
        dugaar: req.body.dansniiDugaar,
      }).lean();
    } else {
      dansnuud = await Dans(tukhainBaaziinKholbolt).find({
        corporateAshiglakhEsekh: true,
        oirkhonTatakhEsekh: { $exists: false },
        baiguullagiinId: req.body.baiguullagiinId,
      }).lean();
    }

    if (!dansnuud || dansnuud.length === 0) {
      return res.status(200).send("Татах дансны мэдээлэл байхгүй!");
    }

    const { Token } = require("zevbackv2");

    for (const dans of dansnuud) {
      try {
        if (dans.bank === "khanbank") {
          var query = {
            turul: "khaanCorporate",
            baiguullagiinId: dans.baiguullagiinId,
            ognoo: { $gte: new Date(new Date().getTime() - 29 * 60000) },
          };
          if (dans.corporateBarilgaTusBur && !!dans.barilgiinId)
            query["barilgiinId"] = dans.barilgiinId;
          var tokenObject = await Token(tukhainBaaziinKholbolt).findOne(query);
          var token;
          if (!tokenObject) {
            tokenObject = await tokenAvya(
              dans.corporateNevtrekhNer,
              dans.corporateNuutsUg,
              next,
              dans.baiguullagiinId,
              dans.corporateBarilgaTusBur ? dans.barilgiinId : null,
              tukhainBaaziinKholbolt
            );
            token = tokenObject?.access_token;
          } else token = tokenObject.token;

          var maxMatch = { dansniiDugaar: dans.dugaar, baiguullagiinId: dans.baiguullagiinId };
          if (dans.barilgiinId) maxMatch.barilgiinId = dans.barilgiinId;
          var maxAgg = [
            { $match: maxMatch },
            { $group: { _id: "$dansniiDugaar", max: { $max: { $toInt: "$record" } } } },
          ];
          var max = await BankniiGuilgee(tukhainBaaziinKholbolt, false).aggregate(maxAgg);
          console.log(`📌 [ХУУЛГА] khanbank ${dans.dugaar}: max record=${max?.[0]?.max ?? "байхгүй (бүгдийг татна)"} barilgiinId=${dans.barilgiinId || "тохируулаагүй"}`);
          var bodyKhuulga = {
            baiguullagiinId: dans.baiguullagiinId,
            barilgiinId: dans.barilgiinId,
            dansniiDugaar: dans.dugaar,
            corporateShunuUntraakhEsekh: dans.corporateShunuUntraakhEsekh,
          };
          if (max && max.length !== 0) bodyKhuulga["record"] = max[0].max;
          var khariu = await dansniiKhuulgaAvya(token, next, bodyKhuulga);

          if (khariu && khariu.transactions) {
            var guilgeenuud = khariu.transactions.map((mur) => {
              var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))(mur);
              g.dansniiDugaar = dans.dugaar;
              g.bank = dans.bank;
              g.baiguullagiinId = dans.baiguullagiinId;
              g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
              return g;
            });
            await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch(() => { });
          }

        } else if (dans.bank === "tdb") {
          if (!!dans.corporateNevtrekhNer && !!dans.corporateNuutsUg && !dans.AnyBIC && !dans.RoleID &&
            !!dans.dugaar && (dans.dugaar.includes("mn") || dans.dugaar.includes("MN"))) {
            var tokenObject = await tdbTokenAvya(dans, tukhainBaaziinKholbolt);
            var url = process.env.TDB_SERVER + "/accounts/statement/" + dans.dugaar;
            var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
              .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar })
              .sort({ TxDt: -1 }).limit(1);
            if (!!maxDoc) firstDay = new Date(maxDoc.TxDt);
            const fmt = (d) =>
              d.getFullYear() + "/" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "/" +
              (d.getDate() < 10 ? "0" : "") + d.getDate();
            url += `?from=${fmt(firstDay)}&to=${fmt(lastDay)}&page=0&size=100`;
            var response = await axios.get(url, {
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenObject.token },
            }).catch(() => { });
            var khariu = response?.data;
            if (!!khariu && !!khariu.txn && khariu.txn.length > 0) {
              var guilgeenuud = khariu.txn.map((mur) => {
                var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                  TxDt: mur?.txndate, refno: mur?.refno, TxAddInf: mur?.txndesc,
                  Amt: mur?.credit ? mur?.credit : mur?.debit, balance: mur?.balance,
                  CtAcntOrg: mur?.contacntno, CtActnName: mur?.contacntname,
                  curRate: mur?.currate, CtBankNo: mur?.bankcode,
                });
                g.dansniiDugaar = dans.dugaar; g.bank = dans.bank;
                g.baiguullagiinId = dans.baiguullagiinId; g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
                return g;
              });
              await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch(() => { });
            }
          }

        } else if (dans.bank === "golomt") {
          var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
            .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar, bank: "golomt" })
            .sort({ createdAt: -1 }).limit(1);
          if (!!maxDoc) firstDay = new Date(maxDoc.tranDate);
          const fmtDash = (d) =>
            d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
            (d.getDate() < 10 ? "0" : "") + d.getDate();
          var yawuulaxBody = {
            registerNo: dans.register, accountId: dans.dugaar,
            startDate: fmtDash(firstDay), endDate: fmtDash(lastDay),
          };
          var khariu = await golomtServiceDuudya(
            dans, yawuulaxBody, "/v1/account/operative/statement", "OPERACCTSTA", next, tukhainBaaziinKholbolt
          );
          if (!!khariu && !!khariu.statements && khariu.statements.length > 0) {
            var guilgeenuud = khariu.statements.map((mur) => {
              var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                requestId: mur?.requestId, recNum: mur?.recNum, tranId: mur?.tranId,
                tranDate: mur?.tranDate, drOrCr: mur?.drOrCr, tranAmount: mur?.tranAmount,
                tranDesc: mur?.tranDesc, tranPostedDate: mur?.tranPostedDate,
                tranCrnCode: mur?.tranCrnCode, exchRate: mur?.exchRate, balance: mur?.balance,
                accName: mur?.accName, accNum: mur?.accNum,
              });
              g.dansniiDugaar = dans.dugaar; g.bank = dans.bank;
              g.baiguullagiinId = dans.baiguullagiinId; g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
              return g;
            });
            await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch((err) => {
              console.error("BankniiGuilgee golomt insertMany >>>", err);
            });
          }

        } else if (dans.bank === "bogd") {
          var tokenObject = await bogdTokentAvya(dans, tukhainBaaziinKholbolt);
          var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
            .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar })
            .sort({ createdAt: -1 }).limit(1);
          if (!!maxDoc) firstDay = new Date(maxDoc.tranDate);
          const fmtDash = (d) =>
            d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
            (d.getDate() < 10 ? "0" : "") + d.getDate();
          const paramsVal = new URLSearchParams(
            "account_no=" + dans.dugaar + "&start_date=" + fmtDash(firstDay) + "&end_date=" + fmtDash(lastDay)
          );
          const response = await got.post(process.env.BOGD_SERVER + "api/statement", {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              lang_code: "MN",
              Authorization: "Bearer " + tokenObject,
            },
            body: paramsVal.toString(),
          }).catch((err) => { throw err; });
          var khariu = JSON.parse(response.body);
          var guilgeenuud = [];
          if (khariu?.data?.transactions?.length > 0) {
            khariu.data.transactions.forEach((mur) => {
              var postedDate = new Date(mur?.date);
              postedDate.setHours(mur?.time?.split(":")[0]);
              postedDate.setMinutes(mur?.time?.split(":")[1]);
              postedDate.setSeconds(mur?.time?.split(":")[2]);
              guilgeenuud.push(new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                requestId: mur?.txn_id, recNum: mur?.txn_no, tranId: mur?.txn_id,
                tranDate: new Date(mur?.date), drOrCr: "Credit", amount: mur?.debit,
                description: mur?.description, tranPostedDate: postedDate,
                tranCrnCode: mur?.currency, exchRate: 1, balance: mur?.balance_after,
                beforeBalance: mur?.balance_before, accName: mur?.to_acc_name,
                accNum: mur?.to_acc_no, relatedAccount: mur?.to_acc_no, time: mur?.time,
              }));
            });
          }
          // Deduplicate — skip already-saved records
          var ustgakhJagsaalt = [];
          for (const item of guilgeenuud) {
            var existing = await BankniiGuilgee(tukhainBaaziinKholbolt, false).findOne({
              requestId: item.requestId, recNum: item.recNum,
              dansniiDugaar: dans.dugaar, barilgiinId: dans.barilgiinId,
            });
            if (existing) ustgakhJagsaalt.push(item);
          }
          guilgeenuud = guilgeenuud.filter((el) => !ustgakhJagsaalt.includes(el));
          guilgeenuud.forEach((x) => {
            x.dansniiDugaar = dans.dugaar; x.bank = dans.bank;
            x.baiguullagiinId = dans.baiguullagiinId; x.barilgiinId = dans.barilgiinId;
          });
          await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch((err) => { next(err); });

        } else if (dans.bank === "trans") {
          var tokenObject = await transTokenAvya(dans, tukhainBaaziinKholbolt);
          var url =
            process.env.TRANS_SERVER +
            "/getStatement?apikey=" +
            (dans.apikey ? dans.apikey : "p_uZ6A");
          var maxDoc = await BankniiGuilgee(tukhainBaaziinKholbolt, false)
            .findOne({ barilgiinId: dans.barilgiinId, dansniiDugaar: dans.dugaar })
            .sort({ createdAt: -1 }).limit(1);
          if (!!maxDoc) firstDay = new Date(maxDoc.txnDate);
          const fmtDash = (d) =>
            d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" +
            (d.getDate() < 10 ? "0" : "") + d.getDate();
          const response = await got.post(url, {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + tokenObject.token,
            },
            json: {
              acnt_code: dans.dugaar,
              start_date: fmtDash(firstDay),
              end_date: fmtDash(lastDay),
              start_paging_position: 0,
              page_row_count: 100,
            },
          }).catch((err) => { throw err; });
          var khariu = JSON.parse(response.body);
          if (!!khariu && !!khariu.result && !!khariu.result.txns && khariu.result.txns.length > 0) {
            var guilgeenuud = khariu.result.txns.map((mur) => {
              var g = new (BankniiGuilgee(tukhainBaaziinKholbolt))({
                jrno: mur?.jrno, jritemNo: mur?.jritemNo, contCurRate: mur?.contCurRate,
                username: mur?.username, userId: mur?.userId, userBrchCode: mur?.userBrchCode,
                txnCode: mur?.txnCode, txnNo: mur?.txnNo, balTypeCode: mur?.balTypeCode,
                income: mur?.income, outcome: mur?.outcome, curCode: mur?.curCode,
                curRate: mur?.curRate, contAcntName: mur?.contAcntName, contAcntCode: mur?.contAcntCode,
                contBankAcntCode: mur?.contBankAcntCode, contBankAcntName: mur?.contBankAcntName,
                txnDesc: mur?.txnDesc, txnDate: mur?.txnDate, postDate: mur?.postDate,
              });
              g.dansniiDugaar = dans.dugaar; g.bank = dans.bank;
              g.baiguullagiinId = dans.baiguullagiinId; g.barilgiinId = dans.barilgiinId || req.body.barilgiinId || null;
              return g;
            });
            await BankniiGuilgee(tukhainBaaziinKholbolt).insertMany(guilgeenuud).catch((err) => { next(err); });
          }
        }

      } catch (aldaaa) {
        console.error("bankniiKhuulgaTatajKhadgalya дотоод алдаа:", aldaaa?.message || aldaaa);
        continue;
      }
    }

    const io = req.app.get("socketio");
    if (io) io.emit("baiguullagiin" + req.body.baiguullagiinId, { turul: "bankniiGuilgeeShine" });
    res.status(200).send("Амжилттай татаж хадгаллаа");
  } catch (err) {
    console.error("bankniiKhuulgaTatajKhadgalya >>>", err);
    next(err);
  }
});

// Extract тоот number from description
// Handles: "147тоот", "134 тоот", "123toot", "605TOOT95393408", "ТООТ147"
// Fallback: "106 ХААНААС: 150000..." — leading digits before ХААНААС
// тоот is always ≤4 digits — phone numbers (8 digits) excluded automatically
function tootOlgokh(desc) {
  if (!desc) return null;
  // digits (1-4) BEFORE тоот keyword: "605TOOT..." → 605
  const before = desc.match(/(\d{1,4})\s*(?:тоот|toot|ТООТ|TOOT)/i);
  if (before) return before[1];
  // digits (1-4) AFTER тоот keyword: "ТООТ147"
  const after = desc.match(/(?:тоот|toot|ТООТ|TOOT)\s*(\d{1,4})(?!\d)/i);
  if (after) return after[1];
  // fallback: leading digits (1-4) before ХААНААС — "106 ХААНААС: ..."
  const khaanFallback = desc.match(/^(\d{1,4})\s+ХААНААС/i);
  if (khaanFallback) return khaanFallback[1];
  return null;
}

// Extract 8-digit Mongolian phone number (starts with 5-9)
// No word boundary needed — handles "TOOT95393408" correctly
function utasOlgokh(desc) {
  if (!desc) return null;
  const m = desc.match(/[5-9]\d{7}/);
  return m ? m[0] : null;
}

// POST /tulultTaniya — шинэ гүйлгээнүүд дотроос тулалт таних
router.post("/tulultTaniya", tokenShalgakh, async (req, res, next) => {
  try {
    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    const Geree = require("../models/geree");
    const guilgeeService = require("../services/guilgeeService");

    var dansnuud = await Dans(tukhainBaaziinKholbolt).find({
      corporateAshiglakhEsekh: true,
      oirkhonTatakhEsekh: { $exists: false },
      baiguullagiinId: req.body.baiguullagiinId,
    }).lean();

    console.log(`🚀 [ТУЛАЛТ] эхэлж байна — baiguullagiinId=${req.body.baiguullagiinId}`);
    var tulultBolsonToo = 0;

    if (dansnuud?.length > 0) {
      for (const dans of dansnuud) {
        // barilgiinId may not be set on older/CGW records — only filter if present
        var match = {
          dansniiDugaar: dans.dugaar,
          baiguullagiinId: dans.baiguullagiinId,
          bank: dans.bank,
          $or: [
            { kholbosonTalbainId: { $size: 0 } },
            { kholbosonTalbainId: { $exists: false } },
          ],
        };
        if (dans.barilgiinId) match.barilgiinId = dans.barilgiinId;
        var guilgeenuud = await BankniiGuilgee(tukhainBaaziinKholbolt, false).find(match).lean();
        console.log(`🔍 [ТУЛАЛТ] ${dans.bank} ${dans.dugaar}: ${guilgeenuud.length} боловсруулах гүйлгээ`);
        const GuilgeeAvlaguudModel = require("../models/guilgeeAvlaguud");

        for (const guilgee of guilgeenuud) {
          try {
            const desc = guilgee.description || guilgee.TxAddInf || guilgee.tranDesc || guilgee.txnDesc || "";
            const toot = tootOlgokh(desc);
            console.log(`  📄 id=${guilgee._id} desc="${desc.slice(0, 60)}" → тоот=${toot}`);
            if (!toot) continue;

            // Amount: must be positive incoming payment
            let dun = 0;
            if (guilgee.bank === "khanbank") dun = guilgee.amount;
            else if (guilgee.bank === "golomt") {
              if (guilgee.drOrCr === "Debit") continue;
              dun = guilgee.tranAmount;
            }
            else if (guilgee.bank === "tdb") dun = guilgee.Amt;
            else if (guilgee.bank === "bogd") dun = guilgee.amount;
            else if (guilgee.bank === "trans") dun = guilgee.income > 0 ? guilgee.income : 0;
            console.log(`     💰 dun=${dun}`);
            if (!dun || dun <= 0) continue;

            // Prevent duplicate first (cheap check before heavy DB queries)
            const existing = await GuilgeeAvlaguudModel(tukhainBaaziinKholbolt)
              .findOne({ bankniiGuilgeeId: String(guilgee._id), baiguullagiinId: dans.baiguullagiinId })
              .lean().catch(() => null);
            if (existing) {
              console.log(`     ⚠️ Давхардсан — аль хэдийн бүртгэсэн: ${existing._id}`);
              await BankniiGuilgee(tukhainBaaziinKholbolt).findByIdAndUpdate(guilgee._id,
                { $addToSet: { kholbosonTalbainId: String(existing.gereeniiId) } }
              );
              continue;
            }

            // Find active contracts matching тоот (exclude terminated)
            const tootStr = String(Number(toot));
            var gereeMatch = {
              baiguullagiinId: dans.baiguullagiinId,
              $or: [{ toot: toot }, { toot: tootStr }],
              tuluv: { $nin: ["Цуцалсан", "Дууссан"] },
            };
            if (dans.barilgiinId) gereeMatch.barilgiinId = dans.barilgiinId;
            var gereenuud = await Geree(tukhainBaaziinKholbolt, false).find(gereeMatch).lean();
            console.log(`     🏠 тоот=${toot} query=${JSON.stringify(gereeMatch)} → ${gereenuud.length} гэрээ`);

            // Narrow by phone if multiple contracts match
            const utas = utasOlgokh(desc);
            if (utas && gereenuud.length > 1) {
              const byUtas = gereenuud.filter(g =>
                Array.isArray(g.utas) ? g.utas.some(u => String(u) === utas) : String(g.utas) === utas
              );
              if (byUtas.length > 0) gereenuud = byUtas;
            }

            if (gereenuud.length === 0) {
              console.log(`     ⚠️  тоот=${toot} — гэрээ олдсонгүй`);
              continue;
            }
            if (gereenuud.length > 1) {
              // tiebreaker: pick the most recently updated active contract
              gereenuud.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
              console.log(`     ℹ️  тоот=${toot} — ${gereenuud.length} гэрээ, хамгийн сүүлд идэвхтэй гэрээг авлаа: ${gereenuud[0].gereeniiDugaar}`);
              console.log(`        гэрээнүүд: ${gereenuud.map(g => `${g.gereeniiDugaar}(utas:${(g.utas||[]).join(',')})`).join(' | ')}`);
            }

            const geree = gereenuud[0];

            await guilgeeService.recordPayment(tukhainBaaziinKholbolt, {
              baiguullagiinId: String(dans.baiguullagiinId),
              barilgiinId: String(geree.barilgiinId || dans.barilgiinId || ""),
              gereeniiId: String(geree._id),
              gereeniiDugaar: geree.gereeniiDugaar || "",
              orshinSuugchId: geree.orshinSuugchId || "",
              toot: toot,
              ognoo: guilgee.postDate || guilgee.tranDate || guilgee.TxDt || guilgee.txnDate || new Date(),
              dun: -Math.abs(dun),
              tailbar: `Банкны хуулга тулалт - ${desc.slice(0, 80)}`,
              source: "bank",
              bankniiGuilgeeId: String(guilgee._id),
              dansniiDugaar: dans.dugaar,
            });

            await BankniiGuilgee(tukhainBaaziinKholbolt).findByIdAndUpdate(guilgee._id, {
              $addToSet: { kholbosonTalbainId: String(geree._id) },
            });

            tulultBolsonToo++;
            console.log(`✅ [ТУЛАЛТ] тоот=${toot} geree=${geree.gereeniiDugaar} dun=${dun}`);
          } catch (guilgeeAldaa) {
            console.error(`❌ [ТУЛАЛТ] guilgee=${guilgee._id} алдаа:`, guilgeeAldaa?.message);
            // continue to next transaction
          }
        }
      }
    }
    console.log(`🏁 [ТУЛАЛТ] дууслаа — нийт тулалт: ${tulultBolsonToo}`);
    res.status(200).json({ message: "Тулалт амжилттай", tulultBolsonToo });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

