const express = require("express");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const { tokenShalgakh, Dugaarlalt } = require("zevbackv2");
const {
  qpayGuilgeeUtgaAvya,
  qpayTulye,
  qpayGargayaKhuuchin,
} = require("../controller/qpayController");
const router = express.Router();
const {
  qpayKhariltsagchUusgey,
  qpayGargaya,
  QuickQpayObject,
  QpayKhariltsagch,
  qpayShalgay,
} = require("quickqpaypackvSukh");

router.get("/qpayTulye/:baiguullagiinId/:barilgiinId/:dugaar", qpayTulye);

// BANK ACCOUNT ENDPOINT - MUST BE FIRST TO AVOID ROUTE CONFLICTS
router.get("/qpayBankAccountsView", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, salbariinId } = req.query;

    if (!baiguullagiinId) {
      return res.status(400).send({
        success: false,
        message: "baiguullagiinId is required",
      });
    }

    var kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(baiguullagiinId),
    );

    if (!kholbolt) {
      return res.status(404).send({
        success: false,
        message: "Organization connection not found",
      });
    }

    var qpayKhariltsagch = new QpayKhariltsagch(kholbolt);
    const qpayConfig = await qpayKhariltsagch
      .findOne({
        baiguullagiinId: baiguullagiinId,
      })
      .lean();

    if (
      !qpayConfig ||
      !qpayConfig.salbaruud ||
      !Array.isArray(qpayConfig.salbaruud)
    ) {
      return res.send({
        success: true,
        bank_accounts: [],
        message: "No salbaruud found",
      });
    }

    // If salbariinId is provided, get bank_accounts for that specific salbar
    if (salbariinId) {
      const targetSalbar = qpayConfig.salbaruud.find(
        (salbar) => String(salbar.salbariinId) === String(salbariinId),
      );

      if (targetSalbar && targetSalbar.bank_accounts) {
        return res.send({
          success: true,
          salbariinNer: targetSalbar.salbariinNer,
          salbariinId: targetSalbar.salbariinId,
          bank_accounts: targetSalbar.bank_accounts,
        });
      } else {
        return res.send({
          success: true,
          bank_accounts: [],
          message: `No bank accounts found for salbar ${salbariinId}`,
        });
      }
    }

    // If no salbariinId, return all bank_accounts from all salbaruud with salbar info
    const result = qpayConfig.salbaruud
      .filter(
        (salbar) => salbar.bank_accounts && salbar.bank_accounts.length > 0,
      )
      .map((salbar) => ({
        salbariinId: salbar.salbariinId,
        salbariinNer: salbar.salbariinNer,
        bank_accounts: salbar.bank_accounts,
      }));

    res.send({
      success: true,
      baiguullagiinId: baiguullagiinId,
      salbaruud: result,
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/qpaycallback/:baiguullagiinId/:zakhialgiinDugaar",
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const b = req.params.baiguullagiinId;
      const zd = req.params.zakhialgiinDugaar;
      console.log("ℹ️ [QPAY CALLBACK] hit", {
        method: req.method,
        path: req.originalUrl || req.url,
        baiguullagiinId: b,
        zakhialgiinDugaar: zd,
      });
      if (
        !zd ||
        zd === "undefined" ||
        (typeof zd === "string" && zd.trim() === "")
      ) {
        console.error(
          "❌ [QPAY CALLBACK] reject: missing or invalid zakhialgiinDugaar (fix client: req.body.zakhialgiinDugaar when creating QPay invoice)",
          { baiguullagiinId: b, zakhialgiinDugaar: zd },
        );
        return res
          .status(400)
          .send("zakhialgiinDugaar is required (callback URL is malformed)");
      }
      var kholbolt = db.kholboltuud.find(
        (a) => String(a.baiguullagiinId) === String(b),
      );
      if (!kholbolt) {
        console.error("❌ [QPAY CALLBACK] reject: organization not in kholboltuud", {
          baiguullagiinId: b,
        });
        return res.status(404).send("Organization not found");
      }
      const unpaid = await QuickQpayObject(kholbolt).findOne({
        zakhialgiinDugaar: zd,
        tulsunEsekh: false,
      });
      if (unpaid) {
        var qpayObject = unpaid;
      } else {
        const already = await QuickQpayObject(kholbolt).findOne({
          zakhialgiinDugaar: zd,
        });
        if (already && already.tulsunEsekh) {
          console.log(
            "ℹ️ [QPAY CALLBACK] idempotent OK (already paid)",
            zd,
          );
          return res.sendStatus(200);
        }
        console.error(
          "❌ [QPAY CALLBACK] no QuickQpayObject for zakhialgiinDugaar",
          { baiguullagiinId: b, zakhialgiinDugaar: zd },
        );
        return res
          .status(404)
          .send("QuickQpayObject not found for this order id");
      }

      qpayObject.tulsunEsekh = true;
      qpayObject.isNew = false;
      await qpayObject.save();
      const io = req.app.get("socketio");
      if (io) {
        io.emit(`qpay/${b}/${qpayObject.zakhialgiinDugaar}`);
      } else {
        console.warn("⚠️ [QPAY CALLBACK] socketio not set; skip emit");
      }
      if (qpayObject.zogsooliinId) {
        const body = {
          tukhainBaaziinKholbolt: kholbolt,
          turul: "qpayUridchilsan",
          uilchluulegchiinId: qpayObject.zogsoolUilchluulegch.uId,
          paid_amount: qpayObject.zogsoolUilchluulegch.pay_amount,
          plate_number: qpayObject.zogsoolUilchluulegch.plate_number,
          barilgiinId: qpayObject.salbariinId,
          ajiltniiNer: "zochin",
          zogsooliinId: qpayObject.zogsooliinId,
        };
      }
      console.log("✅ [QPAY CALLBACK] marked paid", {
        baiguullagiinId: b,
        zakhialgiinDugaar: qpayObject.zakhialgiinDugaar,
      });
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);
router.get(
  "/qpaycallbackGadaaSticker/:baiguullagiinId/:barilgiinId/:mashiniiDugaar/:cameraIP/:zakhialgiinDugaar",
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const b = req.params.baiguullagiinId;
      const zd = req.params.zakhialgiinDugaar;
      console.log("ℹ️ [QPAY CALLBACK GADAA] hit", {
        method: req.method,
        path: req.originalUrl || req.url,
        baiguullagiinId: b,
        zakhialgiinDugaar: zd,
      });
      if (
        !zd ||
        zd === "undefined" ||
        (typeof zd === "string" && zd.trim() === "")
      ) {
        console.error(
          "❌ [QPAY CALLBACK GADAA] reject: missing or invalid zakhialgiinDugaar",
          { baiguullagiinId: b, zakhialgiinDugaar: zd },
        );
        return res
          .status(400)
          .send("zakhialgiinDugaar is required (callback URL is malformed)");
      }
      var kholbolt = db.kholboltuud.find(
        (a) => String(a.baiguullagiinId) === String(b),
      );
      if (!kholbolt) {
        console.error(
          "❌ [QPAY CALLBACK GADAA] reject: organization not in kholboltuud",
          { baiguullagiinId: b },
        );
        return res.status(404).send("Organization not found");
      }
      const unpaidSticker = await QuickQpayObject(kholbolt).findOne({
        zakhialgiinDugaar: zd,
        tulsunEsekh: false,
      });
      let qpayObject;
      if (unpaidSticker) {
        qpayObject = unpaidSticker;
      } else {
        const alreadySticker = await QuickQpayObject(kholbolt).findOne({
          zakhialgiinDugaar: zd,
        });
        if (alreadySticker && alreadySticker.tulsunEsekh) {
          console.log(
            "ℹ️ [QPAY CALLBACK GADAA] idempotent OK (already paid)",
            zd,
          );
          return res.sendStatus(200);
        }
        console.error(
          "❌ [QPAY CALLBACK GADAA] no QuickQpayObject for zakhialgiinDugaar",
          { baiguullagiinId: b, zakhialgiinDugaar: zd },
        );
        return res
          .status(404)
          .send("QuickQpayObject not found for this order id");
      }

      qpayObject.tulsunEsekh = true;
      qpayObject.isNew = false;
      await qpayObject.save();
      const ioSticker = req.app.get("socketio");
      if (ioSticker) {
        ioSticker.emit(`qpay/${b}/${qpayObject.zakhialgiinDugaar}`);
      } else {
        console.warn("⚠️ [QPAY CALLBACK GADAA] socketio not set; skip emit");
      }
      if (qpayObject.zogsooliinId) {
        const body = {
          tukhainBaaziinKholbolt: kholbolt,
          turul: req.params.cameraIP == "dotor" ? "qpayUridchilsan" : "qpay",
          uilchluulegchiinId: qpayObject.zogsoolUilchluulegch.uId,
          paid_amount: qpayObject.zogsoolUilchluulegch.pay_amount,
          plate_number: qpayObject.zogsoolUilchluulegch.plate_number,
          barilgiinId: qpayObject.salbariinId,
          ajiltniiNer: "qpaySticker",
          zogsooliinId: qpayObject.zogsooliinId,
        };
      }
      if (
        !!req.params.mashiniiDugaar &&
        !!req.params.cameraIP &&
        req.params.cameraIP != "dotor"
      ) {
        const io = req.app.get("socketio");
        if (io) {
          io.emit(
            `qpayMobileSdk${req.params.baiguullagiinId}${req.params.cameraIP}`,
            {
              khaalgaTurul: "Гарах",
              turul: "qpayMobile",
              mashiniiDugaar: req.params.mashiniiDugaar,
              cameraIP: req.params.cameraIP,
              uilchluulegchiinId: qpayObject.zogsoolUilchluulegch.uId,
            },
          );
        }
      }
      console.log("✅ [QPAY CALLBACK GADAA] marked paid", {
        baiguullagiinId: b,
        zakhialgiinDugaar: qpayObject.zakhialgiinDugaar,
      });
      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);
router.get("/qpayObjectAvya", tokenShalgakh, async (req, res, next) => {
  try {
    const qpayObject = await QuickQpayObject(
      req.body.tukhainBaaziinKholbolt,
    ).findOne({
      invoice_id: req.query.invoice_id,
    });
    res.send(qpayObject);
  } catch (err) {
    next(err);
  }
});

router.get("/accountNumbers", async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const AccountNumber = require("../models/accountNumber");
    const { baiguullagiinId } = req.query;

    if (!baiguullagiinId) {
      return res.status(400).send({
        success: false,
        message: "baiguullagiinId is required",
      });
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
    );

    if (!tukhainBaaziinKholbolt) {
      return res.status(404).send({
        success: false,
        message: "Organization connection not found",
      });
    }

    const accountNumbers = await AccountNumber(tukhainBaaziinKholbolt).find({
      baiguullagiinId: baiguullagiinId,
    });

    res.send({
      success: true,
      data: accountNumbers,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/qpayGargaya", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const walletApiService = require("../services/walletApiService");

    // Auto-detect address source and route to appropriate QPay service
    // Now supports using Wallet QPay even if user also has baiguullagiinId
    let useWalletQPay = false;
    let userPhoneNumber = null;
    let detectedSource = "CUSTOM"; // CUSTOM or WALLET_API

    // Optional explicit override from frontend:
    // - addressSource: "WALLET_API" -> force Wallet QPay
    // - addressSource: "CUSTOM"     -> force custom QPay
    const addressSourceOverride = req.body.addressSource;

    // Try to get user from token to check address / wallet source
    try {
      const jwt = require("jsonwebtoken");
      if (req.headers.authorization) {
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
          const tokenObject = jwt.verify(token, process.env.APP_SECRET);
          if (tokenObject?.id && tokenObject.id !== "zochin") {
            const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
              .findById(tokenObject.id)
              .lean();
            if (orshinSuugch) {
              userPhoneNumber = orshinSuugch.utas;

              const hasWalletData =
                orshinSuugch.walletUserId ||
                (orshinSuugch.toots &&
                  orshinSuugch.toots.some((t) => t.source === "WALLET_API"));

              // 1) If frontend explicitly asks for Wallet QPay and wallet data exists, prefer WALLET_API
              if (addressSourceOverride === "WALLET_API" && hasWalletData) {
                detectedSource = "WALLET_API";
                useWalletQPay = true;
              }
              // 2) If frontend explicitly asks for CUSTOM, force custom
              else if (addressSourceOverride === "CUSTOM") {
                detectedSource = "CUSTOM";
                useWalletQPay = false;
              }
              // 3) Auto-detect: if user has wallet data, use Wallet QPay even if baiguullagiinId also exists
              else if (hasWalletData) {
                detectedSource = "WALLET_API";
                useWalletQPay = true;
              }
              // 4) Fallback: no wallet data -> custom QPay (OWN_ORG)
              else if (
                orshinSuugch.baiguullagiinId ||
                req.body.baiguullagiinId
              ) {
                detectedSource = "CUSTOM";
                useWalletQPay = false;
              }
            }
          }
        }
      }
    } catch (tokenError) {
      // Default to custom QPay if detection fails
      detectedSource = "CUSTOM";
      useWalletQPay = false;
    }

    // If useWalletQPay is true, route to Wallet API QPay
    if (useWalletQPay && userPhoneNumber) {
      try {
        // Create a safe copy of request body for logging (exclude Mongoose objects)
        const safeBody = {};
        for (const key in req.body) {
          if (
            (key !== "tukhainBaaziinKholbolt" &&
              key !== "erunkhiiKholbolt" &&
              typeof req.body[key] !== "object") ||
            req.body[key] === null ||
            Array.isArray(req.body[key]) ||
            req.body[key].constructor?.name === "String"
          ) {
            try {
              JSON.stringify(req.body[key]);
              safeBody[key] = req.body[key];
            } catch (e) {
              safeBody[key] = `[${typeof req.body[key]}]`;
            }
          } else {
            safeBody[key] =
              `[${req.body[key]?.constructor?.name || typeof req.body[key]}]`;
          }
        }

        let invoiceId = req.body.invoiceId || req.body.walletInvoiceId;

        // If invoiceId is not provided, but billingId and billIds are provided, create invoice first
        if (
          !invoiceId &&
          req.body.billingId &&
          req.body.billIds &&
          Array.isArray(req.body.billIds) &&
          req.body.billIds.length > 0
        ) {
          const invoiceData = {
            billingId: req.body.billingId,
            billIds: req.body.billIds,
            vatReceiveType: req.body.vatReceiveType || "CITIZEN",
            vatCompanyReg: req.body.vatCompanyReg || "",
          };

          try {
            const invoiceResult = await walletApiService.createInvoice(
              userPhoneNumber,
              invoiceData,
            );

            if (invoiceResult && invoiceResult.invoiceId) {
              invoiceId = invoiceResult.invoiceId;

              // --- Save Wallet invoice metadata in our MongoDB (erunkhiiKholbolt) ---
              try {
                const WalletInvoice = require("../models/walletInvoice");

                const erunkhiiKholbolt = db.erunkhiiKholbolt;
                const WalletInvoiceModel = WalletInvoice(erunkhiiKholbolt);

                // Try to find resident by phone to link orshinSuugchId
                const orshinSuugchModel = OrshinSuugch(db.erunkhiiKholbolt);
                const orshinSuugchDoc = await orshinSuugchModel
                  .findOne({ utas: userPhoneNumber })
                  .lean();

                await WalletInvoiceModel.create({
                  userId: userPhoneNumber,
                  orshinSuugchId: orshinSuugchDoc?._id?.toString() || null,
                  walletInvoiceId: invoiceResult.invoiceId,
                  billingId: invoiceData.billingId,
                  billIds: invoiceData.billIds || [],
                  billingName: invoiceResult.billingName || "",
                  customerId: invoiceResult.customerId || "",
                  customerName: invoiceResult.customerName || "",
                  customerAddress: invoiceResult.customerAddress || "",
                  totalAmount: invoiceResult.totalAmount || null,
                  source: "WALLET_API",
                });
              } catch (saveErr) {
                console.error(
                  "⚠️ [WALLET INVOICE] Failed to save wallet invoice:",
                  saveErr.message,
                );
              }
              // --- end save Wallet invoice metadata ---
            } else {
              throw new Error(
                "Failed to create invoice - invoiceId not returned",
              );
            }
          } catch (invoiceError) {
            // If invoice creation fails because bill is already in another invoice
            const errorMessage = invoiceError.message || "";

            // Check if error indicates bill is already being paid
            const isBillAlreadyInInvoice =
              errorMessage.includes("өөр нэхэмжлэлээр төлөлт") ||
              errorMessage.includes("already") ||
              errorMessage.includes("төлөлт хийгдэж") ||
              errorMessage.includes("Билл өөр нэхэмжлэлээр");

            if (isBillAlreadyInInvoice) {
              try {
                // Try to get existing payments for this billing
                const existingPayments =
                  await walletApiService.getBillingPayments(
                    userPhoneNumber,
                    req.body.billingId,
                  );

                if (existingPayments && existingPayments.length > 0) {
                  // Get the most recent payment
                  const latestPayment =
                    existingPayments[existingPayments.length - 1];

                  // Extract paymentId - it might be in different fields
                  const paymentId =
                    latestPayment.paymentId ||
                    latestPayment.id ||
                    latestPayment._id;

                  if (paymentId) {
                    // Fetch full payment details to get bank information
                    try {
                      const fullPaymentDetails =
                        await walletApiService.getPayment(
                          userPhoneNumber,
                          paymentId,
                        );

                      if (fullPaymentDetails) {
                        // Extract bank details from payment status
                        let bankCode = fullPaymentDetails.receiverBankCode;
                        let accountNo = fullPaymentDetails.receiverAccountNo;
                        let accountName =
                          fullPaymentDetails.receiverAccountName;

                        // Check in lines -> billTransactions
                        if (
                          !bankCode &&
                          fullPaymentDetails.lines &&
                          Array.isArray(fullPaymentDetails.lines)
                        ) {
                          for (const line of fullPaymentDetails.lines) {
                            if (
                              line.billTransactions &&
                              Array.isArray(line.billTransactions) &&
                              line.billTransactions.length > 0
                            ) {
                              const transaction = line.billTransactions[0];
                              bankCode =
                                bankCode || transaction.receiverBankCode;
                              accountNo =
                                accountNo || transaction.receiverAccountNo;
                              accountName =
                                accountName || transaction.receiverAccountName;
                              if (bankCode && accountNo) break;
                            }
                          }
                        }

                        // Return the existing payment with full details
                        return res.status(200).json({
                          success: true,
                          data: {
                            paymentId: paymentId,
                            paymentAmount:
                              fullPaymentDetails.amount ||
                              fullPaymentDetails.totalAmount ||
                              fullPaymentDetails.paymentAmount ||
                              latestPayment.paymentAmount ||
                              latestPayment.amount,
                            receiverBankCode: bankCode || "",
                            receiverAccountNo: accountNo || "",
                            receiverAccountName: accountName || "",
                            transactionDescription:
                              fullPaymentDetails.transactionDescription ||
                              latestPayment.transactionDescription ||
                              "",
                            paymentStatus: fullPaymentDetails.paymentStatus,
                            paymentStatusText:
                              fullPaymentDetails.paymentStatusText,
                            message: "Төлбөр аль хэдийн үүссэн байна",
                            existingPayment: true,
                          },
                          message:
                            "Төлбөр аль хэдийн үүссэн байна. Дээрх төлбөрийг ашиглана уу.",
                          source: "WALLET_API",
                        });
                      }
                    } catch (getPaymentError) {
                      // Fall through to return basic payment info
                    }

                    // If we couldn't get full details, return what we have
                    return res.status(200).json({
                      success: true,
                      data: {
                        paymentId: paymentId,
                        paymentAmount:
                          latestPayment.paymentAmount ||
                          latestPayment.amount ||
                          latestPayment.totalAmount,
                        receiverBankCode: latestPayment.receiverBankCode || "",
                        receiverAccountNo:
                          latestPayment.receiverAccountNo || "",
                        receiverAccountName:
                          latestPayment.receiverAccountName || "",
                        transactionDescription:
                          latestPayment.transactionDescription || "",
                        message: "Төлбөр аль хэдийн үүссэн байна",
                        existingPayment: true,
                      },
                      message:
                        "Төлбөр аль хэдийн үүссэн байна. Дээрх төлбөрийг ашиглана уу.",
                      source: "WALLET_API",
                    });
                  } else {
                  }
                } else {
                }
              } catch (paymentError) {
                // Don't throw - continue to return error about bill already in invoice
              }

              // If no existing payments found, return clear error
              return res.status(400).json({
                success: false,
                message: errorMessage,
                error: "BILL_ALREADY_IN_INVOICE",
                errorCode: "BILL_ALREADY_IN_INVOICE",
                suggestion:
                  "Энэ биллийг өөр нэхэмжлэлээр төлөлт хийгдэж байна. Төлбөрийн түүхийг шалгана уу.",
                billingId: req.body.billingId,
                billIds: req.body.billIds,
              });
            }

            // For other errors, re-throw
            throw invoiceError;
          }
        } else if (!invoiceId) {
        }

        // Check if invoiceId is available (required for Wallet API payment)
        if (!invoiceId) {
          const errorMsg =
            "Invoice ID is required for Wallet API QPay payment. " +
            "Please provide one of the following:\n" +
            "1. invoiceId (if invoice already created)\n" +
            "2. billingId + billIds[] (to auto-create invoice)\n\n" +
            "Current request has: " +
            Object.keys(req.body)
              .filter(
                (k) =>
                  ![
                    "tukhainBaaziinKholbolt",
                    "erunkhiiKholbolt",
                    "nevtersenAjiltniiToken",
                  ].includes(k),
              )
              .join(", ");
          throw new Error(errorMsg);
        }

        const paymentData = {
          invoiceId: invoiceId,
          // paymentMethod is not needed - Wallet API auto-detects QPay
        };

        const result = await walletApiService.createPayment(
          userPhoneNumber,
          paymentData,
        );

        // Check if bank details are in the initial createPayment response
        const hasInitialBankDetails =
          result.receiverBankCode && result.receiverAccountNo;

        // If bank details are empty, try to get full payment details
        if (!hasInitialBankDetails) {
          let bankCode = null;
          let accountNo = null;
          let accountName = null;
          let paymentStatus = null;
          let paymentStatusText = null;

          const initialDelay = 3000; // Wait 3 seconds for payment to be processed by Wallet API

          // Wait for payment to be processed by Wallet API
          await new Promise((resolve) => setTimeout(resolve, initialDelay));

          try {
            const fullPaymentDetails = await walletApiService.getPayment(
              userPhoneNumber,
              result.paymentId,
            );

            if (fullPaymentDetails) {
              paymentStatus = fullPaymentDetails.paymentStatus;
              paymentStatusText = fullPaymentDetails.paymentStatusText;

              // Try root level first
              bankCode = fullPaymentDetails.receiverBankCode;
              accountNo = fullPaymentDetails.receiverAccountNo;
              accountName = fullPaymentDetails.receiverAccountName;

              // Check in lines -> billTransactions (as seen in Postman collection)
              if (
                (!bankCode || !accountNo) &&
                fullPaymentDetails.lines &&
                Array.isArray(fullPaymentDetails.lines)
              ) {
                for (
                  let lineIdx = 0;
                  lineIdx < fullPaymentDetails.lines.length;
                  lineIdx++
                ) {
                  const line = fullPaymentDetails.lines[lineIdx];

                  if (
                    line.billTransactions &&
                    Array.isArray(line.billTransactions) &&
                    line.billTransactions.length > 0
                  ) {
                    bankCode = bankCode || transaction.receiverBankCode;
                    accountNo = accountNo || transaction.receiverAccountNo;
                    accountName =
                      accountName || transaction.receiverAccountName;

                    if (bankCode && accountNo) {
                      break;
                    }
                  } else {
                  }
                }
              } else {
                if (!fullPaymentDetails.lines) {
                }
              }

              if (bankCode && accountNo) {
              } else {
              }
            }
          } catch (getPaymentError) {}

          // Merge payment details with initial response
          Object.assign(result, {
            receiverBankCode: bankCode || result.receiverBankCode || "",
            receiverAccountNo: accountNo || result.receiverAccountNo || "",
            receiverAccountName:
              accountName || result.receiverAccountName || "",
            paymentStatus: paymentStatus || result.paymentStatus,
            paymentStatusText: paymentStatusText || result.paymentStatusText,
          });

          if (!bankCode || !accountNo) {
          }
        }

        // Check for QR code in response (Wallet may or may not provide it)
        // Wallet-Service may provide qrText or url in the payment response
        // If not provided, generate EMV QR code format from bank details

        // Check if bank details are still missing after retries
        const hasBankDetails =
          result.receiverBankCode && result.receiverAccountNo;

        // Check if Wallet-Service provided a QR code
        const walletQrText =
          result.qrText || result.qr_text || result.url || null;
        const walletQrUrl = result.url || result.invoice_url || null;

        const walletBankAmount =
          result.totalAmount || result.paymentAmount || result.amount || null;

        // Function to generate EMV QR code format for bank transfer
        // Mongolian banks use EMV QR Code standard (ISO 18004) for bank transfers
        const generateEMVQR = (
          bankCode,
          accountNo,
          accountName,
          amount,
          description,
        ) => {
          if (!bankCode || !accountNo || !amount) return null;

          // EMV QR Code format for Merchant-Presented Mode (MPM)
          // Structure: [Payload Format Indicator][Point of Initiation][Merchant Account Info][Merchant Category Code][Transaction Currency][Transaction Amount][Country Code][Merchant Name][Additional Data Field Template][CRC]

          // For bank transfers in Mongolia, we use a simplified format
          // Format: 000201010212[Merchant Account Info][Amount][Description]6304[CRC]

          const amountStr = Math.round(amount * 100).toString(); // Amount in smallest currency unit (tiyng)
          const merchantAccountInfo = `26${String(bankCode.length + accountNo.length + 2).padStart(2, "0")}${bankCode}${accountNo}`;
          const amountField = `54${String(amountStr.length).padStart(2, "0")}${amountStr}`;
          const currencyField = `5303${"496"}`; // 496 = MNT (Mongolian Tugrik)
          const countryCode = `5802${"MN"}`;
          const merchantName = `59${String((accountName || "").length).padStart(2, "0")}${accountName || ""}`;
          const additionalData = `62${String((description || "").length + 2).padStart(2, "0")}05${String((description || "").length).padStart(2, "0")}${description || ""}`;

          // Build QR payload
          const payload =
            `000201` + // Payload Format Indicator
            `0102` + // Point of Initiation (02 = dynamic)
            merchantAccountInfo +
            `5204${"0000"}` + // Merchant Category Code (0000 = default)
            currencyField +
            amountField +
            countryCode +
            merchantName +
            additionalData +
            `6304`; // CRC placeholder

          // Calculate CRC16-CCITT
          const calculateCRC = (data) => {
            let crc = 0xffff;
            for (let i = 0; i < data.length; i++) {
              crc ^= data.charCodeAt(i) << 8;
              for (let j = 0; j < 8; j++) {
                if (crc & 0x8000) {
                  crc = (crc << 1) ^ 0x1021;
                } else {
                  crc <<= 1;
                }
              }
            }
            return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
          };

          const crc = calculateCRC(payload);
          const qrString = payload + crc;

          return qrString;
        };

        // Generate QR code if we have bank details
        let walletBankQrText = walletQrText;
        let walletBankQr = null;

        if (walletQrText) {
          // Wallet-Service provided QR - use it directly
          walletBankQr = {
            qrText: walletQrText,
            type: "WALLET_PROVIDED_QR",
          };
        } else if (hasBankDetails && walletBankAmount) {
          // Generate EMV QR code from bank details
          const generatedQR = generateEMVQR(
            result.receiverBankCode,
            result.receiverAccountNo,
            result.receiverAccountName || "",
            walletBankAmount,
            result.transactionDescription || result.transactionDescrion || "",
          );

          if (generatedQR) {
            walletBankQrText = generatedQR;
            walletBankQr = {
              type: "WALLET_EMV_QR",
              qrText: generatedQR,
              paymentId: result.paymentId || "",
              invoiceId: invoiceId || "",
              receiverBankCode: result.receiverBankCode,
              receiverAccountNo: result.receiverAccountNo,
              receiverAccountName: result.receiverAccountName || "",
              amount: walletBankAmount,
              currency: "MNT",
              description:
                result.transactionDescription ||
                result.transactionDescrion ||
                "",
            };
          } else {
            // Fallback: bank details without QR
            walletBankQr = {
              type: "WALLET_BANK_DETAILS",
              paymentId: result.paymentId || "",
              invoiceId: invoiceId || "",
              receiverBankCode: result.receiverBankCode,
              receiverAccountNo: result.receiverAccountNo,
              receiverAccountName: result.receiverAccountName || "",
              amount: walletBankAmount,
              currency: "MNT",
              description:
                result.transactionDescription ||
                result.transactionDescrion ||
                "",
            };
            walletBankQrText = JSON.stringify(walletBankQr);
          }
        }

        return res.status(200).json({
          success: true,
          data: result,
          message: hasBankDetails
            ? "QPay төлбөр амжилттай үүсгэлээ"
            : "Төлбөр үүссэн. Банкны мэдээлэл бэлтгэж байна. Түр хүлээнэ үү.",
          source: "WALLET_API",
          invoiceId: invoiceId, // Return invoiceId in case frontend needs it
          needsPolling: !hasBankDetails, // Flag to indicate frontend should poll for bank details
          pollingEndpoint: hasBankDetails
            ? null
            : `/api/payment/${result.paymentId}`, // Endpoint to poll (relative path)
          walletBankQr,
          walletBankQrText,
        });
      } catch (walletQPayError) {
        // Fall back to custom QPay if Wallet QPay fails
        useWalletQPay = false;
        detectedSource = "CUSTOM";
      }
    }

    // Continue with custom QPay (OWN_ORG or fallback)
    if (req.body.baiguullagiinId) {
      const kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(req.body.baiguullagiinId),
      );
      if (kholbolt) req.body.tukhainBaaziinKholbolt = kholbolt;
    }

    var maxDugaar = 1;
    await Dugaarlalt(req.body.tukhainBaaziinKholbolt)
      .find({
        baiguullagiinId: req.body.baiguullagiinId,
        barilgiinId: req.body.barilgiinId,
        turul: "qpay",
      })
      .sort({
        dugaar: -1,
      })
      .limit(1)
      .then((result) => {
        if (result != 0) maxDugaar = result[0].dugaar + 1;
      });

    // Parking / generic QPay: clients often omit zakhialgiinDugaar → callback URL ends with
    // "/undefined". Use the same Dugaarlalt counter as the persisted row below.
    const zakhialgiinDugaarInvalid = (v) =>
      v == null ||
      v === "" ||
      (typeof v === "string" &&
        (v.trim() === "" || v === "undefined" || v === "null"));
    if (zakhialgiinDugaarInvalid(req.body.zakhialgiinDugaar)) {
      req.body.zakhialgiinDugaar = String(maxDugaar);
      console.log(
        "ℹ️ [QPAY GARGAYA] zakhialgiinDugaar missing or invalid — assigned from Dugaarlalt:",
        req.body.zakhialgiinDugaar,
      );
    }

    if (req.body.baiguullagiinId == "664ac9b28bfeed5bdce01388") {
      req.body.dansniiDugaar = "5069538136";
      req.body.burtgeliinDugaar = "6078893";
      await qpayGargayaKhuuchin(req, res, next);
    } else {
      var tailbar =
        "Төлбөр " +
        (req.body.mashiniiDugaar ? req.body.mashiniiDugaar : "") +
        (req.body.turul ? req.body.turul : "");
      if (!!req.body.gereeniiId) {
        var geree = await Geree(req.body.tukhainBaaziinKholbolt, true).findById(
          req.body.gereeniiId,
        );
        tailbar = " " + geree.gereeniiDugaar;
      }
      if (req.body?.nevtersenAjiltniiToken?.id == "66384a9061eeda747d01a320")
        req.body.dansniiDugaar = "416075707";
      else if (
        req.body.baiguullagiinId == "6115f350b35689cdbf1b9da3" &&
        !req.body.gereeniiId &&
        !req.body.dansniiDugaar
      )
        req.body.dansniiDugaar = "5129057717";
      if (req.body.baiguullagiinId == "65cf2f027fbc788f85e50b90")
        req.body.dansniiDugaar = "5112418947";
      req.body.tailbar = tailbar;
      var callback_url =
        process.env.UNDSEN_SERVER +
        "/qpaycallback/" +
        req.body.baiguullagiinId +
        "/" +
        req.body?.zakhialgiinDugaar;
      if (
        req.body.turul === "QRGadaa" &&
        !!req.body.mashiniiDugaar &&
        !!req.body.cameraIP
      ) {
        callback_url =
          process.env.UNDSEN_SERVER +
          "/qpaycallbackGadaaSticker/" +
          req.body.baiguullagiinId +
          "/" +
          req.body.barilgiinId.toString() +
          "/" +
          req.body.mashiniiDugaar +
          "/" +
          req.body.cameraIP +
          "/" +
          req.body?.zakhialgiinDugaar;
      }

      if (req.body.gereeniiId && req.body.dansniiDugaar) {
        callback_url =
          process.env.UNDSEN_SERVER +
          "/qpayTulye/" +
          req.body.baiguullagiinId.toString() +
          "/" +
          req.body.barilgiinId.toString() +
          "/" +
          maxDugaar.toString();

        req.body.zakhialgiinDugaar = maxDugaar.toString();
        if (req.body.dun > 0) {
          // qpayShimtgel feature removed
        }
      }

      // Handle multiple invoices payment
      if (
        req.body.nekhemjlekhiinTuukh &&
        Array.isArray(req.body.nekhemjlekhiinTuukh)
      ) {
        // Multiple invoices payment
        if (!req.body.tukhainBaaziinKholbolt) {
          req.body.tukhainBaaziinKholbolt = db.kholboltuud.find(
            (k) =>
              String(k.baiguullagiinId) === String(req.body.baiguullagiinId),
          );
        }

        const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
        const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
        const invoiceIds = req.body.nekhemjlekhiinTuukh;

        // Fetch all invoices
        const invoices = await nekhemjlekhiinTuukh(
          req.body.tukhainBaaziinKholbolt,
        )
          .find({ _id: { $in: invoiceIds } })
          .lean();

        if (invoices.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Нэхэмжлэхүүд олдсонгүй",
          });
        }

        // Calculate total amount if not provided
        if (!req.body.dun) {
          const invoiceAmounts = await Promise.all(
            invoices.map(async (inv) => {
              const invDate =
                inv.ognoo || inv.nekhemjlekhiinOgnoo || inv.createdAt;
              const d = invDate ? new Date(invDate) : new Date();
              const monthStart = new Date(
                d.getFullYear(),
                d.getMonth(),
                1,
                0,
                0,
                0,
                0,
              );
              const monthEnd = new Date(
                d.getFullYear(),
                d.getMonth() + 1,
                0,
                23,
                59,
                59,
                999,
              );
              const avlagaRows = await GuilgeeAvlaguud(
                req.body.tukhainBaaziinKholbolt,
              )
                .find({
                  baiguullagiinId: String(req.body.baiguullagiinId),
                  gereeniiId: String(inv.gereeniiId),
                  ognoo: { $gte: monthStart, $lte: monthEnd },
                  uldegdel: { $gt: 0 },
                })
                .select("uldegdel undsenDun tulukhDun")
                .lean();
              const avlagaSum =
                Math.round(
                  avlagaRows.reduce(
                    (s, r) =>
                      s +
                      (Number(r.uldegdel) ||
                        Number(r.undsenDun) ||
                        Number(r.tulukhDun) ||
                        0),
                    0,
                  ) * 100,
                ) / 100;
              return (
                Math.round(((Number(inv.niitTulbur) || 0) + avlagaSum) * 100) /
                100
              );
            }),
          );
          const totalAmount = invoiceAmounts.reduce((sum, amt) => sum + amt, 0);
          req.body.dun = totalAmount.toString();
        }

        // Get common fields from first invoice
        const firstInvoice = invoices[0];
        if (!req.body.barilgiinId && firstInvoice.barilgiinId) {
          req.body.barilgiinId = firstInvoice.barilgiinId;
        }
        if (!req.body.dansniiDugaar && firstInvoice.dansniiDugaar) {
          req.body.dansniiDugaar = firstInvoice.dansniiDugaar;
        }

        // For multiple invoices, use the barilgiinId from the first invoice
        // The QpayKhariltsagch lookup below will handle getting the correct bank account

        // Create callback URL with comma-separated invoice IDs
        const invoiceIdsString = invoiceIds.join(",");
        callback_url =
          process.env.UNDSEN_SERVER +
          "/qpayNekhemjlekhMultipleCallback/" +
          req.body.baiguullagiinId.toString() +
          "/" +
          invoiceIdsString;
      } else if (req.body.nekhemjlekhiinId) {
        // Single invoice payment (existing logic)
        callback_url =
          process.env.UNDSEN_SERVER +
          "/qpayNekhemjlekhCallback/" +
          req.body.baiguullagiinId.toString() +
          "/" +
          req.body.nekhemjlekhiinId.toString();

        if (!req.body.dun && req.body.tukhainBaaziinKholbolt) {
          try {
            const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
            const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
            const nekhemjlekh = await nekhemjlekhiinTuukh(
              req.body.tukhainBaaziinKholbolt,
            )
              .findById(req.body.nekhemjlekhiinId)
              .lean();
            if (nekhemjlekh) {
              const invDate =
                nekhemjlekh.ognoo ||
                nekhemjlekh.nekhemjlekhiinOgnoo ||
                nekhemjlekh.createdAt;
              const d = invDate ? new Date(invDate) : new Date();
              const monthStart = new Date(
                d.getFullYear(),
                d.getMonth(),
                1,
                0,
                0,
                0,
                0,
              );
              const monthEnd = new Date(
                d.getFullYear(),
                d.getMonth() + 1,
                0,
                23,
                59,
                59,
                999,
              );
              const avlagaRows = await GuilgeeAvlaguud(
                req.body.tukhainBaaziinKholbolt,
              )
                .find({
                  baiguullagiinId: String(req.body.baiguullagiinId),
                  gereeniiId: String(nekhemjlekh.gereeniiId),
                  ognoo: { $gte: monthStart, $lte: monthEnd },
                  uldegdel: { $gt: 0 },
                })
                .select("uldegdel undsenDun tulukhDun")
                .lean();
              const avlagaSum =
                Math.round(
                  avlagaRows.reduce(
                    (s, r) =>
                      s +
                      (Number(r.uldegdel) ||
                        Number(r.undsenDun) ||
                        Number(r.tulukhDun) ||
                        0),
                    0,
                  ) * 100,
                ) / 100;
              const payableAmount =
                Math.round(
                  ((Number(nekhemjlekh.niitTulbur) || 0) + avlagaSum) * 100,
                ) / 100;
              if (payableAmount > 0) {
                req.body.dun = payableAmount.toString();
              }
              if (!req.body.barilgiinId && nekhemjlekh.barilgiinId) {
                req.body.barilgiinId = nekhemjlekh.barilgiinId;
              }
              if (!req.body.dansniiDugaar && nekhemjlekh.dansniiDugaar) {
                req.body.dansniiDugaar = nekhemjlekh.dansniiDugaar;
              }
              if (!req.body.gereeniiId && nekhemjlekh.gereeniiId) {
                req.body.gereeniiId = nekhemjlekh.gereeniiId;
              }
            } else {
            }
          } catch (err) {}
        }
      }

      // Fetch QpayKhariltsagch to get building-specific bank account
      // This should happen after barilgiinId is determined
      if (req.body.barilgiinId && req.body.tukhainBaaziinKholbolt) {
        try {
          const { Dans } = require("zevbackv2");
          const qpayKhariltsagch = new QpayKhariltsagch(
            req.body.tukhainBaaziinKholbolt,
          );
          const qpayConfig = await qpayKhariltsagch
            .findOne({
              baiguullagiinId: req.body.baiguullagiinId,
            })
            .lean();

          if (
            qpayConfig &&
            qpayConfig.salbaruud &&
            Array.isArray(qpayConfig.salbaruud)
          ) {
            // Find the salbar that matches barilgiinId (salbariinId)
            const targetSalbar = qpayConfig.salbaruud.find(
              (salbar) =>
                String(salbar.salbariinId) === String(req.body.barilgiinId),
            );

            if (
              targetSalbar &&
              targetSalbar.bank_accounts &&
              Array.isArray(targetSalbar.bank_accounts) &&
              targetSalbar.bank_accounts.length > 0
            ) {
              // Use the first bank account from this salbar
              const bankAccount = targetSalbar.bank_accounts[0];
              const newDansniiDugaar =
                bankAccount.account_number || req.body.dansniiDugaar;

              // Check if this account exists in Dans model with merchant credentials
              const dansModel = Dans(req.body.tukhainBaaziinKholbolt);
              const dansWithMerchant = await dansModel
                .findOne({
                  dugaar: newDansniiDugaar,
                  baiguullagiinId: req.body.baiguullagiinId,
                })
                .lean();

              if (dansWithMerchant && dansWithMerchant.qpayAshiglakhEsekh) {
                // Account exists in Dans with QPay enabled, use it
                req.body.dansniiDugaar = newDansniiDugaar;
                req.body.burtgeliinDugaar =
                  bankAccount.account_bank_code || req.body.burtgeliinDugaar;
              } else {
                // Account doesn't exist in Dans or doesn't have QPay enabled
                // Try to find a Dans entry for this barilga with QPay enabled
                let fallbackDans = await dansModel
                  .findOne({
                    baiguullagiinId: req.body.baiguullagiinId,
                    barilgiinId: req.body.barilgiinId,
                    qpayAshiglakhEsekh: true,
                  })
                  .lean();

                if (!fallbackDans) {
                  // Try organization-level Dans (without barilgiinId filter)
                  fallbackDans = await dansModel
                    .findOne({
                      baiguullagiinId: req.body.baiguullagiinId,
                      qpayAshiglakhEsekh: true,
                    })
                    .lean();
                }

                if (fallbackDans) {
                  // Use the Dans account number for merchant credentials lookup
                  // But we can still use building-specific account for display if needed
                  req.body.dansniiDugaar = fallbackDans.dugaar;
                  req.body.burtgeliinDugaar =
                    bankAccount.account_bank_code || req.body.burtgeliinDugaar;
                } else {
                  // Don't change dansniiDugaar if no valid Dans found
                }
              }
            } else {
            }
          } else {
          }
        } catch (qpayConfigError) {
          // Continue with existing dansniiDugaar if error occurs
        }
      }

      let khariu;
      try {
        khariu = await qpayGargaya(
          req.body,
          callback_url,
          req.body.tukhainBaaziinKholbolt,
        );
      } catch (qpayError) {
        // Enhanced error logging for QPay errors
        let errorBody = null;
        try {
          // Try to extract response body in different ways
          if (qpayError?.response?.body !== undefined) {
            errorBody =
              typeof qpayError.response.body === "string"
                ? qpayError.response.body
                : JSON.stringify(qpayError.response.body);
          } else if (qpayError?.body !== undefined) {
            errorBody =
              typeof qpayError.body === "string"
                ? qpayError.body
                : JSON.stringify(qpayError.body);
          } else if (qpayError?.response) {
            // Response exists but body is undefined
            errorBody = "Response exists but body is undefined";
          } else {
            errorBody = "No response object found";
          }
        } catch (parseError) {
          errorBody = "Could not parse error body: " + parseError.message;
        }

        throw qpayError;
      }

      // Handle saving QPay info for multiple invoices
      if (
        req.body.nekhemjlekhiinTuukh &&
        Array.isArray(req.body.nekhemjlekhiinTuukh) &&
        khariu
      ) {
        try {
          const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
          const kholbolt = db.kholboltuud.find(
            (a) =>
              String(a.baiguullagiinId) === String(req.body.baiguullagiinId),
          );

          if (!kholbolt) {
            throw new Error("Tenant connection not found");
          }

          const invoiceId = khariu.invoice_id || khariu.invoiceId || khariu.id;
          const qpayUrl =
            khariu.qr_text ||
            khariu.url ||
            khariu.invoice_url ||
            khariu.qr_image;

          // Update all invoices with QPay info
          await nekhemjlekhiinTuukh(kholbolt).updateMany(
            { _id: { $in: req.body.nekhemjlekhiinTuukh } },
            {
              qpayInvoiceId: invoiceId,
              qpayUrl: qpayUrl,
            },
          );
        } catch (saveErr) {}
      } else if (req.body.nekhemjlekhiinId && khariu) {
        // Single invoice payment (existing logic)
        try {
          const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
          const kholbolt = db.kholboltuud.find(
            (a) =>
              String(a.baiguullagiinId) === String(req.body.baiguullagiinId),
          );

          if (!kholbolt) {
            throw new Error("Tenant connection not found");
          }

          const invoiceId = khariu.invoice_id || khariu.invoiceId || khariu.id;
          const qpayUrl =
            khariu.qr_text ||
            khariu.url ||
            khariu.invoice_url ||
            khariu.qr_image;

          const nekhemjlekh = await nekhemjlekhiinTuukh(kholbolt).findById(
            req.body.nekhemjlekhiinId,
          );

          if (nekhemjlekh) {
            await nekhemjlekhiinTuukh(kholbolt).findByIdAndUpdate(
              req.body.nekhemjlekhiinId,
              {
                qpayInvoiceId: invoiceId,
                qpayUrl: qpayUrl,
              },
            );

            if (invoiceId && nekhemjlekh._id) {
              const nekhemjlekhiinId = nekhemjlekh._id.toString();
              const sukhemjlekhData = {
                nekhemjlekhiinId: nekhemjlekhiinId,
                gereeniiDugaar: nekhemjlekh.gereeniiDugaar || "",
                utas: nekhemjlekh.utas?.[0] || "",
                pay_amount: (
                  nekhemjlekh.niitTulbur ||
                  req.body.dun ||
                  ""
                ).toString(),
              };

              const updateNekhemjlekhData = async () => {
                let updated = null;

                updated = await QuickQpayObject(kholbolt).findOneAndUpdate(
                  { invoice_id: invoiceId },
                  { sukhNekhemjlekh: sukhemjlekhData },
                  { new: true },
                );

                if (updated) {
                  return;
                }

                if (!updated && nekhemjlekhiinId) {
                  updated = await QuickQpayObject(kholbolt).findOneAndUpdate(
                    {
                      baiguullagiinId: req.body.baiguullagiinId,
                      "qpay.callback_url": { $regex: nekhemjlekhiinId },
                    },
                    { sukhNekhemjlekh: sukhemjlekhData },
                    { new: true },
                  );
                  if (updated) {
                    return;
                  }
                }

                if (!updated && req.body.zakhialgiinDugaar) {
                  updated = await QuickQpayObject(kholbolt).findOneAndUpdate(
                    {
                      zakhialgiinDugaar: req.body.zakhialgiinDugaar,
                      baiguullagiinId: req.body.baiguullagiinId,
                      ognoo: { $gte: new Date(Date.now() - 60000) }, // Last minute
                    },
                    { sukhNekhemjlekh: sukhemjlekhData },
                    { new: true },
                  );
                  if (updated) {
                    return;
                  }
                }

                if (!updated && nekhemjlekhiinId) {
                  const recent = await QuickQpayObject(kholbolt)
                    .findOne({
                      baiguullagiinId: req.body.baiguullagiinId,
                      "qpay.callback_url": { $regex: nekhemjlekhiinId },
                    })
                    .sort({ ognoo: -1 })
                    .limit(1);
                  if (recent) {
                    updated = await QuickQpayObject(kholbolt).findByIdAndUpdate(
                      recent._id,
                      { sukhNekhemjlekh: sukhemjlekhData },
                      { new: true },
                    );
                    if (updated) {
                      return;
                    }
                  }
                }

                if (!updated) {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  updated = await QuickQpayObject(kholbolt).findOneAndUpdate(
                    { invoice_id: invoiceId },
                    { sukhNekhemjlekh: sukhemjlekhData },
                    { new: true },
                  );
                  if (updated) {
                    return;
                  }
                }

                if (!updated) {
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  updated = await QuickQpayObject(kholbolt).findOneAndUpdate(
                    { invoice_id: invoiceId },
                    { sukhNekhemjlekh: sukhemjlekhData },
                    { new: true },
                  );
                  if (updated) {
                  }
                }
              };

              updateNekhemjlekhData().catch((err) => {});
            } else {
            }
          } else {
          }
        } catch (saveErr) {}
      } else {
      }

      var dugaarlalt = new Dugaarlalt(req.body.tukhainBaaziinKholbolt)();
      dugaarlalt.baiguullagiinId = req.body.baiguullagiinId;
      dugaarlalt.barilgiinId = req.body.barilgiinId;
      dugaarlalt.ognoo = new Date();
      dugaarlalt.turul = "qpay";
      dugaarlalt.dugaar = maxDugaar;
      await dugaarlalt.save();

      res.send(khariu);
    }
  } catch (err) {
    next(err);
  }
});

