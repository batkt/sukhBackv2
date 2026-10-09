/**
 * Шалгалтын алдааны мессежид тоот / гараж / агуулахыг ойлгомжтой нэрлэх,
 * эзэмшигчийг нь заах туслах функцууд.
 *
 * Жишээ:
 *   tootNer({ toot: "40", turul: "Гараж", davkhar: "B1", orts: "1" })
 *     → "Гараж 40 дугаар (B1 давхар, 1-р орц)"
 *   ezemshigchNer(doc) → "«Б. Бат» (утас 99112233, 52 тоот)"
 */

const turulNer = (turul) => {
  const t = String(turul || "").trim().toLowerCase();
  if (t === "гараж" || t === "гараш" || t === "зогсоол") return "Гараж";
  if (t === "агуулах") return "Агуулах";
  return "Орон сууц";
};

const ortsNer = (orts) => {
  const o = String(orts || "").trim();
  if (!o) return "";
  return /^\d+$/.test(o) ? `${o}-р орц` : `${o} орц`;
};

/** Нэгжийн бүтэн нэр: төрөл + дугаар + (давхар, орц, байр). */
function tootNer({ toot, turul, orts, davkhar, bairniiNer } = {}) {
  const ner = turulNer(turul);
  const dugaar = String(toot || "").trim();
  const tolgoi =
    ner === "Орон сууц" ? `${dugaar} тоот` : `${ner} ${dugaar} дугаар`;
  const nemelt = [
    davkhar ? `${String(davkhar).trim()} давхар` : "",
    ortsNer(orts),
    bairniiNer ? `«${String(bairniiNer).trim()}»` : "",
  ].filter(Boolean);
  return nemelt.length ? `${tolgoi} (${nemelt.join(", ")})` : tolgoi;
}

/** Эзэмшигчийн нэр, утас, (гараж/агуулахын үед) орон сууцны тоот. */
function ezemshigchNer(doc, { orsonSuutsToot = true } = {}) {
  if (!doc) return "";
  const ner = [doc.ovog, doc.ner].filter(Boolean).join(" ").trim();
  const utas = Array.isArray(doc.utas) ? doc.utas[0] : doc.utas;
  const aptToot = orsonSuutsToot
    ? (Array.isArray(doc.toots) ? doc.toots : []).find(
        (t) => t && t.toot && turulNer(t.turul) === "Орон сууц",
      )?.toot || ""
    : "";
  const nemelt = [utas ? `утас ${utas}` : "", aptToot ? `${aptToot} тоот` : ""]
    .filter(Boolean)
    .join(", ");
  if (ner) return nemelt ? `«${ner}» (${nemelt})` : `«${ner}»`;
  return utas ? `утас ${utas}` : "";
}

/**
 * Давхцсан баримтаас тухайн тоотын бичлэгийг (toots[] эсвэл дээд түвшин) олно.
 * Олдохгүй бол оролтын утгуудаар нөхнө.
 */
function olsonToot(doc, { toot, barilgiinId, orts, davkhar, turul } = {}) {
  const dugaar = String(toot || "").trim();
  const tootuud = Array.isArray(doc?.toots) ? doc.toots : [];
  const taarsan =
    tootuud.find(
      (t) =>
        String(t?.toot || "").trim() === dugaar &&
        (!barilgiinId || !t.barilgiinId || String(t.barilgiinId) === String(barilgiinId)) &&
        (!orts || !t.orts || String(t.orts) === String(orts)) &&
        (!davkhar || !t.davkhar || String(t.davkhar) === String(davkhar)) &&
        (!turul || turulNer(t.turul) === turulNer(turul)),
    ) || null;
  return {
    toot: dugaar,
    turul: taarsan?.turul || turul || "Орон сууц",
    orts: taarsan?.orts || orts || (String(doc?.toot || "") === dugaar ? doc?.orts : "") || "",
    davkhar:
      taarsan?.davkhar || davkhar || (String(doc?.toot || "") === dugaar ? doc?.davkhar : "") || "",
    bairniiNer: taarsan?.bairniiNer || doc?.bairniiNer || "",
  };
}

