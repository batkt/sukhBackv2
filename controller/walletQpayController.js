const asyncHandler = require("express-async-handler");
const walletApiService = require("../services/walletApiService");
const aldaa = require("../components/aldaa");
const {
  qpayGargaya,
  QuickQpayObject,
  qpayShalgay,
} = require("quickqpaypackvSukh");
const OrshinSuugch = require("../models/orshinSuugch");
const WalletInvoice = require("../models/walletInvoice");
const EbarimtShine = require("../models/ebarimtShine");
const EasyRegisterUser = require("../models/easyRegisterUser");
const jwt = require("jsonwebtoken");
const request = require("request");

/**
 * Helper: get orshinSuugch + phone from auth token
 */
const userCache = new Map();
const USER_CACHE_TTL = 10000; // 10 seconds cache for user profile

async function getOrshinSuugchFromToken(req) {
  const { db } = require("zevbackv2");
  if (!req.headers.authorization) return null;
  const token = req.headers.authorization.split(" ")[1];
  if (!token) return null;
  
  try {
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);
    if (!tokenObject?.id || tokenObject.id === "zochin") return null;
    
    // Check cache
    const cached = userCache.get(tokenObject.id);
    if (cached && (Date.now() - cached.timestamp < USER_CACHE_TTL)) {
       return cached.data;
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
      .findById(tokenObject.id)
      .lean();
    
    if (orshinSuugch) {
       userCache.set(tokenObject.id, { timestamp: Date.now(), data: orshinSuugch });
    }
    
    return orshinSuugch || null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────
//  POST /walletQpay/create
//  Same QPay flow as original, but source = WALLET_API
//
//  Body: { baiguullagiinId, barilgiinId?,
//          billingId, billIds[], vatReceiveType?,
//          dun? (override amount) }
// ──────────────────────────────────────────────────────
exports.createWalletQpayInvoice = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { Dugaarlalt } = require("zevbackv2");

  const {
    barilgiinId,
    billingId,
    billIds,
    vatReceiveType,
    dun: overrideDun,
  } = req.body;

  /* ── 0. Resilient Org ID Lookup (Body -> Query -> Profile) ── */
  let baiguullagiinId = req.body.baiguullagiinId || req.query.baiguullagiinId;
  
  // Parallelize user fetch and dugaarlalt lookup
  const [orshinSuugch] = await Promise.all([
     getOrshinSuugchFromToken(req),
  ]);

  if (!baiguullagiinId && orshinSuugch) {
    baiguullagiinId = orshinSuugch.baiguullagiinId;
    
    // Fallback: If missing at top level, check the 'toots' array (multi-unit or lite user)
    if (!baiguullagiinId && Array.isArray(orshinSuugch.toots) && orshinSuugch.toots.length > 0) {
      baiguullagiinId = orshinSuugch.toots[0].baiguullagiinId;
      if (!req.body.barilgiinId) {
        req.body.barilgiinId = orshinSuugch.toots[0].barilgiinId;
      }
    }
  }

  if (!baiguullagiinId) {
    throw new aldaa("Байгууллагын ID олдсонгүй! (baiguullagiinId заавал бөглөх шаардлагатай)");
  }

  /* ── 1. org connection ── */
  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    throw new aldaa("Байгууллагын холболт олдсонгүй!");
  }

  /* ── 2. resident / phone ── */
  const userPhone = orshinSuugch?.utas;
  if (!userPhone) {
    throw new aldaa("Хэрэглэгчийн утас олдсонгүй. Нэвтрэх шаардлагатай.");
  }

  /* ── 3. Wallet API: create invoice ── */
  let walletInvoiceId = req.body.invoiceId || req.body.walletInvoiceId || null;
  let walletInvoiceResult = null;

  if (!walletInvoiceId && billingId && Array.isArray(billIds) && billIds.length > 0) {
    const invoiceData = {
      billingId,
      billIds,
      vatReceiveType: vatReceiveType || "CITIZEN",
      vatCompanyReg: req.body.vatCompanyReg || "",
    };

    try {
      walletInvoiceResult = await walletApiService.createInvoice(userPhone, invoiceData);
      walletInvoiceId = walletInvoiceResult.invoiceId;
      console.log(`✅ [WALLET QPAY] Wallet invoice created: ${walletInvoiceId}`);

      // Save wallet invoice metadata locally (only if not already exists)
      try {
        const existing = await WalletInvoice(db.erunkhiiKholbolt).findOne({ walletInvoiceId });
        if (!existing) {
          await WalletInvoice(db.erunkhiiKholbolt).create({
            userId: userPhone,
            orshinSuugchId: orshinSuugch?._id?.toString() || null,
            walletInvoiceId,
            billingId,
            billIds: billIds || [],
            billingName: walletInvoiceResult.billingName || "",
            customerId: walletInvoiceResult.customerId || "",
            customerName: walletInvoiceResult.customerName || "",
            customerAddress: walletInvoiceResult.customerAddress || "",
            totalAmount: walletInvoiceResult.invoiceTotal || walletInvoiceResult.totalAmount || null,
            source: "WALLET_QPAY",
          });
        }
      } catch (saveErr) {
        console.error("⚠️ [WALLET QPAY] Notice: Local metadata sync skipped:", saveErr.message);
      }
    } catch (err) {
      console.error("❌ [WALLET QPAY] Wallet invoice creation failed:", err.message);

      const errMsg = (err.message || "").toLowerCase();
      // --- FALLBACK: If bills are already in another invoice ---
      if (errMsg.includes("билл өөр нэхэмжлэлээр төлөлт хийгдэж байна")) {
        console.log("🔍 [WALLET QPAY] Searching for existing pending invoice due to bill overlap...");
        try {
          // Search for a local WalletInvoice that contains at least one of these bills
          const existingInvoice = await WalletInvoice(db.erunkhiiKholbolt).findOne({
            userId: userPhone,
            billingId: billingId,
            billIds: { $in: billIds }
          }).sort({ createdAt: -1 });

          if (existingInvoice) {
            walletInvoiceId = existingInvoice.walletInvoiceId;
            console.log(`✅ [WALLET QPAY] Found existing invoice: ${walletInvoiceId}`);
          } else {
            // Fallback to any recent invoice for this billingId
            const lastInvoice = await WalletInvoice(db.erunkhiiKholbolt).findOne({
              userId: userPhone,
              billingId: billingId
            }).sort({ createdAt: -1 });
            
            if (lastInvoice) {
              walletInvoiceId = lastInvoice.walletInvoiceId;
              console.log(`✅ [WALLET QPAY] Found most recent invoice for billing: ${walletInvoiceId}`);
            }
          }
        } catch (searchErr) {
          console.error("❌ [WALLET QPAY] Failed to search for existing invoice:", searchErr.message);
        }
      }

      if (!walletInvoiceId) {
        throw new aldaa(`Wallet нэхэмжлэх үүсгэхэд алдаа: ${err.message}`);
      }
    }
  }

  if (!walletInvoiceId) {
    throw new aldaa("invoiceId эсвэл billingId+billIds заавал бөглөнө!");
  }

  /* ── 4. Wallet API: create payment ── */
  let walletPaymentResult;
  try {
    walletPaymentResult = await walletApiService.createPayment(userPhone, {
      invoiceId: walletInvoiceId,
    });
    console.log(`✅ [WALLET QPAY] Wallet payment created: ${walletPaymentResult.paymentId}`);
  } catch (err) {
    console.error("❌ [WALLET QPAY] Wallet payment creation failed:", err.message);
    
    const errMsg = (err.message || "").toLowerCase();
    // --- FALLBACK: If payment already created for this invoice, try to fetch it ---
    if (errMsg.includes("нэхэмжлэхээр төлөлт үүссэн байна")) {
       try {
          const payments = await walletApiService.getBillingPayments(userPhone, billingId);
          const existingPayment = payments.find(p => p.invoiceId === walletInvoiceId && p.paymentStatus !== 'CANCELLED');
          if (existingPayment) {
            walletPaymentResult = existingPayment;
            console.log(`✅ [WALLET QPAY] Found existing payment: ${walletPaymentResult.paymentId}`);
          }
       } catch (pErr) {}
    }

    if (!walletPaymentResult) {
      throw new aldaa(`Wallet төлбөр үүсгэхэд алдаа: ${err.message}`);
    }
  }

  const walletPaymentId = walletPaymentResult.paymentId;
  const paymentAmount = overrideDun
    ? parseFloat(overrideDun)
    : walletPaymentResult.paymentAmount || walletInvoiceResult?.invoiceTotal || 0;

  /* ── 5. QPay: create invoice (same as original flow) ── */
  // Build order number
  let maxDugaar = 1;
  try {
    const latest = await Dugaarlalt(tukhainBaaziinKholbolt)
      .find({
        baiguullagiinId,
        barilgiinId: barilgiinId || "",
        turul: "walletQpay",
      })
      .sort({ dugaar: -1 })
      .limit(1);
    if (latest.length > 0) maxDugaar = latest[0].dugaar + 1;
  } catch {
    // ignore
  }

  const zakhialgiinDugaar = req.body.zakhialgiinDugaar || `WQ-${maxDugaar}`;

  const qpayBody = {
    baiguullagiinId,
    barilgiinId: barilgiinId || "",
    dun: paymentAmount.toString(),
    tailbar: walletPaymentResult.transactionDescrion || walletPaymentResult.transactionDescription || `Wallet QPay - ${walletPaymentId}`,
    zakhialgiinDugaar,
    // Generic Mode: Pass Wallet API bank details directly
    merchant_id: "c6e38076-1791-4efc-b80c-0f8142d26d77",
    merchant_name: walletPaymentResult.receiverAccountName || "Токи ББСБ",
    custom_bank_accounts: [
      {
        account_bank_code: walletPaymentResult.receiverBankCode,
        account_number: walletPaymentResult.receiverAccountNo,
        account_name: walletPaymentResult.receiverAccountName,
      },
    ],
  };

  // Callback URL — wallet-specific callback
  const callback_url =
    process.env.UNDSEN_SERVER +
    "/walletQpay/callback/" +
    baiguullagiinId +
    "/" +
    walletPaymentId;

  let qpayResult;
  try {
    qpayResult = await qpayGargaya(qpayBody, callback_url, tukhainBaaziinKholbolt);
    
    // Check for ID in various possible formats (invoice_id, invoiceId, id)
    const resultId = qpayResult?.invoice_id || qpayResult?.invoiceId || qpayResult?.id;

    if (typeof qpayResult === "string" || !resultId) {
       const errorMsg = typeof qpayResult === "string" ? qpayResult : "QPay нэхэмжлэх үүсгэхэд алдаа гарлаа (QR дата олдсонгүй)";
       console.error("❌ [WALLET QPAY] QPay error:", errorMsg);
       if (typeof qpayResult === "object") {
         console.log("🔍 [WALLET QPAY] QPay result object:", JSON.stringify(qpayResult));
       }
       throw new Error(errorMsg);
    }
    
    console.log(`✅ [WALLET QPAY] QPay invoice created: ${resultId}`);
  } catch (qpayError) {
    console.error("❌ [WALLET QPAY] QPay invoice creation failed:", qpayError.message);
    throw new aldaa(`QPay нэхэмжлэх үүсгэхэд алдаа: ${qpayError.message}`);
  }

  /* ── 6. Save mapping locally (CRITICAL for callback) ── */
  try {
    const updateData = {
      walletPaymentId,
      userId: userPhone,
      baiguullagiinId,
      barilgiinId: barilgiinId || "",
      zakhialgiinDugaar,
      source: "WALLET_QPAY",
    };

    // If we have billing metadata from Step 3, it's already there. 
    // If not (user provided invoiceId), we at least need this mapping for callback.
    await WalletInvoice(db.erunkhiiKholbolt).findOneAndUpdate(
      { walletInvoiceId: walletInvoiceId },
      { $set: updateData },
      { upsert: true, new: true }
    );
    console.log(`✅ [WALLET QPAY] Synced mapping for callback: ${walletInvoiceId} -> ${walletPaymentId}`);
  } catch (saveErr) {
    console.warn("⚠️ [WALLET QPAY] Failed to sync mapping:", saveErr.message);
  }

  /* ── 7. Save order sequence number ── */
  try {
    const dugaarlalt = new Dugaarlalt(tukhainBaaziinKholbolt)();
    dugaarlalt.baiguullagiinId = baiguullagiinId;
    dugaarlalt.barilgiinId = barilgiinId || "";
    dugaarlalt.turul = "walletQpay";
    dugaarlalt.dugaar = maxDugaar;
    await dugaarlalt.save();
  } catch {
  }

  try {
    const qpayInvoiceId = qpayResult.invoice_id || qpayResult.invoiceId || qpayResult.id;
    // Wait briefly for the QuickQpayObject to be saved by the package
    await new Promise((r) => setTimeout(r, 500));
    await QuickQpayObject(tukhainBaaziinKholbolt).findOneAndUpdate(
      { invoice_id: qpayInvoiceId },
      {
        $set: {
          walletPaymentId,
          walletInvoiceId,
          source: "WALLET_QPAY",
        },
      },
      { new: true, strict: false }
    );
  } catch (tagErr) {
    console.error("⚠️ [WALLET QPAY] Failed to tag QuickQpayObject:", tagErr.message);
  }

  /* ── 8. Respond ── */
  res.status(200).json({
    success: true,
    source: "WALLET_QPAY",
    data: qpayResult, // QR image, qr_text, urls, etc. — same shape as original
    walletPaymentId,
    walletInvoiceId,
    paymentAmount,
  });
});

