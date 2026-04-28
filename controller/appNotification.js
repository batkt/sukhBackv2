const { admin } = require("../middleware/firebase-config");

async function sonorduulgaIlgeeye(token, medeelel, callback, next) {
  const payload = {
    token,
    webpush: {
      TTL: 86400,
      notification: {
        title: "Таньд мэдэгдэл ирлээ!",
        body: "Hello world",
        icon: "default",
        sound: "default",
        badge: "1",
        ...medeelel,
      },
    },
    android: {
      priority: "normal",
      TTL: 86400,
      notification: {
        title: "Таньд мэдэгдэл ирлээ!",
        body: "Hello world",
        icon: "default",
        sound: "default",
        badge: "1",
        ...medeelel,
      },
    },
  };
  const options = {
    priority: "high",
    timeToLive: 60 * 60 * 24,
  };
  if (token)
    admin
      .messaging()
      .send(payload)
      .then((response) => {
        if (callback) callback(response);
      })
      .catch((error) => {
        next(error);
      });
  else if (callback) callback({ successCount: 1 });
}

async function orshinSuugchidSonorduulgaIlgeeye(
  token,
  medeelel,
  callback,
  next
) {
  if (!admin.apps.length) {
    const error = new Error("Firebase Admin SDK is not initialized");
    console.error("Firebase error:", error.message);
    if (next) return next(error);
    if (callback) return callback(null);
    return;
  }

  const payload = {
    token: token,
    notification: {
      title: medeelel?.title || "Таньд мэдэгдэл ирлээ!",
      body: medeelel?.body || medeelel?.message || "Шинэ мэдэгдэл",
    },
    android: {
      priority: "high",
      notification: {
        sound: "default",
        channelId: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
    data: {
      type: medeelel?.type || "notification",
      ...(medeelel?.data || {}),
    },
  };

  const options = {
    priority: "high",
    timeToLive: 60 * 60 * 24, // 24 hours
  };

  try {
    const response = await admin.messaging().send(payload, options);
    console.log("✅ Firebase notification sent successfully:", response);
    if (callback) callback(response);
  } catch (error) {
    console.error("❌ Firebase notification error:", error.message);
    console.error("Error code:", error.code);
    console.error("Error details:", error.errorInfo);
    
    // Handle specific Firebase errors
    if (error.code === "messaging/invalid-registration-token" || 
        error.code === "messaging/registration-token-not-registered") {
      console.warn("⚠️ Invalid or unregistered Firebase token:", token);
    }
    
    if (next) {
      next(error);
    } else if (callback) {
      // Still call callback even on error so notification can be saved
      callback(null, error);
    }
  }
}

module.exports = {
  sonorduulgaIlgeeye,
  orshinSuugchidSonorduulgaIlgeeye,
};
