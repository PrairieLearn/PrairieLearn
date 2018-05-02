var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();
var csvStringify = require('csv').stringify;

var async = require('async');
var error = require('@prairielearn/prairielib/error');
var question = require('../../lib/question');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var debug = require('debug')('prairielearn:instructorQuestion');

var sql = sqlLoader.loadSqlEquiv(__filename);

var sanitizeName = function(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
};

var filenames = function(locals) {
    var prefix = sanitizeName(locals.course.short_name)
        + '_'
        + sanitizeName(locals.course_instance.short_name)
        + '_'
        + sanitizeName(locals.question.qid + '')
        + '_';
    return {
        assessmentStatsCsvFilename:       prefix + 'assessment_stats.csv',
    };
};

function processSubmission(req, res, callback) {
    let variant_id, submitted_answer;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.__variant_id;
        submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
    } else {
        if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
        let postData;
        try {
            postData = JSON.parse(req.body.postData);
        } catch (e) {
            return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
        }
        variant_id = postData.variant ? postData.variant.id : null;
        submitted_answer = postData.submittedAnswer;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authn_user.user_id,
        submitted_answer: submitted_answer,
    };
    sqldb.callOneRow('variants_ensure_question', [submission.variant_id, res.locals.question.id], (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0];
        if (req.body.__action == 'grade') {
            question.workerSaveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else if (req.body.__action == 'save') {
            question.workerSaveSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else {
            callback(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
        }
    });
}

function processIssue(req, res, callback) {
    const description = req.body.description;
    if (!_.isString(description) || description.length == 0) {
        return callback(new Error('A description of the issue must be provided'));
    }

    const variant_id = req.body.__variant_id;
    sqldb.callOneRow('variants_ensure_question', [variant_id, res.locals.question.id], (err, _result) => {
        if (ERR(err, callback)) return;

        const course_data = _.pick(res.locals, ['variant', 'question', 'course_instance', 'course']);
        const params = [
            variant_id,
            description, // student message
            'instructor-reported issue', // instructor message
            true, // manually_reported
            true, // course_caused
            course_data,
            {}, // system_data
            res.locals.authn_user.user_id,
        ];
        sqldb.call('issues_insert_for_variant', params, (err) => {
            if (ERR(err, callback)) return;
            callback(null, variant_id);
        });
    });
}

router.post('/', function(req, res, next) {
    if (req.body.__action == 'grade' || req.body.__action == 'save') {
        processSubmission(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                         + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'test_once') {
        const count = 1;
        const showDetails = true;
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course_instance, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'test_100') {
        const count = 100;
        const showDetails = false;
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course_instance, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'report_issue') {
        processIssue(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                         + '/?variant_id=' + variant_id);
        });
    } else {
        return next(new Error('unknown __action: ' + req.body.__action));
    }
});

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
        (callback) => {
            // req.query.variant_id might be undefined, which will generate a new variant
            question.workerGetAndRenderVariant(req.query.variant_id, res.locals, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            res.locals.questionGHLink = null;
            if (res.locals.course.repository) {
                const GHfound = res.locals.course.repository.match(/^git@github.com:\/?(.+?)(\.git)?\/?$/);
                if (GHfound) {
                    if (GHfound[1] == 'PrairieLearn/PrairieLearn') {
                        // this is exampleCourse, so handle it specially
                        res.locals.questionGHLink = 'https://github.com/' + GHfound[1] + '/tree/master/exampleCourse/questions/' + res.locals.question.qid;
                    } else {
                        res.locals.questionGHLink = 'https://github.com/' + GHfound[1] + '/tree/master/questions/' + res.locals.question.qid;
                    }
                }
            }
            callback(null);
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    if (req.params.filename === res.locals.assessmentStatsCsvFilename) {
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
