var admin = require("firebase-admin");
var fs = require("fs");
var path = require("path");

// Check if Firebase is already initialized
if (admin.apps.length === 0) {
  try {
    const serviceAccountPath = path.join(__dirname, "./serviceAccountKey.json");
    
    // Try to load from JSON file if it exists
    if (fs.existsSync(serviceAccountPath)) {
      var serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // databaseURL: "https://turees-fe156.firebaseio.com",
      });
    } else {
      // Try to use environment variables as fallback
      const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccountEnv) {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          // databaseURL: "https://turees-fe156.firebaseio.com",
        });
      } else {
        console.warn("Warning: Firebase service account key not found. Firebase features may not work.");
        console.warn("Please provide serviceAccountKey.json in the middleware directory or set FIREBASE_SERVICE_ACCOUNT environment variable.");
        // Initialize with default app (may not work for all features)
        try {
          admin.initializeApp();
        } catch (error) {
          console.error("Failed to initialize Firebase:", error.message);
        }
      }
    }
  } catch (error) {
    console.error("Error initializing Firebase:", error.message);
    // Try to initialize with default app as last resort
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp();
      }
    } catch (initError) {
      console.error("Failed to initialize Firebase with default app:", initError.message);
    }
  }
}

module.exports.admin = admin;
