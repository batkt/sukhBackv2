const mongoose = require("mongoose");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

const ROUNDING = 100;

function roundMoney(amount) {
  return Math.round((amount || 0) * ROUNDING) / ROUNDING;
}

/**
 * Get MongoDB client for starting transactions
 */
function getMongoClient(kholbolt) {
  if (!kholbolt) return null;
  return kholbolt.client || (kholbolt.kholbolt ? kholbolt.kholbolt.client : null);
}

/**
 * Record a charge (receivable) in the ledger
 *
 * `options.deferSync` — мөрийг бичээд `syncInvoicesStatus`-ыг ДУУДАХГҮЙ.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: нэхэмжлэх үүсгэхэд ~11 зардлын мөр бичигддэг ба мөр
 * бүрийн дараа тухайн гэрээний БҮХ ТҮҮХИЙГ дахин тооцдог байв. Нэг
 * нэхэмжлэх = 11 удаагийн бүрэн sync; sync бүр нь гэрээний өмнөх нэхэмжлэх
 * БҮРийг (өөрчлөлт байгаа эсэхээс үл хамааран) дахин бичдэг тул
 *
 *     11 зардал × (3 уншилт + N нэхэмжлэхийн бичилт)
 *
 * болж, N буюу гэрээний нэхэмжлэхийн тоо САР БҮР нэмэгддэг тул ачаалал нь
 * сар ирэх тусам ХУРИМТЛАГДАН өсдөг байв.
 *
 * `syncInvoicesStatus` нь бүтэн ledger-ээс дүгнэлтээ гаргадаг идемпотент
 * функц тул бүх мөрийг бичиж дуусаад НЭГ удаа дуудахад үр дүн ЯГ ижил
 * гарна — зөвхөн завсрын төлөв өөр бөгөөд түүнийг хэн ч хардаггүй.
 */
async function recordCharge(kholbolt, data, options = {}) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const amount = roundMoney(Math.abs(data.dun || 0));

  // Automatically find or CREATE a 'home' invoice if not provided
  if (!data.nekhemjlekhId && data.gereeniiId) {
    const invoiceService = require("./invoiceService");
    const activeInv = await invoiceService.ensureActiveInvoice(
      kholbolt,
      data.gereeniiId,
      { billingDate: data.ognoo ? new Date(data.ognoo) : new Date() }
    );
    if (activeInv) {
      data.nekhemjlekhId = activeInv._id.toString();
    }
  }

  // Дуудагчид `...geree` дэлгэдэг тул гэрээний createdAt/updatedAt мөрөнд
  // орж «Бүртгэсэн огноо» нь гэрээ үүссэн огноо болдог байв.
  const { createdAt: _c, updatedAt: _u, __v: _v, ...tseverData } = data;
  const charge = new GuilgeeAvlaguudModel({
    ...tseverData,
    dun: amount,
    undsenDun: amount,
    tulukhDun: amount,
    tulsunDun: 0,
    tulsunAldangi: 0,
  });

  if (options.session) {
    charge.$session(options.session);
  }

  const saved = await charge.save();

  // Багцаар бичиж байгаа дуудагч өөрөө эцэст нь нэг удаа sync хийнэ.
  if (data.gereeniiId && !options.deferSync) {
    await syncInvoicesStatus(kholbolt, data.gereeniiId).catch(err => {
      console.error("❌ [LEDGER SYNC] syncInvoicesStatus failed:", err.message);
    });
  }

  return saved;
}

/**
 * Record a single payment in the ledger
 */
