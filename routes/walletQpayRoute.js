const express = require("express");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const walletQpayController = require("../controller/walletQpayController");

/**
 * @route POST /walletQpay/create
 * @desc  Create QPay invoice for a Wallet API payment
 *        Same QPay process as original, source = WALLET_QPAY
 * @access Private (requires auth token)
 *
 * Body: { baiguullagiinId, barilgiinId?, billingId, billIds[],
 *         vatReceiveType?, dun? }
 *
 * Returns: QPay QR data (same shape as /qpayGargaya)
 *        + walletPaymentId, walletInvoiceId
 */
router.post("/walletQpay/create", tokenShalgakh, walletQpayController.createWalletQpayInvoice);

/**
 * @route GET /walletQpay/callback/:baiguullagiinId/:walletPaymentId
 * @route POST /walletQpay/callback/:baiguullagiinId/:walletPaymentId
 * @desc  QPay payment callback — marks paid + calls Wallet paidByQpay
 * @access Public (called by QPay server)
 */
router.get(
  "/walletQpay/callback/:baiguullagiinId/:walletPaymentId",
  walletQpayController.walletQpayCallback
);
router.post(
  "/walletQpay/callback/:baiguullagiinId/:walletPaymentId",
  walletQpayController.walletQpayCallback
);

/**
 * @route GET /walletQpay/check/:baiguullagiinId/:walletPaymentId
 * @desc  Check QPay payment status (frontend polling)
 * @access Private
 */
router.get(
  "/walletQpay/check/:baiguullagiinId/:walletPaymentId",
  tokenShalgakh,
  walletQpayController.walletQpayCheck
);

/**
 * @route GET /walletQpay/payment/:paymentId
 * @desc  Get full payment details including VAT (ebarimt) info
 * @access Private
 */
router.get(
  "/walletQpay/payment/:paymentId",
  tokenShalgakh,
  walletQpayController.getWalletPayment
);

/**
 * @route GET /walletQpay/list
 * @desc  Fetch wallet payment history for the user
 * @access Private
 */
router.get(
  "/walletQpay/list",
  tokenShalgakh,
  walletQpayController.getWalletQpayList
);

/**
 * @route GET /walletQpay/qpay-check/:baiguullagiinId/:invoiceId
 * @desc  Debug: raw QPay check result — use to find qpayPaymentId for stuck payments
 * @access Public (admin use)
 */
router.get(
  "/walletQpay/qpay-check/:baiguullagiinId/:invoiceId",
  walletQpayController.debugQpayCheck
);

/**
 * @route GET /walletQpay/wallet-check/:baiguullagiinId/:walletPaymentId
 * @desc  Debug: Raw check of Wallet API payment detailed info
 * @access Public (admin use)
 */
router.get(
  "/walletQpay/wallet-check/:baiguullagiinId/:walletPaymentId",
  walletQpayController.debugWalletCheck
);

/**
 * @route GET /walletQpay/bill-check/:baiguullagiinId/:billId
 * @desc  Debug: Find Wallet payment status by Bill ID (e.g. 438895172)
 * @access Public (admin use)
 */
router.get(
  "/walletQpay/bill-check/:baiguullagiinId/:billId",
  walletQpayController.debugBillCheck
);

/**
 * @route GET /walletQpay/easy-check/:baiguullagiinId/:walletPaymentId
 * @desc  Debug: Dry run check to see which Easy Register user matches a payment
 * @access Public (admin use)
 */
router.get(
  "/walletQpay/easy-check/:baiguullagiinId/:walletPaymentId",
  walletQpayController.debugEasyCheck
);

/**
 * @route POST /walletQpay/resync/:baiguullagiinId/:walletPaymentId
 * @desc  Admin: force re-sync a stuck payment to the Wallet Service.
 *        Use when local tulsunEsekh=true but Wallet API still shows NEW.
 * @access Public (internal admin use — protect with firewall/IP if needed)
 */
router.post(
  "/walletQpay/resync/:baiguullagiinId/:walletPaymentId",
  walletQpayController.resyncWalletPayment
);

module.exports = router;
