var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {

    var params = {
        course_instance_id: res.locals.course_instance.id,
    };

    sqldb.query(sql.course_instance_access_rules, params, function(err, result) {
        if (ERR(err, next)) return;

        res.locals.access_rules = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
