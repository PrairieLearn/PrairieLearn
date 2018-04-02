var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    if (res.locals.devMode) return res.redirect('/pl/');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
