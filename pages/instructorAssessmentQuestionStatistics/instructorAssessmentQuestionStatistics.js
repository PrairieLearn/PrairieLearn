const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const csvStringify = require('csv').stringify;
const express = require('express');
const router = express.Router();
const debug = require('debug')('prairielearn:instructorAssessment');
const archiver = require('archiver');

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    async.series([
        function(callback) {
          var params = {assessment_id: res.locals.assessment.id};
          sqldb.queryOneRow(sql.assessment_stats_last_updated, params, function(err, result) {
            if (ERR(err, callback)) return;
            res.locals.stats_last_updated = result.rows[0].stats_last_updated;
            callback(null);
          });
        },
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
            debug('query questions');
            var params = {
                assessment_id: res.locals.assessment.id,
                course_id: res.locals.course.id,
            };
            sqldb.query(sql.questions, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.questions = result.rows;
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
    if (req.body.__action == 'refresh_stats') {
        var params = [
            req.locals.assessment.id,
        ];
        sqldb.call('assessment_questions_calculate_stats_for_assessment', params, function(err) {
          if (ERR(err, next)) return;
          res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
