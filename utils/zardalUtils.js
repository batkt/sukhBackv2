/**
 * Normalize turul string (e.g. lowercase "тогтмол" -> "Тогтмол").
 * @param {string} turul
 * @returns {string|undefined} Normalized value or original
 */
function normalizeTurul(turul) {
  if (!turul || typeof turul !== "string") {
    return turul;
  }
  if (turul.toLowerCase() === "тогтмол") {
    return "Тогтмол";
  }
  return turul;
}

/**
 * Apply normalizeTurul to each zardal's turul in an array.
 * @param {Array} zardluud
 * @returns {Array} Same structure with normalized turul
 */
function normalizeZardluudTurul(zardluud) {
  if (!Array.isArray(zardluud)) {
    return zardluud;
  }
  return zardluud.map((zardal) => {
    if (zardal && typeof zardal === "object") {
      return {
        ...zardal,
        turul: normalizeTurul(zardal.turul),
      };
    }
    return zardal;
  });
}

/**
 * Sum dun (or tariff) for an array of zardluud.
 * @param {Array} zardluud
 * @returns {number}
 */
function sumZardalDun(zardluud) {
  if (!Array.isArray(zardluud)) return 0;
  const total = zardluud.reduce((sum, z) => sum + (Number(z.dun || z.tariff || 0) || 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Deduplicate zardluud by ner|turul|zardliinTurul|barilgiinId (normalized turul).
 * @param {Array} zardluud
 * @returns {Array} Deduplicated array
 */
function deduplicateZardluud(zardluud) {
  if (!Array.isArray(zardluud)) {
    return zardluud;
  }

  const seen = new Set();
  const deduplicated = [];

  for (const zardal of zardluud) {
    if (!zardal || typeof zardal !== "object") {
      continue;
    }

    const normalizedTurul = normalizeTurul(zardal.turul);
    const key = `${zardal.ner || ""}|${normalizedTurul || ""}|${zardal.zardliinTurul || ""}|${zardal.barilgiinId || ""}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(zardal);
    }
  }

  return deduplicated;
}

module.exports = {
  normalizeTurul,
  normalizeZardluudTurul,
  deduplicateZardluud,
  sumZardalDun,
};
