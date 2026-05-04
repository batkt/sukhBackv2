const asyncHandler = require("express-async-handler");

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Зогсоолын тайлан - Оршин суугчдын урьсан зочдын машин бүртгэл
exports.tailanZogsool = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { Uilchluulegch } = require("sukhParking-v1");
    const OrshinSuugchMashin = require("../models/orshinSuugchMashin");

    const source = req.method === "GET" ? req.query : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      orshinSuugch,
      toot,
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const startDate = ekhlekhOgnoo
      ? new Date(ekhlekhOgnoo)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = duusakhOgnoo
      ? new Date(duusakhOgnoo)
      : new Date(new Date().setHours(23, 59, 59, 999));

    // 1. Get guest car registrations (OrshinSuugchMashin) - zochinTurul != "Оршин суугч"
    const osmPipeline = [
      { $match: { orshinSuugchiinId: { $exists: true, $ne: "" } } },
      { $addFields: { orshinSuugchObjId: { $toObjectId: "$orshinSuugchiinId" } } },
      {
        $lookup: {
          from: "orshinSuugch",
          localField: "orshinSuugchObjId",
          foreignField: "_id",
          as: "resident",
        },
      },
      { $unwind: "$resident" },
      {
        $match: {
          zochinTurul: { $ne: "Оршин суугч" },
          $or: [
            { "resident.baiguullagiinId": String(baiguullagiinId) },
            { "resident.baiguullagiinId": baiguullagiinId },
          ],
        },
      },
    ];
    const lastMatch = osmPipeline[osmPipeline.length - 1].$match;
    if (barilgiinId) lastMatch["resident.barilgiinId"] = String(barilgiinId);
    if (orshinSuugch) {
      const re = new RegExp(escapeRegex(String(orshinSuugch).trim()), "i");
      osmPipeline.push({
        $match: {
          $or: [
            { "resident.ner": re },
            { "resident.ovog": re },
          ],
        },
      });
    }
    if (toot) {
      const tootRe = new RegExp(escapeRegex(String(toot).trim()), "i");
      osmPipeline.push({
        $match: {
          $or: [
            { "resident.toot": tootRe },
            { ezenToot: tootRe },
          ],
        },
      });
    }

    const guestRegistrations = await OrshinSuugchMashin(db.erunkhiiKholbolt).aggregate(osmPipeline);

    // Build plate -> resident map
    const plateToResident = {};
    for (const r of guestRegistrations) {
      const plate = (r.mashiniiDugaar || "").trim().toUpperCase();
      if (!plate) continue;
      const residentId = String(r.orshinSuugchiinId || r.resident?._id);
      if (!plateToResident[plate]) {
        plateToResident[plate] = {
          orshinSuugchiinId: residentId,
          ner: r.resident?.ner || "",
          ovog: r.resident?.ovog || "",
          toot: r.resident?.toot || r.ezenToot || "",
          davkhar: r.resident?.davkhar || "",
          utas: Array.isArray(r.resident?.utas) ? (r.resident.utas[0] || "") : (r.resident?.utas || ""),
        };
      }
    }

    // 2. Get Uilchluulegch (parking records) for date range
    const ulMatch = {
      baiguullagiinId: String(baiguullagiinId),
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (barilgiinId) ulMatch.barilgiinId = String(barilgiinId);

    const uilchluulegchuud = await Uilchluulegch(kholbolt, true)
      .find(ulMatch)
      .lean();

    // 3. Aggregate by resident
    const residentMap = {};
    const guestCarList = [];
    const guestCarSeen = new Set();

    for (const u of uilchluulegchuud) {
      const plate = (u.mashiniiDugaar || "").trim().toUpperCase();
      const resident = plateToResident[plate];
      if (!resident) continue; // Not a guest car, skip

      const mur = u.tuukh?.[0];
      const tsag = mur?.tsagiinTuukh?.[0];
      const orsonTsag = tsag?.orsonTsag ? new Date(tsag.orsonTsag) : null;
      const garsanTsag = tsag?.garsanTsag ? new Date(tsag.garsanTsag) : null;
      const zogssonMinut = orsonTsag && garsanTsag
        ? Math.round((garsanTsag - orsonTsag) / 60000)
        : orsonTsag
        ? Math.round((new Date() - orsonTsag) / 60000)
        : 0;
      const khungulsunMinut = Number(mur?.khungulult || 0) || 0;
      const tulbur = Number(u.niitDun || 0) || 0;
      const tulsunDun = mur?.tulbur?.reduce((s, t) => s + (Number(t?.dun) || 0), 0) || 0;
      const tuluv = mur?.tuluv;
      const tuluvLabel = tuluv === 1 || tuluv === 2 ? "Төлбөртэй" : tulbur <= 0 ? "Үнэгүй" : "Төлөөгүй";

      const detailRow = {
        mashiniiDugaar: u.mashiniiDugaar,
        zogssonMinut,
        khungulsunMinut,
        tulbur,
        tuluv: tuluvLabel,
        orshinSuugchiinId: resident.orshinSuugchiinId,
        ner: resident.ner,
        toot: resident.toot,
        davkhar: resident.davkhar,
        utas: resident.utas,
      };
      const rid = resident.orshinSuugchiinId;
      if (!residentMap[rid]) {
        residentMap[rid] = {
          ner: resident.ner,
          toot: resident.toot,
          davkhar: resident.davkhar,
          utas: resident.utas,
          urisanMachinToo: 0,
          uniquePlates: new Set(),
          niitTulbur: 0,
          khungulultMinut: 0,
          tulsunDun: 0,
          uldegdelTulbur: 0,
          details: [],
        };
      }
      residentMap[rid].uniquePlates.add(plate);
      residentMap[rid].urisanMachinToo = residentMap[rid].uniquePlates.size;
      residentMap[rid].niitTulbur += tulbur;
      residentMap[rid].khungulultMinut += khungulsunMinut;
      residentMap[rid].tulsunDun += tulsunDun;
      residentMap[rid].details.push(detailRow);

      const carKey = `${plate}|${resident.orshinSuugchiinId}`;
      if (!guestCarSeen.has(carKey)) {
        guestCarSeen.add(carKey);
        guestCarList.push({
          mashiniiDugaar: u.mashiniiDugaar,
          orshinSuugchiinNer: resident.ner,
          davkhar: resident.davkhar,
          toot: resident.toot,
          utas: typeof resident.utas === "string" ? resident.utas : (Array.isArray(resident.utas) ? resident.utas[0] : resident.utas) || "",
        });
      }
    }

    // Calculate uldegdel per resident
    for (const rid of Object.keys(residentMap)) {
      const r = residentMap[rid];
      r.uldegdelTulbur = Math.max(0, r.niitTulbur - r.tulsunDun);
    }

    const residentSummary = Object.entries(residentMap).map(([id, r]) => ({
      orshinSuugchiinId: id,
      ner: r.ner,
      toot: r.toot,
      urisanMachinToo: r.urisanMachinToo,
      niitTulbur: r.niitTulbur,
      khungulultMinut: r.khungulultMinut,
      tulsunDun: r.tulsunDun,
      uldegdelTulbur: r.uldegdelTulbur,
    }));

    const niit = Object.values(residentMap).reduce(
      (a, r) => ({
        urisanMachinToo: a.urisanMachinToo + (r.urisanMachinToo || 0),
        niitTulbur: a.niitTulbur + (r.niitTulbur || 0),
        khungulultMinut: a.khungulultMinut + (r.khungulultMinut || 0),
        tulsunDun: a.tulsunDun + (r.tulsunDun || 0),
        uldegdelTulbur: a.uldegdelTulbur + (r.uldegdelTulbur || 0),
      }),
      { urisanMachinToo: 0, niitTulbur: 0, khungulultMinut: 0, tulsunDun: 0, uldegdelTulbur: 0 }
    );

    let selectedDetail = null;
    if (orshinSuugch || toot) {
      const matchResident = residentSummary.find(
        (r) =>
          (orshinSuugch && (r.ner || "").toLowerCase().includes(String(orshinSuugch).toLowerCase())) ||
          (toot && String(r.toot || "").includes(String(toot)))
      );
      if (matchResident) {
        selectedDetail = residentMap[matchResident.orshinSuugchiinId]?.details || [];
      }
    }

    res.json({
      success: true,
      filter: {
        baiguullagiinId,
        barilgiinId: barilgiinId || null,
        ekhlekhOgnoo: ekhlekhOgnoo || null,
        duusakhOgnoo: duusakhOgnoo || null,
        orshinSuugch: orshinSuugch || null,
        toot: toot || null,
      },
      residentSummary,
      niit,
      guestCarList,
      selectedDetail,
    });
  } catch (error) {
    next(error);
  }
});

