var ERR = require('async-stacktrace');
var _ = require('lodash');

var assessmentModules = {
    'Homework': require('./homework'),
    'Exam': require('./exam'),
};

module.exports = {
    getModule: function(type, callback) {
        if (_(assessmentModules).has(type)) {
            callback(null, assessmentModules[type]);
        } else {
            callback(new Error('Unknown assessment type: ' + type));
        }
    },

    updateGradingLog: function(assessment_type, grading_log, callback) {
        this.getModule(assessment_type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.updateGradingLog(grading_log, function(err, updated_grading_log) {
                if (ERR(err, callback)) return;
                callback(null, updated_grading_log);
            });
        });
    },

    updateAssessmentInstanceScore: function(assessment_type, assessment_instance_id, auth_user_id, credit, callback) {
        this.getModule(assessment_type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.updateAssessmentInstanceScore(assessment_instance_id, auth_user_id, credit, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    gradeAssessmentInstance: function(assessment_type, assessment_instance_id, auth_user_id, credit, finish, callback) {
        this.getModule(assessment_type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.gradeAssessmentInstance(assessment_instance_id, auth_user_id, credit, finish, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
