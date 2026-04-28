const express = require("express");
const router = express.Router();
const GereeniiZagvar = require("../models/gereeniiZagvar");
const GereeniiZaalt = require("../models/gereeniiZaalt");
//const { crud } = require("../components/crud");
//const { tokenShalgakh } = require("../middlewares/tokenShalgakh");
//const UstsanBarimt = require("../models/ustsanBarimt");
const { tokenShalgakh, crud, UstsanBarimt } = require("zevbackv2");
const multer = require("multer");
const storage = multer.memoryStorage();
const uploadFile = multer({ storage: storage });

crud(router, "gereeniiZagvar", GereeniiZagvar, UstsanBarimt);
crud(router, "gereeniiZaalt", GereeniiZaalt, UstsanBarimt);

const {
  gereeniiZaaltTatya,
  gereeniiZagvarTatya,
  gereeniiZagvarAvya,
} = require("../controller/excel");
const {
  gereeniiZagvarSoliyo,
  gereeniiZagvarHuvisagchAvya,
} = require("../controller/gereeniiZagvarController");

router
  .route("/gereeniiZaaltTatya")
  .post(uploadFile.single("file"), tokenShalgakh, gereeniiZaaltTatya);
router
  .route("/gereeniiZagvarTatya")
  .post(uploadFile.single("file"), tokenShalgakh, gereeniiZagvarTatya);
router.route("/gereeniiZagvarAvya").get(gereeniiZagvarAvya);
router.post("/gereeniiZagvarSoliyo", tokenShalgakh, gereeniiZagvarSoliyo);
router.post("/gereeniiZagvarHuvisagchAvya", tokenShalgakh, gereeniiZagvarHuvisagchAvya);

module.exports = router;
