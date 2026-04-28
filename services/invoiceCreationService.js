const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const NekhemjlekhCron = require("../models/cronSchedule");
const OrshinSuugch = require("../models/orshinSuugch");
const MsgTuukh = require("../models/msgTuukh");
const Medegdel = require("../models/medegdel");
const request = require("request");
const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const {
  normalizeTurul,
  normalizeZardluudTurul,
  sumZardalDun,
} = require("../utils/zardalUtils");
const {
  getUbCalendarParts,
  getLiveBillingCycleBoundsUb,
  getCycleBoundsForTargetCalendarMonthUb,
  startOfUbWallClockDay,
  clampDayToMonth,
} = require("../utils/billingCycleUb");

async function getCronScheduleForGeree(kholbolt, tempData, org) {
  let cron = null;
  if (tempData.barilgiinId) {
    cron = await NekhemjlekhCron(kholbolt).findOne({
      baiguullagiinId: tempData.baiguullagiinId || org?._id?.toString(),
      barilgiinId: tempData.barilgiinId,
    });
  }
  if (!cron) {
    cron = await NekhemjlekhCron(kholbolt).findOne({
      baiguullagiinId: tempData.baiguullagiinId || org?._id?.toString(),
      barilgiinId: null,
    });
  }
  return cron;
}

/**
 * Invoices that already carry an "Эхний үлдэгдэл" line (must not add ekhnii again on a later invoice).
 * Note: nekhemjlekhiinTuukh.ekhniiUldegdel is *remaining* unpaid on that line after payments, so it can be 0
 * while the zardluud row still exists — count the row, not only ekhniiUldegdel > 0.
 */
async function countInvoicesWithEkhniiZardalRow(nekhemjlekhiinModel, gereeniiIdStr) {
  return nekhemjlekhiinModel.countDocuments({
    gereeniiId: gereeniiIdStr,
    $or: [
      { ekhniiUldegdel: { $exists: true, $gt: 0 } },
      { "medeelel.zardluud": { $elemMatch: { isEkhniiUldegdel: true } } },
      {
        "medeelel.zardluud": {
          $elemMatch: { ner: "Эхний үлдэгдэл" },
        },
      },
    ],
  });
}

