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

module.exports = { turulNer, tootNer, ezemshigchNer, olsonToot, munguFormat };