// ──────────────────────────────────────────────────────
//  GET /walletQpay/callback/:baiguullagiinId/:walletPaymentId
//  QPay calls this URL after user pays.
//  Same logic as original callback, but additionally
//  calls Wallet API paidByQpay to settle the bill.
// ──────────────────────────────────────────────────────
exports.walletQpayCallback = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, walletPaymentId } = req.params;

  console.log(`📥 [WALLET QPAY CALLBACK] baiguullagiinId=${baiguullagiinId}, walletPaymentId=${walletPaymentId}`);

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    return res.status(404).send("Organization not found");
  }

  /* ── 1. Find the QuickQpayObject tagged with this walletPaymentId ── */
  let qpayObject = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
    walletPaymentId,
    tulsunEsekh: false,
  });

  // Fallback: search by callback_url pattern
  if (!qpayObject) {
    qpayObject = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
      "qpay.callback_url": { $regex: walletPaymentId },
      tulsunEsekh: false,
    });
  }

  if (!qpayObject) {
    // Check if it's already paid (maybe callback arrived twice)
    const alreadyPaid = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
      walletPaymentId,
      tulsunEsekh: true,
    });
    if (alreadyPaid) {
      console.log("ℹ️ [WALLET QPAY CALLBACK] Already settled.");
      return res.sendStatus(200);
    }
    console.error("❌ [WALLET QPAY CALLBACK] QuickQpayObject not found for walletPaymentId:", walletPaymentId);
    return res.status(404).send("Payment not found");
  }

  /* ── 2. Settle ── */
  const io = req.app.get("socketio");
  
  // Qpay-с webhook хэлбэрээр (POST) ирж магадгүй тул req.body давхар шалгана
  const qpayPaymentIdReq = req.query?.qpay_payment_id || req.body?.qpay_payment_id || req.body?.payment_id || null;

  await settleWalletPayment(
    qpayObject,
    tukhainBaaziinKholbolt,
    baiguullagiinId,
    qpayPaymentIdReq,
    io
  );

  res.sendStatus(200);
});