// Өр, авлагын тайлан (оршин суугчдийн) - Байр, орц, давхар, тоогоор хайж хэн төлбөрөө төлсөн, хэн төлөөгүйг хянах
exports.tailanOrlogoAvlaga = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      bairNer, // Байр
      orts, // Орц
      davkhar, // Давхар
      toot, // Тоот
      gereeniiDugaar, // Гэрээний дугаар
      ovog,
      ner,
      orshinSuugch, // Оршин суугч - searches ovog or ner
      ekhlekhOgnoo,
      duusakhOgnoo,
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
    const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

    const Geree = require("../models/geree");

    // Build common filters for Geree metadata
    const metadataMatch = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) metadataMatch.barilgiinId = String(barilgiinId);
    if (bairNer) metadataMatch.bairNer = bairNer;
    if (orts) metadataMatch.orts = orts;
    if (davkhar) {
      const v = String(davkhar).trim();
      if (v) metadataMatch.davkhar = { $regex: escapeRegex(v), $options: "i" };
    }
    if (toot) {
      const tootVal = String(toot).trim();
      if (tootVal) {
        const re = escapeRegex(tootVal);
        metadataMatch.$and = metadataMatch.$and || [];
        metadataMatch.$and.push({
          $or: [
            { toot: { $regex: re, $options: "i" } },
            { "toots.toot": { $regex: re, $options: "i" } }, // Check in toots array if applicable
            { "medeelel.toot": { $regex: re, $options: "i" } },
          ],
        });
      }
    }
    if (gereeniiDugaar) {
      const v = String(gereeniiDugaar).trim();
      if (v)
        metadataMatch.gereeniiDugaar = {
          $regex: escapeRegex(v),
          $options: "i",
        };
    }
    if (orshinSuugch) {
      const val = String(orshinSuugch).trim();
      if (val) {
        const re = escapeRegex(val);
        metadataMatch.$or = [
          { ovog: { $regex: re, $options: "i" } },
          { ner: { $regex: re, $options: "i" } },
        ];
      }
    } else {
      if (ovog) {
        const v = String(ovog).trim();
        if (v) metadataMatch.ovog = { $regex: escapeRegex(v), $options: "i" };
      }
      if (ner) {
        const v = String(ner).trim();
        if (v) metadataMatch.ner = { $regex: escapeRegex(v), $options: "i" };
      }
    }

    // Date range filter
    let dateFilter = {};
    if (ekhlekhOgnoo || duusakhOgnoo) {
      const start = ekhlekhOgnoo
        ? new Date(ekhlekhOgnoo)
        : new Date("1970-01-01");
      if (ekhlekhOgnoo) start.setHours(0, 0, 0, 0);

      const end = duusakhOgnoo
        ? new Date(duusakhOgnoo)
        : new Date("2999-12-31");
      if (duusakhOgnoo) end.setHours(23, 59, 59, 999);

      dateFilter = { $gte: start, $lte: end };
    }

    // 1. Get Invoices (NekhemjlekhiinTuukh)
    const invoiceMatch = { ...metadataMatch };
    if (dateFilter.$gte) invoiceMatch.ognoo = dateFilter;

    // 2. Get Standalone Tulukh (Receivables — charges without invoice link)
    let tulukhMatch = {
      baiguullagiinId: String(baiguullagiinId),
      nekhemjlekhId: { $in: [null, ""] },
    };

    // 3. Get All Payments (dun < 0 in ledger)
    let tulsunMatch = {
      baiguullagiinId: String(baiguullagiinId),
    };

    // If filtering by building, get all contract IDs for that building to ensure we capture all associated ledger entries
    if (barilgiinId) {
      const GereeModel = require("../models/geree");
      const gerees = await GereeModel(kholbolt).find({ barilgiinId: String(barilgiinId) }, { _id: 1 }).lean();
      const buildingGereeIds = gerees.map(g => String(g._id));
      
      const bMatch = {
        $or: [
          { barilgiinId: String(barilgiinId) },
          { gereeniiId: { $in: buildingGereeIds } }
        ]
      };
      tulukhMatch = { ...tulukhMatch, ...bMatch };
      tulsunMatch = { ...tulsunMatch, ...bMatch };
      invoiceMatch.barilgiinId = String(barilgiinId);
    }

    if (dateFilter.$gte) {
      tulukhMatch.ognoo = dateFilter;
      tulsunMatch.ognoo = dateFilter;
      invoiceMatch.ognoo = dateFilter;
    }
    
    if (gereeniiDugaar) {
      const regMatch = { $regex: escapeRegex(gereeniiDugaar), $options: "i" };
      tulukhMatch.gereeniiDugaar = regMatch;
      tulsunMatch.gereeniiDugaar = regMatch;
      invoiceMatch.gereeniiDugaar = regMatch;
    }

    const [invoices, standaloneTulukh, allPayments] = await Promise.all([
      NekhemjlekhiinTuukh(kholbolt).find(invoiceMatch).lean().sort({ ognoo: -1 }),
      GuilgeeAvlaguud(kholbolt).find(tulukhMatch).lean(),
      GuilgeeAvlaguud(kholbolt).find({ ...tulsunMatch, dun: { $lt: 0 } }).lean(),
    ]);

    // Gather all gereeIds from both invoices and standalone records to fetch their metadata
    const allGereeniiIds = new Set([
      ...invoices.map((i) => String(i.gereeniiId)),
      ...standaloneTulukh.map((s) => String(s.gereeniiId)),
      ...allPayments.map((p) => String(p.gereeniiId)),
    ]);

    // Fetch contracts for all records to ensure we have property metadata (toot/toots)
    const gereeMetadata = await Geree(kholbolt)
      .find({
        _id: { $in: Array.from(allGereeniiIds) },
        ...metadataMatch,
      })
      .lean();

    const gereeMap = {};
    gereeMetadata.forEach((g) => {
      gereeMap[String(g._id)] = g;
    });

    const paid = [];
    const unpaid = [];
    let paidSum = 0;
    let unpaidSum = 0;

    // Process Invoices
    for (const d of invoices) {
      const nememjlekh = {
        zardluud: d.medeelel?.zardluud || [],
        guilgeenuud: d.medeelel?.guilgeenuud || [],
        segmentuud: d.medeelel?.segmentuud || [],
        khungulultuud: d.medeelel?.khungulultuud || [],
        toot: d.medeelel?.toot || d.toot || (Array.isArray(d.toots) ? d.toots.map(t => t.toot).filter(Boolean).join(",") : ""),
        temdeglel: d.medeelel?.temdeglel || d.medeelel?.tailbar || "",
        uusgegsenEsekh: d.medeelel?.uusgegsenEsekh || "",
        uusgegsenOgnoo: d.medeelel?.uusgegsenOgnoo || null,
      };

      const row = {
        gereeniiDugaar: d.gereeniiDugaar || "",
        ovog: d.ovog || "",
        ner: d.ner || "",
        utas: Array.isArray(d.utas) ? d.utas : d.utas || [],
        toot: d.medeelel?.toot || d.toot || (Array.isArray(d.toots) ? d.toots.map(t => t.toot).filter(Boolean).join(",") : "") || (gereeMap[String(d.gereeniiId)]?.toot) || (Array.isArray(gereeMap[String(d.gereeniiId)]?.toots) ? gereeMap[String(d.gereeniiId)].toots.map(t => t.toot).filter(Boolean).join(",") : ""),
        davkhar: d.davkhar || "",
        bairNer: d.bairNer || "",
        orts: d.orts || "",
        ognoo: d.ognoo || null,
        tulukhOgnoo: d.tulukhOgnoo || null,
        niitTulbur: d.niitTulbur || 0,
        tulsunDun: d.tulsunDun || 0,
        tuluv: d.tuluv || "Төлөөгүй",
        dugaalaltDugaar: d.dugaalaltDugaar || null,
        gereeniiId: d.gereeniiId || "",
        nememjlekh: nememjlekh,
      };

      // Determine status based on actual balance
      const balance = (d.niitTulbur || 0) - (d.tulsunDun || 0);
      const isActuallyPaid = balance <= 0 || d.tuluv === "Төлсөн";

      if (isActuallyPaid) {
        row.tuluv = "Төлсөн";
        paid.push(row);
      } else {
        row.tuluv = "Төлөөгүй";
        unpaid.push(row);
        unpaidSum += balance;
      }
      // NOTE: do NOT add d.tulsunDun to paidSum here.
      // tulsunDun is all-time cumulative — income must come only from allPayments (dun < 0) below.
    }

    // Process Standalone Receivables (e.g., Initial Balance)
    for (const s of standaloneTulukh) {
      const g = gereeMap[String(s.gereeniiId)];
      if (!g) continue;

      const row = {
        gereeniiDugaar: s.gereeniiDugaar || g.gereeniiDugaar || "",
        ovog: g.ovog || "",
        ner: g.ner || "",
        utas: g.utas || [],
        toot: g.toot || (Array.isArray(g.toots) ? g.toots.map(t => t.toot).filter(Boolean).join(",") : ""),
        davkhar: g.davkhar || "",
        bairNer: g.bairNer || "",
        orts: g.orts || "1",
        ognoo: s.ognoo || s.createdAt || null,
        tulukhOgnoo: s.ognoo || s.createdAt || null,
        niitTulbur: s.tulukhDun || s.undsenDun || 0,
        tulsunDun: s.tulsunDun || 0,
        uldegdel: s.uldegdel || 0,
        tuluv: "Төлөөгүй",
        gereeniiId: String(s.gereeniiId),
        nememjlekh: {
          zardluud: [
            {
              ner: s.zardliinNer || "Авлага",
              dun: s.undsenDun || 0,
              tulukhDun: s.tulukhDun || 0,
            },
          ],
        },
      };
      const balance = row.niitTulbur - row.tulsunDun;
      if (balance <= 0) {
        row.tuluv = "Төлсөн";
        paid.push(row);
      } else {
        unpaid.push(row);
        unpaidSum += balance;
      }
      paidSum += row.tulsunDun || 0;
    }

    // Process All Payments (Income)
    for (const p of allPayments) {
      const g = gereeMap[String(p.gereeniiId)];
      if (!g) continue;

      const amountPaid = Number(p.tulsunDun || Math.abs(p.dun || 0));
      if (amountPaid === 0) continue;

      const row = {
        gereeniiDugaar: p.gereeniiDugaar || g.gereeniiDugaar || "",
        ovog: g.ovog || "",
        ner: g.ner || "",
        utas: g.utas || [],
        toot: g.toot || (Array.isArray(g.toots) ? g.toots.map(t => t.toot).filter(Boolean).join(",") : ""),
        davkhar: g.davkhar || "",
        bairNer: g.bairNer || "",
        orts: g.orts || "1",
        ognoo: p.ognoo || p.tulsunOgnoo || p.createdAt || null,
        tulukhOgnoo: p.ognoo || null,
        niitTulbur: amountPaid,
        tuluv: "Төлсөн",
        gereeniiId: String(p.gereeniiId),
        nememjlekh: {
          zardluud: [],
          guilgeenuud: [
            {
              tailbar: p.tailbar || "Төлөлт (Нэхэмжлэхгүй)",
              tulsunDun: amountPaid,
              ognoo: p.ognoo || p.createdAt,
            },
          ],
        },
      };
      paid.push(row);
      paidSum += amountPaid;
    }

    res.json({
      success: true,
      filter: {
        baiguullagiinId,
        barilgiinId: barilgiinId || null,
        bairNer: bairNer || null,
        orts: orts || null,
        davkhar: davkhar || null,
        toot: toot || null,
        gereeniiDugaar: gereeniiDugaar || null,
        orshinSuugch: orshinSuugch || null,
        ekhlekhOgnoo: ekhlekhOgnoo || null,
        duusakhOgnoo: duusakhOgnoo || null,
      },
      total: paid.length + unpaid.length,
      paid: {
        count: paid.length,
        sum: paidSum,
        list: paid,
      },
      unpaid: {
        count: unpaid.length,
        sum: unpaidSum,
        list: unpaid,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Сарын төлбөр тайлан (сар сараар нэмээд улиралаар шүүж харах боломжтой, хураангуй дэлгэрэнгүй)
exports.tailanSariinTulbur = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      turul = "sar", // "sar" (month) or "uliral" (quarter)
      view = "huraangui", // "huraangui" (summary) or "delgerengui" (detailed)
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 20,
      orshinSuugch,
      toot,
      davkhar,
      gereeniiDugaar,
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

    // Build base match filter
    const match = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) match.barilgiinId = String(barilgiinId);

    if (davkhar) {
      const v = String(davkhar).trim();
      if (v) match.davkhar = { $regex: escapeRegex(v), $options: "i" };
    }
    if (toot) {
      const tootVal = String(toot).trim();
      if (tootVal) {
        const re = escapeRegex(tootVal);
        match.$and = match.$and || [];
        match.$and.push({
          $or: [
            { toot: { $regex: re, $options: "i" } },
            { "medeelel.toot": { $regex: re, $options: "i" } },
          ],
        });
      }
    }
    if (gereeniiDugaar) {
      const v = String(gereeniiDugaar).trim();
      if (v) match.gereeniiDugaar = { $regex: escapeRegex(v), $options: "i" };
    }
    if (orshinSuugch) {
      const val = String(orshinSuugch).trim();
      if (val) {
        const re = escapeRegex(val);
        match.$or = [
          { ovog: { $regex: re, $options: "i" } },
          { ner: { $regex: re, $options: "i" } },
        ];
      }
    }

    // Date range filter
    if (ekhlekhOgnoo || duusakhOgnoo) {
      const start = ekhlekhOgnoo
        ? new Date(ekhlekhOgnoo)
        : new Date("1970-01-01");
      if (ekhlekhOgnoo) start.setHours(0, 0, 0, 0);

      const end = duusakhOgnoo
        ? new Date(duusakhOgnoo)
        : new Date("2999-12-31");
      if (duusakhOgnoo) end.setHours(23, 59, 59, 999);

      match.ognoo = { $gte: start, $lte: end };
    }

    // Group by month or quarter
    const groupStage = {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$niitTulbur", 0] } },
        count: { $sum: 1 },
        tulsenTotal: {
          $sum: {
            $cond: [
              { $eq: ["$tuluv", "Төлсөн"] },
              { $ifNull: ["$niitTulbur", 0] },
              0,
            ],
          },
        },
        tulsenCount: {
          $sum: {
            $cond: [{ $eq: ["$tuluv", "Төлсөн"] }, 1, 0],
          },
        },
        tuluuguiTotal: {
          $sum: {
            $cond: [
              { $ne: ["$tuluv", "Төлсөн"] },
              { $ifNull: ["$niitTulbur", 0] },
              0,
            ],
          },
        },
        tuluuguiCount: {
          $sum: {
            $cond: [{ $ne: ["$tuluv", "Төлсөн"] }, 1, 0],
          },
        },
      },
    };

    if (turul === "uliral") {
      // Group by quarter
      groupStage.$group._id = {
        year: { $year: "$ognoo" },
        quarter: { $ceil: { $divide: [{ $month: "$ognoo" }, 3] } },
      };
    } else {
      // Group by month
      groupStage.$group._id = {
        year: { $year: "$ognoo" },
        month: { $month: "$ognoo" },
      };
    }

    const aggregatePipeline = [
      { $match: match },
      groupStage,
      {
        $sort: {
          "_id.year": 1,
          ...(turul === "uliral"
            ? { "_id.quarter": 1 }
            : { "_id.month": 1 }),
        },
      },
    ];

    const summaryData = await NekhemjlekhiinTuukh(kholbolt).aggregate(
      aggregatePipeline
    );

    // Format summary data
    const formattedSummary = summaryData.map((item) => {
      const period = turul === "uliral"
        ? `${item._id.year}-Q${item._id.quarter}`
        : `${item._id.year}-${String(item._id.month).padStart(2, "0")}`;

      return {
        period,
        year: item._id.year,
        ...(turul === "uliral"
          ? { quarter: item._id.quarter }
          : { month: item._id.month }),
        total: item.total || 0,
        count: item.count || 0,
        tulsen: {
          total: item.tulsenTotal || 0,
          count: item.tulsenCount || 0,
        },
        tuluugui: {
          total: item.tuluuguiTotal || 0,
          count: item.tuluuguiCount || 0,
        },
      };
    });

    let detailedList = [];
    let totalDetailed = 0;

    // If detailed view is requested, get the actual invoice list
    if (view === "delgerengui") {
      const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);

      // Get detailed invoices grouped by period
      const detailedMatch = { ...match };
      const detailedDocs = await NekhemjlekhiinTuukh(kholbolt)
        .find(detailedMatch)
        .sort({ ognoo: -1 })
        .skip(skip)
        .limit(Number(khuudasniiKhemjee))
        .lean();

      totalDetailed = await NekhemjlekhiinTuukh(kholbolt).countDocuments(
        detailedMatch
      );

      detailedList = detailedDocs.map((d) => {
        const invoiceDate = new Date(d.ognoo);
        const period = turul === "uliral"
          ? `${invoiceDate.getFullYear()}-Q${Math.ceil((invoiceDate.getMonth() + 1) / 3)}`
          : `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, "0")}`;

        return {
          period,
          _id: d._id,
          gereeniiId: d.gereeniiId,
          gereeniiDugaar: d.gereeniiDugaar || "",
          ovog: d.ovog || "",
          ner: d.ner || "",
          utas: Array.isArray(d.utas) ? d.utas : d.utas || [],
          toot: d.toot || "",
          davkhar: d.davkhar || "",
          bairNer: d.bairNer || "",
          ognoo: d.ognoo || null,
          tulukhOgnoo: d.tulukhOgnoo || null,
          tulsunOgnoo: d.tulsunOgnoo || null,
          tailbar: d.tailbar || d.medeelel?.tailbar || "",
          niitTulbur: d.niitTulbur || 0,
          tuluv: d.tuluv || "Төлөөгүй",
          dugaalaltDugaar: d.dugaalaltDugaar || null,
        };
      });
    }

    res.json({
      success: true,
      filter: {
        baiguullagiinId,
        barilgiinId: barilgiinId || null,
        ekhlekhOgnoo: ekhlekhOgnoo || null,
        duusakhOgnoo: duusakhOgnoo || null,
        turul, // "sar" or "uliral"
        view, // "huraangui" or "delgerengui"
      },
      summary: formattedSummary,
      ...(view === "delgerengui"
        ? {
            detailed: {
              khuudasniiDugaar: Number(khuudasniiDugaar),
              khuudasniiKhemjee: Number(khuudasniiKhemjee),
              niitMur: totalDetailed,
              niitKhuudas: Math.ceil(
                totalDetailed / Number(khuudasniiKhemjee)
              ),
              list: detailedList,
            },
          }
        : {}),
    });
  } catch (error) {
    next(error);
  }
});

