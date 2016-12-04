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

router.get('/:job_sequence_id', function(req, res, next) {
    var params = {
        job_sequence_id: req.params.job_id,
        course_id: res.locals.course.id,
    };
    sqldb.queryOneRow(sql.select_job_sequence, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job = result.rows[0];

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