router.post("/qpayShalgay", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    let baiguullagiinId = req.body.baiguullagiinId;
    let tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;

    console.log(
      `🔍 [QPAY] Status Check: invoice_id=${req.body.invoice_id}, baiguullagiinId=${baiguullagiinId}`,
    );

    // Resolve connection object correctly
    if (baiguullagiinId) {
      const kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
      );
      if (kholbolt) {
        console.log(
          `✅ [QPAY] Resolved connection for org: ${baiguullagiinId}`,
        );
        tukhainBaaziinKholbolt = kholbolt;
        req.body.tukhainBaaziinKholbolt = kholbolt;
      } else {
        console.warn(
          `⚠️ [QPAY] No connection found for org: ${baiguullagiinId} in registry of ${db.kholboltuud.length} connections`,
        );
      }
    } else {
      console.warn(
        `⚠️ [QPAY] No baiguullagiinId provided in body: ${JSON.stringify(req.body)}`,
      );
      // Fallback: If there's ONLY ONE connection in the pool, use it as a best-effort fallback
      if (db.kholboltuud.length === 1) {
        console.log(
          `ℹ️ [QPAY] Best-effort fallback using the only connection: ${db.kholboltuud[0].baiguullagiinId}`,
        );
        tukhainBaaziinKholbolt = db.kholboltuud[0];
        req.body.baiguullagiinId = db.kholboltuud[0].baiguullagiinId;
        req.body.tukhainBaaziinKholbolt = db.kholboltuud[0];
      }
    }

    const khariu = await qpayShalgay(req.body, tukhainBaaziinKholbolt);
    res.send(khariu);
  } catch (err) {
    // If QPay API itself returns 500, try to fall back to DB invoice status
    // (BPay-format invoices stored with invoice_status field instead of QPay payments[])
    try {
      const { db } = require("zevbackv2");
      const invoiceId = req.body.invoice_id;
      const baiguullagiinId = req.body.baiguullagiinId;

      if (invoiceId) {
        // Look up in QuickQpayObject by invoice_id
        let kholbolt = req.body.tukhainBaaziinKholbolt;
        if ((!kholbolt || typeof kholbolt !== "object") && baiguullagiinId) {
          kholbolt = db.kholboltuud.find(
            (k) => String(k.baiguullagiinId) === String(baiguullagiinId),
          );
        }

        if (kholbolt) {
          const qpayObj = await QuickQpayObject(kholbolt)
            .findOne({
              invoice_id: invoiceId,
            })
            .lean();

          if (qpayObj) {
            // Return a synthetic response that the app can parse
            const isPaid =
              qpayObj.tulsunEsekh === true ||
              qpayObj.invoice_status === "PAID" ||
              qpayObj.invoice_status === "CLOSED";

            return res.send({
              invoice_id: invoiceId,
              invoice_status: isPaid ? "PAID" : "OPEN",
              tuluv: isPaid ? "Төлсөн" : "Төлөөгүй",
              paid_amount: isPaid ? qpayObj.qpay?.amount || 0 : 0,
              payments: isPaid
                ? [
                    {
                      payment_status: "PAID",
                      status: "PAID",
                      amount: qpayObj.qpay?.amount || 0,
                      transactions: [],
                    },
                  ]
                : [],
            });
          }
        }
      }
    } catch (fallbackErr) {
      console.error(
        "❌ [QPAY SHALGAY] Fallback DB lookup also failed:",
        fallbackErr.message,
      );
    }

    // If fallback also fails, return not-paid response (don't crash)
    const invoiceId = req.body.invoice_id;
    return res.send({
      invoice_id: invoiceId || null,
      invoice_status: "OPEN",
      tuluv: "Төлөөгүй",
      paid_amount: 0,
      payments: [],
    });
  }
});
router.post("/qpayGuilgeeUtgaAvya", tokenShalgakh, qpayGuilgeeUtgaAvya);

