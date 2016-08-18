var ERR = require('async-stacktrace');
var _ = require('lodash');
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
        instance_question_id: res.locals.instanceQuestion.id,
    };
    sqldb.query(sql.get_variant, params, function(err, result) {
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

function handle(req, res, next) {
    if (res.locals.test.type !== 'Homework' && res.locals.test.type !== 'Game') next(); // FIXME: hack to handle 'Game'
    
    var questionModule;
    async.series([
        function(callback) {
            ensureVariant(req, res, function(err, variant) {
                if (ERR(err, callback)) return;
                res.locals.variant = variant;
                callback(null);
            });
        },
        function(callback) {
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
                variant: res.locals.variant,
                //questionInstance: questionInstance,
                //submittedAnswer: submission ? submission.submitted_answer : null,
                //trueAnswer: questionInstance.true_answer,
                //feedback: grading ? grading.feedback : null,
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
});

router.get('/', handle);
router.post('/', handle);

module.exports = router;
