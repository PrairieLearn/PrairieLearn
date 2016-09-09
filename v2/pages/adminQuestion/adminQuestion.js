var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../error');
var logger = require('../../logger');
var questionServer = require('../../question-server');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminQuestion.sql'));

var handle = function(req, res, next) {
    if (req.postData) {
        if (req.postData.action == 'submitQuestionAnswer') {
            var variant = req.postData.variant;
            submission = {
                submitted_answer: req.postData.submittedAnswer,
            };
            questionServer.gradeSubmission(submission, variant, res.locals.question, res.locals.course, {}, function(err, grading) {
                if (ERR(err, next)) return;
                _.assign(submission, grading);
                questionServer.getModule(res.locals.question.type, function(err, questionModule) {
                    if (ERR(err, next)) return;
                    questionServer.renderScore(submission.score, function(err, scoreHtml) {
                        if (ERR(err, next)) return;
                        questionModule.renderSubmission(variant, res.locals.question, submission, res.locals.course, res.locals, function(err, submissionHtml) {
                            if (ERR(err, next)) return;
                            questionModule.renderTrueAnswer(variant, res.locals.question, res.locals.course, res.locals, function(err, answerHtml) {
                                if (ERR(err, next)) return;
                                render(req, res, next, variant, submission, scoreHtml, submissionHtml, answerHtml);
                            });
                        });
                    });
                });
            });
        } else return next(error.make(400, 'unknown action', {postData: req.postData}));
    } else {
        questionServer.makeVariant(res.locals.question, res.locals.course, {}, function(err, variant) {
            if (ERR(err, next)) return;
            render(req, res, next, variant);
        });
    }
};

var render = function(req, res, next, variant, submission, scoreHtml, submissionHtml, answerHtml) {
    var params = [res.locals.questionId, res.locals.courseInstanceId];
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        questionServer.getModule(res.locals.question.type, function(err, questionModule) {
            if (ERR(err, next)) return;
            questionModule.renderExtraHeaders(res.locals.question, res.locals.course, res.locals, function(err, extraHeaders) {
                if (ERR(err, next)) return;
                questionModule.renderQuestion(variant, res.locals.question, null, res.locals.course, res.locals, function(err, questionHtml) {
                    if (ERR(err, next)) return;
                    
                    res.locals.result = result.rows[0];
                    res.locals.submission = submission;
                    res.locals.extraHeaders = extraHeaders;
                    res.locals.questionHtml = questionHtml;
                    res.locals.scoreHtml = scoreHtml;
                    res.locals.submissionHtml = submissionHtml;
                    res.locals.answerHtml = answerHtml;
                    res.locals.postUrl = res.locals.urlPrefix + "/question/" + res.locals.question.id + "/";
                    res.locals.questionJson = JSON.stringify({
                        questionFilePath: res.locals.urlPrefix + "/question/" + res.locals.question.id + "/file",
                        question: res.locals.question,
                        course: res.locals.course,
                        courseInstance: res.locals.courseInstance,
                        variant: variant,
                        submittedAnswer: submission ? submission.submitted_answer : null,
                        feedback: submission ? submission.feedback : null,
                        trueAnswer: variant.true_answer,
                    });
                    res.render(path.join(__dirname, 'adminQuestion'), res.locals);
                });
            });
        });
    });
};

router.get('/', handle);
router.post('/', handle);

module.exports = router;
