const asyncHandler = require("express-async-handler");
const walletApiService = require("../services/walletApiService");
const aldaa = require("../components/aldaa");
const jwt = require("jsonwebtoken");
const OrshinSuugch = require("../models/orshinSuugch");

async function getUserIdFromToken(req) {
  if (!req.headers.authorization) {
    throw new aldaa("Нэвтрэх шаардлагатай!");
  }

  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    throw new aldaa("Token олдсонгүй!");
  }

  let tokenObject;
  try {
    tokenObject = jwt.verify(token, process.env.APP_SECRET);
  } catch (jwtError) {
    throw new aldaa("Token хүчингүй байна!");
  }

  if (!tokenObject?.id || tokenObject.id === "zochin") {
    throw new aldaa("Энэ үйлдлийг хийх эрх байхгүй байна!");
  }

  const { db } = require("zevbackv2");
  const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
    tokenObject.id,
  );
  if (!orshinSuugch) {
    throw new aldaa("Хэрэглэгч олдсонгүй!");
  }

  // Wallet-Service expects walletUserId (UUID) in userId header, not phone number
  // Search in toots for WALLET_API walletUserId
  const walletToot =
    orshinSuugch.toots &&
    orshinSuugch.toots.find((t) => t.source === "WALLET_API" && t.walletUserId);
  let walletUserId = walletToot
    ? walletToot.walletUserId
    : orshinSuugch.walletUserId;

  // JIT AUTO-REGISTRATION: If no walletUserId exists, try to register with Wallet API
  if (!walletUserId) {
    try {
        // Try to identify user in Wallet API by phone
        let walletUserInfo = await walletApiService.getUserInfo(orshinSuugch.utas);
        
        if (!walletUserInfo || !walletUserInfo.userId) {
            // Not registered in Wallet API, try auto-registering
            try {
                walletUserInfo = await walletApiService.registerUser(
                    orshinSuugch.utas,
                    orshinSuugch.mail || ""
                );
            } catch (regErr) {
                // If registration fails, it might be already registered but getUserInfo failed, or BPay is down
            }
        }

        if (walletUserInfo && walletUserInfo.userId) {
            walletUserId = walletUserInfo.userId;
            // Update local user with the new walletUserId for future requests
            orshinSuugch.walletUserId = walletUserId;
            await orshinSuugch.save();
        }
    } catch (err) {
        // Ignore errors during auto-reg to not break local flow
    }
  }

  return {
    userId: walletUserId || orshinSuugch.utas || tokenObject.id,
    utas: orshinSuugch.utas
  };
}

