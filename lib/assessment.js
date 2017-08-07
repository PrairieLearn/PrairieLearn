var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var ejs = require('ejs');

var error = require('../lib/error');
var logger = require('../lib/logger');
var externalGradingSocket = require('../lib/external-grading-socket');

module.exports = {
    renderText: function(assessment, urlPrefix, callback) {
        if (!assessment.text) return callback(null, null);
        var context = {
            clientFilesCourse: urlPrefix + '/clientFilesCourse',
            clientFilesCourseInstance: urlPrefix + '/clientFilesCourseInstance',
            clientFilesAssessment: urlPrefix + '/assessment/' + assessment.id + '/clientFilesAssessment',
        };
        var assessment_text_templated;
        try {
            assessment_text_templated = ejs.render(assessment.text, context);
        } catch (e) {
            return ERR(e, callback);
        }
        callback(null, assessment_text_templated);
    },
};

module.exports.processGradingResult = function(content) {
    async.series([
        function(callback) {
            if (!_(content.grading).isObject()) {
                return callback(error.makeWithData('invalid grading', {content: content}));
            }
            if (!_(content.grading.score).isNumber()) {
                return callback(error.makeWithData('invalid grading.score', {content: content}));
            }
            if (content.grading.score < 0 || content.grading.score > 1) {
                return callback(error.makeWithData('grading.score out of range', {content: content}));
            }
            if (_(content.grading).has('feedback') && !_(content.grading.feedback).isObject()) {
                return callback(error.makeWithData('invalid grading.feedback', {content: content}));
            }
            const params = [
                content.gradingId,
                content.grading.score,
                content.grading.feedback,
                content.grading.startTime,
                content.grading.endTime,
            ];
            sqldb.call('grading_jobs_process_external', params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, function() {})) {
            // FIXME: call sprocs/errors_insert here
            logger.error('processGradingResult: error',
                         {message: err.message, stack: err.stack, data: JSON.stringify(err.data)});
        }
        externalGradingSocket.gradingLogStatusUpdated(content.gradingId);
    });
};
