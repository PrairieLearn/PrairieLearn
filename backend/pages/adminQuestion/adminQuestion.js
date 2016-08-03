var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../error');
var logger = require('../../logger');
var question = require('../../question');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminQuestion.sql'));

var handle = function(req, res, next) {
    if (req.postData) {
        if (req.postData.action == 'submitQuestionAnswer') {
            var questionInstance = req.postData.questionInstance;
            submission = {
                submitted_answer: req.postData.submittedAnswer,
            };
            question.gradeSubmission(submission, questionInstance, res.locals.question, res.locals.course, {}, function(err, grading) {
                if (ERR(err, next)) return;
                question.getModule(res.locals.question.type, function(err, questionModule) {
                    if (ERR(err, next)) return;
                    question.renderScore(grading.score, function(err, scoreHtml) {
                        if (ERR(err, next)) return;
                        questionModule.renderSubmission(questionInstance, res.locals.question, submission, grading, res.locals.course, res.locals, function(err, submissionHtml) {
                            if (ERR(err, next)) return;
                            questionModule.renderTrueAnswer(questionInstance, res.locals.question, res.locals.course, res.locals, function(err, answerHtml) {
                                if (ERR(err, next)) return;
                                render(req, res, next, questionInstance, submission, grading, scoreHtml, submissionHtml, answerHtml);
                            });
                        });
                    });
                });
            });
        } else return next(error.make(400, 'unknown action', {postData: req.postData}));
    } else {
        question.makeQuestionInstance(res.locals.question, res.locals.course, {}, function(err, questionInstance) {
            if (ERR(err, next)) return;
            render(req, res, next, questionInstance);
        });
    }
};

var render = function(req, res, next, questionInstance, submission, grading, scoreHtml, submissionHtml, answerHtml) {
    var params = [res.locals.questionId, res.locals.courseInstanceId];
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        question.getModule(res.locals.question.type, function(err, questionModule) {
            if (ERR(err, next)) return;
            questionModule.renderExtraHeaders(res.locals.question, res.locals.course, res.locals, function(err, extraHeaders) {
                if (ERR(err, next)) return;
                questionModule.renderQuestion(questionInstance, res.locals.question, null, res.locals.course, res.locals, function(err, questionHtml) {
                    if (ERR(err, next)) return;
                    
                    res.locals.result = result.rows[0];
                    res.locals.submission = submission;
                    res.locals.grading = grading;
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
                        questionInstance: questionInstance,
                        submittedAnswer: submission ? submission.submitted_answer : null,
                        trueAnswer: questionInstance.true_answer,
                        feedback: grading ? grading.feedback : null,
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
