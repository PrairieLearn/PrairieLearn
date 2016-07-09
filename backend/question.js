var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var logger = require('../logger');
var filePaths = require('../file-paths');

var questionModules = {
    'Calculation': require('./questions/calculation'),
};

module.exports = {
    get: function(type, callback) {
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
        this.get(question.type, function(err, questionModule) {
            if (err) return callback(err);
            questionModule.getData(question, course, vid, function(err, questionData) {
                if (err) return callback(err);
                var questionInstance = {
                    vid: vid,
                    params: questionData.params || {},
                    trueAnswer: questionData.trueAnswer || {},
                    options: questionData.options || {},
                };
                callback(null, questionInstance);
            });
        });
    },
};