// ──────────────────────────────────────────────────────
//  GET /walletQpay/check/:baiguullagiinId/:walletPaymentId
//  Frontend polls this to check if QPay payment is done
// ──────────────────────────────────────────────────────
exports.walletQpayCheck = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, walletPaymentId: searchId } = req.params;

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    throw new aldaa("Байгууллагын холболт олдсонгүй!");
  }

  // Find the QPay object tagged with this walletPaymentId OR zakhialgiinDugaar
  const qpayObject = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
    $or: [
      { walletPaymentId: searchId },
      { zakhialgiinDugaar: searchId }
    ],
  });

  let walletPaymentId = qpayObject?.walletPaymentId;

  // Fallback 1: If it looks like a walletPaymentId (UUID), use searchId directly
  const isUuid = searchId.includes("-") && searchId.length > 30;
  if (!walletPaymentId && isUuid) {
    walletPaymentId = searchId;
  }

  // Fallback 2: Search in metadata if still not found
  if (!walletPaymentId) {
    try {
      const WalletInvoice = require("../models/walletInvoice");
      const metadata = await WalletInvoice(db.erunkhiiKholbolt).findOne({
        zakhialgiinDugaar: searchId
      }).lean();
      if (metadata) {
        walletPaymentId = metadata.walletPaymentId;
      }
    } catch (e) {}
  }

  // If we still don't have an ID and no QPay object, then we truly don't know this payment
  if (!walletPaymentId && !qpayObject) {
    return res.status(404).json({ success: false, message: "Payment not found" });
  }

  // If already marked paid locally or if we are forced to check Wallet API (no local QPay object)
  if (qpayObject?.tulsunEsekh || !qpayObject) {
    let vatInformation = null;
    let paymentStatus = qpayObject?.tulsunEsekh ? "PAID" : "UNKNOWN";
    
    try {
      const WalletInvoice = require("../models/walletInvoice");
      const walletInvoiceDoc = await WalletInvoice(db.erunkhiiKholbolt)
        .findOne({ walletPaymentId })
        .lean();
      
      let userId = walletInvoiceDoc?.userId;
      if (!userId) {
         const orshinSuugch = await getOrshinSuugchFromToken(req);
         userId = orshinSuugch?.utas;
      }
      
      if (userId) {
         const pData = await walletApiService.getPayment(userId, walletPaymentId);
         vatInformation = pData?.vatInformation || null;
         if (pData?.paymentStatus === "PAID") {
            paymentStatus = "PAID";
         }
      }
    } catch (err) {
      console.warn("⚠️ [WALLET QPAY CHECK] Wallet API check failed:", err.message);
    }

    // If it's paid in Wallet API but not locally, and it belongs to a local object, we could settle it here
    if (paymentStatus === "PAID" && qpayObject && !qpayObject.tulsunEsekh) {
       const io = req.app.get("socketio");
       await settleWalletPayment(qpayObject, tukhainBaaziinKholbolt, baiguullagiinId, null, io);
    }

    if (paymentStatus === "PAID") {
      return res.json({
        success: true,
        status: "PAID",
        walletPaymentId,
        qpayPaymentId: qpayObject?.payment_id || "",
        vatInformation: vatInformation
      });
    }
  }

  // Otherwise check QPay status if we have a local record

  // Otherwise check QPay status
  if (qpayObject.invoice_id) {
    try {
      const checkResult = await qpayShalgay(
        { invoice_id: qpayObject.invoice_id },
        tukhainBaaziinKholbolt
      );
      const isPaid = checkResult?.payments?.some(
        (p) => p.payment_status === "PAID" || p.status === "PAID"
      );
      if (isPaid) {
        console.log(`✅ [WALLET QPAY CHECK] Detected payment for ${walletPaymentId}`);
        const io = req.app.get("socketio");
        await settleWalletPayment(
          qpayObject,
          tukhainBaaziinKholbolt,
          baiguullagiinId,
          null,
          io
        );

        // Fetch user phone to get Wallet Payment Data for VAT
        let walletPaymentData = null;
        try {
          const WalletInvoice = require("../models/walletInvoice");
          const walletInvoiceDoc = await WalletInvoice(db.erunkhiiKholbolt)
            .findOne({ walletPaymentId })
            .lean();
            
          let userId = walletInvoiceDoc?.userId;
          if (!userId) {
             const orshinSuugch = await getOrshinSuugchFromToken(req);
             userId = orshinSuugch?.utas;
          }

          if (userId) {
            walletPaymentData = await walletApiService.getPayment(userId, walletPaymentId);
          }
        } catch (fetchErr) {
          console.error("⚠️ [WALLET QPAY CHECK] Could not fetch Wallet Payment Data for VAT:", fetchErr.message);
        }

        return res.json({ 
          success: true, 
          status: "PAID", 
          walletPaymentId,
          vatInformation: walletPaymentData?.vatInformation || null
        });
      }
    } catch {
      // ignore
    }
  }

  res.json({ success: true, status: "PENDING", walletPaymentId });
});

