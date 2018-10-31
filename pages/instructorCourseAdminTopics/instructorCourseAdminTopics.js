var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.select_topics, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.topics = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
