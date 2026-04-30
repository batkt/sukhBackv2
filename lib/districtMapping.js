
/**
 * Maps Mongolian district names to their corresponding PosAPI branch codes.
 * Based on the getBranchInfo data from E-barimt.
 */
const DISTRICT_MAP = {
  "Баянгол": "26",
  "Баянзүрх": "24",
  "Сонгинохайрхан": "34",
  "Чингэлтэй": "35",
  "Хан-Уул": "23",
  "Сүхбаатар": "25",
  "Налайх": "29",
  "Багануур": "27",
  "Багахангай": "28",
  "Говьсүмбэр": "32"
};

/**
 * Parses a descriptive district string like "Баянгол 2-р хороо" into a 4-digit districtCode.
 * @param {string} text - The input text from database
 * @returns {string|null} - 4-digit code or null if not found
 */
function parseDistrictCode(text) {
  if (!text) return null;
  
  // Try to find the district name in the text
  let branchCode = null;
  for (const [name, code] of Object.entries(DISTRICT_MAP)) {
    if (text.includes(name)) {
      branchCode = code;
      break;
    }
  }
  
  if (!branchCode) return null;
  
  // Extract the horizontal (sub-branch) number
  // e.g., "2-р хороо" -> "02"
  const digits = text.match(/\d+/g);
  if (!digits || digits.length === 0) return branchCode + "01"; // Fallback to 1st khoroo
  
  const subBranchCode = digits[0].padStart(2, "0");
  return branchCode + subBranchCode;
}

/**
 * Resolves a valid 4-digit district code using multiple strategies.
 * @param {object} tokhirgoo - The configuration object from building/organization
 * @param {object} kholbolt - The database connection for TatvariinAlba lookup
 * @returns {Promise<string>} - 4-digit numeric code
 */
async function resolveDistrictCode(tokhirgoo, kholbolt = null) {
  if (!tokhirgoo) return "0001";

  // Strategy 1: Use EbarimtDistrictCode if it's already a 4-digit numeric string
  if (tokhirgoo.EbarimtDistrictCode && /^\d{4}$/.test(tokhirgoo.EbarimtDistrictCode)) {
    return tokhirgoo.EbarimtDistrictCode;
  }

  // Strategy 2: Use districtCode if it's already a 4-digit numeric string
  if (tokhirgoo.districtCode && /^\d{4}$/.test(tokhirgoo.districtCode)) {
    return tokhirgoo.districtCode;
  }

  // Strategy 3: Try to parse names (City + Horoo) using static map
  const cityName = (tokhirgoo.EbarimtDuuregNer || tokhirgoo.duuregNer || "").trim();
  const horooName = (tokhirgoo.EbarimtDHoroo?.ner || tokhirgoo.horoo?.ner || "").trim();
  
  if (cityName && horooName) {
    const combined = `${cityName} ${horooName}`;
    const parsed = parseDistrictCode(combined);
    if (parsed) return parsed;
  }

  // Strategy 4: Advanced DB Lookup in TatvariinAlba
  if (kholbolt && cityName && horooName) {
    try {
      const TatvariinAlba = require("../models/tatvariinAlba");
      let city = await TatvariinAlba(kholbolt).findOne({ ner: cityName });
      
      if (!city) {
        const allCities = await TatvariinAlba(kholbolt).find({});
        city = allCities.find(c => c.ner && c.ner.trim().toLowerCase() === cityName.toLowerCase());
      }

      if (city && city.kod) {
        let district = city.ded?.find(d => d.ner === horooName || d.ner === horooName.trim());
        if (!district && city.ded) {
          district = city.ded.find(d => {
            const dName = d.ner?.trim().toLowerCase() || "";
            const hName = horooName.toLowerCase();
            return dName === hName || dName.includes(hName) || hName.includes(dName);
          });
        }

        if (district && district.kod) {
          return city.kod.padStart(2, "0") + district.kod.padStart(2, "0");
        }
      }
    } catch (err) {
      console.warn("⚠️ [resolveDistrictCode] TatvariinAlba lookup failed:", err.message);
    }
  }

  // Strategy 5: Fallback to just the city part if horoo is missing but city is known
  if (cityName) {
    for (const [name, code] of Object.entries(DISTRICT_MAP)) {
      if (cityName.includes(name)) return code + "01";
    }
  }

  // Strategy 6: Clean and pad raw numeric value
  const rawValue = tokhirgoo.EbarimtDistrictCode || tokhirgoo.districtCode || "";
  const cleaned = String(rawValue).replace(/[^0-9]/g, "");
  if (cleaned && cleaned.length > 0) {
    return cleaned.padStart(4, "0").substring(0, 4);
  }

  return "0001"; // Ultimate fallback
}

module.exports = {
  parseDistrictCode,
  resolveDistrictCode,
  DISTRICT_MAP
};