// ──────────────────────────────────────────────────────
//  GET /walletQpay/payment/:paymentId
//  Fetch full wallet payment details (including VAT info)
// ──────────────────────────────────────────────────────
exports.getWalletPayment = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.params;
  
  const orshinSuugch = await getOrshinSuugchFromToken(req);
  const userPhone = orshinSuugch?.utas;
  
  if (!userPhone) {
    throw new aldaa("Хэрэглэгчийн утас олдсонгүй. Нэвтрэх шаардлагатай.");
  }

  try {
    const payment = await walletApiService.getPayment(userPhone, paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found in Wallet API" });
    }
    
    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (err) {
    console.error("❌ [WALLET QPAY] Error getting payment details:", err.message);
    throw new aldaa(`Төлбөрийн мэдээлэл авахад алдаа: ${err.message}`);
  }
});

// ──────────────────────────────────────────────────────
//  GET /walletQpay/list
//  Fetch payment history for the authenticated user
// ──────────────────────────────────────────────────────
exports.getWalletQpayList = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  
  const orshinSuugch = await getOrshinSuugchFromToken(req);
  const userPhone = orshinSuugch?.utas;
  
  if (!userPhone) {
    throw new aldaa("Хэрэглэгчийн утас олдсонгүй. Нэвтрэх шаардлагатай.");
  }

  try {
    const rawInvoices = await WalletInvoice(db.erunkhiiKholbolt)
      .find({ userId: userPhone })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
      
    // Parallelize paid-status lookups for performance
    const payments = await Promise.all(rawInvoices.map(async (p) => {
       // Search local QPay records by all possible identifiers
       const qpayObject = await QuickQpayObject(db.kholboltuud.find(k => String(k.baiguullagiinId) === String(p.baiguullagiinId))).findOne({
         $or: [
           { walletPaymentId: p.walletInvoiceId },
           { zakhialgiinDugaar: p.zakhialgiinDugaar }
         ]
       }).select('tulsunEsekh updatedAt').lean();
       
       return {
         ...p,
         // Ensure paymentId is present for the Flutter model parser
         paymentId: p.walletInvoiceId,
         invoiceNo: p.zakhialgiinDugaar || p.walletInvoiceId,
         tulsunEsekh: qpayObject?.tulsunEsekh || false,
         updatedAt: qpayObject?.updatedAt || p.updatedAt
       };
    }));
      
    res.status(200).json({
      success: true,
      data: payments
    });
  } catch (err) {
    console.error("❌ [WALLET QPAY] Error getting payment list:", err.message);
    throw new aldaa(`Төлбөрийн жагсаалт авахад алдаа: ${err.message}`);
  }
});

exports.debugWalletCheck = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, walletPaymentId: searchId } = req.params;

  // Prevent browser/CDN/Nginx caching explicitly
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  console.log(`🔍 [WALLET CHECK] baiguullagiinId=${baiguullagiinId}, searchId=${searchId}`);

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    return res.status(404).json({ success: false, message: "Organization not found" });
  }

  /* ── 1. Find the local QPay record and metadata (Bypass cache with findOne) ── */
  const [qpayObject, walletInvoiceDoc] = await Promise.all([
    QuickQpayObject(tukhainBaaziinKholbolt).findOne({
      $or: [
        { walletPaymentId: searchId }, // Check by UUID
        { zakhialgiinDugaar: searchId } // Check by Order No (WQ-1)
      ]
    }).lean(),
    WalletInvoice(db.erunkhiiKholbolt).findOne({
      $or: [
        { walletInvoiceId: searchId }, // Using correct schema field
        { zakhialgiinDugaar: searchId }
      ]
    }).lean()
  ]);

  // Resolve the canonical walletPaymentId
  const walletPaymentId = qpayObject?.walletPaymentId || walletInvoiceDoc?.walletInvoiceId || (searchId.length > 30 ? searchId : null);
  const userId = walletInvoiceDoc?.userId || qpayObject?.userId;

  if (!walletPaymentId) {
    return res.status(404).json({
      success: false,
      message: "Could not find a valid walletPaymentId for this identifier.",
      searchId
    });
  }

  /* ── 2. Call Wallet API for the real meat (VAT info, etc) ── */
  try {
    let payment = null;
    if (userId) {
      payment = await walletApiService.getPayment(userId, walletPaymentId);
    } else {
      const orshinSuugch = await getOrshinSuugchFromToken(req);
      if (orshinSuugch?.utas) {
        payment = await walletApiService.getPayment(orshinSuugch.utas, walletPaymentId);
      }
    }

    res.json({
      success: true,
      walletPaymentId,
      zakhialgiinDugaar: qpayObject?.zakhialgiinDugaar || walletInvoiceDoc?.zakhialgiinDugaar,
      userId: userId || "unknown",
      tulsunEsekh: qpayObject?.tulsunEsekh || false,
      data: payment,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `Wallet API error: ${err.message}`,
      walletPaymentId,
      userId,
    });
  }
});