router.get(
  "/nekhemjlekhPaymentStatus/:baiguullagiinId/:nekhemjlekhiinId",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

      const baiguullagiinId = req.params.baiguullagiinId;
      const nekhemjlekhiinId = req.params.nekhemjlekhiinId;

      const kholbolt = db.kholboltuud.find(
        (a) => a.baiguullagiinId == baiguullagiinId,
      );

      if (!kholbolt) {
        return res.status(404).send("Organization not found");
      }

      const nekhemjlekh =
        await nekhemjlekhiinTuukh(kholbolt).findById(nekhemjlekhiinId);

      if (!nekhemjlekh) {
        return res.status(404).send("Invoice not found");
      }

      res.send({
        success: true,
        nekhemjlekh: {
          _id: nekhemjlekh._id,
          dugaalaltDugaar: nekhemjlekh.dugaalaltDugaar,
          niitTulbur: nekhemjlekh.niitTulbur,
          tuluv: nekhemjlekh.tuluv,
          tulsunOgnoo: nekhemjlekh.tulsunOgnoo,
          qpayPaymentId: nekhemjlekh.qpayPaymentId,
          qpayInvoiceId: nekhemjlekh.qpayInvoiceId,
          qpayUrl: nekhemjlekh.qpayUrl,
          canPay: nekhemjlekh.canPay,
          paymentHistory: nekhemjlekh.paymentHistory,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/qpayKhariltsagchUusgey",
  tokenShalgakh,
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const incomingBody = req.body || {};
      if (!incomingBody.register) {
        return res.status(400).send({
          success: false,
          message: "register is required",
        });
      }

      var baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findOne({
        register: incomingBody.register,
      });
      if (!baiguullaga) {
        return res.status(404).send({
          success: false,
          message: "Organization not found for register",
        });
      }

      var kholbolt = db.kholboltuud.find(
        (a) => a.baiguullagiinId == baiguullaga._id,
      );
      if (!kholbolt) {
        return res.status(404).send({
          success: false,
          message: "Organization connection not found",
        });
      }

      const normalizedBody = {
        ...incomingBody,
        baiguullagiinId: baiguullaga._id,
        // quickqpaypack expects explicit type and register_number.
        type:
          incomingBody.type ||
          (String(incomingBody.system || "").toLowerCase() === "person"
            ? "PERSON"
            : "COMPANY"),
        register_number:
          incomingBody.register_number ||
          incomingBody.register ||
          baiguullaga.register,
        name: incomingBody.name || baiguullaga.ner || "",
        first_name: incomingBody.first_name || incomingBody.firstName || "",
        last_name: incomingBody.last_name || incomingBody.lastName || "",
        // Accept common alias keys from different clients.
        mashiniiDugaar:
          incomingBody.mashiniiDugaar ||
          incomingBody.dugaar ||
          incomingBody.plate_number,
        CAMERA_IP:
          incomingBody.CAMERA_IP ||
          incomingBody.cameraIp ||
          incomingBody.camera_ip,
        barilgiinId:
          incomingBody.barilgiinId ||
          incomingBody.salbariinId ||
          incomingBody.branchId,
      };

      delete normalizedBody.tukhainBaaziinKholbolt;
      delete normalizedBody.erunkhiiKholbolt;

      var khariu = await qpayKhariltsagchUusgey(normalizedBody, kholbolt);
      if (khariu === "Amjilttai") {
        res.send(khariu);
      } else throw new Error(khariu);
    } catch (err) {
      next(err);
    }
  },
);

router.post("/qpayKhariltsagchAvay", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    var baiguullaga1 = await Baiguullaga(db.erunkhiiKholbolt).findOne({
      register: req.body.register,
    });
    var kholbolt = db.kholboltuud.find(
      (a) => a.baiguullagiinId == baiguullaga1._id,
    );
    var qpayKhariltsagch = new QpayKhariltsagch(kholbolt);

    req.body.baiguullagiinId = baiguullaga1._id;
    const baiguullaga = await qpayKhariltsagch.findOne({
      baiguullagiinId: req.body.baiguullagiinId,
    });
    if (baiguullaga) res.send(baiguullaga);
    else res.send(undefined);
  } catch (err) {
    next(err);
  }
});

