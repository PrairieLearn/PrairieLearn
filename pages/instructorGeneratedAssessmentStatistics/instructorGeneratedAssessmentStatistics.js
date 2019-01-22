const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const async = require('async');

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const num_exams = 10000;

router.get('/', function(req, res, next) {
    debug('GET /');
    var params = {
        assessment_id: res.locals.assessment.id,
    };

    async.series([
        function(callback) {
            debug('query generated_assessments_calculation_status');
            const params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.get_generated_assessments_calculation_status, params, function(err, result) {
                if (ERR(err, next)) return;

                res.locals.generated_assessments_calculation_status = result.rows[0].generated_assessments_calculation_status;

                console.log('result: ' + result.rows[0]);
                console.log('Current generated assessments calculation status: ' + res.locals.generated_assessments_calculation_status);
                callback(null);
            });
        },
        function(callback) {
            debug('query generated_assessment_statistics');
            const params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.generated_assessment_statistics, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.generated_assessment_statistics = result.rows;
                console.log(res.locals.generated_assessment_statistics);
                callback(null);
            });
        },
        function(callback) {
            debug('query generated_assessment_stats_last_updated');
            const params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.generated_assessment_stats_last_updated, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.generated_assessment_stats_last_updated = result.rows[0].generated_assessment_stats_last_updated;
                callback(null);
            });
        },
        function(callback) {
            debug('get data for predicted results histogram')
            const params = {
                assessment_id: res.locals.assessment.id,
                num_sds: 1,
                num_buckets: 30,
                num_exams: num_exams
            };

            if (res.locals.assessment.num_sds) {
                params.num_sds = res.locals.assessment.num_sds;
            }

            if (req.query.num_sds) {
                params.num_sds = req.query.num_sds;
            }

            if (req.query.num_buckets) {
                params.num_buckets = req.query.num_buckets;
            }

            res.locals.num_buckets = params.num_buckets;
            res.locals.num_sds = params.num_sds;
            res.locals.num_exams = params.num_exams;

            sqldb.query(sql.generated_assessment_distribution, params, function(err, result) {
                if (ERR(err, callback)) return;

                const data = result.rows[0];

                res.locals.result = data.json;
                res.locals.num_exams_kept = data.num_exams_kept;
                res.locals.sd_before = data.sd_before;
                res.locals.sd_after = data.sd_after;
                res.locals.sd_perc_improvement = data.sd_perc_improvement;
                res.locals.quintile_stats = data.quintile_stats;

                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, next)) return;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action === 'refresh_generated_assessment_stats') {
        let params = {
            assessment_id: res.locals.assessment.id,
            status: 'STARTED',
        };
        sqldb.queryOneRow(sql.set_generated_assessments_calculation_status, params, function(err, _result) {
            if (ERR(err, next)) return;
            params = [
                req.body.assessment_id,
                num_exams,
            ];
            sqldb.call('assessments_calculate_generated_assessment_stats', params, function(err) {
                if (ERR(err, next)) return;
            });
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action === 'update_num_sds_value') {
        let params = {
            assessment_id: res.locals.assessment.id,
            num_sds_value: req.body.num_sds,
        };
        sqldb.queryOneRow(sql.update_num_sds_value, params, function(err, _result) {
            if (ERR(err, next)) return;
            if (req.originalUrl.indexOf('?') === -1) {
                res.redirect(req.originalUrl);
            } else {
                res.redirect(req.originalUrl.substring(0, req.originalUrl.indexOf('?')));
            }
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