// ──────────────────────────────────────────────────────
//  GET /walletQpay/qpay-check/:baiguullagiinId/:invoiceId
//  Debug: call QPay check directly and return raw payment data
//  Use to find the qpayPaymentId for a stuck payment
// ──────────────────────────────────────────────────────
exports.debugQpayCheck = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, invoiceId } = req.params;

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    return res.status(404).json({ success: false, message: "Organization not found" });
  }

  try {
    const result = await qpayShalgay(
      { invoice_id: invoiceId },
      tukhainBaaziinKholbolt
    );
    // Pull out the most useful identifiers for quick reading
    const payments = result?.payments || [];
    const summary = payments.map((p) => ({
      payment_id:     p.payment_id,
      payment_status: p.payment_status || p.status,
      amount:         p.payment_amount,
      transactions:   (p.transactions || []).map((t) => ({
        id:              t.id,
        amount:          t.amount,
        settlement_date: t.settlement_date,
      })),
    }));

    res.json({
      success: true,
      invoiceId,
      paymentCount: payments.length,
      summary,
      raw: result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



// ──────────────────────────────────────────────────────
//  GET /walletQpay/bill-check/:baiguullagiinId/:billId
//  Debug: Find Wallet payment status by a specific Bill ID
// ──────────────────────────────────────────────────────
exports.debugBillCheck = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, billId } = req.params;

  console.log(`🔍 [BILL CHECK] baiguullagiinId=${baiguullagiinId}, billId=${billId}`);

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    return res.status(404).json({ success: false, message: "Organization not found" });
  }

  /* ── 1. Find WalletInvoice by Bill ID ── */
  let walletInvoices = [];
  try {
    walletInvoices = await WalletInvoice(db.erunkhiiKholbolt)
      .find({ billIds: billId })
      .sort({ createdAt: -1 })
      .lean();
  } catch (err) {
    console.warn("⚠️ [BILL CHECK] Metadata lookup failed:", err.message);
  }

  if (walletInvoices.length === 0) {
    return res.status(404).json({
      success: false,
      billId,
      message: "No Wallet payments found containing this Bill ID in local metadata.",
    });
  }

  /* ── 2. Get status for the most recent attempt ── */
  const doc = walletInvoices[0];
  const walletPaymentId = doc.walletPaymentId;
  const userId = doc.userId;

  try {
    const payment = await walletApiService.getPayment(userId, walletPaymentId);
    res.json({
      success: true,
      found_in_attempts: walletInvoices.length,
      walletPaymentId,
      userId,
      billId,
      data: payment,
      all_attempts: walletInvoices.map(i => ({
        walletPaymentId: i.walletPaymentId,
        createdAt: i.createdAt,
        billingName: i.billingName
      }))
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `Found record but Wallet API error: ${err.message}`,
      walletPaymentId,
      userId,
    });
  }
});

// ──────────────────────────────────────────────────────
//  GET /walletQpay/easy-check/:baiguullagiinId/:walletPaymentId
//  Debug: Trace Easy Register lookup logic for a payment
// ──────────────────────────────────────────────────────
exports.debugEasyCheck = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, walletPaymentId } = req.params;

  console.log(`🔍 [EASY CHECK] baiguullagiinId=${baiguullagiinId}, walletPaymentId=${walletPaymentId}`);

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    return res.status(404).json({ success: false, message: "Organization not found" });
  }

  /* ── 1. Find WalletInvoice metadata ── */
  let walletDoc = null;
  try {
    const WalletInvoice = require("../models/walletInvoice");
    walletDoc = await WalletInvoice(db.erunkhiiKholbolt)
      .findOne({ walletPaymentId })
      .lean();
  } catch (err) {
    console.warn("⚠️ [EASY CHECK] WalletInvoice lookup failed:", err.message);
  }

  const orshinSuugchId = walletDoc?.orshinSuugchId || null;
  const userId = walletDoc?.userId || null;

  /* ── 2. Find EasyRegisterUser (Priority: Resident ID > Phone) ── */
  let easyUser = null;
  let matchReason = "";

  if (orshinSuugchId) {
    easyUser = await EasyRegisterUser(tukhainBaaziinKholbolt).findOne({
      orshinSuugchiinId: orshinSuugchId,
      ustgasan: { $ne: true },
    }).sort({ createdAt: -1 }).lean();
    if (easyUser) matchReason = "Resident ID (Priority)";
  }

  if (!easyUser && userId) {
    easyUser = await EasyRegisterUser(tukhainBaaziinKholbolt).findOne({
      phoneNum: userId,
      ustgasan: { $ne: true },
    }).sort({ createdAt: -1 }).lean();
    if (easyUser) matchReason = "Phone Number (Fallback)";
  }

  res.json({
    success: true,
    walletPaymentId,
    metadataFound: !!walletDoc,
    mapping: {
      userId,
      orshinSuugchId
    },
    easyRegisterProfile: easyUser ? {
      found: true,
      _id: easyUser._id,
      loginName: easyUser.loginName,
      regNo: easyUser.regNo,
      phoneNum: easyUser.phoneNum,
      orshinSuugchiinId: easyUser.orshinSuugchiinId,
      givenName: easyUser.givenName
    } : {
      found: false,
      message: "No matching profile found for these identifiers."
    },
    dryRunResult: easyUser && easyUser.loginName ? {
      willApprove: true,
      targetIdentifier: easyUser.loginName,
      reason: "Matched via " + matchReason
    } : {
      willApprove: false,
      reason: "No profile or loginName found."
    }
  });
});

