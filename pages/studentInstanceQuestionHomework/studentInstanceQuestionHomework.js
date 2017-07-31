var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var questionServers = require('../../question-servers');
var assessmentsHomework = require('../../assessments/homework');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function processSubmission(req, res, callback) {
    let variant_id, submitted_answer, type = null;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.variant_id;
        submitted_answer = _.omit(req.body, ['postAction', 'csrfToken', 'variant_id']);
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
        type = postData.type;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authz_data.authn_user.user_id,
        submitted_answer: submitted_answer,
        type: type,
        credit: res.locals.authz_result.credit,
        mode: res.locals.authz_data.mode,
    };
    assessmentsHomework.submitAndGrade(submission, res.locals.instance_question.id, res.locals.question, res.locals.course, function(err) {
        if (ERR(err, callback)) return;
        callback(null, submission.variant_id);
    });
}

function processGet(req, res, variant_id, callback) {
    res.locals.showSubmitButton = true;
    res.locals.showNewVariantButton = false;
    res.locals.showSubmissions = false;
    res.locals.showFeedback = false;
    res.locals.showTrueAnswer = false;
    res.locals.showGradingRequested = false;
    res.locals.allowAnswerEditing = true;
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
                questionServers.ensureVariant(res.locals.instance_question.id, res.locals.authn_user.user_id, res.locals.question, res.locals.course, {}, function(err, variant) {
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
                    res.locals.allowAnswerEditing = false;
                }
                callback(null);
            });
        },
        function(callback) {
            if (res.locals.question.single_variant) {
                res.locals.showSubmitButton = true;
                res.locals.showNewVariantButton = false;
                res.locals.showTrueAnswer = false;
                res.locals.allowAnswerEditing = true;
            }
            callback(null);
        },
        function(callback) {
            questionServers.getEffectiveQuestionType(res.locals.question.type, function(err, eqt) {
                if (ERR(err, callback)) return;
                res.locals.effectiveQuestionType = eqt;
                callback(null);
            });
        },
        function(callback) {
            res.locals.paths = {};
            res.locals.paths.clientFilesQuestion = res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/clientFilesQuestion';
            callback(null);
        },
        function(callback) {
            if (!res.locals.variant.valid) {
                res.locals.extraHeadersHtml = '';
                return callback(null);
            }
            questionServers.render('header', res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, extraHeadersHtml) {
                if (ERR(err, callback)) return;
                res.locals.extraHeadersHtml = extraHeadersHtml;
                callback(null);
            });
        },
        function(callback) {
            if (!res.locals.showSubmissions) return callback(null);
            res.locals.submissionHtmls = [];
            async.eachSeries(res.locals.submissions, function(submission, callback) {
                if (!res.locals.variant.valid) {
                    res.locals.submissionHtmls.push('');
                    return callback(null);
                }
                questionServers.render('submission', res.locals.variant, res.locals.question, submission, res.locals.course, res.locals, function(err, submissionHtml) {
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
            if (!res.locals.variant.valid) {
                res.locals.answerHtml = '';
                return callback(null);
            }
            if (!res.locals.showTrueAnswer) return callback(null);
            questionServers.render('answer', res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, answerHtml) {
                if (ERR(err, callback)) return;
                res.locals.answerHtml = answerHtml;
                callback(null);
            });
        },
        function(callback) {
            if (!res.locals.variant.valid) {
                res.locals.questionHtml = '';
                return callback(null);
            }
            questionServers.render('question', res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, questionHtml) {
                if (ERR(err, callback)) return;
                res.locals.questionHtml = questionHtml;
                callback(null);
            });
        },
        function(callback) {
            // load errors last in case there are error from rendering
            const params = {
                variant_id: res.locals.variant.id,
            };
            sqldb.query(sql.select_errors, params, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.errors = result.rows;
                callback(null);
            });
        },
        function(callback) {
            // reload variant.console in case it changed during render
            const params = {
                variant_id: res.locals.variant.id,
            };
            sqldb.queryOneRow(sql.select_variant_console, params, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.variant.console = result.rows[0].console;
                callback(null);
            });
        },
        function(callback) {
            var questionJson = JSON.stringify({
                questionFilePath: res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/file',
                questionGeneratedFilePath: res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/generatedFilesQuestion/variant/' + res.locals.variant.id,
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
            res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
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
