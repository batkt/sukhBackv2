const asyncHandler = require("express-async-handler");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const { db } = require("zevbackv2");

/**
 * POST /orshinSuugch/niitTulbur
 *
 * Нэг оршин суугчийн БҮХ байгууллага, БҮХ тоотын үлдэгдлийг нэг дор буцаана.
 *
 * Яагаад тусдаа endpoint болов:
 *   `tokenShalgakh` нь хүсэлт бүрийг token дотор бичигдсэн байгууллагад хатуу
 *   тогтоодог — өгөгдлийн баазын холболтыг `tokenObject.baiguullagiinId`-аар
 *   сонгоод зогсохгүй, `req.query.query.baiguullagiinId`-г ч дарж бичдэг.
 *   Тиймээс клиент талаас өөр байгууллагын гэрээг ЯМАР Ч аргаар татаж
 *   чадахгүй. Оршин суугчийн бичлэг нь нийтийн бааз (`erunkhiiKholbolt`)-д
 *   байдаг тул `toots[].baiguullagiinId`-аас байгууллагуудыг нь уншаад,
 *   тус бүрийн холболтоор нь дамжиж цуглуулах ёстой — үүнийг зөвхөн сервер
 *   талаас хийх боломжтой.
 *
 * Хариу:
 *   { success, niitUldegdel, baiguullaguud: [ { baiguullagiinId, ner,
 *     uldegdel, gereenuud: [ { gereeniiId, gereeniiDugaar, toot, ... } ] } ] }
 */
exports.orshinSuugchNiitTulbur = asyncHandler(async (req, res, next) => {
  try {
    const token = req.body.nevtersenAjiltniiToken;
    if (!token?.id) {
      return res
        .status(401)
        .json({ success: false, message: "Нэвтрэх мэдээлэл олдсонгүй!" });
    }

    // Гэр бүлийн гишүүн нь үндсэн эзэмшигчийн өгөгдлийг уншина.
    const residentId = String(token.undsenId || token.id);

    const resident = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(residentId)
      .lean();

    if (!resident) {
      return res
        .status(404)
        .json({ success: false, message: "Оршин суугч олдсонгүй!" });
    }

    // ── Байгууллагуудыг цуглуулна ────────────────────────────────────────
    const orgIds = new Set();
    if (resident.baiguullagiinId) orgIds.add(String(resident.baiguullagiinId));
    if (Array.isArray(resident.toots)) {
      resident.toots.forEach((t) => {
        if (t?.baiguullagiinId) orgIds.add(String(t.baiguullagiinId));
      });
    }

    const orgIdList = [...orgIds];
    if (orgIdList.length === 0) {
      return res.status(200).json({
        success: true,
        niitUldegdel: 0,
        baiguullaguud: [],
      });
    }

    // Нэрийг нь нэг дуудалтаар авна.
    const orgDocs = await Baiguullaga(db.erunkhiiKholbolt)
      .find({ _id: { $in: orgIdList } })
      .select("ner")
      .lean();
    const orgNerMap = {};
    orgDocs.forEach((o) => {
      orgNerMap[String(o._id)] = o.ner || "";
    });

    let niitUldegdel = 0;
    const baiguullaguud = [];

    for (const orgId of orgIdList) {
      const conn = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(orgId),
      );
      if (!conn) continue;

      // Гэрээ нь эзэмшигчээ `orshinSuugchId` эсвэл `khariltsagchId`-аар
      // холбодог — хоёуланг нь барихгүй бол зарим тоотын үлдэгдэл дутна.
      const gereenuud = await Geree(conn)
        .find({
          tuluv: "Идэвхтэй",
          $or: [
            { orshinSuugchId: residentId },
            { khariltsagchId: residentId },
          ],
        })
        .select(
          "_id gereeniiDugaar toot davkhar orts bairNer barilgiinId ekhniiUldegdel",
        )
        .lean();

      if (gereenuud.length === 0) continue;

      const gereeIds = gereenuud.map((g) => String(g._id));
      const gereeObjectIds = gereenuud.map((g) => g._id);

      // `gereeniiId` нь ихэвчлэн мөр боловч зарим бичлэгт ObjectId хэлбэрээр
      // хадгалагдсан байдаг — одоо байгаа код ч хоёуланг нь шалгадаг.
      const ledger = await GuilgeeAvlaguud(conn).aggregate([
        {
          $match: {
            $or: [
              { gereeniiId: { $in: gereeIds } },
              { gereeniiId: { $in: gereeObjectIds } },
            ],
          },
        },
        {
          // `dun` нь тэмдэгтэй: авлага эерэг, төлөлт сөрөг. Нийлбэр нь
          // тухайн гэрээний цэвэр үлдэгдэл болно.
          $group: { _id: "$gereeniiId", uldegdel: { $sum: "$dun" } },
        },
      ]);

      const ledgerMap = {};
      ledger.forEach((l) => {
        if (l._id !== null && l._id !== undefined) {
          ledgerMap[String(l._id)] = l.uldegdel || 0;
        }
      });

      let orgUldegdel = 0;
      const gereeJagsaalt = gereenuud.map((g) => {
        const gid = String(g._id);
        const uldegdel = ledgerMap[gid] ?? g.ekhniiUldegdel ?? 0;
        orgUldegdel += uldegdel;
        return {
          gereeniiId: gid,
          gereeniiDugaar: g.gereeniiDugaar || "",
          toot: g.toot || "",
          davkhar: g.davkhar || "",
          orts: g.orts || "",
          bairNer: g.bairNer || "",
          barilgiinId: g.barilgiinId || "",
          uldegdel,
        };
      });

      niitUldegdel += orgUldegdel;
      baiguullaguud.push({
        baiguullagiinId: orgId,
        ner: orgNerMap[orgId] || "",
        uldegdel: orgUldegdel,
        gereenuud: gereeJagsaalt,
      });
    }

    res.status(200).json({
      success: true,
      niitUldegdel,
      baiguullaguud,
    });
  } catch (error) {
    next(error);
  }
});
