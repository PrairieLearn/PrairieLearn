var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        course_id: res.locals.course.id,
        authz_data: res.locals.authz_data,
    };
    sqldb.query(sql.select_course_info, params, function(err, result) {
        if (ERR(err, next)) return;
        
        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
