var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

// called when the browser sends a GET request to get this page
router.get('/', function(req, res, next) {
    var params = {
        course_instance_id: res.locals.course_instance.id, // Where is res.locals coming from?
        authz_data: res.locals.authz_data,
        user_id: res.locals.user.user_id,
        req_date: res.locals.req_date,
    };
    sqldb.query(sql.select_assessments, params, function(err, result) { // runs the select_assessments BLOCK in the sql
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals); // res.locals contains all the user-specific data to load
    });
});

module.exports = router;
