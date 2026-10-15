/**
 * Helper to resolve E-Barimt configuration for parking (Zogsool).
 * Supports dedicated merchant credentials (merchantTin, districtCode, nuatTulukhEsekh, ebarimtShineUrl)
 * defined in Parking.tokhirgoo, with seamless fallback to the building's main E-Barimt settings.
 */
const { resolveDistrictCode } = require("./districtMapping");

async function resolveParkingEbarimtConfig({
  parkingDoc = null,
  tuxainSalbar = null,
  kholbolt = null,
  baiguullagiinId = null,
  barilgiinId = null,
  zogsooliinId = null,
}) {
  const { Parking } = require("sukhParking-v1");

  // 1. If parkingDoc not provided, look it up
  if (!parkingDoc && kholbolt && (zogsooliinId || (baiguullagiinId && barilgiinId))) {
    try {
      if (zogsooliinId) {
        parkingDoc = await Parking(kholbolt).findById(zogsooliinId).lean();
      }
      if (!parkingDoc && baiguullagiinId && barilgiinId) {
        parkingDoc = await Parking(kholbolt)
          .findOne({ baiguullagiinId: String(baiguullagiinId), barilgiinId: String(barilgiinId) })
          .lean();
      }
    } catch (err) {
      console.warn("⚠️ [resolveParkingEbarimtConfig] Parking lookup warning:", err.message);
    }
  }

  const pTok = parkingDoc?.tokhirgoo || {};

  // Check if dedicated parking ebarimt is enabled & configured
  const candidateTin = String(
    pTok.merchantTin ||
    pTok.ebarimtMerchantTin ||
    parkingDoc?.merchantTin ||
    ""
  ).trim();

  const isDedicatedEnabled =
    pTok.ebarimtAshiglakhEsekh !== false && candidateTin.length > 0;

  if (isDedicatedEnabled) {
    // Dedicated parking ebarimt configuration
    const rawDistrict =
      pTok.districtCode ||
      pTok.ebarimtDistrictCode ||
      parkingDoc?.districtCode ||
      tuxainSalbar?.districtCode ||
      tuxainSalbar?.EbarimtDistrictCode ||
      "0001";

    let districtCode = "0001";
    if (/^\d{4}$/.test(String(rawDistrict).trim())) {
      districtCode = String(rawDistrict).trim();
    } else {
      districtCode = await resolveDistrictCode(
        {
          EbarimtDistrictCode: rawDistrict,
          EbarimtDuuregNer: pTok.ebarimtDuuregNer || tuxainSalbar?.EbarimtDuuregNer,
          EbarimtDHoroo: pTok.ebarimtDHoroo || tuxainSalbar?.EbarimtDHoroo,
        },
        kholbolt
      );
    }

    const nuatTulukhEsekh =
      pTok.nuatTulukhEsekh !== undefined
        ? pTok.nuatTulukhEsekh !== false
        : pTok.ebarimtNuatTulukhEsekh !== undefined
        ? pTok.ebarimtNuatTulukhEsekh !== false
        : tuxainSalbar?.nuatTulukhEsekh !== false;

    const eBarimtShine =
      pTok.eBarimtShine !== undefined
        ? Boolean(pTok.eBarimtShine)
        : tuxainSalbar?.eBarimtShine !== undefined
        ? Boolean(tuxainSalbar.eBarimtShine)
        : true;

    const ebarimtShineUrl =
      pTok.ebarimtShineUrl || tuxainSalbar?.ebarimtShineUrl || null;

    console.log(
      `🅿️ [EBARIMT-ZOGSOOL] Using dedicated parking E-Barimt: merchantTin=${candidateTin}, districtCode=${districtCode}, nuat=${nuatTulukhEsekh}`
    );

    return {
      isDedicated: true,
      merchantTin: candidateTin,
      districtCode,
      nuatTulukhEsekh,
      eBarimtShine,
      ebarimtShineUrl,
      parkingDoc,
    };
  }

  // Fallback to building's main E-Barimt configuration
  let buildingDistrictCode = "0001";
  if (tuxainSalbar) {
    buildingDistrictCode = await resolveDistrictCode(tuxainSalbar, kholbolt);
  }

  const fallbackTin = String(tuxainSalbar?.merchantTin || "").trim();
  console.log(
    `ℹ️ [EBARIMT-ZOGSOOL] Using building fallback E-Barimt: merchantTin=${fallbackTin}, districtCode=${buildingDistrictCode}`
  );

  return {
    isDedicated: false,
    merchantTin: fallbackTin,
    districtCode: buildingDistrictCode,
    nuatTulukhEsekh: tuxainSalbar?.nuatTulukhEsekh !== false,
    eBarimtShine:
      tuxainSalbar?.eBarimtShine !== undefined
        ? Boolean(tuxainSalbar.eBarimtShine)
        : true,
    ebarimtShineUrl: tuxainSalbar?.ebarimtShineUrl || null,
    parkingDoc,
  };
}

module.exports = {
  resolveParkingEbarimtConfig,
};
