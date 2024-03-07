var express = require('express');
var router = express.Router();

router.all('/*', function (req, res, next) {
  // enable CORS on all requests, see http://enable-cors.org/server_expressjs.html
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, PUT, PATCH, GET, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Accept, X-Auth-UID, X-Auth-Name, X-Auth-Date, X-Auth-Signature, Content-Type',
  );

  // disable all caching for all requests
  res.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');

  next();
});

// needed for CORS pre-flight checks
router.options('/*', function (req, res) {
  res.json({});
});

module.exports = router;
