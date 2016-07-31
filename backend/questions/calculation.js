var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var error = require('../error');
var logger = require('../logger');
var filePaths = require('../file-paths');
var questionHelper = require('../questionHelper.js');

module.exports = {
    renderExtraHeaders: function(question, course, locals, callback) {
        var extraHeaders = '<script type="text/javascript" src="/javascripts/require.js"></script>';
        callback(null, extraHeaders);
    },

    renderQuestion: function(questionInstance, question, submission, course, locals, callback) {
        callback(null, "");
    },

    renderSubmission: function(questionInstance, question, submission, grading, course, locals, callback) {
        callback(null, "");
    },

    renderTrueAnswer: function(questionInstance, question, course, locals, callback) {
        callback(null, "");
    },

    getData: function(question, course, vid, callback) {
        questionHelper.loadServer(question, course, function(err, server) {
            if (err) return callback(err);
            try {
                var questionData = server.getData(vid, question.options, 'INVALID QUESTION DIRECTORY');
            } catch (e) {
                return callback(new Error('Error in question getData(): ' + String(e)));
            }
            var data = {
                params: questionData.params,
                true_answer: questionData.trueAnswer,
                options: questionData.options,
            };
            callback(null, data);
        });
    },

    defaultGradeAnswer: function(vid, params, trueAnswer, submittedAnswer, options) {
        options = _.defaults(options, {
            type: "equal",
            relTol: 1e-2,
            absTol: 1e-8,
        });
        var trueAns = trueAnswer;
        var subAns = submittedAnswer;
        if (this.transformTrueAnswer)
            trueAns = this.transformTrueAnswer(vid, params, trueAns, subAns, options);
        if (this.transformSubmittedAnswer)
            subAns = this.transformSubmittedAnswer(vid, params, trueAns, subAns, options);
        var score;
        if (options.type === "equal") {
            score = 0;
            if (PrairieGeom.checkEqual(trueAns, subAns, options.relTol, options.absTol))
                score = 1;
        } else if (options.type === "error") {
            var error;
            if (this.submittedAnswerError) {
                error = this.submittedAnswerError(vid, params, trueAns, subAns, options);
            } else {
                error = PrairieGeom.absError(trueAns, subAns);
            }
            var score = PrairieGeom.errorToScore(error, options.absTol);
        } else {
            throw Exception("Unknown gradeAnswer type: " + options.type);
        }
        return {score: score};
    },

    gradeSubmission: function(submission, questionInstance, question, course, callback) {
        var that = this;
        questionHelper.loadServer(question, course, function(err, server) {
            if (err) return callback(err);
            var grading;
            try {
                var vid = questionInstance.vid;
                var params = questionInstance.params;
                var trueAnswer = questionInstance.true_answer;
                var submittedAnswer = submission.submitted_answer;
                var options = questionInstance.options;
                if (server.gradeAnswer) {
                    grading = server.gradeAnswer(vid, params, trueAnswer, submittedAnswer, options);
                } else {
                    grading = that.defaultGradeAnswer(vid, params, trueAnswer, submittedAnswer, options);
                }
            } catch (e) {
                console.log("e.stack", e.stack);
                var data = {
                    submission: submission,
                    questionInstance: questionInstance,
                    question: question,
                    course: course,
                };
                return callback(error.addData(e, data));
            }
            callback(null, grading);
        });
    },
};
