var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        user_id: res.locals.authn_user.user_id,
        is_administrator: res.locals.is_administrator,
        req_date: res.locals.req_date,
    };
    sqldb.queryOneRow(sql.select_home, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.courses = result.rows[0].courses;
        res.locals.course_instances = result.rows[0].course_instances;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