exports.tailanNekhemjlekhiinTuukh = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      tuluv, // Төлөв: "Төлсөн", "Төлөөгүй", "Хугацаа хэтэрсэн"
      gereeniiDugaar,
      bairNer,
      davkhar,
      toot,
      ovog,
      ner,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 20,
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
    const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

    const Geree = require("../models/geree");

    // 1. Build Metadata Match
    const metadataMatch = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) metadataMatch.barilgiinId = String(barilgiinId);
    if (bairNer) metadataMatch.bairNer = bairNer;
    if (toot) {
      const re = escapeRegex(String(toot).trim());
      metadataMatch.$and = metadataMatch.$and || [];
      metadataMatch.$and.push({
        $or: [
          { toot: { $regex: re, $options: "i" } },
          { "toots.toot": { $regex: re, $options: "i" } },
          { "medeelel.toot": { $regex: re, $options: "i" } },
        ],
      });
    }
    if (davkhar) {
      metadataMatch.davkhar = {
        $regex: escapeRegex(String(davkhar).trim()),
        $options: "i",
      };
    }
    if (gereeniiDugaar) {
      metadataMatch.gereeniiDugaar = {
        $regex: escapeRegex(String(gereeniiDugaar).trim()),
        $options: "i",
      };
    }
    if (ovog) metadataMatch.ovog = { $regex: escapeRegex(ovog), $options: "i" };
    if (ner) metadataMatch.ner = { $regex: escapeRegex(ner), $options: "i" };

    // 2. Build Date Filter
    let dateFilter = {};
    if (ekhlekhOgnoo || duusakhOgnoo) {
      const start = ekhlekhOgnoo
        ? new Date(ekhlekhOgnoo)
        : new Date("1970-01-01");
      if (ekhlekhOgnoo) start.setHours(0, 0, 0, 0);

      const end = duusakhOgnoo
        ? new Date(duusakhOgnoo)
        : new Date("2999-12-31");
      if (duusakhOgnoo) end.setHours(23, 59, 59, 999);

      dateFilter = { $gte: start, $lte: end };
    }

    // 3. Find matching contracts to handle standalone records metadata
    const matchingGerees = await Geree(kholbolt)
      .find(metadataMatch)
      .select("_id gereeniiDugaar ovog ner utas toot davkhar bairNer orts")
      .lean();

    const gereeIds = matchingGerees.map((g) => String(g._id));
    const gereeMap = {};
    matchingGerees.forEach((g) => (gereeMap[String(g._id)] = g));

    // 4. Construct Queries
    const invoiceMatch = { ...metadataMatch };
    if (dateFilter.$gte) invoiceMatch.ognoo = dateFilter;
    if (tuluv) invoiceMatch.tuluv = tuluv;

    const tulukhMatch = {
      baiguullagiinId: String(baiguullagiinId),
      gereeniiId: { $in: gereeIds },
      nekhemjlekhId: { $in: [null, ""] },
    };
    if (dateFilter.$gte) tulukhMatch.ognoo = dateFilter;
    if (tuluv && tuluv !== "Төлөөгүй") {
      // Standalone Tulukh is always "Төлөөгүй"
      tulukhMatch._id = null; // Forces empty result if searching specifically for paid
    }

    const tulsunMatch = {
      baiguullagiinId: String(baiguullagiinId),
      gereeniiId: { $in: gereeIds },
      nekhemjlekhId: { $in: [null, ""] },
    };
    if (dateFilter.$gte) tulsunMatch.ognoo = dateFilter;
    if (tuluv && tuluv !== "Төлсөн") {
      tulsunMatch._id = null; // Forces empty result if searching specifically for unpaid
    }

    // 5. Execute Queries (For history, we fetch all and then paginate manually to handle merging)
    // Alternatively, we could query just the invoices if stats are the main concern, 
    // but for "Tuukh" users expect to see everything.
    const [invoices, standaloneTulukh, standaloneTulsun] = await Promise.all([
      NekhemjlekhiinTuukh(kholbolt).find(invoiceMatch).lean().sort({ ognoo: -1 }),
      GuilgeeAvlaguud(kholbolt).find(tulukhMatch).lean().sort({ ognoo: -1 }),
      GuilgeeAvlaguud(kholbolt).find(tulsunMatch).lean().sort({ ognoo: -1 }),
    ]);

    // Merge and format
    const combinedList = [];

    // Add Invoices
    for (const d of invoices) {
      combinedList.push({
        _id: d._id,
        gereeniiDugaar: d.gereeniiDugaar || "",
        gereeniiId: d.gereeniiId || "",
        ovog: d.ovog || "",
        ner: d.ner || "",
        utas: d.utas || [],
        toot: d.medeelel?.toot || d.toot || "",
        davkhar: d.davkhar || "",
        bairNer: d.bairNer || "",
        orts: d.orts || "",
        ognoo: d.ognoo || null,
        tulukhOgnoo: d.tulukhOgnoo || null,
        tulsunOgnoo: d.tulsunOgnoo || null,
        niitTulbur: d.niitTulbur || 0,
        ekhniiUldegdel: d.ekhniiUldegdel,
        tuluv: d.tuluv || "Төлөөгүй",
        nememjlekh: {
          zardluud: d.medeelel?.zardluud || [],
          guilgeenuud: d.medeelel?.guilgeenuud || [],
        },
        type: "invoice",
      });
    }

    // Add Standalone Receivables
    for (const s of standaloneTulukh) {
      const g = gereeMap[String(s.gereeniiId)];
      if (!g) continue;
      combinedList.push({
        _id: s._id,
        gereeniiDugaar: s.gereeniiDugaar || g.gereeniiDugaar || "",
        gereeniiId: String(s.gereeniiId),
        ovog: g.ovog || "",
        ner: g.ner || "",
        utas: g.utas || [],
        toot: g.toot || "",
        davkhar: g.davkhar || "",
        bairNer: g.bairNer || "",
        orts: g.orts || "1",
        ognoo: s.ognoo || s.createdAt || null,
        tulukhOgnoo: s.ognoo || null,
        niitTulbur: s.undsenDun || 0,
        uldegdel: s.uldegdel || 0,
        tuluv: "Төлөөгүй",
        nememjlekh: {
          zardluud: [
            {
              ner: s.zardliinNer || "Авлага",
              dun: s.undsenDun || 0,
              tulukhDun: s.tulukhDun || 0,
              tailbar: s.tailbar || "",
              isEkhniiUldegdel: s.ekhniiUldegdelEsekh,
            },
          ],
          guilgeenuud: [],
        },
        type: "receivable",
      });
    }

    // Add Standalone Payments
    for (const p of standaloneTulsun) {
      const g = gereeMap[String(p.gereeniiId)];
      if (!g) continue;
      combinedList.push({
        _id: p._id,
        gereeniiDugaar: p.gereeniiDugaar || g.gereeniiDugaar || "",
        gereeniiId: String(p.gereeniiId),
        ovog: g.ovog || "",
        ner: g.ner || "",
        utas: g.utas || [],
        toot: g.toot || "",
        davkhar: g.davkhar || "",
        bairNer: g.bairNer || "",
        orts: g.orts || "1",
        ognoo: p.ognoo || p.tulsunOgnoo || p.createdAt || null,
        tulsunOgnoo: p.tulsunOgnoo || p.createdAt || null,
        niitTulbur: p.tulsunDun || 0,
        tuluv: "Төлсөн",
        nememjlekh: {
          zardluud: [],
          guilgeenuud: [
            {
              tailbar: p.tailbar || "Төлөлт (Нэхэмжлэхгүй)",
              tulsunDun: p.tulsunDun || 0,
              ognoo: p.ognoo || p.createdAt,
            },
          ],
        },
        type: "payment",
      });
    }

    // Sort combined list
    combinedList.sort((a, b) => {
      const da = a.ognoo ? new Date(a.ognoo).getTime() : 0;
      const db = b.ognoo ? new Date(b.ognoo).getTime() : 0;
      return db - da;
    });

    // Calculate total sums for stats
    let totalTulbur = 0;
    let totalTulsen = 0;
    let countTulsen = 0;
    let totalTuluugui = 0;
    let countTuluugui = 0;

    combinedList.forEach((item) => {
      const amt = Number(item.niitTulbur) || 0;
      totalTulbur += amt;
      if (item.tuluv === "Төлсөн") {
        totalTulsen += amt;
        countTulsen++;
      } else {
        totalTuluugui += amt;
        countTuluugui++;
      }
    });

    // Paginate
    const skip = (Number(khuudasniiDugaar) - 1) * Number(khuudasniiKhemjee);
    const paginatedList = combinedList.slice(
      skip,
      skip + Number(khuudasniiKhemjee),
    );

    res.json({
      success: true,
      filter: {
        baiguullagiinId,
        barilgiinId: barilgiinId || null,
        ekhlekhOgnoo: ekhlekhOgnoo || null,
        duusakhOgnoo: duusakhOgnoo || null,
        tuluv: tuluv || null,
        gereeniiDugaar: gereeniiDugaar || null,
        bairNer: bairNer || null,
        davkhar: davkhar || null,
        toot: toot || null,
        ovog: ovog || null,
        ner: ner || null,
      },
      pagination: {
        khuudasniiDugaar: Number(khuudasniiDugaar),
        khuudasniiKhemjee: Number(khuudasniiKhemjee),
        niitMur: combinedList.length,
        niitKhuudas: Math.ceil(combinedList.length / Number(khuudasniiKhemjee)),
      },
      stats: {
        niitTulbur: totalTulbur,
        tulsen: {
          total: totalTulsen,
          count: countTulsen,
        },
        tuluugui: {
          total: totalTuluugui,
          count: countTuluugui,
        },
      },
      list: paginatedList,
    });
  } catch (error) {
    next(error);
  }
});

