var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var logger = require('./logger');
var filePaths = require('./file-paths');

var assessmentModules = {
    'homework': require('./assessments/homework'),
};

module.exports = {
    getModule: function(type, callback) {
        if (_(assessmentModules).has(type)) {
            callback(null, assessmentModules[type]);
        } else {
            callback(new Error('Unknown type: ' + type));
        }
    },

     makeQuestionInstances: function(test, course, callback) {
        this.getModule(test.type, function(err, assessmentModule) {
            if (err) return callback(err);
            assessmentModule.makeQuestionInstances(test, course, callback);
        });
     },

    renderTestInstance: function(testInstance, test, course, callback) {
        this.getModule(test.type, function(err, assessmentModule) {
            if (err) return callback(err);
            assessmentModule.renderTestInstance(test, course, callback);
        });
    },
};
