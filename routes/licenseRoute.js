const express = require("express");
const router = express.Router();
//const { crud } = require('../components/crud');
//const UstsanBarimt = require("../models/ustsanBarimt");
const { crud, UstsanBarimt } = require("zevbackv2");
const License = require("../models/license.js");
const si = require("systeminformation");

crud(router, "license", License, UstsanBarimt);

router.get("/systemiinMedeelelAvya", async (req, res, next) => {
  try {
    const data = await si.mem();
    res.send(data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
