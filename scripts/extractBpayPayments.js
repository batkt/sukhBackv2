const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const walletApiService = require("../services/walletApiService");

// Parse tokhirgoo.env
const envPath = path.join(__dirname, "../tokhirgoo/tokhirgoo.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...vals] = line.split("=");
    if (key && vals.length) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  });
}

async function extractBpayPayments() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  console.log("🔌 Connecting to:", uri.replace(/:([^:@]+)@/, ":****@"));
  await mongoose.connect(uri);
  const mainDb = mongoose.connection.db;

  console.log("📊 Analyzing BPay Invoices, Payments & E-Barimt Receipts...\n");

  // 1. Fetch all wallet invoices from Main DB
  const walletInvoices = await mainDb.collection("walletInvoice").find({}).sort({ createdAt: -1 }).toArray();

  // 2. Fetch all tenant DBs and build ebarimt & qpay lookup maps
  const adminDb = mainDb.admin();
  const dbsInfo = await adminDb.listDatabases();
  const excluded = ["admin", "config", "local"];
  const tenantDbs = dbsInfo.databases.filter((d) => !excluded.includes(d.name));

  const qpayObjectsMap = new Map();
  const ebarimtMap = new Map(); // key: nekhemjlekhiinId / id / receiptId -> ebarimt
  const allPaidQpayList = [];

  for (const dbInfo of tenantDbs) {
    const tDb = mongoose.connection.useDb(dbInfo.name).db;

    // Load QPay objects
    const collections = await tDb.listCollections().toArray();
    const qpayCollName = collections.find((c) => c.name.toLowerCase().includes("quickqpay") || c.name.toLowerCase() === "qpay")?.name;

    if (qpayCollName) {
      const qpayDocs = await tDb.collection(qpayCollName).find({}).toArray();
      for (const q of qpayDocs) {
        q._dbName = dbInfo.name;
        if (q.walletPaymentId) qpayObjectsMap.set(String(q.walletPaymentId), q);
        if (q.zakhialgiinDugaar) qpayObjectsMap.set(String(q.zakhialgiinDugaar), q);
        if (q.invoice_id) qpayObjectsMap.set(String(q.invoice_id), q);
        if (q.qpay_payment_id) qpayObjectsMap.set(String(q.qpay_payment_id), q);

        const isPaid =
          q.tulsunEsekh === true ||
          q.status === "PAID" ||
          q.invoice_status === "PAID" ||
          (Array.isArray(q.payments) && q.payments.some((p) => p.payment_status === "PAID" || p.status === "PAID")) ||
          (q.qpay && Array.isArray(q.qpay.payments) && q.qpay.payments.some((p) => p.payment_status === "PAID"));

        if (isPaid && (q.walletPaymentId || q.source === "WALLET_API" || q.source === "WALLET_QPAY" || q.billingId)) {
          allPaidQpayList.push(q);
        }
      }
    }

    // Load Ebarimts
    const ebarimtCollName = collections.find((c) => c.name.toLowerCase().includes("ebarimt"))?.name;
    if (ebarimtCollName) {
      const ebDocs = await tDb.collection(ebarimtCollName).find({}).toArray();
      for (const eb of ebDocs) {
        if (eb.nekhemjlekhiinId) ebarimtMap.set(String(eb.nekhemjlekhiinId), eb);
        if (eb.receiptId) ebarimtMap.set(String(eb.receiptId), eb);
        if (eb.id) ebarimtMap.set(String(eb.id), eb);
      }
    }
  }

  // 3. Process each invoice
  const paidInvoices = [];
  const unpaidInvoices = [];

  for (const inv of walletInvoices) {
    let matchedQpay = null;
    if (inv.walletPaymentId && qpayObjectsMap.has(String(inv.walletPaymentId))) {
      matchedQpay = qpayObjectsMap.get(String(inv.walletPaymentId));
    } else if (inv.zakhialgiinDugaar && qpayObjectsMap.has(String(inv.zakhialgiinDugaar))) {
      matchedQpay = qpayObjectsMap.get(String(inv.zakhialgiinDugaar));
    } else if (inv.walletInvoiceId && qpayObjectsMap.has(String(inv.walletInvoiceId))) {
      matchedQpay = qpayObjectsMap.get(String(inv.walletInvoiceId));
    }

    const isPaid =
      matchedQpay &&
      (matchedQpay.tulsunEsekh === true ||
        matchedQpay.status === "PAID" ||
        matchedQpay.invoice_status === "PAID" ||
        (Array.isArray(matchedQpay.payments) && matchedQpay.payments.some((p) => p.payment_status === "PAID")) ||
        (matchedQpay.qpay && Array.isArray(matchedQpay.qpay.payments) && matchedQpay.qpay.payments.some((p) => p.payment_status === "PAID")));

    const matchedEbarimt =
      (inv.walletPaymentId && ebarimtMap.get(String(inv.walletPaymentId))) ||
      (matchedQpay && matchedQpay.walletPaymentId && ebarimtMap.get(String(matchedQpay.walletPaymentId))) ||
      null;

    const item = {
      userId: inv.userId,
      customerName: inv.customerName || "-",
      billingName: inv.billingName || "-",
      amount: inv.totalAmount || (matchedQpay && (matchedQpay.dun || matchedQpay.amount || matchedQpay.qpay?.amount)) || 0,
      createdAt: inv.createdAt,
      paidAt: matchedQpay?.updatedAt || matchedQpay?.tulsunOgnoo || inv.updatedAt || inv.createdAt,
      walletPaymentId: inv.walletPaymentId,
      zakhialgiinDugaar: inv.zakhialgiinDugaar,
      qpayId: matchedQpay?._id,
      qpayStatus: matchedQpay?.tulsunEsekh ? "PAID" : matchedQpay?.invoice_status || "PENDING",
      matchedQpay,
      ebarimt: matchedEbarimt,
    };

    if (isPaid) {
      paidInvoices.push(item);
    } else {
      unpaidInvoices.push(item);
    }
  }

  // Also include any orphan paid QPay records
  for (const q of allPaidQpayList) {
    const alreadyFound = paidInvoices.some(
      (p) => String(p.qpayId) === String(q._id) || (q.walletPaymentId && p.walletPaymentId === q.walletPaymentId)
    );
    if (!alreadyFound) {
      const matchedEbarimt = q.walletPaymentId ? ebarimtMap.get(String(q.walletPaymentId)) : null;
      paidInvoices.push({
        userId: q.utas || q.userId || q.orshinSuugchId || "-",
        customerName: q.ner || q.customerName || "-",
        billingName: q.tailbar || q.bairniiNer || "-",
        amount: q.dun || q.amount || q.qpay?.amount || 0,
        createdAt: q.createdAt,
        paidAt: q.updatedAt || q.tulsunOgnoo,
        walletPaymentId: q.walletPaymentId,
        zakhialgiinDugaar: q.zakhialgiinDugaar,
        qpayId: q._id,
        qpayStatus: "PAID",
        matchedQpay: q,
        ebarimt: matchedEbarimt,
      });
    }
  }

  // Attempt to enrich with Wallet API live VAT data if available
  console.log(`⏳ Live checking VAT/eBarimt status for ${paidInvoices.length} paid invoices from Wallet API...`);
  for (const p of paidInvoices) {
    if (!p.ebarimt?.lottery && p.walletPaymentId && p.userId && p.userId !== "-") {
      try {
        const liveWallet = await walletApiService.getPayment(p.userId, p.walletPaymentId);
        if (liveWallet?.vatInformation) {
          p.liveVat = liveWallet.vatInformation;
        }
      } catch (e) {}
    }
  }

  const totalPaidAmount = paidInvoices.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalUnpaidAmount = unpaidInvoices.reduce((sum, p) => sum + (p.amount || 0), 0);
  const withEbarimtCount = paidInvoices.filter((p) => p.ebarimt?.lottery || p.liveVat?.vatLotteryNo || p.liveVat?.vatDdtd).length;

  console.log("\n========================================================");
  console.log("💰 [1] ТӨЛБӨРИЙН ЕРӨНХИЙ НЭГТГЭЛ:");
  console.log(`• Нийт үүссэн BPay нэхэмжлэх: ${walletInvoices.length}`);
  console.log(`• ✅ БОДИТОЙ ТӨЛӨГДСӨН ГҮЙЛГЭЭ: ${paidInvoices.length} ширхэг (Нийт дүн: ${totalPaidAmount.toLocaleString()} ₮)`);
  console.log(`• 🧾 И-БАРИМТ АВСАН / БҮРТГЭГДСЭН: ${withEbarimtCount} ширхэг`);
  console.log(`• ⏳ ТӨЛӨГДӨӨГҮЙ (PENDING): ${unpaidInvoices.length} ширхэг (Нийт дүн: ${totalUnpaidAmount.toLocaleString()} ₮)`);

  console.log("\n========================================================");
  console.log("📋 [2] BPAY-ЭЭР АМЖИЛТТАЙ ТӨЛӨГДСӨН БҮХ ГҮЙЛГЭЭНИЙ ДЭЛГЭРЭНГҮЙ:");
  paidInvoices.forEach((p, idx) => {
    const lottery = p.ebarimt?.lottery || p.liveVat?.vatLotteryNo || "-";
    const ddtd = p.ebarimt?.id || p.liveVat?.vatDdtd || "-";
    const dateStr = p.paidAt ? new Date(p.paidAt).toLocaleString("mn-MN") : "-";
    console.log(
      `[${idx + 1}] Утас: ${p.userId} | Нэр: ${p.customerName} | Дүн: ${(p.amount || 0).toLocaleString()} ₮ | Огноо: ${dateStr} | Сугалаа: ${lottery} | ДДТД: ${ddtd}`
    );
  });

  console.log("========================================================\n");

  await mongoose.disconnect();
}

extractBpayPayments().catch(console.error);