// ──────────────────────────────────────────────────────
//  POST /walletQpay/resync/:baiguullagiinId/:walletPaymentId
//  Admin-only: force re-call Wallet paidByQpay for a payment
//  that was locally marked paid but Wallet Service still shows NEW.
//  Also re-triggers ebarimt sync if VAT was missing.
// ──────────────────────────────────────────────────────
exports.resyncWalletPayment = asyncHandler(async (req, res, next) => {
  const { db } = require("zevbackv2");
  const { baiguullagiinId, walletPaymentId } = req.params;

  console.log(`🔄 [WALLET QPAY RESYNC] baiguullagiinId=${baiguullagiinId}, walletPaymentId=${walletPaymentId}`);

  const tukhainBaaziinKholbolt = db.kholboltuud.find(
    (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
  );
  if (!tukhainBaaziinKholbolt) {
    return res.status(404).json({ success: false, message: "Organization not found" });
  }

  /* ── 1. Find the local QPay object ── */
  let qpayObject = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
    walletPaymentId,
  });

  if (!qpayObject) {
    qpayObject = await QuickQpayObject(tukhainBaaziinKholbolt).findOne({
      "qpay.callback_url": { $regex: walletPaymentId },
    });
  }

  if (!qpayObject) {
    return res.status(404).json({ success: false, message: "QPay object not found for this walletPaymentId" });
  }

  /* ── 2. Get QPay transaction details ── */
  // Strictly use invoice_id for qpayPaymentId as per user requirement
  let qpayPaymentId = qpayObject.invoice_id || "";
  // Strictly use legacy_id for trxNo as per user requirement
  let trxNo = qpayObject.legacy_id || "";
  let trxDate = new Date().toISOString();
  let trxAmount = parseFloat(qpayObject.qpay?.amount || 0);

  // Try live QPay check to sync more details (trxNo, trxDate) if possible
  if (qpayObject.invoice_id) {
    try {
      const checkResult = await qpayShalgay(
        { invoice_id: qpayObject.invoice_id },
        tukhainBaaziinKholbolt
      );
      if (checkResult?.payments?.[0]) {
        const payment = checkResult.payments[0];
        // qpayPaymentId is strictly invoice_id, no dynamic update from payment_id
        // qpayPaymentId remains qpayObject.invoice_id or from body
        if (payment.transactions?.[0]) {
          // trxNo is strictly legacy_id, no dynamic update from payment check id
          trxDate = payment.transactions[0].settlement_date || payment.transactions[0].date || trxDate;
          trxAmount = payment.transactions[0].amount || trxAmount;
        }
      }
    } catch (err) {
      console.warn("⚠️ [WALLET QPAY RESYNC] QPay check failed:", err.message);
    }
  }

  // No dynamic fallback for trxNo, strictly uses legacy_id from above


  if (!qpayPaymentId) {
    return res.status(400).json({
      success: false,
      message: "qpayPaymentId could not be determined. Please pass it in the request body: { \"qpayPaymentId\": \"<value from QPay dashboard>\" }",
    });
  }

  /* ── 3. Store qpayPaymentId if we now have it ── */
  if (qpayPaymentId && qpayPaymentId !== qpayObject.payment_id) {
    qpayObject.payment_id = qpayPaymentId;
    qpayObject.tulsunEsekh = true;
    await qpayObject.save();
  }

  /* ── 4. Find userId from WalletInvoice ── */
  const walletInvoiceId = qpayObject.walletInvoiceId || "";
  let userId = null;
  try {
    const walletInvoiceDoc = await WalletInvoice(db.erunkhiiKholbolt)
      .findOne({ $or: [{ walletInvoiceId }, { walletPaymentId }] })
      .lean();
    userId = walletInvoiceDoc?.userId || null;
  } catch (err) {
    console.warn("⚠️ [WALLET QPAY RESYNC] Error finding WalletInvoice:", err.message);
  }

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Could not find userId — cannot call Wallet Service without phone number",
      qpayPaymentId,
      trxNo,
    });
  }

  /* ── 5. Re-call updateQPayPayment with correct receiver fields ── */
  const bankAccount = qpayObject.qpay?.bank_accounts?.[0] || {};
  const paidByQpayData = {
    qpayPaymentId,
    trxDate,
    trxNo,
    trxDescription: qpayObject.qpay?.description || `WalletQPay-${walletPaymentId}`,
    amount: trxAmount,
    receiverBankCode:    bankAccount.account_bank_code || "",
    receiverAccountNo:   bankAccount.account_number    || "",
    receiverAccountName: bankAccount.account_name      || "",
  };

  console.log(`📤 [WALLET QPAY RESYNC] Calling Wallet paidByQpay:`, JSON.stringify(paidByQpayData));

  let walletSyncResult = null;
  let walletSyncError = null;
  try {
    walletSyncResult = await walletApiService.updateQPayPayment(userId, walletPaymentId, paidByQpayData);
    console.log(`✅ [WALLET QPAY RESYNC] Wallet paidByQpay success`);
  } catch (err) {
    walletSyncError = err.message;
    console.error(`❌ [WALLET QPAY RESYNC] Wallet paidByQpay failed:`, err.message);
  }

  /* ── 6. Re-trigger ebarimt sync ── */
  let ebarimtTriggered = false;
  try {
    await handleWalletEbarimt(userId, walletPaymentId, baiguullagiinId, tukhainBaaziinKholbolt);
    ebarimtTriggered = true;
  } catch (err) {
    console.error("❌ [WALLET QPAY RESYNC] Ebarimt re-sync failed:", err.message);
  }

  res.json({
    success: !walletSyncError,
    walletPaymentId,
    qpayPaymentId,
    trxNo,
    trxDate,
    trxAmount,
    receiverBankCode:    bankAccount.account_bank_code || "",
    receiverAccountNo:   bankAccount.account_number    || "",
    receiverAccountName: bankAccount.account_name      || "",
    walletSyncResult,
    walletSyncError,
    ebarimtTriggered,
    message: walletSyncError
      ? `Wallet sync failed: ${walletSyncError}`
      : "Re-sync complete — Wallet Service notified successfully",
  });
});

// ──────────────────────────────────────────────────────
//  Helpers for Unified E-barimt / Easy Register
// ──────────────────────────────────────────────────────

