var ERR = require('async-stacktrace');
var async = require('async');
var _ = require('lodash');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var questionServers = require('../../question-servers');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var handle = function(req, res, next) {
    if (req.body.postAction) {
        if (req.body.postAction == 'submitQuestionAnswer') {
            if (!req.body.postData) return next(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
            var postData;
            try {
                postData = JSON.parse(req.body.postData);
            } catch (e) {
                return next(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
            }

            var variant = postData.variant;
            var submission = {
                submitted_answer: postData.submittedAnswer,
            };
            questionServers.gradeSubmission(submission, variant, res.locals.question, res.locals.course, {}, function(err, grading) {
                if (ERR(err, next)) return;
                _.assign(submission, grading);
                // hack to make partials/submissionStatus.js do the right thing
                submission.graded_at = 'Graded';
                // localscripts/question.js expects there to be an array of submission objects
                res.locals.submissions = [submission];
                res.locals.paths = {};
                res.locals.paths.clientFilesQuestion = res.locals.urlPrefix + '/question/' + res.locals.question.id + '/clientFilesQuestion';
                questionServers.getModule(res.locals.question.type, function(err, questionModule) {
                    if (ERR(err, next)) return;
                    questionModule.renderSubmission(variant, res.locals.question, submission, res.locals.course, res.locals, function(err, submissionHtml) {
                        if (ERR(err, next)) return;
                        questionModule.renderTrueAnswer(variant, res.locals.question, res.locals.course, res.locals, function(err, answerHtml) {
                            if (ERR(err, next)) return;
                            render(req, res, next, variant, submission, submissionHtml, answerHtml);
                        });
                    });
                });
            });
        } else return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    } else {
        questionServers.makeVariant(res.locals.question, res.locals.course, {}, function(err, variant) {
            if (ERR(err, next)) return;
            render(req, res, next, variant);
        });
    }
};

var render = function(req, res, next, variant, submission, submissionHtml, answerHtml) {
    var params = [res.locals.question.id, res.locals.course_instance.id];
    var questionModule;

    res.locals.allowAnswerEditing = true;

    async.series([
        (callback) => {
            sqldb.queryOneRow(sql.select_question, params, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.result = result.rows[0];
                callback(null);
            });
        },
        (callback) => {
            questionServers.getEffectiveQuestionType(res.locals.question.type, (err, effectiveQuestionType) => {
                if (ERR(err, callback)) return;
                res.locals.effectiveQuestionType = effectiveQuestionType,
                callback(null);
            });
        },
        (callback) => {
            questionServers.getModule(res.locals.question.type, (err, qm) => {
                if (ERR(err, callback)) return;
                questionModule = qm;
                callback(null);
            });
        },
        (callback) => {
            res.locals.paths = {};
            res.locals.paths.clientFilesQuestion = res.locals.urlPrefix + '/question/' + res.locals.question.id + '/clientFilesQuestion';
            callback(null);
        },
        (callback) => {
            questionModule.renderExtraHeaders(res.locals.question, res.locals.course, res.locals, (err, extraHeaders) => {
                if (ERR(err, callback)) return;
                res.locals.extraHeaders = extraHeaders;
                callback(null);
            });
        },
        (callback) => {
            questionModule.renderQuestion(variant, res.locals.question, null, res.locals.course, res.locals, (err, questionHtml) => {
                if (ERR(err, callback)) return;
                res.locals.questionHtml = questionHtml;
                callback(null);
            });
        },
        (callback) => {
            res.locals.submission = submission;
            res.locals.submissionHtml = submissionHtml;
            res.locals.answerHtml = answerHtml;
            callback(null);
        },
        (callback) => {
            res.locals.postUrl = res.locals.urlPrefix + '/question/' + res.locals.question.id + '/';
            callback(null);
        },
        (callback) => {
            var questionJson = JSON.stringify({
                questionFilePath: res.locals.urlPrefix + '/question/' + res.locals.question.id + '/file',
                questionGeneratedFilePath: res.locals.urlPrefix + '/question/' + res.locals.question.id + '/generatedFilesQuestion/variant_seed/' + variant.variant_seed,
                question: res.locals.question,
                effectiveQuestionType: res.locals.effectiveQuestionType,
                course: res.locals.course,
                courseInstance: res.locals.course_instance,
                variant: variant,
                submittedAnswer: submission ? submission.submitted_answer : null,
                feedback: submission ? submission.feedback : null,
                trueAnswer: submission ? variant.true_answer : null,
                submissions: submission ? res.locals.submissions : null,
            });
            var encodedJson = encodeURIComponent(questionJson);
            res.locals.questionJsonBase64 = (new Buffer(encodedJson)).toString('base64');
                callback(null);
        },
    ], function(err) {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
};

router.get('/', handle);
router.post('/', handle);

module.exports = router;
