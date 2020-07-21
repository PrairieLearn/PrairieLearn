var express = require('express');
var router = express.Router();

router.get('/', function(req, res, _next) {
    // We could set res.locals.config.hasOauth = false (or
    // hasAzure) to not display those options inside the CBTF, but
    // this will also need to depend on which institution we have
    // detected (e.g., UIUC doesn't want Azure during exams, but
    // ZJUI does want it).
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