async function recordPayment(kholbolt, data, options = {}) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const paidAmount = roundMoney(Math.abs(data.dun || 0));

  if (paidAmount <= 0) {
    return { success: false, error: "Invalid payment amount" };
  }

  const { session } = options;

  if (data.bankniiGuilgeeId) {
    const existing = await GuilgeeAvlaguudModel.findOne({
      bankniiGuilgeeId: data.bankniiGuilgeeId,
      baiguullagiinId: data.baiguullagiinId,
      turul: "төлөлт"
      // NOTE: Intentionally NOT filtering by nekhemjlekhId here.
      // A bank transaction ID (bankniiGuilgeeId) is globally unique per payment.
      // Two different callback paths (qpayTulye vs qpayNekhemjlekhCallback) may
      // record the same payment with different nekhemjlekhIds — this check stops that.
    }).session(session);

    if (existing) {
      console.log(`ℹ️ [LEDGER] Duplicate payment ignored (by transaction ID): ${data.bankniiGuilgeeId}`);
      return { success: true, paymentRecord: existing, alreadyExists: true };
    }
  }

  // Additional duplicate check: same invoice + same amount within last 5 minutes
  // This catches QPay duplicates where transaction ID differs between callbacks
  // Note: Different invoices with same amount are allowed (user can pay multiple invoices)
  if (data.nekhemjlekhId && paidAmount > 0) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentDuplicate = await GuilgeeAvlaguudModel.findOne({
      nekhemjlekhId: data.nekhemjlekhId,
      baiguullagiinId: data.baiguullagiinId,
      turul: "төлөлт",
      tulsunDun: paidAmount,
      ognoo: { $gte: fiveMinutesAgo }
    }).session(session);

    if (recentDuplicate) {
      console.log(`ℹ️ [LEDGER] Duplicate payment ignored (recent same invoice/amount): nekhemjlekhId=${data.nekhemjlekhId}, amount=${paidAmount}`);
      return { success: true, paymentRecord: recentDuplicate, alreadyExists: true };
    }
  }

  const paymentRecord = new GuilgeeAvlaguudModel({
    ...data,
    dun: -paidAmount,
    tulsunDun: paidAmount,
    undsenDun: 0,
    tulukhDun: 0,
    turul: "төлөлт",
  });

  if (session) {
    paymentRecord.$session(session);
  }

  await paymentRecord.save();
  console.log(`✅ [LEDGER] Payment persisted: ${paymentRecord._id}, amount=${paymentRecord.dun}`);

  // Trigger Full Sync of invoice statuses for this contract.
  // `recordPayments` нь багцаа дуусгаад өөрөө нэг удаа дуудна (deferSync).
  if (data.gereeniiId && !options.deferSync) {
    await syncInvoicesStatus(kholbolt, data.gereeniiId).catch((err) => {
      console.error("❌ [LEDGER SYNC] syncInvoicesStatus failed:", err.message);
    });
  }

  return { success: true, paymentRecord };
}

/**
 * Хөнгөлөлтийн мөрүүдийг нэхэмжлэхэд нь оноох.
 *
 * Хөнгөлөлт нь ерөнхий төлөлт биш — тухайн сарын нэхэмжлэхийг шууд
 * бууруулна. Өмнө нь FIFO-гаар хамгийн эртний нэхэмжлэхэд зарцуулагдаж,
 * 10-р сарын 13,500₮ хөнгөлөлт 8-р сарын 45,000-аас хасагддаг байв.
 * Нэхэмжлэх: nekhemjlekhId-аар → ижил хуанлийн сарын эхний нэхэмжлэх →
 * огноогоор хамгийн ойр (45 хоног дотор; мөчлөг сарын сүүлээс эхэлдэг үед).
 * Зөвхөн ижил гэрээний нэхэмжлэхээс сонгоно.
 *
 * @param ledger   гүйлгээний мөрүүд
 * @param invoices [{ _id, ognoo, gereeniiId? }] — огноогоор эрэмбэлсэн
 * @returns { invoiceCredit: Map<invId, дүн>, creditIds: Set<мөрийн _id> }
 */
function khungulultNekhemjlekhendOnooyo(ledger, invoices) {
  const sarKey = (d) => {
    const t = d ? new Date(d) : null;
    return t && !isNaN(t) ? `${t.getFullYear()}-${t.getMonth() + 1}` : "";
  };
  const khungulultEsekh = (r) =>
    (r.dun || 0) < 0 &&
    (r.source === "khungulult" || r.turul === "Хөнгөлөлт" || r.zardliinTurul === "Хөнгөлөлт");

  const invoiceCredit = new Map();
  const creditIds = new Set();
  for (const r of ledger || []) {
    if (!khungulultEsekh(r)) continue;
    const gereeniiNekhemjlekh = (invoices || []).filter(
      (i) => !i.gereeniiId || !r.gereeniiId || String(i.gereeniiId) === String(r.gereeniiId),
    );
    let invId = r.nekhemjlekhId ? String(r.nekhemjlekhId) : "";
    if (!invId || !gereeniiNekhemjlekh.some((i) => String(i._id) === invId)) {
      const sar = sarKey(r.ognoo);
      let tokhirokh = sar && gereeniiNekhemjlekh.find((i) => sarKey(i.ognoo) === sar);
      if (!tokhirokh && r.ognoo) {
        const t = new Date(r.ognoo).getTime();
        let khamgiinOir = Infinity;
        for (const i of gereeniiNekhemjlekh) {
          const zai = Math.abs(new Date(i.ognoo).getTime() - t);
          if (zai < khamgiinOir) {
            khamgiinOir = zai;
            tokhirokh = i;
          }
        }
        if (khamgiinOir > 45 * 24 * 3600 * 1000) tokhirokh = null;
      }
      invId = tokhirokh ? String(tokhirokh._id) : "";
    }
    if (!invId) continue; // тохирох нэхэмжлэхгүй бол ерөнхий төлөлтөөр
    invoiceCredit.set(invId, (invoiceCredit.get(invId) || 0) + Math.abs(r.dun || 0));
    creditIds.add(String(r._id));
  }
  return { invoiceCredit, creditIds };
}

