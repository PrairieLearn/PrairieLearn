var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var async = require('async');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();
var fs = require('fs');

var error = require('../../lib/error');
var questionServers = require('../../question-servers');
var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function processSubmission(req, res, callback) {
    if (!res.locals.assessment_instance.open) return callback(error.make(400, 'assessment_instance is closed'));
    if (!res.locals.instance_question.open) return callback(error.make(400, 'instance_question is closed'));
    var postData, grading;
    async.series([
        function(callback) {
            if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
            try {
                postData = JSON.parse(req.body.postData);
            } catch (e) {
                return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
            }
            callback(null);
        },
        function(callback) {
            var params = {instance_question_id: res.locals.instance_question.id};
            sqldb.queryOneRow(sql.get_variant, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.variant = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            var params = {
                variant_id: res.locals.variant.id,
                auth_user_id: res.locals.user.id,
                submitted_answer: postData.submittedAnswer,
                type: postData.type,
                credit: res.locals.assessment.credit,
                mode: res.locals.authz_data.mode,
            };
            sqldb.queryOneRow(sql.new_submission, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.submission = result.rows[0];
                callback(null);
            });
        },
    ], callback);
};

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.postAction == 'submitQuestionAnswer') {
        return processSubmission(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    var questionModule;
    async.series([
        function(callback) {
            var params = {instance_question_id: res.locals.instance_question.id};
            sqldb.queryOneRow(sql.get_variant, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.variant = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            var params = {variant_id: res.locals.variant.id};
            sqldb.query(sql.get_submission, params, function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount == 1) {
                    res.locals.submission = result.rows[0];
                }
                callback(null);
            });
        },
        // We can probably combine the previous function with the following one, and eliminate sql.get_submission
        function(callback) {
            res.locals.showAllSubmissions = false;
            submissionFilePath = path.join(res.locals.course.path, "questions", res.locals.question.directory, "submission.html");
            hasSubmissionTemplate = fs.existsSync(submissionFilePath);
            if (hasSubmissionTemplate) {
                var params = {variant_id: res.locals.variant.id};
                sqldb.query(sql.get_all_submissions, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount >= 1) {
                        res.locals.showAllSubmissions = true;
                        res.locals.allSubmissions = [];
                        for (sNum = 0; sNum < result.rowCount; sNum++) {
                            res.locals.allSubmissions[sNum] = result.rows[sNum];
                        }
                    }
                    callback(null);
                });
            } 
            else callback(null);
        },
        function(callback) {
            questionServers.getModule(res.locals.question.type, function(err, qm) {
                if (ERR(err, callback)) return;
                questionModule = qm;
                callback(null);
            });
        },
        function(callback) {
            questionModule.renderExtraHeaders(res.locals.question, res.locals.course, res.locals, function(err, extraHeaders) {
                if (ERR(err, callback)) return;
                res.locals.extraHeaders = extraHeaders;
                callback(null);
            });
        },
        function(callback) {
            // default to show none of the optional components
            res.locals.showSaveButton = false;
            res.locals.showFeedback = false;
            res.locals.showTrueAnswer = false;
            if (res.locals.assessment_instance.open) {
                if (res.locals.instance_question.open) {
                    res.locals.showSaveButton = true;
                }
                callback(null);
            } else {
                // assessment_instance is closed, show true answer
                res.locals.showFeedback = true;
                res.locals.showTrueAnswer = true;
                questionModule.renderTrueAnswer(res.locals.variant, res.locals.question, res.locals.course, res.locals, function(err, answerHtml) {
                    if (ERR(err, callback)) return;
                    res.locals.answerHtml = answerHtml;
                    callback(null);
                });
            }
        },
        function(callback) {
            questionModule.renderQuestion(res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, questionHtml) {
                if (ERR(err, callback)) return;
                res.locals.questionHtml = questionHtml;
                callback(null);
            });
        },
        function(callback) {
            res.locals.postUrl = res.locals.urlPrefix + "/instance_question/" + res.locals.instance_question.id + "/";
            res.locals.questionJson = JSON.stringify({
                questionFilePath: res.locals.urlPrefix + "/instance_question/" + res.locals.instance_question.id + "/file",
                question: res.locals.question,
                course: res.locals.course,
                courseInstance: res.locals.course_instance,
                variant: {
                    id: res.locals.variant.id,
                    params: res.locals.variant.params,
                },
                submittedAnswer: res.locals.submission ? res.locals.submission.submitted_answer : null,
                feedback: (res.locals.showFeedback && res.locals.submission) ? res.locals.submission.feedback : null,
                trueAnswer: res.locals.showTrueAnswer ? res.locals.variant.true_answer : null,
            });
            res.locals.video = null;
            callback(null);
        },
    ], function(err) {
        if (ERR(err, next)) return;
        res.render(path.join(__dirname, 'userInstanceQuestionExam'), res.locals);
    });
});

module.exports = router;
