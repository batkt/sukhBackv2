const express = require("express");
const router = express.Router();
const Ajiltan = require("../models/ajiltan");
const NevtreltiinTuukh = require("../models/nevtreltiinTuukh");
const BackTuukh = require("../models/backTuukh");
const Baiguullaga = require("../models/baiguullaga");
const request = require("request");
const {
  crudWithFile,
  crud,
  UstsanBarimt,
  tokenShalgakh,
} = require("zevbackv2");
const {
  ajiltanNevtrey,
  backAvya,
  tokenoorAjiltanAvya,
  nuutsUgShalgakhAjiltan,
  zochiniiTokenAvya,
  erkhiinMedeelelAvya,
  khugatsaaguiTokenAvya,
  baiguullagaIdgaarAvya,
  ajiltanGaraa,
  sessionShalgakh,
} = require("../controller/ajiltan");

crudWithFile(
  router,
  "ajiltan",
  Ajiltan,
  {
    fileZam: "./zurag/ajiltan",
    fileName: "zurag",
  },
  UstsanBarimt,
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      var ajiltanModel = Ajiltan(db.erunkhiiKholbolt);

      // Log albanTushaal if present in request body
      if (req.body?.albanTushaal !== undefined) {
      }

      if (req.params.id) {
        var ObjectId = require("mongodb").ObjectId;
        var ajiltan = await ajiltanModel.findOne({
          nevtrekhNer: req.body?.nevtrekhNer,
          _id: { $ne: ObjectId(req.params.id) },
        });
        if (ajiltan) throw new Error("Нэвтрэх нэр давхардаж байна!");
      } else {
        if (req.body?.nevtrekhNer) {
          var ajiltan = await ajiltanModel.findOne({
            nevtrekhNer: req.body.nevtrekhNer,
          });
          if (ajiltan) throw new Error("Нэвтрэх нэр давхардаж байна!");
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  },
);
crud(router, "nevtreltiinTuukh", NevtreltiinTuukh, UstsanBarimt);

router.get("/sessionAvya/:sessionId", async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const { db } = require("zevbackv2");
    const sessionData = await session(db.erunkhiiKholbolt).findById(sessionId);

    if (!sessionData) {
      throw new aldaa("Session олдсонгүй");
    }
    res.send(sessionData);
  } catch (err) {
    next(err);
  }
});

router.route("/ajiltanNevtrey").post(ajiltanNevtrey);
router.route("/tokenoorAjiltanAvya").post(tokenoorAjiltanAvya);
router.route("/nuutsUgShalgakhAjiltan").post(nuutsUgShalgakhAjiltan);
router.route("/zochiniiTokenAvya/:baiguullagiinId").get(zochiniiTokenAvya);
router.route("/khugatsaaguiTokenAvya").post(khugatsaaguiTokenAvya);
router
  .route("/erkhiinMedeelelAvya")
  .post(tokenShalgakh, sessionShalgakh, erkhiinMedeelelAvya);
router.route("/ajiltanGaraa").post(ajiltanGaraa);
router
  .route("/baiguullagaIdgaarAvya")
  .post(tokenShalgakh, sessionShalgakh, baiguullagaIdgaarAvya);
router.get("/ajiltniiZuragAvya/:baiguullaga/:ner", (req, res, next) => {
  const fileName = req.params.ner;
  const directoryPath = "zurag/ajiltan/" + req.params.baiguullaga + "/";
  res.download(directoryPath + fileName, fileName, (err) => {
    if (err) {
      next(err);
    }
  });
});