async function settleWalletPayment(
  qpayObject,
  tukhainBaaziinKholbolt,
  baiguullagiinId,
  qpayPaymentIdFromRequest = null,
  io = null
) {
  const { db } = require("zevbackv2");
  if (qpayObject.tulsunEsekh) return;

  console.log(`🚀 [WALLET QPAY] Settling payment: ${qpayObject.walletPaymentId}`);

  /* ── 1. Mark paid locally ── */
  qpayObject.tulsunEsekh = true;
  qpayObject.isNew = false;
  if (qpayPaymentIdFromRequest) {
    qpayObject.payment_id = qpayPaymentIdFromRequest;
  }

  // Strictly use invoice_id and legacy_id as per user requirement
  let qpayPaymentId = qpayObject.invoice_id || "";
  let trxNo = qpayObject.legacy_id || "";
  let trxDate = new Date().toISOString();
  let trxAmount = parseFloat(qpayObject.qpay?.amount || 0);

  if (qpayObject.invoice_id) {
    try {
      const checkResult = await qpayShalgay(
        { invoice_id: qpayObject.invoice_id },
        tukhainBaaziinKholbolt
      );
      if (checkResult?.payments?.[0]) {
        const payment = checkResult.payments[0];
        // qpayPaymentId is strictly invoice_id
        if (payment.transactions?.[0]) {
          // trxNo is strictly legacy_id
          trxDate = payment.transactions[0].settlement_date || payment.transactions[0].date || trxDate;
          trxAmount = payment.transactions[0].amount || trxAmount;
        }
      }
    } catch (checkErr) {
      console.error(
        "⚠️ [WALLET QPAY] QPay check failed during settlement:",
        checkErr.message
      );
    }
  }

  // No dynamic fallback for trxNo, strictly uses legacy_id from above


  qpayObject.payment_id = qpayPaymentId;
  await qpayObject.save();

  /* ── 3. Call Wallet API paidByQpay ── */
  const walletPaymentId = qpayObject.walletPaymentId;
  const walletInvoiceId = qpayObject.walletInvoiceId || "";

  let userId = null;
  try {
    const walletInvoiceDoc = await WalletInvoice(db.erunkhiiKholbolt)
      .findOne({ walletInvoiceId })
      .lean();
    userId = walletInvoiceDoc?.userId || null;
  } catch (err) {
    console.warn("⚠️ [WALLET QPAY] Error finding WalletInvoice:", err.message);
  }

  if (userId) {
    try {
      // ── Read receiver details from bank_accounts[0] (actual QPay schema field) ──
      const bankAccount = qpayObject.qpay?.bank_accounts?.[0] || {};
      const paidByQpayData = {
        qpayPaymentId: qpayPaymentId,
        trxDate: trxDate,
        trxNo: trxNo,
        trxDescription:
          qpayObject.qpay?.description || `WalletQPay-${walletPaymentId}`,
        amount: trxAmount,
        receiverBankCode: bankAccount.account_bank_code || "",
        receiverAccountNo: bankAccount.account_number || "",
        receiverAccountName: bankAccount.account_name || "",
      };

      console.log(
        `📤 [WALLET QPAY] Calling Wallet paidByQpay for paymentId=${walletPaymentId}`
      );
      await walletApiService.updateQPayPayment(
        userId,
        walletPaymentId,
        paidByQpayData
      );
      console.log(`✅ [WALLET QPAY] Wallet paidByQpay success`);

      // 3.5. Create official BankniiGuilgee record for AmarSukh accountants
      try {
        const BankniiGuilgee = require("../models/bankniiGuilgee");
        const bankGuilgee = new (BankniiGuilgee(tukhainBaaziinKholbolt))();

        bankGuilgee.tranDate = new Date(trxDate) || new Date();
        bankGuilgee.amount = trxAmount;
        bankGuilgee.description =
          qpayObject.qpay?.description ||
          `QPay төлбөр (Wallet) - ${walletPaymentId}`;
        bankGuilgee.accName = bankAccount.account_name || "";
        bankGuilgee.accNum = bankAccount.account_number || "";

        bankGuilgee.record = walletPaymentId;
        bankGuilgee.tranId = qpayPaymentId || walletPaymentId;
        bankGuilgee.balance = 0;
        bankGuilgee.requestId = walletPaymentId;

        bankGuilgee.kholbosonGereeniiId = [qpayObject.gereeniiId];
        bankGuilgee.kholbosonTalbainId = qpayObject.talbainDugaar
          ? [qpayObject.talbainDugaar]
          : [];
        bankGuilgee.dansniiDugaar =
          bankAccount.account_number || "";
        bankGuilgee.bank = "qpay";
        bankGuilgee.baiguullagiinId = baiguullagiinId;
        bankGuilgee.barilgiinId = qpayObject.barilgiinId || "";
        bankGuilgee.kholbosonDun = trxAmount;
        bankGuilgee.ebarimtAvsanEsekh = false;
        bankGuilgee.drOrCr = "Credit";
        bankGuilgee.tranCrnCode = "MNT";
        bankGuilgee.exchRate = 1;
        bankGuilgee.postDate = new Date();

        bankGuilgee.indexTalbar = `${bankGuilgee.barilgiinId}${bankGuilgee.bank}${bankGuilgee.dansniiDugaar}${bankGuilgee.record}${bankGuilgee.amount}`;

        await bankGuilgee.save();
        console.log(`✅ [WALLET QPAY] BankniiGuilgee created: ${walletPaymentId}`);
      } catch (bankErr) {
        console.error(
          "❌ [WALLET QPAY] Error creating BankniiGuilgee:",
          bankErr.message
        );
      }

      // 3.6. Sync E-barimt to local DB and Easy Register
      await handleWalletEbarimt(
        userId,
        walletPaymentId,
        baiguullagiinId,
        tukhainBaaziinKholbolt
      );
    } catch (walletErr) {
      console.error(
        "❌ [WALLET QPAY] Wallet paidByQpay failed:",
        walletErr.message
      );
    }
  } else {
    console.warn(
      "⚠️ [WALLET QPAY] Could not find userId for Wallet API call during settlement"
    );
  }

  /* ── 4. Emit socket event ── */
  if (io) {
    io.emit(`walletQpay/${baiguullagiinId}/${walletPaymentId}`, {
      status: "PAID",
      qpayPaymentId,
    });
  }
}

async function autoApproveQr(
  customerNo,
  qrData,
  baiguullagiinId,
  tukhainBaaziinKholbolt
) {
  if (!customerNo || !qrData) return null;

  try {
    const { Token } = require("zevbackv2");
    const path = "api/easy-register/rest/v1/approveQr";
    const body = { customerNo, qrData };

    const shouldUseTest =
      baiguullagiinId && String(baiguullagiinId) === "697723dc3e77b46e52ccf577";
    const baseUrl = shouldUseTest
      ? "https://st-service.itc.gov.mn"
      : "https://service.itc.gov.mn";

    const token = await getEbarimtTokenForEasy(
      baiguullagiinId,
      tukhainBaaziinKholbolt
    );

    return new Promise((resolve) => {
      request.post(
        {
          url: `${baseUrl}/${path}`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          json: true,
          body,
        },
        (err, res, resBody) => {
          if (err || res?.statusCode >= 400) {
            console.error(
              "⚠️ [EASY REGISTER] Auto-approve error:",
              err?.message || resBody?.error || res?.statusCode
            );
          } else {
            console.log(
              `✅ [EASY REGISTER] QR approved for customer: ${customerNo}`
            );
          }
          resolve(resBody);
        }
      );
    });
  } catch (err) {
    console.error("⚠️ [EASY REGISTER] Helper error:", err.message);
    return null;
  }
}