/**
 * Synchronize all invoices for a contract based on total ledger balance (Full Sync / FIFO)
 */
async function syncInvoicesStatus(kholbolt, gereeniiId) {
  try {
    const NekhemjlekhModel = require("../models/nekhemjlekhiinTuukh")(kholbolt);
    const GuilgeeModel = require("../models/guilgeeAvlaguud")(kholbolt);



    // 1. Get all ledger entries for this contract.
    //    Нэхэмжлэхийн жагсаалтыг НЭГ УДАА л татна — өмнө нь яг ижил
    //    query хоёр удаа явдаг байв (нэг нь хөнгөлөлтөд, нэг нь FIFO-д).
    const [allLedger, invoices] = await Promise.all([
      GuilgeeModel.find({ gereeniiId: gereeniiId }).lean(),
      NekhemjlekhModel.find({ gereeniiId: gereeniiId }).sort({ ognoo: 1 }).lean(),
    ]);

    // 4a. Invoices first — хөнгөлөлтийг нэхэмжлэхэд нь шууд оноохын тулд
    const { invoiceCredit, creditIds } = khungulultNekhemjlekhendOnooyo(
      allLedger,
      invoices,
    );

    // 2. Calculate Total Paid (negative entries) — нэхэмжлэхэд оноосон хөнгөлөлтөөс бусад
    const totalPayments = allLedger
      .filter((r) => (r.dun || 0) < 0 && !creditIds.has(String(r._id)))
      .reduce((sum, r) => sum + Math.abs(r.dun || 0), 0);

    // 3. Calculate Total Charges NOT linked to any invoice (loose charges)
    const looseCharges = allLedger
      .filter((r) => (r.dun || 0) > 0 && !r.nekhemjlekhId)
      .reduce((sum, r) => sum + (r.dun || 0), 0);

    let availableFunds = totalPayments - looseCharges;

    // Ledger-ийг нэхэмжлэхээр нь НЭГ удаа бүлэглэнэ. Өмнө нь нэхэмжлэх
    // бүрийн хувьд бүх ledger-ийг дахин шүүдэг байсан тул гэрээний
    // нэхэмжлэх × ledger мөр гэсэн квадрат ажиллагаа үүсдэг байв.
    const ledgerByInvoice = new Map();
    for (const r of allLedger) {
      const key = String(r.nekhemjlekhId || "");
      if (!key) continue;
      let bulge = ledgerByInvoice.get(key);
      if (!bulge) {
        bulge = { too: 0, nemekh: 0 };
        ledgerByInvoice.set(key, bulge);
      }
      bulge.too += 1;
      if ((r.dun || 0) > 0) bulge.nemekh += r.dun || 0;
    }

    // Бичилтүүдийг цуглуулаад НЭГ bulkWrite-аар явуулна (сүлжээний
    // дамжлага нэхэмжлэх тутамд биш, нэг л удаа).
    const bichilt = [];
    const ustgakh = [];

    for (const inv of invoices) {
      // Check if there are ANY ledger items (charges or payments) linked to this invoice
      const bulge = ledgerByInvoice.get(String(inv._id));

      if (!bulge) {
        // If there are no ledger entries associated with this invoice, it is orphan/empty. Delete it.
        ustgakh.push(inv._id);
        console.log(`🗑️ [LEDGER SYNC] Deleted orphan empty invoice: ${inv._id}`);
        continue;
      }

      // Amount for this specific invoice = sum of positive dun linked to it in ledger
      const invCharge = bulge.nemekh;

      // Fallback to niitTulbur if ledger doesn't have explicit charges yet
      const chargeAmount = invCharge > 0 ? invCharge : (inv.niitTulbur || 0);
      const targetAmount = Math.max(0, chargeAmount - (invoiceCredit.get(String(inv._id)) || 0));

      const isPaid = availableFunds + 0.1 >= targetAmount;
      const newStatus = isPaid ? "Төлсөн" : "Төлөөгүй";
      const newUldegdel = isPaid ? 0 : Math.max(0, targetAmount - availableFunds);


      // Update the invoice with new status AND uldegdel.
      //
      // ӨӨРЧЛӨГДӨӨГҮЙ бол бичихгүй. Өмнө нь "тогтвортой байлгах" үүднээс
      // болзолгүй бичдэг байсан тул нэхэмжлэх үүсгэх бүрт тухайн гэрээний
      // бүх хуучин нэхэмжлэх ижил утгаараа дахин дахин бичигддэг байв.
      const updateData = {
        tuluv: newStatus,
        uldegdel: newUldegdel,
      };
      if (invCharge > 0) {
        updateData.niitTulbur = invCharge;
      }

      const uurchlugdsun =
        inv.tuluv !== newStatus ||
        roundMoney(inv.uldegdel || 0) !== roundMoney(newUldegdel) ||
        (invCharge > 0 && roundMoney(inv.niitTulbur || 0) !== roundMoney(invCharge));

      if (uurchlugdsun) {
        // `tulsunOgnoo`-г зөвхөн төлөв ӨӨРЧЛӨГДӨХ үед хөдөлгөнө — эс
        // бөгөөс sync ажиллах бүрт төлсөн огноо нь өнөөдөр болж шинэчлэгдэнэ.
        if (isPaid && inv.tuluv !== "Төлсөн") updateData.tulsunOgnoo = new Date();
        if (!isPaid) updateData.tulsunOgnoo = null;

        bichilt.push({
          updateOne: { filter: { _id: inv._id }, update: { $set: updateData } },
        });
      }

      if (isPaid) {
        availableFunds -= targetAmount;
      } else {
        availableFunds = 0;
      }
    }

    if (ustgakh.length) {
      bichilt.push({ deleteMany: { filter: { _id: { $in: ustgakh } } } });
    }
    if (bichilt.length) {
      // `ordered: false` — нэг бичилт унасан ч бусад нь үргэлжилнэ.
      await NekhemjlekhModel.bulkWrite(bichilt, { ordered: false });
    }
  } catch (err) {
    console.error("❌ [LEDGER SYNC] Error in syncInvoicesStatus:", err.message, err.stack);
  }
}

