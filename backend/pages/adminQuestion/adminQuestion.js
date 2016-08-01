var ERR = require('async-stacktrace');
var _ = require('underscore');
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
            question.gradeSubmission(submission, questionInstance, req.locals.question, req.locals.course, {}, function(err, grading) {
                if (ERR(err, next)) return;
                question.getModule(req.locals.question.type, function(err, questionModule) {
                    if (ERR(err, next)) return;
                    question.renderScore(grading.score, function(err, scoreHtml) {
                        if (ERR(err, next)) return;
                        questionModule.renderSubmission(questionInstance, req.locals.question, submission, grading, req.locals.course, req.locals, function(err, submissionHtml) {
                            if (ERR(err, next)) return;
                            questionModule.renderTrueAnswer(questionInstance, req.locals.question, req.locals.course, req.locals, function(err, answerHtml) {
                                if (ERR(err, next)) return;
                                render(req, res, next, questionInstance, submission, grading, scoreHtml, submissionHtml, answerHtml);
                            });
                        });
                    });
                });
            });
        } else return next(error.make(400, 'unknown action', {postData: req.postData}));
    } else {
        question.makeQuestionInstance(req.locals.question, req.locals.course, {}, function(err, questionInstance) {
            if (ERR(err, next)) return;
            render(req, res, next, questionInstance);
        });
    }
};

var render = function(req, res, next, questionInstance, submission, grading, scoreHtml, submissionHtml, answerHtml) {
    var params = [req.locals.questionId, req.locals.courseInstanceId];
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        question.getModule(req.locals.question.type, function(err, questionModule) {
            if (ERR(err, next)) return;
            questionModule.renderExtraHeaders(req.locals.question, req.locals.course, req.locals, function(err, extraHeaders) {
                if (ERR(err, next)) return;
                questionModule.renderQuestion(questionInstance, req.locals.question, null, req.locals.course, req.locals, function(err, questionHtml) {
                    if (ERR(err, next)) return;
                    
                    var locals = _.extend({
                        result: result.rows[0],
                        submission: submission,
                        grading: grading,
                        extraHeaders: extraHeaders,
                        questionHtml: questionHtml,
                        scoreHtml: scoreHtml,
                        submissionHtml: submissionHtml,
                        answerHtml: answerHtml,
                        postUrl: req.locals.urlPrefix + "/question/" + req.locals.question.id + "/",
                        questionJson: JSON.stringify({
                            questionFilePath: req.locals.urlPrefix + "/question/" + req.locals.question.id + "/file",
                            question: req.locals.question,
                            course: req.locals.course,
                            courseInstance: req.locals.courseInstance,
                            questionInstance: questionInstance,
                            submittedAnswer: submission ? submission.submitted_answer : null,
                            trueAnswer: questionInstance.true_answer,
                            feedback: grading ? grading.feedback : null,
                        }),
                    }, req.locals);
                    res.render(path.join(__dirname, 'adminQuestion'), locals);
                });
            });
        });
    });
};

router.get('/', handle);
router.post('/', handle);

module.exports = router;