exports.walletBillers = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const billers = await walletApiService.getBillers(userId);
    res.status(200).json({
      success: true,
      data: billers,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillingByBiller = asyncHandler(async (req, res, next) => {
  try {
    // For getBillingByBiller, Wallet-Service requires phone number as userId, not walletUserId
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const jwt = require("jsonwebtoken");
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Use phone number for this endpoint (Wallet-Service requirement)
    const userId = orshinSuugch.utas;

    const { billerCode, customerCode } = req.params;

    if (!billerCode || !customerCode) {
      throw new aldaa(
        "Биллер код болон хэрэглэгчийн код заавал бөглөх шаардлагатай!",
      );
    }

    const billing = await walletApiService.getBillingByBiller(
      userId,
      billerCode,
      customerCode,
    );

    // Check if billing is null, undefined, or empty array
    if (!billing || (Array.isArray(billing) && billing.length === 0)) {
      // Get user info to check if they have walletCustomerCode
      const { db } = require("zevbackv2");
      const OrshinSuugch = require("../models/orshinSuugch");
      const jwt = require("jsonwebtoken");
      const token = req.headers.authorization.split(" ")[1];
      const tokenObject = jwt.verify(token, process.env.APP_SECRET);
      const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
        tokenObject.id,
      );

      let errorMessage = "Биллингийн мэдээлэл олдсонгүй";

      // Check if this customerCode belongs to any of the user's registered toots
      const registeredCodes = orshinSuugch?.toots
        ? orshinSuugch.toots
            .filter((t) => t.source === "WALLET_API" && t.walletCustomerCode)
            .map((t) => t.walletCustomerCode)
        : [];

      if (
        registeredCodes.length > 0 &&
        !registeredCodes.includes(customerCode)
      ) {
        errorMessage = `Хэрэглэгчийн код буруу байна. Таны бүртгэлтэй код: ${registeredCodes.join(", ")}`;
      }

      return res.status(404).json({
        success: false,
        message: errorMessage,
      });
    }

    // Ensure billingId is included (should already be added by getBillingByBiller)
    // Sanitize null values to empty strings for String fields
    const sanitizeResponse = (data) => {
      if (Array.isArray(data)) {
        return data.map((item) => {
          const sanitized = { ...item };
          for (const key in sanitized) {
            if (sanitized[key] === null || sanitized[key] === undefined) {
              sanitized[key] = "";
            }
          }
          return sanitized;
        });
      } else if (typeof data === "object") {
        const sanitized = { ...data };
        for (const key in sanitized) {
          if (sanitized[key] === null || sanitized[key] === undefined) {
            sanitized[key] = "";
          }
        }
        return sanitized;
      }
      return data;
    };

    const sanitizedBilling = sanitizeResponse(billing);

    res.status(200).json({
      success: true,
      data: sanitizedBilling,
    });
  } catch (err) {
    console.error("❌ [WALLET BILLING BY BILLER] Error:", err.message);
    next(err);
  }
});

exports.walletBillingByCustomer = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { customerId } = req.params;

    if (!customerId) {
      throw new aldaa("Хэрэглэгчийн ID заавал бөглөх шаардлагатай!");
    }

    const billing = await walletApiService.getBillingByCustomer(
      userId,
      customerId,
    );

    if (!billing) {
      return res.status(404).json({
        success: false,
        message: "Биллингийн мэдээлэл олдсонгүй",
      });
    }

    res.status(200).json({
      success: true,
      data: billing,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillingList = asyncHandler(async (req, res, next) => {
  try {
    // For getBillingList, Wallet-Service requires phone number as userId, not walletUserId
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const jwt = require("jsonwebtoken");
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Use phone number for this endpoint (Wallet-Service requirement)
    const userId = orshinSuugch.utas;

    const billingList = await walletApiService.getBillingList(userId);
    const data = Array.isArray(billingList) ? billingList : [];

    const enrichedData = data.map((bill) => {
      const customNick =
        orshinSuugch.billNicknames &&
        orshinSuugch.billNicknames.find((n) => n.billingId === bill.billingId);
      return {
        ...bill,
        nickname: customNick ? customNick.nickname : null,
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedData,
    });
  } catch (err) {
    console.error("❌ [WALLET BILLING LIST] Error:", err.message);
    if (err.response) {
      console.error(
        "❌ [WALLET BILLING LIST] Error response:",
        JSON.stringify(err.response.data),
      );
    }
    next(err);
  }
});

exports.walletBillingBills = asyncHandler(async (req, res, next) => {
  try {
    // For billing endpoints, Wallet-Service requires phone number as userId, not walletUserId
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const jwt = require("jsonwebtoken");
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Use phone number for this endpoint (Wallet-Service requirement)
    const userId = orshinSuugch.utas;

    const { billingId } = req.params;

    if (!billingId) {
      throw new aldaa("Биллингийн ID заавал бөглөх шаардлагатай!");
    }

    // Verify user exists in Wallet API before making the call
    // getUserInfo also needs phone number
    try {
      const walletUserInfo = await walletApiService.getUserInfo(userId);
      if (!walletUserInfo || !walletUserInfo.userId) {
        throw new aldaa(
          "Хэтэвчний системд бүртгэлгүй байна. Эхлээд нэвтэрнэ үү.",
        );
      }
    } catch (userCheckError) {
      console.error(
        "❌ [WALLET BILLING BILLS] User not found in Wallet API:",
        userCheckError.message,
      );
      throw new aldaa(
        "Хэтэвчний системд бүртгэлгүй байна. Эхлээд нэвтэрнэ үү.",
      );
    }

    const bills = await walletApiService.getBillingBills(userId, billingId);
    const data = Array.isArray(bills) ? bills : [];

    // Ensure all bills are properly sanitized (double-check)
    const sanitizedData = data.map((bill) => {
      const sanitized = {};
      for (const key in bill) {
        if (bill.hasOwnProperty(key)) {
          const value = bill[key];

          // Convert null/undefined to empty string for all fields
          if (value === null || value === undefined) {
            sanitized[key] = "";
          } else if (Array.isArray(value)) {
            sanitized[key] = value.map((item) => {
              return item === null || item === undefined ? "" : item;
            });
          } else {
            sanitized[key] = value;
          }
        }
      }
      return sanitized;
    });

    res.status(200).json({
      success: true,
      data: sanitizedData,
    });
  } catch (err) {
    console.error("❌ [WALLET BILLING BILLS] Error:", err.message);
    if (err.response) {
      console.error(
        "❌ [WALLET BILLING BILLS] Error response:",
        JSON.stringify(err.response.data),
      );
    }
    next(err);
  }
});

exports.walletBillingPayments = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { billingId } = req.params;

    if (!billingId) {
      throw new aldaa("Биллингийн ID заавал бөглөх шаардлагатай!");
    }

    const payments = await walletApiService.getBillingPayments(
      userId,
      billingId,
    );
    const data = Array.isArray(payments) ? payments : [];

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (err) {
    console.error("❌ [WALLET BILLING PAYMENTS] Error:", err.message);
    if (err.response) {
      console.error(
        "❌ [WALLET BILLING PAYMENTS] Error response:",
        JSON.stringify(err.response.data),
      );
    }
    next(err);
  }
});

exports.walletBillingSave = asyncHandler(async (req, res, next) => {
  try {
    const { userId, utas } = await getUserIdFromToken(req);
    const billingData = req.body;

    if (!billingData) {
      throw new aldaa("Биллингийн мэдээлэл заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.saveBilling(userId, billingData);

    // Sync local orshinSuugch toots array
    try {
      const { db } = require("zevbackv2");
      const OrshinSuugch = require("../models/orshinSuugch");
      const jwt = require("jsonwebtoken");
      const token = req.headers.authorization.split(" ")[1];
      const tokenObject = jwt.verify(token, process.env.APP_SECRET);

      const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
        tokenObject.id,
      );

      const {
        findOrCreateBarilgaFromWallet,
        CENTRALIZED_ORG_ID,
      } = require("./negdsenSan");

      if (orshinSuugch && result) {
        if (!orshinSuugch.toots) orshinSuugch.toots = [];

        // Extract name parts from customerName
        const nameParts = result.customerName
          ? result.customerName.split(" ")
          : [];
        const ovog =
          nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
        const ner = nameParts.length > 0 ? nameParts[nameParts.length - 1] : "";

        // Find or create barilga in centralized org
        const barilgaResult = await findOrCreateBarilgaFromWallet(
          result.bairId || billingData.bairId,
          result.bairName,
        );

        const newTootEntry = {
          toot: result.doorNo || billingData.doorNo || "",
          source: "WALLET_API",
          bairniiNer: result.bairName || "",
          ovog: ovog,
          ner: ner,
          baiguullagiinId: barilgaResult.baiguullagiinId,
          barilgiinId: barilgaResult.barilgiinId,
          walletBairId: result.bairId || billingData.bairId || "",
          walletDoorNo: result.doorNo || billingData.doorNo || "",
          walletUserId: userId, // Current walletUserId from getUserIdFromToken
          walletCustomerId: result.customerId || "",
          walletCustomerCode: result.customerCode || "",
          billingId: result.billingId || billingData.billingId || result.id || "",
          createdAt: new Date(),
        };

        // Check if already exists — match by customerId too so same bairId+doorNo but different customers create separate entries
        const existingIndex = orshinSuugch.toots.findIndex(
          (t) =>
            t.source === "WALLET_API" &&
            t.walletBairId === newTootEntry.walletBairId &&
            t.walletDoorNo === newTootEntry.walletDoorNo &&
            (!t.walletCustomerId || !newTootEntry.walletCustomerId ||
              t.walletCustomerId === newTootEntry.walletCustomerId),
        );

        if (existingIndex >= 0) {
          orshinSuugch.toots[existingIndex] = {
            ...orshinSuugch.toots[existingIndex].toObject(),
            ...newTootEntry,
          };
        } else {
          orshinSuugch.toots.push(newTootEntry);
        }

        await orshinSuugch.save();
      }
    } catch (syncErr) {
      console.error("⚠️ [WALLET SAVE] Local sync failed:", syncErr.message);
    }

    // Emit socket notification for real-time UI refresh
    try {
      const io = req.app.get("socketio");
      if (io && tokenObject.id) {
        io.emit(`orshinSuugch${tokenObject.id}`, {
          type: "billing_update",
          action: "add",
          billingId: result.billingId || result.id || "",
          message: "Шинэ биллинг нэмэгдлээ"
        });
      }
    } catch (socketErr) {
      console.warn("⚠️ [WALLET SAVE] Socket emission failed:", socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: result,
      message: "Биллингийн мэдээлэл амжилттай хадгаллаа",
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillingRemove = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const jwt = require("jsonwebtoken");
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);

    // Find orshinSuugch
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );
    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Get correct userId (UUID or phone) for Wallet API
    const { userId, utas } = await getUserIdFromToken(req);
    const { billingId } = req.params;

    if (!billingId) {
      throw new aldaa("Биллингийн ID заавал бөглөх шаардлагатай!");
    }

    // 1. Identify which address this billing belongs to before deleting
    let billingToRemove = null;
    try {
      // For getBillingList, use phone number as required by the API's listing endpoint
      const billingList = await walletApiService.getBillingList(orshinSuugch.utas);
      billingToRemove = billingList.find((b) => b.billingId === billingId);
    } catch (listErr) {
      console.warn(
        "⚠️ [WALLET REMOVE] Could not fetch billing list for cleanup info:",
        listErr.message,
      );
    }

    // 2. Remove from Wallet API using the proper mapping (UUID or phone) from the token
    let result = null;
    try {
      result = await walletApiService.removeBilling(userId, billingId);
    } catch (apiErr) {
      if (apiErr.message && (
          apiErr.message.toLowerCase().includes('бүртгэл хийгдээгүй') || 
          apiErr.message.toLowerCase().includes('notfound error') || 
          apiErr.message.toLowerCase().includes('not found') ||
          apiErr.message.toLowerCase().includes('олдсонгүй')
      )) {
        console.warn("⚠️ [WALLET REMOVE] API rejected with not found/unregistered, proceeding with local cleanup anyway:", apiErr.message);
        result = { success: true, message: "API record not found, continuing local cleanup" };
      } else {
        throw apiErr;
      }
    }

    // 3. Local Cleanup
    let localUpdated = false;

    // Remove from toots array
    let removedToots = [];
    if (orshinSuugch.toots && orshinSuugch.toots.length > 0) {
      const initialLength = orshinSuugch.toots.length;

      // PRE-FETCH building names to ensure robust matching if bairId is missing from API
      let tootBuildingNames = {};
      try {
        const Baiguullaga = require("../models/baiguullaga");
        for (const t of orshinSuugch.toots) {
          if (t.barilgiinId && !tootBuildingNames[t.barilgiinId]) {
            const org = await Baiguullaga(db.erunkhiiKholbolt).findOne({
              "barilguud._id": t.barilgiinId
            });
            if (org) {
              const blg = org.barilguud.id(t.barilgiinId);
              if (blg && blg.ner) {
                tootBuildingNames[t.barilgiinId] = blg.ner;
              }
            }
          }
        }
      } catch (err) {
         console.warn("⚠️ Could not pre-fetch building names for toots cleanup");
      }

      orshinSuugch.toots = orshinSuugch.toots.filter((t) => {
        if (t.source !== "WALLET_API") return true;

        let shouldRemove = false;
        if (String(t.billingId) === String(billingId)) shouldRemove = true;

        const bodyBairId = req.body?.bairId || req.query?.bairId;
        const bodyDoorNo = req.body?.doorNo || req.query?.doorNo;
        if (bodyBairId && bodyDoorNo) {
           if (String(t.walletBairId) === String(bodyBairId) && String(t.walletDoorNo) === String(bodyDoorNo)) shouldRemove = true;
        }

        // A. Match by billing info from API (if we successfully fetched it)
        if (!shouldRemove && billingToRemove) {
          const matchByAddress =
            String(t.walletBairId || "") ===
              String(billingToRemove.bairId || "") &&
            String(t.walletDoorNo || "") ===
              String(billingToRemove.doorNo || "");
          const matchByCustomer =
            billingToRemove.customerId &&
            String(t.walletCustomerId || "") ===
              String(billingToRemove.customerId);
          const matchByCustomerCode =
            billingToRemove.customerCode &&
            String(t.walletCustomerCode || "") ===
              String(billingToRemove.customerCode);

          if (matchByAddress || matchByCustomer || matchByCustomerCode) {
            shouldRemove = true;
          } else {
            // Fallback Match by text customerAddress (missing bairId in Wallet API response)
            if (billingToRemove.customerAddress) {
               const bName = t.bairniiNer || tootBuildingNames[t.barilgiinId];
               if (bName) {
                  // Some logic to ensure we loosely match it without false positives
                  // "БГД 20-р хороо 12-р байр" and "48"
                  const cleanCustomerAddress = String(billingToRemove.customerAddress).replace(/\s+/g, '').toLowerCase();
                  const cleanBName = String(bName).replace(/\s+/g, '').toLowerCase();
                  if (cleanCustomerAddress.includes(cleanBName) && cleanCustomerAddress.includes(String(t.walletDoorNo))) {
                     shouldRemove = true;
                  }
               }
            }
          }
        }
        
        // Final fallback: If we couldn't fetch billingToRemove from API, but we know the UI is deleting
        // an address from the UI, and the user HAS Wallet API toots, 
        // We will just let the cache miss happen, and hopefully it matches by body.
        
        if (shouldRemove) {
          removedToots.push(t);
          return false;
        }
        return true;
      });

      if (orshinSuugch.toots.length !== initialLength) {
        localUpdated = true;
        
        // Check if any removed toot matches the primary orshinSuugch fields
        let clearPrimaryFields = false;
        for (const rt of removedToots) {
          if (
            rt.barilgiinId && String(rt.barilgiinId) === String(orshinSuugch.barilgiinId) &&
            rt.toot && String(rt.toot) === String(orshinSuugch.toot)
          ) {
            clearPrimaryFields = true;
            break;
          }
        }
        
        if (clearPrimaryFields) {
          orshinSuugch.bairniiNer = "";
          orshinSuugch.barilgiinId = null;
          orshinSuugch.baiguullagiinId = null;
          orshinSuugch.davkhar = "";
          orshinSuugch.orts = "";
          orshinSuugch.toot = "";
        }
      }
    }

    // Remove from billNicknames array if it exists
    if (orshinSuugch.billNicknames && orshinSuugch.billNicknames.length > 0) {
      const initialNicknameLength = orshinSuugch.billNicknames.length;
      orshinSuugch.billNicknames = orshinSuugch.billNicknames.filter(
        (n) => n.billingId !== billingId
      );
      if (orshinSuugch.billNicknames.length !== initialNicknameLength) {
        localUpdated = true;
      }
    }

    if (localUpdated) {
      await orshinSuugch.save();
    }

    // Emit socket notification for real-time UI refresh
    try {
      const io = req.app.get("socketio");
      if (io && tokenObject.id) {
        io.emit(`orshinSuugch${tokenObject.id}`, {
          type: "billing_update",
          action: "remove",
          billingId: billingId,
          message: "Биллинг устгагдлаа"
        });
      }
    } catch (socketErr) {
      console.warn("⚠️ [WALLET REMOVE] Socket emission failed:", socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: result,
      localUpdated,
      message: "Биллинг амжилттай устгаж, дотоод мэдээллийг цэвэрлэлээ",
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillRemove = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const jwt = require("jsonwebtoken");
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );

    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Use phone number for this endpoint (Wallet-Service requirement)
    const userId = orshinSuugch.utas;
    const { billingId, billId } = req.params;

    if (!billingId || !billId) {
      throw new aldaa(
        "Биллингийн ID болон Билл-ийн ID заавал бөглөх шаардлагатай!",
      );
    }

    const result = await walletApiService.removeBill(userId, billingId, billId);
    res.status(200).json({
      success: true,
      data: result,
      message: "Билл амжилттай устгалаа",
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillRecover = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { billingId } = req.params;

    if (!billingId) {
      throw new aldaa("Биллингийн ID заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.recoverBill(userId, billingId);
    res.status(200).json({
      success: true,
      data: result,
      message: "Билл амжилттай сэргээлээ",
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillingChangeName = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { billingId } = req.params;
    const { name } = req.body;

    if (!billingId) {
      throw new aldaa("Биллингийн ID заавал бөглөх шаардлагатай!");
    }

    if (!name) {
      throw new aldaa("Биллингийн нэр заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.changeBillingName(
      userId,
      billingId,
      name,
    );
    res.status(200).json({
      success: true,
      data: result,
      message: "Биллингийн нэр амжилттай өөрчлөгдлөө",
    });
  } catch (err) {
    next(err);
  }
});

exports.walletBillingSetNickname = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const OrshinSuugch = require("../models/orshinSuugch");
    const jwt = require("jsonwebtoken");
    if (!req.headers.authorization) {
      throw new aldaa("Нэвтрэх шаардлагатай!");
    }
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);

    const { billingId } = req.params;
    const { nickname } = req.body;

    if (!billingId) {
      throw new aldaa("Биллингийн ID заавал бөглөх шаардлагатай!");
    }

    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(
      tokenObject.id,
    );
    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    if (!orshinSuugch.billNicknames) {
      orshinSuugch.billNicknames = [];
    }

    const existingIndex = orshinSuugch.billNicknames.findIndex(
      (n) => n.billingId === billingId,
    );
    if (existingIndex >= 0) {
      if (nickname) {
        orshinSuugch.billNicknames[existingIndex].nickname = nickname;
      } else {
        // Remove if empty
        orshinSuugch.billNicknames.splice(existingIndex, 1);
      }
    } else if (nickname) {
      orshinSuugch.billNicknames.push({ billingId, nickname });
    }

    await orshinSuugch.save();

    res.status(200).json({
      success: true,
      message: "Биллингийн хоч нэр амжилттай хадгалагдлаа",
      billNicknames: orshinSuugch.billNicknames,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletInvoiceCreate = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const invoiceData = req.body;

    if (!invoiceData) {
      throw new aldaa("Нэхэмжлэхийн мэдээлэл заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.createInvoice(userId, invoiceData);

    res.status(200).json({
      success: true,
      data: result,
      message: "Нэхэмжлэх амжилттай үүсгэлээ",
    });
  } catch (err) {
    console.error("❌ [WALLET INVOICE CREATE] Error:", err.message);
    next(err);
  }
});

exports.walletInvoiceGet = asyncHandler(async (req, res, next) => {
  try {
    const { userId, utas } = await getUserIdFromToken(req);
    const { invoiceId } = req.params;

    if (!invoiceId) {
      throw new aldaa("Нэхэмжлэхийн ID заавал бөглөх шаардлагатай!");
    }

    let invoice = await walletApiService.getInvoice(userId, invoiceId);
    
    // Fallback: If not found with UUID/primary userId, try with phone number
    if (!invoice && userId !== utas) {
      console.log(`ℹ️ [WALLET INVOICE GET] Invoice not found for ${userId}, trying fallback to ${utas}`);
      invoice = await walletApiService.getInvoice(utas, invoiceId);
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Нэхэмжлэх олдсонгүй",
      });
    }


    res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (err) {
    console.error("❌ [WALLET INVOICE GET] Error:", err.message);
    next(err);
  }
});

exports.walletInvoiceCancel = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { invoiceId } = req.params;

    if (!invoiceId) {
      throw new aldaa("Нэхэмжлэхийн ID заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.cancelInvoice(userId, invoiceId);

    res.status(200).json({
      success: true,
      data: result,
      message: "Нэхэмжлэх амжилттай цуцлагдлаа",
    });
  } catch (err) {
    console.error("❌ [WALLET INVOICE CANCEL] Error:", err.message);
    next(err);
  }
});

exports.walletPaymentCreate = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const paymentData = req.body;

    if (!paymentData || !paymentData.invoiceId) {
      throw new aldaa(
        "Төлбөрийн мэдээлэл болон нэхэмжлэхийн ID заавал бөглөх шаардлагатай!",
      );
    }

    const result = await walletApiService.createPayment(userId, paymentData);

    res.status(200).json({
      success: true,
      data: result,
      message: "Төлбөр амжилттай үүсгэлээ",
    });
  } catch (err) {
    console.error("❌ [WALLET PAYMENT CREATE] Error:", err.message);
    if (err.response) {
      console.error(
        "❌ [WALLET PAYMENT CREATE] Error response:",
        JSON.stringify(err.response.data),
      );
    }
    next(err);
  }
});

exports.walletPaymentGet = asyncHandler(async (req, res, next) => {
  try {
    const { userId, utas } = await getUserIdFromToken(req);
    const { paymentId } = req.params;

    if (!paymentId) {
      throw new aldaa("Төлбөрийн ID заавал бөглөх шаардлагатай!");
    }

    let result = await walletApiService.getPayment(userId, paymentId);

    // Fallback: If not found with UUID/primary userId, try with phone number
    if (!result && userId !== utas) {
      console.log(`ℹ️ [WALLET PAYMENT GET] Payment not found for ${userId}, trying fallback to ${utas}`);
      result = await walletApiService.getPayment(utas, paymentId);
    }

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Төлбөр олдсонгүй",
      });
    }


    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("❌ [WALLET PAYMENT GET] Error:", err.message);
    if (err.response) {
      console.error(
        "❌ [WALLET PAYMENT GET] Error response:",
        JSON.stringify(err.response.data),
      );
    }
    next(err);
  }
});

exports.walletPaymentUpdateQPay = asyncHandler(async (req, res, next) => {
  try {
    const { userId, utas } = await getUserIdFromToken(req);
    const { paymentId } = req.params;
    const qpayData = req.body;

    if (!paymentId) {
      throw new aldaa("Төлбөрийн ID заавал бөглөх шаардлагатай!");
    }

    if (!qpayData || !qpayData.qpayPaymentId) {
      throw new aldaa("QPay төлбөрийн мэдээлэл заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.updateQPayPayment(
      userId,
      paymentId,
      qpayData,
    );
    
    // Clear cache for BOTH ID types to be safe
    walletApiService.clearBillingListCache(userId);
    walletApiService.clearBillingListCache(utas);

    // Local DB-д давхар хадгалах
    try {
      const { db } = require("zevbackv2");
      const WalletPayment = require("../models/walletPayment");

      let orshinSuugchId = null;
      if (req.headers.authorization) {
        const jwt = require("jsonwebtoken");
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
          const tokenObject = jwt.verify(token, process.env.APP_SECRET);
          if (tokenObject && tokenObject.id && tokenObject.id !== "zochin") {
            orshinSuugchId = tokenObject.id;
          }
        }
      }

      await WalletPayment(db.erunkhiiKholbolt).findOneAndUpdate(
        { paymentId: paymentId },
        {
          $set: {
            userId: userId,
            orshinSuugchId: orshinSuugchId,
            qpayPaymentId: qpayData.qpayPaymentId,
            trxDate: qpayData.trxDate,
            trxNo: qpayData.trxNo,
            trxDescription: qpayData.trxDescription,
            amount: qpayData.amount,
            receiverBankCode: qpayData.receiverBankCode,
            receiverAccountNo: qpayData.receiverAccountNo,
            receiverAccountName: qpayData.receiverAccountName,
            rawQpayData: qpayData,
            status: "PAID",
          },
        },
        { upsert: true, new: true },
      );
      console.log(
        `✅ [WALLET PAYMENT UPDATE QPAY] Payment saved to DB: ${paymentId}`,
      );
    } catch (dbError) {
      console.error(
        "❌ [WALLET PAYMENT UPDATE QPAY] Failed to save locally:",
        dbError.message,
      );
    }

    res.status(200).json({
      success: true,
      data: result,
      message: "QPay төлбөрийн мэдээлэл амжилттай шинэчлэгдлээ",
    });
  } catch (err) {
    console.error("❌ [WALLET PAYMENT UPDATE QPAY] Error:", err.message);
    if (err.response) {
      console.error(
        "❌ [WALLET PAYMENT UPDATE QPAY] Error response:",
        JSON.stringify(err.response.data),
      );
    }
    next(err);
  }
});

exports.walletUserEdit = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const jwt = require("jsonwebtoken");
    if (!req.headers.authorization) {
      throw new aldaa("Нэвтрэх шаардлагатай!");
    }
    const token = req.headers.authorization.split(" ")[1];
    const tokenObject = jwt.verify(token, process.env.APP_SECRET);

    // Find local user record to sync with Wallet API
    const orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt).findById(tokenObject.id);
    if (!orshinSuugch) {
      throw new aldaa("Хэрэглэгч олдсонгүй!");
    }

    // Try to identify the user for Wallet API
    const walletUserId = orshinSuugch.walletUserId || orshinSuugch.utas;
    const userData = req.body;

    if (!userData) {
      throw new aldaa("Хэрэглэгчийн мэдээлэл заавал бөглөх шаардлагатай!");
    }

    // 1. Update Wallet API
    const result = await walletApiService.editUser(walletUserId, userData);

    // 2. Sync Local Document (Email and Phone)
    let localChanged = false;
    if (userData.email !== undefined) {
      orshinSuugch.mail = userData.email;
      localChanged = true;
    }
    if (userData.phone !== undefined) {
      orshinSuugch.utas = userData.phone;
      localChanged = true;
    }
    
    if (localChanged) {
      console.log(`✅ [WALLET USER EDIT] Syncing ${localChanged ? 'local' : ''} profile for user: ${orshinSuugch.utas}`);
      await orshinSuugch.save();
    }

    res.status(200).json({
      success: true,
      data: result,
      message: "Хэрэглэгчийн мэдээлэл амжилттай шинэчлэгдлээ",
    });
  } catch (err) {
    next(err);
  }
});
exports.walletChatCreate = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { paymentId, reason } = req.body;

    if (!paymentId || !reason) {
      throw new aldaa("Төлбөрийн ID болон шалтгаан заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.createChat(userId, paymentId, reason);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletChatGet = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { chatId } = req.params;

    if (!chatId) {
      throw new aldaa("Чатын ID заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.getChat(userId, chatId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletChatGetByObject = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { objectId } = req.params;

    if (!objectId) {
      throw new aldaa("Объектын ID заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.getChatByObject(userId, objectId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

exports.walletChatSendMessage = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = await getUserIdFromToken(req);
    const { chatId } = req.params;
    const { message } = req.body;

    if (!chatId || !message) {
      throw new aldaa("Чатын ID болон мессеж заавал бөглөх шаардлагатай!");
    }

    const result = await walletApiService.sendMessage(userId, chatId, message);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});
