var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var async = require('async');
var error = require('../../lib/error');
var question = require('../../lib/question');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

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
            question.saveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else if (req.body.__action == 'save') {
            question.saveSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
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
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'test_100') {
        const count = 100;
        const showDetails = false;
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
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
            question.getAndRenderVariant(req.query.variant_id, res.locals, function(err) {
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

module.exports = router;
