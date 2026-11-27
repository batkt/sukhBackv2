const { db } = require("zevbackv2");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const { getKholboltByBaiguullagiinId } = require("./dbConnection");

const CENTRALIZED_ORG_ID = "698e7fd3b6dd386b6c56a808";

/**
 * WALLET_API-аар (Амарсөх 698e7fd3b6dd386b6c56a808) нэвтэрсэн оршин суугчийн
 * `walletBairId`-аар Төрийн банк (BPay) горимтой СӨХ болон барилгыг олно.
 */
async function resolveBpaySukhContext({
  residentId,
  baiguullagiinId,
  barilgiinId,
  tukhainBaaziinKholbolt,
}) {
  const orgIdStr = String(baiguullagiinId || "");
  if (orgIdStr && orgIdStr !== CENTRALIZED_ORG_ID) {
    return { baiguullagiinId, barilgiinId, tukhainBaaziinKholbolt };
  }
  if (!residentId) {
    return { baiguullagiinId, barilgiinId, tukhainBaaziinKholbolt };
  }

  try {
    const resObj = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(residentId)
      .select("toots walletBairId baiguullagiinId barilgiinId")
      .lean();

    const toots = Array.isArray(resObj?.toots) ? resObj.toots : [];
    const matchingToot = barilgiinId
      ? toots.find((t) => String(t?.barilgiinId || "") === String(barilgiinId))
      : null;

    const walletBairIds = Array.from(
      new Set(
        [
          matchingToot?.walletBairId,
          ...toots.map((t) => t?.walletBairId),
          resObj?.walletBairId,
        ]
          .filter(Boolean)
          .map(String),
      ),
    );

    if (walletBairIds.length === 0) {
      return { baiguullagiinId, barilgiinId, tukhainBaaziinKholbolt };
    }

    const bpayOrg = await Baiguullaga(db.erunkhiiKholbolt)
      .findOne({
        "tokhirgoo.bpayAshiglakhEsekh": true,
        "barilguud.tokhirgoo.bpayBairId": { $in: walletBairIds },
      })
      .lean();

    if (!bpayOrg) {
      return { baiguullagiinId, barilgiinId, tukhainBaaziinKholbolt };
    }

    const matchedBarilga = (bpayOrg.barilguud || []).find((b) =>
      walletBairIds.includes(String(b?.tokhirgoo?.bpayBairId || "")),
    );
    const resolvedOrgId = String(bpayOrg._id);
    const resolvedBarilgaId = matchedBarilga
      ? String(matchedBarilga._id)
      : barilgiinId;
    const resolvedKholbolt =
      getKholboltByBaiguullagiinId(resolvedOrgId) || tukhainBaaziinKholbolt;

    return {
      baiguullagiinId: resolvedOrgId,
      barilgiinId: resolvedBarilgaId,
      baiguullagiinNer: bpayOrg.ner || "",
      tukhainBaaziinKholbolt: resolvedKholbolt,
    };
  } catch (err) {
    console.warn("⚠️ [BPAY-CTX] resolveBpaySukhContext error:", err.message);
    return { baiguullagiinId, barilgiinId, tukhainBaaziinKholbolt };
  }
}

module.exports = { CENTRALIZED_ORG_ID, resolveBpaySukhContext };
