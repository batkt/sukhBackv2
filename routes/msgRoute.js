const express = require("express");
const router = express.Router();
const axios = require("axios");
const FormData = require("form-data");
const request = require("request");
const { tokenShalgakh, db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const MsgTuukh = require("../models/msgTuukh");

function msgIlgeeye(
  jagsaalt,
  key,
  dugaar,
  khariu,
  index,
  next,
  req,
  res,
  kholbolt,
  baiguullagiinId,
  barilgiinId
) {
  try {
    if (!jagsaalt || index >= jagsaalt.length) {
      if (res && !res.headersSent) {
        res.send(khariu);
      }
      return;
    }

    let activeUrl = "https://api-text.callpro.mn/v1/sms/send";

    const options = {
      method: "POST",
      url: activeUrl,
      headers: {
        "x-api-key": key,
        "api-key": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: {
        key: key,
        from: dugaar,
        to: jagsaalt[index].to.toString(),
        text: jagsaalt[index].text.toString()
      },
      json: true
    };

    console.log(`[msgIlgeeye] Sending message [${index + 1}/${jagsaalt.length}] to: "${jagsaalt[index].to}"`);

    request(options, async (err1, response, body) => {
      console.log(`[msgIlgeeye] Response for ${jagsaalt[index].to}:`, {
        error: err1?.message || null,
        statusCode: response?.statusCode,
        body
      });

      if (err1) {
        if (next) {
          next(err1);
        } else if (res && !res.headersSent) {
          res.status(500).send({ message: "SMS sending failed", error: err1.message });
        }
        return;
      }

      if (response?.statusCode === 404 || (body && (body.reason || body.Result === "FAILED" || body.Result === "ERROR"))) {
        khariu.push({
          status: "ERROR",
          message: (body && (body.reason || body.Message || body.message || body.error)) || "SMS илгээх үед алдаа гарлаа",
        });
        if (res && !res.headersSent) {
          res.send(khariu);
        }
        return;
      }

      try {
        const MsgTuukhModel = MsgTuukh(kholbolt);
        await MsgTuukhModel.create({
          baiguullagiinId: baiguullagiinId,
          barilgiinId: barilgiinId,
          dugaar: [jagsaalt[index].to],
          gereeniiId: jagsaalt[index].gereeniiId,
          msg: jagsaalt[index].text,
          msgIlgeekhKey: key,
          msgIlgeekhDugaar: dugaar,
        });
      } catch (dbErr) {
        console.error("[msgIlgeeye] Database save error:", dbErr.message);
      }

      const responseRaw = Array.isArray(body) && body[0] ? body[0] : body;
      khariu.push(responseRaw || { Result: "SUCCESS", to: jagsaalt[index].to });

      if (jagsaalt.length > index + 1) {
        msgIlgeeye(
          jagsaalt,
          key,
          dugaar,
          khariu,
          index + 1,
          next,
          req,
          res,
          kholbolt,
          baiguullagiinId,
          barilgiinId
        );
      } else {
        if (res && !res.headersSent) {
          res.send(khariu);
        }
      }
    });
  } catch (err) {
    if (next) next(err);
  }
}

async function msgIlgeeyeUnitel(
  jagsaalt,
  key,
  dugaar,
  khariu,
  _index,
  next,
  req,
  res,
  kholbolt,
  baiguullagiinId,
  barilgiinId
) {
  try {
    for await (const data of jagsaalt) {
      const form = new FormData();
      form.append("token_id", key);
      form.append("extension_number", "11");
      form.append("sms_number", dugaar);
      form.append("to", data.to.toString());
      form.append("body", data.text.toString());

      const resp = await axios.post(
        "https://pbxuc.unitel.mn/hodupbx_api/v1.4/sendSms",
        form,
        {
          headers: form.getHeaders(),
          validateStatus: function (status) {
            return status < 700; // Accept any status code < 700
          },
        }
      );

      if (resp?.data?.status === "SUCCESS") {
        const MsgTuukhModel = MsgTuukh(kholbolt);
        await MsgTuukhModel.create({
          baiguullagiinId: baiguullagiinId,
          barilgiinId: barilgiinId,
          dugaar: [data.to],
          gereeniiId: data.gereeniiId,
          msg: data.text,
          msgIlgeekhKey: key,
          msgIlgeekhDugaar: dugaar,
        });

        if (resp && resp.data) {
          resp.data.Result = resp.data.status;
        }
        khariu.push(resp.data);
      } else {
        khariu.push(resp.data);
      }
    }
    res.send(khariu?.length > 0 ? [khariu[0]] : []);
  } catch (err) {
    next(err);
  }
}

router.route("/msgIlgeeye").post(tokenShalgakh, async (req, res, next) => {
  try {
    const { baiguullagiinId, barilgiinId, msgnuud } = req.body;

    if (!baiguullagiinId) {
      return res.status(400).json({
        message: "baiguullagiinId is required",
      });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );

    if (!kholbolt) {
      return res.status(400).json({
        message: "Тохиргоо хийгдээгүй байна!",
      });
    }

    const BaiguullagaModel = Baiguullaga(kholbolt);
    const baiguullaga = await BaiguullagaModel.findById(baiguullagiinId);

    const msgIlgeekhKey =
      "aa8e588459fdd9b7ac0b809fc29cfae3aa8e588459fdd9b7ac0b809fc29cfae3";
    const msgIlgeekhDugaar = "72002002";

    if (!msgnuud || msgnuud.length === 0) {
      return res.status(400).json({
        message: "msgnuud is required",
      });
    }

    const khariu = [];

    msgIlgeeye(
      msgnuud,
      msgIlgeekhKey,
      msgIlgeekhDugaar,
      khariu,
      0,
      next,
      req,
      res,
      kholbolt,
      baiguullagiinId,
      barilgiinId
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
