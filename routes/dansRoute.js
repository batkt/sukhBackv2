const express = require("express");
const router = express.Router();
const { Dans } = require("zevbackv2");
const { crud, UstsanBarimt } = require("zevbackv2");
crud(router, "dans", Dans, UstsanBarimt);
module.exports = router;
