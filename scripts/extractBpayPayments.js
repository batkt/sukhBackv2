const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

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

  console.log("📊 Analyzing BPay Invoices, QPay settlements & eBarimts...\n");

  // 1. Fetch all wallet invoices from Main DB
  const walletInvoices = await mainDb.collection("walletInvoice").find({}).sort({ createdAt: -1 }).toArray();
  console.log(`🔎 Нийт шалгах Wallet/BPay нэхэмжлэлийн тоо: ${walletInvoices.length}`);

  // 2. Collect all tenant databases
  const adminDb = mainDb.admin();
  const dbsInfo = await adminDb.listDatabases();
  const excluded = ["admin", "config", "local"];
  const tenantDbs = dbsInfo.databases.filter((d) => !excluded.includes(d.name));

  // Build a lookup map of all QPay objects across all tenant databases
  const qpayObjectsMap = new Map(); // key: walletPaymentId / zakhialgiinDugaar / invoice_id -> object
  const allPaidQpayList = [];

  for (const dbInfo of tenantDbs) {
    const tDb = mongoose.connection.useDb(dbInfo.name).db;

    // Check quickqpayobjects or quickQpayObject or qpay
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
  }

  // 3. Match walletInvoices with QPay objects & check payment status
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

    const item = {
      userId: inv.userId,
      customerName: inv.customerName || "-",
      billingName: inv.billingName || "-",
      amount: inv.totalAmount || (matchedQpay && (matchedQpay.dun || matchedQpay.amount || matchedQpay.qpay?.amount)) || 0,
      createdAt: inv.createdAt,
      paidAt: matchedQpay?.updatedAt || matchedQpay?.tulsunOgnoo,
      walletPaymentId: inv.walletPaymentId,
      zakhialgiinDugaar: inv.zakhialgiinDugaar,
      qpayId: matchedQpay?._id,
      qpayStatus: matchedQpay?.tulsunEsekh ? "PAID" : matchedQpay?.invoice_status || "PENDING",
      matchedQpay,
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
      });
    }
  }

  // Check eBarimt details for paid invoices
  const totalPaidAmount = paidInvoices.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalUnpaidAmount = unpaidInvoices.reduce((sum, p) => sum + (p.amount || 0), 0);

  console.log("========================================================");
  console.log("💰 [1] ТӨЛБӨРИЙН ЕРӨНХИЙ НЭГТГЭЛ:");
  console.log(`• Нийт үүссэн BPay нэхэмжлэх: ${walletInvoices.length}`);
  console.log(`• ✅ БОДИТОЙ ТӨЛӨГДСӨН: ${paidInvoices.length} ширхэг (Нийт дүн: ${totalPaidAmount.toLocaleString()} ₮)`);
  console.log(`• ⏳ ТӨЛӨГДӨӨГҮЙ (PENDING): ${unpaidInvoices.length} ширхэг (Нийт дүн: ${totalUnpaidAmount.toLocaleString()} ₮)`);

  if (paidInvoices.length > 0) {
    console.log("\n========================================================");
    console.log("✅ [2] BPAY-ЭЭР АМЖИЛТТАЙ ТӨЛСӨН ХЭРЭГЛЭГЧДИЙН ДЭЛГЭРЭНГҮЙ:");
    paidInvoices.forEach((p, idx) => {
      const qp = p.matchedQpay;
      const lottery = qp?.lottery || qp?.ebarimt?.lottery || qp?.qpay?.lottery || "-";
      const qr = qp?.qrData || qp?.ebarimt?.qrData ? "Тийм" : "Үгүй";
      console.log(
        `[${idx + 1}] Утас/Хэрэглэгч: ${p.userId} | Нэр: ${p.customerName} | Дүн: ${(p.amount || 0).toLocaleString()} ₮ | Огноо: ${p.paidAt ? new Date(p.paidAt).toLocaleString("mn-MN") : "-"} | Сугалаа: ${lottery} | Баримт гарсан: ${qr}`
      );
    });
  } else {
    console.log("\n⚠️ Одоогоор бүртгэгдсэн 93 нэхэмжлэл нь үүссэн боловч QPay банкны гүйлгээгээр эцсийн төлөлт нь гүйцэтгэгдээгүй (хэрэглэгч QR код хараад төлөлгүй орхисон эсвэл тест хийсэн) байна.");
  }

  console.log("========================================================\n");

  await mongoose.disconnect();
}

extractBpayPayments().catch(console.error);
