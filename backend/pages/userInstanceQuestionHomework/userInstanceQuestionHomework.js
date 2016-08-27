var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var async = require('async');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../error');
var question = require('../../question');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userInstanceQuestionHomework.sql'));

function ensureVariant(req, res, callback) {
    // if we have an existing variant that is ungraded (may have an ungraded submission)
    // then use that one, otherwise make a new one
    var params = {
        instance_question_id: res.locals.instanceQuestion.id,
    };
    sqldb.query(sql.get_available_variant, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount == 1) {
            return callback(null, result.rows[0]);
        }
        question.makeVariant(res.locals.question, res.locals.course, {}, function(err, variant) {
            if (ERR(err, callback)) return;
            var params = {
                instance_question_id: res.locals.instanceQuestion.id,
                variant_seed: variant.vid,
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

function getSubmission(variantId, callback) {
    var params = {
        variant_id: variantId,
    };
    sqldb.query(sql.get_submission, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount == 1) {
            return callback(null, result.rows[0]);
        } else {
            return callback(null, null);
        }
    });    
}

function processSubmission(req, res, callback) {
    var grading;
    async.series([
        function(callback) {
            var params = {variant_id: req.postData.variant.id};
            sqldb.queryOneRow(sql.get_variant, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.variant = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            var submission = {
                submitted_answer: req.postData.submittedAnswer,
                type: req.postData.type,
            };
            question.gradeSubmission(submission, res.locals.variant, res.locals.question, res.locals.course, {}, function(err, g) {
                if (ERR(err, callback)) return;
                grading = g;
                callback(null);
            });
        },
        function(callback) {
            var params = {
                variant_id: res.locals.variant.id,
                auth_user_id: res.locals.user.id,
                submitted_answer: req.postData.submittedAnswer,
                type: req.postData.type,
                credit: res.locals.assessment.credit,
                mode: req.mode,
                graded_at: grading.graded_at,
                score: grading.score,
                correct: grading.correct,
                feedback: grading.feedback,
            };
            sqldb.queryOneRow(sql.new_submission, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.submission = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            res.locals.showSubmitButton = false;
            res.locals.showNewVariantButton = true;
            res.locals.showSubmission = true;
            res.locals.showFeedback = true;
            res.locals.showTrueAnswer = true;
            callback(null);
        },
        function(callback) {
            var params = {
                variant_id: res.locals.variant.id,
                available: false,
            };
            sqldb.queryOneRow(sql.update_variant, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.variant = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            var points = res.locals.instanceQuestion.points;
            var current_value = res.locals.instanceQuestion.current_value;
            var number_attempts = res.locals.instanceQuestion.number_attempts;
            if (res.locals.submission.correct) {
                points = Math.max(points + current_value, res.assessmentQuestion.max_points);
                current_value = Math.max(current_value + res.assessmentQuestion.init_points, res.assessmentQuestion.max_points);
            }

            var params = {
                instance_question_id: res.locals.instanceQuestion.id,
                points: points,
                current_value: current_value,
                number_attempts: number_attempts + 1,
            };
            sqldb.queryOneRow(sql.update_instance_question, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.instance_question = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            var params = {
                assessment_instance_id: res.locals.assessmentInstance.id,
                credit: res.locals.assessmentInstance.credit,
            };
            sqldb.queryOneRow(sql.update_assessment_instance, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_instance = result.rows[0];
                callback(null);
            });
        },
    ], callback);
};

function processPost(req, res, callback) {
    if (!req.postData) return callback(null);
    if (req.postData.action == 'submitQuestionAnswer') {
        return processSubmission(req, res, callback);
    } else {
        return callback(error.make(400, 'unknown action: ' + req.postData.action, {postData: req.postData}));
    }
}

function handle(req, res, next) {
    if (res.locals.assessment.type !== 'Homework' && res.locals.assessment.type !== 'Game') next(); // FIXME: hack to handle 'Game'

    var questionModule;
    res.locals.showSubmitButton = true;
    res.locals.showNewVariantButton = false;
    res.locals.showSubmission = false;
    res.locals.showFeedback = false;
    res.locals.showTrueAnswer = false;
    async.series([
        function(callback) {
            processPost(req, res, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            // might already have a variant from POST
            if (res.locals.variant) return callback(null);
            ensureVariant(req, res, function(err, variant) {
                if (ERR(err, callback)) return;
                res.locals.variant = variant;
                callback(null);
            });
        },
        function(callback) {
            // might already have a submission from POST
            if (res.locals.submission) return callback(null);
            getSubmission(res.locals.variant.id, function(err, submission) {
                if (ERR(err, callback)) return;
                res.locals.submission = submission;
                callback(null);
            });
        },
        function(callback) {
            question.getModule(res.locals.question.type, function(err, qm) {
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
            if (!res.locals.submission) return callback(null);
            question.renderScore(res.locals.submission.score, function(err, scoreHtml) {
                if (ERR(err, callback)) return;
                res.locals.scoreHtml = scoreHtml;
                callback(null);
            });
        },
        function(callback) {
            if (!res.locals.submission) return callback(null);
            questionModule.renderSubmission(res.locals.variant, res.locals.question, res.locals.submission, res.locals.course, res.locals, function(err, submissionHtml) {
                if (ERR(err, callback)) return;
                res.locals.submissionHtml = submissionHtml;
                callback(null);
            });
        },
        function(callback) {
            if (!res.locals.submission || res.locals.submission.score == null) return callback(null);
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
            res.locals.postUrl = res.locals.urlPrefix + "/instanceQuestion/" + res.locals.instanceQuestion.id + "/";
            res.locals.questionJson = JSON.stringify({
                questionFilePath: res.locals.urlPrefix + "/instanceQuestion/" + res.locals.instanceQuestion.id + "/file",
                question: res.locals.question,
                course: res.locals.course,
                courseInstance: res.locals.courseInstance,
                variant: {
                    id: res.locals.variant.id,
                    params: res.locals.variant.params,
                },
                submittedAnswer: (res.locals.showSubmission && res.locals.submission) ? res.locals.submission.submitted_answer : null,
                feedback: (res.locals.showFeedback && res.locals.submission) ? res.locals.submission.feedback : null,
                trueAnswer: res.locals.showTrueAnswer ? res.locals.variant.true_answer : null,
            });
            res.locals.prevInstanceQuestionId = null;
            res.locals.nextInstanceQuestionId = null;
            res.locals.video = null;
            callback(null);
        },
    ], function(err) {
        if (ERR(err, next)) return;
        res.render(path.join(__dirname, 'userInstanceQuestionHomework'), res.locals);
    });
}

router.get('/', handle);
router.post('/', handle);

module.exports = router;
