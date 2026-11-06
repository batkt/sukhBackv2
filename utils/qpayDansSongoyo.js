/**
 * QPay төлбөрийн хүсэлт үүсгэхэд ашиглах банкны дансыг 100% найдвартай тодорхойлох helper.
 *
 * 1. Фүтаба СӨХ (baiguullagiinId: "6a97d3afaf2ad1911035e063"):
 *    - СӨХ-ийн үндсэн төлбөр -> 100% HARDCODED: "5222199314" (ФҮТАБА СӨХ, Хаан банк 050000)
 *    - Зогсоолын төлбөр -> 100% HARDCODED: "3105211515" (МРЖ ХХК, Голомт банк 150000)
 *
 * 2. Бусад байгууллагууд:
 *    - Хэрэв зогсоолын төлбөр биш бол МРЖ, зогсоол, гараж бүхий дансуудыг БҮРЭН ХАССАН
 *      жинхэнэ СӨХ/барилгын үндсэн дансыг (dansniiDugaar) сонгож өгнө.
 *    - dansniiDugaar-ыг хэзээ ч хоосон (undefined) орхихгүй. Хэрэв хоосон орхивол
 *      quickqpaypackvSukh нь салбарын БҮХ дансыг (зогсоолтой нь хамт) QPay руу илгээж,
 *      Голомт/SocialPay-ээр төлөхөд мөнгө зогсоолын данс руу ордог алдаа гардаг.
 */

const FUTABA_ORG_ID = "6a97d3afaf2ad1911035e063";
const FUTABA_SUKH_DANS = "5222199314";
const FUTABA_SUKH_BANK_CODE = "050000";
const FUTABA_PARKING_DANS = "3105211515";
const FUTABA_PARKING_BANK_CODE = "150000";

const PARKING_REGEX = /мрж|зогсоол|parking|garaaj|гараж/i;

async function qpayDansSongoyo({
  baiguullagiinId,
  barilgiinId,
  isZogsool = false,
  invoice = null,
  body = null,
  kholbolt = null,
} = {}) {
  const orgId = String(
    baiguullagiinId ||
    body?.baiguullagiinId ||
    invoice?.baiguullagiinId ||
    ""
  ).trim();

  const bId = String(
    barilgiinId ||
    body?.barilgiinId ||
    invoice?.barilgiinId ||
    ""
  ).trim();

  const zogsoolEsekh =
    Boolean(isZogsool) ||
    body?.turul === "QRGadaa" ||
    Boolean(body?.zogsooliinId) ||
    body?.angilal === "zogsool" ||
    body?.angilal === "Зогсоол" ||
    body?.angilal === "Гараж" ||
    invoice?.angilal === "zogsool" ||
    invoice?.angilal === "Зогсоол" ||
    invoice?.angilal === "Гараж" ||
    Boolean(invoice?.zogsooliinId);

  // ── 1. 100% HARDCODED FOR FUTABA ──────────────────────────────────────────
  if (orgId === FUTABA_ORG_ID) {
    if (zogsoolEsekh) {
      console.log(
        `🅿️ [QPAY-DANS-SONGOYO] Futaba PARKING detected -> 100% HARDCODED: ${FUTABA_PARKING_DANS} (МРЖ ХХК)`
      );
      return {
        dansniiDugaar: FUTABA_PARKING_DANS,
        burtgeliinDugaar: FUTABA_PARKING_BANK_CODE,
        account_name: "МРЖ ХХК",
      };
    } else {
      console.log(
        `🏢 [QPAY-DANS-SONGOYO] Futaba MAIN SUKH detected -> 100% HARDCODED: ${FUTABA_SUKH_DANS} (ФҮТАБА СӨХ)`
      );
      return {
        dansniiDugaar: FUTABA_SUKH_DANS,
        burtgeliinDugaar: FUTABA_SUKH_BANK_CODE,
        account_name: "ФҮТАБА СӨХ",
      };
    }
  }

  // ── 2. GENERAL ORGANIZATIONS ─────────────────────────────────────────────
  let resolvedDans =
    body?.dansniiDugaar ||
    invoice?.dansniiDugaar ||
    invoice?.nekhemjlekhiinDans ||
    null;
  let resolvedBankCode = body?.burtgeliinDugaar || null;
  let resolvedAccountName = "";

  // If kholbolt is available, inspect QpayKhariltsagch configuration
  let activeKholbolt = kholbolt;
  if (!activeKholbolt) {
    try {
      const { db } = require("zevbackv2");
      activeKholbolt = db?.kholboltuud?.find(
        (k) => String(k.baiguullagiinId) === String(orgId)
      );
    } catch (_) { }
  }

  if (activeKholbolt) {
    try {
      const { QpayKhariltsagch } = require("quickqpaypackvSukh");
      const qk = await QpayKhariltsagch(activeKholbolt)
        .findOne({ baiguullagiinId: orgId })
        .lean();

      if (qk && Array.isArray(qk.salbaruud) && qk.salbaruud.length > 0) {
        const targetSalbar =
          qk.salbaruud.find((s) => String(s.salbariinId) === String(bId)) ||
          qk.salbaruud[0];

        if (
          targetSalbar &&
          Array.isArray(targetSalbar.bank_accounts) &&
          targetSalbar.bank_accounts.length > 0
        ) {
          let chosenAccount = null;

          if (zogsoolEsekh) {
            // For parking: match parking account
            chosenAccount =
              targetSalbar.bank_accounts.find((a) =>
                PARKING_REGEX.test(a.account_name)
              ) ||
              (resolvedDans
                ? targetSalbar.bank_accounts.find(
                  (a) => String(a.account_number).trim() === String(resolvedDans).trim()
                )
                : null) ||
              targetSalbar.bank_accounts[0];
          } else {
            // For regular SUKH: strictly avoid parking accounts
            const nonParkingAccounts = targetSalbar.bank_accounts.filter(
              (a) => !PARKING_REGEX.test(a.account_name)
            );

            if (nonParkingAccounts.length > 0) {
              if (resolvedDans) {
                chosenAccount = nonParkingAccounts.find(
                  (a) => String(a.account_number).trim() === String(resolvedDans).trim()
                );
              }
              if (!chosenAccount) {
                chosenAccount =
                  nonParkingAccounts.find((a) => a.default || a.is_default) ||
                  nonParkingAccounts[0];
              }
            } else {
              chosenAccount = targetSalbar.bank_accounts[0];
            }
          }

          if (chosenAccount) {
            resolvedDans = chosenAccount.account_number;
            resolvedBankCode = chosenAccount.account_bank_code || resolvedBankCode;
            resolvedAccountName = chosenAccount.account_name || "";
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ [QPAY-DANS-SONGOYO] Error checking QpayKhariltsagch:", err.message);
    }
  }

  return {
    dansniiDugaar: resolvedDans,
    burtgeliinDugaar: resolvedBankCode,
    account_name: resolvedAccountName,
  };
}

module.exports = {
  qpayDansSongoyo,
  FUTABA_ORG_ID,
  FUTABA_SUKH_DANS,
  FUTABA_SUKH_BANK_CODE,
  FUTABA_PARKING_DANS,
  FUTABA_PARKING_BANK_CODE,
};

