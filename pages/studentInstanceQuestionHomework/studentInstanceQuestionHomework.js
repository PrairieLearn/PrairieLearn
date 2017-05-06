var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var async = require('async');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var questionServers = require('../../question-servers');
var assessmentsHomework = require('../../assessments/homework');
var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function ensureVariant(locals, callback) {
    // if we have an existing variant that is ungraded (may have an ungraded submission)
    // then use that one, otherwise make a new one
    var params = {
        instance_question_id: locals.instance_question.id,
    };
    sqldb.query(sql.get_available_variant, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount == 1) {
            return callback(null, result.rows[0]);
        }
        questionServers.makeVariant(locals.question, locals.course, {}, function(err, variant) {
            if (ERR(err, callback)) return;
            var params = {
                authn_user_id: locals.authn_user.user_id,
                instance_question_id: locals.instance_question.id,
                variant_seed: variant.variant_seed,
                question_params: variant.params,
                true_answer: variant.true_answer,
                options: variant.options,
            };
            sqldb.queryOneRow(sql.make_variant, params, function(err, result) {
                if (ERR(err, callback)) return;
                return callback(null, result.rows[0]);
            });
        });
    });
}

function processSubmission(req, res, callback) {
    if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
    var postData;
    try {
        postData = JSON.parse(req.body.postData);
    } catch (e) {
        return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
    }
    var submission = {
        variant_id: postData.variant ? postData.variant.id : null,
        auth_user_id: res.locals.authz_data.authn_user.user_id,
        submitted_answer: postData.submittedAnswer,
        type: postData.type,
        credit: res.locals.authz_result.credit,
        mode: res.locals.authz_data.mode,
    };
    assessmentsHomework.submitAndGrade(submission, res.locals.instance_question.id, res.locals.question, res.locals.course, function(err) {
        if (ERR(err, callback)) return;
        callback(null, submission.variant_id);
    });
};

function processGet(req, res, variant_id, callback) {
    var questionModule;
    res.locals.showSubmitButton = true;
    res.locals.showNewVariantButton = false;
    res.locals.showSubmissions = false;
    res.locals.showFeedback = false;
    res.locals.showTrueAnswer = false;
    res.locals.showGradingRequested = false;
    async.series([
        function(callback) {
            if (variant_id) {
                var params = {
                    variant_id: variant_id,
                    instance_question_id: res.locals.instance_question.id,
                };
                sqldb.queryOneRow(sql.select_variant_for_question_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    res.locals.variant = result.rows[0];
                    callback(null);
                });
            } else {
                ensureVariant(res.locals, function(err, variant) {
                    if (ERR(err, callback)) return;
                    res.locals.variant = variant;
                    callback(null);
                });
            }
        },
        function(callback) {
            res.locals.showSubmissions = false;
            var params = {
                variant_id: res.locals.variant.id,
                req_date: res.locals.req_date,
            };
            sqldb.query(sql.select_submissions, params, function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount >= 1) {
                    res.locals.submissions = result.rows;
                    res.locals.submission = res.locals.submissions[0]; // most recent submission

                    res.locals.showSubmissions = true;
                    res.locals.showFeedback = true;
                    res.locals.showSubmitButton = false;
                    res.locals.showNewVariantButton = true;
                    res.locals.showTrueAnswer = true;
                }
                callback(null);
            });
        },
        function(callback) {
            if (res.locals.question.single_variant) {
                res.locals.showSubmitButton = true;
                res.locals.showNewVariantButton = false;
                res.locals.showTrueAnswer = false;
            }
            callback(null);
        },
        function(callback) {
            questionServers.getModule(res.locals.question.type, function(err, qm) {
                if (ERR(err, callback)) return;
                questionModule = qm;
                callback(null);
            });
        },
        function(callback) {
            questionServers.getEffectiveQuestionType(res.locals.question.type, function(err, eqt) {
                if (ERR(err, callback)) return;
                res.locals.effectiveQuestionType = eqt;
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
            if (!res.locals.showSubmissions) return callback(null);
            res.locals.submissionHtmls = [];
            async.eachSeries(res.locals.submissions, function(submission, callback) {
                questionModule.renderSubmission(res.locals.variant, res.locals.question, submission, res.locals.course, res.locals, function(err, submissionHtml) {
                    if (ERR(err, callback)) return;
                    res.locals.submissionHtmls.push(submissionHtml);
                    callback(null);
                });
            }, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            if (!res.locals.showTrueAnswer) return callback(null);
            questionModule.renderTrueAnswer(res.locals.variant, res.locals.question, res.locals.course, res.locals, function(err, answerHtml) {
                if (ERR(err, callback)) return;
                res.locals.answerHtml = answerHtml;
                callback(null);
            });
        },
        function(callback) {
            questionModule.renderQuestion(res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, questionHtml) {
                if (ERR(err, callback)) return;
                res.locals.questionHtml = questionHtml;
                callback(null);
            });
        },
        function(callback) {
            var questionJson = JSON.stringify({
                questionFilePath: res.locals.urlPrefix + "/instance_question/" + res.locals.instance_question.id + "/file",
                questionGeneratedFilePath: res.locals.urlPrefix + "/instance_question/" + res.locals.instance_question.id + "/generatedFilesQuestion/variant/" + res.locals.variant.id,
                question: res.locals.question,
                effectiveQuestionType: res.locals.effectiveQuestionType,
                course: res.locals.course,
                courseInstance: res.locals.course_instance,
                variant: {
                    id: res.locals.variant.id,
                    params: res.locals.variant.params,
                },
                submittedAnswer: (res.locals.showSubmissions && res.locals.submission) ? res.locals.submission.submitted_answer : null,
                feedback: (res.locals.showFeedback && res.locals.submission) ? res.locals.submission.feedback : null,
                trueAnswer: res.locals.showTrueAnswer ? res.locals.variant.true_answer : null,
                submissions : res.locals.showSubmissions ? res.locals.submissions : null,
            });
            var encodedJson = encodeURIComponent(questionJson);
            res.locals.questionJsonBase64 = (new Buffer(encodedJson)).toString('base64');
            res.locals.video = null;
            callback(null);
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.postAction == 'submitQuestionAnswer') {
        processSubmission(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + "/instance_question/" + res.locals.instance_question.id
                         + '/?variant_id=' + variant_id);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    processGet(req, res, req.query.variant_id, function(err) {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