const gereeNeesNekhemjlekhUusgekh = async (
  tempData,
  org,
  tukhainBaaziinKholbolt,
  uusgegsenEsekh = "garan",
  includeEkhniiUldegdel = false,
  ekhniiUldegdelId = null,
  billingReferenceDate = null,
) => {
  try {
    const usingHistoricalBilling =
      billingReferenceDate instanceof Date &&
      !Number.isNaN(billingReferenceDate.getTime());
    const currentDate = usingHistoricalBilling
      ? new Date(
          billingReferenceDate.getFullYear(),
          billingReferenceDate.getMonth(),
          billingReferenceDate.getDate(),
        )
      : new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-11 (0 = January)
    const ubNowParts = !usingHistoricalBilling
      ? getUbCalendarParts(new Date())
      : null;

    let cronSchedule = null;
    try {
      cronSchedule = await getCronScheduleForGeree(
        tukhainBaaziinKholbolt,
        tempData,
        org,
      );
    } catch (error) {
    }

    let shouldUseEkhniiUldegdel = false;
    let existingEkhniiUldegdelInvoices = null;

    if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
      try {
        const scheduledDay = cronSchedule.nekhemjlekhUusgekhOgnoo;

        const gereeCreatedDate =
          tempData.createdAt || tempData.gereeniiOgnoo || new Date();
        const currentMonthCronDate = usingHistoricalBilling
          ? new Date(
              currentYear,
              currentMonth,
              scheduledDay,
              0,
              0,
              0,
              0,
            )
          : startOfUbWallClockDay(
              ubNowParts.year,
              ubNowParts.month,
              clampDayToMonth(
                ubNowParts.year,
                ubNowParts.month,
                scheduledDay,
              ),
            );

        existingEkhniiUldegdelInvoices = await countInvoicesWithEkhniiZardalRow(
          nekhemjlekhiinTuukh(tukhainBaaziinKholbolt),
          tempData._id.toString(),
        );

        if (
          gereeCreatedDate < currentMonthCronDate &&
          tempData.ekhniiUldegdel &&
          tempData.ekhniiUldegdel > 0 &&
          existingEkhniiUldegdelInvoices === 0
        ) {
          shouldUseEkhniiUldegdel = true;
        }
      } catch (error) {
        // Error checking ekhniiUldegdel - silently continue
      }
    }

    // If contract has initial balance, include it on the FIRST invoice automatically
    // (unless caller explicitly disabled it) so first month totals are correct.
    // This also prevents the "Эхний үлдэгдэл row exists but niitTulburOriginal stays small" drift
    // when invoices are backfilled/created in a different month.
    try {
      if (existingEkhniiUldegdelInvoices == null) {
        existingEkhniiUldegdelInvoices = await countInvoicesWithEkhniiZardalRow(
          nekhemjlekhiinTuukh(tukhainBaaziinKholbolt),
          tempData._id.toString(),
        );
      }
      if (
        includeEkhniiUldegdel !== true &&
        tempData.ekhniiUldegdel &&
        tempData.ekhniiUldegdel > 0 &&
        existingEkhniiUldegdelInvoices === 0
      ) {
        includeEkhniiUldegdel = true;
      }
    } catch (_ekhniiCheckErr) {
      // silently continue
    }

    // One invoice per contract per billing cycle: look up first, reuse or update if found, create only when none exists.
    if (!shouldUseEkhniiUldegdel) {
      let monthStart;
      let nextCycleStart;

      if (usingHistoricalBilling) {
        const bounds = getCycleBoundsForTargetCalendarMonthUb(
          cronSchedule?.nekhemjlekhUusgekhOgnoo,
          currentYear,
          currentMonth,
        );
        monthStart = bounds.monthStart;
        nextCycleStart = bounds.nextCycleStart;
      } else {
        const bounds = getLiveBillingCycleBoundsUb(
          cronSchedule?.nekhemjlekhUusgekhOgnoo,
          new Date(),
        );
        monthStart = bounds.monthStart;
        nextCycleStart = bounds.nextCycleStart;
      }

      // Live billing: an invoice belongs to the current cycle iff monthStart <= ognoo < nextCycleStart
      // (same period the cron uses). Half-open [monthStart, nextCycleStart) matches exactly one cycle.
      // Live bounds use Asia/Ulaanbaatar calendar day so a new cycle starts on the configured day in Mongolia.

      let checkBarilgiinId = tempData.barilgiinId;
      if (!checkBarilgiinId && org?.barilguud && org.barilguud.length > 0) {
        checkBarilgiinId = String(org.barilguud[0]._id);
      }

      const existingInvoiceQuery = {
        gereeniiId: tempData._id.toString(),
        $or: [
          {
            ognoo: {
              $gte: monthStart,
              $lt: nextCycleStart,
            },
          },
          {
            $and: [
              { $or: [{ ognoo: { $exists: false } }, { ognoo: null }] },
              {
                createdAt: {
                  $gte: monthStart,
                  $lt: nextCycleStart,
                },
              },
            ],
          },
        ],
      };

      if (checkBarilgiinId) {
        existingInvoiceQuery.barilgiinId = checkBarilgiinId;
      }

      const existingInvoice = await nekhemjlekhiinTuukh(tukhainBaaziinKholbolt)
        .findOne(existingInvoiceQuery)
        .sort({ ognoo: -1, createdAt: -1 });

      if (existingInvoice) {
        // Check if we need to update electricity data from latest ZaaltUnshlalt
        try {
          const ZaaltUnshlalt = require("../models/zaaltUnshlalt");

          const latestReading = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
            .findOne({
              $or: [
                { gereeniiId: String(tempData._id) },
                { gereeniiDugaar: tempData.gereeniiDugaar },
              ],
            })
            .sort({ importOgnoo: -1, "zaaltCalculation.calculatedAt": -1 })
            .lean();

          if (latestReading) {
            // Find existing electricity entry in the invoice
            const existingElectricityIdx =
              existingInvoice.medeelel?.zardluud?.findIndex(
                (z) =>
                  z.zaalt === true &&
                  z.ner &&
                  z.ner.toLowerCase().includes("цахилгаан") &&
                  !z.ner.toLowerCase().includes("дундын") &&
                  !z.ner.toLowerCase().includes("өмчлөл"),
              );

            const existingElectricity =
              existingElectricityIdx >= 0
                ? existingInvoice.medeelel.zardluud[existingElectricityIdx]
                : null;

            // Check if the electricity amount needs updating
            const currentZaaltDun =
              existingElectricity?.dun || existingElectricity?.tariff || 0;
            const newZaaltDun = latestReading.zaaltDun;

            if (currentZaaltDun !== newZaaltDun) {
              const zoruu =
                latestReading.zoruu ||
                latestReading.zaaltCalculation?.zoruu ||
                0;
              const defaultDun =
                latestReading.defaultDun ||
                latestReading.zaaltCalculation?.defaultDun ||
                0;
              const tariff =
                latestReading.tariff ||
                latestReading.zaaltCalculation?.tariff ||
                0;

              if (existingElectricityIdx >= 0) {
                // Update existing electricity entry
                existingInvoice.medeelel.zardluud[existingElectricityIdx] = {
                  ...existingInvoice.medeelel.zardluud[existingElectricityIdx],
                  tariff: newZaaltDun,
                  dun: newZaaltDun,
                  tariffUsgeer: "₮",
                  zoruu: zoruu,
                  zaaltDefaultDun: defaultDun,
                  zaaltTariff: tariff,
                  umnukhZaalt: latestReading.umnukhZaalt || 0,
                  suuliinZaalt: latestReading.suuliinZaalt || 0,
                  zaaltTog: latestReading.zaaltTog || 0,
                  zaaltUs: latestReading.zaaltUs || 0,
                };
              } else if (Array.isArray(existingInvoice.medeelel?.zardluud)) {
                // No electricity entry existed in this month's invoice – create one instead of creating a new invoice
                const zaaltMeta = existingInvoice.medeelel.zaalt || {};
                const newElectricityEntry = {
                  ner: zaaltMeta.tariffName || "Цахилгаан",
                  zardliinTurul: zaaltMeta.tariffType || "Эрчим хүч",
                  zaalt: true,
                  tariff: newZaaltDun,
                  dun: newZaaltDun,
                  tariffUsgeer: "₮",
                  zoruu: zoruu,
                  zaaltDefaultDun: defaultDun,
                  zaaltTariff: tariff,
                  umnukhZaalt: latestReading.umnukhZaalt || 0,
                  suuliinZaalt: latestReading.suuliinZaalt || 0,
                  zaaltTog: latestReading.zaaltTog || 0,
                  zaaltUs: latestReading.zaaltUs || 0,
                };

                existingInvoice.medeelel.zardluud.push(newElectricityEntry);
              }

              // Update zaalt metadata
              if (existingInvoice.medeelel) {
                existingInvoice.medeelel.zaalt = {
                  ...(existingInvoice.medeelel.zaalt || {}),
                  umnukhZaalt: latestReading.umnukhZaalt || 0,
                  suuliinZaalt: latestReading.suuliinZaalt || 0,
                  zoruu: zoruu,
                  tariff: tariff,
                  defaultDun: defaultDun,
                  zaaltDun: newZaaltDun,
                };
              }

              const newTotal = sumZardalDun(existingInvoice.medeelel.zardluud);
              
              // CRITICAL: Update niitTulburOriginal from all entries in the medeelel (including initial balance)
              const calculatedOriginalTotal = existingInvoice.medeelel.zardluud
                .reduce((s, z) => s + (Number(z.dun || z.tariff || 0)), 0);
              
              existingInvoice.niitTulburOriginal = calculatedOriginalTotal;
              existingInvoice.niitTulbur = newTotal;
              existingInvoice.tsahilgaanNekhemjlekh = newZaaltDun;
              existingInvoice.uldegdel = newTotal;

              await existingInvoice.save();

              // Trigger contract-wide balance recalculation to ensure consistency
              const baiguullagiinIdStr = String(tempData.baiguullagiinId);
              return {
                success: true,
                nekhemjlekh: existingInvoice,
                gereeniiId: tempData._id,
                gereeniiDugaar: tempData.gereeniiDugaar,
                tulbur: newTotal,
                alreadyExists: true,
                updated: true,
              };
            }
          }
        } catch (updateError) {
          console.error("⚠️ [INVOICE] Electricity update in existing invoice failed:", updateError.message);
        }

        return {
          success: true,
          nekhemjlekh: existingInvoice,
          gereeniiId: tempData._id,
          gereeniiDugaar: tempData.gereeniiDugaar,
          tulbur: existingInvoice.niitTulbur,
          alreadyExists: true,
        };
      }
    }

    const tuukh = new nekhemjlekhiinTuukh(tukhainBaaziinKholbolt)();

    let dansInfo = { dugaar: "", dansniiNer: "", bank: "", ibanDugaar: "" };
    try {
      const { Dans } = require("zevbackv2");

      let barilgaDans = null;
      if (tempData.barilgiinId && org?.barilguud) {
        const targetBarilga = org.barilguud.find(
          (b) => String(b._id) === String(tempData.barilgiinId),
        );
        if (targetBarilga?.tokhirgoo?.dans) {
          barilgaDans = targetBarilga.tokhirgoo.dans;
          dansInfo = {
            dugaar: barilgaDans.dugaar || "",
            dansniiNer: barilgaDans.dansniiNer || "",
            bank: barilgaDans.bank || "",
            ibanDugaar: barilgaDans.ibanDugaar || "",
          };
        }
      }

      if (!barilgaDans && tempData.baiguullagiinId && tempData.barilgiinId) {
        try {
          const { QpayKhariltsagch } = require("quickqpaypackvSukh");
          const qpayKhariltsagch = new QpayKhariltsagch(tukhainBaaziinKholbolt);
          const qpayConfig = await qpayKhariltsagch
            .findOne({
              baiguullagiinId: tempData.baiguullagiinId.toString(),
            })
            .lean();

          if (
            qpayConfig &&
            qpayConfig.salbaruud &&
            Array.isArray(qpayConfig.salbaruud)
          ) {
            const targetSalbar = qpayConfig.salbaruud.find(
              (salbar) =>
                String(salbar.salbariinId) === String(tempData.barilgiinId),
            );

            if (
              targetSalbar &&
              targetSalbar.bank_accounts &&
              Array.isArray(targetSalbar.bank_accounts) &&
              targetSalbar.bank_accounts.length > 0
            ) {
              const bankAccount = targetSalbar.bank_accounts[0];
              dansInfo = {
                dugaar: bankAccount.account_number || "",
                dansniiNer: bankAccount.account_name || "",
                bank: bankAccount.account_bank_code || "",
                ibanDugaar: "",
              };
            }
          }
        } catch (qpayError) {
          // Error fetching QpayKhariltsagch - silently continue
        }
      }

      if (!barilgaDans && !dansInfo.dugaar && tempData.baiguullagiinId) {
        const dansModel = Dans(tukhainBaaziinKholbolt);

        let dans = null;
        if (tempData.barilgiinId) {
          dans = await dansModel.findOne({
            baiguullagiinId: tempData.baiguullagiinId.toString(),
            barilgiinId: tempData.barilgiinId.toString(),
          });
        }

        // If not found with barilgiinId, try without it (organization-level)
        if (!dans) {
          dans = await dansModel.findOne({
            baiguullagiinId: tempData.baiguullagiinId.toString(),
          });
        }

        if (dans) {
          dansInfo = {
            dugaar: dans.dugaar || "",
            dansniiNer: dans.dansniiNer || "",
            bank: dans.bank || "",
            ibanDugaar: dans.ibanDugaar || "",
          };
        }
      }
    } catch (dansError) {
      // Error fetching dans info - silently continue
    }

    // Get fresh geree data to check for positiveBalance (credit from overpayment).
    // We cross-check BOTH geree.positiveBalance field AND geree.globalUldegdel:
    //   - geree.positiveBalance: explicitly stored credit
    //   - geree.globalUldegdel < 0: means customer overpaid → |globalUldegdel| is usable credit
    // We take the MAX of the two to avoid missing credit when one field is stale.
    let gereePositiveBalance = 0;
    try {
      const freshGeree = await Geree(tukhainBaaziinKholbolt)
        .findById(tempData._id)
        .select("positiveBalance globalUldegdel")
        .lean();
      if (freshGeree) {
        const storedCredit = Number(freshGeree.positiveBalance) || 0;
        // If globalUldegdel is negative it means the customer has a credit balance
        const creditFromGlobal =
          typeof freshGeree.globalUldegdel === "number" && freshGeree.globalUldegdel < 0
            ? Math.abs(freshGeree.globalUldegdel)
            : 0;
        gereePositiveBalance = Math.max(storedCredit, creditFromGlobal);
        if (gereePositiveBalance > 0) {
          console.log(
            `💳 [INVOICE] geree ${tempData._id} has credit: storedCredit=${storedCredit}, creditFromGlobal=${creditFromGlobal}, using=${gereePositiveBalance}`
          );
        }
      }
    } catch (error) {
      // Error fetching geree positiveBalance - silently continue
    }

    // Гэрээний мэдээллийг нэхэмжлэх рүү хуулах
    tuukh.baiguullagiinNer = tempData.baiguullagiinNer || org.ner;
    const orgUtas = Array.isArray(org?.utas) ? org.utas[0] : org?.utas || "";
    tuukh.baiguullagiinUtas =
      (typeof orgUtas === "string" ? orgUtas : String(orgUtas || "")) || "";
    tuukh.baiguullagiinKhayag = org?.khayag || "";
    tuukh.baiguullagiinId = tempData.baiguullagiinId;

    let barilgiinId = tempData.barilgiinId;
    if (!barilgiinId) {
      if (org?.barilguud && org.barilguud.length > 0) {
        barilgiinId = String(org.barilguud[0]._id);
      } else if (tempData.baiguullagiinId) {
        try {
          const freshOrg = await Baiguullaga(db.erunkhiiKholbolt)
            .findById(tempData.baiguullagiinId)
            .lean();
          if (freshOrg?.barilguud && freshOrg.barilguud.length > 0) {
            barilgiinId = String(freshOrg.barilguud[0]._id);
          }
        } catch (err) {
          // Error fetching baiguullaga for barilgiinId - silently continue
        }
      }
    }
    tuukh.barilgiinId = barilgiinId || "";
    tuukh.ovog = tempData.ovog;
    tuukh.ner = tempData.ner;
    tuukh.register = tempData.register || "";
    tuukh.utas = tempData.utas || [];
    tuukh.khayag = tempData.khayag || tempData.bairNer;
    tuukh.gereeniiOgnoo = tempData.gereeniiOgnoo;
    tuukh.turul = tempData.turul;
    tuukh.gereeniiId = tempData._id;
    tuukh.gereeniiDugaar = tempData.gereeniiDugaar;
    tuukh.davkhar = tempData.davkhar;
    tuukh.orts = tempData.orts || "";
    tuukh.uldegdel =
      tempData.globalUldegdel || tempData.baritsaaniiUldegdel || 0;
    tuukh.daraagiinTulukhOgnoo =
      tempData.daraagiinTulukhOgnoo || tempData.tulukhOgnoo;
    tuukh.dansniiDugaar =
      tempData.dans || tempData.dansniiDugaar || dansInfo.dugaar || "";
    tuukh.gereeniiZagvariinId = tempData.gereeniiZagvariinId || "";
    tuukh.tulukhUdur = tempData.tulukhUdur || [];
    tuukh.tuluv =
      typeof tempData.tuluv === "string" && tempData.tuluv
        ? tempData.tuluv
        : "Төлөөгүй";
    tuukh.ognoo =
      tempData.ognoo ||
      (usingHistoricalBilling
        ? new Date(currentYear, currentMonth, 1, 12, 0, 0, 0)
        : new Date());
    tuukh.mailKhayagTo = tempData.mail;
    tuukh.maililgeesenAjiltniiId =
      tempData.maililgeesenAjiltniiId || tempData.burtgesenAjiltan;
    // When auto-sent by system (creating resident, cron), show "Систем" not resident name
    tuukh.maililgeesenAjiltniiNer =
      uusgegsenEsekh === "automataar" || uusgegsenEsekh === "cron"
        ? "Систем"
        : tempData.maililgeesenAjiltniiNer || tempData.ner;
    tuukh.nekhemjlekhiinZagvarId = tempData.nekhemjlekhiinZagvarId || "";

    let ekhniiUldegdelForInvoice = 0;
    // Only fetch and set ekhniiUldegdel if the flag is true
    if (includeEkhniiUldegdel && tempData.orshinSuugchId) {
      try {
        const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
          .findById(tempData.orshinSuugchId)
          .select("ekhniiUldegdel")
          .lean();
        if (orshinSuugch && orshinSuugch.ekhniiUldegdel) {
          ekhniiUldegdelForInvoice = orshinSuugch.ekhniiUldegdel;
        }
      } catch (error) {
        // Error fetching ekhniiUldegdel for invoice - silently continue
      }
    }

    tuukh.ekhniiUldegdel = ekhniiUldegdelForInvoice;

    if (includeEkhniiUldegdel && tempData.ekhniiUldegdelUsgeer !== undefined) {
      tuukh.ekhniiUldegdelUsgeer = tempData.ekhniiUldegdelUsgeer;
    }

    let filteredZardluud = [];

    try {
      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        tempData.baiguullagiinId,
      );
      const targetBarilga = baiguullaga?.barilguud?.find(
        (b) => String(b._id) === String(tempData.barilgiinId || ""),
      );

      let ashiglaltiinZardluud = [];
      
      // PRIORITY 1: Use individual contract's zardluud if they exist (preserves Excel imports and manual changes)
      if (tempData.zardluud && tempData.zardluud.length > 0) {
        ashiglaltiinZardluud = tempData.zardluud;
      } 
      // PRIORITY 2: Fallback to building-level template
      else {
        ashiglaltiinZardluud = targetBarilga?.tokhirgoo?.ashiglaltiinZardluud || [];
      }

      // Helper to check if an expense is a VARIABLE electricity/utility charge (meter-based)
      // Only items that are NOT shared (дундын/өмчлөл) and have zaalt=true should be handled in the special calculation block
      const isVariableElectricity = (z) => {
        if (!z.zaalt) return false;
        const nameLower = (z.ner || "").toLowerCase();
        if (nameLower.includes("дундын") || nameLower.includes("өмчлөл")) {
          return false;
        }
        return true;
      };

      // Helper: convert Mongoose subdocument -> plain JS object so spread works correctly.
      // Mongoose schema-defined properties are NOT enumerable own-properties, so {...doc} loses them.
      const toPlainZardal = (z) => {
        if (!z || typeof z !== "object") return z;
        if (typeof z.toObject === "function") return z.toObject();
        if (z._doc) return { ...z._doc };
        return { ...z };
      };

      filteredZardluud = ashiglaltiinZardluud
        .filter((zardal) => !isVariableElectricity(zardal))
        .map((zardal) => {
          const plain = toPlainZardal(zardal);
          const dun = plain.dun > 0 ? plain.dun : plain.tariff || 0;
          return {
            ...plain,
            dun: dun,
          };
        });
    } catch (error) {
      filteredZardluud = (tempData.zardluud || []).map((zardal) => {
        const plain = (typeof zardal.toObject === "function") ? zardal.toObject() : (zardal._doc ? { ...zardal._doc } : { ...zardal });
        return {
          ...plain,
          dun: plain.dun || plain.tariff || 0,
        };
      });
    }

    filteredZardluud = normalizeZardluudTurul(filteredZardluud);

    let choloolugdokhDavkhar = [];
    let liftZardalFromBuilding = null;
    let liftTariff = null;

    if (tempData.davkhar && tempData.barilgiinId && tempData.baiguullagiinId) {
      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
        .findById(tempData.baiguullagiinId);

      const targetBarilga = baiguullaga?.barilguud?.find(
        (b) => String(b._id) === String(tempData.barilgiinId || ""),
      );

      choloolugdokhDavkhar =
        targetBarilga?.tokhirgoo?.liftShalgaya?.choloolugdokhDavkhar || [];

      liftZardalFromBuilding =
        targetBarilga?.tokhirgoo?.ashiglaltiinZardluud?.find(
          (z) =>
            z.zardliinTurul === "Лифт" || (z.ner && z.ner.includes("Лифт")),
        );
      if (liftZardalFromBuilding) {
        liftTariff =
          liftZardalFromBuilding.tariff || liftZardalFromBuilding.dun;
      }

      if (choloolugdokhDavkhar.length === 0 && tempData.barilgiinId) {
        try {
          const LiftShalgaya = require("../models/liftShalgaya");
          const liftShalgayaRecord = await LiftShalgaya(tukhainBaaziinKholbolt)
            .findOne({
              baiguullagiinId: String(tempData.baiguullagiinId),
              barilgiinId: String(tempData.barilgiinId),
            })
            .lean();

          if (
            liftShalgayaRecord?.choloolugdokhDavkhar &&
            liftShalgayaRecord.choloolugdokhDavkhar.length > 0
          ) {
            choloolugdokhDavkhar = liftShalgayaRecord.choloolugdokhDavkhar;

            if (targetBarilga) {
              try {
                if (!targetBarilga.tokhirgoo) {
                  targetBarilga.tokhirgoo = {};
                }
                if (!targetBarilga.tokhirgoo.liftShalgaya) {
                  targetBarilga.tokhirgoo.liftShalgaya = {};
                }
                targetBarilga.tokhirgoo.liftShalgaya.choloolugdokhDavkhar =
                  choloolugdokhDavkhar;
                await baiguullaga.save({ validateBeforeSave: false });
              } catch (saveError) {
                // Error syncing to baiguullaga - silently continue
              }
            }
          }
        } catch (error) {
          // Error fetching liftShalgaya - silently continue
        }
      }

      const davkharStr = String(tempData.davkhar || "").trim();
      const choloolugdokhDavkharStr = choloolugdokhDavkhar.map((d) =>
        String(d || "").trim(),
      );



      if (choloolugdokhDavkharStr.includes(davkharStr)) {
        filteredZardluud = filteredZardluud.filter(
          (zardal) => {
            const nerLower = (zardal.ner || "").toLowerCase().trim();
            const turulLower = (zardal.zardliinTurul || "").toLowerCase().trim();
            const isLift = 
              turulLower === "лифт" || 
              nerLower === "лифт" || 
              nerLower.includes("лифт") ||
              turulLower === "lift" ||
              nerLower === "lift" ||
              nerLower.includes("lift");
            
            
            return !isLift;
          },
        );
      } else {
      }
    }

    let tulukhOgnoo = null;
    try {
      const cronSchedule = await getCronScheduleForGeree(
        tukhainBaaziinKholbolt,
        tempData,
        org,
      );
      if (cronSchedule && cronSchedule.nekhemjlekhUusgekhOgnoo) {
        const today = new Date();
        const ub = getUbCalendarParts(today);
        const currentYear = ub.year;
        const currentMonth = ub.month; // 0-11, Mongolia calendar
        const scheduledDay = cronSchedule.nekhemjlekhUusgekhOgnoo; // 1-31

        let nextMonth = currentMonth + 1;
        let nextYear = currentYear;
        if (nextMonth > 11) {
          nextMonth = 0;
          nextYear = currentYear + 1;
        }

        const lastDayOfNextMonth = new Date(
          nextYear,
          nextMonth + 1,
          0,
        ).getDate();
        const dayToUse = Math.min(scheduledDay, lastDayOfNextMonth);

        tulukhOgnoo = new Date(nextYear, nextMonth, dayToUse, 0, 0, 0, 0);
      }
    } catch (error) {
      // Error fetching nekhemjlekhCron schedule - silently continue
    }

    tuukh.tulukhOgnoo =
      tulukhOgnoo || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    let guilgeenuudForNekhemjlekh = [];
    try {
      const gereeWithGuilgee = await Geree(tukhainBaaziinKholbolt, true)
        .findById(tempData._id)
        .select("+guilgeenuudForNekhemjlekh");
      guilgeenuudForNekhemjlekh =
        gereeWithGuilgee?.guilgeenuudForNekhemjlekh || [];
    } catch (error) {
      // Error fetching guilgeenuudForNekhemjlekh - silently continue
    }

    // Ekhnii tulukh rows are summed into ekhniiUldegdelAmount; the same row can also appear in
    // guilgeenuudForNekhemjlekh (same _id). Exclude those from guilgeenuudTotal to avoid double count.
    let tulukhAvlagaEkhniiRecords = [];
    if (includeEkhniiUldegdel) {
      try {
        const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
        tulukhAvlagaEkhniiRecords = await GuilgeeAvlaguud(
          tukhainBaaziinKholbolt,
        )
          .find({
            gereeniiId: String(tempData.gereeniiId || tempData._id),
            baiguullagiinId: String(tempData.baiguullagiinId),
            ekhniiUldegdelEsekh: true,
          })
          .lean();
      } catch (error) {
        // Error fetching ekhnii tulukh — continue without dedupe ids
      }
    }

    const ekhniiTulukhIdsForGuilgeeDedup = new Set(
      (tulukhAvlagaEkhniiRecords || [])
        .filter((rec) => rec._id != null)
        .map((rec) => String(rec._id)),
    );

    const guilgeenuudTotal = guilgeenuudForNekhemjlekh.reduce(
      (sum, guilgee) => {
        const gid = guilgee._id != null ? String(guilgee._id) : null;
        if (
          gid &&
          includeEkhniiUldegdel &&
          ekhniiTulukhIdsForGuilgeeDedup.size > 0 &&
          ekhniiTulukhIdsForGuilgeeDedup.has(gid)
        ) {
          return sum;
        }
        return sum + (guilgee.tulukhDun || 0);
      },
      0,
    );

    // MERGE MODE: We no longer treat queued transactions as a separate 'avlaga-only' type.
    // Instead, we always include regular charges and merge the queued items into them.
    const isAvlagaOnlyInvoice = false;

    let finalZardluud = filteredZardluud;
    const zardluudTotal = sumZardalDun(finalZardluud);

    let ekhniiUldegdelFromOrshinSuugch = 0;
    let ekhniiUldegdelTailbar = ""; // Store the description from GuilgeeAvlaguud
    let ekhniiUldegdelRecordId = null; // Store the ID for reference

    // Only fetch and include ekhniiUldegdel if the flag is true (checkbox checked)
    if (includeEkhniiUldegdel) {
      if (tulukhAvlagaEkhniiRecords && tulukhAvlagaEkhniiRecords.length > 0) {
        ekhniiUldegdelFromOrshinSuugch = tulukhAvlagaEkhniiRecords.reduce(
          (sum, record) => {
            const amount = Number(
              record.uldegdel ?? record.undsenDun ?? record.tulukhDun ?? 0,
            );
            return sum + amount;
          },
          0,
        );

        const firstRecord = tulukhAvlagaEkhniiRecords[0];
        ekhniiUldegdelTailbar =
          firstRecord.tailbar || firstRecord.temdeglel || "";
        ekhniiUldegdelRecordId = firstRecord._id?.toString();
      }

      // Fallback to orshinSuugch.ekhniiUldegdel if no GuilgeeAvlaguud records found
      if (ekhniiUldegdelFromOrshinSuugch === 0 && tempData.orshinSuugchId) {
        try {
          const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
            .findById(tempData.orshinSuugchId)
            .select("ekhniiUldegdel")
            .lean();
          if (orshinSuugch && orshinSuugch.ekhniiUldegdel) {
            ekhniiUldegdelFromOrshinSuugch = orshinSuugch.ekhniiUldegdel;
          }
        } catch (error) {
          // Error fetching ekhniiUldegdel from orshinSuugch - silently continue
        }
      }
    }

    const hasEkhniiUldegdel =
      includeEkhniiUldegdel && ekhniiUldegdelFromOrshinSuugch > 0;
    const ekhniiUldegdelAmount = includeEkhniiUldegdel
      ? ekhniiUldegdelFromOrshinSuugch
      : 0;

    let updatedZardluudTotal = sumZardalDun(finalZardluud);

    let finalNiitTulbur =
      updatedZardluudTotal + guilgeenuudTotal + ekhniiUldegdelAmount;

    if (finalNiitTulbur === 0 && guilgeenuudTotal === 0 && !hasEkhniiUldegdel) {
      return {
        success: false,
        error: "Нийт төлбөр 0₮ байна. Нэхэмжлэх үүсгэх шаардлагаагүй.",
        gereeniiId: tempData._id,
        gereeniiDugaar: tempData.gereeniiDugaar,
        skipReason: "zero_amount",
      };
    }

    let zaaltMedeelel = null;
    let tsahilgaanNekhemjlekh = 0;
    let electricityZardalEntry = null;

    // Electricity processing (zaalt-based charges)
    if (
      tempData.barilgiinId &&
      tempData.baiguullagiinId &&
      tempData.orshinSuugchId
    ) {
      try {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          tempData.baiguullagiinId,
        );
        const targetBarilga = baiguullaga?.barilguud?.find(
          (b) => String(b._id) === String(tempData.barilgiinId),
        );
        // Process ALL utility/zaalt entries from BOTH contract and building level
        // (isVariableElectricity is defined at the top of the function)

        const gereeZaaltZardluud = (tempData.zardluud || []).map(z => {
          const p = (typeof z.toObject === "function") ? z.toObject() : (z._doc ? { ...z._doc } : { ...z });
          return p;
        }).filter(isVariableElectricity);

        const zardluud = targetBarilga?.tokhirgoo?.ashiglaltiinZardluud || [];
        const zaaltZardluud = zardluud.filter(isVariableElectricity);

        if (gereeZaaltZardluud.length > 0 || zaaltZardluud.length > 0) {
          // Process ALL zaalt entries from BOTH contract and building level
          // Combine both sources, with contract entries taking priority for same name
          const combinedZaaltZardluud = [
            ...gereeZaaltZardluud,
            ...zaaltZardluud,
          ];

          // Keep only unique zaalt entries by name (first occurrence wins = contract priority)
          const seenNames = new Set();
          const zaaltZardluudToProcess = combinedZaaltZardluud.filter((z) => {
            const key = z.ner || z.zardliinTurul || "Цахилгаан";
            if (seenNames.has(key)) {
              return false;
            }
            seenNames.add(key);
            return true;
          });

          const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
            .findById(tempData.orshinSuugchId)
            .select("tsahilgaaniiZaalt")
            .lean();

          const zaaltTariff = orshinSuugch?.tsahilgaaniiZaalt || 0;

          const umnukhZaalt =
            tempData.umnukhZaalt ?? zaaltZardluudToProcess[0]?.umnukhZaalt ?? 0;
          const suuliinZaalt =
            tempData.suuliinZaalt ??
            zaaltZardluudToProcess[0]?.suuliinZaalt ??
            0;

          const zoruu = suuliinZaalt - umnukhZaalt;

          const electricityEntries = [];
          let totalTsahilgaanNekhemjlekh = 0;

          for (const gereeZaaltZardal of zaaltZardluudToProcess) {
            let zaaltDefaultDun = 0;
            let zaaltDun = 0;
            let isFixedCharge = false;
            let kwhTariff = zaaltTariff; // from orshinSuugch.tsahilgaaniiZaalt

            // Variable electricity = zaalt + цахилгаан (not дундын өмчлөл) - needs Excel, don't show suuriKhuraamj alone
            const nameLower = (gereeZaaltZardal.ner || "").toLowerCase();
            const isVariableElectricityZardal =
              gereeZaaltZardal.zaalt &&
              nameLower.includes("цахилгаан") &&
              !nameLower.includes("дундын") &&
              !nameLower.includes("өмчлөл");

            // For variable цахилгаан: when no Excel (zoruu=0), skip - match Excel behavior (don't show suuriKhuraamj/tariff)
            // if (isVariableElectricityZardal && zoruu === 0) {
            //   continue;
            // }

            // Determine if this is a FIXED or CALCULATED electricity charge:
            // FIXED: tariffUsgeer = "₮" -> use tariff directly as the total amount
            // CALCULATED: tariffUsgeer = "кВт" -> tariff is kWh rate, suuriKhuraamj is base fee from Excel
            //
            // Key distinction:
            // - "дундын өмчлөл Цахилгаан": tariffUsgeer="₮", tariff=6883.44 -> FIXED (use tariff directly)
            // - "Цахилгаан": tariffUsgeer="кВт", tariff=2000 (кВт rate), suuriKhuraamj=Excel imported amount -> CALCULATED

            // If tariffUsgeer is "кВт", it's ALWAYS a calculated type (per-kWh billing)
            const isCalculatedType = gereeZaaltZardal.tariffUsgeer === "кВт";

            if (!isCalculatedType) {
              // This is a FIXED electricity charge - use tariff directly
              isFixedCharge = true;
              zaaltDun = gereeZaaltZardal.tariff || gereeZaaltZardal.dun || 0;
            } else {
              if (!kwhTariff || kwhTariff === 0) {
                kwhTariff = gereeZaaltZardal.tariff || 0;
              }

              try {
                const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
                const gereeniiId =
                  tempData._id?.toString() ||
                  tempData.gereeniiId ||
                  tempData._id;
                const gereeniiDugaar = tempData.gereeniiDugaar;

                let latestReading = null;
                if (gereeniiId) {
                  latestReading = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
                    .findOne({ gereeniiId: gereeniiId })
                    .sort({
                      importOgnoo: -1,
                      "zaaltCalculation.calculatedAt": -1,
                      unshlaltiinOgnoo: -1,
                    })
                    .lean();
                }

                if (!latestReading && gereeniiDugaar) {
                  latestReading = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
                    .findOne({ gereeniiDugaar: gereeniiDugaar })
                    .sort({
                      importOgnoo: -1,
                      "zaaltCalculation.calculatedAt": -1,
                      unshlaltiinOgnoo: -1,
                    })
                    .lean();
                }

                if (latestReading) {
                  // Get all calculation data from Excel reading
                  zaaltDefaultDun =
                    latestReading.zaaltCalculation?.defaultDun ||
                    latestReading.defaultDun ||
                    0;

                  // Get zoruu from Excel reading (this is the actual usage from import)
                  const readingZoruu =
                    latestReading.zaaltCalculation?.zoruu ||
                    latestReading.zoruu ||
                    0;

                  // Get tariff from Excel reading (kWh rate used during import)
                  const readingTariff =
                    latestReading.zaaltCalculation?.tariff ||
                    latestReading.tariff ||
                    0;

                  // Use the pre-calculated zaaltDun from Excel if available
                  if (latestReading.zaaltDun > 0) {
                    zaaltDun = latestReading.zaaltDun;
                  } else {
                    // Recalculate if no zaaltDun stored
                    // Use tariff from reading if available, otherwise from orshinSuugch
                    if (readingTariff > 0) {
                      kwhTariff = readingTariff;
                    }
                    zaaltDun = readingZoruu * kwhTariff + zaaltDefaultDun;
                  }
                } else {
                  // For цахилгаан (кВт): if no Excel reading, still allow the entry with 0 usage
                  if (zoruu === 0) {
                    // console.log("zoruu is 0, keeping entry as 0");
                  }

                  // Fallback to zardal's suuriKhuraamj, zaaltDefaultDun, or tariff (for old data format)
                  zaaltDefaultDun =
                    Number(gereeZaaltZardal.suuriKhuraamj) ||
                    gereeZaaltZardal.zaaltDefaultDun ||
                    gereeZaaltZardal.tariff ||
                    0;

                  // Calculate with zoruu from tempData (if available)
                  zaaltDun = zoruu * kwhTariff + zaaltDefaultDun;
                }
              } catch (error) {
                // Fallback calculation
                zaaltDefaultDun =
                  Number(gereeZaaltZardal.suuriKhuraamj) ||
                  gereeZaaltZardal.zaaltDefaultDun ||
                  gereeZaaltZardal.tariff ||
                  0;
                zaaltDun = zoruu * kwhTariff + zaaltDefaultDun;
              }

              // For calculated цахилгаан (tariffUsgeer="кВт"): handle 0 cases gracefully
              if (zaaltDun === 0 && zoruu === 0) {
                // If it has a base fee, we still want to show it
                const suuriFee =
                  Number(gereeZaaltZardal.suuriKhuraamj) ||
                  gereeZaaltZardal.zaaltDefaultDun ||
                  gereeZaaltZardal.tariff ||
                  0;
                if (suuriFee > 0) {
                   zaaltDun = suuriFee;
                   zaaltDefaultDun = suuriFee;
                }
              }
              // Final fallback: if zaaltDun is still 0 but zardal has suuriKhuraamj, use that
              // (Only for non-calculated or when zoruu > 0 - already handled above)
              if (zaaltDun === 0) {
                const fallbackDun =
                  Number(gereeZaaltZardal.suuriKhuraamj) ||
                  gereeZaaltZardal.zaaltDefaultDun ||
                  gereeZaaltZardal.tariff ||
                  0;
                if (fallbackDun > 0) {
                  zaaltDun = fallbackDun;
                  zaaltDefaultDun = fallbackDun;
                }
              }
            }

            // Skip if no amount BUT only if it's not a standard charge we want to preserve
            if (zaaltDun === 0) {
               // We still add it as a 0 entry to prevent it from "disappearing" from the UI/invoice
               // unless it's truly dynamic and has no reason to be there (redundant check)
            }

            totalTsahilgaanNekhemjlekh += zaaltDun;
            const finalZaaltTariff = zaaltDun;

            const electricityZardalEntry = {
              ner: gereeZaaltZardal.ner || "Цахилгаан",
              turul: normalizeTurul(gereeZaaltZardal.turul) || "Тогтмол",
              tariff: finalZaaltTariff,
              tariffUsgeer:
                zoruu === 0 || zaaltDun === 0
                  ? gereeZaaltZardal?.tariffUsgeer ||
                    buildingZaaltZardal?.tariffUsgeer ||
                    "₮"
                  : "₮",
              zardliinTurul: gereeZaaltZardal.zardliinTurul || "Эрчим хүч",
              barilgiinId: tempData.barilgiinId,
              dun: finalZaaltTariff,
              bodokhArga: gereeZaaltZardal.bodokhArga || "тогтмол",
              tseverUsDun: 0,
              bokhirUsDun: 0,
              usKhalaasniiDun: 0,
              tsakhilgaanUrjver: 1,
              tsakhilgaanChadal: 0,
              tsakhilgaanDemjikh: 0,
              suuriKhuraamj: zaaltDefaultDun.toString(),
              nuatNemekhEsekh: false,
              ognoonuud: [],
              zaalt: true,
              zaaltTariff: zaaltTariff,
              zaaltDefaultDun: zaaltDefaultDun,
              umnukhZaalt: tempData.umnukhZaalt || 0,
              suuliinZaalt: tempData.suuliinZaalt || 0,
              zaaltTog: tempData.zaaltTog || 0,
              zaaltUs: tempData.zaaltUs || 0,
              zoruu: zoruu,
            };

            electricityEntries.push(electricityZardalEntry);
          }

          // NOTE: Removed duplicate ashiglaltiinZardluud entry - electricity is already calculated above
          // from zaaltZardluudToProcess with proper zaalt calculation (zoruu * tariff + defaultDun)

          tsahilgaanNekhemjlekh = totalTsahilgaanNekhemjlekh;
          electricityZardalEntry = electricityEntries[0];

          const filteredZardluudWithoutZaalt = finalZardluud.filter((z) => {
            if (z.zaalt === true) {
              return !zaaltZardluudToProcess.some(
                (gz) =>
                  z.ner === gz.ner && z.zardliinTurul === gz.zardliinTurul,
              );
            }
            const zNerLower = (z.ner || "").toLowerCase().trim();
            const zTurulLower = (z.zardliinTurul || "").toLowerCase().trim();
            const isLiftEntry = 
              zTurulLower === "лифт" || 
              zNerLower === "лифт" || 
              zNerLower.includes("лифт") ||
              zTurulLower === "lift" || 
              zNerLower === "lift" || 
              zNerLower.includes("lift");

            if (isLiftEntry && tempData.davkhar) {
              const davkharStr = String(tempData.davkhar || "").trim();
              const choloolugdokhDavkharStr = choloolugdokhDavkhar.map((d) =>
                String(d || "").trim(),
              );

              if (choloolugdokhDavkharStr.includes(davkharStr)) {
                return false;
              }
            }
            return true;
          });

          filteredZardluudWithoutZaalt.push(...electricityEntries);

          finalZardluud.length = 0;
          finalZardluud.push(...filteredZardluudWithoutZaalt);

          finalZardluud = normalizeZardluudTurul(finalZardluud);

          updatedZardluudTotal = isAvlagaOnlyInvoice
            ? 0
            : sumZardalDun(finalZardluud);

          finalNiitTulbur =
            updatedZardluudTotal + guilgeenuudTotal + ekhniiUldegdelAmount;

          const firstElectricityEntry = electricityEntries[0];
          const firstBuildingZaaltZardal = zaaltZardluud.find(
            (z) =>
              firstElectricityEntry &&
              z.ner === firstElectricityEntry.ner &&
              z.zardliinTurul === firstElectricityEntry.zardliinTurul,
          );
          zaaltMedeelel = {
            umnukhZaalt: tempData.umnukhZaalt || 0,
            suuliinZaalt: tempData.suuliinZaalt || 0,
            zaaltTog: tempData.zaaltTog || 0,
            zaaltUs: tempData.zaaltUs || 0,
            zoruu: zoruu,
            tariff: zaaltTariff,
            tariffUsgeer:
              firstElectricityEntry?.tariffUsgeer ||
              firstBuildingZaaltZardal?.tariffUsgeer ||
              "кВт",
            tariffType:
              firstElectricityEntry?.zardliinTurul ||
              firstBuildingZaaltZardal?.zardliinTurul ||
              "Эрчим хүч",
            tariffName:
              firstElectricityEntry?.ner ||
              firstBuildingZaaltZardal?.ner ||
              "Цахилгаан",
            defaultDun: firstElectricityEntry?.zaaltDefaultDun || 0,
            zaaltDun: tsahilgaanNekhemjlekh,
          };
        }
      } catch (error) {
        // Error processing electricity for invoice - silently continue
      }
    }

    const normalizedZardluud = normalizeZardluudTurul(finalZardluud);

    let zardluudWithDun = normalizedZardluud.map((zardal) => {
      if (zardal.zaalt === true) {
        return zardal;
      }
      const dun = zardal.dun > 0 ? zardal.dun : zardal.tariff || 0;
      const result = {
        ...zardal,
        dun: dun,
        zardliinTurul: zardal.zardliinTurul || "Эрчим хүч",
      };
      if (result.dun === 0 && result.tariff > 0) {
        result.dun = result.tariff;
      }
      return result;
    });

    // FINAL CONSOLIDATED LIFT FILTER — runs after full zardluudWithDun assembly
    // This is the single source of truth for lift exclusion
    if (tempData.davkhar && choloolugdokhDavkhar.length > 0) {
      const davkharStr = String(tempData.davkhar || "").trim();
      const choloolugdokhDavkharStr = choloolugdokhDavkhar.map((d) =>
        String(d || "").trim(),
      );



      if (choloolugdokhDavkharStr.includes(davkharStr)) {
        const before = zardluudWithDun.length;
        zardluudWithDun = zardluudWithDun.filter((zardal) => {
          const zNerLower = (zardal.ner || "").toLowerCase().trim();
          const zTurulLower = (zardal.zardliinTurul || "").toLowerCase().trim();
          const isLiftEntry =
            zTurulLower === "лифт" ||
            zNerLower === "лифт" ||
            zNerLower.includes("лифт") ||
            zTurulLower === "lift" ||
            zNerLower === "lift" ||
            zNerLower.includes("lift");
          
          
          return !isLiftEntry;
        });
        
      } else {
      }
    }

    const correctedZardluudTotal = isAvlagaOnlyInvoice
      ? 0
      : sumZardalDun(zardluudWithDun);

    let correctedFinalNiitTulbur =
      correctedZardluudTotal + guilgeenuudTotal + ekhniiUldegdelAmount;

    let positiveBalanceUsed = 0;
    let remainingPositiveBalance = 0;
    if (gereePositiveBalance > 0) {
      positiveBalanceUsed = Math.min(
        gereePositiveBalance,
        correctedFinalNiitTulbur,
      );
      correctedFinalNiitTulbur = Math.max(
        0,
        correctedFinalNiitTulbur - positiveBalanceUsed,
      );
      remainingPositiveBalance = gereePositiveBalance - positiveBalanceUsed;
    }

    if (ekhniiUldegdelAmount > 0) {
      zardluudWithDun.push({
        _id:
          ekhniiUldegdelRecordId || ekhniiUldegdelId || `init-${Math.random()}`,
        ner: "Эхний үлдэгдэл",
        turul: "Тогтмол",
        bodokhArga: "тогтмол",
        zardliinTurul: "Эрчим хүч",
        tariff: ekhniiUldegdelAmount,
        tariffUsgeer: tempData.ekhniiUldegdelUsgeer || "₮",
        dun: ekhniiUldegdelAmount,
        zaalt: false,
        ognoonuud: [],
        nuatNemekhEsekh: false,
        nuatBodokhEsekh: false,
        isEkhniiUldegdel: true, // Flag to identify this row
        tailbar: ekhniiUldegdelTailbar || "", // Include the description from GuilgeeAvlaguud
      });
    }

    zardluudWithDun = zardluudWithDun.map((zardal) => {
      if (zardal.zaalt === true) {
        return zardal;
      }
      if (zardal.dun === 0 && zardal.tariff > 0) {
        return {
          ...zardal,
          dun: zardal.tariff,
        };
      }
      return zardal;
    });

    tuukh.medeelel = {
      zardluud: zardluudWithDun,
      guilgeenuud: guilgeenuudForNekhemjlekh,
      segmentuud: tempData.segmentuud || [],
      khungulultuud: tempData.khungulultuud || [],
      toot: tempData.toot,
      temdeglel: tempData.temdeglel,
      tailbar: tempData.temdeglel || "",
      uusgegsenEsekh: uusgegsenEsekh,
      uusgegsenOgnoo: new Date(),
      ...(zaaltMedeelel ? { zaalt: zaaltMedeelel } : {}),
    };
    tuukh.nekhemjlekh =
      tempData.nekhemjlekh ||
      (uusgegsenEsekh === "automataar"
        ? "Автоматаар үүсгэсэн нэхэмжлэх"
        : "Гараар үүсгэсэн нэхэмжлэх");
    tuukh.zagvariinNer = tempData.zagvariinNer || org.ner;

    const tailbarText =
      tempData.temdeglel &&
      tempData.temdeglel !== "Excel файлаас автоматаар үүсгэсэн гэрээ"
        ? `\nТайлбар: ${tempData.temdeglel}`
        : "";

    const zaaltText = zaaltMedeelel
      ? `\nЦахилгаан: Умнө: ${zaaltMedeelel.umnukhZaalt}, Өдөр: ${zaaltMedeelel.zaaltTog}, Шөнө: ${zaaltMedeelel.zaaltUs}, Нийт: ${zaaltMedeelel.suuliinZaalt}`
      : "";

    const positiveBalanceText =
      positiveBalanceUsed > 0
        ? `\nЭергий үлдэгдэл ашигласан: ${positiveBalanceUsed}₮${remainingPositiveBalance > 0 ? `, үлдсэн: ${remainingPositiveBalance}₮` : ""}`
        : "";

    tuukh.content = `Гэрээний дугаар: ${tempData.gereeniiDugaar}, Нийт төлбөр: ${correctedFinalNiitTulbur}₮${tailbarText}${zaaltText}${positiveBalanceText}`;
    tuukh.nekhemjlekhiinDans =
      tempData.nekhemjlekhiinDans || dansInfo.dugaar || "";
    tuukh.nekhemjlekhiinDansniiNer =
      tempData.nekhemjlekhiinDansniiNer || dansInfo.dansniiNer || "";
    tuukh.nekhemjlekhiinBank =
      tempData.nekhemjlekhiinBank || dansInfo.bank || "";

    tuukh.nekhemjlekhiinIbanDugaar =
      tempData.nekhemjlekhiinIbanDugaar || dansInfo.ibanDugaar || "";
    tuukh.nekhemjlekhiinOgnoo = usingHistoricalBilling
      ? new Date(currentYear, currentMonth, 1, 12, 0, 0, 0)
      : new Date();
    tuukh.niitTulbur = correctedFinalNiitTulbur;
    // niitTulburOriginal = total BEFORE credit deduction.
    // This is the true original charge amount.
    // Used by pre-save hook: remaining = niitTulburOriginal - totalPaid
    // If invoice was created with positiveBalance applied, niitTulburOriginal stays
    // at the pre-credit value while niitTulbur reflects the discounted amount.
    const preCreditTotal = Math.round(
      (correctedZardluudTotal + guilgeenuudTotal + ekhniiUldegdelAmount) * 100
    ) / 100;
    tuukh.niitTulburOriginal = preCreditTotal;

    if (tsahilgaanNekhemjlekh > 0) {
      tuukh.tsahilgaanNekhemjlekh = tsahilgaanNekhemjlekh;
    }

    tuukh.tuluv = "Төлөөгүй";

    const suuliinNekhemjlekh = await nekhemjlekhiinTuukh(tukhainBaaziinKholbolt)
      .findOne()
      .sort({ dugaalaltDugaar: -1 });

    const suuliinDugaar = suuliinNekhemjlekh?.dugaalaltDugaar;
    tuukh.dugaalaltDugaar =
      suuliinDugaar && !isNaN(suuliinDugaar) ? suuliinDugaar + 1 : 1;

    const generateUniqueNekhemjlekhiinDugaar = async () => {
      const stampDate = usingHistoricalBilling
        ? new Date(currentYear, currentMonth, 1, 12, 0, 0, 0)
        : new Date();
      const year = stampDate.getFullYear();
      const month = String(stampDate.getMonth() + 1).padStart(2, "0");
      const day = String(stampDate.getDate()).padStart(2, "0");
      const datePrefix = `${year}${month}${day}`;

      const todayInvoices = await nekhemjlekhiinTuukh(tukhainBaaziinKholbolt)
        .find({
          nekhemjlekhiinDugaar: { $regex: `^НЭХ-${datePrefix}-` },
        })
        .sort({ nekhemjlekhiinDugaar: -1 })
        .limit(1)
        .lean();

      let sequence = 1;
      if (todayInvoices.length > 0 && todayInvoices[0].nekhemjlekhiinDugaar) {
        const lastDugaar = todayInvoices[0].nekhemjlekhiinDugaar;
        const match = lastDugaar.match(/^НЭХ-\d{8}-(\d+)$/);
        if (match) {
          sequence = parseInt(match[1], 10) + 1;
        }
      }

      return `НЭХ-${datePrefix}-${String(sequence).padStart(4, "0")}`;
    };

    const saveInvoiceWithRetry = async (maxRetries = 10) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          tuukh.nekhemjlekhiinDugaar =
            await generateUniqueNekhemjlekhiinDugaar();

          await tuukh.save();

          return;
        } catch (error) {
          if (
            error.code === 11000 &&
            error.keyPattern &&
            error.keyPattern.nekhemjlekhiinDugaar
          ) {
            if (attempt === maxRetries) {
              throw new Error(
                `Failed to generate unique invoice number after ${maxRetries} attempts for contract ${tempData.gereeniiDugaar}: ${error.message}`,
              );
            }

            const delay = 50 * attempt + Math.random() * 50;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            throw error;
          }
        }
      }
    };

    await saveInvoiceWithRetry();

    if (guilgeenuudForNekhemjlekh.length > 0) {
      try {
        await Geree(tukhainBaaziinKholbolt).findByIdAndUpdate(
          tempData._id,
          {
            $set: {
              guilgeenuudForNekhemjlekh: [],
            },
          },
          {
            runValidators: false,
          },
        );
      } catch (error) {
        // Error clearing guilgeenuudForNekhemjlekh - silently continue
      }
    }

    // Update geree: set latest invoice date, then recalculate globalUldegdel & positiveBalance
    // via the ledger so the two fields never drift apart.
    try {
      // 1) Stamp the invoice date
      await Geree(tukhainBaaziinKholbolt).findByIdAndUpdate(
        tempData._id,
        {
          $set: {
            nekhemjlekhiinOgnoo: usingHistoricalBilling
              ? new Date(currentYear, currentMonth, 1, 12, 0, 0, 0)
              : new Date(),
          },
        },
        { runValidators: false },
      );
    } catch (gereeUpdateError) {
      // Error updating geree nekhemjlekhiinOgnoo - silently continue
    }

    // Recalculation logic removed as per request.


    // TEMPORARILY DISABLED: Send SMS to orshinSuugch when invoice is created
    // try {
    //   await sendInvoiceSmsToOrshinSuugch(
    //     tuukh,
    //     tempData,
    //     org,
    //     tukhainBaaziinKholbolt
    //   );
    // } catch (smsError) {
    //   console.error("Error sending SMS to orshinSuugch:", smsError);
    //   // Don't fail the invoice creation if SMS fails
    // }

    let savedMedegdel = null;
    try {
      if (tempData.orshinSuugchId) {
        const baiguullagiinId = org._id
          ? org._id.toString()
          : org.id
            ? org.id.toString()
            : String(org);

        const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);

        if (kholbolt) {
          const medegdel = new Medegdel(kholbolt)();
          medegdel.orshinSuugchId = tempData.orshinSuugchId;
          medegdel.baiguullagiinId = baiguullagiinId;
          medegdel.barilgiinId = tempData.barilgiinId || "";
          medegdel.title = "Шинэ нэхэмжлэх үүсгэсэн";
          medegdel.message = `Гэрээний дугаар: ${tempData.gereeniiDugaar}, Нийт төлбөр: ${correctedFinalNiitTulbur}₮`;
          medegdel.kharsanEsekh = false;
          medegdel.turul = "мэдэгдэл";
          medegdel.ognoo = new Date();

          await medegdel.save();

          const medegdelObj = medegdel.toObject();
          const mongolianOffset = 8 * 60 * 60 * 1000;

          if (medegdelObj.createdAt) {
            const createdAtMongolian = new Date(
              medegdelObj.createdAt.getTime() + mongolianOffset,
            );
            medegdelObj.createdAt = createdAtMongolian.toISOString();
          }
          if (medegdelObj.updatedAt) {
            const updatedAtMongolian = new Date(
              medegdelObj.updatedAt.getTime() + mongolianOffset,
            );
            medegdelObj.updatedAt = updatedAtMongolian.toISOString();
          }
          if (medegdelObj.ognoo) {
            const ognooMongolian = new Date(
              medegdelObj.ognoo.getTime() + mongolianOffset,
            );
            medegdelObj.ognoo = ognooMongolian.toISOString();
          }

          savedMedegdel = medegdelObj;
        }
      }
    } catch (notificationError) {
      // Error sending notification for invoice - silently continue
    }

    return {
      success: true,
      nekhemjlekh: tuukh,
      gereeniiId: tempData._id,
      gereeniiDugaar: tempData.gereeniiDugaar,
      tulbur: correctedFinalNiitTulbur,
      medegdel: savedMedegdel,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      gereeniiId: tempData._id,
      gereeniiDugaar: tempData.gereeniiDugaar,
    };
  }
};

