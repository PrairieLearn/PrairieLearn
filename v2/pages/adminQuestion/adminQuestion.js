var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var filePaths = require('../../lib/file-paths');
var questionServers = require('../../question-servers');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var handle = function(req, res, next) {
    if (req.body.postAction) {
        if (req.body.postAction == 'submitQuestionAnswer') {
            if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
            var postData;
            try {
                postData = JSON.parse(req.body.postData);
            } catch (e) {
                return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
            }

            var variant = postData.variant;
            submission = {
                submitted_answer: postData.submittedAnswer,
            };
            questionServers.gradeSubmission(submission, variant, res.locals.question, res.locals.course, {}, function(err, grading) {
                if (ERR(err, next)) return;
                _.assign(submission, grading);
                // hack to make partials/submissionStatus.js do the right thing
                submission.graded_at = 'Graded';
                // localscripts/question.js expects there to be an array of submission objects
                res.locals.submissions = [submission];
                questionServers.getModule(res.locals.question.type, function(err, questionModule) {
                    if (ERR(err, next)) return;
                    questionModule.renderSubmission(variant, res.locals.question, submission, res.locals.course, res.locals, function(err, submissionHtml) {
                        if (ERR(err, next)) return;
                        questionModule.renderTrueAnswer(variant, res.locals.question, res.locals.course, res.locals, function(err, answerHtml) {
                            if (ERR(err, next)) return;
                            render(req, res, next, variant, submission, submissionHtml, answerHtml);
                        });
                    });
                });
            });
        } else return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    } else {
        questionServers.makeVariant(res.locals.question, res.locals.course, {}, function(err, variant) {
            if (ERR(err, next)) return;
            render(req, res, next, variant);
        });
    }
};

var render = function(req, res, next, variant, submission, submissionHtml, answerHtml) {
    var params = [res.locals.question.id, res.locals.course_instance.id];
    sqldb.queryOneRow(sql.select_question, params, function(err, result) {
        if (ERR(err, next)) return;
        questionServers.getModule(res.locals.question.type, function(err, questionModule) {
            if (ERR(err, next)) return;
            questionModule.renderExtraHeaders(res.locals.question, res.locals.course, res.locals, function(err, extraHeaders) {
                if (ERR(err, next)) return;
                questionModule.renderQuestion(variant, res.locals.question, null, res.locals.course, res.locals, function(err, questionHtml) {
                    if (ERR(err, next)) return;

                    res.locals.result = result.rows[0];
                    res.locals.submission = submission;
                    res.locals.extraHeaders = extraHeaders;
                    res.locals.questionHtml = questionHtml;
                    res.locals.submissionHtml = submissionHtml;
                    res.locals.answerHtml = answerHtml;
                    res.locals.postUrl = res.locals.urlPrefix + "/admin/question/" + res.locals.question.id + "/";
                    res.locals.questionJson = JSON.stringify({
                        questionFilePath: res.locals.urlPrefix + "/admin/question/" + res.locals.question.id + "/file",
                        question: res.locals.question,
                        course: res.locals.course,
                        courseInstance: res.locals.course_instance,
                        variant: variant,
                        submittedAnswer: submission ? submission.submitted_answer : null,
                        feedback: submission ? submission.feedback : null,
                        trueAnswer: variant.true_answer,
                        submissions: submission ? res.locals.submissions : null,
                    });
                    res.render(path.join(__dirname, 'adminQuestion'), res.locals);
                });
            });
        });
    });
};

router.get('/', handle);
router.post('/', handle);

router.get('/file/:filename', function(req, res, next) {
    var question = res.locals.question;
    var course = res.locals.course;
    var filename = req.params.filename;
    filePaths.questionPath(question.directory, course.path, function(err, questionPath) {
        if (ERR(err, next)) return;
        res.sendFile(filename, {root: questionPath});
    });
});

router.get('/text/:filename', function(req, res, next) {
    var question = res.locals.question;
    var course = res.locals.course;
    var filename = req.params.filename;
    filePaths.questionPath(question.directory, course.path, function(err, questionPath) {
        if (ERR(err, next)) return;
        var rootPath = path.join(questionPath, "text");
        res.sendFile(filename, {root: rootPath});
    });
});

module.exports = router;