// Авлагын насжилтийн тайлан (Төлөгдөөгүй төлбөрийн насжилтыг тодорхойлох)
exports.tailanAvlagiinNasjilt = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      view = "huraangui",
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 20,
      orshinSuugch,
      toot,
      davkhar,
      gereeniiDugaar,
      search,
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
    const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
    const Geree = require("../models/geree");

    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      let str = String(dateStr).trim();
      if (/^\d{4}\.\d{2}\.\d{2}/.test(str)) {
        str = str.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    };

    const match = {
      baiguullagiinId: String(baiguullagiinId),
    };
    if (barilgiinId) match.barilgiinId = String(barilgiinId);

    const applySearch = (m) => {
      if (search || orshinSuugch || toot || gereeniiDugaar || davkhar) {
        m.$and = m.$and || [];
        const orConditions = [];
        if (search) {
          const re = new RegExp(escapeRegex(String(search).trim()), "i");
          orConditions.push(
            { ner: re },
            { ovog: re },
            { toot: re },
            { gereeniiDugaar: re },
            { "medeelel.toot": re }
          );
        }
        if (orshinSuugch) {
          const re = new RegExp(escapeRegex(String(orshinSuugch).trim()), "i");
          orConditions.push({ ner: re }, { ovog: re });
        }
        if (toot) {
          const re = new RegExp(escapeRegex(String(toot).trim()), "i");
          orConditions.push({ toot: re }, { "medeelel.toot": re });
        }
        if (gereeniiDugaar) {
          const re = new RegExp(escapeRegex(String(gereeniiDugaar).trim()), "i");
          orConditions.push({ gereeniiDugaar: re });
        }
        if (davkhar) {
          const re = new RegExp(escapeRegex(String(davkhar).trim()), "i");
          orConditions.push({ davkhar: re });
        }
        if (orConditions.length > 0) m.$and.push({ $or: orConditions });
      }
    };
    applySearch(match);

    // When ekhlekhOgnoo is provided, we don't filter invoices by start date 
    // because Aging must be cumulative to show accurate total balances.
    // We only use duusakhOgnoo for "as of" date filtering.
    if (duusakhOgnoo) {
      const endDate = parseDate(duusakhOgnoo);
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
        match.ognoo = match.ognoo || {};
        match.ognoo.$lte = endDate;
      }
    }

    // ─── Use getHistoryLedger per contract for 100% accurate balances ─────────
    // This matches the guilgeeTuukh (Ledger) page exactly.
    // Ledger logic removed as per request.
    const GuilgeeAvlaguudModel2 = require("../models/guilgeeAvlaguud");


    res.status(501).json({
      success: false,
      message: "Aging report is temporarily disabled during refactoring.",
    });
  } catch (error) {
    next(error);
  }
});