/**
 * Record multiple payments atomically within a transaction
 */
async function recordPayments(kholbolt, payments, options = {}) {
  const client = getMongoClient(kholbolt);
  if (!client) return { success: false, error: "MongoDB client not available" };

  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const results = [];
      for (const payment of payments) {
        // Доор багц дуусахад нэг удаа sync хийнэ — төлөлт бүрийн дараа
        // гэрээний бүх түүхийг дахин бичих шаардлагагүй.
        const res = await recordPayment(kholbolt, payment, {
          ...options,
          session,
          deferSync: true,
        });
        results.push(res);
      }
      result = { success: true, results };
    });

    // Sync contract after bulk update
    if (payments[0]?.gereeniiId) {
      await syncInvoicesStatus(kholbolt, payments[0].gereeniiId);
    }

    return result || { success: false, error: "Transaction failed" };
  } finally {
    await session.endSession();
  }
}

/**
 * Get balance using aggregation for accuracy
 */
async function getBalance(kholbolt, query) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const result = await GuilgeeAvlaguudModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        uldegdel: { $sum: "$dun" },
      },
    },
  ]);

  const balance = result[0]?.uldegdel || 0;
  return balance;
}

/**
 * Get detailed balance breakdown by invoice
 */
async function getBalanceByInvoice(kholbolt, query) {
  const GuilgeeAvlaguudModel = GuilgeeAvlaguud(kholbolt);
  const records = await GuilgeeAvlaguudModel.aggregate([
    { $match: { ...query, nekhemjlekhId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$nekhemjlekhId",
        undsenDun: { $sum: "$undsenDun" },
        tulsunDun: { $sum: "$tulsunDun" },
        uldegdel: { $sum: "$uldegdel" },
      },
    },
    { $match: { uldegdel: { $ne: 0 } } },
    { $sort: { _id: 1 } },
  ]);

  return records;
}

module.exports = {
  recordCharge,
  recordPayment,
  recordPayments,
  getBalance,
  getBalanceByInvoice,
  syncInvoicesStatus,
  khungulultNekhemjlekhendOnooyo,
  getMongoClient,
  roundMoney,
};