async function sendInvoiceSmsToOrshinSuugch(
  nekhemjlekh,
  geree,
  baiguullaga,
  tukhainBaaziinKholbolt,
) {
  try {
    if (!geree.orshinSuugchId) {
      return;
    }
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      geree.orshinSuugchId,
    );

    if (!orshinSuugch || !orshinSuugch.utas) {
      return;
    }

    var msgIlgeekhKey = "aa8e588459fdd9b7ac0b809fc29cfae3";
    var msgIlgeekhDugaar = "72002002";

    const smsText = `Tany ${nekhemjlekh.gereeniiDugaar} gereend, ${
      nekhemjlekh.niitTulbur
    }₮ nekhemjlekh uuslee, tulukh ognoo ${new Date(
      nekhemjlekh.tulukhOgnoo,
    ).toLocaleDateString("mn-MN")}`;

    const msgServer = process.env.MSG_SERVER || "https://api.messagepro.mn";
    let url =
      msgServer +
      "/send" +
      "?key=" +
      msgIlgeekhKey +
      "&from=" +
      msgIlgeekhDugaar +
      "&to=" +
      orshinSuugch.utas.toString() +
      "&text=" +
      smsText;

    url = encodeURI(url);

    request(url, { json: true }, (err1, res1, body) => {
      if (!err1) {
        try {
          const msg = new MsgTuukh(tukhainBaaziinKholbolt)();
          msg.baiguullagiinId = baiguullaga._id.toString();
          msg.dugaar = orshinSuugch.utas;
          msg.gereeniiId = geree._id.toString();
          msg.msg = smsText;
          msg.msgIlgeekhKey = msgIlgeekhKey;
          msg.msgIlgeekhDugaar = msgIlgeekhDugaar;
          msg.save().catch(() => {
            // Error saving SMS to MsgTuukh - silently continue
          });
        } catch (saveError) {
          // Error saving SMS to MsgTuukh - silently continue
        }
      }
    });
  } catch (error) {
    throw error;
  }
}

module.exports = {
  gereeNeesNekhemjlekhUusgekh,
  getCronScheduleForGeree,
};
