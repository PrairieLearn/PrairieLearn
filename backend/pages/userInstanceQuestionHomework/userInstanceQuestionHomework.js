var ERR = require('async-stacktrace');
var _ = require('underscore');
var path = require('path');
var async = require('async');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var question = require('../../question');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userInstanceQuestionHomework.sql'));

function ensureVariant(req, res, callback) {
    // if we have an existing variant that is ungraded (may have an ungraded submission)
    // then use that one, otherwise make a new one
    var params = {
        instance_question_id: req.locals.instanceQuestion.id,
    };
    sqldb.query(sql.get_variant, params, function(err, result) {
        if (ERR(err, callback)) return;
        if (result.rowCount == 1) {
            return callback(null, result.rows[0]);
        }
        question.makeVariant(req.locals.question, req.locals.course, {}, function(err, variant) {
            if (ERR(err, callback)) return;
            var params = {
                instance_question_id: req.locals.instanceQuestion.id,
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
};

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
};

router.get('/', function(req, res, next) {
    if (req.locals.test.type !== 'Homework' && req.locals.test.type !== 'Game') next(); // FIXME: hack to handle 'Game'
    var questionModule;
    async.series([
        function(callback) {
            ensureVariant(req, res, function(err, variant) {
                if (ERR(err, callback)) return;
                req.locals.variant = variant;
                callback(null);
            });
        },
        function(callback) {
            getSubmission(req.locals.variant.id, function(err, submission) {
                if (ERR(err, callback)) return;
                req.locals.submission = submission;
                callback(null);
            });
        },
        function(callback) {
            question.getModule(req.locals.question.type, function(err, qm) {
                if (ERR(err, callback)) return;
                questionModule = qm;
                callback(null);
            });
        },
        function(callback) {
            questionModule.renderExtraHeaders(req.locals.question, req.locals.course, req.locals, function(err, extraHeaders) {
                if (ERR(err, callback)) return;
                req.locals.extraHeaders = extraHeaders;
                callback(null);
            });
        },
        function(callback) {
            questionModule.renderQuestion(req.locals.variant, req.locals.question, req.locals.submission, req.locals.course, req.locals, function(err, questionHtml) {
                if (ERR(err, callback)) return;
                req.locals.questionHtml = questionHtml;
                callback(null);
            });
        },
        function(callback) {
            req.locals.postUrl = req.locals.urlPrefix + "/instanceQuestion/" + req.locals.instanceQuestion.id + "/";
            req.locals.questionJson = JSON.stringify({
                questionFilePath: req.locals.urlPrefix + "/instanceQuestion/" + req.locals.instanceQuestion.id + "/file",
                question: req.locals.question,
                course: req.locals.course,
                courseInstance: req.locals.courseInstance,
                variant: req.locals.variant,
                //questionInstance: questionInstance,
                //submittedAnswer: submission ? submission.submitted_answer : null,
                //trueAnswer: questionInstance.true_answer,
                //feedback: grading ? grading.feedback : null,
            });
            req.locals.prevInstanceQuestionId = null;
            req.locals.nextInstanceQuestionId = null;
            req.locals.video = null;
            callback(null);
        },
    ], function(err) {
        if (ERR(err, next)) return;
        res.render(path.join(__dirname, 'userInstanceQuestionHomework'), req.locals);
    });
});

module.exports = router;
