var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib').sqlDb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;

var config = require('../../lib/config');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    res.locals.showAll = true;

    var params = {
        ip: req.ip,
        force_mode: (config.authType == 'none' && req.cookies.pl_requested_mode) ? req.cookies.pl_requested_mode : null,
        req_date: res.locals.req_date,
    };

    sqldb.query(sql.get_mode, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.mode = result.rows[0].mode;
        if (res.locals.mode == 'Exam') {
            res.locals.config.hasOauth = false;
            res.locals.config.hasAzure = false;
        }
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
