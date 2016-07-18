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
                if (err) return next(err);
                question.getModule(req.locals.question.type, function(err, questionModule) {
                    if (err) return next(err);
                    question.renderScore(grading.score, function(err, scoreHtml) {
                        if (err) return next(err);
                        questionModule.renderSubmission(questionInstance, req.locals.question, submission, grading, req.locals.course, req.locals, function(err, submissionHtml) {
                            if (err) return next(err);
                            questionModule.renderTrueAnswer(questionInstance, req.locals.question, req.locals.course, req.locals, function(err, answerHtml) {
                                if (err) return next(err);
                                render(req, res, next, questionInstance, submission, grading, scoreHtml, submissionHtml, answerHtml);
                            });
                        });
                    });
                });
            });
        } else return next(error.make(400, 'unknown action', {postData: req.postData}));
    } else {
        question.makeQuestionInstance(req.locals.question, req.locals.course, {}, function(err, questionInstance) {
            if (err) return next(err);
            render(req, res, next, questionInstance);
        });
    }
};

var render = function(req, res, next, questionInstance, submission, grading, scoreHtml, submissionHtml, answerHtml) {
    var params = [req.locals.questionId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) return next(err);
        if (result.rowCount !== 1) return next(error.make(500, 'incorrect rowCount', result));
        question.getModule(req.locals.question.type, function(err, questionModule) {
            if (err) return next(err);
            questionModule.renderQuestion(questionInstance, req.locals.question, null, req.locals.course, req.locals, function(err, questionHtml) {
                if (err) return next(err);
                
                var locals = _.extend({
                    result: result.rows[0],
                    submission: submission,
                    grading: grading,
                    questionHtml: questionHtml,
                    scoreHtml: scoreHtml,
                    submissionHtml: submissionHtml,
                    answerHtml: answerHtml,
                    postUrl: req.locals.urlPrefix + "/question/" + req.locals.question.id,
                    questionJson: JSON.stringify({
                        question: req.locals.question,
                        course: req.locals.course,
                        courseInstance: req.locals.courseInstance,
                        questionInstance: questionInstance,
                    }),
                }, req.locals);
                res.render(path.join(__dirname, 'adminQuestion'), locals);
            });
        });
    });
};

router.get('/', handle);
router.post('/', handle);

module.exports = router;
