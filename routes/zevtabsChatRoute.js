/**
 * Zevtabs-ийн chatbot-д оршин суугчийн хаягт холбогдсон СӨХ-ийн нэрийг өгнө.
 *
 * Хуучин хувилбарын апп Zevtabs-ийн чатад `guestId = resident_<id>` гэж
 * бичдэг бөгөөд СӨХ-ийн нэрийг явуулдаггүй. udirdlagaBack энэ endpoint-оор
 * id-гаар нь СӨХ-ийг олж, оператор аль СӨХ-ийн оршин суугчтай ярьж буйгаа
 * харна.
 *
 * Хандалт: зөвхөн сервер хооронд, `x-zevtabs-chat-token` толгойгоор.
 * Цэвэрлэгээний түлхүүрийг (TSEVERLEGEE_SERVICE_TOKEN) ЗОРИУД ашиглаагүй —
 * тэр нь зөвхөн цэвэрлэгээнд хүчинтэй байх ёстой. Энэ түлхүүр нь харин
 * оршин суугчийн нэр, хаягийн СӨХ-ийн нэрээс өөр юу ч уншихгүй.
 *
 * Тохируулаагүй бол (ZEVTABS_CHAT_SERVICE_TOKEN хоосон) үргэлж 401.
 */
const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const router = express.Router();
const { db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const OrshinSuugch = require("../models/orshinSuugch");

const tulkhuurAvya = () => process.env.ZEVTABS_CHAT_SERVICE_TOKEN || "";

function tulkhuurTaaravUu(irsen, khadgalsan) {
  if (!irsen || !khadgalsan) return false;
  const a = Buffer.from(String(irsen));
  const b = Buffer.from(String(khadgalsan));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.get("/zevtabsChat/orshinSuugch/:id", async (req, res, next) => {
  try {
    if (!tulkhuurTaaravUu(req.headers["x-zevtabs-chat-token"], tulkhuurAvya())) {
      return res.status(401).json({ success: false, message: "Эрх байхгүй" });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "id буруу" });
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(id)
      .select("ner baiguullagiinId baiguullagiinNer bairniiNer toot toots")
      .lean();
    if (!orshinSuugch) {
      return res.status(404).json({ success: false, message: "Олдсонгүй" });
    }

    const toots = Array.isArray(orshinSuugch.toots) ? orshinSuugch.toots : [];
    const idNuud = [
      ...new Set(
        [orshinSuugch.baiguullagiinId, ...toots.map((t) => t?.baiguullagiinId)]
          .filter((v) => v && mongoose.Types.ObjectId.isValid(v))
          .map(String),
      ),
    ];
    const baiguullaguud = idNuud.length
      ? await Baiguullaga(db.erunkhiiKholbolt)
          .find({ _id: { $in: idNuud } })
          .select("ner")
          .lean()
      : [];
    const nerMap = new Map(baiguullaguud.map((b) => [String(b._id), b.ner]));

    // Хаяг тус бүрийн СӨХ. WALLET_API хаяг нь байгууллагагүй байж болох тул
    // `soh` талбарыг нөөцөөр авна.
    const sukhuud = [];
    const nemye = (mur) => {
      if (!mur.ner) return;
      if (sukhuud.some((s) => s.ner === mur.ner && s.toot === mur.toot)) return;
      sukhuud.push(mur);
    };
    toots.forEach((t) =>
      nemye({
        baiguullagiinId: t?.baiguullagiinId || null,
        ner: nerMap.get(String(t?.baiguullagiinId || "")) || t?.soh || null,
        bairniiNer: t?.bairniiNer || null,
        toot: t?.toot || t?.walletDoorNo || null,
      }),
    );
    if (!sukhuud.length) {
      nemye({
        baiguullagiinId: orshinSuugch.baiguullagiinId || null,
        ner:
          nerMap.get(String(orshinSuugch.baiguullagiinId || "")) ||
          orshinSuugch.baiguullagiinNer ||
          null,
        bairniiNer: orshinSuugch.bairniiNer || null,
        toot: orshinSuugch.toot || null,
      });
    }

    res.json({ success: true, ner: orshinSuugch.ner || null, sukhuud });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
