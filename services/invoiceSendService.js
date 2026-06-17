const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const { createInvoiceForContract } = require("./invoiceService");
const { deleteInvoice } = require("./invoiceDeletionService");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const axios = require("axios");

async function sendInvoiceSmsNotification(kholbolt, invoiceId, baiguullagiinId, options = {}) {
  try {
    const NekhemjlekhiinTuukhModel = NekhemjlekhiinTuukh(kholbolt);
    const invoice = await NekhemjlekhiinTuukhModel.findById(invoiceId);

    if (!invoice) {
      console.error(`❌ [SMS Notification] Invoice not found: ${invoiceId}`);
      return { success: false, error: "Invoice not found" };
    }

    if (invoice.tuluv === "Төлсөн") {
      console.log(`ℹ️ [SMS Notification] Invoice is already paid: ${invoiceId}`);
      return { success: true, message: "Invoice already paid" };
    }

    if (!invoice.utas || !invoice.utas.length) {
      console.warn(`⚠️ [SMS Notification] No phone numbers for invoice: ${invoiceId}`);
      return { success: false, error: "No phone numbers found" };
    }

    const displayAmount = (options && options.manualAmount !== undefined && options.manualAmount !== null)
      ? options.manualAmount
      : (invoice.niitTulbur || 0);

    // 1. Create QPay invoice if it does not exist yet, or if a specific manual amount is requested
    const shouldGenerateQpay = (!invoice.qpayInvoiceId || (options && options.manualAmount)) && displayAmount > 0;
    if (shouldGenerateQpay) {
      try {
        const { qpayGargaya } = require("quickqpaypackvSukh");
        const maxDugaar = invoice.dugaalaltDugaar || 1;

        const callback_url =
          process.env.UNDSEN_SERVER +
          "/api/qpayNekhemjlekhCallback/" +
          baiguullagiinId.toString() +
          "/" +
          invoice._id.toString();

        const qpayBody = {
          baiguullagiinId: baiguullagiinId,
          barilgiinId: invoice.barilgiinId,
          dun: displayAmount,
          tailbar: `${invoice.baiguullagiinNer || "Amarhome"} Нэхэмжлэх: ${invoice.toot || ""} тоот`,
          zakhialgiinDugaar: invoice.nekhemjlekhiinDugaar || String(maxDugaar),
          gereeniiId: invoice.gereeniiId,
          nekhemjlekhiinId: invoice._id.toString(),
        };

        console.log(`📡 [SMS Notification] Generating QPay invoice for invoiceId: ${invoiceId} with amount: ${displayAmount}`);
        const khariu = await qpayGargaya(qpayBody, callback_url, kholbolt);

        if (khariu) {
          const invoiceIdFromQpay = khariu.invoice_id || khariu.invoiceId || khariu.id;
          const qpayUrl = khariu.qr_text || khariu.url || khariu.invoice_url || khariu.qr_image;

          invoice.qpayInvoiceId = invoiceIdFromQpay;
          invoice.qpayUrl = qpayUrl;
          invoice.qpayUrls = khariu.urls;
          await invoice.save();
        }
      } catch (qpayErr) {
        console.error("❌ [SMS Notification] Failed to generate QPay invoice:", qpayErr.message);
      }
    }

    // 2. Format Cyrillic/Mongolian message with the deep link
    const yearMonth = invoice.ognoo ? new Date(invoice.ognoo) : new Date();
    const month = yearMonth.getMonth() + 1;
    const orgNameStr = invoice.baiguullagiinNer ? `${invoice.baiguullagiinNer} ` : "";
    const tootStr = invoice.toot ? `${invoice.toot} tootod ` : "";
    const absAmount = Math.abs(displayAmount || 0);

    // Payment page URL hosted on Next.js frontend
    const paymentLink = `https://amarhome.mn/pay/${invoice.paymentToken || invoice._id}`;
    const appLink = `https://zevtabs.mn/qr/amarhome/`
    let msgText;

    // Determine message type based on amount and status
    if (displayAmount < 0) {
      // Tulult (payment record - shows amount that was paid, no link needed)
      msgText = `${orgNameStr}Tany ${tootStr} tulult burtgegdlee. Tulsun dun: ${absAmount}. App tatakh kholboos ${appLink}`;
    } else if (invoice.tuluv === "Төлсөн") {
      // Tulsun (already paid)
      msgText = `${orgNameStr}Tany ${tootStr} tulbur burtgegdlee. Tulsun dun: ${absAmount}. App tatakh kholboos ${appLink}`;
    } else {
      // Tulukh (needs payment - default)
      msgText = `${orgNameStr}Tany ${tootStr} nekhemjlekh uuslee. Tulukh dun: ${absAmount}. Tulukh kholboos: ${paymentLink}`;
    }

    if (msgText.length > 160) {
      let prefix;
      if (displayAmount < 0) {
        // Payment record - no payment link needed
        prefix = `${orgNameStr}Tany ${tootStr} tulult burtgegdlee. Tulsun dun: ${absAmount}. App tatakh kholboos ${appLink}`;
        msgText = prefix.substring(0, 160);
      } else {
        const suffix = ` Kholboos: ${paymentLink}`;
        const maxPrefixLength = 160 - suffix.length;
        if (invoice.tuluv === "Төлсөн") {
          prefix = `${orgNameStr}Tany ${tootStr}  tulbur burtgegdlee. Tulsun dun: ${absAmount}. App tatakh kholboos ${appLink}`;
        } else {
          prefix = `${orgNameStr}Tany ${tootStr} nekhemjlekh uuslee. Tulukh dun: ${absAmount}. Tulukh kholboos: ${paymentLink}`;
        }
        msgText = prefix.substring(0, maxPrefixLength) + suffix;
      }
    }

    // CallPro SMS Settings
    const key = "aa8e588459fdd9b7ac0b809fc29cfae3";
    const dugaar = "72002002";
    const activeUrl = "https://api-text.callpro.mn/v1/sms/send";

    for (const phone of invoice.utas) {
      if (!phone || phone.trim() === "") continue;
      try {
        console.log(`📡 [SMS Notification] Sending SMS via CallPro to: ${phone}`);

        await axios.post(activeUrl, {
          key: key,
          from: dugaar,
          to: phone.toString(),
          text: msgText
        }, {
          headers: {
            "x-api-key": key,
            "api-key": key,
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
          }
        });

        // Record in MsgTuukh database
        try {
          const MsgTuukh = require("../models/msgTuukh");
          const MsgTuukhModel = MsgTuukh(kholbolt);
          await MsgTuukhModel.create({
            baiguullagiinId: baiguullagiinId,
            barilgiinId: invoice.barilgiinId || "",
            dugaar: [phone],
            gereeniiId: invoice.gereeniiId || "",
            msg: msgText,
            msgIlgeekhKey: key,
            msgIlgeekhDugaar: dugaar,
          });
        } catch (dbErr) {
          console.error("❌ [SMS Notification] Failed to save MsgTuukh:", dbErr.message);
        }
      } catch (err) {
        console.error(`❌ [SMS Notification] Failed to send SMS to ${phone}:`, err?.response?.data || err.message);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("❌ [SMS Notification] Fatal error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Handle manual invoice generation and sending
 */
async function manualSendInvoice(gereeId, baiguullagiinId, override = false, options = {}) {
  try {
    const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
    if (!kholbolt) throw new Error("Connection not found");

    // 1. Logic moved to createInvoiceForContract (Upsert pattern)

    // 2. Create the invoice
    const result = await createInvoiceForContract(kholbolt, gereeId, {
      ...options,
      override,
    });
    if (!result.success) return result;

    // 3. Send notifications
    await sendInvoiceSmsNotification(kholbolt, result.invoiceId, baiguullagiinId);

    return { success: true, invoiceId: result.invoiceId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function manualSendMassInvoices(baiguullagiinId, gereeIds, override = true, options = {}) {
  const results = [];
  let created = 0;
  let errors = 0;
  const errorsList = [];

  const kholbolt = getKholboltByBaiguullagiinId(baiguullagiinId);
  const GereeModel = kholbolt ? require("../models/geree")(kholbolt) : null;

  for (const id of gereeIds) {
    try {
      const res = await manualSendInvoice(id, baiguullagiinId, override, options);
      if (res.success) {
        created++;
        results.push(res);
      } else {
        errors++;
        let gereeniiDugaar = id;
        if (GereeModel) {
          const geree = await GereeModel.findById(id).select("gereeniiDugaar toot").lean();
          if (geree) {
            gereeniiDugaar = `${geree.gereeniiDugaar || "Гэрээ"} (Тоот ${geree.toot || ""})`;
          }
        }
        errorsList.push({ gereeId: id, gereeniiDugaar, error: res.error || res.message });
      }
    } catch (err) {
      errors++;
      let gereeniiDugaar = id;
      if (GereeModel) {
        try {
          const geree = await GereeModel.findById(id).select("gereeniiDugaar toot").lean();
          if (geree) {
            gereeniiDugaar = `${geree.gereeniiDugaar || "Гэрээ"} (Тоот ${geree.toot || ""})`;
          }
        } catch (_) { }
      }
      errorsList.push({ gereeId: id, gereeniiDugaar, error: err.message });
    }
  }

  return {
    success: true,
    data: {
      created,
      errors,
      errorsList,
      results
    }
  };
}

module.exports = {
  manualSendInvoice,
  manualSendMassInvoices,
  manualSendSelectedInvoices: manualSendMassInvoices,
  sendInvoiceSmsNotification,
};
