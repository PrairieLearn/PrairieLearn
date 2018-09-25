const ERR = require('async-stacktrace');
const async = require('async');
const express = require('express');
const router = express.Router();
const debug = require('debug')('prairielearn:instructorAssessment');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    async.series([
        function(callback) {
            debug('query assessment_stats');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_stat = result.rows[0];
                callback(null);
           });
        },
        function(callback) {
            debug('query assessment_duration_stats');
            // FIXME: change to assessment_instance_duration_stats and show all instances
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.duration_stat = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            debug('query assessment_score_histogram_by_date');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.assessment_score_histogram_by_date, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.assessment_score_histogram_by_date = result.rows;
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
