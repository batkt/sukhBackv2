/**
 * History Ledger service: builds ledger rows for one contract and computes
 * backend running balance (uldegdel) for the History modal.
 *
 * GET /geree/:gereeniiId/history-ledger?baiguullagiinId=...&barilgiinId=...
 * Returns { jagsaalt: LedgerRow[] } with uldegdel = contract-wide running balance after each row.
 * Rows from invoices also include invoiceUldegdel, nekhemjlekhiinDugaar, nekhemjlekhiinTuluv (per nekhemjlekhiin doc).
 */

const { db } = require("zevbackv2");
const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const Geree = require("../models/geree");
const GereeniiTulsunAvlaga = require("../models/gereeniiTulsunAvlaga");
const GereeniiTulukhAvlaga = require("../models/gereeniiTulukhAvlaga");

/**
 * @param {Date|string|null} d
 * @returns {string}
 */
function toOgnooString(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Same notion of “Эхний үлдэгдэл” line as nekhemjlekhiinTuukh / invoiceSendService. */
function isEkhniiUldegdelZardalLine(z) {
  return (
    !!z &&
    (z.isEkhniiUldegdel === true ||
      z.ner === "Эхний үлдэгдэл" ||
      (typeof z.ner === "string" && z.ner.includes("Эхний үлдэгдэл")))
  );
}

function zardalLineChargeAmount(z) {
  const t = typeof z.tulukhDun === "number" ? z.tulukhDun : null;
  const d = z.dun != null ? Number(z.dun) : null;
  const tariff = z.tariff != null ? Number(z.tariff) : 0;
  return t != null && t > 0 ? t : d != null && d > 0 ? d : tariff;
}

/** True if some invoice already lists opening balance as a zardal row (avoid double with tulukh avlaga / geree). */
function invoicesAlreadyShowEkhniiOpening(invoices) {
  for (const inv of invoices || []) {
    const zardluud = inv.medeelel?.zardluud || [];
    for (const z of zardluud) {
      if (!isEkhniiUldegdelZardalLine(z)) continue;
      if (zardalLineChargeAmount(z) > 0.01) return true;
    }
  }
  return false;
}

function tulukhAvlagaIsEkhniiDuplicate(s) {
  if (s.ekhniiUldegdelEsekh) return true;
  const n = typeof s.zardliinNer === "string" ? s.zardliinNer : "";
  const t = typeof s.tailbar === "string" ? s.tailbar : "";
  return n.includes("Эхний үлдэгдэл") || t.includes("Эхний үлдэгдэл");
}

/**
 *
 * @param {Object} options
 * @param {string} options.gereeniiId - Contract ID
 * @param {string} options.baiguullagiinId - Organization ID
 * @param {string|null} [options.barilgiinId] - Optional building ID filter
 * @returns {Promise<{ jagsaalt: Array<LedgerRow> }>}
 */
async function getHistoryLedger(options) {
  const { gereeniiId, baiguullagiinId, barilgiinId } = options;

  if (!baiguullagiinId || !gereeniiId) {
    throw new Error("baiguullagiinId and gereeniiId are required");
  }

  const kholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
  );
  if (!kholbolt) {
    throw new Error(`Холболт олдсонгүй: ${baiguullagiinId}`);
  }

  const NekhemjlekhiinTuukhModel = nekhemjlekhiinTuukh(kholbolt);
  const GereeniiTulsunAvlagaModel = GereeniiTulsunAvlaga(kholbolt);
  const GereeniiTulukhAvlagaModel = GereeniiTulukhAvlaga(kholbolt);

  const gid = String(gereeniiId);
  const invoiceQuery = {
    baiguullagiinId: String(baiguullagiinId),
    gereeniiId: gid,
  };
  const tulukhQuery = {
    baiguullagiinId: String(baiguullagiinId),
    gereeniiId: gid,
  };
  const tulsunQuery = {
    baiguullagiinId: String(baiguullagiinId),
    gereeniiId: gid,
  };
  if (barilgiinId) {
    invoiceQuery.barilgiinId = String(barilgiinId);
    tulukhQuery.barilgiinId = String(barilgiinId);
    tulsunQuery.barilgiinId = String(barilgiinId);
  }

  const GereeModel = Geree(kholbolt);
  const [invoices, tulukhList, tulsunList, gereeDoc] = await Promise.all([
    NekhemjlekhiinTuukhModel.find(invoiceQuery)
      .lean()
      .sort({ ognoo: 1, createdAt: 1 }),
    GereeniiTulukhAvlagaModel.find(tulukhQuery)
      .lean()
      .sort({ ognoo: 1, createdAt: 1 }),
    GereeniiTulsunAvlagaModel.find(tulsunQuery)
      .lean()
      .sort({ ognoo: 1, createdAt: 1 }),
    GereeModel.findById(gereeniiId)
      .select(
        "ekhniiUldegdel gereeniiOgnoo createdAt zardluud globalUldegdel positiveBalance burtgesenAjiltan +avlaga",
      )
      .lean(),
  ]);

  /** @type {Array<{ ognoo: Date, createdAt: Date, tulukhDun: number, tulsunDun: number, ner: string, isSystem: boolean, _id: string, ajiltan?: string, khelber?: string, tailbar?: string, burtgesenOgnoo?: string, parentInvoiceId?: string, sourceCollection: string, nekhemjlekhiinDugaar?: string, invoiceUldegdel?: number|null, nekhemjlekhiinTuluv?: string }>} */
  const rawRows = [];
  const seenInvoiceIds = new Set();
  const invGuilgeeIds = new Set();

  // 0) Geree ekhniiUldegdel (initial balance) — skip if the same opening is already on a nekhemjlekhiin line (Хуулга double)
  const skipGereeEkhniiSynthetic = invoicesAlreadyShowEkhniiOpening(invoices);
  if (
    !skipGereeEkhniiSynthetic &&
    gereeDoc &&
    typeof gereeDoc.ekhniiUldegdel === "number" &&
    gereeDoc.ekhniiUldegdel > 0
  ) {
    const gereeOgnoo =
      gereeDoc.gereeniiOgnoo || gereeDoc.createdAt || new Date(0);
    rawRows.push({
      ognoo: gereeOgnoo ? new Date(gereeOgnoo) : new Date(0),
      createdAt: gereeDoc.createdAt
        ? new Date(gereeDoc.createdAt)
        : new Date(0),
      tulukhDun: gereeDoc.ekhniiUldegdel,
      tulsunDun: 0,
      ner: "Эхний үлдэгдэл",
      isSystem: true,
      _id: `geree-ekhnii-${gid}`,
      ajiltan: "Систем",
      khelber: "Авлага",
      tailbar: "Эхний үлдэгдэл",
      burtgesenOgnoo: gereeDoc.createdAt
        ? new Date(gereeDoc.createdAt).toISOString()
        : undefined,
      agingDate: gereeOgnoo ? new Date(gereeOgnoo) : new Date(0),
      sourceCollection: "geree",
    });
  }

  // 1) Invoice charge lines (zardluud) — every line (Lift, dundiin omch, tseverlegee, etc.)
  for (const inv of invoices) {
    const invId = inv._id.toString();
    if (seenInvoiceIds.has(invId)) continue;
    seenInvoiceIds.add(invId);
    const invOgnoo = inv.ognoo || inv.nekhemjlekhiinOgnoo || inv.createdAt;
    const invCreated = inv.createdAt ? new Date(inv.createdAt) : new Date(0);
    const ajiltan = inv.maililgeesenAjiltniiNer || "";
    const burtgesenOgnoo = inv.createdAt
      ? new Date(inv.createdAt).toISOString()
      : undefined;
    const invoiceUldegdel =
      typeof inv.uldegdel === "number" && !isNaN(inv.uldegdel)
        ? Math.round(inv.uldegdel * 100) / 100
        : null;
    const nekhemjlekhiinDugaar =
      inv.nekhemjlekhiinDugaar != null ? String(inv.nekhemjlekhiinDugaar) : "";
    const nekhemjlekhiinTuluv =
      inv.tuluv != null && inv.tuluv !== "" ? String(inv.tuluv) : undefined;
    const zardluud = inv.medeelel?.zardluud || [];
    for (let i = 0; i < zardluud.length; i++) {
      const z = zardluud[i];
      const t = typeof z.tulukhDun === "number" ? z.tulukhDun : null;
      const d = z.dun != null ? Number(z.dun) : null;
      const tariff = z.tariff != null ? Number(z.tariff) : 0;
      const tulukhDun =
        t != null && t > 0 ? t : d != null && d > 0 ? d : tariff;
      const rowId = (z._id && z._id.toString()) || `inv-${invId}-z-${i}`;
      invGuilgeeIds.add(rowId);
      rawRows.push({
        ognoo: invOgnoo ? new Date(invOgnoo) : new Date(0),
        createdAt: invCreated,
        tulukhDun,
        tulsunDun: 0,
        ner: z.ner || "Нэхэмжлэх",
        isSystem: true,
        _id: rowId,
        ajiltan,
        khelber: "Нэхэмжлэх",
        tailbar: z.tailbar || z.ner || z.zardliinTurul || "",
        burtgesenOgnoo,
        parentInvoiceId: invId,
        sourceCollection: "nekhemjlekhiinTuukh",
        agingDate: invOgnoo ? new Date(invOgnoo) : new Date(0),
        ...(nekhemjlekhiinDugaar && { nekhemjlekhiinDugaar }),
        ...(invoiceUldegdel != null && { invoiceUldegdel }),
        ...(nekhemjlekhiinTuluv && { nekhemjlekhiinTuluv }),
      });
    }
    // Invoice payment lines (guilgeenuud)
    const guilgeenuud = inv.medeelel?.guilgeenuud || [];
    for (let i = 0; i < guilgeenuud.length; i++) {
      const g = guilgeenuud[i];
      const tulsunDun =
        typeof g.tulsunDun === "number"
          ? g.tulsunDun
          : g.dun != null
            ? Number(g.dun)
            : 0;
      const gOgnoo = g.ognoo || invOgnoo;
      const rowId = (g._id && g._id.toString()) || `inv-${invId}-g-${i}`;
      invGuilgeeIds.add(rowId);
      rawRows.push({
        ognoo: gOgnoo ? new Date(gOgnoo) : new Date(0),
        createdAt: invCreated,
        tulukhDun: 0,
        tulsunDun,
        ner: g.tailbar || "Төлбөр",
        isSystem: false,
        _id: rowId,
        ajiltan,
        khelber: "Төлбөр",
        tailbar: g.tailbar || "",
        burtgesenOgnoo,
        parentInvoiceId: invId,
        sourceCollection: "nekhemjlekhiinTuukh",
        agingDate: invOgnoo ? new Date(invOgnoo) : new Date(0),
        ...(nekhemjlekhiinDugaar && { nekhemjlekhiinDugaar }),
        ...(invoiceUldegdel != null && { invoiceUldegdel }),
        ...(nekhemjlekhiinTuluv && { nekhemjlekhiinTuluv }),
      });
    }
  }
  const avlagaGuilgeeById = new Map();
  const avlagaGuilgeenuud = gereeDoc?.avlaga?.guilgeenuud || [];
  for (const g of avlagaGuilgeenuud) {
    if (g && g._id != null) avlagaGuilgeeById.set(String(g._id), g);
  }

  // 2) GereeniiTulukhAvlaga (every avlaga / receivable — Эхний үлдэгдэл, Авлага, etc.)
  const skipTulukhEkhniiDuplicate = invoicesAlreadyShowEkhniiOpening(invoices);
  for (const s of tulukhList) {
    const tid = String(s._id);
    if (invGuilgeeIds.has(tid)) continue;
    const keepRealOpeningRow =
      s &&
      s.ekhniiUldegdelEsekh === true &&
      (s.source === "gar" || s.source === "excel_import");
    if (
      skipTulukhEkhniiDuplicate &&
      tulukhAvlagaIsEkhniiDuplicate(s) &&
      !keepRealOpeningRow
    ) {
      continue;
    }
    const netTulukh =
      typeof s.tulukhDun === "number" && !Number.isNaN(s.tulukhDun)
        ? s.tulukhDun
        : 0;
    const grossUndsen =
      typeof s.undsenDun === "number" && !Number.isNaN(s.undsenDun)
        ? s.undsenDun
        : 0;
    const matchedGuilgee = avlagaGuilgeeById.get(String(s._id));
    const fromGuilgeeGross =
      matchedGuilgee != null
        ? Number(matchedGuilgee.tulukhDun) ||
          Number(matchedGuilgee.dun) ||
          Number(matchedGuilgee.undsenDun) ||
          0
        : 0;
    // Display: DB gross, else embedded geree guilgee amount, else net.
    const displayTulukh =
      grossUndsen > 0.01
        ? grossUndsen
        : fromGuilgeeGross > 0.01
          ? fromGuilgeeGross
          : netTulukh;
    const ognoo = s.ognoo || s.createdAt;
    rawRows.push({
      ognoo: ognoo ? new Date(ognoo) : new Date(0),
      createdAt: s.createdAt ? new Date(s.createdAt) : new Date(0),
      tulukhDun: displayTulukh,
      tulukhDunNet: netTulukh,
      tulsunDun: 0,
      ner: s.zardliinNer || s.tailbar || "Авлага",
      isSystem: !!s.ekhniiUldegdelEsekh,
      _id: tid,
      ajiltan: s.guilgeeKhiisenAjiltniiNer || "",
      khelber: "Авлага",
      tailbar: s.tailbar || "",
      burtgesenOgnoo: s.createdAt
        ? new Date(s.createdAt).toISOString()
        : undefined,
      agingDate: ognoo ? new Date(ognoo) : new Date(0),
      sourceCollection: "gereeniiTulukhAvlaga",
    });
  }

  // 3) GereeniiTulsunAvlaga (every payment — Төлбөр, ashiglalt, tulult, QPay, etc.)
  for (const p of tulsunList) {
    const pid = String(p._id);
    if (invGuilgeeIds.has(pid)) continue;
    const tulsunDun = typeof p.tulsunDun === "number" ? p.tulsunDun : 0;
    const ognoo = p.ognoo || p.createdAt;
    rawRows.push({
      ognoo: ognoo ? new Date(ognoo) : new Date(0),
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(0),
      tulukhDun: 0,
      tulsunDun,
      ner: p.tailbar || "Төлбөр",
      isSystem: false,
      _id: pid,
      ajiltan: p.guilgeeKhiisenAjiltniiNer || p.guilgeeKhiisenAjiltniiId || "",
      khelber: p.turul || p.source || "Төлбөр",
      tailbar: p.tailbar || "",
      burtgesenOgnoo: p.createdAt
        ? new Date(p.createdAt).toISOString()
        : undefined,
      agingDate: ognoo ? new Date(ognoo) : new Date(0),
      sourceCollection: "gereeniiTulsunAvlaga",
    });
  }

  // When no other rows exist, add placeholder rows from geree.zardluud (ashiglaltiinZardluud) so the ledger is not empty (avoids white screen)
  if (
    rawRows.length === 0 &&
    gereeDoc &&
    Array.isArray(gereeDoc.zardluud) &&
    gereeDoc.zardluud.length > 0
  ) {
    const gereeOgnoo =
      gereeDoc.gereeniiOgnoo || gereeDoc.createdAt || new Date();
    const gereeCreated = gereeDoc.createdAt
      ? new Date(gereeDoc.createdAt)
      : new Date(0);
    const burtgesenOgnoo = gereeDoc.createdAt
      ? new Date(gereeDoc.createdAt).toISOString()
      : undefined;
    gereeDoc.zardluud.forEach((z, i) => {
      const tulukhDun =
        typeof z.tulukhDun === "number"
          ? z.tulukhDun
          : z.dun != null
            ? Number(z.dun)
            : z.tariff != null
              ? Number(z.tariff)
              : 0;
      rawRows.push({
        ognoo: gereeOgnoo ? new Date(gereeOgnoo) : new Date(0),
        createdAt: gereeCreated,
        tulukhDun,
        tulsunDun: 0,
        ner: z.ner || "Нэхэмжлэх",
        isSystem: true,
        _id: (z._id && z._id.toString()) || `geree-zard-${gid}-${i}`,
        ajiltan: "Систем",
        khelber: "Нэхэмжлэх",
        tailbar: z.tailbar || z.ner || "",
        burtgesenOgnoo,
        agingDate: gereeOgnoo ? new Date(gereeOgnoo) : new Date(0),
        sourceCollection: "geree",
      });
    });
  }

  // If still empty, add one zero row so frontend has at least one row (avoids plain white screen)
  if (rawRows.length === 0 && gereeDoc) {
    const gereeOgnoo =
      gereeDoc.gereeniiOgnoo || gereeDoc.createdAt || new Date();
    rawRows.push({
      ognoo: gereeOgnoo ? new Date(gereeOgnoo) : new Date(0),
      createdAt: gereeDoc.createdAt
        ? new Date(gereeDoc.createdAt)
        : new Date(0),
      tulukhDun: 0,
      tulsunDun: 0,
      ner: "Эхний үлдэгдэл",
      isSystem: true,
      _id: `geree-empty-${gid}`,
      ajiltan: "Систем",
      khelber: "Нэхэмжлэх",
      tailbar: "",
      agingDate: gereeOgnoo ? new Date(gereeOgnoo) : new Date(0),
      sourceCollection: "geree",
    });
  }

  // Helper: strip time from Date so all entries on the same calendar day compare equal
  const dayOnly = (d) => {
    const y = d.getFullYear(),
      m = d.getMonth(),
      dd = d.getDate();
    return new Date(y, m, dd).getTime();
  };
  // Source-collection priority (geree first, then invoices, then avlaga, then payments)
  const SRC_ORDER = {
    geree: 0,
    nekhemjlekhiinTuukh: 1,
    gereeniiTulukhAvlaga: 2,
    gereeniiTulsunAvlaga: 3,
  };

  rawRows.sort((a, b) => {
    const aga = dayOnly(a.agingDate);
    const agb = dayOnly(b.agingDate);
    if (aga !== agb) return aga - agb;

    const da = dayOnly(a.ognoo);
    const db = dayOnly(b.ognoo);
    if (da !== db) return da - db;

    const ca = a.createdAt.getTime();
    const cb = b.createdAt.getTime();
    if (ca !== cb) return ca - cb;

    const sa = SRC_ORDER[a.sourceCollection] ?? 99;
    const sb = SRC_ORDER[b.sourceCollection] ?? 99;
    if (sa !== sb) return sa - sb;

    const chargeFirstA =
      (a.tulukhDunNet ?? a.tulukhDun ?? 0) > 0.01 || (a.tulukhDun ?? 0) > 0.01
        ? 0
        : 1;
    const chargeFirstB =
      (b.tulukhDunNet ?? b.tulukhDun ?? 0) > 0.01 || (b.tulukhDun ?? 0) > 0.01
        ? 0
        : 1;
    if (chargeFirstA !== chargeFirstB) return chargeFirstA - chargeFirstB;

    return String(a._id).localeCompare(String(b._id));
  });
  // Display running balance (History modal): use shown row values exactly.
  // Accounting running balance (for globalUldegdel): use net charge when available.
  let runningBalance = 0;
  let accountingRunningBalance = 0;
  let jagsaalt = rawRows.map((row) => {
    const grossPart = Math.round((row.tulukhDun ?? 0) * 100) / 100;
    const netPart =
      row.tulukhDunNet != null && !Number.isNaN(row.tulukhDunNet)
        ? Math.round(Number(row.tulukhDunNet) * 100) / 100
        : null;
    const displayCharge = grossPart;
    const pay = Math.round((row.tulsunDun ?? 0) * 100) / 100;
    const accountingCharge =
      netPart != null && netPart > 0.01 ? netPart : grossPart;
    runningBalance = Math.round((runningBalance + displayCharge - pay) * 100) / 100;
    accountingRunningBalance =
      Math.round((accountingRunningBalance + accountingCharge - pay) * 100) / 100;
    return {
      _id: row._id,
      ognoo: toOgnooString(row.ognoo),
      ner: row.ner,
      tulukhDun: displayCharge,
      tulsunDun: pay,
      uldegdel: runningBalance,
      isSystem: !!row.isSystem,
      tailbar: row.tailbar ?? "",
      ...(row.ajiltan != null &&
        row.ajiltan !== "" && { ajiltan: row.ajiltan }),
      ...(row.khelber != null &&
        row.khelber !== "" && { khelber: row.khelber }),
      ...(row.burtgesenOgnoo && { burtgesenOgnoo: row.burtgesenOgnoo }),
      ...(row.parentInvoiceId && { parentInvoiceId: row.parentInvoiceId }),
      ...(row.nekhemjlekhiinDugaar && {
        nekhemjlekhiinDugaar: row.nekhemjlekhiinDugaar,
      }),
      ...(row.invoiceUldegdel != null && {
        invoiceUldegdel: row.invoiceUldegdel,
      }),
      ...(row.nekhemjlekhiinTuluv && {
        nekhemjlekhiinTuluv: row.nekhemjlekhiinTuluv,
      }),
      agingDate: toOgnooString(row.agingDate),
      sourceCollection: row.sourceCollection,
    };
  });

  // No normalization — running balance is the pure cumulative sum of each row's charge minus payment.
  // globalUldegdel from geree is returned separately for the frontend summary/total display.

  const rawGlobalUldegdel =
    gereeDoc && typeof gereeDoc.globalUldegdel === "number"
      ? gereeDoc.globalUldegdel
      : rawRows.length > 0
        ? accountingRunningBalance
        : 0;
  const globalUldegdel = Math.round(rawGlobalUldegdel * 100) / 100;
  const positiveBalance =
    gereeDoc && typeof gereeDoc.positiveBalance === "number"
      ? Math.round(gereeDoc.positiveBalance * 100) / 100
      : 0;

  return { jagsaalt, globalUldegdel, positiveBalance };
}

module.exports = {
  getHistoryLedger,
};
