const { db } = require("zevbackv2");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Medegdel = require("../models/medegdel");
const NekhemjlekhCron = require("../models/cronSchedule");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const {
  gereeNeesNekhemjlekhUusgekh,
  getCronScheduleForGeree,
} = require("./invoiceCreationService");
const { previewInvoice } = require("./invoicePreviewService");
const {
  getLiveBillingCycleBoundsUb,
  getCycleBoundsForTargetCalendarMonthUb,
} = require("../utils/billingCycleUb");

function isZardalExcludingEkhniiUldegdel(z) {
  return (
    !z.isEkhniiUldegdel &&
    z.ner !== "Эхний үлдэгдэл" &&
    !(z.ner && z.ner.includes("Эхний үлдэгдэл"))
  );
}

function isEkhniiUldegdelEntry(z) {
  return (
    z.isEkhniiUldegdel ||
    z.ner === "Эхний үлдэгдэл" ||
    (z.ner && z.ner.includes("Эхний үлдэгдэл"))
  );
}

function sumZardalDun(zardluud) {
  return (zardluud || []).reduce((sum, z) => sum + (z.dun || z.tariff || 0), 0);
}

function invoiceHasPayments(inv) {
  return (
    (inv.paymentHistory && inv.paymentHistory.length > 0) ||
    (inv.uldegdel !== inv.niitTulbur && inv.uldegdel < inv.niitTulbur)
  );
}

function toPlainObject(obj) {
  return obj && typeof obj.toObject === "function" ? obj.toObject() : obj;
}

/** How manualSendInvoice / gereeNeesNekhemjlekhUusgekh resolved for one contract. */
function classifyManualInvoiceOutcome(invoiceResult) {
  if (!invoiceResult || !invoiceResult.success) return null;
  if (invoiceResult.alreadyExists) {
    return invoiceResult.updated ? "updated" : "unchanged";
  }
  return "new";
}

async function deleteDuplicateUnsentInvoices(
  existingUnsentInvoices,
  tukhainBaaziinKholbolt,
) {
  if (existingUnsentInvoices.length <= 1) return;
  for (let i = 1; i < existingUnsentInvoices.length; i++) {
    const inv = existingUnsentInvoices[i];
    if (!invoiceHasPayments(inv)) {
      await nekhemjlekhiinTuukh(tukhainBaaziinKholbolt).deleteOne({
        _id: inv._id,
      });
    }
  }
}

