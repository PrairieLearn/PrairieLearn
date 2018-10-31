var express = require('express');
var router = express.Router();

router.get('/', function(req, res, _next) {
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