// Тайланг excel/pdf-р татаж авах боломж
exports.tailanExport = asyncHandler(async (req, res, next) => {
  try {
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const {
      baiguullagiinId,
      report, // "orlogo-avlaga", "sariin-tulbur", "nekhemjlekhiin-tuukh", "avlagiin-nasjilt", "udsan-avlaga", "tsutslasan-gereenii-avlaga"
      type = "excel", // "excel" or "pdf"
      ...reportParams
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    if (!report) {
      return res
        .status(400)
        .json({ success: false, message: "report is required" });
    }

    // Map report names to functions
    const reportMap = {
      "orlogo-avlaga": exports.tailanOrlogoAvlaga,
      "orlogo-tovchoo": exports.tailanOrlogoAvlaga,
      "sariin-tulbur": exports.tailanSariinTulbur,
      "nekhemjlekhiin-tuukh": exports.tailanNekhemjlekhiinTuukh,
      "avlagiin-nasjilt": exports.tailanAvlagiinNasjilt,
      "guitsetgel": exports.tailanGuitsetgel,
      "udsan-avlaga": exports.tailanUdsanAvlaga,
      "tsutslasan-gereenii-avlaga": exports.tailanTsutslasanGereeniiAvlaga,
      "zogsool": exports.tailanZogsool,
      "negtgel": exports.tailanNegtgelTailan,
    };

    const reportFunction = reportMap[report];
    if (!reportFunction) {
      return res.status(400).json({
        success: false,
        message: `Тайлан олдсонгүй эсвэл экспортлох боломжгүй: ${report}`,
      });
    }

    // Get data from report function by intercepting the response
    const originalJson = res.json;
    const originalSend = res.send;
    const originalStatus = res.status;
    let data;
    let responseSent = false;

    res.json = (payload) => {
      if (!responseSent) {
        data = payload;
        responseSent = true;
      }
      return res;
    };

    res.send = (payload) => {
      if (!responseSent) {
        try {
          data = JSON.parse(payload);
        } catch (e) {
          data = payload;
        }
        responseSent = true;
      }
      return res;
    };

    res.status = (code) => {
      return res;
    };

    // For certain reports, ensure we get detailed data
    if (
      (report === "avlagiin-nasjilt" || report === "orlogo-tovchoo") &&
      !reportParams.view
    ) {
      reportParams.view = "delgerengui";
      reportParams.khuudasniiKhemjee = 30000; // Get all records for export (larger for nasjilt)
    }

    // Create a mock request with report parameters
    const mockReq = {
      ...req,
      method: "POST",
      body: { baiguullagiinId, ...reportParams },
      query: { baiguullagiinId, ...reportParams },
      params: {},
    };

    try {
      await reportFunction(mockReq, res, next);
    } catch (error) {
      // Restore original functions
      res.json = originalJson;
      res.send = originalSend;
      res.status = originalStatus;
      throw error;
    }

    // Restore original functions
    res.json = originalJson;
    res.send = originalSend;
    res.status = originalStatus;

    if (!data?.success) {
      return res.status(400).json({
        success: false,
        message: data?.message || "Тайлан авахад алдаа гарлаа",
      });
    }

    const XLSX = require("xlsx");
    let rows = [];
    let headers = [];
    let fileName = report;

    // Format data based on report type
    if (report === "orlogo-avlaga") {
      const list = [...(data.paid?.list || []), ...(data.unpaid?.list || [])];
      headers = [
        "Гэрээний дугаар",
        "Овог",
        "Нэр",
        "Утас",
        "Тоот",
        "Давхар",
        "Байр",
        "Орц",
        "Огноо",
        "Төлөх огноо",
        "Нийт төлбөр",
        "Төлөв",
      ];
      rows = list.map((r) => {
        let ognooStr = "";
        try {
          if (r.ognoo) {
            const d = new Date(r.ognoo);
            if (!isNaN(d.getTime())) ognooStr = d.toLocaleDateString("mn-MN");
          }
        } catch (e) {}

        let tulukhOgnooStr = "";
        try {
          if (r.tulukhOgnoo) {
            const d = new Date(r.tulukhOgnoo);
            if (!isNaN(d.getTime())) tulukhOgnooStr = d.toLocaleDateString("mn-MN");
          }
        } catch (e) {}

        return [
          r.gereeniiDugaar || "",
          r.ovog || "",
          r.ner || "",
          Array.isArray(r.utas) ? r.utas.join(", ") : r.utas || "",
          r.toot || "",
          r.davkhar || "",
          r.bairNer || "",
          r.orts || "",
          ognooStr,
          tulukhOgnooStr,
          r.niitTulbur || 0,
          r.tuluv || "",
        ];
      });

      // Add Footer Total
      const totalNiitTulbur = list.reduce((sum, r) => sum + (Number(r.niitTulbur) || 0), 0);
      rows.push([
        "НИЙТ",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        Math.round(totalNiitTulbur * 100) / 100,
        "",
      ]);

      fileName = "orlogo_avlaga";
    } else if (report === "negtgel") {
      const ExcelJS = require("exceljs");
      const Baiguullaga = require("../models/baiguullaga");
      const { db } = require("zevbackv2");

      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
        .findById(baiguullagiinId)
        .lean();
      const orgName = baiguullaga?.ner || "";

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Нэгтгэл тайлан");

      // Group data by year-month for headers
      const periods = new Set();
      data.data.forEach((group) => {
        group.avlaga.forEach((inv) => {
          if (inv.ognoo) {
            const d = new Date(inv.ognoo);
            periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
          }
        });
      });
      const sortedPeriods = Array.from(periods).sort();

      // Column mapping
      const serviceColumns = [
        { label: "Хог", regex: /хог/i },
        { label: "Үйлчлэгчийн цалин", regex: /үйлчлэгч/i },
        { label: "Ариутгал цэвэрлэгээний материал", regex: /ариутгал|цэвэрлэгээний материал/i },
        { label: "Дулаан, агаар сэлгэлт", regex: /дулаан|агаар/i },
        { label: "Лифт", regex: /лифт/i },
        { label: "Засвар үйлчилгээ", regex: /засвар/i },
        { label: "Орон сууцны ашиглалт", regex: /ажилтан|байцаагч/i },
        { label: "Дундын Цахилгаан", regex: /дундын/i },
        { label: "Цахилгаан", regex: /^(?!.*дундын).*цахилгаан/i },
        { label: "Бусад", regex: null },
      ];

      // Build Headers
      // Row 1: Fixed Headers | <Period merged cells> | Grand Total
      // Row 2: № | Харилцагч | Тоот | Утас | <Services per Period...> | Нийт
      
      const fixedHeaders = ["№", "Харилцагч", "Тоот", "Утас"];
      const periodColCount = serviceColumns.length;
      
      // Calculate start col for each period
      const startColRaw = fixedHeaders.length + 1;
      
      // We'll stick to one period for now if that's what's most common, 
      // but let's assume the user wants the structure they provided.
      // If we use multiple periods, the table will be very wide.
      // Let's assume they want the breakdown as columns for the whole range if not specified.
      
      const headerRow2 = [];
      fixedHeaders.forEach(h => headerRow2.push(h));
      
      // For each period (e.g. 2026-03), add the service columns
      sortedPeriods.forEach(p => {
        serviceColumns.forEach(sc => headerRow2.push(sc.label));
        headerRow2.push("Нийт (" + p + ")");
      });
      headerRow2.push("Ерөнхий Нийт");

      // Row 1: Merge period headers
      const row1Data = new Array(headerRow2.length).fill("");
      row1Data[0] = "НЭГТГЭЛ ТАЙЛАН";
      
      let currentCol = fixedHeaders.length + 1;
      sortedPeriods.forEach(p => {
        row1Data[currentCol - 1] = p;
        worksheet.mergeCells(4, currentCol, 4, currentCol + serviceColumns.length);
        currentCol += serviceColumns.length + 1;
      });

      // Title & Org info
      worksheet.mergeCells("A1:" + worksheet.getColumn(headerRow2.length).letter + "1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "НЭГТГЭЛ ТАЙЛАН (" + (orgName || "") + ")";
      titleCell.font = { size: 14, bold: true };
      titleCell.alignment = { horizontal: "center" };

      const rangeStr = sortedPeriods.join(", ");
      worksheet.mergeCells("A2:" + worksheet.getColumn(headerRow2.length).letter + "2");
      const subTitle = worksheet.getCell("A2");
      subTitle.value = "Хугацаа: " + rangeStr;
      subTitle.alignment = { horizontal: "center" };

      const headerRowObj = worksheet.addRow(headerRow2);
      headerRowObj.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      // Set column widths
      worksheet.getColumn(1).width = 5;   // №
      worksheet.getColumn(2).width = 30;  // Харилцагч
      worksheet.getColumn(3).width = 10;  // Тоот
      worksheet.getColumn(4).width = 15;  // Утас
      
      // Cost columns width
      for (let i = 5; i <= headerRow2.length; i++) {
        worksheet.getColumn(i).width = 18;
      }

      // Data Rows
      data.data.forEach((group, idx) => {
        const rowData = [
          idx + 1,
          `${group._id.ovog || ""} ${group._id.ner || ""}`.trim(),
          group._id.toot || "",
          Array.isArray(group._id.utas) ? group._id.utas.join(", ") : group._id.utas || ""
        ];

        let grandTotal = 0;
        sortedPeriods.forEach(period => {
          const periodCosts = new Array(serviceColumns.length).fill(0);
          let periodTotal = 0;

          // Find invoices in this period
          group.avlaga.forEach(inv => {
            if (!inv.ognoo) return;
            let invP = "";
            try {
              const d = new Date(inv.ognoo);
              if (!isNaN(d.getTime())) {
                invP = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              }
            } catch (e) {}
            if (invP !== period) return;

            inv.zardluud.forEach(z => {
              const amount = Number(z.dun || z.tulukhDun || 0);
              let matched = false;
              for (let i = 0; i < serviceColumns.length - 1; i++) {
                if (serviceColumns[i].regex.test(z.ner || z.tailbar || "")) {
                  periodCosts[i] += amount;
                  matched = true;
                  break;
                }
              }
              if (!matched) periodCosts[serviceColumns.length - 1] += amount; // "Busad"
              periodTotal += amount;
            });
          });

          periodCosts.forEach(c => rowData.push(c));
          rowData.push(periodTotal);
          grandTotal += periodTotal;
        });
        rowData.push(grandTotal);

        const row = worksheet.addRow(rowData);
        row.eachCell((cell, colNumber) => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (colNumber > 4) {
             cell.numFmt = '#,##0.00';
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="negtgel_${Date.now()}.xlsx"`);
      return res.send(buffer);
    } else if (report === "orlogo-tovchoo") {
      const ExcelJS = require("exceljs");
      const Baiguullaga = require("../models/baiguullaga");
      const { db } = require("zevbackv2");

      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
        .findById(baiguullagiinId)
        .lean();
      const orgName = baiguullaga?.ner || "";

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Орлогын товчоо");

      // Set column widths
      worksheet.columns = [
        { header: "№", key: "index", width: 5 },
        { header: "Харилцагч", key: "customer", width: 30 },
        { header: "Гэрээний", key: "contract", width: 20 },
        { header: "Давхар", key: "floor", width: 10 },
        { header: "Тоот", key: "unit", width: 10 },
        { header: "Төлөв", key: "status", width: 15 },
        { header: "Төлсөн (₮)", key: "paidAmount", width: 20 },
      ];

      // Title
      worksheet.mergeCells("A1:G1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "Орлогын товчоо тайлан";
      titleCell.font = { size: 16, bold: true };
      titleCell.alignment = { horizontal: "center" };

      // Org Name
      worksheet.mergeCells("A2:G2");
      const orgCell = worksheet.getCell("A2");
      orgCell.value = orgName;
      orgCell.font = { size: 12, bold: true };
      orgCell.alignment = { horizontal: "center" };

      // Date Range
      worksheet.mergeCells("A3:C3");
      const dateCell = worksheet.getCell("A3");
      const start = reportParams.ekhlekhOgnoo
        ? new Date(reportParams.ekhlekhOgnoo).toLocaleDateString("mn-MN")
        : "";
      const end = reportParams.duusakhOgnoo
        ? new Date(reportParams.duusakhOgnoo).toLocaleDateString("mn-MN")
        : "";
      dateCell.value =
        "Огноо: " + (start || end ? `${start} - ${end}` : "Бүх хугацаа");
      dateCell.font = { italic: true };

      // Filters info on the right
      worksheet.mergeCells("E3:G3");
      const filterCell = worksheet.getCell("E3");
      let filters = [];
      if (reportParams.orshinSuugch) filters.push("Оршин суугч");
      if (reportParams.toot) filters.push("Тоот");
      if (reportParams.davkhar) filters.push("Давхар");
      if (reportParams.gereeniiDugaar) filters.push("Гэрээний");
      filterCell.value = "Шүүлт: " + (filters.length > 0 ? filters.join(", ") : "Бүгд");
      filterCell.alignment = { horizontal: "right" };

      // Leave a blank row
      worksheet.addRow([]);

      // Headers (Manual since we need styling)
      const headerRow = worksheet.addRow([
        "№",
        "Харилцагч",
        "Гэрээний",
        "Давхар",
        "Тоот",
        "Төлөв",
        "Төлсөн (₮)",
      ]);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "6FA8FF" },
        };
        cell.alignment = { horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Data rows
      const list = [...(data.paid?.list || []), ...(data.unpaid?.list || [])].sort((a,b) => {
        // Sort by unit if available
        if(a.toot && b.toot) {
            const numA = parseInt(a.toot);
            const numB = parseInt(b.toot);
            if(!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a.toot).localeCompare(String(b.toot));
        }
        return 0;
      });

      let totalPaid = 0;
      list.forEach((r, index) => {
        const row = worksheet.addRow([
          index + 1,
          `${r.ovog || ""} ${r.ner || ""}`.trim(),
          r.gereeniiDugaar || "",
          r.davkhar || "",
          r.toot || "",
          r.tuluv || "",
          r.niitTulbur || 0,
        ]);
        totalPaid += r.niitTulbur || 0;

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
        row.getCell(7).numFmt = "#,##0.00";
      });

      // Totals row
      const totalRow = worksheet.addRow([
        "",
        "Нийт",
        "",
        "",
        "",
        "",
        totalPaid,
      ]);
      totalRow.getCell(2).font = { bold: true };
      totalRow.getCell(7).font = { bold: true };
      totalRow.getCell(7).numFmt = "#,##0.00";
      totalRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F2F2" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Finalize exceljs
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="orlogo_tovchoo_${Date.now()}.xlsx"`
      );
      return res.send(buffer);
    } else if (report === "sariin-tulbur") {
      headers = ["Улирал/Сар", "Нийт дүн", "Тоо", "Төлсөн дүн", "Төлсөн тоо", "Төлөөгүй дүн", "Төлөөгүй тоо"];
      rows = (data.summary || []).map((item) => [
        item.period || "",
        item.total || 0,
        item.count || 0,
        item.tulsen?.total || 0,
        item.tulsen?.count || 0,
        item.tuluugui?.total || 0,
        item.tuluugui?.count || 0,
      ]);
      fileName = "sariin_tulbur";
    } else if (report === "nekhemjlekhiin-tuukh") {
      headers = [
        "Гэрээний дугаар",
        "Овог",
        "Нэр",
        "Утас",
        "Тоот",
        "Давхар",
        "Байр",
        "Орц",
        "Огноо",
        "Төлөх огноо",
        "Төлсөн огноо",
        "Нийт төлбөр",
        "Төлөв",
        "Дугааллын дугаар",
      ];
      rows = (data.list || []).map((r) => [
        r.gereeniiDugaar || "",
        r.ovog || "",
        r.ner || "",
        Array.isArray(r.utas) ? r.utas.join(", ") : r.utas || "",
        r.toot || "",
        r.davkhar || "",
        r.bairNer || "",
        r.orts || "",
        r.ognoo ? new Date(r.ognoo).toLocaleDateString("mn-MN") : "",
        r.tulukhOgnoo
          ? new Date(r.tulukhOgnoo).toLocaleDateString("mn-MN")
          : "",
        r.tulsunOgnoo
          ? new Date(r.tulsunOgnoo).toLocaleDateString("mn-MN")
          : "",
        r.niitTulbur || 0,
        r.tuluv || "",
        r.dugaalaltDugaar || "",
      ]);
      fileName = "nekhemjlekhiin_tuukh";
    } else if (report === "avlagiin-nasjilt") {
      headers = [
        "Гэрээний дугаар",
        "Оршин суугч",
        "Утас",
        "Давхар",
        "Тоот",
        "Төлөх",
        "Төлсөн",
        "Нийт үлдэгдэл",
        "0-30",
        "31-60",
        "61-90",
        "120+",
      ];
      const list = data.detailed?.list || [];
      rows = list.map((r) => {
        return [
          r.gereeniiDugaar || "",
          r.ner || "",
          Array.isArray(r.utas) ? r.utas.join(", ") : r.utas || "",
          r.davkhar || "",
          r.toot || "",
          r.undsenDun || 0,
          r.tulsunDun || 0,
          r.uldegdel || 0,
          r.p0_30 || 0,
          r.p31_60 || 0,
          r.p61_90 || 0,
          r.p120plus || 0,
        ];
      });

      // Add Footer Totals
      const sums = new Array(12).fill(0);
      list.forEach((r) => {
        sums[5] += r.undsenDun || 0;
        sums[6] += r.tulsunDun || 0;
        sums[7] += r.uldegdel || 0;
        sums[8] += r.p0_30 || 0;
        sums[9] += r.p31_60 || 0;
        sums[10] += r.p61_90 || 0;
        sums[11] += r.p120plus || 0;
      });

      rows.push([
        "НИЙТ",
        "",
        "",
        "",
        "",
        Math.round(sums[5] * 100) / 100,
        Math.round(sums[6] * 100) / 100,
        Math.round(sums[7] * 100) / 100,
        Math.round(sums[8] * 100) / 100,
        Math.round(sums[9] * 100) / 100,
        Math.round(sums[10] * 100) / 100,
        Math.round(sums[11] * 100) / 100,
      ]);

      fileName = "avlagiin_nasjilt";
    } else if (report === "udsan-avlaga") {
      headers = [
        "Гэрээний дугаар",
        "Овог",
        "Нэр",
        "Утас",
        "Тоот",
        "Давхар",
        "Байр",
        "Огноо",
        "Төлөх огноо",
        "Нийт төлбөр",
        "Төлөв",
        "Хугацаа хэтэрсэн сар",
        "Дугааллын дугаар",
      ];
      rows = (data.list || []).map((r) => {
        let ogStr = "";
        try { if(r.ognoo) { const d = new Date(r.ognoo); if(!isNaN(d.getTime())) ogStr = d.toLocaleDateString("mn-MN"); } } catch(e){}
        let tuStr = "";
        try { if(r.tulukhOgnoo) { const d = new Date(r.tulukhOgnoo); if(!isNaN(d.getTime())) tuStr = d.toLocaleDateString("mn-MN"); } } catch(e){}

        return [
          r.gereeniiDugaar || "",
          r.ovog || "",
          r.ner || "",
          Array.isArray(r.utas) ? r.utas.join(", ") : r.utas || "",
          r.toot || "",
          r.davkhar || "",
          r.bairNer || "",
          ogStr,
          tuStr,
          r.niitTulbur || 0,
          r.tuluv || "",
          r.monthsOverdue || 0,
          r.dugaalaltDugaar || "",
        ];
      });
      fileName = "udsan_avlaga";
    } else if (report === "tsutslasan-gereenii-avlaga") {
      headers = [
        "Гэрээний дугаар",
        "Овог",
        "Нэр",
        "Утас",
        "Тоот",
        "Давхар",
        "Байр",
        "Огноо",
        "Төлөх огноо",
        "Нийт төлбөр",
        "Төлөв",
        "Гэрээний төлөв",
        "Дугааллын дугаар",
      ];
      rows = (data.list || []).map((r) => [
        r.gereeniiDugaar || "",
        r.ovog || "",
        r.ner || "",
        Array.isArray(r.utas) ? r.utas.join(", ") : r.utas || "",
        r.toot || "",
        r.davkhar || "",
        r.bairNer || "",
        r.ognoo ? new Date(r.ognoo).toLocaleDateString("mn-MN") : "",
        r.tulukhOgnoo
          ? new Date(r.tulukhOgnoo).toLocaleDateString("mn-MN")
          : "",
        r.niitTulbur || 0,
        r.tuluv || "",
        r.gereeniiTuluv || "",
        r.dugaalaltDugaar || "",
      ]);
      fileName = "tsutslasan_gereenii_avlaga";
    } else if (report === "guitsetgel") {
      headers = [
        "Улирал/Сар",
        "Төлөвлөгөөт орлого",
        "Бодит орлого",
        "Орлогын зөрүү",
        "Орлогын зөрүү %",
        "Төлөвлөгөөт зардал",
        "Бодит зардал",
        "Зардлын зөрүү",
        "Зардлын зөрүү %",
        "Цэвэр орлого (төлөвлөгөө)",
        "Цэвэр орлого (бодит)",
      ];
      rows = (data.summary || []).map((item) => [
        item.period || "",
        item.plannedIncome || 0,
        item.actualIncome || 0,
        item.incomeVariance || 0,
        `${item.incomeVariancePercent || "0.00"}%`,
        item.plannedExpenses || 0,
        item.actualExpenses || 0,
        item.expensesVariance || 0,
        `${item.expensesVariancePercent || "0.00"}%`,
        (item.plannedIncome || 0) - (item.plannedExpenses || 0),
        (item.actualIncome || 0) - (item.actualExpenses || 0),
      ]);
      fileName = "guitsetgel";
    } else {
      return res.status(400).json({
        success: false,
        message: "Энэ тайланг экспортлох боломжгүй",
      });
    }

    // Export based on type
    if (type.toLowerCase() === "excel" || type.toLowerCase() === "xlsx") {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Set column widths
      const colWidths = headers.map(() => ({ wch: 15 }));
      ws["!cols"] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, "Тайлан");

      const excelBuffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}_${Date.now()}.xlsx"`
      );
      res.send(excelBuffer);
    } else if (type.toLowerCase() === "csv") {
      const csv = [headers, ...rows]
        .map((r) =>
          r
            .map((c) => (c == null ? "" : String(c).replace(/"/g, '""')))
            .map((c) => `"${c}"`)
            .join(",")
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}_${Date.now()}.csv"`
      );
      res.send(csv);
    } else if (type.toLowerCase() === "pdf") {
      // For PDF, we'll return a message that PDF export will be added later
      // or you can integrate a PDF library like pdfkit, puppeteer, etc.
      return res.status(400).json({
        success: false,
        message: "PDF экспорт удахгүй нэмэгдэнэ. Одоогоор зөвхөн Excel дэмжинэ.",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Энэ төрлийн экспорт одоогоор дэмжигдээгүй",
      });
    }
  } catch (error) {
    next(error);
  }
});

// Гүйцэтгэлийн тайлан (Сарын төлөвлөгөөт орлого vs бодит орлого г.м ба Зардлын төсөв vs бодит зардал г.м)
exports.tailanGuitsetgel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      turul = "sar", // "sar" (month) or "uliral" (quarter)
    } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const Geree = require("../models/geree");
    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
    const BankniiGuilgee = require("../models/bankniiGuilgee");

    // Date range
    const startDate = ekhlekhOgnoo
      ? new Date(ekhlekhOgnoo)
      : new Date(new Date().getFullYear(), 0, 1); // Start of year
    const endDate = duusakhOgnoo
      ? new Date(duusakhOgnoo)
      : new Date(); // Today

    // Get all active contracts
    const gereeMatch = {
      baiguullagiinId: String(baiguullagiinId),
      tuluv: "Идэвхтэй",
    };
    if (barilgiinId) gereeMatch.barilgiinId = String(barilgiinId);

    const activeGerees = await Geree(kholbolt).find(gereeMatch).lean();

    // Calculate planned monthly income from active contracts
    // For each contract, use niitTulbur as monthly expected income
    const plannedMonthlyIncome = activeGerees.reduce((sum, g) => {
      return sum + (g.niitTulbur || 0);
    }, 0);

    // Group by month or quarter
    const periods = {};
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      let periodKey;

      if (turul === "uliral") {
        const quarter = Math.ceil(month / 3);
        periodKey = `${year}-Q${quarter}`;
        // Move to next quarter
        currentDate.setMonth(currentDate.getMonth() + 3);
      } else {
        periodKey = `${year}-${String(month).padStart(2, "0")}`;
        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      if (!periods[periodKey]) {
        periods[periodKey] = {
          period: periodKey,
          year,
          month: turul === "sar" ? month : null,
          quarter: turul === "uliral" ? Math.ceil(month / 3) : null,
          plannedIncome: plannedMonthlyIncome,
          actualIncome: 0,
          incomeVariance: 0,
          incomeVariancePercent: 0,
          plannedExpenses: 0, // Will be calculated or configured
          actualExpenses: 0,
          expensesVariance: 0,
          expensesVariancePercent: 0,
        };
      }
    }

    // Calculate actual income from paid invoices
    const invoiceMatch = {
      baiguullagiinId: String(baiguullagiinId),
      tuluv: "Төлсөн",
    };
    if (barilgiinId) invoiceMatch.barilgiinId = String(barilgiinId);
    if (ekhlekhOgnoo || duusakhOgnoo) {
      invoiceMatch.tulsunOgnoo = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const paidInvoices = await NekhemjlekhiinTuukh(kholbolt)
      .find(invoiceMatch)
      .lean();

    // Group actual income by period
    paidInvoices.forEach((inv) => {
      if (!inv.tulsunOgnoo) return;
      const payDate = new Date(inv.tulsunOgnoo);
      const year = payDate.getFullYear();
      const month = payDate.getMonth() + 1;
      let periodKey;

      if (turul === "uliral") {
        const quarter = Math.ceil(month / 3);
        periodKey = `${year}-Q${quarter}`;
      } else {
        periodKey = `${year}-${String(month).padStart(2, "0")}`;
      }

      if (periods[periodKey]) {
        periods[periodKey].actualIncome += inv.niitTulbur || 0;
      }
    });

    // Calculate actual expenses from bank transactions
    const bankMatch = {
      baiguullagiinId: String(baiguullagiinId),
    };
    if (barilgiinId) bankMatch.barilgiinId = String(barilgiinId);
    if (ekhlekhOgnoo || duusakhOgnoo) {
      bankMatch.tranDate = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const bankTransactions = await BankniiGuilgee(kholbolt)
      .find(bankMatch)
      .lean();

    // Group actual expenses by period
    bankTransactions.forEach((trans) => {
      if (!trans.tranDate) return;
      const transDate = new Date(trans.tranDate);
      const year = transDate.getFullYear();
      const month = transDate.getMonth() + 1;
      let periodKey;

      if (turul === "uliral") {
        const quarter = Math.ceil(month / 3);
        periodKey = `${year}-Q${quarter}`;
      } else {
        periodKey = `${year}-${String(month).padStart(2, "0")}`;
      }

      if (periods[periodKey]) {
        // Expenses: negative amount or outcome field
        const expenseAmount =
          trans.outcome ||
          (trans.amount && trans.amount < 0 ? Math.abs(trans.amount) : 0);
        periods[periodKey].actualExpenses += expenseAmount;
      }
    });

    // Calculate variances and percentages
    const summary = Object.values(periods).map((period) => {
      period.incomeVariance = period.actualIncome - period.plannedIncome;
      period.incomeVariancePercent =
        period.plannedIncome > 0
          ? ((period.incomeVariance / period.plannedIncome) * 100).toFixed(2)
          : "0.00";

      period.expensesVariance = period.actualExpenses - period.plannedExpenses;
      period.expensesVariancePercent =
        period.plannedExpenses > 0
          ? ((period.expensesVariance / period.plannedExpenses) * 100).toFixed(2)
          : "0.00";

      return period;
    });

    // Sort by period
    summary.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (turul === "uliral") {
        return (a.quarter || 0) - (b.quarter || 0);
      }
      return (a.month || 0) - (b.month || 0);
    });

    // Calculate totals
    const totals = {
      plannedIncome: summary.reduce((sum, p) => sum + p.plannedIncome, 0),
      actualIncome: summary.reduce((sum, p) => sum + p.actualIncome, 0),
      plannedExpenses: summary.reduce((sum, p) => sum + p.plannedExpenses, 0),
      actualExpenses: summary.reduce((sum, p) => sum + p.actualExpenses, 0),
    };
    totals.incomeVariance = totals.actualIncome - totals.plannedIncome;
    totals.incomeVariancePercent =
      totals.plannedIncome > 0
        ? ((totals.incomeVariance / totals.plannedIncome) * 100).toFixed(2)
        : "0.00";
    totals.expensesVariance = totals.actualExpenses - totals.plannedExpenses;
    totals.expensesVariancePercent =
      totals.plannedExpenses > 0
        ? ((totals.expensesVariance / totals.plannedExpenses) * 100).toFixed(2)
        : "0.00";
    totals.netIncome = totals.actualIncome - totals.actualExpenses;
    totals.plannedNetIncome = totals.plannedIncome - totals.plannedExpenses;

    res.json({
      success: true,
      filter: {
        baiguullagiinId,
        barilgiinId: barilgiinId || null,
        ekhlekhOgnoo: ekhlekhOgnoo || null,
        duusakhOgnoo: duusakhOgnoo || null,
        turul,
      },
      summary,
      totals,
      activeContractsCount: activeGerees.length,
    });
  } catch (error) {
    next(error);
  }
});

