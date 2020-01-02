const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const async = require('async');
const sanitizeName = require('../../lib/sanitize-name');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sql = sqlLoader.loadSqlEquiv(__filename);

const filenames = function(locals) {
    const prefix = sanitizeName.questionFilenamePrefix(locals.question, locals.course);
    return {
        questionStatsCsvFilename: prefix + 'stats.csv',
    };
};

router.get('/', function(req, res, next) {
    async.series([
        (callback) => {
            debug('set filenames');
            _.assign(res.locals, filenames(res.locals));
            callback(null);
        },
        (callback) => {
            sqldb.query(sql.assessment_question_stats, {question_id: res.locals.question.id}, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_stats = result.rows;
                callback(null);
            });
        },
        (callback) => {
            res.locals.question_attempts_histogram = null;
            res.locals.question_attempts_before_giving_up_histogram = null;
            res.locals.question_attempts_histogram_hw = null;
            res.locals.question_attempts_before_giving_up_histogram_hw = null;
            // res.locals.question_attempts_histogram = res.locals.result.question_attempts_histogram;
            // res.locals.question_attempts_before_giving_up_histogram = res.locals.result.question_attempts_before_giving_up_histogram;
            // res.locals.question_attempts_histogram_hw = res.locals.result.question_attempts_histogram_hw;
            // res.locals.question_attempts_before_giving_up_histogram_hw = res.locals.result.question_attempts_before_giving_up_histogram_hw;
            callback(null);
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    if (req.params.filename === res.locals.questionStatsCsvFilename) {
        sqldb.query(sql.assessment_question_stats, {question_id: res.locals.question.id}, function(err, result) {
            if (ERR(err, next)) return;
            var questionStatsList = result.rows;
            var csvData = [];
            var csvHeaders = ['Course instance', 'Assessment'];
            Object.keys(res.locals.stat_descriptions).forEach(key => {
                csvHeaders.push(res.locals.stat_descriptions[key].non_html_title);
            });

            csvData.push(csvHeaders);

            _(questionStatsList).each(function(questionStats) {
                var questionStatsData = [];
                questionStatsData.push(questionStats.course_title);
                questionStatsData.push(questionStats.label);
                questionStatsData.push(questionStats.mean_question_score);
                questionStatsData.push(questionStats.question_score_variance);
                questionStatsData.push(questionStats.discrimination);
                questionStatsData.push(questionStats.some_submission_perc);
                questionStatsData.push(questionStats.some_perfect_submission_perc);
                questionStatsData.push(questionStats.some_nonzero_submission_perc);
                questionStatsData.push(questionStats.average_first_submission_score);
                questionStatsData.push(questionStats.first_submission_score_variance);
                questionStatsData.push(questionStats.first_submission_score_hist);
                questionStatsData.push(questionStats.average_last_submission_score);
                questionStatsData.push(questionStats.last_submission_score_variance);
                questionStatsData.push(questionStats.last_submission_score_hist);
                questionStatsData.push(questionStats.average_max_submission_score);
                questionStatsData.push(questionStats.max_submission_score_variance);
                questionStatsData.push(questionStats.max_submission_score_hist);
                questionStatsData.push(questionStats.average_average_submission_score);
                questionStatsData.push(questionStats.average_submission_score_variance);
                questionStatsData.push(questionStats.average_submission_score_hist);
                questionStatsData.push(questionStats.submission_score_array_averages);
                questionStatsData.push(questionStats.incremental_submission_score_array_averages);
                questionStatsData.push(questionStats.incremental_submission_points_array_averages);
                questionStatsData.push(questionStats.average_number_submissions);
                questionStatsData.push(questionStats.number_submissions_variance);
                questionStatsData.push(questionStats.number_submissions_hist);
                questionStatsData.push(questionStats.quintile_question_scores);

                _(questionStats.quintile_scores).each(function(perc) {
                    questionStatsData.push(perc);
                });

                csvData.push(questionStatsData);
            });

            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});
module.exports = router;