/** Мөнгөн дүн: 1234567.5 → "1,234,567.50₮" */
function munguFormat(dun) {
  const n = Number(dun) || 0;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₮`;
}

function getFloorRegex(rawFloor) {
  if (!rawFloor) return null;
  const f = String(rawFloor).trim();
  const m = f.match(/^[bBвВ\s-]*(\d+)$/i);
  if (m) {
    const num = m[1];
    return new RegExp(`^([bBвВ\\s-]*|[-]?)${num}$`, "i");
  }
  return new RegExp(`^${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

/**
 * Оршин суугч болон харилцагч цуглуулга дээр тоот / гараж / агуулах давхардсан эсэхийг хоёр талын холбоосоор шалгах
 */
async function shalgakhTootDavkhardal({
  tootsToCheck,
  currentKhariltsagchId = null,
  currentOrshinSuugchId = null,
  baiguullagiinId,
  barilgiinId,
  erunkhiiKholbolt,
}) {
  if (!tootsToCheck || !Array.isArray(tootsToCheck) || tootsToCheck.length === 0) {
    return { hasConflict: false };
  }

  const OrshinSuugchModel = require("../models/orshinSuugch")(erunkhiiKholbolt);
  const KhariltsagchModel = require("../models/khariltsagch")(erunkhiiKholbolt);

  for (const item of tootsToCheck) {
    const rawToot = String(item.toot || "").trim();
    if (!rawToot) continue;

    const bId = String(item.barilgiinId || barilgiinId || "").trim();
    const rawTurul = String(item.turul || "Орон сууц").trim();
    const isGarage =
      rawTurul === "Гараж" ||
      rawTurul === "Зогсоол" ||
      rawTurul.toLowerCase() === "гараж" ||
      rawTurul.toLowerCase() === "зогсоол";
    const isStorage =
      rawTurul === "Агуулах" || rawTurul.toLowerCase() === "агуулах";
    const davkhar = item.davkhar ? String(item.davkhar).trim() : "";
    const orts = item.orts ? String(item.orts).trim() : "";

    const cleanDugaar = rawToot
      .replace(/^(гараж|зогсоол|агуулах|тоот|\s)+/i, "")
      .replace(/(тоот|\s)+$/i, "");
    const numOnly = cleanDugaar.replace(/^0+/, "");
    const tootRegex = numOnly
      ? new RegExp(`^(0*${numOnly}|${cleanDugaar})$`, "i")
      : new RegExp(`^${rawToot}$`, "i");

    let turulMatch;
    if (isGarage) {
      turulMatch = { $in: ["Гараж", "Зогсоол", "гараж", "зогсоол"] };
    } else if (isStorage) {
      turulMatch = { $in: ["Агуулах", "агуулах"] };
    } else {
      turulMatch = {
        $nin: ["Гараж", "Зогсоол", "гараж", "зогсоол", "Агуулах", "агуулах"],
      };
    }

    const floorRegex = davkhar ? getFloorRegex(davkhar) : null;

    // 1. Check in OrshinSuugch (residents)
    const resOrConditions = [];
    const resBase = {
      $or: [{ toot: tootRegex }, { linkedAptToot: tootRegex }],
      turul: turulMatch,
    };
    if (bId) resBase.barilgiinId = bId;
    if (floorRegex && (isGarage || isStorage)) {
      resBase.davkhar = { $in: [floorRegex, "", null, undefined] };
    } else if (davkhar && !isGarage && !isStorage) {
      resBase.davkhar = davkhar;
    }
    if (orts && !isGarage && !isStorage) {
      resBase.orts = orts;
    }

    resOrConditions.push({
      toots: {
        $elemMatch: resBase,
      },
    });

    const rootResMatch = {
      toot: tootRegex,
      turul: turulMatch,
    };
    if (bId) rootResMatch.barilgiinId = bId;
    if (floorRegex && (isGarage || isStorage)) {
      rootResMatch.davkhar = { $in: [floorRegex, "", null, undefined] };
    } else if (davkhar && !isGarage && !isStorage) {
      rootResMatch.davkhar = davkhar;
    }
    if (orts && !isGarage && !isStorage) {
      rootResMatch.orts = orts;
    }
    resOrConditions.push(rootResMatch);

    const resQuery = { $or: resOrConditions };
    if (currentOrshinSuugchId) {
      resQuery._id = { $ne: currentOrshinSuugchId };
    }

    const existingRes = await OrshinSuugchModel.findOne(resQuery).lean();
    if (existingRes) {
      const ezen = ezemshigchNer(existingRes) || "оршин суугч";
      return {
        hasConflict: true,
        message: `${tootNer(olsonToot(existingRes, { toot: rawToot, barilgiinId: bId, orts, davkhar, turul: rawTurul }))} ${ezen} (оршин суугч)-д идэвхтэй бүртгэлтэй байна. Сул дугаар сонгох эсвэл тухайн оршин суугчаас салгана уу.`,
      };
    }

    // 2. Check in Khariltsagch (other clients)
    const kharOrConditions = [];
    const kharBase = {
      $or: [{ toot: tootRegex }, { linkedAptToot: tootRegex }],
      turul: turulMatch,
    };
    if (bId) kharBase.barilgiinId = bId;
    if (floorRegex && (isGarage || isStorage)) {
      kharBase.davkhar = { $in: [floorRegex, "", null, undefined] };
    } else if (davkhar && !isGarage && !isStorage) {
      kharBase.davkhar = davkhar;
    }
    if (orts && !isGarage && !isStorage) {
      kharBase.orts = orts;
    }

    kharOrConditions.push({
      toots: {
        $elemMatch: kharBase,
      },
    });

    const rootKharMatch = {
      toot: tootRegex,
      turul: turulMatch,
    };
    if (bId) rootKharMatch.barilgiinId = bId;
    if (floorRegex && (isGarage || isStorage)) {
      rootKharMatch.davkhar = { $in: [floorRegex, "", null, undefined] };
    } else if (davkhar && !isGarage && !isStorage) {
      rootKharMatch.davkhar = davkhar;
    }
    if (orts && !isGarage && !isStorage) {
      rootKharMatch.orts = orts;
    }
    kharOrConditions.push(rootKharMatch);

    const kharQuery = { $or: kharOrConditions };
    if (currentKhariltsagchId) {
      kharQuery._id = { $ne: currentKhariltsagchId };
    }

    const existingKhar = await KhariltsagchModel.findOne(kharQuery).lean();
    if (existingKhar) {
      const ezen = ezemshigchNer(existingKhar) || "өөр харилцагч";
      return {
        hasConflict: true,
        message: `${tootNer(olsonToot(existingKhar, { toot: rawToot, barilgiinId: bId, orts, davkhar, turul: rawTurul }))} ${ezen} (харилцагч)-д идэвхтэй бүртгэлтэй байна. Сул дугаар сонгох эсвэл тухайн харилцагчаас салгана уу.`,
      };
    }
  }

  return { hasConflict: false };
}

module.exports = {
  turulNer,
  tootNer,
  ezemshigchNer,
  olsonToot,
  munguFormat,
  getFloorRegex,
  shalgakhTootDavkhardal,
};
