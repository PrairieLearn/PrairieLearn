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

module.exports.getVariant = function(req, res, variant_id, assessmentType, callback) {
    res.locals.showSubmitButton = false;
    res.locals.showSaveButton = false;
    res.locals.showNewVariantButton = false;
    res.locals.showSubmissions = false;
    res.locals.showFeedback = false;
    res.locals.showTrueAnswer = false;
    res.locals.showGradingRequested = false;
    res.locals.allowAnswerEditing = false;
    res.locals.submissions = [];

    if (assessmentType == 'Homework') {
        res.locals.showSubmitButton = true;
        res.locals.allowAnswerEditing = true;
    }
    if (assessmentType == 'Exam') {
        if (res.locals.assessment_instance.open) {
            if (res.locals.instance_question.open) {
                res.locals.showSaveButton = true;
                res.locals.allowAnswerEditing = true;
            }
        } else {
            res.locals.showTrueAnswer = true;
        }
    }

    async.series([
        function(callback) {
            if (variant_id) {
                var params = {
                    variant_id: variant_id,
                    instance_question_id: res.locals.instance_question.id,
                };
                sqldb.queryOneRow(sql.select_variant_for_instance_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    res.locals.variant = result.rows[0];
                    callback(null);
                });
            } else {
                sqldb.beginTransaction(function(err, client, done) {
                    if (ERR(err, callback)) return;

                    const require_available = (assessmentType != 'Exam');
                    questionServers.ensureVariant(client, res.locals.instance_question.id, res.locals.authn_user.user_id, res.locals.question, res.locals.course, {}, require_available, function(err, variant) {
                        if (ERR(err, callback)) return;
                        res.locals.variant = variant;

                        sqldb.endTransaction(client, done, err, function(err) {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    });
                });
            }
        },
        function(callback) {
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
                    if (assessmentType == 'Homework' && !res.locals.question.single_variant) {
                        res.locals.showSubmitButton = false;
                        res.locals.showNewVariantButton = true;
                        res.locals.showTrueAnswer = true;
                        res.locals.allowAnswerEditing = false;
                    }
                }
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
            const renderSelection = {
                'header': res.locals.variant.valid,
                'question': res.locals.variant.valid,
                'submissions': res.locals.variant.valid && res.locals.showSubmissions,
                'answer': res.locals.variant.valid && res.locals.showTrueAnswer,
            };
            questionServers.render(renderSelection, res.locals.variant, res.locals.question, res.locals.submission, res.locals.submissions, res.locals.course, res.locals, function(err, htmls) {
                if (ERR(err, callback)) return;
                res.locals.extraHeadersHtml = htmls.extraHeadersHtml;
                res.locals.questionHtml = htmls.questionHtml;
                res.locals.submissionHtmls = htmls.submissionHtmls;
                res.locals.answerHtml = htmls.answerHtml;
                callback(null);
            });
        },
        function(callback) {
            // load errors last in case there are errors from rendering
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
};
