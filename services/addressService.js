const walletApiService = require("./walletApiService");
const { db } = require("zevbackv2");
const Baiguullaga = require("../models/baiguullaga");

/**
 * Unified Address Service
 * Fetches addresses from both Wallet API and own organization database
 * Returns combined results with source indicators
 */

// Source constants
const SOURCE_WALLET_API = "WALLET_API";
const SOURCE_OWN_ORG = "OWN_ORG";

// District abbreviation to full name mapping (for matching Wallet API abbreviations with OWN_ORG full names)
const DISTRICT_ABBREVIATION_MAP = {
  "СБД": "Сүхбаатар",
  "ХУД": "Хан-Уул",
  "БГД": "Баянгол",
  "СХД": "Сонгинохайрхан",
  "БД": "Баянзүрх",
  "ЧД": "Чингэлтэй",
  "ХД": "Хөшиг",
  "НД": "Налайх",
  "БД": "Багахангай",
  "БД": "Баганор",
  "БД": "Баганор",
  // Add more mappings as needed
};

/**
 * Extract district abbreviation from bair name (e.g., "СБД 1-р хороо 905-р байр" -> "СБД")
 * @param {string} bairName - Bair name from Wallet API
 * @returns {string|null} District abbreviation or null
 */
function extractDistrictAbbreviation(bairName) {
  if (!bairName || typeof bairName !== "string") {
    return null;
  }
  
  // Match 2-4 letter Cyrillic abbreviation at the start (e.g., "СБД", "ХУД", "БГД")
  const match = bairName.match(/^([А-ЯЁ]{2,4})\s/);
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * Convert district abbreviation to full name using mapping
 * @param {string} abbreviation - District abbreviation (e.g., "СБД")
 * @returns {string|null} Full district name (e.g., "Сүхбаатар") or null if not found
 */
function getDistrictNameFromAbbreviation(abbreviation) {
  if (!abbreviation) {
    return null;
  }
  
  return DISTRICT_ABBREVIATION_MAP[abbreviation] || null;
}

/**
 * Get cities from both sources
 * @returns {Promise<Array>} Combined cities with source indicators
 */
async function getCities() {
  try {
    const walletCities = await walletApiService.getAddressCities();
    
    if (Array.isArray(walletCities) && walletCities.length > 0) {
      const cities = walletCities.map(city => ({
        // Preserve original Wallet API format
        id: city.id || city.cityId,
        name: city.name || city.cityName,
        // Also provide standardized fields for compatibility
        cityId: city.cityId || city.id,
        cityName: city.cityName || city.name,
        cityCode: city.cityCode || city.code || "",
        // Add source indicator
        source: SOURCE_WALLET_API
      }));
      
      return {
        data: cities,
        sources: {
          walletApi: cities.length,
          ownOrg: 0,
          total: cities.length
        }
      };
    } else {
      return {
        data: [],
        sources: {
          walletApi: 0,
          ownOrg: 0,
          total: 0
        }
      };
    }
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error fetching cities from Wallet API:", error.message);
    return {
      data: [],
      sources: {
        walletApi: 0,
        ownOrg: 0,
        total: 0
      }
    };
  }
}

/**
 * Get districts from both sources
 * @param {string} cityId - City ID
 * @returns {Promise<Array>} Combined districts with source indicators
 */
async function getDistricts(cityId) {
  try {
    const walletDistricts = await walletApiService.getAddressDistricts(cityId);
    
    if (Array.isArray(walletDistricts) && walletDistricts.length > 0) {
      const districts = walletDistricts.map(district => ({
        // Preserve original Wallet API format
        id: district.id || district.districtId,
        name: district.name || district.districtName,
        // Also provide standardized fields
        districtId: district.districtId || district.id,
        districtName: district.districtName || district.name,
        districtCode: district.districtCode || district.code || "",
        // Add source indicator
        source: SOURCE_WALLET_API
      }));
      
      return {
        data: districts,
        sources: {
          walletApi: districts.length,
          ownOrg: 0,
          total: districts.length
        }
      };
    } else {
      return {
        data: [],
        sources: {
          walletApi: 0,
          ownOrg: 0,
          total: 0
        }
      };
    }
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error fetching districts from Wallet API:", error.message);
    return {
      data: [],
      sources: {
        walletApi: 0,
        ownOrg: 0,
        total: 0
      }
    };
  }
}

/**
 * Get khoroos from both sources
 * @param {string} districtId - District ID
 * @returns {Promise<Array>} Combined khoroos with source indicators
 */
async function getKhoroo(districtId) {
  try {
    const walletKhoroo = await walletApiService.getAddressKhoroo(districtId);
    
    if (Array.isArray(walletKhoroo) && walletKhoroo.length > 0) {
      const khoroos = walletKhoroo.map(khoroo => ({
        // Preserve original Wallet API format
        id: khoroo.id || khoroo.khorooId,
        name: khoroo.name || khoroo.khorooName,
        // Also provide standardized fields
        khorooId: khoroo.khorooId || khoroo.id,
        khorooName: khoroo.khorooName || khoroo.name,
        khorooCode: khoroo.khorooCode || khoroo.code || "",
        // Add source indicator
        source: SOURCE_WALLET_API
      }));
      
      return {
        data: khoroos,
        sources: {
          walletApi: khoroos.length,
          ownOrg: 0,
          total: khoroos.length
        }
      };
    } else {
      return {
        data: [],
        sources: {
          walletApi: 0,
          ownOrg: 0,
          total: 0
        }
      };
    }
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error fetching khoroos from Wallet API:", error.message);
    return {
      data: [],
      sources: {
        walletApi: 0,
        ownOrg: 0,
        total: 0
      }
    };
  }
}

/**
 * Get bair (buildings) from both sources
 * @param {string} khorooId - Khoroo ID
 * @returns {Promise<Array>} Combined bair with source indicators
 */
async function getBair(khorooId) {
  const results = {
    walletApi: [],
    ownOrg: [],
    combined: []
  };

  let khorooName = null; // Store khoroo name for matching OWN_ORG bair
  let districtName = null; // Store district name for matching OWN_ORG bair
  let districtId = null; // Store district ID to find district name

  // Fetch from Wallet API
  try {
    const walletBair = await walletApiService.getAddressBair(khorooId);
    
    if (Array.isArray(walletBair) && walletBair.length > 0) {
      results.walletApi = walletBair.map(bair => ({
        // Preserve original Wallet API format
        id: bair.id || bair.bairId,
        name: bair.name || bair.bairName,
        // Also provide standardized fields
        bairId: bair.bairId || bair.id,
        bairName: bair.bairName || bair.name,
        bairAddress: bair.bairAddress || bair.address || "",
        // Add source indicator
        source: SOURCE_WALLET_API
      }));
    }
    
    // Extract khoroo name and find district from Wallet API for matching OWN_ORG bair
    if (!khorooId.startsWith("own_") && walletBair && walletBair.length > 0) {
      try {
        const firstBairName = walletBair[0].bairName || walletBair[0].name || "";
        
        if (firstBairName) {
          // Extract khoroo number from bair name like "ХУД 15-р хороо 1-р байр" -> "15-р хороо"
          const khorooMatch = firstBairName.match(/(\d+-р хороо)/);
          if (khorooMatch) {
            khorooName = khorooMatch[1]; // e.g., "15-р хороо"
          }
          
          // Try to extract district abbreviation from bair name (e.g., "СБД" from "СБД 1-р хороо 905-р байр")
          const districtAbbreviation = extractDistrictAbbreviation(firstBairName);
          if (districtAbbreviation) {
            const districtNameFromAbbr = getDistrictNameFromAbbreviation(districtAbbreviation);
            if (districtNameFromAbbr) {
              districtName = districtNameFromAbbr;
            }
          }
          
          // If we still don't have district name, try to find it from Wallet API
          if (!districtName) {
            // Find which district this khoroo belongs to by checking all districts
            // This is needed to match OWN_ORG bair by both district and khoroo
            try {
              const cities = await walletApiService.getAddressCities();
              if (cities && cities.length > 0) {
                // Try to find district by checking khoroos in each district
                // Check all cities, not just the first one
                for (const city of cities) {
                  try {
                    const cityId = city.id || city.cityId;
                    const districts = await walletApiService.getAddressDistricts(cityId);
                    
                    // Check each district's khoroos to find which one contains our khorooId
                    for (const district of districts) {
                      try {
                        const districtIdToCheck = district.id || district.districtId;
                        const khoroos = await walletApiService.getAddressKhoroo(districtIdToCheck);
                        
                        // Check if any khoroo matches our khorooId
                        const matchingKhoroo = khoroos.find(k => 
                          (k.id || k.khorooId) === khorooId
                        );
                        
                        if (matchingKhoroo) {
                          districtName = (district.name || district.districtName || "").trim();
                          // Also extract khoroo name from the matching khoroo if not already extracted
                          if (!khorooName && (matchingKhoroo.name || matchingKhoroo.khorooName)) {
                            khorooName = (matchingKhoroo.name || matchingKhoroo.khorooName || "").trim();
                          }
                          break; // Found it, stop searching
                        }
                      } catch (error) {
                        // Continue to next district if this one fails
                        continue;
                      }
                    }
                    
                    if (districtName) {
                      break; // Found district, stop searching cities
                    }
                  } catch (error) {
                    // Continue to next city if this one fails
                    continue;
                  }
                }
              }
            } catch (error) {
              console.error("❌ [ADDRESS SERVICE] Error finding district:", error.message);
              // Continue without district name - will match by khoroo only
            }
          }
        }
      } catch (error) {
        console.error("❌ [ADDRESS SERVICE] Error extracting khoroo/district name:", error.message);
      }
    }
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error fetching bair from Wallet API:", error.message);
  }

  // Fetch from own organization
  try {
    // Pass khorooId, khorooName, and districtName for matching
    const ownOrgBair = await getOwnOrgBair(khorooId, khorooName, districtName);
    
    if (Array.isArray(ownOrgBair) && ownOrgBair.length > 0) {
      // Format to match Wallet API structure (id, name) and use barilgiinId as id
      results.ownOrg = ownOrgBair.map(bair => ({
        id: bair.barilgiinId || bair.bairId, // Use barilgiinId as id
        name: bair.bairName,
        // Include baiguullaga and barilga IDs for OWN_ORG bair
        baiguullagiinId: bair.baiguullagiinId || "",
        barilgiinId: bair.barilgiinId || "",
        bairName: bair.bairName,
        bairAddress: bair.bairAddress || "",
        source: SOURCE_OWN_ORG
      }));
    }
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error fetching bair from own organization:", error.message);
  }

  // Combine results
  results.combined = [...results.walletApi, ...results.ownOrg];

  return {
    data: results.combined,
    sources: {
      walletApi: results.walletApi.length,
      ownOrg: results.ownOrg.length,
      total: results.combined.length
    }
  };
}

// ============================================
// OWN ORGANIZATION ADDRESS FUNCTIONS
// ============================================
// These functions fetch addresses from your own database
// Customize these based on your database structure

/**
 * Get cities from own organization database
 * @returns {Promise<Array>} Array of cities
 */
async function getOwnOrgCities() {
  try {
    const kholboltuud = db.kholboltuud || [];
    const uniqueCities = new Set();
    const cities = [];

    for (const kholbolt of kholboltuud) {
      try {
        // Select both EbarimtDuuregNer and duuregNer to determine city/district
        const baiguullaguud = await Baiguullaga(kholbolt).find({}).select("barilguud.tokhirgoo.EbarimtDuuregNer barilguud.tokhirgoo.duuregNer barilguud.tokhirgoo.EbarimtDistrictCode").lean();
        
        for (const baiguullaga of baiguullaguud) {
          if (baiguullaga.barilguud && Array.isArray(baiguullaga.barilguud)) {
            for (const barilga of baiguullaga.barilguud) {
              if (barilga.tokhirgoo) {
                // Use EbarimtDuuregNer as primary city/district identifier
                // If not available, use duuregNer as fallback
                // Both represent districts, but we'll use them as city identifiers for now
                const cityName = barilga.tokhirgoo.EbarimtDuuregNer || barilga.tokhirgoo.duuregNer;
                
                if (cityName && !uniqueCities.has(cityName)) {
                  uniqueCities.add(cityName);
                  cities.push({
                    cityId: `own_${cityName.replace(/\s+/g, '_').toLowerCase()}`,
                    cityName: cityName,
                    cityCode: barilga.tokhirgoo.EbarimtDistrictCode || ""
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ [ADDRESS SERVICE] Error fetching from kholbolt ${kholbolt}:`, error.message);
      }
    }

    return cities;
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error getting cities from own organization:", error.message);
    return [];
  }
}

/**
 * Get districts from own organization database
 * @param {string} cityId - City ID
 * @returns {Promise<Array>} Array of districts
 */
async function getOwnOrgDistricts(cityId) {
  try {
    const kholboltuud = db.kholboltuud || [];
    const uniqueDistricts = new Set();
    const districts = [];

    // If cityId starts with "own_", it's from our own org
    const cityName = cityId.startsWith("own_") 
      ? cityId.replace("own_", "").replace(/_/g, " ")
      : null;

    if (!cityName) {
      return [];
    }

    for (const kholbolt of kholboltuud) {
      try {
        const baiguullaguud = await Baiguullaga(kholbolt).find({}).select("barilguud.tokhirgoo").lean();
        
        for (const baiguullaga of baiguullaguud) {
          if (baiguullaga.barilguud && Array.isArray(baiguullaga.barilguud)) {
            for (const barilga of baiguullaga.barilguud) {
              if (barilga.tokhirgoo) {
                // Match by EbarimtDuuregNer or duuregNer (both can be city/district names)
                const barilgaCity = barilga.tokhirgoo.EbarimtDuuregNer || barilga.tokhirgoo.duuregNer;
                
                if (barilgaCity === cityName && barilga.tokhirgoo.duuregNer) {
                  // Use duuregNer as district name
                  const districtName = barilga.tokhirgoo.duuregNer;
                  // Extract district code from districtCode if it's a combined string
                  // districtCode might be like "Сүхбаатар1-р хороо", extract just the district part
                  let districtCode = barilga.tokhirgoo.districtCode || "";
                  
                  // If districtCode contains the district name, use it as is
                  // Otherwise, use duuregNer as code
                  if (!districtCode || districtCode === districtName) {
                    districtCode = districtName;
                  }
                  
                  const districtKey = `${districtCode}_${districtName}`;
                  if (!uniqueDistricts.has(districtKey)) {
                    uniqueDistricts.add(districtKey);
                    districts.push({
                      districtId: `own_${districtCode.replace(/\s+/g, '_').toLowerCase()}`,
                      districtName: districtName,
                      districtCode: districtCode
                    });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ [ADDRESS SERVICE] Error fetching from kholbolt ${kholbolt}:`, error.message);
      }
    }

    return districts;
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error getting districts from own organization:", error.message);
    return [];
  }
}

/**
 * Get khoroos from own organization database
 * @param {string} districtId - District ID
 * @returns {Promise<Array>} Array of khoroos
 */
async function getOwnOrgKhoroo(districtId) {
  try {
    const kholboltuud = db.kholboltuud || [];
    const uniqueKhoroos = new Set();
    const khoroos = [];

    // If districtId starts with "own_", it's from our own org
    const districtCode = districtId.startsWith("own_") 
      ? districtId.replace("own_", "").replace(/_/g, " ")
      : null;

    if (!districtCode) {
      return [];
    }

    for (const kholbolt of kholboltuud) {
      try {
        const baiguullaguud = await Baiguullaga(kholbolt).find({}).select("barilguud.tokhirgoo").lean();
        
        for (const baiguullaga of baiguullaguud) {
          if (baiguullaga.barilguud && Array.isArray(baiguullaga.barilguud)) {
            for (const barilga of baiguullaga.barilguud) {
              if (barilga.tokhirgoo && 
                  barilga.tokhirgoo.duuregNer &&
                  (barilga.tokhirgoo.duuregNer === districtCode || 
                   barilga.tokhirgoo.districtCode === districtCode) &&
                  barilga.tokhirgoo.horoo &&
                  barilga.tokhirgoo.horoo.kod) {
                const khorooKey = `${barilga.tokhirgoo.horoo.kod}_${barilga.tokhirgoo.horoo.ner}`;
                if (!uniqueKhoroos.has(khorooKey)) {
                  uniqueKhoroos.add(khorooKey);
                  khoroos.push({
                    khorooId: `own_${barilga.tokhirgoo.horoo.kod.replace(/\s+/g, '_').toLowerCase()}`,
                    khorooName: barilga.tokhirgoo.horoo.ner || "",
                    khorooCode: barilga.tokhirgoo.horoo.kod || ""
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ [ADDRESS SERVICE] Error fetching from kholbolt ${kholbolt}:`, error.message);
      }
    }

    return khoroos;
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error getting khoroos from own organization:", error.message);
    return [];
  }
}

/**
 * Get bair (buildings) from own organization database
 * @param {string} khorooId - Khoroo ID (can be Wallet API UUID or own_ prefixed)
 * @param {string} khorooName - Optional khoroo name extracted from Wallet API (e.g., "15-р хороо")
 * @param {string} districtName - Optional district name for matching (e.g., "Сүхбаатар")
 * @returns {Promise<Array>} Array of bair
 */
async function getOwnOrgBair(khorooId, khorooName = null, districtName = null) {
  try {
    const kholboltuud = db.kholboltuud || [];
    const uniqueBair = new Set();
    const bair = [];

    let khorooCode = null;
    let khorooNer = null;

    // If khorooId starts with "own_", it's from our own org
    if (khorooId.startsWith("own_")) {
      khorooCode = khorooId.replace("own_", "").replace(/_/g, " ");
    } else if (khorooName) {
      // If khorooName is provided (extracted from Wallet API), use it for matching
      khorooNer = khorooName; // e.g., "15-р хороо"
      khorooCode = khorooName; // Also try matching by code
    } else {
      // If khorooName is not provided, try to get it from Wallet API
      try {
        // Try to find khoroo by searching through districts
        const cities = await walletApiService.getAddressCities();
        if (cities && cities.length > 0) {
          for (const city of cities) {
            try {
              const cityId = city.id || city.cityId;
              const districts = await walletApiService.getAddressDistricts(cityId);
              
              for (const district of districts) {
                try {
                  const districtIdToCheck = district.id || district.districtId;
                  const khoroos = await walletApiService.getAddressKhoroo(districtIdToCheck);
                  
                  const matchingKhoroo = khoroos.find(k => 
                    (k.id || k.khorooId) === khorooId
                  );
                  
                  if (matchingKhoroo) {
                    khorooName = (matchingKhoroo.name || matchingKhoroo.khorooName || "").trim();
                    if (khorooName) {
                      khorooNer = khorooName;
                      khorooCode = khorooName;
                      break;
                    }
                  }
                } catch (error) {
                  continue;
                }
              }
              
              if (khorooName) break;
            } catch (error) {
              continue;
            }
          }
        }
      } catch (error) {
        console.error("❌ [ADDRESS SERVICE] Error fetching khoroo from Wallet API:", error.message);
      }
    }

    for (const kholbolt of kholboltuud) {
      try {
        // Select baiguullaga._id and barilga._id to include in response
        const baiguullaguud = await Baiguullaga(kholbolt).find({}).select("_id barilguud.ner barilguud.khayag barilguud.tokhirgoo barilguud._id").lean();
        
        for (const baiguullaga of baiguullaguud) {
          if (baiguullaga.barilguud && Array.isArray(baiguullaga.barilguud)) {
            for (const barilga of baiguullaga.barilguud) {
              if (barilga.tokhirgoo && barilga.tokhirgoo.horoo && barilga.ner) {
                const barilgaKhorooKod = barilga.tokhirgoo.horoo.kod;
                const barilgaKhorooNer = barilga.tokhirgoo.horoo.ner;
                const barilgaDuuregNer = barilga.tokhirgoo.duuregNer;
                
                // Match by khoroo code or name
                // If khorooCode/khorooNer is not available, khorooMatches will be true (show all)
                // Normalize strings for comparison (trim and handle variations)
                const normalizeKhoroo = (str) => (str || "").trim().toLowerCase();
                const barilgaKhorooKodNorm = normalizeKhoroo(barilgaKhorooKod);
                const barilgaKhorooNerNorm = normalizeKhoroo(barilgaKhorooNer);
                const khorooCodeNorm = khorooCode ? normalizeKhoroo(khorooCode) : null;
                const khorooNerNorm = khorooNer ? normalizeKhoroo(khorooNer) : null;
                
                const khorooMatches = 
                  !khorooCode && !khorooNer ? true : // No khoroo filter, match all
                  (khorooCodeNorm && (barilgaKhorooKodNorm === khorooCodeNorm || barilgaKhorooNerNorm === khorooCodeNorm)) ||
                  (khorooNerNorm && (barilgaKhorooNerNorm === khorooNerNorm || barilgaKhorooKodNorm === khorooNerNorm));
                
                // If districtName is provided, also match by district (duuregNer)
                // Use case-insensitive and trimmed comparison
                // But if district doesn't match, still show the building if khoroo matches (more flexible)
                let districtMatches = true;
                let districtMismatch = false;
                if (districtName) {
                  const walletDistrict = districtName.trim();
                  const ownOrgDistrict = (barilgaDuuregNer || "").trim();
                  
                  // Try exact match first
                  districtMatches = walletDistrict.toLowerCase() === ownOrgDistrict.toLowerCase();
                  
                  // If exact match fails, try partial match (district name contains or is contained)
                  if (!districtMatches) {
                    const walletLower = walletDistrict.toLowerCase();
                    const ownOrgLower = ownOrgDistrict.toLowerCase();
                    districtMatches = walletLower.includes(ownOrgLower) || ownOrgLower.includes(walletLower);
                    if (!districtMatches) {
                      districtMismatch = true;
                    }
                  }
                  
                  if (districtMismatch && khorooMatches) {
                    // Show building even if district doesn't match if khoroo matches
                    districtMatches = true;
                  }
                }
                
                // Show building if:
                // 1. Khoroo matches (or no khoroo filter), AND
                // 2. District matches (or no district filter, or khoroo matches)
                if (khorooMatches && districtMatches) {
                  const bairKey = `${barilga.ner}_${barilga._id}`;
                  if (!uniqueBair.has(bairKey)) {
                    uniqueBair.add(bairKey);
                    bair.push({
                      bairId: `own_${barilga._id.toString()}`,
                      bairName: barilga.ner || "",
                      bairAddress: barilga.khayag || "",
                      // Include baiguullaga and barilga IDs for OWN_ORG bair
                      baiguullagiinId: baiguullaga._id.toString(),
                      barilgiinId: barilga._id.toString(),
                      sohNer: barilga.tokhirgoo.sohNer || "",
                      duuregNer: barilga.tokhirgoo.duuregNer || "",
                      districtCode: barilga.tokhirgoo.districtCode || "",
                      khorooNer: barilga.tokhirgoo.horoo?.ner || "",
                      khorooKod: barilga.tokhirgoo.horoo?.kod || ""
                    });
                  }
                } else if (khorooMatches && !districtMatches) {
                  // Already logged above
                } else if (!khorooMatches) {
                  // Khoroo doesn't match, skip silently
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ [ADDRESS SERVICE] Error fetching from kholbolt ${kholbolt}:`, error.message);
      }
    }

    return bair;
  } catch (error) {
    console.error("❌ [ADDRESS SERVICE] Error getting bair from own organization:", error.message);
    return [];
  }
}

module.exports = {
  getCities,
  getDistricts,
  getKhoroo,
  getBair,
  SOURCE_WALLET_API,
  SOURCE_OWN_ORG
};

