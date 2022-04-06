const express = require('express');

const router = express.Router();

router.all('/*', function (req, res, next) {
  res.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');

  next();
});

module.exports = router;
