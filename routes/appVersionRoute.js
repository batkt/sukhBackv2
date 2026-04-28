const express = require("express");
const router = express.Router();
const versionController = require("../controller/appVersionController");

router.get("/app-version", versionController.getVersion);
router.post("/app-version", versionController.upsertVersion);

module.exports = router;