const manualSendInvoice = async (
  gereeId,
  baiguullagiinId,
  override = false,
  targetMonth = null,
  targetYear = null,
  app = null,
) => {
  try {
    const tukhainBaaziinKholbolt =
      getKholboltByBaiguullagiinId(baiguullagiinId);

    if (!tukhainBaaziinKholbolt) {
      return { success: false, error: "Холболтын мэдээлэл олдсонгүй!" };
    }

    const geree = await Geree(tukhainBaaziinKholbolt).findById(gereeId).lean();
    if (!geree) {
      return { success: false, error: "Гэрээ олдсонгүй!" };
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
      .findById(baiguullagiinId)
      .lean();
    if (!baiguullaga) {
      return { success: false, error: "Байгууллага олдсонгүй!" };
    }

    const currentDate =
      targetMonth !== null && targetYear !== null
        ? new Date(targetYear, targetMonth - 1, 1)
        : new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const usingHistoricalTarget =
      targetMonth !== null &&
      targetYear !== null &&
      !Number.isNaN(Number(targetMonth)) &&
      !Number.isNaN(Number(targetYear));

    // Determine the start of the check period based on the scheduled day (live = UB wall-clock cycle)
    let monthStart;
    let nextCycleStart;
    try {
      const cronSchedule = await getCronScheduleForGeree(
        tukhainBaaziinKholbolt,
        geree,
        baiguullaga,
      );

      if (usingHistoricalTarget) {
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
    } catch (err) {
      if (usingHistoricalTarget) {
        const bounds = getCycleBoundsForTargetCalendarMonthUb(
          null,
          currentYear,
          currentMonth,
        );
        monthStart = bounds.monthStart;
        nextCycleStart = bounds.nextCycleStart;
      } else {
        const bounds = getLiveBillingCycleBoundsUb(null, new Date());
        monthStart = bounds.monthStart;
        nextCycleStart = bounds.nextCycleStart;
      }
    }

    let checkBarilgiinId = geree.barilgiinId;
    if (
      !checkBarilgiinId &&
      baiguullaga?.barilguud &&
      baiguullaga.barilguud.length > 0
    ) {
      checkBarilgiinId = String(baiguullaga.barilguud[0]._id);
    }

    const existingInvoiceQuery = {
      gereeniiId: String(gereeId),
      $or: [
        { ognoo: { $gte: monthStart, $lt: nextCycleStart } },
        {
          $and: [
            { $or: [{ ognoo: { $exists: false } }, { ognoo: null }] },
            { createdAt: { $gte: monthStart, $lt: nextCycleStart } },
          ],
        },
      ],
    };
    if (checkBarilgiinId) {
      existingInvoiceQuery.barilgiinId = String(checkBarilgiinId);
    }

    const allExistingInvoices = await nekhemjlekhiinTuukh(
      tukhainBaaziinKholbolt,
    )
      .find(existingInvoiceQuery)
      .sort({ createdAt: 1 });

    const invoicesToUpdate = allExistingInvoices;

    if (override) {
      for (const invoice of allExistingInvoices) {
        await nekhemjlekhiinTuukh(tukhainBaaziinKholbolt).deleteOne({
          _id: invoice._id,
        });
      }
    } else if (invoicesToUpdate.length > 0) {
      const invoiceToSync = invoicesToUpdate[0];

      const hasPayments = invoiceHasPayments(invoiceToSync);

      const previewResult = await previewInvoice(
        gereeId,
        baiguullagiinId,
        null,
        targetMonth,
        targetYear,
      );

      if (previewResult.success) {
        const previewZardluud = previewResult.preview.zardluud || [];
        const newZardluudOnly = previewZardluud.filter(
          isZardalExcludingEkhniiUldegdel,
        );

        // Merge in electricity entries from old invoice that might be missing from preview
        const oldZardluud = invoiceToSync.medeelel?.zardluud || [];
        const oldElectricity = oldZardluud.filter((z) =>
          z.ner?.toLowerCase().includes("цахилгаан"),
        );

        oldElectricity.forEach((oldZ) => {
          const exists = newZardluudOnly.find((newZ) => newZ.ner === oldZ.ner);
          if (!exists) {
            newZardluudOnly.push({ ...oldZ });
          }
        });

        // ── ZaaltUnshlalt lookup ──────────────────────────────────────────
        // Always resolve the latest electricity reading for this contract so
        // that re-importing March (or any month) data forces the invoice to
        // update with the new amount rather than being silently skipped.
        let zaaltReadingApplied = false;
        try {
          const ZaaltUnshlalt = require("../models/zaaltUnshlalt");
          const latestReading = await ZaaltUnshlalt(tukhainBaaziinKholbolt)
            .findOne({
              $or: [
                { gereeniiId: String(gereeId) },
                { gereeniiDugaar: geree.gereeniiDugaar },
              ],
            })
            .sort({ importOgnoo: -1, unshlaltiinOgnoo: -1, createdAt: -1 })
            .lean();

          if (latestReading) {
            // Resolve effective zaaltDun: use stored value OR compute from raw fields
            let effectiveZaaltDun = latestReading.zaaltDun || 0;
            const zoruu =
              latestReading.zaaltCalculation?.zoruu || latestReading.zoruu || 0;
            const readingTariff =
              latestReading.zaaltCalculation?.tariff ||
              latestReading.tariff ||
              0;
            const defaultDun =
              latestReading.zaaltCalculation?.defaultDun ||
              latestReading.defaultDun ||
              0;
            if (effectiveZaaltDun === 0 && (zoruu > 0 || defaultDun > 0)) {
              effectiveZaaltDun = zoruu * readingTariff + defaultDun;
            }
            // Fall back to suuriKhuraamj (base fee) if still zero
            if (effectiveZaaltDun === 0 && latestReading.suuriKhuraamj > 0) {
              effectiveZaaltDun = latestReading.suuriKhuraamj;
            }

            if (effectiveZaaltDun > 0) {
              // Find the variable electricity entry in newZardluudOnly
              // (name contains цахилгаан but NOT дундын/өмчлөл)
              const elecIdx = newZardluudOnly.findIndex((z) => {
                const n = (z.ner || "").toLowerCase();
                return (
                  n.includes("цахилгаан") &&
                  !n.includes("дундын") &&
                  !n.includes("өмчлөл")
                );
              });

              if (elecIdx >= 0) {
                // Always update from the latest reading — no threshold check
                newZardluudOnly[elecIdx] = {
                  ...newZardluudOnly[elecIdx],
                  dun: effectiveZaaltDun,
                  tariff: effectiveZaaltDun,
                  tariffUsgeer: "₮",
                  zaalt: true,
                  zoruu: zoruu,
                  zaaltDefaultDun: defaultDun,
                  zaaltTariff: readingTariff,
                  umnukhZaalt: latestReading.umnukhZaalt || 0,
                  suuliinZaalt: latestReading.suuliinZaalt || 0,
                };
                zaaltReadingApplied = true;
              } else {
                // No electricity entry yet — add one
                newZardluudOnly.push({
                  ner: latestReading.zaaltZardliinNer || "Цахилгаан",
                  turul: "Тогтмол",
                  zardliinTurul:
                    latestReading.zaaltZardliinTurul || "Эрчим хүч",
                  barilgiinId: geree.barilgiinId || "",
                  tariff: effectiveZaaltDun,
                  tariffUsgeer: "₮",
                  dun: effectiveZaaltDun,
                  zaalt: true,
                  zoruu: zoruu,
                  zaaltDefaultDun: defaultDun,
                  zaaltTariff: readingTariff,
                  umnukhZaalt: latestReading.umnukhZaalt || 0,
                  suuliinZaalt: latestReading.suuliinZaalt || 0,
                  bodokhArga: "тогтмол",
                  nuatNemekhEsekh: false,
                  ognoonuud: [],
                });
                zaaltReadingApplied = true;
              }
            }
          }
        } catch (_zaaltErr) {
          // ZaaltUnshlalt lookup failed — continue with existing amounts
        }
        // ─────────────────────────────────────────────────────────────────

        const zardluudOnlyTotal = sumZardalDun(newZardluudOnly);
        const oldZardluudOnly = oldZardluud.filter(
          isZardalExcludingEkhniiUldegdel,
        );
        const oldZardluudOnlyTotal = sumZardalDun(oldZardluudOnly);

        const newZardluudCount = newZardluudOnly.length;
        const oldZardluudCount = oldZardluudOnly.length;

        // If zardluud amounts are effectively equal AND item counts match AND
        // no new ZaaltUnshlalt reading was applied, skip update entirely
        if (
          !zaaltReadingApplied &&
          Math.abs(zardluudOnlyTotal - oldZardluudOnlyTotal) < 0.5 &&
          newZardluudCount === oldZardluudCount
        ) {
          await deleteDuplicateUnsentInvoices(
            invoicesToUpdate,
            tukhainBaaziinKholbolt,
          );
          return {
            success: true,
            message: "Нэхэмжлэх хэвийн байна. Өөрчлөлт ороогүй.",
            skipped: true,
            nekhemjlekh: invoiceToSync,
            gereeniiId: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            tulbur:
              invoiceToSync.niitTulburOriginal || invoiceToSync.niitTulbur,
          };
        }

        // Safety guard: if preview returned 0 non-ekhnii zardluud but old invoice
        // had some, the building config may be out of sync — preserve old zardluud
        // to avoid accidentally wiping invoice line items.
        if (newZardluudCount === 0 && oldZardluudCount > 0) {
          await deleteDuplicateUnsentInvoices(
            invoicesToUpdate,
            tukhainBaaziinKholbolt,
          );
          return {
            success: true,
            message: "Нэхэмжлэх хэвийн байна. Өөрчлөлт ороогүй.",
            skipped: true,
            nekhemjlekh: invoiceToSync,
            gereeniiId: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            tulbur:
              invoiceToSync.niitTulburOriginal || invoiceToSync.niitTulbur,
          };
        }

        // Update in place:
        // - refresh non-ekhnii zardluud from preview
        // - preserve existing ekhniiUldegdel lines (Excel/manual opening balance)
        const preservedEkhniiZardluud = oldZardluud
          .filter((z) => isEkhniiUldegdelEntry(z) && (z.dun > 0 || z.tariff > 0))
          .map((z) => ({ ...z }));
        const updatedZardluud = [...preservedEkhniiZardluud, ...newZardluudOnly];
        // CRITICAL: Always recalculate niitTulburOriginal from the ACTUAL zardluud
        // sum — never from the stale stored value. This fixes the case where
        // electricity was added to medeelel.zardluud after the original save
        // but niitTulburOriginal was never updated to include it.
        const calculatedOriginalTotal =
          Math.round(
            updatedZardluud.reduce(
              (sum, z) => sum + Number(z.dun || z.tariff || 0),
              0,
            ) * 100,
          ) / 100;

        const newNiitTulbur = calculatedOriginalTotal;

        invoiceToSync.medeelel = {
          ...toPlainObject(invoiceToSync.medeelel),
          zardluud: updatedZardluud,
        };
        invoiceToSync.niitTulburOriginal = calculatedOriginalTotal;

        // Recalculate uldegdel: niitTulburOriginal minus net payments
        const netPaid =
          Math.round(
            (invoiceToSync.paymentHistory || []).reduce(
              (sum, p) => sum + (Number(p.dun) || 0),
              0,
            ) * 100,
          ) / 100;
        const newUldegdel = Math.max(
          0,
          Math.round((calculatedOriginalTotal - netPaid) * 100) / 100,
        );

        invoiceToSync.niitTulbur = newUldegdel;
        invoiceToSync.uldegdel = newUldegdel;
        invoiceToSync.tuluv = newUldegdel <= 0.01 ? "Төлсөн" : "Төлөөгүй";
        // Flag to skip the pre-save hook from overriding tuluv/uldegdel
        invoiceToSync._skipTuluvRecalc = true;

        // Update zaalt metadata for electricity entry (with or without zaalt flag)
        const zaaltEntry = updatedZardluud.find(
          (z) =>
            z.ner?.toLowerCase().includes("цахилгаан") &&
            !z.ner?.toLowerCase().includes("дундын") &&
            !z.ner?.toLowerCase().includes("өмчлөл") &&
            (z.zaalt === true || z.dun > 0 || z.tariff > 0),
        );
        if (zaaltEntry) {
          const elecDun = zaaltEntry.dun || zaaltEntry.tariff || 0;
          if (zaaltEntry.zaalt === true) {
            invoiceToSync.medeelel = {
              ...toPlainObject(invoiceToSync.medeelel),
              zaalt: {
                ...(invoiceToSync.medeelel.zaalt || {}),
                zoruu: zaaltEntry.zoruu || 0,
                zaaltDun: elecDun,
              },
            };
          }
          invoiceToSync.tsahilgaanNekhemjlekh =
            elecDun || invoiceToSync.tsahilgaanNekhemjlekh;
        }

        // Mark medeelel as modified to ensure Mongoose saves the changes
        invoiceToSync.markModified("medeelel");

        await invoiceToSync.save();

        // Trigger a full balance recalculation so geree.globalUldegdel stays in sync
        try {
          const {
          const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

        } catch (_recalcErr) {
          // Recalc failed — invoice itself was already saved correctly
        }

        await deleteDuplicateUnsentInvoices(
          invoicesToUpdate,
          tukhainBaaziinKholbolt,
        );

        // Send socket notification so home header refreshes balance
        if (app && geree.orshinSuugchId) {
          try {
            const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
            if (kholbolt) {
              const medegdel = new Medegdel(kholbolt)();
              medegdel.orshinSuugchId = geree.orshinSuugchId;
              medegdel.baiguullagiinId = baiguullagiinId;
              medegdel.barilgiinId = geree.barilgiinId || "";
              medegdel.title = "Шинэ авлага нэмэгдлээ";
              medegdel.message = `Гэрээний дугаар: ${geree.gereeniiDugaar || "N/A"}, Нийт төлбөр: ${calculatedOriginalTotal}₮`;
              medegdel.kharsanEsekh = false;
              medegdel.turul = "мэдэгдэл";
              medegdel.ognoo = new Date();
              await medegdel.save();
              const io = app.get("socketio");
              if (io)
                io.emit(
                  "orshinSuugch" + geree.orshinSuugchId,
                  toPlainObject(medegdel),
                );
            }
          } catch (notifErr) {
            // Error sending socket notification - silently continue
          }
        }

        return {
          success: true,
          nekhemjlekh: invoiceToSync,
          gereeniiId: geree._id,
          gereeniiDugaar: geree.gereeniiDugaar,
          tulbur: calculatedOriginalTotal,
          alreadyExists: true,
          updated: true,
          preservedPayments: hasPayments,
        };
      }

      // If preview failed, just return the existing invoice without changes
      return {
        success: true,
        nekhemjlekh: invoiceToSync,
        gereeniiId: geree._id,
        gereeniiDugaar: geree.gereeniiDugaar,
        tulbur: invoiceToSync.niitTulbur,
        alreadyExists: true,
      };
    }

    // includeEkhniiUldegdel = false: manual send must not add ekhniiUldegdel (Excel/TransactionModal only)
    // Last day of selected calendar month so historical billing uses the same cycle as duplicate lookup
    const billingRef =
      targetMonth !== null &&
      targetYear !== null &&
      !Number.isNaN(Number(targetMonth)) &&
      !Number.isNaN(Number(targetYear))
        ? new Date(Number(targetYear), Number(targetMonth), 0)
        : null;
    const result = await gereeNeesNekhemjlekhUusgekh(
      geree,
      baiguullaga,
      tukhainBaaziinKholbolt,
      "manual",
      false, // includeEkhniiUldegdel = false on manual send
      null,
      billingRef,
    );

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const manualSendMassInvoices = async (
  baiguullagiinId,
  barilgiinId = null,
  override = false,
  targetMonth = null,
  targetYear = null,
  app = null,
) => {
  try {
    const tukhainBaaziinKholbolt =
      getKholboltByBaiguullagiinId(baiguullagiinId);

    if (!tukhainBaaziinKholbolt) {
      return { success: false, error: "Холболтын мэдээлэл олдсонгүй!" };
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
      .findById(baiguullagiinId)
      .lean();
    if (!baiguullaga) {
      return { success: false, error: "Байгууллага олдсонгүй!" };
    }

    const gereeQuery = {
      baiguullagiinId: String(baiguullagiinId),
      tuluv: "Идэвхтэй",
    };

    if (barilgiinId) {
      gereeQuery.barilgiinId = String(barilgiinId);
    }

    const gerees = await Geree(tukhainBaaziinKholbolt).find(gereeQuery).lean();

    const results = {
      success: true,
      total: gerees.length,
      /** New nekhemjlekh documents inserted (same as newInvoices). */
      created: 0,
      succeeded: 0,
      newInvoices: 0,
      updatedExisting: 0,
      unchangedExisting: 0,
      errors: 0,
      invoices: [],
      errorsList: [],
    };

    for (let i = 0; i < gerees.length; i++) {
      const geree = gerees[i];
      try {
        const invoiceResult = await manualSendInvoice(
          geree._id,
          baiguullagiinId,
          override,
          targetMonth,
          targetYear,
          app,
        );

        if (invoiceResult.success) {
          results.succeeded++;
          const outcome = classifyManualInvoiceOutcome(invoiceResult);
          if (outcome === "new") {
            results.newInvoices++;
            results.created++;
          } else if (outcome === "updated") results.updatedExisting++;
          else if (outcome === "unchanged") results.unchangedExisting++;
          results.invoices.push({
            gereeniiDugaar: geree.gereeniiDugaar,
            nekhemjlekhiinId:
              invoiceResult.nekhemjlekh?._id || invoiceResult.nekhemjlekh,
            tulbur: invoiceResult.tulbur,
            action: outcome,
          });
        } else {
          results.errors++;
          results.errorsList.push({
            gereeniiDugaar: geree.gereeniiDugaar,
            error: invoiceResult.error || "Unknown error",
          });
        }
      } catch (error) {
        results.errors++;
        results.errorsList.push({
          gereeniiDugaar: geree.gereeniiDugaar,
          error: error.message || "Unknown error",
        });
      }
    }

    return results;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Manual send invoices for selected/checked contracts
// Accepts array of gereeIds (can be one or many)
const manualSendSelectedInvoices = async (
  gereeIds,
  baiguullagiinId,
  override = false,
  targetMonth = null,
  targetYear = null,
  app = null,
) => {
  try {
    if (!Array.isArray(gereeIds) || gereeIds.length === 0) {
      return {
        success: false,
        error: "gereeIds нь хоосон биш массив байх ёстой!",
      };
    }

    const tukhainBaaziinKholbolt =
      getKholboltByBaiguullagiinId(baiguullagiinId);

    if (!tukhainBaaziinKholbolt) {
      return { success: false, error: "Холболтын мэдээлэл олдсонгүй!" };
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt)
      .findById(baiguullagiinId)
      .lean();
    if (!baiguullaga) {
      return { success: false, error: "Байгууллага олдсонгүй!" };
    }

    // Fetch all selected contracts
    const gerees = await Geree(tukhainBaaziinKholbolt)
      .find({
        _id: { $in: gereeIds },
        baiguullagiinId: String(baiguullagiinId),
      })
      .lean();

    if (gerees.length === 0) {
      return { success: false, error: "Сонгосон гэрээ олдсонгүй!" };
    }

    const results = {
      success: true,
      total: gereeIds.length,
      processed: gerees.length,
      /** New nekhemjlekh documents inserted (same as newInvoices). */
      created: 0,
      succeeded: 0,
      newInvoices: 0,
      updatedExisting: 0,
      unchangedExisting: 0,
      errors: 0,
      invoices: [],
      errorsList: [],
    };

    // Process each checked contract
    for (let i = 0; i < gerees.length; i++) {
      const geree = gerees[i];
      try {
        const invoiceResult = await manualSendInvoice(
          geree._id,
          baiguullagiinId,
          override,
          targetMonth,
          targetYear,
          app,
        );

        if (invoiceResult.success) {
          results.succeeded++;
          const outcome = classifyManualInvoiceOutcome(invoiceResult);
          if (outcome === "new") {
            results.newInvoices++;
            results.created++;
          } else if (outcome === "updated") results.updatedExisting++;
          else if (outcome === "unchanged") results.unchangedExisting++;
          results.invoices.push({
            gereeniiId: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            nekhemjlekhiinId:
              invoiceResult.nekhemjlekh?._id || invoiceResult.nekhemjlekh,
            tulbur: invoiceResult.tulbur,
            action: outcome,
          });
        } else {
          results.errors++;
          results.errorsList.push({
            gereeniiId: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            error: invoiceResult.error || "Unknown error",
          });
        }
      } catch (error) {
        results.errors++;
        results.errorsList.push({
          gereeniiId: geree._id,
          gereeniiDugaar: geree.gereeniiDugaar,
          error: error.message || "Unknown error",
        });
      }
    }

    return results;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices,
};
