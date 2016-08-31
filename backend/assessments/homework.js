var ERR = require('async-stacktrace');
var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');

var error = require('../error');
var logger = require('../logger');
var filePaths = require('../file-paths');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'homework.sql'));

module.exports = {
    newAssessmentInstance: function(assessmentInstance, assessment, course, callback) {
        callback(null);
    },
    
    updateAssessmentInstance: function(assessmentInstance, assessment, course, locals, callback) {
        var params = {
            assessment_instance_id: assessmentInstance.id,
            assessment_id: assessment.id,
        };
        sqldb.query(sql.update, params, function(err, result) {
            if (ERR(err, callback)) return;
            callback(null, result);
        });
    },
    
    renderAssessmentInstance: function(assessmentInstance, locals, callback) {
        var extraHeader = null;
        var params = {
            assessment_instance_id: assessmentInstance.id,
        };
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, callback)) return;
            var loc = _.extend({
                instanceQuestions: result.rows,
            }, locals);
            ejs.renderFile(path.join(__dirname, 'homeworkAssessmentInstance.ejs'), loc, function(err, html) {
                if (ERR(err, callback)) return;
                callback(null, extraHeader, html);
            });
        });
    },
};
