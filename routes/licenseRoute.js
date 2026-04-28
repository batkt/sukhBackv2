const express = require("express");
const router = express.Router();
//const { crud } = require('../components/crud');
//const UstsanBarimt = require("../models/ustsanBarimt");
const { crud, UstsanBarimt } = require("zevbackv2");
const License = require("../models/license.js");
const si = require("systeminformation");

crud(router, "license", License, UstsanBarimt);

router.get("/systemiinMedeelelAvya", (req, res, next) => {
  try {
    si.mem()
      .then((data) => {
        res.send(data);
      })
      .catch((error) => {
        throw error;
      });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
