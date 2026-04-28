const axios = require("axios");
const FormData = require("form-data");
const request = require("request");
const MsgTuukh = require("../models/msgTuukh");

/**
 * Send SMS via Unitel provider (Mongolia)
 * @param {Array} messages - Array of message objects with {to, text, baiguullagiinId, barilgiinId, gereeniiId}
 * @param {String} key - SMS provider API key
 * @param {String} senderNumber - SMS sender number
 * @param {Object} kholbolt - Database connection object
 * @returns {Array} Results array
 */
async function sendSmsUnitel(messages, key, senderNumber, kholbolt) {
  const results = [];

  for (const message of messages) {
    try {
      const form = new FormData();
      form.append("token_id", key);
      form.append("extension_number", "11"); // Fixed extension for Unitel
      form.append("sms_number", senderNumber);
      form.append("to", message.to.toString());
      form.append("body", message.text.toString());

      const response = await axios.post(
        "https://pbxuc.unitel.mn/hodupbx_api/v1.4/sendSms",
        form,
        { headers: form.getHeaders() }
      );

      if (response?.data?.status === "SUCCESS") {
        // Save to SMS history
        const MsgTuukhModel = MsgTuukh(kholbolt);
        await MsgTuukhModel.create({
          baiguullagiinId: message.baiguullagiinId,
          barilgiinId: message.barilgiinId,
          dugaar: [message.to],
          gereeniiId: message.gereeniiId,
          msg: message.text,
          msgIlgeekhKey: key,
          msgIlgeekhDugaar: senderNumber,
          turul: message.turul || "medegdel",
        });

        results.push({
          status: "SUCCESS",
          to: message.to,
          messageId: response.data.MessageID,
          result: response.data,
        });
      } else {
        results.push({
          status: "FAILED",
          to: message.to,
          error: response.data,
        });
      }
    } catch (error) {
      console.error("Unitel SMS Error:", error.message);
      results.push({
        status: "FAILED",
        to: message.to,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Send SMS via generic SMS server
 * @param {Array} messages - Array of message objects
 * @param {String} key - SMS provider API key
 * @param {String} senderNumber - SMS sender number
 * @param {Object} kholbolt - Database connection object
 * @returns {Promise<Array>} Results array
 */
function sendSmsGeneric(messages, key, senderNumber, kholbolt) {
  return new Promise((resolve, reject) => {
    const results = [];

    function sendNext(index) {
      if (index >= messages.length) {
        return resolve(results);
      }

      const message = messages[index];
      const url = encodeURI(
        `${process.env.MSG_SERVER}/send?key=${key}&from=${senderNumber}&to=${message.to}&text=${message.text}`
      );

      request(url, { json: true }, async (err, res, body) => {
        if (err) {
          console.error("Generic SMS Error:", err.message);
          results.push({
            status: "FAILED",
            to: message.to,
            error: err.message,
          });
          sendNext(index + 1);
          return;
        }

        try {
          // Save to SMS history
          const MsgTuukhModel = MsgTuukh(kholbolt);
          await MsgTuukhModel.create({
            baiguullagiinId: message.baiguullagiinId,
            barilgiinId: message.barilgiinId,
            dugaar: [message.to],
            gereeniiId: message.gereeniiId,
            msg: message.text,
            msgIlgeekhKey: key,
            msgIlgeekhDugaar: senderNumber,
            turul: message.turul || "medegdel",
          });

          results.push({
            status: "SUCCESS",
            to: message.to,
            result: body && body[0] ? body[0] : body,
          });
        } catch (dbError) {
          console.error("Database save error:", dbError.message);
          results.push({
            status: "PARTIAL_SUCCESS",
            to: message.to,
            result: body && body[0] ? body[0] : body,
            warning: "SMS sent but failed to save to database",
          });
        }

        sendNext(index + 1);
      });
    }

    sendNext(0);
  });
}

/**
 * Main SMS sending function - routes to appropriate provider
 * @param {Array} messages - Array of message objects
 * @param {String} key - SMS provider API key
 * @param {String} senderNumber - SMS sender number
 * @param {Object} kholbolt - Database connection object
 * @returns {Promise<Array>} Results array
 */
async function sendSms(messages, key, senderNumber, kholbolt) {
  if (!messages || messages.length === 0) {
    return [];
  }

  // Route to appropriate provider based on key
  if (key === "g25dFjT1y1upZLYR") {
    // Use Unitel provider
    return await sendSmsUnitel(messages, key, senderNumber, kholbolt);
  } else {
    // Use generic SMS server
    return await sendSmsGeneric(messages, key, senderNumber, kholbolt);
  }
}

module.exports = {
  sendSms,
  sendSmsUnitel,
  sendSmsGeneric,
};
