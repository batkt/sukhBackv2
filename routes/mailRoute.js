const express = require("express");
const router = express.Router();
const axios = require("axios");
const {
  tokenShalgakh,
  Dugaarlalt,
  MaililgeesenKhariu,
  TodorkhoiloltiinTuukh,
} = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Sonorduulga = require("../models/medegdel");
const MailIlgeeye = require("../components/mailIlgeeye");
const aldaa = require("../components/aldaa");

router.post("/mailOlnoorIlgeeye", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      req.body.baiguullagiinId
    );

    if (req.body.subject === "Түрээсийн төлбөр" && !!req.body.gereenuud) {
      var ilgeekhBody = {
        mailuud: req.body.mailuud,
        baiguullaga: baiguullaga,
        subject: req.body.subject,
      };
      const resIgeeye = await axios.post(
        "http://103.143.40.123:8282/tureesMailIlgeeye",
        ilgeekhBody
      );
      const body = resIgeeye.data;
      if (body?.length > 0) {
        await MaililgeesenKhariu(req.body.tukhainBaaziinKholbolt).insertMany(
          body
        );
      }
      for await (const tempData of req.body.gereenuud) {
        const tuukh = new NekhemjlekhiinTuukh(
          req.body.tukhainBaaziinKholbolt
        )();
        tuukh.baiguullagiinNer = tempData.baiguullagiinNer;
        tuukh.baiguullagiinId = tempData.baiguullagiinId;
        tuukh.barilgiinId = tempData.barilgiinId;
        tuukh.ovog = tempData.ovog;
        tuukh.ner = tempData.ner;
        tuukh.register = tempData.register;
        tuukh.utas = tempData.utas;
        tuukh.khayag = tempData.khayag;
        tuukh.khugatsaa = tempData.khugatsaa;
        tuukh.duusakhOgnoo = tempData.duusakhOgnoo;
        tuukh.turul = tempData.turul;
        tuukh.gereeniiOgnoo = tempData.gereeniiOgnoo;
        tuukh.gereeniiId = tempData._id;
        tuukh.gereeniiDugaar = tempData.gereeniiDugaar;
        tuukh.talbainIdnuud = tempData.talbainIdnuud;
        tuukh.talbainDugaar = tempData.talbainDugaar;
        tuukh.talbainNegjUne = tempData.talbainNegjUne;
        tuukh.talbainNiitUne = tempData.talbainNiitUne;
        tuukh.talbainKhemjee = tempData.talbainKhemjee;
        tuukh.talbainKhemjeeMetrKube = tempData.talbainKhemjeeMetrKube;
        tuukh.davkhar = tempData.davkhar;
        tuukh.baritsaaAvakhDun = tempData.baritsaaAvakhDun;
        tuukh.baritsaaniiUldegdel = tempData.baritsaaniiUldegdel;
        tuukh.baritsaaAvakhKhugatsaa = tempData.baritsaaAvakhKhugatsaa;
        tuukh.uldegdel = tempData.globalUldegdel || 0;
        tuukh.daraagiinTulukhOgnoo = tempData.daraagiinTulukhOgnoo;
        tuukh.dansniiDugaar = tempData.dans;
        tuukh.gereeniiZagvariinId = tempData.gereeniiZagvariinId;
        tuukh.tulukhUdur = tempData.tulukhUdur;
        tuukh.tuluv = tempData.tuluv;
        tuukh.ognoo = tempData.ognoo;
        tuukh.mailKhayagTo = tempData.mail;
        tuukh.maililgeesenAjiltniiId = tempData.maililgeesenAjiltniiId;
        tuukh.maililgeesenAjiltniiNer = tempData.maililgeesenAjiltniiNer;
        tuukh.nekhemjlekhiinZagvarId = tempData.nekhemjlekhiinZagvarId;
        tuukh.tsonkhniiNer = tempData.tsonkhniiNer;
        tuukh.medeelel = tempData.medeelel;
        tuukh.nekhemjlekh = tempData.nekhemjlekh;
        tuukh.zagvariinNer = tempData.zagvariinNer;
        tuukh.content = req.body.mailuud?.filter(
          (a) =>
            a.mail === tempData.mail &&
            a.gereeniiDugaar === tempData.gereeniiDugaar
        )[0]?.content;
        tuukh.nekhemjlekhiinDans = tempData.nekhemjlekhiinDans;
        tuukh.nekhemjlekhiinDansniiNer = tempData.nekhemjlekhiinDansniiNer;
        tuukh.nekhemjlekhiinBank = tempData.nekhemjlekhiinBank;
        tuukh.nekhemjlekhiinIbanDugaar = tempData.nekhemjlekhiinIbanDugaar;
        tuukh.nekhemjlekhiinOgnoo = req.body.ognoo;
        tuukh.nekhemjlekhiinDugaar = tempData.nekhemjlekhiinDugaar;
        tuukh.dugaalaltDugaar = tempData.dugaalaltDugaar;
        if (!!tempData.nekhemjlekhiinDugaar)
          await Dugaarlalt(req.body.tukhainBaaziinKholbolt).insertMany({
            baiguullagiinId: tempData.baiguullagiinId,
            barilgiinId: tempData.barilgiinId,
            turul: "nekhemjlekhTurees",
            ognoo: new Date(),
            dugaar: tempData.dugaalaltDugaar,
          });
        await tuukh
          .save()
          .then((result) => {})
          .catch((err) => {
            next(err);
          });
        var update = {
          nekhemjlekhiinOgnoo: req.body.ognoo,
        };
        await Geree(req.body.tukhainBaaziinKholbolt).findByIdAndUpdate(
          tempData._id,
          update
        );
      }
      res.send(body);
    } else if (req.body.subject === "Тодорхойлолт") {
      var ilgeekhBody = {
        mailuud: req.body.mailuud,
        baiguullaga: baiguullaga,
        subject: req.body.subject,
      };
      const resIgeeye = await axios.post(
        "http://103.143.40.123:8282/tureesMailIlgeeye",
        ilgeekhBody
      );
      const body = resIgeeye.data;
      if (body?.length > 0) {
        await MaililgeesenKhariu(req.body.tukhainBaaziinKholbolt).insertMany(
          body
        );
      }
      if (!!req.body.todorkhoilolt) {
        const tod = new TodorkhoiloltiinTuukh(req.body.tukhainBaaziinKholbolt)(
          req.body.todorkhoilolt
        );
        tod.mailuud = req.body.mailuud;
        await tod.save();
      }
      res.send(body);
    } else {
      // Get database connection for this organization
      const tukhainBaaziinKholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(req.body.baiguullagiinId)
      );

      for await (const mail of req.body.mailuud) {
        await MailIlgeeye.duriinMailIlgeeye(
          baiguullaga.tokhirgoo.mailNevtrekhNer,
          baiguullaga.tokhirgoo.mailPassword,
          baiguullaga.tokhirgoo.mailHost,
          baiguullaga.tokhirgoo.mailPort,
          mail.mail,
          req.body.subject,
          mail.content,
          mail.gereeniiDugaar
        );

        if (tukhainBaaziinKholbolt) {
          const sonorduulga = new Sonorduulga(tukhainBaaziinKholbolt)();
          sonorduulga.khuleenAvagchiinId = mail.orshinSuugchiinId;
          sonorduulga.barilgiinId = mail.barilgiinId;
          sonorduulga.baiguullagiinId = req.body.baiguullagiinId;
          sonorduulga.orshinSuugchiinNer = mail.orshinSuugchiinNer;
          sonorduulga.title = req.body.subject;
          sonorduulga.message = mail.content;
          sonorduulga.turul = req.body.turul || "Mail";
          sonorduulga.kharsanEsekh = false;
          await sonorduulga.save();
        }
      }
      res.send("Amjilttai");
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