// Төлөгдөөгүй удсан авлага 2+ сар
exports.tailanUdsanAvlaga = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.params.baiguullagiinId
      ? {
          baiguullagiinId: req.params.baiguullagiinId,
          ...(req.method === "GET" ? req.query : req.body),
        }
      : req.method === "GET"
      ? req.query
      : req.body;
    const { baiguullagiinId, barilgiinId } = source || {};

    if (!baiguullagiinId) {
      return res
        .status(400)
        .json({ success: false, message: "baiguullagiinId is required" });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

    // Calculate date 2 months ago
    const today = new Date();
    const twoMonthsAgo = new Date(today);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    twoMonthsAgo.setHours(0, 0, 0, 0);

    // Find unpaid invoices where payment due date (tulukhOgnoo) is more than 2 months ago
    const match = {
      baiguullagiinId: String(baiguullagiinId),
      tuluv: { $ne: "Төлсөн" }, // Not paid
      tulukhOgnoo: { $lt: twoMonthsAgo }, // Due date is more than 2 months ago
    };

    if (barilgiinId) match.barilgiinId = String(barilgiinId);

    const docs = await NekhemjlekhiinTuukh(kholbolt)
      .find(match)
      .lean()
      .sort({ tulukhOgnoo: 1 }); // Sort by due date, oldest first

    const result = [];
    let totalSum = 0;

    for (const d of docs) {
      // Calculate months overdue
      const dueDate = new Date(d.tulukhOgnoo);
      const monthsOverdue = Math.floor(
        (today - dueDate) / (1000 * 60 * 60 * 24 * 30)
      );

      const row = {
        gereeniiDugaar: d.gereeniiDugaar || "",
        ovog: d.ovog || "",
        ner: d.ner || "",
        utas: Array.isArray(d.utas) ? d.utas.join(", ") : d.utas || "",
        toot: d.toot || "",
        davkhar: d.davkhar || "",
        bairNer: d.bairNer || "",
        ognoo: d.ognoo || null,
        tulukhOgnoo: d.tulukhOgnoo || null,
        niitTulbur: d.niitTulbur || 0,
        tuluv: d.tuluv || "Төлөөгүй",
        monthsOverdue: monthsOverdue,
        dugaalaltDugaar: d.dugaalaltDugaar || null,
      };

      result.push(row);
      totalSum += d.niitTulbur || 0;
    }

    res.json({
      success: true,
      total: result.length,
      sum: totalSum,
      list: result,
      filterDate: twoMonthsAgo,
      currentDate: today,
    });
  } catch (error) {
    next(error);
  }
});

