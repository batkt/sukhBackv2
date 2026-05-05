const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const {
  walletBillers,
  walletBillingByBiller,
  walletBillingByCustomer,
  walletBillingList,
  walletBillingBills,
  walletBillingPayments,
  walletBillingSave,
  walletBillingRemove,
  walletBillRemove,
  walletBillRecover,
  walletBillingChangeName,
  walletInvoiceCreate,
  walletInvoiceGet,
  walletInvoiceCancel,
  walletPaymentCreate,
  walletPaymentGet,
  walletPaymentUpdateQPay,
  walletUserEdit,
  walletChatCreate,
  walletChatGet,
  walletChatGetByObject,
  walletChatSendMessage,
} = require("../controller/walletController");

router.get("/billers", tokenShalgakh, walletBillers);

router.get("/billing/biller/:billerCode/:customerCode", tokenShalgakh, walletBillingByBiller);
router.get("/billing/customer/:customerId", tokenShalgakh, walletBillingByCustomer);
router.get("/billing/list", tokenShalgakh, walletBillingList);
router.get("/billing/bills/:billingId", tokenShalgakh, walletBillingBills);
router.get("/billing/payments/:billingId", tokenShalgakh, walletBillingPayments);
router.post("/billing", tokenShalgakh, walletBillingSave);
router.delete("/billing/:billingId", tokenShalgakh, walletBillingRemove);
router.delete("/billing/:billingId/bill/:billId", tokenShalgakh, walletBillRemove);
router.put("/billing/:billingId/recover", tokenShalgakh, walletBillRecover);
router.put("/billing/:billingId/name", tokenShalgakh, walletBillingChangeName);
router.put("/billing/:billingId/nickname", tokenShalgakh, walletBillingSetNickname);

router.post("/invoice", tokenShalgakh, walletInvoiceCreate);
router.get("/invoice/:invoiceId", tokenShalgakh, walletInvoiceGet);
router.put("/invoice/:invoiceId/cancel", tokenShalgakh, walletInvoiceCancel);

router.post("/payment", tokenShalgakh, walletPaymentCreate);
router.get("/payment/:paymentId", tokenShalgakh, walletPaymentGet);
router.put("/payment/qpay/:paymentId", tokenShalgakh, walletPaymentUpdateQPay);

router.put("/user", tokenShalgakh, walletUserEdit);

// Chat routes
router.post("/chat", tokenShalgakh, walletChatCreate);
router.get("/chat/:chatId", tokenShalgakh, walletChatGet);
router.get("/chat/object/:objectId", tokenShalgakh, walletChatGetByObject);
router.put("/chat/:chatId", tokenShalgakh, walletChatSendMessage);

module.exports = router;