router.get("/qpayBankAccounts", tokenShalgakh, async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, salbariinId } = req.query;

    if (!baiguullagiinId) {
      return res.status(400).send({
        success: false,
        message: "baiguullagiinId is required",
      });
    }

    var kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(baiguullagiinId),
    );

    if (!kholbolt) {
      return res.status(404).send({
        success: false,
        message: "Organization connection not found",
      });
    }

    var qpayKhariltsagch = new QpayKhariltsagch(kholbolt);
    const qpayConfig = await qpayKhariltsagch
      .findOne({
        baiguullagiinId: baiguullagiinId,
      })
      .lean();

    if (
      !qpayConfig ||
      !qpayConfig.salbaruud ||
      !Array.isArray(qpayConfig.salbaruud)
    ) {
      return res.send({
        success: true,
        bank_accounts: [],
      });
    }

    // If salbariinId is provided, get bank_accounts for that specific salbar
    if (salbariinId) {
      const targetSalbar = qpayConfig.salbaruud.find(
        (salbar) => String(salbar.salbariinId) === String(salbariinId),
      );

      if (targetSalbar && targetSalbar.bank_accounts) {
        return res.send({
          success: true,
          bank_accounts: targetSalbar.bank_accounts,
        });
      } else {
        return res.send({
          success: true,
          bank_accounts: [],
        });
      }
    }

    // If no salbariinId, return all bank_accounts from all salbaruud
    const allBankAccounts = qpayConfig.salbaruud
      .filter(
        (salbar) => salbar.bank_accounts && salbar.bank_accounts.length > 0,
      )
      .flatMap((salbar) => salbar.bank_accounts);

    res.send({
      success: true,
      bank_accounts: allBankAccounts,
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/qpayNekhemjlekhCallback/:baiguullagiinId/:nekhemjlekhiinId",
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

      const baiguullagiinId = req.params.baiguullagiinId;
      const nekhemjlekhiinId = req.params.nekhemjlekhiinId;

      const kholbolt = db.kholboltuud.find(
        (a) => String(a.baiguullagiinId) === String(baiguullagiinId),
      );

      if (!kholbolt) {
        return res.status(404).send("Organization not found");
      }

      const nekhemjlekh =
        await nekhemjlekhiinTuukh(kholbolt).findById(nekhemjlekhiinId);

      if (!nekhemjlekh) {
        return res.status(404).send("Invoice not found");
      }

      if (nekhemjlekh.tuluv === "Төлсөн") {
        return res.status(200).send("Payment already completed");
      }

      let paymentTransactionId = null;
      let actualPaidAmountFromQPay = null;

      if (nekhemjlekh.qpayInvoiceId) {
        try {
          const khariu = await qpayShalgay(
            { invoice_id: nekhemjlekh.qpayInvoiceId },
            kholbolt,
          );
          if (khariu?.payments?.[0]?.transactions?.[0]?.id) {
            paymentTransactionId = khariu.payments[0].transactions[0].id;
            nekhemjlekh.qpayPaymentId = paymentTransactionId;

            // Get actual paid amount from QPay if available
            if (khariu.payments[0].amount) {
              actualPaidAmountFromQPay = parseFloat(khariu.payments[0].amount);
            }
          }
        } catch (err) {}
      }

      if (!paymentTransactionId && req.query.qpay_payment_id) {
        paymentTransactionId = req.query.qpay_payment_id;
        nekhemjlekh.qpayPaymentId = paymentTransactionId;
      }

      // Calculate uldegdel properly based on actual paid amount
      // Prefer amount from QPay if local niitTulbur is zero or doesn't match
      const paidAmount =
        actualPaidAmountFromQPay || nekhemjlekh.niitTulbur || 0;
      const currentUldegdel =
        typeof nekhemjlekh.uldegdel === "number" &&
        !isNaN(nekhemjlekh.uldegdel) &&
        nekhemjlekh.uldegdel > 0
          ? nekhemjlekh.uldegdel
          : nekhemjlekh.niitTulbur || paidAmount;

      const newUldegdel = Math.max(0, currentUldegdel - paidAmount);
      const isFullyPaid = newUldegdel <= 0.01;

      nekhemjlekh.tuluv = isFullyPaid ? "Төлсөн" : "Төлөөгүй";
      nekhemjlekh.tulsunOgnoo = new Date();
      // uldegdel removed - now tracked in GuilgeeAvlaguud ledger

      nekhemjlekh.paymentHistory = nekhemjlekh.paymentHistory || [];
      nekhemjlekh.paymentHistory.push({
        ognoo: new Date(),
        dun: paidAmount,
        turul: "төлөлт",
        guilgeeniiId:
          paymentTransactionId || nekhemjlekh.qpayInvoiceId || "unknown",
        tailbar: "QPay төлбөр амжилттай хийгдлээ",
      });

      await nekhemjlekh.save();

      // Ensure bank record also uses the correct amount
      const finalPaidAmountForBank = paidAmount;

      // NOTE: Do NOT reset geree.ekhniiUldegdel to 0 here.
      // The recalculation formula depends on it as a permanent charge component.
      // invoiceCreationService prevents double-counting via existingEkhniiUldegdelInvoices check.

      // Reset electricity readings to 0 if electricity invoice is paid
      // User will upload new readings for next month
      if (
        nekhemjlekh.tsahilgaanNekhemjlekh &&
        nekhemjlekh.tsahilgaanNekhemjlekh > 0
      ) {
        try {
          const gereeForUpdate = await Geree(kholbolt).findById(
            nekhemjlekh.gereeniiId,
          );
          if (gereeForUpdate) {
            gereeForUpdate.umnukhZaalt = 0;
            gereeForUpdate.suuliinZaalt = 0;
            gereeForUpdate.zaaltTog = 0;
            gereeForUpdate.zaaltUs = 0;
            await gereeForUpdate.save();
          }
        } catch (zaaltError) {}
      }

      if (nekhemjlekh.qpayInvoiceId && nekhemjlekh._id) {
        try {
          const nekhemjlekhiinId = nekhemjlekh._id.toString();
          const sukhemjlekhData = {
            nekhemjlekhiinId: nekhemjlekhiinId,
            gereeniiDugaar: nekhemjlekh.gereeniiDugaar || "",
            utas: nekhemjlekh.utas?.[0] || "",
            pay_amount: (nekhemjlekh.niitTulbur || "").toString(),
          };

          let qpayObject = await QuickQpayObject(kholbolt).findOne({
            invoice_id: nekhemjlekh.qpayInvoiceId,
          });

          if (!qpayObject) {
            qpayObject = await QuickQpayObject(kholbolt).findOne({
              baiguullagiinId: nekhemjlekh.baiguullagiinId,
              "qpay.callback_url": { $regex: nekhemjlekhiinId },
            });
          }

          if (qpayObject) {
            const updateData = { tulsunEsekh: true };
            // Also ensure metadata is synced if it's missing
            if (
              !qpayObject.sukhNekhemjlekh ||
              !qpayObject.sukhNekhemjlekh.nekhemjlekhiinId
            ) {
              updateData.sukhNekhemjlekh = sukhemjlekhData;
            }

            await QuickQpayObject(kholbolt).findByIdAndUpdate(
              qpayObject._id,
              updateData,
              { new: true },
            );
          }
        } catch (err) {}
      }

      try {
        const BankniiGuilgee = require("../models/bankniiGuilgee");
        const Geree = require("../models/geree");

        const geree = await Geree(kholbolt)
          .findById(nekhemjlekh.gereeniiId)
          .lean();

        const bankGuilgee = new BankniiGuilgee(kholbolt)();

        bankGuilgee.tranDate = new Date();
        bankGuilgee.amount = finalPaidAmountForBank;
        bankGuilgee.description = `QPay төлбөр - Гэрээ ${nekhemjlekh.gereeniiDugaar}`;
        bankGuilgee.accName = nekhemjlekh.nekhemjlekhiinDansniiNer || "";
        bankGuilgee.accNum = nekhemjlekh.nekhemjlekhiinDans || "";

        bankGuilgee.record = paymentTransactionId || nekhemjlekh.qpayInvoiceId;
        bankGuilgee.tranId = paymentTransactionId || nekhemjlekh.qpayInvoiceId;
        bankGuilgee.balance = 0;
        bankGuilgee.requestId = nekhemjlekh.qpayInvoiceId;

        bankGuilgee.kholbosonGereeniiId = [nekhemjlekh.gereeniiId];
        bankGuilgee.kholbosonTalbainId = geree?.talbainDugaar
          ? [geree.talbainDugaar]
          : [];
        bankGuilgee.dansniiDugaar = nekhemjlekh.nekhemjlekhiinDans;
        bankGuilgee.bank = nekhemjlekh.nekhemjlekhiinBank || "qpay";
        bankGuilgee.baiguullagiinId = nekhemjlekh.baiguullagiinId;
        bankGuilgee.barilgiinId = nekhemjlekh.barilgiinId || "";
        bankGuilgee.kholbosonDun = finalPaidAmountForBank;
        bankGuilgee.ebarimtAvsanEsekh = false;
        bankGuilgee.drOrCr = "Credit";
        bankGuilgee.tranCrnCode = "MNT";
        bankGuilgee.exchRate = 1;
        bankGuilgee.postDate = new Date();

        bankGuilgee.indexTalbar = `${bankGuilgee.barilgiinId}${bankGuilgee.bank}${bankGuilgee.dansniiDugaar}${bankGuilgee.record}${bankGuilgee.amount}`;

        await bankGuilgee.save();
      } catch (bankErr) {}

      // Record the QPay payment in the ledger (automatically handles allocation)
      try {
        const guilgeeService = require("../services/guilgeeService");
        await guilgeeService.recordPayment(kholbolt, {
          baiguullagiinId: String(nekhemjlekh.baiguullagiinId),
          baiguullagiinNer: nekhemjlekh.baiguullagiinNer || "",
          barilgiinId: nekhemjlekh.barilgiinId || "",
          gereeniiId: String(nekhemjlekh.gereeniiId),
          gereeniiDugaar: nekhemjlekh.gereeniiDugaar || "",
          orshinSuugchId: nekhemjlekh.orshinSuugchId || "",
          nekhemjlekhId: nekhemjlekh._id?.toString() || null,
          ognoo: new Date(),
          dun: paidAmount,
          tailbar: `QPay төлбөр - ${nekhemjlekh.gereeniiDugaar || ""}`,
          source: "nekhemjlekh",
        });
      } catch (ledgerErr) {
        console.error("❌ [QPAY CALLBACK] Ledger error:", ledgerErr.message);
      }

      // Recalculation logic removed as per request.


      try {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          nekhemjlekh.baiguullagiinId,
        );

        let tuxainSalbar = null;
        if (nekhemjlekh.barilgiinId && baiguullaga?.barilguud) {
          tuxainSalbar = baiguullaga.barilguud.find(
            (e) => e._id.toString() === String(nekhemjlekh.barilgiinId),
          )?.tokhirgoo;
        }

        if (!tuxainSalbar && baiguullaga?.barilguud?.length > 0) {
          tuxainSalbar = baiguullaga.barilguud[0].tokhirgoo;
        }

        // Check both eBarimtAshiglakhEsekh and eBarimtShine for backward compatibility
        const shouldCreateEbarimt =
          tuxainSalbar &&
          (tuxainSalbar.eBarimtAshiglakhEsekh || tuxainSalbar.eBarimtShine);
        console.log("ℹ️ [QPAY CALLBACK] Ebarimt gate:", {
          hasTokhirgoo: !!tuxainSalbar,
          eBarimtAshiglakhEsekh: tuxainSalbar?.eBarimtAshiglakhEsekh,
          eBarimtShine: tuxainSalbar?.eBarimtShine,
          shouldCreateEbarimt,
          hasMerchantTin: !!tuxainSalbar?.merchantTin,
          merchantTin: tuxainSalbar?.merchantTin || null,
        });

        if (shouldCreateEbarimt) {
          if (!tuxainSalbar.merchantTin) {
            throw new Error("merchantTin is required for e-barimt creation");
          }

          // Ebarimt API requires a 4-digit numeric district code
          // Look up the code from tatvariinAlba using city name and district/horoo name
          let ebarimtDistrictCode = null;

          try {
            const TatvariinAlba = require("../models/tatvariinAlba");
            const cityName =
              tuxainSalbar.EbarimtDuuregNer || tuxainSalbar.duuregNer;
            const districtCodeString =
              tuxainSalbar.EbarimtDistrictCode ||
              tuxainSalbar.districtCode ||
              "";
            console.log("ℹ️ [QPAY CALLBACK] Ebarimt district lookup input:", {
              cityName,
              districtCodeString,
              horooNameFromConfig:
                tuxainSalbar.EbarimtDHoroo?.ner ||
                tuxainSalbar.horoo?.ner ||
                null,
            });

            // Extract horoo/district name from the district code string
            // E.g., "Сонгинохайрхан20-р хороо" -> "20-р хороо"
            // Or use horoo.ner if available
            const horooName =
              tuxainSalbar.EbarimtDHoroo?.ner ||
              tuxainSalbar.horoo?.ner ||
              districtCodeString.replace(cityName, "").trim();

            if (cityName && horooName) {
              // Find the city in tatvariinAlba - try exact match first, then case-insensitive
              let city = await TatvariinAlba(db.erunkhiiKholbolt).findOne({
                ner: cityName,
              });

              // If not found, try case-insensitive search
              if (!city) {
                const allCities = await TatvariinAlba(db.erunkhiiKholbolt).find(
                  {},
                );
                city = allCities.find(
                  (c) =>
                    c.ner &&
                    c.ner.trim().toLowerCase() ===
                      cityName.trim().toLowerCase(),
                );
                if (city) {
                }
              }

              if (city && city.kod) {
                // Find the district/horoo within the city - try exact match, then partial match
                let district = city.ded?.find(
                  (d) => d.ner === horooName || d.ner === horooName.trim(),
                );

                // If not found, try case-insensitive or partial match
                if (!district && city.ded) {
                  district = city.ded.find((d) => {
                    const dName = d.ner?.trim().toLowerCase() || "";
                    const hName = horooName.trim().toLowerCase();
                    return (
                      dName === hName ||
                      dName.includes(hName) ||
                      hName.includes(dName)
                    );
                  });
                  if (district) {
                  }
                }

                if (district && district.kod) {
                  // Combine city code + district code to create 4-digit code
                  const cityCode = city.kod.padStart(2, "0");
                  const districtCode = district.kod.padStart(2, "0");
                  ebarimtDistrictCode = cityCode + districtCode;
                } else {
                }
              } else {
              }
            }

            // Fallback: try to extract 4-digit numeric code directly
            if (!ebarimtDistrictCode) {
              const numericMatch = districtCodeString?.match(/\d{4}/);
              if (numericMatch) {
                ebarimtDistrictCode = numericMatch[0];
              } else if (/^\d{4}$/.test(districtCodeString)) {
                ebarimtDistrictCode = districtCodeString;
              }
            }

            if (!ebarimtDistrictCode || !/^\d{4}$/.test(ebarimtDistrictCode)) {
              throw new Error(
                "districtCode must be a 4-digit numeric code for e-barimt creation",
              );
            }
            console.log("✅ [QPAY CALLBACK] Ebarimt district code resolved:", {
              ebarimtDistrictCode,
            });
          } catch (lookupError) {
            console.error(
              "❌ [QPAY CALLBACK] Ebarimt district lookup failed:",
              lookupError.message,
            );
            throw new Error(
              "Failed to lookup district code for e-barimt creation",
            );
          }

          const {
            nekhemjlekheesEbarimtShineUusgye,
            ebarimtDuudya,
            autoApproveQr,
          } = require("./ebarimtRoute");
          const EbarimtShine = require("../models/ebarimtShine");

          const nuatTulukhEsekh = !!tuxainSalbar.nuatTulukhEsekh;

          // E-barimt must use the ACTUAL paid amount, not post-payment invoice remaining.
          const ebarimtInvoice = {
            ...(typeof nekhemjlekh.toObject === "function"
              ? nekhemjlekh.toObject()
              : nekhemjlekh),
            niitTulbur: paidAmount,
          };

          const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
            ebarimtInvoice,
            nekhemjlekh.register || "",
            "",
            tuxainSalbar.merchantTin,
            ebarimtDistrictCode,
            kholbolt,
            nuatTulukhEsekh,
          );
          console.log("✅ [QPAY CALLBACK] Ebarimt object created", {
            nekhemjlekhiinId: nekhemjlekh._id?.toString(),
            qpayPaymentId: nekhemjlekh.qpayPaymentId || null,
            amountForEbarimt: paidAmount,
          });

          var butsaakhMethod = async function (d, khariuObject) {
            try {
              console.log("ℹ️ [QPAY CALLBACK] ebarimtDuudya response:", {
                status: d?.status || null,
                success: d?.success,
                message: d?.message || d?.error || null,
                receiptId: d?.id || null,
                invoiceId: khariuObject?.nekhemjlekhiinId || null,
              });
              if (d?.status != "SUCCESS" && !d.success) {
                console.error(
                  "❌ [QPAY CALLBACK] Ebarimt provider returned non-success",
                  {
                    status: d?.status,
                    success: d?.success,
                    message: d?.message || null,
                  },
                );
                return;
              }

              var shineBarimt = new EbarimtShine(kholbolt)(d);
              shineBarimt.nekhemjlekhiinId = khariuObject.nekhemjlekhiinId;
              shineBarimt.baiguullagiinId = khariuObject.baiguullagiinId;
              shineBarimt.barilgiinId = khariuObject.barilgiinId;
              shineBarimt.gereeniiDugaar = khariuObject.gereeniiDugaar;
              shineBarimt.utas = khariuObject.utas;

              if (d.qrData) shineBarimt.qrData = d.qrData;
              if (d.lottery) shineBarimt.lottery = d.lottery;
              if (d.id) shineBarimt.receiptId = d.id;
              if (d.date) shineBarimt.date = d.date;

              shineBarimt
                .save()
                .then(async () => {
                  console.log("✅ [QPAY CALLBACK] EbarimtShine saved", {
                    _id: shineBarimt._id?.toString(),
                    receiptId: shineBarimt.receiptId || null,
                    invoiceId: shineBarimt.nekhemjlekhiinId || null,
                  });
                  // Update BankniiGuilgee record to reflect e-barimt status
                  try {
                    const BankniiGuilgee = require("../models/bankniiGuilgee");
                    const recordId =
                      khariuObject.qpayPaymentId || khariuObject.qpayInvoiceId;
                    if (recordId) {
                      await BankniiGuilgee(kholbolt).updateMany(
                        {
                          record: recordId,
                          baiguullagiinId: khariuObject.baiguullagiinId,
                        },
                        { $set: { ebarimtAvsanEsekh: true } },
                      );
                      console.log(
                        "✅ [QPAY CALLBACK] BankniiGuilgee ebarimtAvsanEsekh updated",
                        { recordId },
                      );
                    } else {
                      console.log(
                        "ℹ️ [QPAY CALLBACK] No qpay recordId found for BankniiGuilgee update",
                      );
                    }
                  } catch (bankUpdateErr) {
                    console.error(
                      "❌ [QPAY CALLBACK] Error updating BankniiGuilgee ebarimtAvsanEsekh:",
                      bankUpdateErr.message,
                    );
                  }

                  // Auto-approve QR for Easy Register if customerNo and qrData are available
                  if (khariuObject.customerNo && d.qrData) {
                    autoApproveQr(
                      khariuObject.customerNo,
                      d.qrData,
                      baiguullagiinId,
                      kholbolt,
                    ).catch((err) => {
                      // Non-critical error - don't fail the response
                      console.log(
                        "Auto-approveQr failed (non-critical):",
                        err.message,
                      );
                    });
                  }
                })
                .catch((saveErr) => {
                  console.error(
                    "❌ [QPAY CALLBACK] Error saving EbarimtShine:",
                    saveErr.message,
                  );
                });
            } catch (err) {
              console.error(
                "❌ [QPAY CALLBACK] Error in butsaakhMethod:",
                err.message,
              );
            }
          };

          // Attach QPay IDs to ebarimt metadata so they are available in butsaakhMethod
          ebarimt.qpayPaymentId = nekhemjlekh.qpayPaymentId;
          ebarimt.qpayInvoiceId = nekhemjlekh.qpayInvoiceId;

          console.log("ℹ️ [QPAY CALLBACK] Calling ebarimtDuudya()", {
            nekhemjlekhiinId: nekhemjlekh._id?.toString(),
            qpayPaymentId: ebarimt.qpayPaymentId || null,
            qpayInvoiceId: ebarimt.qpayInvoiceId || null,
          });
          ebarimtDuudya(ebarimt, butsaakhMethod, null, true);
          console.log(
            "ℹ️ [QPAY CALLBACK] ebarimtDuudya() call finished (non-blocking)",
          );
        } else {
          console.log(
            "ℹ️ [QPAY CALLBACK] Ebarimt skipped because feature flags are disabled",
          );
        }
      } catch (ebarimtError) {
        console.error(
          "❌ [QPAY CALLBACK] Error in E-barimt block:",
          ebarimtError.message,
        );
      }

      const io = req.app.get("socketio");
      io.emit(`nekhemjlekhPayment/${baiguullagiinId}/${nekhemjlekhiinId}`, {
        status: "success",
        tuluv: "Төлсөн",
        tulsunOgnoo: nekhemjlekh.tulsunOgnoo,
        paymentId: nekhemjlekh.qpayPaymentId,
      });
      io.emit(`tulburUpdated:${baiguullagiinId}`, {});

      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);