// Цуцлагдсан гэрээний авлага
exports.tailanTsutslasanGereeniiAvlaga = asyncHandler(
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const source = req.params.baiguullagiinId
        ? {
            baiguullagiinId: req.params.baiguullagiinId,
            ...(req.method === "GET" ? req.query : req.body),
          }
        : req.method === "GET"
        ? req.query
        : req.body;
      const { baiguullagiinId, barilgiinId } = source || {};

      if (!baiguullagiinId) {
        return res
          .status(400)
          .json({ success: false, message: "baiguullagiinId is required" });
      }

      const kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
      );
      if (!kholbolt) {
        return res
          .status(404)
          .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
      }

      const Geree = require("../models/geree");
      const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

      // Find all cancelled gerees
      const gereeMatch = {
        baiguullagiinId: String(baiguullagiinId),
        tuluv: { $in: ["Цуцалсан", "цуцалсан", "Цуцлагдсан", "цуцлагдсан", "Tsutlsasan", "tsutlsasan"] },
      };

      if (barilgiinId) gereeMatch.barilgiinId = String(barilgiinId);

      const cancelledGerees = await Geree(kholbolt)
        .find(gereeMatch)
        .select("_id gereeniiDugaar ovog ner utas toot davkhar bairNer")
        .lean();

      if (cancelledGerees.length === 0) {
        return res.json({
          success: true,
          total: 0,
          sum: 0,
          list: [],
          message: "Цуцлагдсан гэрээ олдсонгүй",
        });
      }

      // Get gereeniiId list
      const gereeniiIdList = cancelledGerees.map((g) => g._id.toString());

      // Find unpaid invoices for these cancelled gerees
      const nekhemjlekhMatch = {
        baiguullagiinId: String(baiguullagiinId),
        gereeniiId: { $in: gereeniiIdList },
        tuluv: { $ne: "Төлсөн" }, // Not paid
      };

      if (barilgiinId) nekhemjlekhMatch.barilgiinId = String(barilgiinId);

      const unpaidInvoices = await NekhemjlekhiinTuukh(kholbolt)
        .find(nekhemjlekhMatch)
        .lean()
        .sort({ ognoo: -1 });

      // Create a map of gereeniiId to geree info
      const gereeMap = {};
      cancelledGerees.forEach((g) => {
        gereeMap[g._id.toString()] = g;
      });

      const result = [];
      let totalSum = 0;

      for (const invoice of unpaidInvoices) {
        const geree = gereeMap[invoice.gereeniiId] || {};

        const row = {
          gereeniiDugaar: invoice.gereeniiDugaar || geree.gereeniiDugaar || "",
          ovog: invoice.ovog || geree.ovog || "",
          ner: invoice.ner || geree.ner || "",
          utas: Array.isArray(invoice.utas)
            ? invoice.utas.join(", ")
            : invoice.utas || Array.isArray(geree.utas)
            ? geree.utas.join(", ")
            : geree.utas || "",
          toot: invoice.toot || geree.toot || "",
          davkhar: invoice.davkhar || geree.davkhar || "",
          bairNer: invoice.bairNer || geree.bairNer || "",
          ognoo: invoice.ognoo || null,
          tulukhOgnoo: invoice.tulukhOgnoo || null,
          niitTulbur: invoice.niitTulbur || 0,
          tuluv: invoice.tuluv || "Төлөөгүй",
          gereeniiTuluv: "Цуцалсан",
          dugaalaltDugaar: invoice.dugaalaltDugaar || null,
          gereeniiId: invoice.gereeniiId || "",
        };

        result.push(row);
        totalSum += invoice.niitTulbur || 0;
      }

      res.json({
        success: true,
        total: result.length,
        sum: totalSum,
        list: result,
        cancelledGereesCount: cancelledGerees.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Нэгтгэл тайлан - Гэрээгээр бүлэглэсэн нэхэмжлэлийн авлагын нэгтгэл
// POST /tailan/negtgel
exports.tailanNegtgelTailan = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.method === "GET" ? req.query : req.body;

    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 500,
      search,
      gereeniiDugaar,
      tuluv, // optional: "Төлсөн" | "Төлөөгүй" | "Хугацаа хэтэрсэн"
    } = source || {};

    if (!baiguullagiinId) {
      return res.status(400).json({
        success: false,
        aldaa: "baiguullagiinId шаардлагатай",
      });
    }

    // Default to current month if dates missing
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const startStr = ekhlekhOgnoo || defaultStart;
    const endStr = duusakhOgnoo || defaultEnd;

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res
        .status(404)
        .json({ success: false, message: "Холболтын мэдээлэл олдсонгүй" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

    // ── Date range ───────────────────────────────────────────────────────────
    const startDate = new Date(startStr);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endStr);
    endDate.setHours(23, 59, 59, 999);

    // ── Build DB query ────────────────────────────────────────────────────────
    const query = {
      baiguullagiinId: String(baiguullagiinId),
      ognoo: { $gte: startDate, $lte: endDate },
    };
    if (barilgiinId) query.barilgiinId = String(barilgiinId);
    if (tuluv) query.tuluv = tuluv;
    if (gereeniiDugaar) {
      query.gereeniiDugaar = {
        $regex: escapeRegex(String(gereeniiDugaar).trim()),
        $options: "i",
      };
    }

    const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

    const Geree = require("../models/geree");

    // Standalone Receivables (e.g. initial balances)
    const standaloneMatch = {
      baiguullagiinId: String(baiguullagiinId),
      ognoo: { $gte: startDate, $lte: endDate },
      nekhemjlekhId: { $in: [null, ""] },
    };
    if (barilgiinId) standaloneMatch.barilgiinId = String(barilgiinId);

    // Standalone Payments
    const standalonePaidMatch = {
      baiguullagiinId: String(baiguullagiinId),
      ognoo: { $gte: startDate, $lte: endDate },
      nekhemjlekhId: { $in: [null, ""] },
    };
    if (barilgiinId) standalonePaidMatch.barilgiinId = String(barilgiinId);

    const [invoices, standaloneReceivables, standalonePayments] = await Promise.all([
      NekhemjlekhiinTuukh(kholbolt).find(query).lean(),
      GuilgeeAvlaguud(kholbolt).find(standaloneMatch).lean(),
      GuilgeeAvlaguud(kholbolt).find(standalonePaidMatch).lean(),
    ]);

    // Fetch ALL active contracts regardless of activity to accurately reflect the total building balance matching the Tulbur page
    const gereeQuery = { baiguullagiinId: String(baiguullagiinId) };
    if (barilgiinId) gereeQuery.barilgiinId = String(barilgiinId);
    
    const allContractsList = await Geree(kholbolt).find(gereeQuery).lean();
    const contracts = allContractsList.filter(c => {
      const st = String(c.tuluv || c.status || "").toLowerCase();
      return st !== "цуцалсан" && st !== "tsutlsasan";
    });

    const contractMap = {};
    contracts.forEach((c) => (contractMap[String(c._id)] = c));

    // ── Group invoices by contract ───────────────────────────────────────────
    const groupMap = new Map();

    // Pre-populate groupMap with ALL active contracts
    contracts.forEach((c) => {
       groupMap.set(String(c._id), {
          _id: {
            gereeniiId: String(c._id),
            gereeniiDugaar: c.gereeniiDugaar || "",
            register: c.register || c.rd || "",
            ovog: c.ovog || "",
            ner: c.ner || "",
            utas: Array.isArray(c.utas) ? c.utas : c.utas ? [c.utas] : [],
            davkhar: c.davkhar || "",
            orts: c.orts || "",
            toot: c.toot || c.medeelel?.toot || "",
          },
          avlaga: [],
          niitTulukhDun: 0,
          niitTulsunDun: 0,
          niitUldegdel: 0, 
          globalUldegdel: Number(c.globalUldegdel ?? c.uldegdel ?? 0),
          invoiceToo: 0,
          paymentToo: 0,
          hasInvoiceEkhniiUldegdel: false,
       });
    });

    for (const inv of invoices) {
      const groupKey = inv.gereeniiId || inv.gereeniiDugaar || String(inv._id);
      
      // If contract is cancelled or not found, we skip to align with Active filter
      if (!groupMap.has(groupKey) && inv.gereeniiId && !contractMap[String(inv.gereeniiId)]) {
        continue;
      }

      if (!groupMap.has(groupKey)) {
        const c = contractMap[String(inv.gereeniiId)] || inv;
        groupMap.set(groupKey, {
          // Maintaining the nested _id structure as the user preferred in their snippet
          _id: {
            gereeniiId: inv.gereeniiId || "",
            gereeniiDugaar: inv.gereeniiDugaar || "",
            register: inv.register || "",
            ovog: inv.ovog || "",
            ner: inv.ner || "",
            utas: Array.isArray(inv.utas) ? inv.utas : inv.utas ? [inv.utas] : [],
            davkhar: inv.davkhar || "",
            orts: inv.orts || "",
            toot: inv.toot || inv.medeelel?.toot || "",
          },
          avlaga: [],
          niitTulukhDun: 0,
          niitTulsunDun: 0,
          niitUldegdel: 0, 
          globalUldegdel: Number(c.globalUldegdel ?? c.uldegdel ?? 0),
          invoiceToo: 0,
          paymentToo: 0,
          hasInvoiceEkhniiUldegdel: false,
        });
      }

      const group = groupMap.get(groupKey);

      // Deduplication check: see if this invoice has a starting balance item
      const zardluud = inv.medeelel?.zardluud || [];
      const hasEkhniiUldegdel = zardluud.some((z) => {
        const ner = String(z.ner || z.tailbar || "").toLowerCase();
        return ner.includes("эхний үлдэгдэл") || ner.includes("ekhni uldegdel") || z.isEkhniiUldegdel;
      });
      if (hasEkhniiUldegdel) {
        group.hasInvoiceEkhniiUldegdel = true;
      }

      const tulukhDun = Number(inv.niitTulburOriginal != null ? inv.niitTulburOriginal : inv.niitTulbur) || 0;
      const uldegdel = Number(inv.uldegdel || 0);

      const avlagaRow = {
        _id: inv._id,
        toot: inv.toot || inv.medeelel?.toot || "",
        ognoo: inv.ognoo || null,
        tailbar: inv.tailbar || inv.zagvariinNer || "Нэхэмжлэх",
        tulukhDun,
        niitTulbur: Number(inv.niitTulbur || 0),
        uldegdel,
        tuluv: inv.tuluv || "Төлөөгүй",
        nekhemjlekhiinDugaar: inv.nekhemjlekhiinDugaar || "",
        zardluud: zardluud.map((z) => ({
          ner: z.ner || z.tailbar || "Бусад зардал",
          dun: Number(z.tulukhDun || z.dun || 0),
          tailbar: z.tailbar || "",
          turul: z.turul || "",
          zardliinTurul: z.zardliinTurul || "",
          zaaltTog: z.zaaltTog || null,
          zaaltUs: z.zaaltUs || null,
        })),
        khungulultuud: (inv.medeelel?.khungulultuud || []).map((k) => ({
          ner: k.tailbar || "Хөнгөлөлт",
          dun: Number(k.khungulultiinDun || k.tulukhDun || 0),
          turul: k.turul || "",
        })),
      };
      group.avlaga.push(avlagaRow);

      group.niitTulukhDun += tulukhDun;
      // Sum the actual charges to match the period's total billing
      group.niitUldegdel += tulukhDun;
      group.invoiceToo += 1;

      // Only count payments that occurred WITHIN the period
      const periodPayments = (inv.paymentHistory || []).filter(p => {
        const pDate = new Date(p.ognoo || p.tulsunOgnoo || p.createdAt);
        return pDate >= startDate && pDate <= endDate;
      }).reduce((s, p) => s + (Number(p.dun || p.tulsunDun || 0)), 0);
      
      group.niitTulsunDun += periodPayments;
    }

    // ── Process Standalone Receivables ───────────────────────────────────────
    for (const s of standaloneReceivables) {
      const gid = String(s.gereeniiId);
      if (!gid || gid === "undefined" || gid === "null") continue;
      
      if (!groupMap.has(gid) && !contractMap[gid]) {
         continue; // Exclude inactive contracts
      }
      
      const meta = contractMap[gid] || s;
      if (!groupMap.has(gid)) {
        groupMap.set(gid, {
          _id: {
            gereeniiId: gid,
            gereeniiDugaar: meta.gereeniiDugaar || "",
            register: meta.register || meta.rd || "",
            ovog: meta.ovog || "",
            ner: meta.ner || "",
            utas: Array.isArray(meta.utas) ? meta.utas : meta.utas ? [meta.utas] : [],
            davkhar: meta.davkhar || "",
            orts: meta.orts || "",
            toot: meta.toot || meta.medeelel?.toot || "",
          },
          avlaga: [],
          niitTulukhDun: 0,
          niitTulsunDun: 0,
          niitUldegdel: 0,
          invoiceToo: 0,
          paymentToo: 0,
          hasInvoiceEkhniiUldegdel: false,
        });
      }

      const group = groupMap.get(gid);

      // SKIP standalone ekhnii uldegdel if any invoice in the range already has it
      const ner = String(s.zardliinNer || "").toLowerCase();
      const isEkhnii = ner.includes("эхний үлдэгдэл") || ner.includes("ekhni uldegdel") || s.ekhniiUldegdelEsekh;
      if (isEkhnii && group.hasInvoiceEkhniiUldegdel) continue;

      const row = {
        _id: s._id,
        toot: group._id.toot,
        ognoo: s.ognoo || null,
        tailbar: s.zardliinNer || "Авлага (Нэхэмжлэхгүй)",
        tulukhDun: Number(s.tulukhDun || s.undsenDun || 0),
        niitTulbur: Number(s.undsenDun || 0),
        uldegdel: Number(s.uldegdel || 0),
        tuluv: "Төлөөгүй",
        zardluud: [{
          ner: s.zardliinNer || "Авлага",
          dun: Number(s.tulukhDun || s.undsenDun || 0),
          tailbar: s.tailbar || "",
        }],
        khungulultuud: [],
      };
      group.avlaga.push(row);
      group.niitTulukhDun += row.tulukhDun;
      // Sum standalone charges
      group.niitUldegdel += row.tulukhDun;
      // Standalone receivable uldegdel is also not added to niitUldegdel as we use the contract total
      // We don't count paid based on tulukh - uldegdel for standalone, we only count payments from TulsunRecords
    }

    // ── Process Standalone Payments ──────────────────────────────────────────
    for (const p of standalonePayments) {
      const gid = String(p.gereeniiId);
      if (!gid || gid === "undefined" || gid === "null") continue;

      if (!groupMap.has(gid) && !contractMap[gid]) {
         continue;
      }

      if (!groupMap.has(gid)) {
         const meta = contractMap[gid] || p;
         groupMap.set(gid, {
          _id: {
            gereeniiId: gid,
            gereeniiDugaar: meta.gereeniiDugaar || "",
            register: meta.register || meta.rd || "",
            ovog: meta.ovog || "",
            ner: meta.ner || "",
            utas: Array.isArray(meta.utas) ? meta.utas : meta.utas ? [meta.utas] : [],
            davkhar: meta.davkhar || "",
            orts: meta.orts || "",
            toot: meta.toot || meta.medeelel?.toot || "",
          },
          avlaga: [],
          niitTulukhDun: 0,
          niitTulsunDun: 0,
          niitUldegdel: 0,
          invoiceToo: 0,
          paymentToo: 0,
        });
      }

      const group = groupMap.get(gid);
      if (!group.globalUldegdel && groupMap.has(gid)) {
         const meta = contractMap[gid];
         if (meta) {
           // globalUldegdel removed
         }
      }
      const paidDun = Number(p.tulsunDun || 0);
      group.niitTulsunDun += paidDun;
      group.paymentToo += 1;
    }

    // ── Convert map to array ──────────────────────────────────────────────────
    let groups = Array.from(groupMap.values());

    // ── Post-group search ─────────────────────────────────────────────────────
    if (search && String(search).trim()) {
      const re = new RegExp(escapeRegex(String(search).trim()), "i");
      groups = groups.filter(
        (g) =>
          re.test(g._id.ner) ||
          re.test(g._id.ovog) ||
          re.test(g._id.register) ||
          re.test(g._id.gereeniiDugaar) ||
          re.test(g._id.toot)
      );
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    groups.sort((a, b) => {
      const n = (a._id.ner || "").localeCompare(b._id.ner || "", "mn");
      return n !== 0 ? n : (a._id.gereeniiDugaar || "").localeCompare(b._id.gereeniiDugaar || "", "mn");
    });

    // ── Pagination ────────────────────────────────────────────────────────────
    const niitToo = groups.length;
    const page = Math.max(1, Number(khuudasniiDugaar));
    const pageSize = Math.min(1000, Math.max(1, Number(khuudasniiKhemjee)));
    const paginatedGroups = groups.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      niitToo,
      khuudasniiDugaar: page,
      khuudasniiKhemjee: pageSize,
      data: paginatedGroups,
    });
  } catch (error) {
    next(error);
  }
});

