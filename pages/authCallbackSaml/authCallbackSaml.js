const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log(req, res);
    let redirUrl = res.locals.homeUrl;
    if ('preAuthUrl' in req.cookies) {
      redirUrl = req.cookies.preAuthUrl;
      res.clearCookie('preAuthUrl');
    }
    res.redirect(redirUrl);
  })
);

module.exports = router;
