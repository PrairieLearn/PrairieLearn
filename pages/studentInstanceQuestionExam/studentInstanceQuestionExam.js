var ERR = require('async-stacktrace');
var async = require('async');
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var questionServers = require('../../question-servers');
var assessmentsExam = require('../../assessments/exam');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function processSubmission(req, res, callback) {
    if (!res.locals.assessment_instance.open) return callback(error.make(400, 'assessment_instance is closed'));
    if (!res.locals.instance_question.open) return callback(error.make(400, 'instance_question is closed'));
    var postData;
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
            var params = [
                res.locals.instance_question.id,
                res.locals.authn_user.user_id,
                postData.submittedAnswer,
                postData.type,
                res.locals.authz_result.credit,
                res.locals.authz_data.mode,
            ];
            sqldb.call('submissions_insert', params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], callback);
}

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.postAction == 'submitQuestionAnswer') {
        if (res.locals.authz_result.time_limit_expired) {
            return next(new Error('time limit is expired, please go back and finish your assessment'));
        }
        return processSubmission(req, res, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.postAction == 'timeLimitFinish') {
        var finishExam = true;
        assessmentsExam.gradeAssessmentInstance(res.locals.assessment_instance.id, res.locals.user.user_id, res.locals.assessment_instance.credit, finishExam, function(err) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + res.locals.assessment_instance.id + '?timeLimitExpired=true');
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
            res.locals.showSubmissions = false;
            var params = {
                variant_id: res.locals.variant.id,
                req_date: res.locals.req_date,
            };
            sqldb.query(sql.select_submissions, params, function(err, result) {
                if (ERR(err, callback)) return;
                if (result.rowCount >= 1) {
                    res.locals.showSubmissions = true;
                    res.locals.submissions = result.rows;
                    res.locals.submission = res.locals.submissions[0]; // most recent submission
                }
                callback(null);
            });
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
            res.locals.paths = {};
            res.locals.paths.clientFilesQuestion = res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/clientFilesQuestion';
            callback(null);
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
            res.locals.showFeedback = true;
            res.locals.showTrueAnswer = false;
            res.locals.allowAnswerEditing = false;
            if (res.locals.assessment_instance.open) {
                if (res.locals.instance_question.open) {
                    res.locals.showSaveButton = true;
                    res.locals.allowAnswerEditing = true;
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
            questionModule.renderQuestion(res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, questionHtml) {
                if (ERR(err, callback)) return;
                res.locals.questionHtml = questionHtml;
                callback(null);
            });
        },
        function(callback) {
            res.locals.postUrl = res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id + '/';
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
                submittedAnswer: res.locals.submission ? res.locals.submission.submitted_answer : null,
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
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
