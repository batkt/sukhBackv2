const mongoose = require("mongoose");
const URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/nairamdalSukh?authSource=admin&serverSelectionTimeoutMS=5000";

console.log("Connecting to:", URI);
mongoose.connect(URI)
  .then(() => {
    console.log("Connected!");
    process.exit(0);
  })
  .catch(err => {
    console.error("Failed:", err.message);
    process.exit(1);
  });
