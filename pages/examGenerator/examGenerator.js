var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();
var debug = require('debug')('prairielearn:instructorAssessment');

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var csvMaker = require('../../lib/csv-maker');
var dataFiles = require('../../lib/data-files');
var assessment = require('../../lib/assessment');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    async.series([
        function(callback) {
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.generated_score_quintiles, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.asdf = result.rows;
                // console.log(res.locals.asdf);
                callback(null);
            });
        },
        function(callback) {
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.generated_score, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.asdf2 = result.rows[0];
                // console.log(res.locals.asdf2);
                callback(null);
            });
        },
        function(callback) {
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.generated_score_quintiles_new, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.asdf3 = result.rows[0];
                console.log(res.locals.asdf3.generated_assessment_question_ids);
                console.log(res.locals.asdf3.filtered);
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, next)) return;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});
module.exports = router;
