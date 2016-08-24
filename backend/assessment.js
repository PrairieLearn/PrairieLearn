var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var logger = require('./logger');
var filePaths = require('./file-paths');

var assessmentModules = {
    'Homework': require('./assessments/homework'),
};

module.exports = {
    getModule: function(type, callback) {
        var useType = type;
        if (useType == 'Game') useType = 'Homework';
        if (_(assessmentModules).has(useType)) {
            callback(null, assessmentModules[useType]);
        } else {
            callback(new Error('Unknown type: ' + type));
        }
    },

    newTestInstance: function(testInstance, test, course, callback) {
        this.getModule(test.type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.newTestInstance(testInstance, test, course, callback);
        });
     },

    updateTestInstance: function(testInstance, test, course, locals, callback) {
        this.getModule(test.type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.updateTestInstance(testInstance, test, course, locals, callback);
        });
     },

    renderTestInstance: function(testInstance, locals, callback) {
        this.getModule(locals.test.type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.renderTestInstance(testInstance, locals, callback);
        });
    },
};