async function getEbarimtTokenForEasy(baiguullagiinId, tukhainBaaziinKholbolt) {
  const { Token } = require("zevbackv2");
  
  // Try existing token
  const tokenDoc = await Token(tukhainBaaziinKholbolt).findOne({
    turul: "ebarimt",
    baiguullagiinId,
  });

  if (tokenDoc && tokenDoc.token && tokenDoc.expires_in > new Date()) {
    return tokenDoc.token;
  }

  // Refresh or Login logic simplified for here
  const authUrl =
    process.env.EBARIMTSHINE_AUTH_URL ||
    "https://auth.itc.gov.mn/auth/realms/ITC/protocol/openid-connect/token";
  const clientId = process.env.EBARIMTSHINE_CLIENT_ID || "vatps";
  const username = process.env.EBARIMTSHINE_USERNAME || "Rooden_like@yahoo.com";
  const password = process.env.EBARIMTSHINE_PASSWORD || "Br1stelback@";

  return new Promise((resolve, reject) => {
    request.post(
      {
        url: authUrl,
        form: {
          grant_type: "password",
          client_id: clientId,
          username,
          password,
          scope: "profile email",
        },
        json: true,
      },
      async (err, res, body) => {
        if (err || !body?.access_token) {
          return reject(new Error("Failed to get Ebarimt token"));
        }
        
        await Token(tukhainBaaziinKholbolt).updateOne(
          { turul: 'ebarimt', baiguullagiinId: baiguullagiinId },
          {
            ognoo: new Date(),
            token: body.access_token,
            refreshToken: body.refresh_token || '',
            expires_in: new Date(Date.now() + (body.expires_in || 28800) * 1000)
          },
          { upsert: true }
        );
        
        resolve(body.access_token);
      }
    );
  });
}

async function handleWalletEbarimt(
  userId,
  walletPaymentId,
  baiguullagiinId,
  tukhainBaaziinKholbolt
) {
  try {
    const { autoApproveQr } = require("../routes/ebarimtRoute");

    // Retry logic is crucial because the Wallet API generates VAT-info asynchronously
    let payment = null;
    let retryCount = 1;
    const maxRetries = 5;

    while (retryCount <= maxRetries) {
      payment = await walletApiService.getPayment(userId, walletPaymentId);
      if (payment?.vatInformation?.vatDdtd) break;

      console.log(
        `ℹ️ [WALLET EBARIMT] No VAT info for payment ${walletPaymentId}, retry ${retryCount}/${maxRetries}...`
      );
      // Wait 3 seconds before next retry
      await new Promise((resolve) => setTimeout(resolve, 3000));
      retryCount++;
    }

    if (!payment?.vatInformation?.vatDdtd) {
      console.log(
        `ℹ️ [WALLET EBARIMT] Permanent skip: No VAT info for payment: ${walletPaymentId}`
      );
      return;
    }

    const vat = payment.vatInformation;

    // Check if already saved
    const existing = await EbarimtShine(tukhainBaaziinKholbolt).findOne({
      id: vat.vatDdtd,
    });
    if (existing) {
      console.log(`ℹ️ [WALLET EBARIMT] Already saved locally: ${vat.vatDdtd}`);
      return;
    }

    // 1. Save locally to EbarimtShine
    const ebarimt = new (EbarimtShine(tukhainBaaziinKholbolt))();
    ebarimt.id = vat.vatDdtd;
    ebarimt.receiptId = vat.vatDdtd;
    ebarimt.qrData = vat.vatQrData;
    ebarimt.lottery = vat.vatLotteryNo;
    ebarimt.totalAmount = payment.totalAmount || payment.amount;
    ebarimt.totalVAT = parseFloat(vat.vatAmount || 0);
    ebarimt.baiguullagiinId = baiguullagiinId;
    ebarimt.barilgiinId = payment.barilgiinId || "";
    ebarimt.nekhemjlekhiinId = walletPaymentId;
    ebarimt.customerNo = vat.vatCustomerNo || "";
    ebarimt.date = new Date().toISOString();
    ebarimt.dateOgnoo = new Date();
    ebarimt.createdAt = new Date();

    // Dynamic B2C/B2B handling
    if (vat.vatCustomerTin) {
      ebarimt.type = "B2B_RECEIPT";
      ebarimt.customerTin = vat.vatCustomerTin;
    } else {
      ebarimt.type = "B2C_RECEIPT";
    }

    await ebarimt.save();
    console.log(`✅ [WALLET EBARIMT] Saved local ebarimt: ${vat.vatDdtd}`);

    // 2. Update BankniiGuilgee record to reflect e-barimt status
    try {
      const BankniiGuilgee = require("../models/bankniiGuilgee");
      await BankniiGuilgee(tukhainBaaziinKholbolt).updateMany(
        { record: walletPaymentId, baiguullagiinId: baiguullagiinId },
        { $set: { ebarimtAvsanEsekh: true } }
      );
    } catch (bankUpdateErr) {
      console.error(
        "❌ [WALLET EBARIMT] Error updating BankniiGuilgee ebarimt flag:",
        bankUpdateErr.message
      );
    }

    // 3. Auto-approve to Easy Register
    // Find the WalletInvoice metadata first to get the orshinSuugchId
    let orshinSuugchId = null;
    try {
      const WalletInvoice = require("../models/walletInvoice");
      const walletDoc = await WalletInvoice(db.erunkhiiKholbolt)
        .findOne({ walletPaymentId })
        .lean();
      orshinSuugchId = walletDoc?.orshinSuugchId || null;
    } catch (e) {}

    // Path 1: Search by orshinSuugchiinId (Priority)
    let easyUser = null;
    if (orshinSuugchId) {
      easyUser = await EasyRegisterUser(tukhainBaaziinKholbolt).findOne({
        orshinSuugchiinId: orshinSuugchId,
        ustgasan: { $ne: true },
      }).sort({ createdAt: -1 });
    }

    // Path 2: Fallback to phoneNum if no resident profile found
    if (!easyUser && userId) {
      easyUser = await EasyRegisterUser(tukhainBaaziinKholbolt).findOne({
        phoneNum: userId,
        ustgasan: { $ne: true },
      }).sort({ createdAt: -1 });
    }

    if (easyUser && easyUser.loginName) {
      console.log(
        `📦 [WALLET EBARIMT] Auto-approving for easyUser: ${easyUser.loginName} (regNo: ${easyUser.regNo})`
      );
      await autoApproveQr(
        easyUser.loginName,
        vat.vatQrData,
        baiguullagiinId,
        tukhainBaaziinKholbolt
      );
    } else {
      console.log(`ℹ️ [WALLET EBARIMT] Easy Register Profile not found for this user. Skipping auto-approve.`);
    }
  } catch (err) {
    console.error("❌ [WALLET EBARIMT] Error handling ebarimt:", err.message);
  }
}
