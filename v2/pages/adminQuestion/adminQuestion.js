var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../error');
var logger = require('../../logger');
var filePaths = require('../../file-paths');
var questionServer = require('../../question-server');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminQuestion.sql'));

var handle = function(req, res, next) {
    var params = {
        course_instance_id: req.params.course_instance_id,
        question_id: req.params.question_id,
        auth_data: res.locals.auth_data,
    };
    sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

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
    });
};

var render = function(req, res, next, variant, submission, scoreHtml, submissionHtml, answerHtml) {
    var params = [res.locals.question.id, res.locals.course_instance.id];
    sqldb.queryOneRow(sql.select_question, params, function(err, result) {
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
                    res.locals.postUrl = res.locals.urlPrefix + "/question/" + res.locals.course_instance.id + "/" + res.locals.question.id + "/";
                    res.locals.questionJson = JSON.stringify({
                        questionFilePath: res.locals.urlPrefix + "/question/" + res.locals.course_instance.id + "/" + res.locals.question.id + "/file",
                        question: res.locals.question,
                        course: res.locals.course,
                        courseInstance: res.locals.course_instance,
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

router.get('/:course_instance_id/:question_id', handle);
router.post('/:course_instance_id/:question_id', handle);

router.get('/:course_instance_id/:question_id/file/:filename', function(req, res, next) {
    var params = {
        course_instance_id: req.params.course_instance_id,
        question_id: req.params.question_id,
        auth_data: res.locals.auth_data,
    };
    sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        var question = res.locals.question;
        var course = res.locals.course;
        var filename = req.params.filename;
        filePaths.questionPath(question.directory, course.path, function(err, questionPath) {
            if (ERR(err, next)) return;
            res.sendFile(filename, {root: questionPath});
        });
    });
});

router.get('/:course_instance_id/:question_id/text/:filename', function(req, res, next) {
    var params = {
        course_instance_id: req.params.course_instance_id,
        question_id: req.params.question_id,
        auth_data: res.locals.auth_data,
    };
    sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        var question = res.locals.question;
        var course = res.locals.course;
        var filename = req.params.filename;
        filePaths.questionPath(question.directory, course.path, function(err, questionPath) {
            if (ERR(err, next)) return;
            var rootPath = path.join(questionPath, "text");
            res.sendFile(filename, {root: rootPath});
        });
    });
});

module.exports = router;
