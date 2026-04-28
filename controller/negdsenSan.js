const asyncHandler = require("express-async-handler");
const { db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");
const aldaa = require("../components/aldaa");

// Hardcoded centralized organization ID
const CENTRALIZED_ORG_ID = "698e7fd3b6dd386b6c56a808";

/**
 * Parse Wallet API address name to extract district, khoroo, and bair info
 * Example: "БЗД 37-р хороо 80-р байр" -> { district: "БЗД", khoroo: "37-р хороо", bairNumber: "80-р байр" }
 * @param {string} addressName - Address name from Wallet API
 * @returns {Object} Parsed address components
 */
function parseWalletAddress(addressName) {
  if (!addressName || typeof addressName !== "string") {
    return null;
  }

  // Pattern: "БЗД 37-р хороо 80-р байр"
  // Extract district abbreviation (2-4 Cyrillic letters at start)
  const districtMatch = addressName.match(/^([А-ЯЁ]{2,4})\s/);
  const district = districtMatch ? districtMatch[1] : null;

  // Extract khoroo (e.g., "37-р хороо")
  const khorooMatch = addressName.match(/(\d+-р хороо)/);
  const khoroo = khorooMatch ? khorooMatch[1] : null;
  const khorooNumber = khorooMatch ? khorooMatch[1].replace(/-р хороо/, "") : null;

  // Extract bair number (e.g., "80-р байр")
  const bairMatch = addressName.match(/(\d+-р байр)/);
  const bairNumber = bairMatch ? bairMatch[1] : null;

  return {
    district,
    khoroo,
    khorooNumber,
    bairNumber,
    fullName: addressName,
  };
}

/**
 * Map district abbreviation to full district name
 * @param {string} abbreviation - District abbreviation (e.g., "БЗД")
 * @returns {string} Full district name (e.g., "Баянзүрх")
 */
function getDistrictNameFromAbbreviation(abbreviation) {
  const DISTRICT_MAP = {
    СБД: "Сүхбаатар",
    ХУД: "Хан-Уул",
    БГД: "Баянгол",
    СХД: "Сонгинохайрхан",
    БЗД: "Баянзүрх",
    ЧД: "Чингэлтэй",
    ХД: "Хөшиг",
    НД: "Налайх",
    БГН: "Багахангай",
    БГНР: "Баганор",
  };

  return DISTRICT_MAP[abbreviation] || abbreviation;
}

/**
 * Find or create barilga in centralized organization based on Wallet API address
 * @param {string} walletBairId - Wallet API bair ID
 * @param {string} walletBairName - Wallet API bair name (e.g., "БЗД 37-р хороо 80-р байр")
 * @returns {Promise<Object>} { barilgiinId, isNew, barilga }
 */
async function findOrCreateBarilgaFromWallet(walletBairId, walletBairName) {
  try {
    // Get centralized organization
    const centralizedOrg = await Baiguullaga(db.erunkhiiKholbolt).findById(
      CENTRALIZED_ORG_ID
    );

    if (!centralizedOrg) {
      throw new aldaa(
        `Төвлөрсөн байгууллага олдсонгүй (ID: ${CENTRALIZED_ORG_ID})`
      );
    }

    // Parse address name
    const parsedAddress = parseWalletAddress(walletBairName);
    if (!parsedAddress) {
      throw new aldaa(`Хаягийн мэдээлэл буруу байна: ${walletBairName}`);
    }

    // Check if barilga with this name already exists
    const existingBarilga = centralizedOrg.barilguud?.find(
      (b) => b.ner === walletBairName
    );

    if (existingBarilga) {
      return {
        barilgiinId: existingBarilga._id.toString(),
        isNew: false,
        barilga: existingBarilga,
        parsedAddress,
      };
    }

    // Create new barilga
    const districtName = getDistrictNameFromAbbreviation(
      parsedAddress.district
    );

    // Get default tokhirgoo from organization or create minimal one
    const defaultTokhirgoo = centralizedOrg.tokhirgoo
      ? JSON.parse(JSON.stringify(centralizedOrg.tokhirgoo))
      : {};

    // Create new barilga object
    const newBarilga = {
      ner: walletBairName,
      khayag: `${parsedAddress.district}, ${parsedAddress.khoroo}, ${parsedAddress.bairNumber}`,
      register: centralizedOrg.register || "",
      niitTalbai: 0,
      bairshil: {
        type: "Point",
        coordinates: [],
      },
      tokhirgoo: {
        ...defaultTokhirgoo,
        // Override with parsed address info
        duuregNer: districtName,
        districtCode: parsedAddress.district,
        horoo: {
          ner: parsedAddress.khoroo || "",
          kod: parsedAddress.khorooNumber || "",
        },
        sohNer: parsedAddress.bairNumber || "",
        davkhar: [],
        ashiglaltiinZardluud: defaultTokhirgoo.ashiglaltiinZardluud || [],
        liftShalgaya: defaultTokhirgoo.liftShalgaya || {
          choloolugdokhDavkhar: [],
        },
      },
      davkharuud: [],
    };

    // Ensure required arrays exist
    if (!newBarilga.tokhirgoo.ashiglaltiinZardluud) {
      newBarilga.tokhirgoo.ashiglaltiinZardluud = [];
    }
    if (!newBarilga.tokhirgoo.liftShalgaya) {
      newBarilga.tokhirgoo.liftShalgaya = { choloolugdokhDavkhar: [] };
    }
    if (!newBarilga.tokhirgoo.davkhar) {
      newBarilga.tokhirgoo.davkhar = [];
    }

    // Add to barilguud array
    if (!centralizedOrg.barilguud) {
      centralizedOrg.barilguud = [];
    }

    centralizedOrg.barilguud.push(newBarilga);
    await centralizedOrg.save();

    // Get the newly created barilga ID
    const savedBarilga =
      centralizedOrg.barilguud[centralizedOrg.barilguud.length - 1];
    const newBarilgiinId = savedBarilga._id.toString();

    return {
      barilgiinId: newBarilgiinId,
      isNew: true,
      barilga: savedBarilga,
      parsedAddress,
    };
  } catch (error) {
    console.error(
      "[CENTRALIZED_ORG] Error finding/creating barilga:",
      error.message
    );
    throw error;
  }
}

/**
 * Get barilga info from centralized organization
 * @param {string} barilgiinId - Barilga ID
 * @returns {Promise<Object>} Barilga object
 */
async function getBarilgaFromCentralizedOrg(barilgiinId) {
  try {
    const centralizedOrg = await Baiguullaga(db.erunkhiiKholbolt).findById(
      CENTRALIZED_ORG_ID
    );

    if (!centralizedOrg) {
      throw new aldaa(
        `Төвлөрсөн байгууллага олдсонгүй (ID: ${CENTRALIZED_ORG_ID})`
      );
    }

    const barilga = centralizedOrg.barilguud?.find(
      (b) => b._id.toString() === barilgiinId
    );

    if (!barilga) {
      throw new aldaa(`Барилга олдсонгүй (ID: ${barilgiinId})`);
    }

    return barilga;
  } catch (error) {
    console.error(
      "[CENTRALIZED_ORG] Error getting barilga:",
      error.message
    );
    throw error;
  }
}

/**
 * Get centralized organization info
 * @returns {Promise<Object>} Centralized organization
 */
async function getCentralizedOrg() {
  try {
    const centralizedOrg = await Baiguullaga(db.erunkhiiKholbolt).findById(
      CENTRALIZED_ORG_ID
    );

    if (!centralizedOrg) {
      throw new aldaa(
        `Төвлөрсөн байгууллага олдсонгүй (ID: ${CENTRALIZED_ORG_ID})`
      );
    }

    return centralizedOrg;
  } catch (error) {
    console.error(
      "[CENTRALIZED_ORG] Error getting centralized org:",
      error.message
    );
    throw error;
  }
}

// Export utility functions for use in other controllers (internal use only)
module.exports.findOrCreateBarilgaFromWallet = findOrCreateBarilgaFromWallet;
module.exports.getBarilgaFromCentralizedOrg = getBarilgaFromCentralizedOrg;
module.exports.getCentralizedOrg = getCentralizedOrg;
module.exports.parseWalletAddress = parseWalletAddress;
module.exports.CENTRALIZED_ORG_ID = CENTRALIZED_ORG_ID;