// Оршин суугчдын сар бүрийн төлбөрийн нэгтгэл (Matrix Report)
// Сарын төлбөрийг багана хэлбэрээр (month1, month2...) харуулна
exports.tailanOrshinSuugchSariinMatrix = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const source = req.method === "GET" ? req.query : req.body;
    const {
      baiguullagiinId,
      barilgiinId,
      ekhlekhOgnoo,
      duusakhOgnoo,
      khuudasniiDugaar = 1,
      khuudasniiKhemjee = 50,
      search,
    } = source || {};

    if (!baiguullagiinId || !ekhlekhOgnoo || !duusakhOgnoo) {
      return res.status(400).json({
        success: false,
        message: "baiguullagiinId, ekhlekhOgnoo, duusakhOgnoo заавал бөглөнө",
      });
    }

    const kholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
    );
    if (!kholbolt) {
      return res.status(404).json({ success: false, message: "Connection not found" });
    }

    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

    const startDate = new Date(ekhlekhOgnoo);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(duusakhOgnoo);
    endDate.setHours(23, 59, 59, 999);

    const match = {
      baiguullagiinId: String(baiguullagiinId),
      ognoo: { $gte: startDate, $lte: endDate },
      tuluv: { $ne: "Цуцлагдсан" },
    };

    if (barilgiinId) {
      const GereeModel = require("../models/geree");
      const gerees = await GereeModel(kholbolt).find({ barilgiinId: String(barilgiinId) }, { _id: 1 }).lean();
      const buildingGereeIds = gerees.map(g => String(g._id));
      
      match.$or = [
        { barilgiinId: String(barilgiinId) },
        { gereeniiId: { $in: buildingGereeIds } }
      ];
    }

  
    const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

    // Fetch invoices and standalone ledger entries
    const [invoices, standaloneEntries] = await Promise.all([
      NekhemjlekhiinTuukh(kholbolt).find(match).sort({ createdAt: 1 }).lean(),
      GuilgeeAvlaguud(kholbolt).find(match).lean(),
    ]);

    // Pivot data
    const residentMap = new Map();
    const periods = new Set();

    // Helper to get or create resident entry
    const getOrCreateRes = (gid, item) => {
      if (!residentMap.has(gid)) {
        residentMap.set(gid, {
          gereeniiId: item.gereeniiId || "",
          gereeniiDugaar: item.gereeniiDugaar || "",
          ovog: item.ovog || "",
          ner: item.ner || "",
          toot: item.toot || item.medeelel?.toot || "",
          davkhar: item.davkhar || "",
          bairNer: item.bairNer || "",
          orts: item.orts || "",
          utas: Array.isArray(item.utas) ? item.utas : item.utas ? [item.utas] : [],
          months: {},
          niitTulukh: 0,
          niitTulsun: 0,
          startingBalance: 0,
          earliestOgnoo: null,
        });
      }
      return residentMap.get(gid);
    };

    // Build payment lookup map: invoiceId -> total paid amount from ledger entries
    // Payments are stored as GuilgeeAvlaguud records with nekhemjlekhId pointing to the invoice
    // IMPORTANT: only dun < 0 entries are actual payments; dun > 0 are invoice charge line items
    const invoicePaymentMap = new Map();
    for (const entry of standaloneEntries) {
      if (!entry.nekhemjlekhId) continue;
      if (Number(entry.dun || 0) >= 0) continue; // Skip charge line items, only count payments
      const invId = String(entry.nekhemjlekhId);
      const paidAmt = Math.abs(Number(entry.dun));
      invoicePaymentMap.set(invId, (invoicePaymentMap.get(invId) || 0) + paidAmt);
    }

    // 1. Process Invoices
    for (const inv of invoices) {
      const gid = String(inv.gereeniiId || inv.gereeniiDugaar || "unknown");
      const invDate = inv.ognoo ? new Date(inv.ognoo) : null;
      const monthKey = invDate ? `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}` : "unknown";
      if (monthKey !== "unknown") periods.add(monthKey);

      const resData = getOrCreateRes(gid, inv);

      if (invDate && (!resData.earliestOgnoo || invDate < resData.earliestOgnoo)) {
        resData.earliestOgnoo = invDate;
        resData.startingBalance = Number(inv.ekhniiUldegdel) || 0;
      }

      if (!resData.months[monthKey]) {
        resData.months[monthKey] = { billed: 0, paid: 0, status: "Төлөөгүй" };
      }

      const billed = Number(inv.niitTulburOriginal != null ? inv.niitTulburOriginal : inv.niitTulbur) || 0;
      // ONLY use ledger-based payments — inv.tulsunDun can be stale/double-counted
      const paid = invoicePaymentMap.get(String(inv._id)) || 0;

      resData.months[monthKey].billed += billed;
      resData.months[monthKey].paid += paid;
      if (inv.tuluv === "Төлсөн") resData.months[monthKey].status = "Төлсөн";

      resData.niitTulukh += billed;
      resData.niitTulsun += paid;
    }

    // 2. Process Standalone Ledger Entries (including Initial Balance)
    for (const s of standaloneEntries) {
      if (s.nekhemjlekhId) continue; // Invoice-linked payments already counted above via invoicePaymentMap

      const gid = String(s.gereeniiId || s.gereeniiDugaar || "unknown");
      const sDate = s.ognoo || s.createdAt ? new Date(s.ognoo || s.createdAt) : null;
      const monthKey = sDate ? `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, "0")}` : "unknown";
      if (monthKey !== "unknown") periods.add(monthKey);

      const resData = getOrCreateRes(gid, s);

      if (!resData.months[monthKey]) {
        resData.months[monthKey] = { billed: 0, paid: 0, status: "Төлөөгүй" };
      }

      // If it's an initial balance ledger item, it contributes to startingBalance
      if (s.ekhniiUldegdelEsekh) {
        resData.startingBalance += Number(s.undsenDun || s.tulukhDun || 0);
      } else {
        const rawDun = Number(s.dun ?? 0);
        const tulsunDun = Number(s.tulsunDun ?? 0);
        
        let billed = 0;
        let paid = 0;

        if (rawDun > 0) {
          billed = rawDun;
          paid = tulsunDun;
        } else if (rawDun < 0) {
          paid = Math.abs(rawDun);
          billed = 0;
        }

        resData.months[monthKey].billed += billed;
        resData.months[monthKey].paid += paid;
        
        resData.niitTulukh += billed;
        resData.niitTulsun += paid;
      }
    }

    let list = Array.from(residentMap.values());
    const sortedPeriods = Array.from(periods).sort();

    // Searching
    if (search && String(search).trim()) {
      const re = new RegExp(escapeRegex(String(search).trim()), "i");
      list = list.filter(r => 
        re.test(r.ner) || re.test(r.ovog) || re.test(r.toot) || re.test(r.gereeniiDugaar)
      );
    }

    // Finalize status for each resident month based on total billed vs total paid (ledger + initial)
    list.forEach(res => {
      let cumulativeBalance = res.startingBalance || 0;
      sortedPeriods.forEach(p => {
        const m = res.months[p];
        if (m) {
          cumulativeBalance += (m.billed || 0) - (m.paid || 0);
          // If balance for this month (and previous) is 0 or less, mark as Paid
          if (cumulativeBalance <= 0) {
            m.status = "Төлсөн";
          } else {
            m.status = "Төлөөгүй";
          }
        }
      });
    });

    // Sorting by toot
    list.sort((a, b) => {
      const aTootNum = parseInt(a.toot);
      const bTootNum = parseInt(b.toot);
      if (!isNaN(aTootNum) && !isNaN(bTootNum)) return aTootNum - bTootNum;
      return String(a.toot).localeCompare(String(b.toot));
    });

    // Pagination
    const totalCount = list.length;
    const page = Number(khuudasniiDugaar);
    const size = Number(khuudasniiKhemjee);
    const paginated = list.slice((page - 1) * size, page * size);

    // Calculate summary across the entire list (not just paginated page)
    const summary = {};
    sortedPeriods.forEach(p => { summary[p] = { billed: 0, paid: 0 }; });
    list.forEach(res => {
      Object.entries(res.months).forEach(([p, val]) => {
        if (summary[p]) {
          summary[p].billed += (val.billed || 0);
          summary[p].paid += (val.paid || 0);
        }
      });
    });

    res.json({
      success: true,
      periods: sortedPeriods,
      summary,
      totalCount,
      khuudasniiDugaar: page,
      list: paginated,
    });
  } catch (error) {
    next(error);
  }
});

