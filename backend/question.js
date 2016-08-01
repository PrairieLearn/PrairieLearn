var ERR = require('async-stacktrace');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var logger = require('./logger');
var filePaths = require('./file-paths');

var questionModules = {
    'ShortAnswer': require('./questions/shortAnswer'),
    'Calculation': require('./questions/calculation'),
};

module.exports = {
    getModule: function(type, callback) {
        if (_(questionModules).has(type)) {
            callback(null, questionModules[type]);
        } else {
            callback(new Error('Unknown question type: ' + type));
        }
    },

    makeQuestionInstance: function(question, course, options, callback) {
        var vid;
        if (_(options).has('vid')) {
            vid = options.vid;
        } else {
            vid = Math.floor(Math.random() * Math.pow(2, 32)).toString(36);
        }
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.getData(question, course, vid, function(err, questionData) {
                if (ERR(err, callback)) return;
                var questionInstance = {
                    vid: vid,
                    params: questionData.params || {},
                    true_answer: questionData.true_answer || {},
                    options: questionData.options || {},
                };
                callback(null, questionInstance);
            });
        });
    },

    gradeSubmission: function(submission, questionInstance, question, course, options, callback) {
        this.getModule(question.type, function(err, questionModule) {
            if (ERR(err, callback)) return;
            questionModule.gradeSubmission(submission, questionInstance, question, course, function(err, grading) {
                if (ERR(err, callback)) return;
                grading.correct = (grading.score >= 0.5);
                callback(null, grading);
            });
        });
    },

    renderScore: function(score, callback) {
        var color, text;
        if (score >= 0.8) {
            color = "success";
            text = "Correct!";
        } else if (score >= 0.5) {
            color = "warning";
            text = "Correct!";
        } else {
            color = "danger";
            text = "Incorrect.";
        }
        var perc = (score * 100).toFixed(0) + '%';
        var html = '<span class="label label-' + color + '">' + perc + '</span> ' + text;
        callback(null, html);
    },
};
