const axios = require("axios");
const MsgTuukh = require("../models/msgTuukh");

/**
 * Send SMS via CallPro provider (Mongolia)
 * @param {Array} messages - Array of message objects with {to, text, baiguullagiinId, barilgiinId, gereeniiId}
 * @param {String} key - CallPro API key
 * @param {String} senderNumber - CallPro sender number
 * @param {Object} kholbolt - Database connection object
 * @returns {Promise<Array>} Results array
 */
async function sendSms(messages, key, senderNumber, kholbolt) {
  // TEMPORARILY DISABLED: Global SMS switch
  console.log("⚠️ [smsService] SMS sending is temporarily disabled.");
  return (messages || []).map((m) => ({ status: "SKIPPED_DISABLED", to: m.to }));

  const results = [];
  if (!messages || messages.length === 0) return results;

  const activeUrl = "https://api-text.callpro.mn/v1/sms/send";

  for (const message of messages) {
    try {
      console.log(`[smsService] Sending SMS via CallPro to: ${message.to}`);
      
      const response = await axios.post(activeUrl, {
        key: key,
        from: senderNumber,
        to: message.to.toString(),
        text: message.text.toString()
      }, {
        headers: {
          "x-api-key": key,
          "api-key": key,
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        }
      });

      // CallPro returns a success response (usually status 200 with result)
      if (response && response.status === 200) {
        // Save to MsgTuukh history
        try {
          const MsgTuukhModel = MsgTuukh(kholbolt);
          await MsgTuukhModel.create({
            baiguullagiinId: message.baiguullagiinId,
            barilgiinId: message.barilgiinId || "",
            dugaar: [message.to],
            gereeniiId: message.gereeniiId || "",
            msg: message.text,
            msgIlgeekhKey: key,
            msgIlgeekhDugaar: senderNumber,
          });
        } catch (dbErr) {
          console.error("[smsService] Failed to save MsgTuukh:", dbErr.message);
        }

        results.push({
          status: "SUCCESS",
          to: message.to,
          result: response.data
        });
      } else {
        results.push({
          status: "FAILED",
          to: message.to,
          error: "CallPro status was not 200"
        });
      }
    } catch (error) {
      const errorMsg = error?.response?.data || error.message;
      console.error(`[smsService] CallPro SMS error for ${message.to}:`, errorMsg);
      results.push({
        status: "FAILED",
        to: message.to,
        error: errorMsg
      });
    }
  }

  return results;
}

module.exports = {
  sendSms,
};
