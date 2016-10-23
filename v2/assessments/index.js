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

    scoreAssessmentInstance: function(assessment_type, assessment_instance_id, auth_user_id, callback) {
        this.getModule(assessment_type, function(err, assessmentModule) {
            if (ERR(err, callback)) return;
            assessmentModule.scoreAssessmentInstance(assessment_instance_id, auth_user_id, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
