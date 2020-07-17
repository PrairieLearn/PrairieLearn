var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(_req, res, next) {
    const params = {
        user_id: res.locals.authn_user.user_id,
    }
    sqldb.query(sql.insert_xc101_viewer, params, function(err, _result) {
        if (ERR(err, next)) return;

        // We could set res.locals.config.hasOauth = false (or
        // hasAzure) to not display those options inside the CBTF, but
        // this will also need to depend on which institution we have
        // detected (e.g., UIUC doesn't want Azure during exams, but
        // ZJUI does want it).
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