// Callback route for multiple invoice payments
router.get(
  "/qpayNekhemjlekhMultipleCallback/:baiguullagiinId/:invoiceIds",
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const nekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
      const Baiguullaga = require("../models/baiguullaga");
      const Geree = require("../models/geree");
      const BankniiGuilgee = require("../models/bankniiGuilgee");
      // qpayShalgay and QuickQpayObject are already imported at the top

      const baiguullagiinId = req.params.baiguullagiinId;
      const invoiceIdsString = req.params.invoiceIds;
      const invoiceIds = invoiceIdsString.split(",").filter((id) => id.trim());

      if (invoiceIds.length === 0) {
        return res.status(400).send("No invoice IDs provided");
      }

      const kholbolt = db.kholboltuud.find(
        (a) => String(a.baiguullagiinId) === String(baiguullagiinId),
      );

      if (!kholbolt) {
        return res.status(404).send("Organization not found");
      }

      // Convert invoice IDs to ObjectId if needed
      const mongoose = require("mongoose");
      const ObjectId = mongoose.Types.ObjectId;
      const invoiceObjectIds = invoiceIds.map((id) => {
        try {
          return ObjectId(id);
        } catch (e) {
          return id;
        }
      });

      // Fetch all invoices
      const invoices = await nekhemjlekhiinTuukh(kholbolt).find({
        _id: { $in: invoiceObjectIds },
      });

      if (invoices.length === 0) {
        return res.status(404).send("Invoices not found");
      }

      // Mongo $in does not preserve URL order; QPay id may live on any row.
      const invoiceWithQpay =
        invoices.find((inv) => inv.qpayInvoiceId) || invoices[0];
      const qpayInvoiceIdForApi = invoiceWithQpay?.qpayInvoiceId || null;

      console.log("ℹ️ [QPAY MULTI CALLBACK] invoices + QPay id", {
        baiguullagiinId,
        nekhemjlekhiinIds: invoiceIds,
        chosenForQpayShalgay: invoiceWithQpay?._id?.toString(),
        qpayInvoiceIdForApi,
      });

      let paymentTransactionId = null;

      if (qpayInvoiceIdForApi) {
        try {
          const khariu = await qpayShalgay(
            {
              invoice_id: qpayInvoiceIdForApi,
              baiguullagiinId: String(baiguullagiinId),
            },
            kholbolt,
          );

          if (khariu?.payments?.[0]?.transactions?.[0]?.id) {
            paymentTransactionId = khariu.payments[0].transactions[0].id;
          }
          console.log("ℹ️ [QPAY MULTI CALLBACK] qpayShalgay", {
            invoice_status: khariu?.invoice_status,
            hasPayments: !!(khariu?.payments && khariu.payments.length),
            paymentTransactionId,
          });
        } catch (err) {
          console.error(
            "❌ [QPAY MULTI CALLBACK] qpayShalgay failed:",
            err.message,
          );
        }
      } else {
        console.warn(
          "⚠️ [QPAY MULTI CALLBACK] no qpayInvoiceId on any invoice — cannot sync QPay payment id",
        );
      }

      if (!paymentTransactionId && req.query.qpay_payment_id) {
        paymentTransactionId = req.query.qpay_payment_id;
      }

      // Update all invoices as paid
      const updatePromises = invoices.map(async (nekhemjlekh) => {
        try {
          if (nekhemjlekh.tuluv === "Төлсөн") {
            return;
          }

          // Use findByIdAndUpdate to ensure the update is applied
          const updatedInvoice = await nekhemjlekhiinTuukh(
            kholbolt,
          ).findByIdAndUpdate(
            nekhemjlekh._id,
            {
              $set: (() => {
                const multiPaidAmount = nekhemjlekh.niitTulbur || 0;
                const multiCurrentUldegdel =
                  typeof nekhemjlekh.uldegdel === "number" &&
                  !isNaN(nekhemjlekh.uldegdel) &&
                  nekhemjlekh.uldegdel > 0
                    ? nekhemjlekh.uldegdel
                    : multiPaidAmount;
                const multiNewUldegdel = Math.max(
                  0,
                  multiCurrentUldegdel - multiPaidAmount,
                );
                const multiIsFullyPaid = multiNewUldegdel <= 0.01;
                return {
                  tuluv: multiIsFullyPaid ? "Төлсөн" : "Төлөөгүй",
                  ...(paymentTransactionId && {
                    qpayPaymentId: paymentTransactionId,
                  }),
                  // uldegdel removed
                };
              })(),
              $push: {
                paymentHistory: {
                  ognoo: new Date(),
                  dun: nekhemjlekh.niitTulbur || 0,
                  turul: "төлөлт",
                  guilgeeniiId:
                    paymentTransactionId ||
                    nekhemjlekh.qpayInvoiceId ||
                    "unknown",
                  tailbar: "QPay төлбөр (Олон нэхэмжлэх)",
                },
              },
            },
            { new: true },
          );

          if (!updatedInvoice) {
            return;
          }

          // Use the updated invoice for further operations
          nekhemjlekh = updatedInvoice;

          try {
            const invFresh = await nekhemjlekhiinTuukh(kholbolt).findById(
              nekhemjlekh._id,
            );
            if (invFresh) {
              invFresh._skipTuluvRecalc = true;
              await invFresh.save();
            }
          } catch (ekhniiSyncErr) {
            console.error(
              "[QPAY MULTI] ekhniiUldegdel sync save failed:",
              ekhniiSyncErr.message,
            );
          }

          // NOTE: Do NOT reset geree.ekhniiUldegdel to 0 here.
          // The recalculation formula depends on it as a permanent charge component.
          // invoiceCreationService prevents double-counting via existingEkhniiUldegdelInvoices check.

          // Reset electricity readings to 0 if electricity invoice is paid
          // User will upload new readings for next month
          if (
            nekhemjlekh.tsahilgaanNekhemjlekh &&
            nekhemjlekh.tsahilgaanNekhemjlekh > 0
          ) {
            try {
              const gereeForUpdate = await Geree(kholbolt).findById(
                nekhemjlekh.gereeniiId,
              );
              if (gereeForUpdate) {
                gereeForUpdate.umnukhZaalt = 0;
                gereeForUpdate.suuliinZaalt = 0;
                gereeForUpdate.zaaltTog = 0;
                gereeForUpdate.zaaltUs = 0;
                await gereeForUpdate.save();
              }
            } catch (zaaltError) {}
          }

          // Create bank payment record for each invoice
          try {
            const geree = await Geree(kholbolt)
              .findById(nekhemjlekh.gereeniiId)
              .lean();

            if (geree) {
              const bankGuilgee = new BankniiGuilgee(kholbolt)();

              bankGuilgee.tranDate = new Date();
              bankGuilgee.amount = nekhemjlekh.niitTulbur || 0;
              bankGuilgee.description = `QPay төлбөр (Олон нэхэмжлэх) - Гэрээ ${nekhemjlekh.gereeniiDugaar}`;
              bankGuilgee.accName = nekhemjlekh.nekhemjlekhiinDansniiNer || "";
              bankGuilgee.accNum = nekhemjlekh.nekhemjlekhiinDans || "";

              bankGuilgee.record =
                paymentTransactionId || nekhemjlekh.qpayInvoiceId || "";
              bankGuilgee.tranId =
                paymentTransactionId || nekhemjlekh.qpayInvoiceId || "";
              bankGuilgee.balance = 0;
              bankGuilgee.requestId = nekhemjlekh.qpayInvoiceId || "";

              bankGuilgee.kholbosonGereeniiId = [nekhemjlekh.gereeniiId];
              bankGuilgee.kholbosonTalbainId = geree?.talbainDugaar
                ? [geree.talbainDugaar]
                : [];
              bankGuilgee.dansniiDugaar = nekhemjlekh.nekhemjlekhiinDans || "";
              bankGuilgee.bank = nekhemjlekh.nekhemjlekhiinBank || "qpay";
              bankGuilgee.baiguullagiinId = nekhemjlekh.baiguullagiinId;
              bankGuilgee.barilgiinId = nekhemjlekh.barilgiinId || "";
              bankGuilgee.kholbosonDun = nekhemjlekh.niitTulbur || 0;
              bankGuilgee.ebarimtAvsanEsekh = false;
              bankGuilgee.drOrCr = "Credit";
              bankGuilgee.tranCrnCode = "MNT";
              bankGuilgee.exchRate = 1;
              bankGuilgee.postDate = new Date();

              bankGuilgee.indexTalbar = `${bankGuilgee.barilgiinId}${bankGuilgee.bank}${bankGuilgee.dansniiDugaar}${bankGuilgee.record}${bankGuilgee.amount}`;

              await bankGuilgee.save();
            }
          } catch (bankErr) {}

          // Record the QPay payment in the ledger
          try {
            const guilgeeService = require("../services/guilgeeService");
            await guilgeeService.recordPayment(kholbolt, {
              baiguullagiinId: String(nekhemjlekh.baiguullagiinId),
              baiguullagiinNer: nekhemjlekh.baiguullagiinNer || "",
              barilgiinId: nekhemjlekh.barilgiinId || "",
              gereeniiId: String(nekhemjlekh.gereeniiId),
              gereeniiDugaar: nekhemjlekh.gereeniiDugaar || "",
              orshinSuugchId: nekhemjlekh.orshinSuugchId || "",
              nekhemjlekhId: nekhemjlekh._id?.toString() || null,
              ognoo: new Date(),
              dun: nekhemjlekh.niitTulbur || 0,
              tailbar: `QPay төлбөр (Олон нэхэмжлэх) - ${nekhemjlekh.gereeniiDugaar || ""}`,
              source: "nekhemjlekh",
            });
          } catch (ledgerErr) {
            console.error("❌ [QPAY MULTI CALLBACK] Ledger error:", ledgerErr.message);
          }

          // Create ebarimt for each invoice
          try {
            const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
              updatedInvoice.baiguullagiinId,
            );

            let tuxainSalbar = null;
            if (updatedInvoice.barilgiinId && baiguullaga?.barilguud) {
              tuxainSalbar = baiguullaga.barilguud.find(
                (e) => e._id.toString() === String(updatedInvoice.barilgiinId),
              )?.tokhirgoo;
            }

            if (!tuxainSalbar && baiguullaga?.barilguud?.length > 0) {
              tuxainSalbar = baiguullaga.barilguud[0].tokhirgoo;
            }

            // Check both eBarimtAshiglakhEsekh and eBarimtShine for backward compatibility
            const shouldCreateEbarimt =
              tuxainSalbar &&
              (tuxainSalbar.eBarimtAshiglakhEsekh || tuxainSalbar.eBarimtShine);
            console.log("ℹ️ [QPAY MULTI CALLBACK] Ebarimt gate:", {
              invoiceId: updatedInvoice._id?.toString(),
              hasTokhirgoo: !!tuxainSalbar,
              eBarimtAshiglakhEsekh: tuxainSalbar?.eBarimtAshiglakhEsekh,
              eBarimtShine: tuxainSalbar?.eBarimtShine,
              shouldCreateEbarimt,
              hasMerchantTin: !!tuxainSalbar?.merchantTin,
            });

            if (shouldCreateEbarimt) {
              if (!tuxainSalbar.merchantTin) {
                console.error(
                  "❌ [QPAY MULTI CALLBACK] Ebarimt skipped: merchantTin missing",
                );
              } else {
                // Ebarimt API requires a 4-digit numeric district code
                // Look up the code from tatvariinAlba using city name and district/horoo name
                let ebarimtDistrictCode = null;

                try {
                  const TatvariinAlba = require("../models/tatvariinAlba");
                  const cityName =
                    tuxainSalbar.EbarimtDuuregNer || tuxainSalbar.duuregNer;
                  const districtCodeString =
                    tuxainSalbar.EbarimtDistrictCode ||
                    tuxainSalbar.districtCode ||
                    "";
                  console.log(
                    "ℹ️ [QPAY MULTI CALLBACK] Ebarimt district lookup input:",
                    {
                      invoiceId: updatedInvoice._id?.toString(),
                      cityName,
                      districtCodeString,
                      horooNameFromConfig:
                        tuxainSalbar.EbarimtDHoroo?.ner ||
                        tuxainSalbar.horoo?.ner ||
                        null,
                    },
                  );

                  // Extract horoo/district name from the district code string
                  const horooName =
                    tuxainSalbar.EbarimtDHoroo?.ner ||
                    tuxainSalbar.horoo?.ner ||
                    districtCodeString.replace(cityName, "").trim();

                  if (cityName && horooName) {
                    // Find the city in tatvariinAlba - try exact match first, then case-insensitive
                    let city = await TatvariinAlba(db.erunkhiiKholbolt).findOne(
                      { ner: cityName },
                    );

                    // If not found, try case-insensitive search
                    if (!city) {
                      const allCities = await TatvariinAlba(
                        db.erunkhiiKholbolt,
                      ).find({});
                      city = allCities.find(
                        (c) =>
                          c.ner &&
                          c.ner.trim().toLowerCase() ===
                            cityName.trim().toLowerCase(),
                      );
                      if (city) {
                      }
                    }

                    if (city && city.kod) {
                      // Find the district/horoo within the city - try exact match, then partial match
                      let district = city.ded?.find(
                        (d) =>
                          d.ner === horooName || d.ner === horooName.trim(),
                      );

                      // If not found, try case-insensitive or partial match
                      if (!district && city.ded) {
                        district = city.ded.find((d) => {
                          const dName = d.ner?.trim().toLowerCase() || "";
                          const hName = horooName.trim().toLowerCase();
                          return (
                            dName === hName ||
                            dName.includes(hName) ||
                            hName.includes(dName)
                          );
                        });
                        if (district) {
                        }
                      }

                      if (district && district.kod) {
                        // Combine city code + district code to create 4-digit code
                        const cityCode = city.kod.padStart(2, "0");
                        const districtCode = district.kod.padStart(2, "0");
                        ebarimtDistrictCode = cityCode + districtCode;
                      } else {
                      }
                    } else {
                    }
                  }

                  // Fallback: try to extract 4-digit numeric code directly
                  if (!ebarimtDistrictCode) {
                    const numericMatch = districtCodeString?.match(/\d{4}/);
                    if (numericMatch) {
                      ebarimtDistrictCode = numericMatch[0];
                    } else if (/^\d{4}$/.test(districtCodeString)) {
                      ebarimtDistrictCode = districtCodeString;
                    }
                  }

                  if (
                    !ebarimtDistrictCode ||
                    !/^\d{4}$/.test(ebarimtDistrictCode)
                  ) {
                    console.error(
                      "❌ [QPAY MULTI CALLBACK] Ebarimt skipped: invalid district code",
                      {
                        invoiceId: updatedInvoice._id?.toString(),
                        ebarimtDistrictCode,
                      },
                    );
                  } else {
                    console.log(
                      "✅ [QPAY MULTI CALLBACK] Ebarimt district code resolved",
                      {
                        invoiceId: updatedInvoice._id?.toString(),
                        ebarimtDistrictCode,
                      },
                    );
                    const {
                      nekhemjlekheesEbarimtShineUusgye,
                      ebarimtDuudya,
                      autoApproveQr,
                    } = require("./ebarimtRoute");
                    const EbarimtShine = require("../models/ebarimtShine");

                    const nuatTulukhEsekh = !!tuxainSalbar.nuatTulukhEsekh;

                    const paidAmountForEbarimt =
                      Number(
                        updatedInvoice?.paymentHistory?.[
                          (updatedInvoice?.paymentHistory?.length || 1) - 1
                        ]?.dun,
                      ) || 0;
                    const ebarimtInvoice = {
                      ...(typeof updatedInvoice.toObject === "function"
                        ? updatedInvoice.toObject()
                        : updatedInvoice),
                      niitTulbur: paidAmountForEbarimt,
                    };

                    const ebarimt = await nekhemjlekheesEbarimtShineUusgye(
                      ebarimtInvoice,
                      updatedInvoice.register || "",
                      "",
                      tuxainSalbar.merchantTin,
                      ebarimtDistrictCode,
                      kholbolt,
                      nuatTulukhEsekh,
                    );
                    console.log(
                      "✅ [QPAY MULTI CALLBACK] Ebarimt object created",
                      {
                        invoiceId: updatedInvoice._id?.toString(),
                        qpayPaymentId: paymentTransactionId || null,
                        amountForEbarimt: paidAmountForEbarimt,
                      },
                    );

                    // The ebarimt object already has invoice data set in nekhemjlekheesEbarimtShineUusgye
                    // ebarimtDuudya calls onFinish(body, ugugdul) where ugugdul is the ebarimt object
                    var butsaakhMethod = async function (d, ebarimtObject) {
                      try {
                        console.log(
                          "ℹ️ [QPAY MULTI CALLBACK] ebarimtDuudya response:",
                          {
                            status: d?.status || null,
                            success: d?.success,
                            message: d?.message || d?.error || null,
                            receiptId: d?.id || null,
                            invoiceId: ebarimtObject?.nekhemjlekhiinId || null,
                          },
                        );
                        if (d?.status != "SUCCESS" && !d.success) {
                          console.error(
                            "❌ [QPAY MULTI CALLBACK] Ebarimt provider returned non-success",
                            {
                              status: d?.status,
                              success: d?.success,
                              message: d?.message || null,
                            },
                          );
                          return;
                        }

                        var shineBarimt = new EbarimtShine(kholbolt)(d);
                        shineBarimt.nekhemjlekhiinId =
                          ebarimtObject.nekhemjlekhiinId;
                        shineBarimt.baiguullagiinId =
                          ebarimtObject.baiguullagiinId;
                        shineBarimt.barilgiinId = ebarimtObject.barilgiinId;
                        shineBarimt.gereeniiDugaar =
                          ebarimtObject.gereeniiDugaar;
                        shineBarimt.utas = ebarimtObject.utas;

                        if (d.qrData) shineBarimt.qrData = d.qrData;
                        if (d.lottery) shineBarimt.lottery = d.lottery;
                        if (d.id) shineBarimt.receiptId = d.id;
                        if (d.date) shineBarimt.date = d.date;

                        shineBarimt
                          .save()
                          .then(async () => {
                            console.log(
                              "✅ [QPAY MULTI CALLBACK] EbarimtShine saved",
                              {
                                _id: shineBarimt._id?.toString(),
                                receiptId: shineBarimt.receiptId || null,
                                invoiceId: shineBarimt.nekhemjlekhiinId || null,
                              },
                            );
                            // Update BankniiGuilgee record to reflect e-barimt status
                            try {
                              const BankniiGuilgee = require("../models/bankniiGuilgee");
                              const recordId =
                                ebarimtObject.qpayPaymentId ||
                                ebarimtObject.qpayInvoiceId;
                              if (recordId) {
                                await BankniiGuilgee(kholbolt).updateMany(
                                  {
                                    record: recordId,
                                    baiguullagiinId:
                                      ebarimtObject.baiguullagiinId,
                                  },
                                  { $set: { ebarimtAvsanEsekh: true } },
                                );
                                console.log(
                                  "✅ [QPAY MULTI CALLBACK] BankniiGuilgee ebarimtAvsanEsekh updated",
                                  { recordId },
                                );
                              } else {
                                console.log(
                                  "ℹ️ [QPAY MULTI CALLBACK] No qpay recordId found for BankniiGuilgee update",
                                  {
                                    invoiceId:
                                      ebarimtObject?.nekhemjlekhiinId || null,
                                  },
                                );
                              }
                            } catch (bankUpdateErr) {
                              console.error(
                                "❌ [QPAY MULTI CALLBACK] Error updating BankniiGuilgee ebarimtAvsanEsekh:",
                                bankUpdateErr.message,
                              );
                            }

                            // Auto-approve QR for Easy Register if customerNo and qrData are available
                            if (ebarimtObject.customerNo && d.qrData) {
                              autoApproveQr(
                                ebarimtObject.customerNo,
                                d.qrData,
                                baiguullagiinId,
                                kholbolt,
                              ).catch((err) => {
                                // Non-critical error - don't fail the response
                                console.log(
                                  "Auto-approveQr failed (non-critical):",
                                  err.message,
                                );
                              });
                            }
                          })
                          .catch((saveErr) => {
                            console.error(
                              "❌ [QPAY MULTI CALLBACK] Error saving EbarimtShine:",
                              saveErr.message,
                            );
                          });
                      } catch (err) {
                        console.error(
                          "❌ [QPAY MULTI CALLBACK] Error in butsaakhMethod:",
                          err.message,
                        );
                      }
                    };

                    // Attach QPay IDs to ebarimt metadata so they are available in butsaakhMethod
                    // One nekhemjlekhiin row holds qpayInvoiceId; others still need the same UUID for provider/tax.
                    ebarimt.qpayPaymentId = paymentTransactionId;
                    ebarimt.qpayInvoiceId =
                      updatedInvoice.qpayInvoiceId || qpayInvoiceIdForApi;

                    // ebarimtDuudya signature: (ugugdul, onFinish, next, shine)
                    // The ebarimt object already contains invoice data, and it's passed as second param to onFinish
                    console.log(
                      "ℹ️ [QPAY MULTI CALLBACK] Calling ebarimtDuudya()",
                      {
                        invoiceId: updatedInvoice._id?.toString(),
                        qpayPaymentId: ebarimt.qpayPaymentId || null,
                        qpayInvoiceId: ebarimt.qpayInvoiceId || null,
                      },
                    );
                    ebarimtDuudya(ebarimt, butsaakhMethod, null, true);
                    console.log(
                      "ℹ️ [QPAY MULTI CALLBACK] ebarimtDuudya() call finished (non-blocking)",
                    );
                  }
                } catch (lookupError) {
                  console.error(
                    "❌ [QPAY MULTI CALLBACK] Ebarimt district lookup/create failed:",
                    lookupError.message,
                  );
                }
              }
            } else {
              console.log(
                "ℹ️ [QPAY MULTI CALLBACK] Ebarimt skipped because feature flags are disabled",
                { invoiceId: updatedInvoice._id?.toString() },
              );
            }
          } catch (ebarimtError) {
            console.error(
              "❌ [QPAY MULTI CALLBACK] Error in E-barimt block:",
              ebarimtError.message,
            );
          }

          // Emit socket event for each invoice
          const ioNekh = req.app.get("socketio");
          if (ioNekh) {
            ioNekh.emit(
              `nekhemjlekhPayment/${baiguullagiinId}/${updatedInvoice._id}`,
              {
                status: "success",
                tuluv: "Төлсөн",
                tulsunOgnoo: updatedInvoice.tulsunOgnoo,
                paymentId: updatedInvoice.qpayPaymentId,
              },
            );
          }
        } catch (invoiceErr) {
          console.error(
            "❌ [QPAY MULTI CALLBACK] Invoice processing error:",
            invoiceErr.message,
          );
        }
      });

      await Promise.all(updatePromises);

      // QuickQpayObject: must use the real QPay invoice UUID (same as invoiceWithQpay), not invoices[0].
      if (qpayInvoiceIdForApi) {
        try {
          const qpayPaidSet = {
            tulsunEsekh: true,
            invoice_status: "PAID",
            invoice_status_date: new Date(),
          };
          let qpayObjUpdated = await QuickQpayObject(kholbolt).findOneAndUpdate(
            { invoice_id: qpayInvoiceIdForApi },
            { $set: qpayPaidSet },
            { new: true },
          );
          if (!qpayObjUpdated) {
            const idRegex = invoiceIds
              .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("|");
            qpayObjUpdated = await QuickQpayObject(kholbolt).findOneAndUpdate(
              {
                baiguullagiinId: String(baiguullagiinId),
                "qpay.callback_url": { $regex: idRegex },
              },
              { $set: qpayPaidSet },
              { new: true, sort: { ognoo: -1 } },
            );
          }
          if (qpayObjUpdated) {
            console.log("✅ [QPAY MULTI CALLBACK] QuickQpayObject marked PAID", {
              invoice_id: qpayInvoiceIdForApi,
              _id: qpayObjUpdated._id?.toString(),
            });
          } else {
            console.error(
              "❌ [QPAY MULTI CALLBACK] QuickQpayObject not found for invoice_id",
              qpayInvoiceIdForApi,
            );
          }
        } catch (qpayUpdateErr) {
          console.error(
            "❌ [QPAY MULTI CALLBACK] Error updating QuickQpayObject:",
            qpayUpdateErr.message,
          );
        }
      }

      const ioMulti = req.app.get("socketio");
      if (ioMulti) {
        ioMulti.emit(`tulburUpdated:${baiguullagiinId}`, {});
      }

      res.sendStatus(200);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
