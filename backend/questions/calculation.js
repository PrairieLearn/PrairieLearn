var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');

var error = require('../error');
var logger = require('../logger');
var filePaths = require('../file-paths');
var questionHelper = require('../questionHelper.js');

module.exports = {
    renderQuestion: function(questionInstance, question, submission, course, locals, callback) {
        filePaths.questionFilePathNEW("question.html", question.directory, course.path, function(err, questionTemplatePath) {
            if (err) return callback(err);
            fs.readFile(questionTemplatePath, 'utf8', function(err, questionTemplate) {
                if (err) return callback(err);
                questionTemplate = questionTemplate.replace(/<% *print\(([^}]+?)\) *%>/g, '<%= $1 %>');
                questionTemplate = questionTemplate.replace(/{{([^}]+)}}/g, '<%= $1 %>');
                var context = {
                    params: questionInstance.params,
                    questionFile: function(filename) {return questionHelper.questionFileUrl(filename, locals);},
                    feedback: {},
                };
                try {
                    var questionHtml = ejs.render(questionTemplate, context);
                } catch (e) {
                    return callback(new Error('Error rendering "' + questionTemplatePath + '": ' + String(e)));
                }
                callback(null, questionHtml);
            });
        });
    },

    renderSubmission: function(questionInstance, question, submission, grading, course, locals, callback) {
        filePaths.questionFilePathNEW("submission.html", question.directory, course.path, function(err, questionTemplatePath) {
            if (err) return callback(err);
            fs.readFile(questionTemplatePath, 'utf8', function(err, questionTemplate) {
                if (err) return callback(err);
                questionTemplate = questionTemplate.replace(/<% *print\(([^}]+?)\) *%>/g, '<%= $1 %>');
                questionTemplate = questionTemplate.replace(/{{([^}]+)}}/g, '<%= $1 %>');
                var context = {
                    params: questionInstance.params,
                    submittedAnswer: submission.submitted_answer,
                    score: grading.score,
                    feedback: grading.feedback,
                    questionFile: function(filename) {return questionHelper.questionFileUrl(filename, locals);},
                };
                try {
                    var questionHtml = ejs.render(questionTemplate, context);
                } catch (e) {
                    return callback(new Error('Error rendering "' + questionTemplatePath + '": ' + String(e)));
                }
                callback(null, questionHtml);
            });
        });
    },

    renderTrueAnswer: function(questionInstance, question, course, locals, callback) {
        filePaths.questionFilePathNEW("answer.html", question.directory, course.path, function(err, questionTemplatePath) {
            if (err) return callback(err);
            fs.readFile(questionTemplatePath, 'utf8', function(err, questionTemplate) {
                if (err) return callback(err);
                questionTemplate = questionTemplate.replace(/<% *print\(([^}]+?)\) *%>/g, '<%= $1 %>');
                questionTemplate = questionTemplate.replace(/{{([^}]+)}}/g, '<%= $1 %>');
                var context = {
                    params: questionInstance.params,
                    trueAnswer: questionInstance.true_answer,
                    questionFile: function(filename) {return questionHelper.questionFileUrl(filename, locals);},
                };
                try {
                    var questionHtml = ejs.render(questionTemplate, context);
                } catch (e) {
                    return callback(new Error('Error rendering "' + questionTemplatePath + '": ' + String(e)));
                }
                callback(null, questionHtml);
            });
        });
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