router.get("/ustsanBarimt", tokenShalgakh, async (req, res, next) => {
  try {
    const body = req.query;
    const {
      query = {},
      order,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 10,
      search,
      collation = {},
      select = {},
    } = body;
    if (!!body?.query) body.query = JSON.parse(body.query);
    if (req.body.baiguullagiinId) {
      if (!body.query) body.query = {};
      body.query["baiguullagiinId"] = req.body.baiguullagiinId;
    }
    if (!!body?.order) body.order = JSON.parse(body.order);
    if (!!body?.select) body.select = JSON.parse(body.select);
    if (!!body?.collation) body.collation = JSON.parse(body.collation);
    if (!!body?.khuudasniiDugaar)
      body.khuudasniiDugaar = Number(body.khuudasniiDugaar);
    if (!!body?.khuudasniiKhemjee)
      body.khuudasniiKhemjee = Number(body.khuudasniiKhemjee);
    let jagsaalt = await UstsanBarimt(req.body.tukhainBaaziinKholbolt)
      .find(body.query)
      .sort(body.order)
      .collation(body.collation ? body.collation : {})
      .skip((body.khuudasniiDugaar - 1) * body.khuudasniiKhemjee)
      .limit(body.khuudasniiKhemjee);
    let niitMur = await UstsanBarimt(
      req.body.tukhainBaaziinKholbolt,
    ).countDocuments(body.query);
    let niitKhuudas =
      niitMur % khuudasniiKhemjee == 0
        ? Math.floor(niitMur / khuudasniiKhemjee)
        : Math.floor(niitMur / khuudasniiKhemjee) + 1;
    if (jagsaalt != null) jagsaalt.forEach((mur) => (mur.key = mur._id));
    res.send({
      khuudasniiDugaar,
      khuudasniiKhemjee,
      jagsaalt,
      niitMur,
      niitKhuudas,
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/tsonkhniiErkhiinTooAvya",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      if (req.body.erkhuud && req.body.erkhuud.length > 0)
        var moduluud = req.body.erkhuud;
      var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findOne({
        register: req.body.register,
      });
      for await (const element of moduluud) {
        var queryAjiltan = {
          tsonkhniiErkhuud: element.zam,
          baiguullagiinId: baiguullaga._id,
        };
        var ajiltanErkhiinToo = await Ajiltan(
          db.erunkhiiKholbolt,
        ).countDocuments(queryAjiltan);
        element.odoogiin = ajiltanErkhiinToo;
      }
      res.send(moduluud);
    } catch (error) {
      next(error);
    }
  },
);

router.post("/ajiltandTokenOnooyo", tokenShalgakh, (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    let filter = {
      _id: req.body.id,
    };
    let update = {
      firebaseToken: req.body.token,
    };
    Ajiltan(db.erunkhiiKholbolt)
      .updateOne(filter, update)
      .then((result) => {
        res.send("Amjilttai");
      })
      .catch((err) => {
        next(err);
      });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/ajiltniiTokhirgooZasya",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      if (!!req.body) {
        const { turul, ajiltnuud } = req.body;
        for await (const ajiltan of ajiltnuud) {
          await Ajiltan(db.erunkhiiKholbolt)
            .updateOne(
              { _id: ajiltan._id },
              { $set: { [turul]: ajiltan.utga } },
            )
            .catch((err) => {
              next(err);
            });
        }
        res.send("Amjilttai");
      } else next(new aldaa("Засах боломжгүй байна"));
    } catch (error) {
      next(error);
    }
  },
);

router.post("/ajiltandErkhUgyu/:id", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    if (!!req.body) {
      var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        req.body.baiguullagiinId,
      );
      var ajiltan = new Ajiltan(db.erunkhiiKholbolt)({
        _id: req.params.id,
        ...req.body,
      });
      await Ajiltan(db.erunkhiiKholbolt).updateOne(
        { _id: req.params.id },
        ajiltan,
      );
      if (req.body.erkhuud && req.body.erkhuud.length > 0) {
        for await (const element of req.body.erkhuud) {
          var queryAjiltan = {
            tsonkhniiErkhuud: element.zam,
            baiguullagiinId: req.body.baiguullagiinId,
          };
          var ajiltanErkhiinToo = await Ajiltan(
            db.erunkhiiKholbolt,
          ).countDocuments(queryAjiltan);
          element.too = ajiltanErkhiinToo;
        }
        var ilgeekhBody = {
          register: baiguullaga.register,
          erkhuud: req.body.erkhuud,
        };
        await request.post(
          "http://103.143.40.123:8282/erkhOruulya",
          { json: true, body: ilgeekhBody },
          (err, res1, body) => {
            if (err) next(err);
          },
        );
      }
      res.send("Amjilttai");
    } else next(new aldaa("Засах боломжгүй байна"));
  } catch (error) {
    next(error);
  }
});

router.post("/erkhteiEsekh", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    if (!!req.body.zam) {
      const khariu = await Ajiltan(db.erunkhiiKholbolt)
        .countDocuments({
          _id: req.body.nevtersenAjiltniiToken?.id,
          $or: [{ tsonkhniiErkhuud: req.body.zam }, { erkh: "Admin" }],
        })
        .catch((err) => {
          next(err);
        });
      res.send(!!khariu);
    } else next(new aldaa("Засах боломжгүй байна"));
  } catch (error) {
    next(error);
  }
});

router.post("/backAvya", tokenShalgakh, backAvya);

router.get("/licenseOgnooAvya", tokenShalgakh, async (req, res, next) => {
  try {
    request.get(
      "http://103.143.40.123:8282/baiguullagiinDuusakhKhugatsaaAvya",
      { json: true, body: { register: req.body.register, system: "Sukh" } },
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

module.exports = router;
