var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var error = require('../lib/error');
var logger = require('../lib/logger');
var filePaths = require('../lib/file-paths');
var questionHelper = require('../lib/questionHelper.js');

module.exports = {
    renderExtraHeaders: function(question, course, locals, callback) {
        var extraHeaders = '<script type="text/javascript" src="/javascripts/require.js"></script>';
        callback(null, extraHeaders);
    },

    renderQuestion: function(variant, question, submission, course, locals, callback) {
        callback(null, "");
    },

    renderSubmission: function(variant, question, submission, course, locals, callback) {
        callback(null, "");
    },

    renderTrueAnswer: function(variant, question, course, locals, callback) {
        callback(null, "");
    },

    getData: function(question, course, variant_seed, callback) {
        var questionDir = path.join(course.path, 'questions', question.directory);
        questionHelper.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            var options = question.options || {};
            try {
                var vid = variant_seed;
                var questionData = server.getData(vid, options, questionDir);
            } catch (e) {
                return ERR(e, callback);
            }
            var data = {
                params: questionData.params,
                true_answer: questionData.trueAnswer,
                options: questionData.options,
            };
            callback(null, data);
        });
    },

    gradeSubmission: function(submission, variant, question, course, callback) {
        var that = this;
        questionHelper.loadServer(question, course, function(err, server) {
            if (ERR(err, callback)) return;
            var grading;
            try {
                var vid = variant.variant_seed;
                var params = variant.params;
                var trueAnswer = variant.true_answer;
                var submittedAnswer = submission.submitted_answer;
                var options = variant.options;
                var questionDir = path.join(course.path, 'questions', question.directory);
                grading = server.gradeAnswer(vid, params, trueAnswer, submittedAnswer, options, questionDir);
            } catch (e) {
                var data = {
                    submission: submission,
                    variant: variant,
                    question: question,
                    course: course,
                };
                return callback(error.addData(e, data));
            }
            callback(null, grading);
        });
    },
};
