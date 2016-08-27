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

    newAssessmentInstance: function(assessmentInstance, assessment, course, callback) {
        this.getModule(assessment.type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.newAssessmentInstance(assessmentInstance, assessment, course, callback);
        });
     },

    updateAssessmentInstance: function(assessmentInstance, assessment, course, locals, callback) {
        this.getModule(assessment.type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.updateAssessmentInstance(assessmentInstance, assessment, course, locals, callback);
        });
     },

    renderAssessmentInstance: function(assessmentInstance, locals, callback) {
        this.getModule(locals.assessment.type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.renderAssessmentInstance(assessmentInstance, locals, callback);
        });
    },
};
